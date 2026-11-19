# 在 Ubuntu 上用 apt 安装 Redis


原文只用 `apt install redis-server` 和 `systemctl status` 两条命令，没有说明 Ubuntu 版本、软件包实际版本、官方来源，也没有绑定地址、保护模式、验证和回滚。本文按 2026-11-19 查阅的官方资料补全这些步骤。

> **2026-11-19 更新说明：补充版本核验、安装验证和安全边界。** 本文**未在具体 Ubuntu 版本上实测**这些命令，不把预期现象写成已跑通的终端输出。仓库中的 Redis 大版本随发行版变化，**不要猜测本机版本**，一律以目标机器上的 `lsb_release -a`、`apt-cache policy redis-server`（或 `apt policy redis-server`）以及当时的官方发行说明为准。

## 适用范围与两条安装路径

本篇针对一台可以执行 `apt` 和 `systemctl` 的 Ubuntu 服务器或虚拟机，安装的是**发行版软件源里的 `redis-server` 包**，与原文路径一致。它不是 Redis 集群、哨兵、持久化专项，也不讲 PHP 客户端。

请先分清两条常见路径，不要混用命令后再无法解释版本来源：

1. **Ubuntu 仓库（本文主路径）**：包名通常是 `redis-server`，来自 Ubuntu 的 `universe` 组件。版本由该发行版维护，往往落后于 Redis 上游最新版。
2. **Redis 官方 APT 源（对照，不默认启用）**：按 [Install Redis Open Source on Linux（APT）](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/apt/) 添加 `https://packages.redis.io/deb` 后，官方文档使用 `sudo apt-get install redis`，并可用 `apt policy redis` 查看该源中的版本。这与只安装 Ubuntu 仓库里的 `redis-server` **不是同一条路径**。未先确认要跟踪官方源之前，不要把官方源的 GPG 与软件源写进生产 `sources.list`。

