# 在 Ubuntu 上安装 MySQL（核验软件源版本）


原文标题写「Ubuntu安装mysql8」，正文则是一组 `apt install mysql-server`、`mysql_secure_installation` 和 `sudo mysql -u root -p`。它没有说明这台 Ubuntu 是哪个版本，也没有核验仓库里实际提供的是 MySQL 8.0、8.4 还是其他大版本；登录方式也与 Ubuntu 当前官方安装说明不一致。本文按 2026-11-19 查阅的官方资料修订。标题不再把“一定是 8”写成既成事实。

> **2026-11-19 更新说明：补充软件源版本核验和认证方式说明。** 本文**未在具体 Ubuntu 版本上实测**这些命令，不编造 `systemctl`、`mysql` 或 `apt-cache policy` 的输出。软件包大版本**不要猜测**，以目标机器上的 `lsb_release -a`、`apt-cache policy mysql-server` 以及当时的官方发行说明为准。

## 适用范围

本篇只覆盖：在 Ubuntu 上用发行版软件源安装 `mysql-server`、确认服务状态、按官方说明做本地管理员登录，以及安装后的安全与卸载注意。它不是备份恢复、主从复制，也不把 Docker 或 Oracle 的 MySQL APT 仓库当作默认路径。若目标机已经有 MySQL / MariaDB / 占用 3306 的容器，先停下来核对，不要并行再装一套。

主要依据：

