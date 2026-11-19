# Hugo 静态博客接入 Pagefind：构建时生成索引并挂上搜索框

静态托管上的博客通常没有可查询的服务端，把全文搜索交给第三方接口又会引入额外依赖。Pagefind 的做法是：在静态站点生成器完成构建之后，扫描输出目录里的 HTML，生成一份可以一起发布的静态搜索包；浏览器只请求这份包，不必再访问搜索 API。本教程说明如何在 Hugo 站点上安装、在本地或 CI 中生成索引、把搜索界面挂到公共模板，以及如何核验、排错和回滚。

> 适用范围：能修改 Hugo 公共模板，并且可以在 `hugo` 生成 `public/` 之后追加一条索引命令的站点。资料核读日期为 2026 年 11 月 19 日（Asia/Bangkok）。索引命令按 `pagefind@1.6.0` 核对；同日 npm 上该包的 `latest` 标签也是 `1.6.0`。官方文档从 1.5.0 起把 Component UI（`pagefind-component-ui.js`）作为推荐界面，并写明它取代 Default UI（`pagefind-ui.js` / `PagefindUI`）；1.6.0 仍会生成两套资源，Default UI 的说明页也还在。下文以核读日官方文档为准：新接入优先用 Component UI，同时给出仍被文档收录的 Default UI 写法，便于对照已有站点。若你核读时官方最新版或推荐界面又有变化，以当时文档为准，不要把本文冻结成唯一做法。文中命令输出都是官方描述或预期现象。**未在本文环境实测完整接入**，也没有用隔离环境跑通一次从构建到发布的搜索闭环。

## 环境与边界

以会把站点输出到 `public/` 的 Hugo 为例，版本可对照 `hugo version`。当前许多静态博客仍使用 Hugo extended（例如 0.83.1 extended）；只要构建产物是静态 HTML，Pagefind 并不依赖某个 Hugo 小版本。需要已安装 Node.js 以便使用官方 npm 包装命令，或者改用官方文档中的 Python 包装、预编译二进制或源码安装。还需要能修改主题或站点的 layouts，把搜索界面写进全站模板，而不是把脚本粘进可能被转义的 Markdown 正文。

本篇是通用教程，不是某个私有仓库的变更日志，也不展示任何密钥、令牌或私有工作流。若主题已经自带基于 Fuse.js 等方案的前端搜索，接入前先确认不要同时露出两套搜索框。示例路径、域名和仓库名都是占位符，必须换成自己的值。

## 1. 为什么用纯静态搜索

Pagefind 官方把它定位为静态生成器跑完之后的后处理步骤：它读取已经生成好的 HTML，在站点输出目录里写出一个搜索包（默认是 `public/pagefind/`），里面包含浏览器脚本、样式和索引文件。搜索发生在读者的浏览器里，Pagefind 本身没有服务端组件。官方还说明，`--serve` 只是“先生成索引，再用任意静态服务器预览”的快捷方式，并不等于上线后还要跑一个搜索服务。

这对 GitHub Pages 这类只发布静态文件的托管是匹配的：索引和页面一起发布，构建完成后不必再申请搜索服务、也不必在运行时把读者的查询发到第三方。相对地，如果只在主题里放一个每次打开页面都下载整站词库的客户端方案，站点变大后体积和相关度都会更难控制；如果把搜索交给外部 API，则多了一层账号、配额和隐私暴露面。选择 Pagefind，意味着你接受“每次发布都要重新生成索引”，并用发布产物是否包含 `pagefind/` 来判断搜索能不能用。

## 2. 安装并在本地生成索引

官方推荐用包装包来安装。通过 `npx` 运行时，会下载对应平台的二进制，而且**始终使用 `pagefind_extended`**。官方写明：扩展版体积更大，但包含中文、日文、泰文这类不能靠空白分词的语言支持。中文站点不要改用精简的非 extended 二进制。锁定版本时，把官方示例里的标签换成你要核验的版本：

```bash
# 先生成静态站点。默认输出目录是 public/
hugo --minify

# 锁定 1.6.0；--yes 用于非交互环境自动确认 npx 安装
npx --yes pagefind@1.6.0 --site public
```