相关安全说明以 [Redis security](https://redis.io/docs/latest/operate/oss_and_stack/management/security/) 和上游示例配置 [redis.conf](https://github.com/redis/redis/blob/HEAD/redis.conf) 为准（核读日期 2026-11-19）。

## 环境前提

在开始安装前，先确认这些条件：

- 当前用户能使用 `sudo`。
- 系统已启用所需的软件源组件（`redis-server` 在 packages.ubuntu.com 上标注为 `universe`）。若 `apt-cache policy` 找不到候选版本，先检查 universe 是否启用，而不是改换来源。
- 这是允许安装软件包的目标机，不是误连到生产库所在主机后的即兴操作。
- 若机上已有 Redis（包括 Docker 映射的 6379 端口、Snap 安装或官方源安装），先停下来核对，避免两个实例抢端口或让你把旧数据目录当成新装结果。

先记录发行版和软件包候选版本（以本机实际输出为准）：

```bash
lsb_release -a
apt-cache policy redis-server
```

### 查阅线索（不能代替本机 policy）

截至 **2026-11-19** 查阅 [packages.ubuntu.com 上的 redis-server](https://packages.ubuntu.com/search?keywords=redis-server&searchon=names&exact=1&suite=all&section=all)，当时各套件页公开列出的版本大致如下，只作对照，**安装前必须以目标机器的 `apt-cache policy` 为准**：

| Ubuntu 套件（查阅当日） | 当时页面上的 redis-server 版本线索 |
| --- | --- |
| jammy-updates | `5:6.0.16-1ubuntu1.2`。同一天的 jammy 页面还列出 `5:6.0.16-1ubuntu1` |
| noble-updates | `5:7.0.15-1ubuntu0.24.04.5`。同一天的 noble 页面还列出 `5:7.0.15-1build2` |
| resolute-updates | `5:8.0.5-1ubuntu0.1`。同一天的 resolute 页面还列出 `5:8.0.5-1` |
| stonking、tenacious | 各自页面列出 `5:8.0.6-3` |

同一天、不同架构或尚未同步的镜像，数字都可能不同。不要把上表抄进变更记录当成“本机已安装版本”。

## 安装与启动

在已核验 `apt-cache policy`、确认候选包来自预期仓库之后，再安装：

```bash
sudo apt update
sudo apt install redis-server
```

Ubuntu 包装的 `redis-server` 通常会安装 systemd 单元 `redis-server.service`。官方 Redis APT 文档也写到：安装后服务一般会自动启动并随开机启动；若没有，再执行：

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

原文使用的状态检查仍然有效，建议带 `sudo`，以免权限不足只看到残缺信息：

```bash
sudo systemctl status redis-server.service
```

不要根据本文“应当已经在跑”的表述跳过这条检查。以本机 `systemctl` 的实际状态为准。

## 验证

安装完成后，至少做下面几项核验。各命令的输出以本机为准，本文不编造结果。

1. 服务是否处于 active，以及是否已 enable：

   ```bash
   sudo systemctl is-active redis-server
   sudo systemctl is-enabled redis-server
   ```

2. 本机客户端是否能连通。官方 Snap 安装说明用 `redis-cli` 的 `PING` 作为连通检查；发行版包装通常同时提供 `redis-cli`。在**本机**执行：

   ```bash
   redis-cli ping
   ```

   若命令不存在，先核对是否安装了 `redis-tools` / `redis-cli`，不要急着对远程主机做连通测试。

3. 查看监听地址，确认它与配置文件中的 `bind` 一致。可用：

   ```bash
   sudo ss -lntup | grep 6379
   ```

   若没有任何监听，先看 `journalctl -u redis-server`，不要假定端口一定是 6379。

4. 再核对一次实际装上的版本：

   ```bash
   apt-cache policy redis-server
   redis-server --version
   ```

## 安全：绑定地址与保护模式

Redis 官方安全文档写明：Redis 设计上应放在受信任的环境里，不要把实例直接暴露到互联网。未能限制 Redis 端口时，外部只需一条 `FLUSHALL` 就可以清空数据。

上游示例配置 `redis.conf` 中，默认建议：

- `bind 127.0.0.1 -::1`：只监听本机 IPv4 / IPv6 回环地址。
- `protected-mode yes`：在默认用户没有密码、又可能对多接口监听时，只接受来自回环或 Unix 套接字的请求。

Ubuntu 包装可能改写配置路径和默认值。常见路径是 `/etc/redis/redis.conf`，**必须以本机文件和运行中的配置为准**：

```bash
sudo grep -E '^\s*(bind|protected-mode|port)\s' /etc/redis/redis.conf
```

上述检查仅显示非敏感的监听与保护模式设置，不读取或打印 `requirepass`、ACL用户记录或密码散列，也不能凭这些行判断认证已经正确配置。认证方式应由有权限的维护者按对应版本安全文档另外核验，不把秘密输出到终端记录。

若包装使用了 `include` 或 drop-in 目录，还要按文件里的提示继续往下看。不要只改主文件却忽略被 include 的片段。

不要在未设置认证、未限制来源的情况下，把 `bind` 改成 `0.0.0.0` 或 `*`，也不要只为了“让外网连上”而关闭 `protected-mode`。需要远程访问时，应同时考虑：只绑定到必要的内网地址、主机防火墙 / 安全组、以及当前版本支持的认证方式（如密码或 ACL）。认证配置以你安装的版本文档为准，不要把真实密码写进命令行历史或公开文章。

改配置后需要按包装方式重载或重启服务，例如：

```bash
sudo systemctl restart redis-server
```

重启前确认这是可接受短暂中断的环境；有持久化或业务连接的实例，应先另做备份和窗口安排。本篇不把重启后的数据完整性当作已经验证的结果。

## 常见故障

- **`apt-cache policy` 没有候选版本**：检查发行版代号、universe 是否启用、以及是否指错了包名（Ubuntu 仓库是 `redis-server`，官方源文档里的包名是 `redis`）。
- **服务未能启动**：`sudo journalctl -u redis-server -e` 查看单元日志。常见原因包括端口被占用、配置语法错误、数据目录权限不足。不要同时启动第二个实例来“试一下”。
- **`redis-cli ping` 失败，但服务显示 active**：先看 `bind`、`port`、`protected-mode` 和是否连错了主机 / 套接字。若 Redis 只监听回环，从其他机器连接失败是预期现象。
- **装完后版本与标题或旧笔记不一致**：这通常是发行版仓库本身的差异，不是安装命令写错。以 `apt-cache policy` 为准，需要更新的上游版本时再评估官方 APT 源，而不是混合两个源却不做记录。

## 回滚

密码、数据和配置一旦删除就难以恢复。回滚前先备份 `/etc/redis/` 以及包装使用的数据目录（常见为 `/var/lib/redis`，以本机配置里的 `dir` 为准）。

```bash
sudo systemctl stop redis-server
```

之后按需要卸载。`apt remove redis-server` 与 `apt purge redis-server` 对配置文件的处理不同；`purge` 更可能去掉包装标记为配置文件的内容。**不要在未备份时对生产机直接 purge**。数据目录是否保留，以 dpkg / apt 的实际提示和本机目录为准，不要假设“卸载软件包等于数据还在”或“等于数据已清”。

若曾添加 Redis 官方软件源，回滚时还要单独处理 `sources.list` 片段和密钥环，避免以后 `apt update` 再次改变候选版本。本文未演示该卸载过程。

## 相关笔记

- [在 Ubuntu 上安装 MySQL（核验软件源版本）](https://www.mmfei.com/2024/06/ubuntu安装mysql8/)
- [phpredis的使用](https://www.mmfei.com/2023/11/phpredis的使用/)（PHP 扩展用法，不是本文的安装步骤）

以上两篇在 2026-11-19 以 HTTPS GET 核验为 HTTP 200。

## 官方参考（核读日期 2026-11-19）

- [Install Redis Open Source on Linux（官方 APT）](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/apt/)
- [Redis security](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
- [上游示例配置 redis.conf（bind 与 protected-mode）](https://github.com/redis/redis/blob/HEAD/redis.conf)
- [packages.ubuntu.com：redis-server](https://packages.ubuntu.com/search?keywords=redis-server&searchon=names&exact=1&suite=all&section=all)

