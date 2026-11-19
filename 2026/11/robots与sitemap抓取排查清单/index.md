# robots.txt 与 sitemap 不是收录开关：静态博客的抓取排查清单


把文章放进 sitemap，再在 robots.txt 写一句 Allow，并不能保证 Google 收录。前者提供发现网址的线索，后者表达爬虫能否抓取；页面是否被抓取、如何被索引，还受页面响应、索引指令、重复内容和搜索引擎判断影响。

这篇清单解决的是“静态博客发布后，从哪里开始排查”，不是承诺收录或排名。适用于 Hugo 等生成静态 HTML 的博客，也适用于从其他生成器发布的站点；不要求安装 SEO 插件。官方资料核读日期为 2026 年 11 月 19 日。文末列出本次实际只读观察，其他配置片段是说明用途的示例，**没有修改任何站点配置，也没有验证 Google 的实际抓取或收录**。

## 先分清三个问题

| 问题 | 该检查什么 | 不能由此推出什么 |
| --- | --- | --- |
| 搜索引擎能不能发现网址 | 内链、sitemap、已知外部链接 | 被发现不等于已抓取 |
| 对应爬虫是否允许抓取 | 此协议、主机和端口的 robots.txt，以及访问状态 | 允许抓取不等于已收录 |
| 页面是否允许进入索引 | HTML robots meta、HTTP X-Robots-Tag、页面内容及规范网址 | 没有 noindex 也不保证收录 |

私密资料要依靠鉴权与访问控制，不能靠 robots.txt 保密。Google 官方明确说明：被 robots.txt 禁止抓取的网址仍可能以仅有 URL 等形式出现在搜索结果中。

## 1. 先保存响应，不从配置源文件猜线上状态

准备终端中的 curl。下面以自己的站点为目标；`www.example.com` 是示例域名，不是需要照抄检查的真实业务站点。命令创建一个新的本地临时目录，只保存响应，不修改站点：

```bash
SITE='https://www.example.com'
WORK="$(mktemp -d)"
printf '检查文件目录：%s\n' "$WORK"
curl --fail --show-error --silent --location --max-time 30 \
  --dump-header "$WORK/robots.headers" \
  --output "$WORK/robots.txt" "$SITE/robots.txt"
curl --fail --show-error --silent --location --max-time 30 \
  --dump-header "$WORK/sitemap.headers" \
  --output "$WORK/sitemap.xml" "$SITE/sitemap.xml"
```

分别检查每条命令是否成功；失败时先处理网络、TLS 或 HTTP 错误，不继续把旧文件当新结果。用文本编辑器打开打印的目录，核对最终响应及文件内容：

- robots.txt 应是根路径的纯文本，而不是 HTML 错误页或登录页。
- sitemap 应是正确 XML，而不是站点首页。状态 200 也可能对应错误内容。
- 若经过跳转，留意保存的响应头包含多段响应；最后一段才是最终响应。
- CDN 可能缓存旧内容。比较响应头、正文与发布记录，不能仅凭一次请求就认定所有边缘节点一致。

`curl -I` 只请求响应头；排查这里的问题需要正文，因此示例使用 GET 保存完整响应。不要加跳过证书验证的参数来掩盖证书故障。

## 2. 从最小 robots 示例理解作用域

对确实准备公开、没有额外限制的站点，说明性示例如下：

```text
User-agent: *
Allow: /

Sitemap: https://www.example.com/sitemap.xml
```

这不是让你覆盖现有文件的通用配方。有具名爬虫分组、站点特定路径或既有策略时，必须先保留并理解它们。未被限制的路径默认可抓取，示例中的 Allow 不是某种“主动提交”操作。`Sitemap` 应填写完整绝对网址。

robots 的规则作用于其所在的协议、主机和端口。`https://example.com/robots.txt` 不能直接代表 `https://www.example.com/robots.txt`，更不能代表其他子域。检查读者实际访问的规范主机，同时核对其他入口的跳转。

不要看到文件里出现 `Disallow: /css/` 就断言 Googlebot 一定被屏蔽：先确认该规则属于哪个 User-agent 分组。反过来，也不能因为通用组放行就忽略具名组。涉及复杂匹配时，以目标爬虫的官方规则及相应测试工具为准；字符串搜索不能代替完整解析。

Google 提醒，不要阻止其理解页面所需的脚本、样式和图片。是否需要放行某个资源目录，应基于页面渲染依赖与目标爬虫判断，而不是为了缩短文件统一删除所有规则。

## 3. sitemap.xml 可能是索引，而不是文章列表