`--site` 必须指向**已经构建完成的 HTML 目录**。官方文档也以 Hugo 的 `public` 为例。不要对源码目录 `content/` 或未构建的开发服务器内存页做索引。官方安装页的版本示例写作 `npx pagefind@v1.1.1`；2026-11-19 在 npm 上核到的发布号是 `1.6.0`，没有 `v1.6.0` 这个标签。本文因此使用 `pagefind@1.6.0`。若你执行时提示找不到包，先到 npm 核对该版本的实际标签，不要改用来路不明的镜像包。

命令成功后，官方描述会看到类似下面的摘要（数字随站点变化，这是官方示例，不是本文实测）：

```text
Indexed 2496 pages
Indexed 22852 words
Indexed 0 filters
Created 27 index chunks
Finished in 2.357 seconds
```

同时，`public/pagefind/` 会被写出来。官方称这个目录是搜索包，既包含浏览器依赖，也包含检索所需的索引。本地可用下面的只读检查确认目录在，但**把列出文件当成“已经验证搜索可用”是不够的**：

```bash
ls public/pagefind
# 预期现象：至少能看到 pagefind.js、pagefind-entry.json，
# 以及界面资源（1.6.0 预期同时包含 Component UI 与 Default UI 的 js/css）
```

`pagefind-entry.json` 里有版本和语言列表，可用于确认这次索引用的是不是 1.6.0、检测到了哪些 `lang`。不要把这份文件里的哈希或页面计数抄进文档当成固定值。

只跑 `hugo server` / `hugo serve` 通常看不到可用搜索。官方明确写过：开发服务器不会先写出完整的构建产物，Pagefind 必须索引构建输出。本地预览应先构建，再让 Pagefind 索引；需要立刻查看时，可加上官方的 `--serve`（不要在 CI 或生产发布里加这个参数）：

```bash
hugo --minify
npx --yes pagefind@1.6.0 --site public --serve
```

官方说预览服务“likely on :1414”，实际端口以命令输出为准。也可用任意静态服务器指向已经包含 `pagefind/` 的 `public/`，效果相同。`--serve` 时官方还会提供 playground；默认情况下，不加 `--write-playground` 不会把 playground 写进将要上线的产物，这是预期行为。

## 3. 在 CI 中生成索引，并确保索引进入发布产物

上线时必须在**每次构建之后、发布之前**再跑一遍同样的索引命令，而且发布步骤必须把 `public/pagefind/` 一并带上。漏掉任何一段，页面上就会出现搜索框却加载不到索引。下面用 GitHub Actions 举例，只使用 GitHub 官方的 `actions/checkout` 与 `actions/setup-node`，并在“已有 Hugo 构建步骤”之后追加 Pagefind。工作流里的运行器、Hugo 安装方式和发布动作请按你现有流水线填写；**不要把这段示例理解成完整可复制的发布工作流，也不要在工作流里写入任何密钥或密钥名称**。主版本号以编写当日官方说明为准。

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"

      # 此处保留你现有的 Hugo 安装与构建步骤，必须已经生成 public/
      # - name: Build site
      #   run: hugo --minify

      - name: Generate Pagefind index
        run: npx --yes pagefind@1.6.0 --site public

      # 下一跳必须发布完整的 public/，其中包含 public/pagefind/
```

核对发布流水线时，重点看三件事：索引步骤是否发生在 `hugo` 之后；发布的是不是构建目录的完整内容，而不是只拷了 `public` 里的部分子目录；是否有忽略规则把 `pagefind/` 排除在制品之外。如果有人把一次本地生成的 `pagefind/` 复制进 `static/` 以求“开发服务器也能搜”，索引会在下次发文后过期，也不要把它当成正式做法。

## 4. 把搜索界面挂到 Hugo 模板

官方入门把界面写进页面，是为了构建时 HTML 里已经有挂载点。1.5.0 之后，官方推荐的 Component UI 写法如下，样式和脚本会在索引时写进 `/pagefind/`：

```html
<link href="/pagefind/pagefind-component-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-component-ui.js" type="module"></script>

