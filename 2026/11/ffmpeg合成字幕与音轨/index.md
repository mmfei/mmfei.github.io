# FFmpeg 合成字幕与音轨：显式选流、中文字体和时长对齐


一条短视频有6秒画面、4秒配音和两段字幕，合成时应该提前结束，还是保留画面并把尾部补静音？输入文件里有多个音轨时，究竟选到了哪一条？这些问题比“执行一条FFmpeg命令”更值得先定义。

本文以短剧片段后期为例，技术主线是显式选流、中文字幕烧录、时长策略和结果核验。素材全部由本地测试源生成，**不下载影视片段、不接TTS、不调用任何付费模型**。

## 环境和验证范围

本次成功路径实际运行于 Linux、FFmpeg 7.1.5-0+deb13u1、libx264、AAC、libass，以及已经能够匹配到 `Noto Sans CJK SC` 的系统字体。Python 3.13.5 只用于结果断言，不参与视频编码。下面记录的 11 项通过结果，只对应这次环境和这次运行，不代表其他机器也已经通过。

本例依赖 fontconfig，以及能够提供字体族 `Noto Sans CJK SC` 的中文字体。在 Debian/Ubuntu 上可以安装：

```bash
sudo apt-get update && sudo apt-get install fontconfig fonts-noto-cjk
```

这是文档里的安装示例，用来说明依赖；请在自己的机器上按需执行，本文没有把它当成已经在每台机器装好的前提。其他系统请按本机字体包和 fontconfig 的能力检查，不要假定包名相同。

`fc-match` 在找不到完全匹配时，仍可能打印某个回退字体。因此，**只要命令有返回值，并不等于目标字体已经存在**。请用下面的方式核对该字体族，结果必须精确为 `Noto Sans CJK SC`，不能接受普通 Noto、Droid 或空结果：

```bash
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -h filter=subtitles
ffmpeg -hide_banner -h encoder=libx264
fc-match -f '%{family}\n' 'Noto Sans CJK SC:lang=zh-cn'
```

在另一台使用 FFmpeg 6.1.1、Python 3.12.3 的环境中，系统没有 `Noto Sans CJK SC` 时，`fc-match 'Noto Sans CJK SC'` 仍然返回了普通 Noto Sans。随后编码日志出现 `Glyph 0x7B2C not found`，并回退到 Droid 字体，验证脚本因此失败。命令退出码为 0，或单帧看起来可读，都不能代替字体断言。本文**没有**在那台缺字环境上宣称按修订后的脚本已经跑通。

`subtitles` 依赖带 libass 的 FFmpeg 构建；不同安装包的编码器、滤镜和字体可能不同。本例跑通不代表 Windows 路径转义、移动浏览器播放或云端转码也已经验证。`run-demo.sh` 会在生成测试素材之前检查 `ffmpeg`、`ffprobe` 和 `fc-match`，并确认字体族精确匹配；不满足时会向标准错误输出原因，并以非零状态退出。

## 1. 先定输出契约

本例明确选择：保留6秒画面，使用第二个输入的配音，短缺的2秒补静音，字幕直接烧进画面。输出为H.264视频、AAC音频、yuv420p像素格式的MP4。

- `-map 0{?:}v{?:}0`选第一个输入的第一路视频。
- `-map 1{?:}a{?:}0`选第二个输入的第一路音频，而不是依赖自动选流。
- `apad`补静音，`atrim=duration=6`将音频控制在6秒，`asetpts=PTS-STARTPTS`重置该音轨时间戳。
- `-t 6`限制输出时长。这里的6来自我们已知的测试素材，不是对任意业务素材都写死6秒。

`-shortest`不是自动对齐：单独使用时可能让6秒画面随4秒配音提前结束。若选择“以最短流为准”，就应明确告诉业务方这是有意裁掉尾部，而不是时长对齐成功。

## 2. 完整可复现实验

