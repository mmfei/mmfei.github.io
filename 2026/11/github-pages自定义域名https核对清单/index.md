# GitHub Pages 自定义域名：www 与裸域、HTTPS 证书与强制跳转核对清单


站点能在浏览器里打开，不等于自定义域名、证书和跳转都已经按预期工作。裸域与 `www` 指向不一致、证书还在签发、发布根目录的 `CNAME` 被生成器覆盖，或页面里的 canonical 仍写着旧主机名，都会让读者、搜索引擎和后续的站点校验看到分裂的入口。本篇按 GitHub Pages 官方文档，整理一份可重复执行的核对清单，说明每一步该看什么、用什么命令验证，以及常见故障和回滚边界。

> 适用范围：已经拥有域名、能够查看仓库的 GitHub Pages 设置，并可以查询该域名 DNS 的站点维护者。资料核读日期为 2026 年 11 月 19 日（Asia/Bangkok），依据当时的 GitHub Pages 官方说明：自定义域名、管理自定义域名、HTTPS、故障排除以及域名验证。文中的 `example.com`、`www.example.com`、`USERNAME`、`ORGANIZATION` 都是官方文档常用的占位符，**必须换成你自己的域名和账户**，不要直接查询或修改示例名。本篇是核对与配置对照，**未在本文环境对某个演练域名完整走一遍“改 DNS、等证书、开强制 HTTPS”的实测**。不涉及广告代码或付费配置，也不建议绕过平台限制。GitHub Pages 官方提醒：不要把该服务用于发送密码、支付卡号等敏感交易。

## 环境与边界

你需要仓库的管理员权限，才能查看或修改 Settings 里的 Pages 项，包括 Custom domain 和 Enforce HTTPS。DNS 记录在域名注册商或 DNS 托管商处，不在仓库源码里；改 DNS 可能需要最多 24 小时传播，官方对此有明确说明。核对可以只读进行：即使用 `dig`、`curl` 和页面源码，不先改生产解析。

先找到最终托管站点的仓库，并查看该仓库 Settings → Pages 的 Source。源码仓库、Actions 构建仓库和最终托管仓库可能不是同一个；“流水线里使用了 Actions”不能证明 Pages 的 Source 是 GitHub Actions。按最终托管仓库的设置分清两种发布方式：

- **从分支发布**：自定义域名会保存在发布源根目录一个名为 `CNAME` 的文件中。通过仓库设置保存域名时，GitHub 会提交这个文件。文件名必须全大写，且只能包含一个域名。
- **最终托管仓库的 Pages Source 为 GitHub Actions**：官方写明任何 `CNAME` 文件会被忽略，也不需要这个文件。此时应以仓库 Pages 设置里填写的自定义域名为准。

例如 Actions 在源码仓构建 Hugo，再把产物推送到另一个仓库的发布分支；如果那个托管仓库的 Pages Source 是 Deploy from a branch，仍按“从分支发布”处理 `CNAME`，不要因构建用了 Actions 就删除它。

如果站点前面还有 CDN、反代或其它 DNS 托管，公开解析可能不再直接显示 GitHub Pages 文档中的 A / AAAA / CNAME 目标。这种情况下，仍应核对这些“用户最终访问到的现象”（证书、跳转、canonical），但不要把未核验的私有 CDN 规则当成官方步骤复制。本篇附录只记录一处公开站点的可见现象，供对照，不是通用配方。

## 1. 这份清单要核对什么

把问题拆开，避免只看“https 能不能打开”：

