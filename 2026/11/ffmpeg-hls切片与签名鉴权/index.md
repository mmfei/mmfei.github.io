# FFmpeg HLS 切片与签名鉴权：别只保护 m3u8


为短剧播放页签一个`index.m3u8`地址，并不意味着视频片段受保护。如果播放列表里的`seg000.ts`可以直接访问，跳过播放页仍然能拿到内容。

本文从技术实现出发：先用FFmpeg生成HLS点播素材，再用最小HMAC服务验证**播放列表和每个片段都要鉴权**，并用自动化测试覆盖过期、签名错误和直连绕过。短剧只是这个访问控制问题的业务场景。

## 环境与边界

本次实际使用Linux、FFmpeg 7.1.5-0+deb13u1和Python 3.13.5。素材是6秒本地合成画面与测试音，单码率、MPEG-TS、点播，不涉及真实剧集、订单、模型调用或付费服务。

Python `http.server`官方明确不推荐用于生产。本例只监听`127.0.0.1`，用来观察协议和鉴权边界，**不是可直接公网部署的付费播放平台**。未测试Safari、hls.js、移动端、真实CDN或DRM。

## 1. 切片长度先与GOP对齐

HLS输出包括播放列表和它引用的媒体片段。`-hls_time 2`设置的是目标片长，FFmpeg通常在目标时间后的关键帧处切分，不保证任意输入都精确两秒。

本例固定25fps，设置50帧GOP、关闭场景切换插入关键帧，并使用closed GOP，让视频关键帧与2秒目标边界配合。`independent_segments`是独立分片的声明，不会替你把任意切片修成独立可解码；需要实际编码条件和验证支持。

保存为`generate.sh`，运行会新建一个临时目录，不覆盖已有媒体，也不删除目录：

```text
#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d "${TMPDIR:-/tmp}/hls-auth-demo.XXXXXX")
printf '%s\n' "$work"
cd "$work"
ffmpeg -hide_banner -nostdin -f lavfi -i "testsrc2=size=320x180:rate=25:duration=6" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=6" \
  -map 0{?:}v{?:}0 -map 1{?:}a{?:}0 -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p \
  -g 50 -keyint_min 50 -sc_threshold 0 -flags +cgop \
  -c:a aac -b:a 96k -t 6 -f hls -hls_time 2 -hls_list_size 0 \
  -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename 'seg%03d.ts' index.m3u8 2>encode.log
ffmpeg -hide_banner -nostdin -v error -i index.m3u8 -f null - 2>decode-errors.log
```

运行并保存输出目录：

```bash
bash generate.sh > sandbox-path.txt
work=$(<sandbox-path.txt)
```

`-hls_playlist_type vod`输出点播类型，`-hls_list_size 0`保留全部条目。不要把直播滑动窗口参数不加区分地搬来做完整点播。

本次得到三段`EXTINF=2.000000`，播放列表带结束标记；逐段检查首个视频包为关键帧，合并播放列表后完整解码无错误。这是本次测试素材的结果，不是对所有上传视频的承诺。

## 2. 先画清授权发生的位置

```text
用户会话 → 业务后端核验订单/观看权益 → 签发短时播放权限
                                         ↓
                            受保护的m3u8请求
                                         ↓
                       对列表中每个片段URI逐个附加签名
                                         ↓
                        每次片段请求验证签名与有效期
```

本例只实现后半段的签名验证和列表重写，**不实现第一步的登录、订单与权益核验，也不提供任何人都能调用的签名接口**。真实系统必须先判断这个用户是否有权看这部内容，再签发对应资源权限。

本例签名消息是“精确路径 + 换行 + 到期秒数”，用HMAC-SHA256计算摘要。验签同时绑定路径和时间，避免拿列表签名套到片段路径；摘要用`compare_digest`比较。

列表地址上的query不会自动附加到它引用的`seg000.ts`。因此本例重写每个片段URI，使其带自己的路径签名。不能只签列表，再期待播放器替片段继承token。

