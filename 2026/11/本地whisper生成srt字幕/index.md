# whisper 字幕生成：Linux 上用 whisper.cpp 把音视频转成可编辑 SRT


要把录像或音频转成可编辑的 SRT，又不想把素材传到付费云端语音 API，可以在 Linux 服务器上本地跑 Whisper。本文只做这一段：**识别并生成 SRT**。把字幕烧进画面、对多路音轨做选流和时长对齐，见已经上线的 [FFmpeg 合成字幕与音轨](https://www.mmfei.com/2026/11/ffmpeg合成字幕与音轨/)。生成后如果整份字幕整体提前或延后，可以用站内工具 [SRT 字幕时间偏移](https://www.mmfei.com/tools/srt-offset/) 按整数毫秒平移，不必重跑识别。

网上也能搜到“Whisper 在线字幕生成”。那是把音视频交给别人的服务，和本文不是同一条路。这里用的是可以离线运行的模型文件，不调用 OpenAI 云端 Whisper API，也不走任何付费接口。

## 结论速查

| 问题 | 这次怎么做 |
| --- | --- |
| 用哪个实现 | [ggml-org/whisper.cpp](https://github.com/ggml-org/whisper.cpp) v1.9.6，社区维护的 C/C++ 移植，不是官方 Python 包 `openai-whisper`，也不是云 API |
| 模型和许可 | OpenAI 官方多语种 `base` 权重（约 74M 参数），经社区转成 ggml；代码和权重按官方说明均为 MIT |
| 要不要 GPU | 不要。本次按默认 CMake 只编了 CPU 后端，推理时日志为 `no GPU found` |
| 用哪个模型文件 | `ggml-base.bin`（约 142 MiB）。中文不要用 `tiny.en` / `base.en`，那些是英文专用 |
| 怎么从视频抽音轨 | `ffmpeg` 转成 16 kHz、单声道、16-bit PCM WAV（whisper.cpp 文档要求） |
| 怎么得到 SRT | `whisper-cli -l zh -osrt -of 前缀`，会写出 `前缀.srt` |
| 效果如何 | 命令链路已跑通，SRT 格式合法；中文测试音是 TTS，识别文本不准。真实人声、口音、术语和多人对话未评测，不能拿来和剪映比精度 |

## 环境和选型

测试机是 Debian 13、内核 6.12、8 个 CPU、约 16 GB 内存、没有可用 GPU。软件版本：FFmpeg 7.1.5-0+deb13u1、CMake 3.31.6、g++ 14.2.0、Python 3.13.5。whisper.cpp 选用发布标签 **v1.9.6**（提交 `96ec4d9823e9d0211944172da35f9f29134af990`）。

为什么选 whisper.cpp：官方仓库写明支持 CPU-only 推理，模型可以只下很小的档位，适合在没有 GPU 的服务器上把命令跑通。本文只实测这一条安装路径，没有并行铺 OpenAI 官方 Python 包或 faster-whisper 的安装步骤。

许可以 2026-11-25 读到的官方说明为准：

- OpenAI Whisper 的[代码和模型权重为 MIT](https://github.com/openai/whisper)（Copyright 2022 OpenAI），模型说明见[官方模型卡](https://github.com/openai/whisper/blob/main/model-card.md)。
- whisper.cpp 本身也是 [MIT](https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE)（Copyright 2023-2026 The ggml authors）。
- 这次下载的 ggml 文件来自 Hugging Face 上的预转换仓库 [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp)，对应官方多语种 `base`，不是自己从 PyTorch 权重转换的。

[whisper.cpp 的模型说明](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)里，多语种 `base` 磁盘约 142 MiB，运行内存约 388 MB；更小的 `tiny` 约 75 MiB / 273 MB。这次为了中文场景选 `base`，没有下载 `small` 及以上，也没有下载 `large`。

> 下面用来演示的中文音频，是用本机 `espeak-ng` 1.52.0（音色 `cmn`）合成的短句，再封装进一段测试视频。**这是为了验证命令链路，不是识别准确率评测，真实人声/口音效果未在本环境评测。**

## 1. 安装依赖并编译 whisper.cpp

Debian / Ubuntu 需要 C++ 编译器和 CMake。本次新装了 `build-essential` 和 `cmake`：

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends build-essential cmake
```

在工作目录浅克隆指定版本后编译。官方 Quick start 就是 `cmake -B build` 再 `cmake --build build -j --config Release`：

```bash
git clone --depth 1 --branch v1.9.6 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release
```

本次克隆约 6 秒。CMake 日志写的是 `Including CPU backend`，并加上 `-march=native`，也就是按**这台机器的 CPU** 优化，没有打开 CUDA 或其他 GPU 后端。配置加编译一共 45.6 秒，得到 `build/bin/whisper-cli`（约 951 KiB）。它会依赖同目录里的 `libwhisper.so`、`libggml.so` 等动态库，二进制的 RUNPATH 指向 `build/bin`。建议在编译树上直接调用，不要只拷走一个可执行文件。

换一台更老的 CPU 时，不要直接复制这次的二进制，请在目标机器上重新编译。

## 2. 下载 base 模型并校验

官方脚本会从 Hugging Face 拉取已经转成 ggml 的文件。第二个参数是保存目录，避免模型堆在源码树里：

```bash
mkdir -p "$HOME/whisper-models"
sh ./models/download-ggml-model.sh base "$HOME/whisper-models"
```

实际请求的是：

`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`

本次文件大小 142 MiB，下载耗时 10.7 秒，curl 平均约 13.2 MB/s。**这只是本机结果。测试机不一定在中国大陆，不能外推国内网速，也不表示换一台国内服务器也能同样快。**

官方下载脚本本身**不会校验哈希**。模型表给出的是 SHA1。下完后请自己对一下，和 [models/README.md](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md) 中 `base` 那一行一致再使用：

```bash
sha1sum "$HOME/whisper-models/ggml-base.bin"
```

本次结果：

```text
465707469ff3a37a2b9b8d8f89f2f99de7299dac  ggml-base.bin
```

与官方表中的 `465707469ff3a37a2b9b8d8f89f2f99de7299dac` 一致。本机再算的 SHA256 为 `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe`（官方表未提供 SHA256，仅作本机记录）。

若下载中断或哈希不一致，删掉不完整文件后重跑脚本。不要改用来路不明的网盘模型。

## 3. 用 FFmpeg 从视频抽出音轨

whisper.cpp 的 README 写明，`whisper-cli` 目前按 16-bit WAV 来跑，并给出了用 FFmpeg 转换的例子。视频要先抽出音轨，再重采样：

```bash
ffmpeg -i sample-talk.mp4 -ar 16000 -ac 1 -c:a pcm_s16le extracted-16k-mono.wav
```

本次源视频是 13.22 秒、640×360、H.264 + AAC 单声道的测试 MP4（画面为 `testsrc2`，音轨来自上一节说明过的 TTS）。FFmpeg 7.1.5 的实际输出要点：

```text
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'sample-talk.mp4':
  Duration: 00:00:13.22, start: 0.000000, bitrate: 531 kb/s
  Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 640x360, 25 fps
  Stream #0:1: Audio: aac (LC) (mp4a / 0x6134706D), 22050 Hz, mono, 103 kb/s
Stream mapping:
  Stream #0:1 -> #0:0 (aac (native) -> pcm_s16le (native))
Output #0, wav, to 'extracted-16k-mono.wav':
  Stream #0:0: Audio: pcm_s16le, 16000 Hz, mono, s16, 256 kb/s
size=     414KiB time=00:00:13.23 bitrate= 256.0kbits/s
```

`ffprobe` 确认：`pcm_s16le`、16000 Hz、1 channel、时长 13.24 秒。如果输入已经是音频，同样转成这个格式即可，不必先封装成视频。

## 4. 生成 SRT 并核对格式

`whisper-cli -h` 里，和字幕直接相关的参数是：

- `-m` / `--model`：模型路径
- `-f`：输入 WAV
- `-l` / `--language`：源语言，默认是 `en`；中文应写成 `zh`，也可以写 `auto`
- `-osrt` / `--output-srt`：写出 SRT
- `-of` / `--output-file`：输出路径前缀（不含扩展名）
- `-t` / `--threads`：线程数，默认 4

中文录像明确指定语言，避免落到默认英文。本次机器有 8 个逻辑 CPU，线程数设为 8：

```bash
./build/bin/whisper-cli \
  -m "$HOME/whisper-models/ggml-base.bin" \
  -f extracted-16k-mono.wav \
  -l zh \
  -t 8 \
  -osrt \
  -of whisper-base-zh
```

启动日志里会出现 `use gpu = 1`，但紧接着是 `device 0: CPU` 和 `no GPU found`。这是默认“先找 GPU、找不到就用 CPU”，不是这次链到了显卡库。`ldd` 只看到 `libggml-cpu.so`，没有 CUDA。

处理 13.2 秒音频时，关键输出如下（文本按日志原样，不改正）：

```text
system_info: n_threads = 8 / 8 | ... CPU : SSE3 = 1 | AVX2 = 1 | AVX512 = 1 | AMX_INT8 = 1 | OPENMP = 1 ...
main: processing 'extracted-16k-mono.wav' (211766 samples, 13.2 sec), 8 threads, ..., lang = zh, task = transcribe, timestamps = 1 ...

[00:00:00.000 --> 00:00:06.000]  今天我们要威胁这番故事纯纯字幕,
[00:00:06.000 --> 00:00:13.000]  这误明临连路连纯,不误误别准曙语评测。
output_srt: saving output to 'whisper-base-zh.srt'

whisper_print_timings:     load time =   169.62 ms
whisper_print_timings:     fallbacks =   3 p /   5 h
whisper_print_timings:    total time =  9587.41 ms
```

墙钟时间 9.633 秒。这是本机、这段 13 秒音频、`base` + 8 线程的结果。这台 CPU 带 AVX-512 和 AMX，**不能当成普通云主机的速度**。

写出的 SRT 使用逗号毫秒（标准 SRT，和终端里用的点号不同）：

```text
1
00:00:00,000 --> 00:00:06,000
今天我们要威胁这番故事纯纯字幕,

2
00:00:06,000 --> 00:00:13,000
这误明临连路连纯,不误误别准曙语评测。
```

核验：UTF-8、LF 换行、两条字幕；序号连续；时间码为 `HH:MM:SS,mmm --> HH:MM:SS,mmm`；每条开始早于结束；序号、时间轴、正文之间空行分隔。格式合法，可以拿去编辑或做时间偏移。

对照 TTS 原稿：

```text
今天我们用 Whisper 给这段录像生成字幕。
这是命令链路验证，不是识别准确率评测。
```

可以看出：命令跑通了，但 **base 模型在这段合成语音上的识别文本是错的**，不能当成准确率成绩。同一条命令对 whisper.cpp 仓库自带的英文样例 `samples/jfk.wav`（11.0 秒、16 kHz 单声道 WAV，真实人声）把经典句子转写对了，总耗时 736 ms，SRT 同样格式合法。这只说明工具在真实英文样例上能工作，**仍然不是中文准确率评测**。

## 5. 中文场景的限制

结合官方模型卡和这次实测，使用时请记住：

- **小模型会明显说错。** 官方模型卡写明：不同语言、口音上的表现不均匀；因为弱监督训练，还可能把没说过的词“补”出来（hallucination）。本次中文 TTS 就出现了错字和改写，日志里还有 `fallbacks = 3 p / 5 h`。`tiny` 只会更小，本文没有下载，也没有拿它评中文。
- **不要和剪映或商用字幕比精度。** 搜索里常见“whisper和剪映字幕”。这次没有对真人声、专业术语、方言、噪声或多人对话做评测，也没有和剪映对比，不能保证接近剪映或达到商用标准。
- **语言要用 `-l zh`。** 默认是 `en`。同一段中文 TTS 改用 `-l auto` 时，日志为 `auto-detected language: en (p = 0.457530)`，整段被当成英文，输出完全不可用。自动检测在短音频、合成音或中英夹杂时不一定可靠，已知是中文就写死 `zh`。
- **时间轴仍可能要手工改。** 本次两条字幕按整秒切开，和语句边界大致对应，但不保证任意素材都对准口型。整份一起偏移时，用 [SRT 字幕时间偏移](https://www.mmfei.com/tools/srt-offset/)；渐进漂移（越往后越不准）那个工具处理不了，需要分段改。
- **模型卡还提醒：** 不要在未征得同意的情况下转写他人录音；不要把 Whisper 用来做说话人的主观分类或高风险决策。

若以后要提高中文效果，官方和 whisper.cpp 都提供 `small` / `medium` / `large-v3` 等更大模型，磁盘和内存也会上去。那是另一条要重新实测的路径，本文没有下载，也不在这里给未验证的精度承诺。

## 6. 若只是想看字幕是不是已经能烧进画面

识别不是烧录。确认 SRT 合法之后，最小的烧录命令可以是：

```bash
ffmpeg -i sample-talk.mp4 \
  -vf "subtitles=whisper-base-zh.srt:force_style='FontName=Noto Sans CJK SC,FontSize=20'" \
  -c:a copy \
  sample-talk-burned.mp4
```

本次 FFmpeg 7.1.5 带 libass，`fontconfig` 选到了 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` 里的 `NotoSansCJKsc-Regular`，命令成功出片。中文字体缺失、时长对不齐、多音轨选流等问题，请看 [FFmpeg 合成字幕与音轨](https://www.mmfei.com/2026/11/ffmpeg合成字幕与音轨/)，本文不再重复烧录全过程。

## 常见问题

**只能处理 WAV 吗？**  
本次只把 `whisper-cli` 用在 16-bit、16 kHz、单声道 WAV 上，这是官方 README 写明的路径。其他封装先用 FFmpeg 转，再送进 `whisper-cli`。

**下载失败怎么办？**  
确认能访问 Hugging Face，或按你已有的合规网络条件重试官方脚本。失败后检查文件大小和 SHA1，不对就删掉重下。不要把“国内一定很慢”或“换某个镜像”写成通解：本次没有在中国大陆实测。

**CPU 要跑多久？**  
只记录本机数字：13.2 秒中文测试音约 9.6 秒，11 秒英文样例约 0.74 秒。换机器、换模型、换音频长度都会变，不要直接抄去估生产工期。

**和 OpenAI 官方 `pip install openai-whisper` 有什么差别？**  
官方 Python 包是 OpenAI 的参考实现，通常还要 PyTorch。whisper.cpp 是社区用 C/C++ 做的推理移植，读的是转换后的 ggml 文件，默认就可以只靠 CPU。权重同源，安装方式和运行时不同。本文没有安装官方 Python 包。

## 安全注意

- 模型只从官方文档给出的 Hugging Face 地址下载，并核对 SHA1。
- 本地跑可以避免把未公开素材传到付费云 API，但服务器本身的访问权限仍要管好；模型文件大约 142 MiB，不要提交进业务 Git 仓库。
- 不要在未授权的情况下转写他人的录音。
- 识别结果必须人工校对后再用于对外字幕，尤其是 `tiny` / `base` 和中文内容。

## 回滚

这次没有安装系统服务，也没有改全局配置。不需要再保留时：

```bash
# 删除源码、编译产物和模型（按你实际放的目录改）
rm -rf whisper.cpp "$HOME/whisper-models" extracted-16k-mono.wav whisper-base-zh.srt
```

本文为编译和测试安装的 `build-essential`、`cmake`，以及用于合成测试音的 `espeak-ng`，如需卸掉再按自己的环境用 `apt-get remove` 处理。卸载前确认没有其他程序依赖它们。

## 实测环境与来源

- 时间：2026-11-25 09:23–09:32，Asia/Bangkok（UTC+7）。
- 机器：Debian 13（trixie），内核 6.12.113，x86_64，8 CPU，约 16 GB RAM，无 GPU；FFmpeg 7.1.5-0+deb13u1；CMake 3.31.6；g++ 14.2.0；espeak-ng 1.52.0。
- 已做：浅克隆并编译 whisper.cpp v1.9.6；下载多语种 `base` 并核对官方 SHA1；用 FFmpeg 从测试 MP4 抽出 16 kHz 单声道 WAV；`-l zh` 生成并核验 SRT；`-l auto` 在同一段 TTS 上误判为英文；仓库自带 `jfk.wav` 英文转写；一条最小 `subtitles` 烧录命令。
- 未做：未下载 `tiny` / `small` / `medium` / `large`；未安装或评测官方 `openai-whisper`、faster-whisper；未调用任何付费或云端 Whisper API；未用真实人声、方言、术语、噪声或多人对话评测中文准确率；未与剪映对比；未在中国大陆网络环境下测下载速度；未编译 CUDA / Vulkan / OpenBLAS。
- 官方文档读取日期：2026-11-25。[whisper.cpp README](https://github.com/ggml-org/whisper.cpp)、[whisper.cpp 模型说明](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)、[OpenAI Whisper README 与许可](https://github.com/openai/whisper)、[Whisper 模型卡](https://github.com/openai/whisper/blob/main/model-card.md)。搜索需求来自 2026-11-25 百度联想，搜索量待验证，Search Console 未接入，不保证排名。