<pagefind-modal-trigger></pagefind-modal-trigger>
<pagefind-modal></pagefind-modal>
```

注意官方脚本带有 `type="module"`。把这段放进站点公共布局，例如 `layouts/partials/pagefind.html`，再在页脚或公共头尾的模板里引入，这样文章页和列表页都能用。不要把脚本写进 Markdown 正文。路径如果不是站点根路径，见下文的 `bundle-path` / `bundlePath`。

仅创建 `layouts/partials/pagefind.html` 不会自动渲染。还需要在实际参与构建的公共布局中调用它一次。先核对主题文档与模板调用链：若主题提供页脚扩展钩子，在站点自己的 `layouts/` 中实现该钩子并放入下面这一行；否则在站点覆盖的公共布局中、`</body>` 前合适位置调用。不要直接修改 `themes/`，也不要假定所有主题都有同名钩子。

```go-html-template
{{ partial "pagefind.html" . }}
```

上面调用位于公共布局上下文，`.` 是当前页面上下文；partial 内放第一个 HTML 代码块的资源标签与两个自定义元素。不要同时在 `baseof.html`、页脚及每篇文章模板重复调用。若主题有自己的覆盖机制，应按该主题实际文件名集成，不要新建一个只含此调用的 `baseof.html` 覆盖完整页面。构建后检查文章页和列表页的 HTML：搜索触发器与 modal 各出现一次，脚本与样式未重复引入；再做浏览器检索验证。仅检查模板文件存在不算入口生效。

Default UI 在 1.6.0 里仍然随搜索包生成，官方“Using the Default UI”页仍给出如下写法。新接入应按核读日文档优先用 Component UI；若维护的是已经在用 Default UI 的站点，也可以继续对照这一段，但要清楚它已被官方标注为被取代的界面：

```html
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>

<div id="search"></div>
<script>
  window.addEventListener("DOMContentLoaded", function () {
    new PagefindUI({ element: "#search", showSubResults: true });
  });