## 3. 可运行的本地鉴权服务

保存下面的`auth_server.py`。支持范围刻意收窄：一个媒体列表、固定格式TS文件名、GET、单段`bytes=start-end`或`bytes=start-`范围请求。多范围、后缀范围、HEAD、主播放列表、fMP4初始化段与密钥URI均未实现，不能直接复用于这些格式。

代码启动时从已生成列表建立文件白名单，不允许用任意URL拼接文件路径；媒体目录应由服务自己控制，不能让不可信进程在检查后替换文件。本例拒绝符号链接，但不把启动检查当成完整文件系统隔离方案。

```python
import argparse
import hashlib
import hmac
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit


def signature(secret, path, expiry):
    message = f"{path}\n{expiry}".encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def signed_url(secret, path, expiry):
    return path + "?" + urlencode({"exp": expiry, "sig": signature(secret, path, expiry)})


def make_server(root, secret, port=0):
    root = Path(root).resolve()
    if len(secret) < 32:
        raise ValueError("use at least 32 random bytes")
    # Strict allowlist: no arbitrary path concatenation, no nested manifests.
    allowed = {"/media/index.m3u8": root / "index.m3u8"}
    manifest = (root / "index.m3u8").read_text()
    for line in manifest.splitlines():
        if line and not line.startswith("#"):
            if not re.fullmatch(r"seg[0-9]{3}\.ts", line):
                raise ValueError("unsupported manifest URI")
            file = root / line
            if file.is_symlink() or not file.is_file():
                raise ValueError("invalid segment")
            allowed["/media/" + line] = file
    if allowed["/media/index.m3u8"].is_symlink():
        raise ValueError("manifest symlink rejected")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Do not log signed query strings.

        def reject(self, status, total=None):
            self.send_response(status)
            self.send_header("Cache-Control", "private, no-store")
            if total is not None:
                self.send_header("Content-Range", f"bytes */{total}")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            parsed = urlsplit(self.path)
            if parsed.path not in allowed:
                return self.reject(404)
            query = parse_qs(parsed.query, keep_blank_values=True)
            if set(query) != {"exp", "sig"} or any(len(v) != 1 for v in query.values()):
                return self.reject(403)
            raw_exp, supplied = query["exp"][0], query["sig"][0]
            if not re.fullmatch(r"[0-9]{10}", raw_exp) or not re.fullmatch(r"[0-9a-f]{64}", supplied):
                return self.reject(403)
            expiry = int(raw_exp)
            now = int(time.time())
            if expiry <= now or expiry - now > 300:
                return self.reject(403)
            expected = signature(secret, parsed.path, expiry)
            if not hmac.compare_digest(expected, supplied):
                return self.reject(403)
            if parsed.path.endswith(".m3u8"):
                lines = [signed_url(secret, "/media/" + line, expiry)
                         if line and not line.startswith("#") else line
                         for line in manifest.splitlines()]
                body = ("\n".join(lines) + "\n").encode()
                content_type = "application/vnd.apple.mpegurl"
            else:
                body = allowed[parsed.path].read_bytes()
                content_type = "video/mp2t"
            total = len(body)
            content_range = None
            if "Range" in self.headers:
                match = re.fullmatch(r"bytes=([0-9]+)-([0-9]*)", self.headers["Range"])
                if not match:
                    return self.reject(416, total)
                start = int(match[1])
                end = min(int(match[2]), total - 1) if match[2] else total - 1
                if start >= total or end < start:
                    return self.reject(416, total)
                body = body[start:end + 1]
                content_range = f"bytes {start}-{end}/{total}"
            self.send_response(206 if content_range else 200)
            if content_range:
                self.send_header("Content-Range", content_range)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    parser.add_argument("--port", type=int, default=8088)
    args = parser.parse_args()
    secret = bytes.fromhex(os.environ["HLS_DEMO_SECRET"])
    server = make_server(args.root, secret, args.port)
    print(f"Listening on 127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
```

