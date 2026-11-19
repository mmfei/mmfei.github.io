# 博客分页的 canonical 怎么写：别把第二页都指向第一页


文章归档第二页展示的是另一批文章，却把 canonical 写成第一页，这不是简单的“集中权重”：它向搜索引擎发送了与分页内容不一致的规范化信号。

Google 的分页文档明确建议：分页序列中每页使用独立网址，并各自声明 canonical，不要统一指向第一页。本文讨论包含不同条目的博客归档与分类分页，不把筛选排序变体、打印版或跟踪参数页混在一起。

> 适用范围：服务端或静态生成的 HTML 列表页。官方资料核读于 2026 年 11 月 19 日。下面的本地核对脚本只检查输入 HTML 中的声明与链接，不模拟 Google 渲染、规范网址选择或搜索排名。本文没有改线上模板。

## 1. 分页内容不是天然重复内容

以示例站点为例：

| 页面 | 内容 | 预期 canonical 示例 |
| --- | --- | --- |
| `/posts/` | 较新一批文章 | `https://www.example.com/posts/` |
| `/posts/page/2/` | 再早一批文章 | `https://www.example.com/posts/page/2/` |
| `/posts/page/3/` | 更早一批文章 | `https://www.example.com/posts/page/3/` |

表中的域名和路径仅用于解释规则，不能直接写进自己的站点。若实际路径使用 `?page=2`，同样可以有独立网址，不必为了 SEO 强行改成目录形式。

canonical 适合在重复或高度相似页面之间表达首选版本；它不是重定向，也不是禁止抓取的指令。Google 会综合多个信号选择规范网址，页面写了声明不等于 Google 一定接受。

分页列表有不同文章，不应只因模板外观相同，就全部合并到第一页。相反，如果 `/posts/page/1/` 与 `/posts/` 确实是同一份内容，这两个入口才需要一致的规范化处理，具体使用已有路由的重定向或 canonical 机制，应在确认托管能力与兼容性后选择。

## 2. 每页同时满足三个条件

### 条件一：能直接访问独立 URL

复制第二页网址，在新的访问环境中直接打开，应能得到第二页内容，而不是必须先点第一页按钮。不要只用 `#page=2` 表示不同分页：Google 通常忽略 URL fragment，不能把它当作独立可抓取分页地址。

还要检查空页和越界页。一个根本不存在的第 999 页如果返回首页内容和 200，问题不是简单补一个 canonical 就结束；先明确路由对无效分页的处理。

### 条件二：有可以跟随的翻页链接

静态 HTML 示例：

```html
<a href="/posts/">第一页</a>
<a href="/posts/page/3/">下一页</a>
```

Google 通常从锚点的 href 发现网址，不会像读者那样主动点击一个需要交互才加载数据的按钮。无限滚动或“加载更多”需要另外提供可抓取的分页路径与发现机制；本篇不能替代完整的 JavaScript 渲染审计。

Google 已不再使用 `rel="next"` 与 `rel="prev"` 理解分页关系。保留这些标签可能仍服务其他工具，但不能把添加它们当成 Google 已发现全部文章的证据。真正的页面链接和内容可访问性仍要检查。

### 条件三：head 中的 canonical 与本页一致

第二页的说明性示例：

```html
<link rel="canonical" href="https://www.example.com/posts/page/2/">
```

使用完整绝对地址，避免同时由主题、插件和自定义模板输出几份互相冲突的 canonical。第一步是定位最终 HTML，不是先在三个地方都加一遍。

## 3. 先下载一页，再检查声明

需要 curl 和 Python 3。先把下列站点名换成自己的；文件输出放在新临时目录，不覆盖已有项目文件：

```bash
URL='https://www.example.com/posts/page/2/'
WORK="$(mktemp -d)"
curl --fail --show-error --silent --location --max-time 30 \
  --dump-header "$WORK/page.headers" \
  --output "$WORK/page.html" "$URL"
printf '检查目录：%s\n' "$WORK"
```

先确认 curl 成功，查看响应头中的最终状态和跳转。若最终到了第一页，先解决访问路径问题，不用第二页的预期 URL 去强行“验过”第一页内容。

把下面代码保存为临时目录里的 `check_head.py`。它只读本地文件，不访问网络、不执行页面脚本，也不会修改 HTML：