| 核对项 | 要回答的问题 | 主要依据 |
| --- | --- | --- |
| DNS | 裸域、`www` 是否指向官方要求的记录，且没有多余记录挡住证书签发 | 管理自定义域名、HTTPS 文档中的记录表 |
| 仓库 Pages 设置 | Custom domain 填的是哪一个主机名，Enforce HTTPS 是否已可选且已勾选 | 仓库 Settings → Pages |
| 发布根目录的 `CNAME` 文件 | 从分支发布时，线上根目录是否仍有格式正确的文件；最终 Pages Source 为 GitHub Actions 时，不要把这个文件当成有效配置 | 故障排除中的 CNAME 说明 |
| HTTPS 证书 | 自定义域名是否已经用 HTTPS 打开，证书是否覆盖你实际使用的主机名 | Securing your GitHub Pages site with HTTPS |
| 强制 HTTPS | HTTP 入口是否被重定向到 HTTPS | Enforce HTTPS 说明 |
| 裸域与 `www` 统一 | 两者是否按你在 Pages 里设定的主域名互相跳转 | About custom domains、Managing a custom domain |
| canonical | 页面声明的规范网址是否与最终访问的主机名一致 | 站点模板或生成器的 `baseURL` 等配置 |

官方支持的自定义域类型是：`www` 子域（`www.example.com`）、其它自定义子域（`blog.example.com`）以及 apex / 裸域（`example.com`）。不支持的组合包括：超过一个裸域、超过一个 `www` 子域，以及同时使用裸域和（除 `www` 以外的）自定义子域。官方建议即使使用裸域，也始终配置 `www`；`www` 被写成更稳定的类型，因为它不受 GitHub 服务器 IP 变化影响。

## 2. 按官方文档理解跳转方向

如果你为站点配置了正确的裸域记录和 `www` 的 CNAME，GitHub Pages 会在两者之间自动建立重定向。方向取决于你在仓库里把哪一个设为自定义域名：

- 自定义域名设为 `www.example.com`，并为裸域和 `www` 都设置了官方要求的 DNS 时，`example.com` 会重定向到 `www.example.com`。
- 自定义域名设为 `example.com` 时，则 `www.example.com` 会重定向到 `example.com`。

官方还说明：为裸域创建新站点时，会尝试同时保护 `www`；为 `www` 配置时，会尝试保护对应裸域。但要用上另一种主机名，仍需你在 DNS 中写出对应记录。无法配置以 `www.www.` 开头的域名。自动跳转也适用于其它子域，例如 `www.blog.example.com` 与 `blog.example.com`。

因此，核对前先记下 Pages 设置里的那一个“主主机名”，再去看跳转方向是否与之一致，不要只凭个人偏好判断对错。canonical 和对外宣传的网址，应与这个最终主机名一致，而不是同时把两套网址当作规范地址。

## 3. 先核 DNS，再谈证书

官方建议在把自定义域名加入仓库之前先做域名验证，以降低接管风险；同时提醒：**应先在 GitHub Pages 设置中添加自定义域名，再去 DNS 服务商写入记录**。如果只在 DNS 里指向了 GitHub、却还没在自己的仓库里添加该域名，存在让其他人把站点托管到你的子域上的风险。验证是在账户或组织的 Pages 设置中添加域名，并按页面提示写入 TXT 记录，而不是写在某个仓库的 Settings 里。验证后请保留这条 TXT。官方给出的查询示例如下，必须替换用户名或组织名，以及域名：

```bash
dig _github-pages-challenge-USERNAME.example.com +nostats +nocomments +nocmd TXT
# 组织账户则把 USERNAME 换成 ORGANIZATION
```

官方强烈建议不要使用 `*.example.com` 这类通配符记录：即使已经验证了 `example.com`，通配符仍可能让更深层的子域被接管，例如 `b.a.example.com`。

对裸域，官方要求至少配置 `ALIAS` / `ANAME` 或一组 `A` 记录；若要支持 IPv6，再加 `AAAA`，并强烈建议 IPv6 场景下仍保留 `A` 记录。对 `www` 或其它子域，配置 `CNAME`，目标是 `USERNAME.github.io` 或 `ORGANIZATION.github.io`，**不要带仓库名，也不要指向仓库 Pages 设置里显示的那个唯一 `*.pages.github.io` 子域**。不要把子域 CNAME 到自己的裸域，官方写明这会给强制 HTTPS 带来问题，甚至让子域无法到达 Pages 站点。

核读日官方文档中的记录表如下（主机名与目标都必须换成你自己的值）：