</script>
```

Default UI 的文案会尝试按页面语言选择内置翻译，找不到时回退到英文。需要中文提示时，可按官方说明传入 `translations`。官方还提供 `showImages`、`showSubResults`、`highlightQuery` 等选项，完整列表见 [Pagefind UI 配置](https://pagefind.app/docs/ui/)。站点如果位于子路径，结果链接可能需要设置搜索配置里的 `baseUrl`；若控制台提示无法检测包路径，再按官方说明显式设置 `bundlePath`（Default UI）或 `<pagefind-config bundle-path="...">`（Component UI）。多数情况下，包路径会从脚本 URL 自动检测，不必先改。

你可以用自己的按钮去打开官方提供的搜索框或模态框，这属于模板层的展示问题。只要最终加载的是构建产物里的官方资源，并且挂载点存在即可。不要把某一站点的私有覆盖层样式当成必须步骤。

若当前主题已经在菜单里插入了搜索按钮，应关掉或替换主题自带搜索，避免两个入口、两套脚本同时工作。改模板后重新执行“构建 + 索引”，再用静态服务器打开，而不是只刷新 `hugo server`。

## 5. 中文分词、语言属性和排除页面

官方建议为 `<html>` 设置正确的 `lang`，索引会按该属性为每种语言单独建索引；浏览器里初始化时也读取同一属性，只检索对应语言。中文页面应使用 `zh`、`zh-cn` 或 `zh-tw`（大小写以你站点生成的 HTML 为准，但必须稳定、一致）。如果部分页面漏写、或中英文 `lang` 混用且不符合预期，结果会落在不同索引里，表现为“明明有这篇文章却搜不到”。若你希望全站共用一个索引，官方提供 `--force-language`（配置键 `force_language`），传入 ISO 639-1 代码，例如 `zh`；这会忽略自动检测。

中文、日文、泰文的专门支持只存在于 extended 发行版，`npx pagefind` 默认就是这个版本。官方说明：这些语言目前没有词干化（stemming），但对没有空格分隔的文本做分词。官方例子：页面标记为中文时，`每個月都` 会被切成包含 `每個`、`月`、`都` 的词；在浏览器里单独搜这些词可以命中，搜 `每個月都` 会先分词再匹配各词；搜 `每個 月 都` 是各词任意顺序；用引号搜 `"每個 月 都"` 则要求精确匹配 `每個月都`。若中文完全不能按词检索，先核对是不是误用了非 extended 二进制，再核对 `lang` 是否被识别为中文。

控制“哪些内容进索引”应使用官方的 HTML 标记或 CLI 选项，而不是事后删文件：

- 默认从 `html` 根开始索引。把正文容器标成 `data-pagefind-body` 后，**只要全站任何页面出现了这个属性，没有该属性的页面就不会被索引**。这常用来只收录文章、排除首页或标签页；若希望首页也能搜到，就要同样加上该属性。
- 单段内容可用 `data-pagefind-ignore`（默认为 `index`：不进正文索引，但仍可能提取标题、图片或元数据）。需要连同元数据一起忽略时，使用 `data-pagefind-ignore="all"`。
- 不想改模板时，可用配置文件的 `exclude_selectors`，或 CLI 的 `--exclude-selectors`。官方提醒：命令行和环境变量一次只接受一个选择器参数，但可以用逗号写成组合选择器。
- `--glob` 默认是 `**/*.{html}`，可用来限制读入哪些 HTML。
- 导航、脚本、样式等组织性元素官方会默认跳过，不必再全部手工排除。

这些规则在构建时生效。页面上的 `noindex`、`robots.txt` 或“请勿收录”说明，**不会自动阻止 Pagefind 扫描已经生成到 `public/` 的 HTML**。不想被搜索到的内容，正确做法是不要把它发布进构建产物，或按上面的方式排除。

## 6. 验证方法

本节给出的是可重复的核对步骤和预期现象，**不是本文已经跑通的实测记录**。未在本文环境执行完整的 Hugo 构建、Pagefind 索引、本地检索和发布闭环。

构建并索引后，先在产物里确认搜索包：

```bash
test -f public/pagefind/pagefind.js
test -f public/pagefind/pagefind-entry.json
# 新接入 Component UI 时，还应确认下面两个文件存在：
test -f public/pagefind/pagefind-component-ui.js
test -f public/pagefind/pagefind-component-ui.css
```

查看 `pagefind-entry.json` 的 `version` 是否为 `1.6.0`，`languages` 是否包含你在 HTML 里设置的语言，页面计数是否和预期收录范围大致相当（例如你用 `data-pagefind-body` 只索引文章时，计数不应接近“所有列表页 + 标签页 + 文章”的总和）。然后用 `--serve` 或静态服务器打开站点，在搜索框输入一篇文章里独有的短语，预期能看到对应结果；再输入一段不应被索引的导航重复文本或已排除页面的内容，预期不应作为有效结果出现。打开浏览器开发者工具，确认 `/pagefind/` 下的脚本、样式和索引请求不是 404，控制台没有包路径检测失败的警告。

发布后，把下面命令里的域名换成自己的站点：

```bash
curl -sI https://www.example.com/pagefind/pagefind.js
curl -sI https://www.example.com/pagefind/pagefind-entry.json
curl -sI https://www.example.com/pagefind/pagefind-component-ui.js
curl -sI https://www.example.com/pagefind/pagefind-ui.js
```

预期现象是这些具体文件返回成功的 HTTP 状态（通常是 200）和对应的 JavaScript / JSON / CSS 类型。`https://www.example.com/pagefind/` 这个目录 URL 本身可能返回 404，因为发布目录里通常没有 `pagefind/index.html`；这不等于索引缺失，要以具体文件为准。

## 7. 常见故障

**搜索框在，结果为空或脚本 404。** 先看发布产物，而不是只看源码仓库。常见原因是 CI 先发布后索引、发布步骤没带上 `pagefind/`、忽略规则排除了该目录，或本地一次索引没有进入生产构建。回滚或修复后要重新构建并发布，不要只清浏览器缓存就下结论。

**路径不对。** 站点如果发布在 `https://www.example.com/blog/` 这类子路径，却仍写绝对路径 `/pagefind/...`，浏览器会去域名根下加载。应按实际公共 URL 调整资源路径，并在需要时设置官方的 `bundlePath` / `bundle-path` 和 `baseUrl`。模板里的路径与真实发布路径必须一致。

**中文搜不准或完全搜不到。** 核对是否使用 extended（`npx` 默认是），`lang` 是否为 `zh` / `zh-cn` / `zh-tw`，以及是否误把中文页标成 `en`。不要指望中文有英文那样的词干化。

**部分页面失踪。** 一旦启用 `data-pagefind-body`，未标记的页面会被全部排除，这是官方设计，不是偶发 bug。标签页、关于页、首页若需要可搜，要显式加上，或收紧/放宽 glob。

**排除没有生效。** `data-pagefind-ignore` 默认仍可能提取标题或元数据；要彻底排除需 `all`。命令行 `--exclude-selectors` 不能像 YAML 列表那样重复多次传一组值，应使用配置文件或逗号组合选择器。

**主题搜索与 Pagefind 抢入口。** 表现为点放大镜出现另一套搜索、控制台报重复初始化，或样式冲突。先停用主题自带搜索再判断 Pagefind 本身是否正常。

## 8. 安全与隐私

Pagefind 会索引构建产物里未被排除的 HTML。不要把未公开草稿、内部备忘、令牌、账号或仅登录可见的内容输出到 `public/`，再指望搜索框“自动保密”。回滚搜索界面也不会从已经发布过的旧制品里收回这些文本。

默认不要用 `--write-playground` 把 playground 写进线上站点；官方写明该选项默认为关闭，playground 文件始终可在 `--serve` 时使用。若你有意开放 playground，应把它视为公开工具，而不是调试后门。

纯静态搜索的一个优点是：读者的查询默认在浏览器本地完成，不必经过你自己的搜索后端或第三方检索服务。这不能代替全站的隐私政策，也不表示页面本身的统计脚本或其他第三方资源不存在。索引仍然是公开静态文件，任何人都可以下载 `pagefind/` 并查看被收录的内容。

## 9. 回滚

回滚应只撤销本次搜索接入，不要顺便改主题、统计或域名：

1. 从公共模板中移除搜索部分模板及其引用，恢复主题原有搜索入口（若你曾关闭它）。
2. 从 CI 中删除 Pagefind 索引步骤。
3. 重新构建并发布。未再生成时，新的发布产物中不应再包含 `public/pagefind/`；若该目录被错误地放进了 `static/` 或发布分支，需要一并删除后再发布。
4. 发布后再次请求 `https://www.example.com/pagefind/pagefind.js`，预期为 404 或不再返回原先的搜索脚本；页面源码中也不应再加载 `pagefind-component-ui.js` 或 `pagefind-ui.js`。

回滚完成后，搜索框消失或失效是预期现象。若旧制品被 CDN 缓存，核对时应看发布时间与响应头，避免把缓存当成回滚失败。

## 附录：对公开站点的只读核验（不是完整接入实测）

2026-11-19（Asia/Bangkok）对 `https://www.mmfei.com/` 做了只读检查，目的是观察公开页面是否已经挂有 Pagefind 前端和索引资源。这只能说明“当前公开站点看得到什么”，**不能代替一次从修改模板、本地构建、CI 索引到发布的完整接入实测**，也不能用来推断未公开的工作流细节。

当时能确认的现象如下：

- 首页和文章页源码中有搜索入口，并加载了 `/pagefind/pagefind-ui.css` 与 `/pagefind/pagefind-ui.js`，脚本里使用 `new PagefindUI(...)` 挂载到页面上的容器。这是 Default UI 的公开用法，不代表新接入还必须沿用同一套自定义覆盖层。
- `https://www.mmfei.com/pagefind/pagefind.js`、`pagefind-ui.js`、`pagefind-ui.css`、`pagefind-entry.json` 以及 `pagefind-component-ui.js`、`pagefind-component-ui.css` 均返回 HTTP 200。搜索包目录 URL `https://www.mmfei.com/pagefind/` 返回 404，符合“目录没有索引页、但具体文件可访问”的常见情况，不能单独当成索引缺失。
- `pagefind-entry.json` 中的 `version` 为 `1.6.0`，并列出了 `en` 与 `zh-cn` 两种语言索引。具体页面计数会随站点更新变化，这里不把它写成固定规格。
- 抽查文章页 HTML 带有 `lang="zh-CN"`，与官方“按 html 语言属性分索引”的说明可以对照，但本文没有在浏览器里逐条验证检索质量，也没有核对分词是否符合预期。

未在隔离环境执行 `hugo` 或 `npx pagefind@1.6.0`，也没有把本次核验当成接入验收通过。

## 官方参考

- [Getting Started with Pagefind](https://pagefind.app/docs/)
- [Installing and running Pagefind](https://pagefind.app/docs/installation/)
- [Running Pagefind](https://pagefind.app/docs/running-pagefind/)
- [Configuring what content is indexed](https://pagefind.app/docs/indexing/)
- [Pagefind CLI configuration options](https://pagefind.app/docs/config-options/)
- [Multilingual search](https://pagefind.app/docs/multilingual/)
- [Using the Default UI](https://pagefind.app/docs/ui-usage/)
- [Pagefind UI configuration options](https://pagefind.app/docs/ui/)
- [Configuring the Pagefind search in the browser](https://pagefind.app/docs/search-config/)
- [Component UI 说明](https://pagefind.app/llms-component-ui.txt)（官方从 1.5.0 起给出的推荐界面指南）

