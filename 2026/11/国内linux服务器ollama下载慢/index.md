# 国内 Linux 服务器 Ollama 下载慢、镜像源失效怎么办：GitHub 代理与魔搭 GGUF 拉 DeepSeek 1.5B 实测


在服务器上跑 Ollama，最容易卡住的不是命令，而是两次大下载：**Ollama 安装包**（Linux amd64 版现在约 1.6GB）和**模型文件**（deepseek-r1:1.5b 约 1.1GB）。网上的“国内镜像源”列表很多，但不少已经打不开。

这篇把常见办法逐个试了一遍，只写今天（2026-11-24）真正跑过的结果：安装 Ollama 0.40.18、下载 DeepSeek-R1 1.5B、完成一次 `ollama run` 和一次 `curl /api/generate`。

> **先说明测试网络**：测试机**不在中国大陆**，出网经过一层代理（DNS 统一解析到 198.18.0.1）。所以文中的速度只代表这台机器，**国内下载速度和各镜像在国内的可用性都未在国内实测**。详见文末“实测环境”。

和站内文章的分工：GitHub 本身访问慢的通用办法见 [GitHub 国内加速 2026](https://www.mmfei.com/2026/11/github国内加速2026/)，阿里云国内机房的老办法见 [阿里云国内机房拉GitHub代码加速方案](https://www.mmfei.com/2022/04/阿里云国内机房拉github代码加速方案/) 和 [用穿透的方式解决国内阿里云访问GitHub不顺畅的问题](https://www.mmfei.com/2023/04/用穿透的方式解决国内阿里云访问github不顺畅的问题/)。本文只讲 Ollama 安装包和模型这两段下载。

## 结论速查

| 办法 | 本机实测结果 | 国内 |
|---|---|---|
| 官方脚本 `install.sh` | 可用，20 秒装完（需先装 zstd） | 未在国内实测 |
| 手动下载 GitHub Release 的 tar.zst | 可用，1.6GB 用时 8.2 秒，sha256 一致 | 未在国内实测 |
| GitHub 下载代理 gh-proxy.com | 可用，26.2 秒下完，sha256 一致，支持续传 | 未在国内实测 |
| ghfast.top、ghproxy.net 等 6 个代理 | 失效或很慢（403、TLS 错误、证书不符、522、240KB/s） | 未在国内实测 |
| 清华 / 中科大 / 南大 github-release 镜像 | 本机 403 或没有 ollama 目录 | 未在国内实测 |
| 魔搭 `modelscope/ollama-linux` 安装包 | 能下载（约 1.4MB/s），但最新只到 v0.17.5，比官方落后很多 | 未在国内实测 |
| `ollama pull deepseek-r1:1.5b`（官方仓库） | **本机失败**：`redirect target not allowed ... non-public 198.18.0.1` | 未在国内实测 |
| 给 `ollama serve` 设 `HTTPS_PROXY` | 能绕过上面的报错并开始下载，但经本机代理只有约 170KB/s，没跑完 | 未在国内实测 |
| `ollama pull --insecure` | 无效，改用 http 拉清单，报 500 | — |
| `ollama pull modelscope.cn/...` 直拉魔搭 | 本机同样被 198.18.0.1 拦截 | 未在国内实测 |
| curl 下载魔搭 GGUF + Modelfile 导入 | **可用**，4.4–5.0MB/s，断点续传两次，sha256 一致，导入 3 秒（实测用的是魔搭 unsloth 的 Q4_K_M，不是官方 deepseek-r1:1.5b，也不是同一个文件） | 未在国内实测 |
| `OLLAMA_MODELS` 改模型目录 | 可用 | 与网络无关 |

本机最后跑通的路线是：**手动下载安装包 → curl 从魔搭下载 GGUF（可续传）→ Modelfile 导入 → 推理**。

## 一、先弄清楚慢在哪一段

- **安装包**：官方脚本从 `https://ollama.com/download/...` 下载，实际 302 跳转到 GitHub Release。0.40.18 的 Linux 包是 `ollama-linux-amd64.tar.zst`（1,648,243,083 字节），**旧教程里的 `.tgz` 地址已经 404**，解压需要 `zstd`。
- **模型**：`ollama pull` 先从 `registry.ollama.ai` 取清单，再跳转到 Cloudflare R2 存储下载模型文件。deepseek-r1:1.5b 的模型层是 1,117,320,512 字节，Q4_K_M 量化。

两段的域名不同，所以“安装很快、拉模型很慢”或者反过来都很常见，要分开处理。

## 二、安装 Ollama

### 方式 1：官方脚本

```bash
sudo apt-get install -y zstd curl     # CentOS/RHEL 用 dnf install zstd
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

实测（一次性 Ubuntu 24.04 容器）：脚本用时 **20 秒**，装到 `/usr/local/bin/ollama` 和 `/usr/local/lib/ollama`，解压后约 2.5GB。没有 GPU 时会提示 `WARNING: Unable to detect NVIDIA/AMD GPU`，不影响 CPU 推理。

两点注意：

- 没装 `zstd` 时脚本会直接报错退出，提示先安装 zstd。
- 测试容器里没有 systemd，脚本没有创建 `ollama` 用户和 `ollama.service`，要自己运行 `ollama serve`。在正常的 systemd 服务器上，脚本会创建服务并自动启动（**本次未实测**）。

想固定版本，在脚本前加 `OLLAMA_VERSION`，实测带版本参数的下载地址可用：

```bash
curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=0.40.18 sh
```

### 方式 2：手动下载 tar.zst（下载慢时更可控）

脚本是“边下载边解压”，网络一断就要整个重来。手动下载可以续传、可以校验，也可以在别的机器下好再传上去：

```bash
VER=v0.40.18
cd /tmp
curl -fL -C - --retry 5 -o ollama-linux-amd64.tar.zst \
  https://github.com/ollama/ollama/releases/download/$VER/ollama-linux-amd64.tar.zst
curl -fsSL -o sha256sum.txt \
  https://github.com/ollama/ollama/releases/download/$VER/sha256sum.txt
grep ollama-linux-amd64.tar.zst sha256sum.txt   # 和下面的结果对比
sha256sum ollama-linux-amd64.tar.zst

sudo rm -rf /usr/local/lib/ollama                 # 升级时先删旧库（官方文档解压到 /usr，对应删 /usr/lib/ollama）
sudo sh -c 'zstd -dc /tmp/ollama-linux-amd64.tar.zst | tar -xf - -C /usr/local'
ollama --version
```

实测：GitHub 直连 8.2 秒下完（约 200MB/s），sha256 为 `b82649006cb5b54e…315adf`，和官方 `sha256sum.txt` 一致；解压 4.4 秒。本机为了不动系统目录，解压到了临时目录，再用 `临时目录/bin/ollama` 运行，效果一样。

手动安装后要自己配 systemd 服务，写法照 [官方 Linux 文档](https://docs.ollama.com/linux) 的 “Adding Ollama as a startup service” 一节（**本次未在 systemd 机器上实测**）。

### GitHub 下载代理：今天试了 7 个，能用的只有 1 个

把 GitHub 地址拼在代理前缀后面下载，例如：

```bash
curl -fL -C - -o ollama-linux-amd64.tar.zst \
  https://gh-proxy.com/https://github.com/ollama/ollama/releases/download/v0.40.18/ollama-linux-amd64.tar.zst
```

本机 2026-11-24 19:33–19:57（曼谷时间）的结果：

| 代理前缀 | 结果 |
|---|---|
| `gh-proxy.com` | 可用。完整下载 26.2 秒（约 63MB/s），sha256 一致；截断到 100MB 后 `curl -C -` 返回 206，续传成功 |
| `ghproxy.net` | 能通但慢：小文件 14.3 秒，大文件约 240KB/s |
| `ghfast.top` | 403 Forbidden |
| `mirror.ghproxy.com` | TLS 握手失败 |
| `github.moeyy.xyz` | TLS 握手失败 |
| `ghproxy.cc` | 证书域名不匹配 |
| `gh.llkk.cc` | Cloudflare 522 |

这类公益代理随时会失效，结果只代表今天、这台机器，**国内是否可用未实测**。第三方代理能看到并篡改你下载的文件，**用代理下的安装包一定要按上面的方法核对 sha256**。

### 国内镜像站和魔搭安装包

- 清华 `mirrors.tuna.tsinghua.edu.cn/github-release/`：本机返回 403，可能是限制了境外访问，国内是否有 ollama 目录**未在国内实测**。
- 中科大、南大的 github-release 镜像：没有 `ollama/ollama` 目录（404）。
- 魔搭 [modelscope/ollama-linux](https://modelscope.cn/models/modelscope/ollama-linux)：能下载，本机约 1.4MB/s；但 README 和版本标签显示**最新是 v0.17.5**（2026-03 上传），比官方 0.40.18 落后很多。只有在完全拿不到 GitHub 时才考虑，用之前确认版本是否满足需要。

## 三、拉模型：`ollama pull` 报 redirect target not allowed

启动服务后拉模型：

```bash
ollama serve &          # systemd 安装的话服务已在运行，跳过
ollama pull deepseek-r1:1.5b
```

本机这一步失败了，服务日志里是：

```text
aabd4debf0c8 part 5 attempt 5 failed: Get "https://dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com/...": redirect target not allowed: dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com resolves to non-public 198.18.0.1, retrying in 32s
```

原因：清单能取到，但 Ollama 0.40.18 会检查模型下载的跳转目标，**解析到非公网地址就拒绝**。源码 `transfer/redirect.go` 里被拒绝的网段包括 `198.18.0.0/15`。本机的 DNS 把所有域名都解析成 198.18.0.1，所以被拦。

在国内服务器上，如果装了 Clash、mihomo 一类代理软件并开了 **fake-ip 模式**，域名也会被解析到 198.18.x.x，大概率会遇到同一个报错（**未在国内实测**）。处理办法：

1. **给 `ollama serve` 设代理**（不是给 `ollama pull` 这个客户端设）。源码里有明确分支：请求走代理时，交给代理解析域名，不再做本地 IP 检查。

   ```bash
   # 前台临时测试
   HTTPS_PROXY=http://代理地址:端口 ollama serve

   # systemd 服务
   sudo systemctl edit ollama
   # 在打开的文件里写：
   # [Service]
   # Environment="HTTPS_PROXY=http://代理地址:端口"
   sudo systemctl daemon-reload && sudo systemctl restart ollama
   ```

   本机实测：加上 `HTTPS_PROXY` 后报错消失、开始下载，但经本机这个代理只有约 170KB/s，8 分钟才下了约 80MB，没有跑完。代理本身够快时这条路才实用。[官方 FAQ](https://docs.ollama.com/faq) 也提醒不要设 `HTTP_PROXY`，只设 `HTTPS_PROXY`。
2. **让代理软件对这些域名返回真实 IP**：在 fake-ip 过滤名单里加入 `registry.ollama.ai`、`*.r2.cloudflarestorage.com`（以及下面魔搭用到的 `*.modelscope.cn`）。**未实测**。
3. **不要用 `--insecure`**：实测 `ollama pull --insecure` 会改用 http 去取清单，直接报 `pull model manifest: 500`，解决不了问题，还会降低安全性。

`ollama pull` 中断后会在模型目录留下 `-partial` 文件，重新执行同一条命令会接着用。本机因为上面的问题没有完整跑完一次官方 pull，**Ollama 自带的续传效果未实测**。

## 四、用魔搭 ModelScope 的 GGUF 模型

### 方法 A：`ollama pull` 直接拉魔搭（本机被拦）

[魔搭文档](https://www.modelscope.cn/docs/models/advanced-usage/ollama-integration) 给出的用法是把仓库名写成 `modelscope.cn/组织/仓库:量化`：

```bash
ollama pull modelscope.cn/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF:Q4_K_M
```

本机能取到清单、开始分片下载，但随后报 `redirect target not allowed: www.modelscope.cn resolves to non-public 198.18.0.1`，和上一节是同一个原因。DNS 正常的国内服务器上应该能直接用，**未在国内实测**。

### 方法 B：curl 下载 GGUF + Modelfile 导入（本机跑通）

这个方法不经过 Ollama 的下载器，能用 curl 的断点续传，下载完再导入：

```bash
mkdir -p /data/gguf && cd /data/gguf
curl -L -C - --retry 5 --retry-delay 3 -o ds-r1-1.5b-q4km.gguf \
  "https://www.modelscope.cn/models/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/master/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf"
sha256sum ds-r1-1.5b-q4km.gguf
# 应为 f3bdf9cf31dee4b57ae4e455a1cb0d01b5c2c1b50d72d3112141c195506c2840

cat > Modelfile <<'MF'
FROM ./ds-r1-1.5b-q4km.gguf
PARAMETER temperature 0.6
MF
ollama create ds-r1-1.5b-ms -f Modelfile
ollama list
```

实测记录：

- 下载速度 4.4–5.0MB/s，跳转到 `cdn-lfs-cn-1.modelscope.cn`。中途断了两次（一次人为 15 秒超时、一次进程被中断），每次用同一条 `curl -C -` 命令都从断点续上（返回 206），最终 1,117,321,312 字节，sha256 和魔搭页面列出的一致。
- `ollama create` 用时 3 秒，`ollama show` 显示 `qwen2`、`Q4_K_M`、`template source gguf_chat_template`，也就是对话模板直接取自 GGUF 文件，Modelfile 里不用自己写 TEMPLATE。
- 魔搭上同名 1.5B GGUF 有 unsloth、bartowski、lmstudio-community 几个来源，量化同为 Q4_K_M，但文件大小和 sha256 都和 Ollama 官方的 deepseek-r1:1.5b 不同，**不是同一个文件**。

和官方模型的一个差别：导入后的模型**不会把思考过程单独拆出来**。实测 `/api/generate` 返回的 `response` 里直接包含思考内容和 `</think>`，传 `"think": false` 也没有关掉思考。需要把思考和答案分开时，要么自己按 `</think>` 切分，要么等能拉到官方模型。

## 五、模型放到数据盘：OLLAMA_MODELS

模型默认放在服务用户的家目录下，系统盘小的话建议换到数据盘。本次全程用的就是自定义目录：

```bash
OLLAMA_MODELS=/data/ollama/models ollama serve
```

导入后 `/data/ollama/models` 一类的目录里出现 `blobs/` 和 `manifests/`，本例占 1.2GB。systemd 服务的写法（**未实测**）：

```bash
sudo mkdir -p /data/ollama/models
sudo chown -R ollama:ollama /data/ollama
sudo systemctl edit ollama
# [Service]
# Environment="OLLAMA_MODELS=/data/ollama/models"
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

目录必须让 `ollama` 用户可读写，否则服务起不来或拉模型时报权限错误。改目录不会自动搬旧模型，需要的话先停服务再把旧目录内容拷过去。

## 六、跑一次推理，确认能用

```bash
ollama run ds-r1-1.5b-ms --verbose "用一句话解释什么是 Docker 容器。"
```

实测（8 核 CPU、无 GPU）：第一次加载模型 2.3 秒，生成 211 个 token 用 5.3 秒，约 **40 tokens/s**；第二次 320 个 token，约 37 tokens/s。占用内存约 1.3GB。输出末尾是 `</think>` 加一句回答，开头的 `<think>` 不显示，这是 GGUF 模板把它放进提示词里了。

用 HTTP 接口调用：

```bash
curl -s http://127.0.0.1:11434/api/generate -d '{
  "model": "ds-r1-1.5b-ms",
  "prompt": "Linux 下查看磁盘占用最大的目录用什么命令？只回答命令。",
  "stream": false
}'
```

实测返回 `"done": true`，生成 770 个 token，耗时 21.3 秒。接口完全正常，但**答案是错的**：它给的是 `ls -l` 加 `find | sort` 的组合，第二次甚至编了一个不存在的 `dhcnd` 命令。正确做法是 `sudo du -xh --max-depth=1 / | sort -rh | head`。

所以 1.5B 只适合用来验证部署跑通、做简单的文本处理，不要拿它的回答直接执行运维命令。

## 常见报错

| 报错 / 现象 | 原因与处理 |
|---|---|
| `This version requires zstd for extraction` | 新版安装包是 tar.zst，先装 zstd |
| 下载 `ollama-linux-amd64.tgz` 返回 404 | 新版本已经没有 tgz，改下 `.tar.zst` |
| `redirect target not allowed ... resolves to non-public 198.18.x.x` | DNS 被代理软件 fake-ip 接管，见第三节：给 `ollama serve` 设 `HTTPS_PROXY`，或把相关域名加入 fake-ip 过滤 |
| `pull model manifest: 500`（用了 `--insecure`） | `--insecure` 会改用 http，去掉这个参数 |
| `could not connect to a running Ollama instance` | 服务没起来：systemd 机器看 `systemctl status ollama`，否则先 `ollama serve` |
| 给 `ollama pull` 设了代理没效果 | 代理要设在服务端 `ollama serve` 上 |
| 导入的模型回答里混着思考过程 | GGUF 导入的模型不拆分思考内容，见第四节 |

## 安全注意

- Ollama 默认只监听 `127.0.0.1:11434`。接口没有鉴权，**不要直接暴露到公网**。远程访问另写一篇说明。
- GitHub 代理、第三方镜像下载的安装包和模型，都要核对 sha256 后再用。
- 代理地址如果带账号密码，写进 systemd 配置后注意文件权限，不要贴进公开仓库或聊天记录。

## 清理和回滚

```bash
ollama rm ds-r1-1.5b-ms                     # 删模型
sudo systemctl disable --now ollama          # systemd 安装时
sudo rm -f /usr/local/bin/ollama /etc/systemd/system/ollama.service
sudo rm -rf /usr/local/lib/ollama
sudo rm -rf /usr/share/ollama                # 默认模型目录，改过 OLLAMA_MODELS 的删对应目录
sudo userdel ollama; sudo groupdel ollama
```

删除前确认模型目录里没有别的要保留的模型。

## 实测环境

- 测试时间：2026-11-24 19:31–20:01（曼谷时间，UTC+7）。
- 机器：Debian 13（trixie），内核 6.12；8 核 CPU、约 15GB 内存、**无 GPU**。官方脚本在一次性 `ubuntu:24.04` 容器（host 网络）里实测，测完容器已删除；手动安装、模型下载和推理都在临时目录里进行，服务监听本机 127.0.0.1 的非默认端口，测完已清理。
- 网络：**不在中国大陆**，出网经过一层代理，DNS 把域名统一解析为 198.18.0.1。文中所有速度只代表这台机器；**国内下载速度、各代理和镜像在国内的可用性均未在国内实测**。
- 版本：Ollama 0.40.18（GitHub 发布于 2026-11-24 11:18 曼谷时间）；模型为魔搭 `unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF` 的 Q4_K_M。官方 `deepseek-r1:1.5b` 因第三节的问题没有在本机拉完。
- 未实测：systemd 机器上的脚本安装、服务配置和 `systemctl edit` 写法；Ollama 自带的续传；fake-ip 过滤名单写法；国内网络下的全部速度和镜像可用性；14B 及更大模型。
- 官方文档（2026-11-24 读取均可访问）：
  - [Ollama Linux 安装](https://docs.ollama.com/linux)
  - [Ollama FAQ（代理、模型目录）](https://docs.ollama.com/faq)
  - [导入 GGUF 模型](https://docs.ollama.com/import)、[Modelfile 参考](https://docs.ollama.com/modelfile)
  - [/api/generate 接口](https://docs.ollama.com/api/generate)
  - [Ollama 加载 ModelScope 模型（魔搭文档）](https://www.modelscope.cn/docs/models/advanced-usage/ollama-integration)