```python
import sys
from html.parser import HTMLParser
from pathlib import Path

class PageHead(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.canonicals = []
        self.robots = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "head":
            self.in_head = True
        if not self.in_head:
            return
        if tag == "link":
            rels = values.get("rel", "").lower().split()
            if "canonical" in rels:
                self.canonicals.append(values.get("href", ""))
        if tag == "meta" and values.get("name", "").lower() in ("robots", "googlebot"):
            self.robots.append(values.get("content", ""))

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False

if len(sys.argv) != 3:
    raise SystemExit("用法：python3 check_head.py 本地HTML文件 预期绝对canonical")

page = PageHead()
page.feed(Path(sys.argv[1]).read_text(encoding="utf-8"))
print("canonical:", page.canonicals)
print("robots meta:", page.robots)
if page.canonicals != [sys.argv[2]]:
    raise SystemExit("未通过：不是唯一且符合预期的 HTML head canonical")
print("通过：仅表示 HTML head canonical 与输入预期一致")
```

运行时，用 curl 请求后的**实际最终地址**作为预期值；下面仍是示例：

```bash
python3 "$WORK/check_head.py" "$WORK/page.html" \
  'https://www.example.com/posts/page/2/'
```

通过的含义很窄：恰好找到一个 head canonical，字符串与输入一致。它没有核对 HTTP `Link` 头中的另一份 canonical、HTTP `X-Robots-Tag`、JavaScript 运行后改写的内容，也不验证 URL 的业务正确性。若站点用这些机制，需要进一步检查对应响应或渲染结果。

该脚本按常规完整 HTML 编写；文件不是 UTF-8、HTML 残缺或省略 head 时，先处理输入条件。不要用一个简易解析脚本证明所有浏览器与爬虫都能正确理解页面。

## 4. 排查静态生成器的模板问题

不必立刻写一套新模板，先定位已有 canonical 是谁输出的：

1. 在归档第一页、第二页和一个普通文章页的最终 HTML 中各查一次。
2. 检查布局、SEO partial 或插件是否有重复输出。
3. 查看列表分页上下文拿到的是当前分页地址，还是列表集合第一页地址。
4. 只修负责该输出的入口，再生成静态产物复核。
5. 对分类分页单独回归，不能因文章归档修好就假定分类也走同一分支。

生成器版本和主题上下文不同，不应把“某个变量始终代表当前分页”当作跨主题保证。需要修改 Hugo 模板时，应以实际项目的分页对象和构建结果为准；本文提供验收逻辑，不提供未经当前主题验证的万能 Go 模板替换。

## 5. 排序筛选页为什么要另看

`?sort=date`、标签筛选和 `?page=2` 不是同一类问题。排序可能只是同一集合的不同顺序，筛选也可能形成有独立价值的集合，是否索引要结合内容、内链规模和业务目的决定。

不要把本篇的“分页自引用”机械扩展成“所有参数变体都自引用”，也不要把“不希望索引的筛选页”策略反过来套在所有分页上。robots、noindex、canonical 各有用途，不能相互替代。

Google 文档还说明：同一个分页序列的各页可以使用相同标题和描述。因此第二页没有单独改描述，不等于违反分页建议。若要增加页码以便读者识别，可以做，但不能把每页改几个字当成分页问题已解决。

## 6. 本次检查实际覆盖了什么

2026 年 11 月 19 日 14:08（曼谷时间），本次只读获取本博客 `/posts/` 与 `/posts/page/2/`，两者均返回 200。解析保存的 HTML，分别找到唯一的对应 www 自引用 canonical，两页中均存在指向文章归档分页的锚点链接。

文中的核对脚本另外用本地 HTML 样本检查通过与失败分支，并用于上述两份保存的 HTML。该结论不等于已对所有分类、全部页码、HTTP 规范头或浏览器交互做全站验证，更不等于 Google 已选用声明中的规范网址。

## 验收和回滚清单

发布分页模板改动前后，至少抽查归档第一页、中间页、末页、一个分类分页和普通文章页；核对状态、不同文章条目、翻页 href 和唯一 canonical。不要为了修分页改变旧文章永久链接。

若出现所有分页 canonical 相同、分页断链或文章页 canonical 被误改，回退对应模板改动并重新生成；随后检查线上响应，而不是只看构建成功。模板修复与搜索系统重新处理有时间差，别以短期排名作为唯一的发布验收。

## 官方参考

- [Google 分页与增量加载最佳实践](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
- [指定 canonical 的方法与限制](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