| 场景 | 类型 | 名称 | 值 |
| --- | --- | --- | --- |
| 裸域 `example.com` | `A` | `@` | `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153` |
| 裸域 `example.com` | `AAAA` | `@` | `2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153` |
| 裸域 `example.com` | `ALIAS` 或 `ANAME` | `@` | `USERNAME.github.io` 或 `ORGANIZATION.github.io` |
| 子域 `www.example.com` 或 `blog.example.com` | `CNAME` | 对应子域 | `USERNAME.github.io` 或 `ORGANIZATION.github.io` |

官方还提醒：任意**额外的**、指向 `@` 的 `A` / `AAAA` / `ALIAS` / `ANAME`，或指向你想用于 Pages 的 `www` 及其它自定义子域的额外 `CNAME`，都可能阻止 HTTPS 证书生成。如果使用 CAA 记录，至少要有一条值为 `letsencrypt.org` 的记录，站点才能通过官方路径用 HTTPS 访问。这些约束针对 GitHub Pages 自己签发证书的流程；若公开解析并未直接指向上表，先不要按这张表去改生产 DNS，应先分清证书实际是在哪一层签发的。

只读查询示例来自官方文档，把 `EXAMPLE.COM` 换成自己的裸域：

```bash
dig EXAMPLE.COM +noall +answer -t A
dig EXAMPLE.COM +noall +answer -t AAAA
```

预期现象按所选配置分别判断（不是某一站点的实测）：若裸域直接采用 A 记录方案，核对官方列出的四个 IPv4 目标；若采用 ALIAS / ANAME，按 DNS 服务商行为核对其最终解析结果，不要求公开出现同名类型记录。只有启用 IPv6 时才核对上表四个 AAAA 目标；未配置 AAAA 本身不算错误。表中 GitHub 服务 IP 是官方目标值，不随占位域名任意替换。查询 `www` 时，官方示意为先看到指向 `YOUR-USERNAME.github.io` 的 CNAME，再解析到 Pages 的地址：

```bash
dig WWW.EXAMPLE.COM +nostats +nocomments +nocmd
```

Windows 上官方建议使用 `Resolve-DnsName`，或安装 BIND 以使用 `dig`。DNS 尚未传播完成时，不要反复增删记录，也不要急着判断证书签发失败。

## 4. 核仓库设置与发布根目录的 CNAME

在仓库 Settings → Pages 中查看：

- Custom domain 是否正是你决定对外使用的那个主机名，例如 `www.example.com` 或 `example.com`，而不是两者混填、也不是已停用的旧域。
- 保存自定义域名后，官方会启动自动 DNS 检查，通过后才会向 Let’s Encrypt 申请证书，并上传到负责 Pages TLS 终止的服务器。成功后，自定义域名旁边应出现勾选标记。过程可能需要一段时间；若保存后数分钟仍未完成，官方建议先 Remove 再重新输入并 Save，以取消并重启签发。启用 HTTPS 后，站点最多可能需要一小时才能通过 HTTPS 访问。
- Enforce HTTPS 需要管理员权限。官方写明：该项在配置后最多可能要 24 小时才可勾选。不要在证书尚未出现勾选时把“无法勾选”理解成界面故障。

若从分支发布，还要核发布源根目录（以及实际发布出来的网站根目录）的 `CNAME` 文件：

- 文件名必须是全大写的 `CNAME`。
- 只能包含一个域名，例如 `www.example.com` 或 `example.com`，不要写 `https://`，也不要一行写多个域名。多个域名要指向同一站点时，官方要求通过 DNS 服务商做跳转，而不是在这个文件里堆名单。
- 该域名在所有 GitHub Pages 站点中必须唯一。若提示域名已被占用，官方路径是先完成域名验证，而不是尝试绕过占用检查。

静态生成器把生成结果强制推送到发布分支时，很容易覆盖 GitHub 自动提交的 `CNAME`。官方明确写过这个故障：如果你在本地构建再推送生成文件，应先拉取那个添加了 `CNAME` 的提交，确保文件进入构建。只有最终 Pages Source 为 GitHub Actions 时才相反：不要依赖仓库里或产物里的 `CNAME` 来“纠正” Pages 设置，设置界面才是有效来源。