将下列内容保存为 `run-demo.sh`。脚本每次新建临时目录，打印该目录路径；没有覆盖开关，也不删除已有素材。文件名固定且简单，避免把路径转义问题混进第一次实验。若前置检查失败，它不会创建这段测试视频和测试音。

```text
#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '错误：找不到命令 %s。请先安装后再运行本脚本。\n' "$1" >&2
    exit 1
  fi
}

require_cmd ffmpeg
require_cmd ffprobe
require_cmd fc-match

target_family='Noto Sans CJK SC'
family_raw="$(fc-match -f '%{family}\n' "${target_family}:lang=zh-cn" || true)"
family="$(printf '%s\n' "$family_raw" | head -n 1 | cut -d, -f1)"
family="${family#"${family%%[![:space:]]*}"}"
family="${family%"${family##*[![:space:]]}"}"

if [[ -z "$family" || "$family" != "$target_family" ]]; then
  printf '错误：未匹配到目标字体 Noto Sans CJK SC。\n' >&2
  printf '错误：fc-match 返回：%s\n' "${family_raw:-（空）}" >&2
  printf '错误：fc-match 有返回值不等于目标字体已经存在，不能接受普通 Noto、Droid 或空结果。\n' >&2
  printf '错误：Debian/Ubuntu 可先安装：sudo apt-get update && sudo apt-get install fontconfig fonts-noto-cjk\n' >&2
  printf '错误：其他系统请按本机字体包和 fontconfig 的能力检查后再运行。\n' >&2
  exit 1
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/ffmpeg-subtitle-demo.XXXXXX")
printf '%s\n' "$work"
cd "$work"
printf '%s\n' "$family" > font-family.txt
{
  printf 'confirmed_family=%s\n' "$family"
  printf 'fc-match_query=Noto Sans CJK SC:lang=zh-cn\n'
  fc-match "${target_family}:lang=zh-cn" || true
  ffmpeg -version
  ffprobe -version
} > versions.txt
ffmpeg -hide_banner -nostdin -f lavfi -i "testsrc2=size=320x568:rate=25:duration=6" \
  -an -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p video.mp4 2>source-video.log
ffmpeg -hide_banner -nostdin -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=4" \
  -c:a pcm_s16le voice.wav 2>source-audio.log
cat > captions.srt <<'SRT'
1
00:00:00,500 --> 00:00:02,500
第一幕：测试字幕

2
00:00:03,000 --> 00:00:05,500
仅使用合成素材
SRT
ffmpeg -hide_banner -nostdin -i video.mp4 -i voice.wav \
  -map 0{?:}v{?:}0 -map 1{?:}a{?:}0 \
  -vf "subtitles=filename=captions.srt:force_style='FontName=Noto Sans CJK SC,FontSize=20,MarginV=24,Outline=1'" \
  -af "apad,atrim=duration=6,asetpts=PTS-STARTPTS" -t 6 \
  -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ar 48000 -movflags +faststart output.mp4 2>encode.log
ffprobe -v error -show_entries stream=index,codec_type,codec_name,pix_fmt,sample_rate,duration:format=duration \
  -of json output.mp4 > probe.json
ffmpeg -hide_banner -nostdin -v error -i output.mp4 -f null - 2>decode-errors.log
ffmpeg -hide_banner -nostdin -v error -ss 1 -i output.mp4 -frames:v 1 subtitle-frame.png
```

执行并保存它打印的工作目录：

```bash
bash run-demo.sh > sandbox-path.txt
work=$(<sandbox-path.txt)
printf '实验目录：%s\n' "$work"
```

工作目录里会生成6秒竖屏测试画面 `video.mp4`、4秒440Hz测试音 `voice.wav`、UTF-8字幕 `captions.srt`、合成结果 `output.mp4`、探测结果与编码日志，以及记录已确认字体族的 `font-family.txt`。

440Hz测试音**不是人的配音**，它只是可控的音频输入。本文验证的是合成流程，不是配音质量、声纹或口型同步。

## 3. 字幕为什么需要核对字体

