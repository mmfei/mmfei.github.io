# GitHub 国内加速 2026：git 代理、SSH 走 443、浅克隆与 Release 校验实测


在国内服务器上 `git clone` GitHub 仓库，常见的是速度只有几十 KB/s、clone 到一半断开，或者 SSH 直接连不上。网上很多“加速”教程要么让你改 hosts，要么推荐来路不明的镜像站。本文只写合法、能自己核实的做法：把 git 流量交给你已有的合规代理、SSH 改走 443 端口、用浅克隆少下数据、Release 下载后校验 SHA256。

站内 2022 年那篇[阿里云国内机房拉GitHub代码加速方案](https://www.mmfei.com/2022/04/阿里云国内机房拉github代码加速方案/)记录了当时的三种做法（绑 hosts、装代理客户端、换海外机器）。本文是它的 2026 年补充：解释 hosts 为什么不再推荐，并把代理的配置范围收窄到只影响 GitHub。

## 先说结论

| 场景 | 推荐做法 | 本文实测情况 |
| --- | --- | --- |
| HTTPS clone 慢或断开 | 只给 `https://github.com` 配 `http.<url>.proxy` | 已实测，流量确实经过代理 |
| 只需要最新代码（CI、部署） | `--depth 1` 或 `--filter=blob:none` | 已实测，nginx 仓库下载量 76.41 MiB 降到 1.40 MiB |
| SSH 22 端口被拦 | 改用 `ssh.github.com:443` | 测试机网络拦截 SSH，未能跑通，需运维在国内服务器复测 |
| 公司只给 HTTP 代理 | SSH 用 `ProxyCommand nc -X connect` 走代理的 443 | 已实测：代理放行 443，拒绝 22（403） |
| 下载 Release 二进制 | 走代理下载后用官方 checksums 校验 | 已实测，篡改 1 字节即校验失败 |
| 改 hosts | 不推荐 | 解释原因；测试机出口有透明代理，无法验证任何 IP |

## 实测环境与边界

- 测试时间：2026-11-24，曼谷时间 19:20 至 19:25。
- 工具版本：git 2.47.3、OpenSSH 10.0p2、curl 8.14.1、tinyproxy 1.11.2，Debian 13（内核 6.12）。
- 代理：本机临时起的 tinyproxy（`127.0.0.1:18888`），代替你自己的合规代理，只用来证明流量确实经过了代理，不代表任何代理产品。
- 所有 git 和 ssh 配置都写在临时目录里，没有改本机全局配置，测试结束已删除。
- **测试机不在中国大陆网络，并且出口有一层按 TLS SNI 转发的透明代理**（把 github.com 指到 Cloudflare 的 1.1.1.1，也拿到了 `CN=github.com` 的证书）。所以文中耗时只能说明相对差异，不代表国内速度；hosts 方案和 SSH 直连在这台机器上无法验证。

代理请使用所在单位、云厂商提供的或其他符合当地法律法规的网络出口。本文不推荐任何付费 VPN 或代理服务，也不提供速度对比数据。

## 1. 只给 github.com 配 git 代理

不要直接设全局 `http.proxy`，否则访问 Gitee、公司内网 GitLab 也会被送到代理。git 支持按 URL 匹配配置（官方文档 `http.<url>.*`），只给 GitHub 生效：

```bash
# 把 127.0.0.1:18888 换成你自己的代理地址
git config --global http.https://github.com.proxy http://127.0.0.1:18888
```

核对哪些地址会走代理：

```bash
git config --get-urlmatch http.proxy https://github.com/nginx/nginx.git
git config --get-urlmatch http.proxy https://gitee.com/x/y.git ; echo exit=$?
```

实测输出：

```text
$ cat ~/.gitconfig
[http "https://github.com"]
	proxy = http://127.0.0.1:18888
$ git config --get-urlmatch http.proxy https://github.com/nginx/nginx.git
http://127.0.0.1:18888
$ git config --get-urlmatch http.proxy https://gitee.com/x/y.git ; echo exit=$?
exit=1
```

`exit=1` 表示 Gitee 没有匹配到代理配置，会直连。clone 时代理日志里只出现了 `CONNECT github.com:443`。

几个相关用法：

```bash
# 只对这一次命令生效，不写配置文件
git -c http.https://github.com.proxy=http://127.0.0.1:18888 clone https://github.com/OWNER/REPO.git

# 代理要账号时，官方允许只写用户名，密码由 git 的凭据机制询问，避免明文写进配置
git config --global http.https://github.com.proxy http://proxyuser@10.0.0.8:3128

# 撤销
git config --global --unset http.https://github.com.proxy
```

git 官方文档特别提醒：代理必须完全透明，不能修改、转换或缓冲请求和响应，否则会出现各种异常。所以“会改写内容”的网页加速服务不适合给 git 用。

代理挂掉时报错长这样，看到 `127.0.0.1 port 18888` 就知道是代理的问题，不是 GitHub 的问题：

```text
$ git ls-remote https://github.com/nginx/nginx.git HEAD
fatal: unable to access 'https://github.com/nginx/nginx.git/': Failed to connect to 127.0.0.1 port 18888 after 0 ms: Could not connect to server
```

## 2. 浅克隆：先少下数据

很多时候慢不是因为连不上，而是仓库历史太大。CI 构建、服务器部署通常只要最新代码，用浅克隆或部分克隆就够了。

```bash
# 只要最新一次提交
git clone --depth 1 https://github.com/nginx/nginx.git

# 保留完整提交历史，但文件内容按需再下载（之后 checkout 旧版本会再联网）
git clone --filter=blob:none https://github.com/nginx/nginx.git

# 只要一个分支的最新提交
git clone --depth 1 --filter=blob:none --single-branch https://github.com/nginx/nginx.git

# 浅克隆之后需要更多历史
git fetch --deepen=50
```

用 nginx 官方仓库实测，四种方式都经过代理：

| 方式 | 本地对象大小（size-pack） | 提交数 | 工作区文件数 | 耗时（仅供相对比较） |
| --- | --- | --- | --- | --- |
| 完整 clone | 76.41 MiB | 8810 | 544 | 13.2s |
| `--depth 1` | 1.40 MiB | 1 | 544 | 5.0s |
| `--filter=blob:none` | 8.77 MiB | 8810 | 544 | 13.4s |
| `--depth 1 --filter=blob:none --single-branch` | 1.43 MiB | 1 | 544 | 9.3s |

浅克隆后执行 `git fetch --deepen=50`，提交数变成 51。

怎么选：

- 部署和 CI：`--depth 1`，下载量最小。
- 开发时需要 `git log`、`git blame`：`--filter=blob:none`，历史完整，文件内容用到再取。
- 在线路不稳的环境，下载量越小，中途断开的概率越低。这一点是推论，测试机网络不在国内，未做断线对比。

## 3. SSH 改走 443 端口

有些网络会拦 SSH 的 22 端口。GitHub 官方提供 `ssh.github.com` 的 443 端口，配置方法来自 GitHub 文档 *Using SSH over the HTTPS port*。先测试能否连通：

```bash
ssh -T -p 443 git@ssh.github.com
```

能连通就在 `~/.ssh/config` 里让所有 github.com 连接改走 443：

```text
Host github.com
    Hostname ssh.github.com
    Port 443
    User git
```

之后 `git clone git@github.com:OWNER/REPO.git` 不用改地址。也可以直接写完整地址：

```bash
git clone ssh://git@ssh.github.com:443/OWNER/REPO.git
```

第一次连接会提示主机指纹。请和 GitHub 官方公布的指纹核对后再输入 yes，Ed25519 指纹是：

```text
SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
```

也可以把官方公布的公钥写进 `~/.ssh/known_hosts`。注意官方示例的主机名是 `github.com`，走 443 时 OpenSSH 校验的是 `[ssh.github.com]:443`，只写 `github.com` 那一行，第一次仍会提示主机名不同。应同时写入两条（公钥以官方页面当前值为准）：

```text
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
[ssh.github.com]:443 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
```

如果提示的指纹对不上，不要继续连接，网络中间可能有人在冒充 GitHub。

**实测说明**：测试机出口拦截了 SSH。作者实测：直连 22 和 443 都被断开（`Connection closed by 198.18.0.1`），经代理连 443 时代理已经建立连接，但在 SSH 握手阶段超时。运维于 2026-11-24 19:35（曼谷时间，Asia/Bangkok）在同一网络复测 `ssh -T -p 443 git@ssh.github.com` 与 `ssh-keyscan -p 443 ssh.github.com`：`ssh.github.com` 解析到 `198.18.0.1`，443 端口返回的是 `HTTP/1.1 400 Bad Request`（`Server: Pingora`），不是 SSH banner，未能采集主机密钥。文中的 Ed25519 指纹已与当天 GitHub Docs 及 `https://api.github.com/meta` 的 `SHA256_ED25519` 核对一致。SSH 握手在这台机器上没有跑通，国内服务器上的连通性仍待有条件时补测。

## 4. 只有 HTTP 代理时，让 SSH 也走代理

公司网络常常只提供一个 HTTP 代理。SSH 可以用 `ProxyCommand` 借这个代理的 CONNECT 方法出去。Debian/Ubuntu 上的 `nc` 是 OpenBSD 版本，支持 `-X connect`：

```text
Host github.com
    Hostname ssh.github.com
    Port 443
    User git
    ProxyCommand nc -X connect -x 127.0.0.1:18888 %h %p
```

如果代理是 SOCKS5，把 `-X connect` 换成 `-X 5`（本文只实测了 HTTP 代理）。

这里有一个容易踩的坑：很多 HTTP 代理只允许 CONNECT 到 443 端口。实测时代理按常见配置只放行 443，结果如下：

```text
$ ssh -T gh-proxy22          # 经代理连 github.com:22
nc: Proxy error: "HTTP/1.0 403 Access violation"

$ ssh -T gh-proxy443         # 经代理连 ssh.github.com:443
（代理日志：CONNECT ssh.github.com:443，已放行）
```

所以“SSH 走代理”和“SSH 走 443”通常要一起用。

## 5. Release 下载：下载后一定要校验

GitHub Release 的文件实际从 `release-assets.githubusercontent.com` 下载。实测走代理下载 GitHub CLI 的 Release 时，代理日志里出现了 `github.com` 和 `release-assets.githubusercontent.com` 两个域名。所以如果你用的是按域名分流的代理，两个域名都要放进去。

下载后用项目发布的 checksums 文件校验：

```bash
TAG=v2.105.0; V=${TAG#v}
curl -fSLO -x http://127.0.0.1:18888 "https://github.com/cli/cli/releases/download/$TAG/gh_${V}_linux_amd64.tar.gz"
curl -fSLO -x http://127.0.0.1:18888 "https://github.com/cli/cli/releases/download/$TAG/gh_${V}_checksums.txt"
sha256sum -c --ignore-missing "gh_${V}_checksums.txt"
```

实测输出：

```text
$ sha256sum -c --ignore-missing gh_2.105.0_checksums.txt
gh_2.105.0_linux_amd64.tar.gz: OK
```

GitHub API 返回的 Release 资产信息里也带有 `digest` 字段，可以作为第二个来源核对。实测看到：

```text
api asset: gh_2.105.0_linux_amd64.tar.gz size=15050573 digest=sha256:79e7ab5db738c48777b696e374f8b428f0647debfb424f44d2f426370407fe2f
```

在文件末尾追加 1 个字节模拟被篡改，再校验：

```text
sha256sum: WARNING: 1 computed checksum did NOT match
```

注意，checksums 文件要从 GitHub 官方地址取。如果文件和 checksums 都来自同一个第三方镜像，镜像可以一起改掉，校验就没有意义了。

## 6. 镜像站和“加速链接”的风险

网上有不少把 `https://github.com/...` 包一层再下载的加速站，也有人用 `url.<base>.insteadOf` 把整个 GitHub 改写到镜像：

```bash
# 仅演示语法，MIRROR 为占位符，本文不推荐任何具体镜像
git config --global url."https://MIRROR.example/https://github.com/".insteadOf "https://github.com/"
```

使用前想清楚这几件事：

1. **内容可被修改**：镜像能返回任意内容。下载二进制要按上一节校验，源码要核对提交哈希或签名标签。
2. **凭据泄露**：不要把 GitHub Token 写进镜像 URL，也不要经镜像 push 私有仓库。
3. **可用性不可控**：这类服务随时可能停止或变更规则，CI 依赖它就会突然失败。
4. **合规**：先确认所在单位对使用第三方中转的规定。

如果确实要用，建议只用于公开仓库的只读拉取，用完执行 `git config --global --unset-all url."https://MIRROR.example/https://github.com/".insteadOf` 撤销。

## 7. 为什么不再推荐改 hosts

旧教程（包括站内 2022 年那篇）会给一组 IP 写进 `/etc/hosts`。现在不推荐，原因是：

- GitHub 的地址段很多，而且会变。2026-11-24 从官方 meta API（`https://api.github.com/meta`）读到：web 91 段、git 111 段、api 26 段、packages 32 段。hosts 只能写死某一个 IP，GitHub 换地址后就会失效，而且失效时不会有任何提示。
- 一次 clone 或下载可能用到 `github.com`、`codeload.github.com`、`release-assets.githubusercontent.com`、`objects.githubusercontent.com` 等多个域名，只改其中一两个往往不起作用。
- 写死 IP 解决不了线路本身的丢包和限速，“改完变快”很多时候只是碰巧换到一条当时较好的线路。
- 从不明来源复制的 IP 列表，可能把你指向非 GitHub 的服务器。HTTPS 证书校验能挡住大部分风险，但前提是你没有为了“能用”而关掉证书校验（`git -c http.sslVerify=false` 之类的做法千万不要用）。

**实测说明**：测试机出口按 TLS SNI 透明转发，把 github.com 指到任何可路由的 IP（包括 Cloudflare 的 1.1.1.1）都会拿到 GitHub 的证书和 200，所以本文无法验证任何 hosts IP 在国内是否可用，也不会给出“某个 IP 能用”的结论。

## 常见故障

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `Failed to connect to 127.0.0.1 port xxxx` | 配置的代理没启动 | 启动代理，或 `git config --global --unset http.https://github.com.proxy` |
| 只有 Gitee/内网 GitLab 变慢或失败 | 设了全局 `http.proxy` 或环境变量 `https_proxy` | 改成 `http.https://github.com.proxy`，检查 `env \| grep -i proxy` |
| `nc: Proxy error: "HTTP/1.0 403 ..."` | 代理不允许 CONNECT 到 22 | SSH 改走 `ssh.github.com:443` |
| SSH 提示 Host key verification failed 或指纹变化 | known_hosts 里还是旧记录，或网络中间有人冒充 | 先和官方指纹核对，确认无误再删除旧记录 |
| `RPC failed; curl 18 transfer closed` 或 clone 到一半断开 | 线路不稳，下载量大 | 先 `--depth 1`，需要历史再 `git fetch --deepen` |
| Release 下载走代理仍然很慢 | 代理分流规则没覆盖 `release-assets.githubusercontent.com` | 把该域名加入代理规则 |

## 安全注意

- 代理地址可以写在 git 配置里，但代理密码不要明文写进 `.gitconfig`，按官方用法只写用户名，让凭据机制询问密码。
- 不要为了绕过问题关闭 TLS 证书校验。
- SSH 首次连接一定核对官方指纹。
- 第三方镜像只做只读用途，不传 Token。

## 回滚

```bash
git config --global --unset http.https://github.com.proxy
git config --global --unset-all url."https://MIRROR.example/https://github.com/".insteadOf
# ~/.ssh/config 删除新增的 Host github.com 段；known_hosts 中 [ssh.github.com]:443 的记录可保留
```

## 官方参考

- git-config：`http.proxy`、`http.<url>.*`：<https://git-scm.com/docs/git-config>
- git-clone：`--depth`、`--filter`、`--single-branch`：<https://git-scm.com/docs/git-clone>
- GitHub Docs，Using SSH over the HTTPS port：<https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port>
- GitHub Docs，GitHub's SSH key fingerprints：<https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints>
- GitHub Docs，About GitHub's IP addresses：<https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses>
- ssh_config `ProxyCommand`：<https://man.openbsd.org/ssh_config>

相关阅读：[阿里云国内机房拉GitHub代码加速方案](https://www.mmfei.com/2022/04/阿里云国内机房拉github代码加速方案/)、[GitHub Pages自定义域名HTTPS核对清单](https://www.mmfei.com/2026/11/github-pages自定义域名https核对清单/)。