打开 XML 时先看根节点。本例只展示格式，不是某个站点的实际清单：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.example.com/zh-cn/sitemap.xml</loc>
  </sitemap>
</sitemapindex>
```

根节点是 `sitemapindex` 时，里面列的是子站点地图；要继续读取相应子文件。不能因为根文件里找不到文章标题或网址，就说“文章没进 sitemap”。根节点是 `urlset` 时，才是在查看页面 URL 集合。

逐项检查：

1. 子 sitemap 可访问、能解析，不是 404 或 HTML 错误页。
2. 文章网址是预期的绝对 HTTPS 地址，主机名与规范网址一致。
3. 清单主要包含希望被索引的真实页面，而不是空壳语言目录、已删除页面或跳转入口。
4. 不把有意 noindex 的页面继续当作重点索引候选提交；统一页面目标与生成规则。
5. `lastmod` 反映实质内容更新，不要每次构建都批量刷成当天。Google 表示只有持续准确时才会使用它，并忽略 `priority` 和 `changefreq` 的值。

Google 文档规定单个 sitemap 最多 50,000 个 URL、未压缩大小最多 50MB；超过时拆分并用索引组织。小博客通常先核对内容一致性，比调整优先级字段更有意义。

## 4. 不要把 Disallow 和 noindex 当成双保险

假设一个可公开访问的测试页面不想出现在搜索中，可以在 HTML 的 head 中声明：

```html
<meta name="robots" content="noindex">
```

但如果同时在 robots.txt 禁止爬虫读取它，爬虫可能根本看不到这条指令。Google 明确要求：要让 noindex 生效，页面必须能够被相应爬虫访问。也不要把 `Noindex:` 写进 robots.txt，Google 不支持用这种写法控制索引。

PDF 等非 HTML 资源可用 HTTP `X-Robots-Tag` 响应头表达索引规则；纯静态托管平台是否能配置这个响应头，要看平台能力，不能假设写一个 HTML meta 就会影响 PDF。

若涉及私密资料，先限制访问。若涉及已上线目录下线、语言版本删除或生产索引策略变更，先确认业务范围，不为排查方便直接整目录屏蔽。

## 5. 看到什么现象，下一步查什么

| 现象 | 优先检查 | 不要直接做 |
| --- | --- | --- |
| sitemap 200，但文章不在根文件 | 根节点及子 sitemap | 手工把所有子链接堆进 robots |
| 浏览器能打开，爬虫仍无法读 | WAF、鉴权、限速、robots 与实际爬虫错误证据 | 宣称 Allow 能绕过服务器拦截 |
| 添加 noindex 后仍在搜索出现 | 是否可抓取、是否已重抓、响应中的实际指令 | 再加 Disallow 阻止读取指令 |
| sitemap 中有空语言站 | 对应页面是否真实有内容、生成器多语言配置 | 直接删除整个语言目录 |
| 发布后线上文件没变 | 构建产物、发布目录、缓存与最终主机 | 连续改几处配置后失去定位依据 |

有 Search Console 权限时，再用对应的 sitemap、robots 和网址检查结果确认 Google 看到什么。没有权限时，只能写“公开响应已核对”，不能把 `site:` 搜索结果或 GA4 流量当作完整收录清单。提交 sitemap 是提示，不保证下载、抓取或收录。

## 本次只读观察与边界

2026 年 11 月 19 日 14:08（曼谷时间），本次从公开地址读取本博客的 robots 与根 sitemap，均返回 200；robots 包含 www 主机的 sitemap 入口，根 sitemap 的根节点是 `sitemapindex`，列出 `/en/sitemap.xml` 与 `/zh-cn/sitemap.xml`。

这只验证了当时这两个公开文件的响应与结构，没有在本次步骤递归审完子 sitemap，也没有核验英文站内容质量、真实爬虫访问或索引情况。本文不把“根文件包含某个语言 sitemap”直接判为错误；要与该语言页面的实际内容和站点发布目标一起判断。

## 修改与回滚边界

需要修改时，把 robots、sitemap 生成规则和页面索引指令放在一个可复核的变更范围内，但只改确认有问题的部分。发布前比较生成产物，发布后重新请求线上文件。若误屏蔽，回退对应提交并复核缓存后的实际内容；回滚配置并不意味着搜索索引会立即恢复。

本文示例只读取公开地址。它不需要云平台密钥、Google Cookie 或生产数据库凭据，不要为了“验证收录”把这些内容交给第三方工具。

## 官方参考

- [robots.txt 的用途和限制](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [创建 robots.txt：位置、作用域和规则](https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt)
- [构建和提交 sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [使用 noindex 阻止索引](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