`subtitles`通过libass把字幕绘制到视频帧，`force_style`覆盖字体、字号、描边和底部留白。本例选`Noto Sans CJK SC`，用的是字体族名称，不是随便编的文件路径。

不要仅凭命令退出码判断中文字幕正常：字体回退可能成功执行，却出现缺字。应检查编码日志中的字体选择记录和缺字提示，再抽取字幕出现期间的帧核读。即便画面上暂时能读到几个字，只要日志里出现缺字或实际选中的不是目标字体，就不能把这次烧录写成中文字体已经合格。验证脚本会检查日志里是否出现 `NotoSansCJK`，以及是否包含缺字信息；不能因为回退字体“看起来可读”就删掉这些断言。

本次在 FFmpeg 7.1.5 环境的 1 秒处抽帧，已确认“第一幕：测试字幕”可读；这只是单帧核验，**没有声称逐帧看过成片或用播放器完整验收**。前面提到的 FFmpeg 6.1.1 环境里，同一句字幕也可能经由 Droid 回退字体画出来，但验证脚本会失败，那次结果不能算通过。

烧录后字幕属于图像的一部分，本例输出没有独立字幕轨，观众不能切换关闭。需要多语言切换时，应评估外置WebVTT或播放器字幕轨，而不是把所有语言永久烧进同一画面。

路径包含冒号、反斜杠、引号时，会同时涉及Shell和FFmpeg滤镜解析。生产代码应由服务端生成受控工作目录和安全文件名，限制输入，不能将用户路径直接拼到Shell命令中；仅把Shell调用改成参数数组，也不自动解决滤镜表达式内部的转义。

## 4. 不止看输出文件存在

把下面保存为同目录下的 `verify.py`。它读取实验目录中的ffprobe JSON，检查音视频编码、像素格式、时长、解码错误、字体选择以及前段声音和尾部静音。

```python
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
probe = json.loads((root / "probe.json").read_text())
video = [s for s in probe["streams"] if s["codec_type"] == "video"]
audio = [s for s in probe["streams"] if s["codec_type"] == "audio"]
checks = []
def check(name, ok):
    assert ok, name
    checks.append(name)
check("one H264 video", len(video) == 1 and video[0]["codec_name"] == "h264")
check("yuv420p video", video[0]["pix_fmt"] == "yuv420p")
check("one AAC audio", len(audio) == 1 and audio[0]["codec_name"] == "aac")
check("48kHz audio", audio[0]["sample_rate"] == "48000")
check("six-second container within 0.1s", abs(float(probe["format"]["duration"]) - 6) < 0.1)
check("streams within 0.1s", all(abs(float(s["duration"]) - 6) < 0.1 for s in (video[0], audio[0])))
check("no decode errors", (root / "decode-errors.log").stat().st_size == 0)
log = (root / "encode.log").read_text()
check("libass selected CJK font", "NotoSansCJK" in log)
check("no missing glyph messages", "Glyph" not in log and "glyph" not in log)

def rms(start):
    data = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-ss", str(start),
        "-i", str(root / "output.mp4"), "-t", "0.8", "-vn", "-ac", "1", "-ar", "48000",
        "-f", "f32le", "pipe:1"])
    values = struct.unpack("<" + "f" * (len(data) // 4), data)
    assert values
    return math.sqrt(sum(x*x for x in values) / len(values))
head = rms(0.5)
tail = rms(5)
check("synthetic audio exists before end", head > 0.01)
check("padded tail is near silence", tail < 0.0001)
print(json.dumps({"sandbox": str(root), "checks": checks, "count": len(checks),
    "head_rms": head, "tail_rms": tail,
    "scope": "synthetic video/audio; decode and stream assertions; still frame separate; no player or CDN test"},
    ensure_ascii=False, indent=2))
```

运行：

```bash
python3 verify.py "$work"
```