发布后可用只读命令查看网站根是否还公开了这个文件（把域名换掉）：

```bash
curl -sI https://www.example.com/CNAME
curl -sL https://www.example.com/CNAME
```

若文件存在，预期内容应是单一主机名。若最终托管仓库的 Pages Source 为 GitHub Actions，即使这里能读到文件，也不要把它解释为 GitHub 正在根据该文件生效。

## 5. 核 HTTPS 与强制跳转

在自定义域名旁边出现成功标记后，用只读命令核证书是否已被浏览器和客户端接受。下面命令必须把域名换成你自己的：

```bash
curl -sI https://www.example.com/
curl -sI https://example.com/
```

预期现象：你在 Pages 里设定的主主机名应返回成功的页面响应（通常是 200）；另一个主机名在 DNS 已按官方方式配对时，应返回指向主主机名的重定向（通常是 301），而不是证书错误或循环跳转。可用本机的证书查看命令核 SAN 是否覆盖这两个名字，例如：

```bash
echo | openssl s_client -connect www.example.com:443 -servername www.example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

预期现象：证书处于有效期内，并且涵盖你实际访问的主机名。GitHub Pages 官方路径是在 DNS 检查通过后向 Let’s Encrypt 申请证书。若你在证书链里看到的是其它颁发者，说明用户访问路径上可能还有其它 TLS 终止层；这可以作为观察结果记下来，但不要把它写成“官方要求更换颁发机构”，也不要为此绕过 Pages 的设置。

勾选 Enforce HTTPS 之后，官方的行为是把 HTTP 请求透明重定向到 HTTPS。核对此项时不要只打开已经跳转到 HTTPS 的书签，而要显式请求 HTTP：

```bash
curl -sI http://www.example.com/
curl -sI http://example.com/
```

预期现象：返回指向对应 HTTPS URL 的重定向，而不是在 HTTP 上直接给出完整站点，或出现证书无关的连接失败。若命令在中间代理、公司网关或本机拦截了 80 端口，结果可能不能代表站点真实行为，应换一个不受拦截的网络再测，并把不确定性写进核对记录，不要编造“已经强制跳转”或“没有强制跳转”。

官方还提醒域名整体长度：RFC3280 中 common name 最长 64 个字符，因此 GitHub Pages 站点的完整域名必须短于 64 个字符，否则证书可能无法签发。

如果 HTTPS 已启用，但 HTML 里的图片、CSS 或 JavaScript 仍写成 `http://`，就会出现混合内容，页面可能被浏览器警告或拦截部分资源。应按官方说明把这些资源改成 `https://`，不要用关闭强制 HTTPS 来“消除”警告。

## 6. 核 canonical 是否与最终主机名一致

跳转统一之后，打开**最终落地**的首页和至少一篇文章，查看：

```html
<link rel="canonical" href="https://www.example.com/">
```

以及如有输出时的 `og:url`。它们应使用与 Pages 主主机名相同的方案（`https`）和主机名，路径应是该页的规范路径。若 canonical 写着裸域，而站点把所有流量跳到 `www`，或反过来，搜索引擎会看到互相打架的信号。对 Hugo 而言，这项通常来自站点配置里的基础 URL，而不是临时改某一页的正文。改完后要重新发布，再抓一次已发布 HTML，不要只看本地未构建的源文件。

可用只读命令抽取（把 URL 换成自己的页面，注意不同站点的标签格式可能略有差异）：

```bash
curl -sL https://www.example.com/ | tr '>' '>\n' | grep -i 'rel="canonical"'
curl -sL https://example.com/ | tr '>' '>\n' | grep -i 'rel="canonical"'
```

第二条命令若先遇到重定向，应确认最终打印出的 canonical 仍指向跳转后的主主机名，而不是停留在被重定向的那一侧。

## 7. 可重复的只读检查命令（请替换域名）

把下面的 `www.example.com` 和 `example.com` 全部换成你的域名后再执行。先记录命令、时间（含时区）和原始输出，再下结论。