- Ubuntu Server 文档 [Install and configure a MySQL server](https://ubuntu.com/server/docs/how-to/databases/install-mysql/)（核读 2026-11-19；该页会重定向，以当时页面为准）
- MySQL 参考手册中的 [Socket Peer-Credential Pluggable Authentication](https://dev.mysql.com/doc/refman/8.0/en/socket-pluggable-authentication.html) 与 [mysql_secure_installation](https://dev.mysql.com/doc/refman/8.0/en/mysql-secure-installation.html)
- 可选对照：[A Quick Guide to Using the MySQL APT Repository](https://dev.mysql.com/doc/mysql-apt-repo-quick-guide/en/)（Oracle 官方 APT，与 Ubuntu 仓库不是同一条路径）

## 先核验发行版和仓库中的大版本

```bash
lsb_release -a
apt-cache policy mysql-server
```

`mysql-server` 在 Ubuntu 上通常是元包，真正拉进来的服务器版本以 policy 里的候选包为准。原文标题中的 “mysql8” 只反映当年常见情况，不能保证今天所有 LTS 仍然只提供 8.0。

### 查阅线索（不能代替本机 policy）

截至 **2026-11-19** 查阅 [packages.ubuntu.com 上的 mysql-server](https://packages.ubuntu.com/search?keywords=mysql-server&searchon=names&exact=1&suite=all&section=all)，当时各套件页公开列出的版本大致如下：

| Ubuntu 套件（查阅当日） | 当时页面上的 mysql-server 版本线索 |
| --- | --- |
| 22.04 LTS (jammy) / jammy-updates | `8.0.46-0ubuntu0.22.04.4` |
| 24.04 LTS (noble) / noble-updates | `8.0.46-0ubuntu0.24.04.4` |
| 26.04 LTS (resolute) / resolute-updates | `8.4.11-0ubuntu0.26.04.1` |
| 后续开发套件（页面当时还列出 stonking / tenacious） | 出现过 `9.7.2-4ubuntu1` |

也就是说：在查阅当日，22.04 / 24.04 的仓库线索仍是 8.0 系，26.04 已出现 8.4 系，更新的开发套件还出现过 9.x。这些数字只是当天的公开页面，镜像延迟或后续安全更新都会改变它们。**安装前必须以目标机器的 `apt-cache policy` 为准。**

若你明确需要 Oracle 官方仓库中的某个大版本，应走 MySQL APT Repository 的官方步骤，并先阅读“替换发行版自带 MySQL”的注意事项。本篇不把这条路径写成默认操作。

## 安装

Ubuntu 官方安装说明中的命令是：

```bash
sudo apt update
sudo apt install mysql-server
```

文档写明：安装完成后，MySQL 服务通常会自动启动。可以用 systemd 查看状态（文档示例是 `sudo service mysql status`，与 `systemctl` 等价与否以本机单元名为准）：

```bash
sudo systemctl status mysql.service
```

若服务未运行，官方文档给出的启动/重启示例是 `sudo service mysql restart`。在使用 systemd 的系统上，常见写法是：

```bash
sudo systemctl start mysql.service
sudo systemctl enable mysql.service
```

是否已经 enable，以 `systemctl is-enabled mysql` 的本机结果为准，不要假设所有包装都会自动打开开机启动。

## 验证

1. 确认单元状态：`sudo systemctl is-active mysql`（或本机实际单元名，有的环境是 `mysqld`）。
2. 按 Ubuntu 文档检查监听情况。文档示例为：

   ```bash
   sudo ss -tap | grep mysql
   ```

   文档中的示例输出显示监听在 `127.0.0.1:mysql`。你的机器不一定相同，但若你没有有意开放远程访问，却看到绑定在 `0.0.0.0` 或 `::`，应先停下来核对配置，不要当作“安装成功”忽略过去。
3. 再次核对版本：`apt-cache policy mysql-server`，以及登录后的 `SELECT VERSION();`（输出以本机为准）。
4. 需要排错时，Ubuntu 文档建议从 systemd 日志入手：

   ```bash
   sudo journalctl -u mysql
   ```

## 登录差异：`sudo mysql` 与 `mysql -u root -p`

这是原文最容易误导的地方。

Ubuntu 官方文档写明：默认会提供 `'root'@'localhost'`，用于本机管理；进入命令行的方式是：

```bash
sudo mysql -u root
```

**按该 Ubuntu 文档的默认安装，MySQL 本机 root 使用 `auth_socket`，不要求输入 MySQL 密码；sudo 本身仍可能要求系统密码。** 也就是说，发行版默认把本机管理员入口交给系统的 root（通过 `sudo`），而不是“安装完立刻用密码登录 root”。

因此：

- 推荐先按官方说明使用 `sudo mysql -u root`（`sudo mysql` 通常也可以，以本机客户端行为为准）。
- `sudo mysql -u root -p` 中的 `-p` 只要求客户端提示输入密码，不能证明服务端实际使用了密码认证，也不能据此断言插件已经改变。认证方式要结合连接方式、匹配账户和下面的 `plugin` 查询判断；不要反复试密码或为了套用命令而改认证插件。
- 不要把“没设过密码”理解成“任何人都可以远程用空密码登录”。`auth_socket` 约束的是本机系统用户与套接字，和远程密码登录不是同一件事。

登录后，可用下面语句核对本机 root 的认证插件（不要把输出里的账号细节发到公开地方）：

```sql
SELECT user, host, plugin FROM mysql.user WHERE user = 'root';
```

本文未执行该查询，不预填结果。若 `plugin` 为 `auth_socket`，应继续用 `sudo mysql` 管理；若已改成密码类插件，再用 `mysql -u root -p`。

如需额外的应用程序账号，Ubuntu 文档建议用 `CREATE USER`，密码认证示例为 `caching_sha2_password`，套接字认证示例为 `auth_socket`，然后再 `GRANT`。不要把应用程序配成直接使用系统 root 账户。文中的 `'username'`、`'password'` 只是文档占位，必须换成自己的值，且不要把真实密码写进笔记或命令历史。

## 关于 `mysql_secure_installation`

原文把 `sudo mysql_secure_installation` 放在安装后的第二步。MySQL 参考手册确实提供这个工具，用于改善新装实例的安全设置。

但 Ubuntu 这篇官方安装指南**没有**把它列为安装必做步骤；本地管理员入口按文档是 `sudo mysql -u root` 加 `auth_socket`。该工具的交互（例如为 root 设置密码、是否删除匿名用户）在 Debian/Ubuntu 默认 `auth_socket` 环境下，可能和“设完密码就能 `mysql -u root -p`”的直觉并不一致。

本文**未实测**该向导在当前各 Ubuntu LTS 上的具体提问与结果，因此不给出逐步点选建议，也不声称运行后 root 一定改成了密码认证。若你决定运行它，先确认自己能用 `sudo mysql` 登录，跑完后再查一次 `mysql.user` 的 `plugin`，并以本机实际提示为准。不要在已经有业务数据的实例上把该向导当成“无害的初始化”。

## 安全注意

- 默认只监听本机是更稳妥的起点。Ubuntu 文档指出，若要接受网络主机连接，需编辑 `/etc/mysql/mysql.conf.d/mysqld.cnf` 中的 `bind-address`，改为合适的地址，然后 `sudo systemctl restart mysql.service`。不要在没有防火墙、没有专用账号和必要 TLS / 权限约束时，把监听改到所有接口。
- 修改 `bind-address` 之前，用 `ip address show` 确认地址确实属于这台机器。
- 生产库的 root 与业务账号权限应分开；不要把真实密码写进 shell 历史、脚本仓库或公开文章。
- 本篇不包含备份或恢复步骤。安装成功不等于已经有可恢复的备份。

## 常见故障

- **`mysql -u root -p` 无法登录**：先确认当前认证插件是不是仍为 `auth_socket`。若是，改用 `sudo mysql -u root`，不要反复猜测密码。
- **`sudo mysql` 也被拒绝**：查看错误信息与 `journalctl -u mysql`，确认服务在运行、套接字路径与客户端一致，以及当前执行的系统用户符合 `auth_socket` 的对应关系。
- **服务启动失败**：同样先看 journal。常见原因包括数据目录不干净、端口占用、配置语法错误。不要删除 `/var/lib/mysql` 来“重装试试”，除非这是明确可丢弃的空实例并且已经没有需要保留的文件。
- **装完发现不是 8.0**：回到 `apt-cache policy`。这通常是发行版仓库的真实情况，不是命令写错。

## 回滚

MySQL 的卸载很容易误删数据。回滚前先取得与本机版本和存储引擎匹配、可恢复的一致性备份，并确认这台机器允许卸载。不能把运行中数据目录的普通复制当作已验证备份；物理备份必须按官方支持的方法确保一致性，逻辑备份也应核对导出结果并演练恢复。

```bash
sudo systemctl stop mysql.service
```

之后按需要 `apt remove mysql-server` 或 `apt purge mysql-server`。`purge` 更可能移除包装标记为配置文件的内容；数据目录 `/var/lib/mysql` 是否保留或提示是否删除，以 apt/dpkg 的实际行为为准。**未备份时不要在生产机 purge，也不要手工清空数据目录。**

若曾接入 Oracle MySQL APT 源，还要单独处理软件源与替换发行版包装的后果，本篇不演示。

## 相关笔记

- [在 Ubuntu 上用 apt 安装 Redis](https://www.mmfei.com/2024/08/ubuntu安装redis/)
- [用docker快速搭建一个phpmyadmin](https://www.mmfei.com/2023/11/用docker快速搭建一个phpmyadmin/)（本机管理界面的另一种做法，不是本文的 apt 安装步骤）

以上两篇在 2026-11-19 以 HTTPS GET 核验为 HTTP 200。

## 官方参考（核读日期 2026-11-19）

- [Ubuntu Server：Install and configure a MySQL server](https://ubuntu.com/server/docs/how-to/databases/install-mysql/)
- [packages.ubuntu.com：mysql-server](https://packages.ubuntu.com/search?keywords=mysql-server&searchon=names&exact=1&suite=all&section=all)
- [MySQL 8.0：Socket Peer-Credential Pluggable Authentication](https://dev.mysql.com/doc/refman/8.0/en/socket-pluggable-authentication.html)
- [MySQL 8.0：mysql_secure_installation](https://dev.mysql.com/doc/refman/8.0/en/mysql-secure-installation.html)
- [A Quick Guide to Using the MySQL APT Repository](https://dev.mysql.com/doc/mysql-apt-repo-quick-guide/en/)（仅作官方源对照）