自动化测试会自己生成随机密钥、启动随机本地端口并结束服务，不需要你手工配置密钥。若仅在自己的隔离环境手动启动，代码入口从`HLS_DEMO_SECRET`环境变量读入32字节以上随机密钥的十六进制编码；不要把真实密钥、签名链接或带token的访问日志放到公开文章和工单里。

签名链接是短时持有者凭证，拿到链接的人在过期前仍能访问。这里没有绑定用户会话，也没有实现即刻撤销；时间校验并不等于完整用户授权。

## 4. 完整正反向测试

保存为`test_hls.py`，与`auth_server.py`放在同一目录。测试仅使用合成文件；不会访问真实订单或外部CDN。它最后会让FFmpeg通过本地HTTP读取签名列表和分片并解码，而不是只用Python检查几个200响应。

```python
import json
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from auth_server import make_server, signed_url

root = Path(sys.argv[1])
secret = secrets.token_bytes(32)
server = make_server(root, secret)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
origin = f"http://127.0.0.1:{server.server_port}"
expiry = int(time.time()) + 120
checks = []

def check(name, ok):
    assert ok, name
    checks.append(name)

def get(path, headers=None):
    try:
        with urlopen(Request(origin + path, headers=headers or {}), timeout=5) as response:
            return response.status, response.read(), dict(response.headers)
    except HTTPError as e:
        return e.code, e.read(), dict(e.headers)

try:
    local = (root / "index.m3u8").read_text()
    durations = [float(line.split(":", 1)[1].rstrip(",")) for line in local.splitlines() if line.startswith("#EXTINF:")]
    check("three two-second video segments", len(durations) == 3 and all(abs(d-2) < 0.05 for d in durations))
    check("VOD end marker", "#EXT-X-ENDLIST" in local)
    for i in range(3):
        packets = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
            "-read_intervals", "%+#1", "-show_packets", "-show_entries", "packet=flags", "-of", "json",
            str(root / f"seg{i:03d}.ts")]))["packets"]
        check("segment starts with video keyframe " + str(i), bool(packets) and "K" in packets[0]["flags"])
    check("local decode has no error", (root / "decode-errors.log").stat().st_size == 0)
    playlist = signed_url(secret, "/media/index.m3u8", expiry)
    status, body, headers = get(playlist)
    check("signed playlist allowed", status == 200)
    check("private no-store playlist", headers["Cache-Control"] == "private, no-store")
    segments = [s for s in body.decode().splitlines() if s and not s.startswith("#")]
    check("every segment URI carries own token", len(segments) == 3 and all("?exp=" in s and "&sig=" in s for s in segments))
    for i, segment in enumerate(segments):
        status, data, hdr = get(segment)
        check("signed segment " + str(i), status == 200 and len(data) > 0 and hdr["Content-Type"] == "video/mp2t")
    check("unsigned playlist denied", get("/media/index.m3u8")[0] == 403)
    check("unsigned segment denied", get("/media/seg000.ts")[0] == 403)
    check("expired signature denied", get(signed_url(secret, "/media/seg000.ts", int(time.time())-1))[0] == 403)
    check("wrong secret denied", get(signed_url(secrets.token_bytes(32), "/media/seg000.ts", expiry))[0] == 403)
    wrong_path = "/media/seg000.ts?" + playlist.split("?", 1)[1]
    check("playlist token cannot authorize segment", get(wrong_path)[0] == 403)
    check("duplicate query denied", get(playlist + "&exp=" + str(expiry))[0] == 403)
    check("unexpected path denied", get("/media/%2e%2e/secret")[0] == 404)
    r_status, r_data, r_headers = get(segments[0], {"Range": "bytes=0-10"})
    check("single byte range supported", r_status == 206 and len(r_data) == 11 and r_headers["Content-Range"].startswith("bytes 0-10/"))
    check("unsatisfiable range rejected", get(segments[0], {"Range": "bytes=9999999999-"})[0] == 416)
    check("overlong validity denied", get(signed_url(secret, "/media/index.m3u8", int(time.time())+600))[0] == 403)
    # Output is discarded; authenticated manifest and each segment fetched over local HTTP.
    run = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", origin + playlist, "-f", "null", "-"],
                         capture_output=True, timeout=30)
    check("FFmpeg HTTP decode with segment auth", run.returncode == 0 and run.stderr == b"")
    print(json.dumps({"sandbox": str(root), "checks": checks, "count": len(checks),
         "durations": durations,
         "scope": "local TS VOD and localhost HMAC auth; no browser/CDN/DRM/order system validation"}, ensure_ascii=False, indent=2))
finally:
    server.shutdown()
    thread.join(timeout=5)
    server.server_close()
```