```bash
# DNS（预期值见第 3 节官方表示例）
dig example.com +noall +answer -t A
dig example.com +noall +answer -t AAAA
dig www.example.com +nostats +nocomments +nocmd
dig _github-pages-challenge-USERNAME.example.com +nostats +nocomments +nocmd TXT

# HTTPS 入口与跳转
curl -sI https://www.example.com/
curl -sI https://example.com/

# HTTP 是否被强制转到 HTTPS（若本机 80 端口被拦截，应改在其它网络复核）
curl -sI http://www.example.com/
curl -sI http://example.com/

# 发布根目录 CNAME（从分支发布时更有意义）
curl -sI https://www.example.com/CNAME
curl -sL https://www.example.com/CNAME

# canonical
curl -sL https://www.example.com/ | tr '>' '>\n' | grep -i 'rel="canonical"'
```

建议同时用浏览器的隐私窗口打开四个入口：HTTP / HTTPS × 裸域 / `www`，确认最终地址栏、锁标志和内容一致，并排除本地 DNS 缓存或旧的 HSTS 策略造成的错觉。刚变更域名时，官方也提到可能需要清除浏览器缓存才能访问新 URL。

## 8. 常见故障

**自定义域名旁边一直没有勾选，或提示证书尚未创建。** 先用 `dig` 对照第 3 节，而不是连续点击 Save。多余记录、错误目标、CAA 缺少 `letsencrypt.org`、DNS 尚未传播，都会挡住官方的 Let’s Encrypt 签发。按官方建议，在确认 DNS 无误后，可以 Remove 再重新添加以重启签发；配置后最多一小时站点才可能通过 HTTPS 访问。不要用自制证书替换，也不要尝试绕过这项检查。

**能解析但不能用 HTTPS，或只有一个主机名正常。** 检查是否只配了裸域或只配了 `www`。官方建议两者一起配置。把子域 CNAME 到裸域，而不是 `USERNAME.github.io`，也会破坏强制 HTTPS。

**页面打开在错误的主机名，或发布后自定义域名“丢了”。** 对于分支发布，优先怀疑 `CNAME` 被静态生成器的强制推送覆盖，或文件名、内容格式不正确。对于最终 Pages Source 为 GitHub Actions 的情况，改为检查工作流是否改动了 Pages 设置，而不是去“修”被忽略的 `CNAME` 文件。

**跳转方向与预期相反。** 回到 Pages 里填写的那个自定义域名：官方自动跳转以它为终点。若要改方向，应改设置中的主域名，并确认 DNS 两侧记录仍在，而不是只在生成器里改 canonical。

**提示域名已被占用。** 按官方说明，先完成账户或组织级的域名验证；验证你拥有、但正被其他人用于 Pages 的域名时，该域名会立即从他人的 Pages 站点释放。若该域名已被别人验证，释放不会成功。不要用更换大小写、添加空格或其它变形来绕过唯一性限制。

**浏览器里仍是旧域名或证书警告，命令行已经正常。** 先排除缓存、旧的 HSTS 以及本地 hosts。Linux 用户若访问的 `github.io` 默认域里用户名以连字符开头、结尾或包含连续连字符，官方还记录过会看到服务器错误，这与自定义域不是同一类问题，但在同时核默认域时可能被混淆。

## 9. 安全注意与回滚

自定义域名在站点停用后仍留在 DNS 里，会带来接管风险。官方列出的自动停用情形包括：从付费方案降级到 GitHub Free 导致私有仓库上的 Pages 被取消发布，或把私有仓库转到使用 GitHub Free 的个人账户。若域名尚未验证且站点已停用，应立即在 DNS 服务商处更新或删除相关记录。验证可以阻止其他 GitHub 用户把该域名（及其直接子域）用到他们的仓库上，但仍不要使用通配符记录。

回滚本次域名变更时，只撤销这一层，不要顺便改站点内容或其它服务：

