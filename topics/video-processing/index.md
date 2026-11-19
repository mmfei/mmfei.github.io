# 视频任务与交付：三个可独立复现的技术示例


从任务提交到媒体处理、再到视频交付，最容易出问题的不是一个API怎么调用，而是失败后是否重复提交、媒体流是否选错、播放列表和片段是否都受保护。本专题用三个小实验分别解释这些问题。它们不是已经打通的端到端生产流水线，也没有调用真实付费AI服务。

## 先选你要解决的问题

### 1. 提交后重试，会不会重复产生副作用？

阅读 [Python＋SQLite视频任务队列](https://www.mmfei.com/2026/11/python-sqlite视频任务队列/)。前置知识是Python与基本SQL，运行只需Python标准库。看提交幂等、租约超时、陈旧确认及重试上限。这里的外部服务是独立SQLite模拟，done不表示成片完成；分布式队列与真实供应商接口不在验证范围。

### 2. 为什么字幕缺字，或者音轨与画面时长不一致？

阅读 [FFmpeg合成字幕与音轨](https://www.mmfei.com/2026/11/ffmpeg合成字幕与音轨/)。准备支持libass的FFmpeg与指定中文字体，理解-map选流、烧录字幕、短音补静音和ffprobe核验。素材全部合成，不评价真实配音或播放器效果。若字体检查失败，先解决依赖，不忽略错误强行继续。

### 3. m3u8有签名，为什么片段仍能被直接访问？

阅读 [FFmpeg HLS切片与签名鉴权](https://www.mmfei.com/2026/11/ffmpeg-hls切片与签名鉴权/)。需要基础HTTP与Python知识，先理解VOD列表、TS片段与关键帧，再验证逐资源HMAC、过期、篡改及Range。仅验证localhost，不代表生产CDN、浏览器、DRM或付费权益链路通过。

## 建议阅读顺序

按“任务调度→媒体后处理→分发鉴权”理解职责，但每个示例都可以单独运行，无需先把三个项目接起来。若只排查字幕或播放鉴权，可直接进入对应一篇。

## 下载与版本

运行步骤与依赖见各篇教程。版本表只列有证据的测试范围，其他环境尚未验证。

## 示例版本与验证边界

| 示例 | 已有实际测试记录 | 关键依赖 | 未覆盖与失败边界 |
|---|---|---|---|
| SQLite任务队列 | Python3.13.5，19断言；Linux原实验 | 标准库sqlite3 | 顺序多连接模拟；不是真实模型、进程崩溃或负载测试；其他运行时未验证 |
| 字幕音轨 | FFmpeg7.1.5/Python3.13.5，11断言 | libx264/AAC/libass、Fontconfig、精确Noto Sans CJK SC | 6.1.1默认环境曾缺字体失败；未听音，静帧核验不等于全片；无浏览器/CDN验证 |
| HLS鉴权 | FFmpeg7.1.5/Python3.13.5，23断言；Linux原实验 | libx264/AAC/HLS、Python标准库 | 仅本地TS VOD与localhost HTTP；无浏览器/CDN/DRM/订单测试，链接有效期可转发 |

核验记录日期为2026-11-19。以上为现有脚本历史实测，重新打包不扩大支持范围。Windows/macOS及未列版本标为未验证；“官方支持”若后续加入，须逐条附官方版本来源，与实测分开。

## 示例包

下面三个地址是同一版下载包。解压后按包内说明运行。上面的版本表是此前已审的历史记录，这一节不改那张表，也不把本轮结果写成 7.1.5 或 Python 3.13.5。

2026-11-19 从这一版解压目录隔离运行：Python 3.12.3。队列 19 项通过。字幕与音轨在 FFmpeg 6.1.1-3ubuntu5、`fc-match` 精确返回 Noto Sans CJK SC 时 11 项通过；没有听音，静帧没有做画面阅读，缺字体的默认环境没有重做。HLS 在同一 FFmpeg 与 Python 下 23 项通过，只覆盖本地 TS VOD 和 127.0.0.1 HMAC。

- [SQLite 任务队列](/downloads/examples/sqlite-task-queue/20261119.1/sqlite-task-queue-20261119.1.zip)，整包 SHA-256 `b4c36e5f6681d0f417e67daaaa35d66cd20f59edd9c85ea28fd2b59557d8d957`
- [字幕与音轨](/downloads/examples/ffmpeg-subtitle-audio/20261119.1/ffmpeg-subtitle-audio-20261119.1.zip)，整包 SHA-256 `f92c7f08b7391bc10b71f8477b36d5dc1afd4db86093c971c2a4360a491cf2e7`
- [HLS 鉴权](/downloads/examples/hls-signed-vod/20261119.1/hls-signed-vod-20261119.1.zip)，整包 SHA-256 `7cba92041e136b9f6fac5452a6af592acf43cdfe7fd33ad0cdb684fc0e3cb8e1`