本次在 FFmpeg 7.1.5、Python 3.13.5、且已匹配到 `Noto Sans CJK SC` 的环境中重跑，11 项断言全部通过：输出只有一路 H.264 视频和一路 AAC 音频，采样率 48kHz，yuv420p；容器和两路流的时长都在 6 秒±0.1 秒内；完整解码无错误；日志选择到了 CJK 字体且没有缺字信息；前段有测试音，尾部抽样接近静音。这是 6 秒画面、4 秒测试音再补 2 秒静音后的结果，不要和其他更短音轨的实验混用。

另一台 FFmpeg 6.1.1、Python 3.12.3、缺少目标字体的环境没有通过这些字体断言，本文也不声称那台机器在修订后已经通过。

这些检查证明本例的结构和指定片段音量符合约定，**不证明主观响度合适、全片不存在黑帧或音画绝对同步**。真实配音还要按交付规范测响度、峰值、声道和同步点。`ffprobe`通过也不能替代目标设备播放测试。

## 5. 换成真实素材时的调整

首先用`ffprobe`查看流、时长、帧率和旋转信息，再决定主时间线。不能假设所有输入都从0开始、都是恒定帧率，也不能忽略已存在的背景音。

本例会完全替换原音轨；若要保留环境音并混入旁白，应明确取两路音频，经各自重采样、音量处理后混合，不是再加一个`-map`就完成混音。多路音频映射通常得到多个独立音轨，不等于混在一起。

若配音更长，可选择延长画面、剪配音或调整节奏。`apad`只补音频，不会延长视频；不能把参数名字当成业务决策。

字幕断句、每屏字数、遮挡位置以及多种屏幕安全区也需要另外验收。本例固定320×568，是为了低成本复现，不是推荐发布分辨率，更没有测出生产转码性能。

## 6. 常见故障和上线边界

- `No such filter: subtitles`：当前构建不含所需滤镜，先核对构建能力，不要通过删除字幕步骤伪装成功。
- 中文方框或缺字：先看 `fc-match` 返回的字体族是不是精确的 `Noto Sans CJK SC`，再核对 libass 日志与 UTF-8 编码；仅看到某个 Noto 或 Droid 字体文件，或命令有输出，还不够。
- 片段少了两秒：核对`-shortest`和主时间线，确认是不是按最短流裁剪。
- 音轨错误或无声：核对输入顺序与`-map`，看ffprobe实际输出流，而不是只看扩展名。
- `-c:v copy`与字幕烧录冲突：修改像素必需解码后重编码，不能要求同时直接拷贝原视频码流。
- 上传后不能快起播：本例启用MP4 `+faststart`，但服务器Range、网络和播放器兼容仍需单独验证，不能归因于一个开关。

生产转码任务应设置执行超时、资源限制、隔离目录和输出大小限制，使用更新的解码工具处理不可信素材。素材只在允许的目录读写；本例不直接读取网络URL。

正式替换媒体前，先生成新版本并核验，再按既有流程切换引用。保留原文件直到回滚窗口结束，**不要为运行本文实验删除原始素材**。

## 官方参考

- [FFmpeg subtitles滤镜与libass选项](https://ffmpeg.org/ffmpeg-filters.html#subtitles-1)
- [FFmpeg流选择与map](https://ffmpeg.org/ffmpeg.html#Stream-selection)
- [FFmpeg音频滤镜](https://ffmpeg.org/ffmpeg-filters.html)

在线手册可能随项目版本更新；本例具体可用选项还对照了实际安装版本的`-h filter=subtitles`帮助。本文没有给出转码速度、云成本或播放器兼容率的估计。

## 同专题

这三篇可以单独阅读。说明见 [视频任务与交付：三个可独立复现的技术示例](/topics/video-processing/)。上一篇是 [Python + SQLite 实现视频任务队列：幂等、重试与租约恢复](/2026/11/python-sqlite视频任务队列/)，下一篇是 [FFmpeg HLS 切片与签名鉴权：别只保护 m3u8](/2026/11/ffmpeg-hls切片与签名鉴权/)。