1. 若只是要暂时停用自定义域名，官方路径是在仓库 Settings → Pages 的 Custom domain 处点击 Remove。删除后，站点会回到默认的 `USERNAME.github.io` 或项目页地址，具体以当前仓库类型为准。
2. 如果你同时改过 DNS，移除 Pages 中的自定义域名后，应评估是否还要把 A / AAAA / CNAME 留在 GitHub 的目标上。站点停用却保留这些记录，正是官方警告的接管场景。
3. 不要为了“尽快恢复访问”而改用通配符、把域名指到未核实的第三方，或关闭本机的证书校验来跳过警告。
4. 回滚后，重新执行第 7 节的只读命令，确认默认域或你打算保留的主机名可以访问，且旧的自定义域名不再错误地指向已停用的 Pages 站点。

DNS 变更与证书重建都可能需要等待，回滚不是即时开关。提前把当前 Pages 设置、有效 DNS 记录和 `CNAME` 内容记下来，再进行修改。

## 附录：一处公开站点的可见现象（不是配置教程）

以下是 2026-11-19（Asia/Bangkok）对公开网址 `https://mmfei.com/` 与 `https://www.mmfei.com/` 的只读观察，用来演示“清单可以怎么记结果”。它**不是**对该站点未公开 DNS 或仓库设置的还原，也**不表示**所有 GitHub Pages 站点都应照搬这些可见结果，更不能代替你对自己域名执行第 7 节。

当时能够确认的现象：

- 请求 `https://mmfei.com/` 返回 HTTP 301，`Location` 为 `https://www.mmfei.com/`。
- `https://www.mmfei.com/` 返回 HTTP 200；首页的 canonical 为 `https://www.mmfei.com/`，抽查的文章页 canonical 也使用 `www` 主机名。
- `https://www.mmfei.com/CNAME` 返回 200，正文是一行 `www.mmfei.com`。这只说明发布根目录公开了该文件，不能单独证明仓库使用“从分支发布”还是“从 Actions 发布”。
- 两边的 HTTPS 都可以建立；当时看到的证书由 Google Trust Services 签发，主题备选名包含 `mmfei.com` 与 `*.mmfei.com`。这与 GitHub Pages 文档中“向 Let’s Encrypt 申请证书”的官方路径并不相同，只能记录本次连接观察到的证书颁发者；仅凭这一差异不能确认具体 CDN、反代或 TLS 终止架构，不能把它写成 GitHub Pages 的通用设置步骤，也不应据此去改他人的 DNS。

初稿环境曾把 80 端口拦到内部代理，那次失败响应不能代表站点，只保留为初稿环境观察，不是当前结论。

其后两次只读补测没有登录仓库或 DNS 账户，也没有修改 DNS、证书或 Pages 设置：

- 2026-11-19 09:48（Asia/Bangkok）：只对 `http://www.mmfei.com/` 做了 HEAD（`curl -svI`）。首个响应是 `HTTP/1.1 200`，响应头没有 `Location`。这次没有下载正文。
- 2026-11-19 14:35（Asia/Bangkok）：对 `http://mmfei.com/`、`http://www.mmfei.com/`、`https://mmfei.com/`、`https://www.mmfei.com/` 分别做了不跟随跳转的 HEAD 和 GET。`http://mmfei.com/` 的 HEAD 与 GET 都是 `301`，`Location` 为 `http://www.mmfei.com/`，GET 正文是一段很短的 301 页面，不是站点首页。`http://www.mmfei.com/` 的 HEAD 与 GET 都是 `200`，响应头没有 `Location`，`Server` 为 `cloudflare`；GET 正文开头是站点首页 HTML。`https://mmfei.com/` 的 HEAD 与 GET 都是 `301`，`Location` 为 `https://www.mmfei.com/`。`https://www.mmfei.com/` 的 HEAD 与 GET 都是 `200`。这些只描述上述连接看到的响应。没有打开仓库 Settings → Pages，因此不能确定 Enforce HTTPS 开关是开启还是关闭；观察到 HTTP 200 也不等于该开关已关闭。

这次补测仍不是对某个演练域名完整走一遍“改 DNS、等证书、开强制 HTTPS”。读者应在自己的网络上重测第 5 节，不要把某一次观察当成所有网络的结果。

## 官方参考

- [About custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
- [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Troubleshooting custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)
- [Verifying your custom domain for GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)