执行：

```bash
python3 test_hls.py "$work"
```

本次23项断言通过，覆盖三段2秒切片、逐片关键帧、本地解码、合法列表和片段、每个URI自己的签名、过期拒绝、错误密钥拒绝、列表签名不能用于片段、重复参数拒绝、未知路径拒绝、单段Range和越界Range、超长有效期拒绝，以及FFmpeg真实走本地HTTP的完整解码。

这仍然只是本地HTTP客户端验证，不能写成“浏览器播放兼容已通过”或“线上付费鉴权已完成”。

### 测试暴露的一处实际问题

第一版仅实现完整文件GET，拒绝了所有Range请求；FFmpeg的HTTP解码测试没有通过。补充单段Range、返回正确206和Content-Range后，才通过上述链路验证。

这说明签名正确和文件存在还不够：媒体客户端的实际请求方式也属于交付契约。但本例只支持已列出的Range子集，不能宣称实现完整HTTP服务器。

## 5. 缓存和有效期不能留到最后考虑

示例用`Cache-Control: private, no-store`，故意优先展示鉴权，不做共享缓存优化。生产CDN如果缓存绕过了验签，或者缓存命中时不检查权限，源站签名再严也可能失效。

生产设计应确认：边缘还是源站验签；缓存键是否包含token；从缓存命中时如何仍保证访问控制；对象存储与源站是否有未鉴权的直连地址。**仅移除query参数以提高缓存命中，不是完整方案**。

本例沿用同一个到期时刻签每个片段。六秒测试可以完成，真实长视频在中途过期会失败；应设计权益检查、刷新播放权限、播放器重新加载的流程。不要单纯把有效期拉长到数天来掩盖刷新缺失。

自适应多码率会增加主列表、子列表及多个资源路径。fMP4还可能引用初始化段，带加密的HLS会引用密钥地址。它们也应在同一保护边界内，但**不在本次代码与实测范围**。

## 6. 这不是DRM，也不是防录屏

签名URL控制谁能在何时请求资源，不是媒体加密；HLS AES-128加密也不自动等于DRM，更不保证阻止有权限用户录屏或下载。不要把“链接过期”写成“内容无法复制”。

真实播放系统还要处理HTTPS、业务认证、权益撤销、速率与并发限制、密钥轮换、安全日志、跨域、监控和异常账单。短剧试看可设计独立试看资产或受控播放区间，但仅让前端隐藏后续集数不能替代后端鉴权。

## 发布和回滚

把新切片作为新版本上传，先检查列表里每个资源均存在、均受相同鉴权边界保护，再切换引用；不要原地覆盖仍被客户端缓存的分片。

本例没有清理线上资源、配置CDN或修改对象存储权限。生产回滚要同时考虑列表、分片与token策略：恢复到有直连漏洞的旧配置，并不算安全回滚。

## 官方参考

- [FFmpeg HLS muxer参数](https://ffmpeg.org/ffmpeg-formats.html#hls-2)
- [Python 3.13 HMAC与compare_digest](https://docs.python.org/3.13/library/hmac.html)
- [Python http.server的适用边界](https://docs.python.org/3.13/library/http.server.html)

在线手册会更新，本例还核对了实际安装版本的`ffmpeg -h muxer=hls`输出。没有把合成样例的成功推断为真实CDN成本、首屏时间、抗盗链强度或高并发能力。

