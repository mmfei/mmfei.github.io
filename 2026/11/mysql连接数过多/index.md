# MySQL 连接数过多（too many connections）怎么处理？查看占用、KILL 与 max_connections（8.4 实测）


应用或客户端报 `Too many connections` 时，先看当前有多少连接、是谁占着、能不能先腾出一个会话，再决定要不要临时加大 `max_connections`。不要把“把上限调到很大”当成第一步。

本文只讲连接数排查和上限，不讲安装，也不讲慢查询。安装见站内[Ubuntu安装mysql8](https://www.mmfei.com/2024/06/ubuntu安装mysql8/)，慢查询见[MySQL慢查询日志怎么看](https://www.mmfei.com/2026/11/mysql慢查询日志怎么看)。下面的输出全部来自官方 `mysql:8.4.13` 一次性容器，密码只是实验占位值。

> 资料核对日期：2026 年 11 月 25 日。依据当时的 MySQL 8.4 手册：[Too many connections](https://dev.mysql.com/doc/refman/8.4/en/too-many-connections.html)、[max_connections](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html#sysvar_max_connections)、[SHOW PROCESSLIST](https://dev.mysql.com/doc/refman/8.4/en/show-processlist.html)、[How MySQL Uses Memory](https://dev.mysql.com/doc/refman/8.4/en/memory-use.html)、[InnoDB Startup Configuration](https://dev.mysql.com/doc/refman/8.4/en/innodb-init-startup-configuration.html) 中的估算公式、[wait_timeout](https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html#sysvar_wait_timeout)。实测版本是 8.4.13，不要用 MariaDB 的表现来给 MySQL 下结论。

## 结论速查

| 你看到的现象 | 先看什么 | 常见处理 |
| --- | --- | --- |
| `ERROR 1040 (...) Too many connections` | `SHOW VARIABLES LIKE 'max_connections'`，`SHOW STATUS LIKE 'Threads_connected'`，`SHOW PROCESSLIST` 或 `performance_schema.processlist` | 找出长时间 `Sleep` 或卡住的会话；能确认无用后再 `KILL`。不要先盲目加大上限 |
| 普通账号已经连不上，管理员还能进去 | 官方为 `CONNECTION_ADMIN`（或已弃用的 `SUPER`）预留的 `max_connections + 1` 条连接 | 用有该权限的账号登录、排查；把这个权限只留给管理员 |
| 改了 `SET GLOBAL max_connections`，重启后又回去了 | 配置文件里有没有写这一项 | `SET GLOBAL` 只改运行中的值；要持久化需写选项文件并重启，或使用官方的持久化变量机制（后者本文未实测） |
| 连接池总是被占满，但 `PROCESSLIST` 里很多 `Sleep` | `Time` 和 `wait_timeout` | 多半是应用没把连接还回池里。默认 `wait_timeout` 是 28800 秒（8 小时），空闲连接会一直占槽 |

## 1. 准备一次性的官方 MySQL 8.4 实例

本环境共享 Docker 的默认网桥 `docker0` 不存在，为了不重启共享 `dockerd`，另外建了一个一次性网桥，并把端口只绑在 `127.0.0.1`。如果你那边默认 bridge 正常，可以改用默认网络，但仍应把发布端口限制在回环地址。数据目录和配置目录都是一次性的。

```bash
umask 077
LAB=/tmp/mmfei-20261125-mysql
mkdir -p "$LAB/data" "$LAB/conf.d"
chmod 755 "$LAB" "$LAB/conf.d"

# 本环境需要自定义网桥；测完删除
docker network create --driver bridge \
  --subnet 172.28.25.0/24 \
  -o com.docker.network.bridge.name=mmfei20261125br \
  mmfei-20261125-mysql-net

docker run -d \
  --name mmfei-20261125-mysql \
  --hostname mmfei-mysql-lab \
  --network mmfei-20261125-mysql-net \
  -e MYSQL_ROOT_PASSWORD='TestOnly_ChangeMe' \
  -e MYSQL_DATABASE=lab \
  -p 127.0.0.1:33070:3306 \
  -v "$LAB/data:/var/lib/mysql" \
  -v "$LAB/conf.d:/etc/mysql/conf.d" \
  mysql:8.4.13 \
  --character-set-server=utf8mb4
```

`conf.d` 必须让容器内的 `mysql` 用户能读（目录 755，配置文件 644）。本次一开始把目录设成 700，入口脚本会报 `Can't read dir of '/etc/mysql/conf.d/'` 并退出。

等就绪：

```bash
docker exec -e MYSQL_PWD='TestOnly_ChangeMe' mmfei-20261125-mysql \
  mysqladmin ping -uroot --silent
```

下面的客户端命令都通过 `docker exec` 走容器内 socket。镜像版本与本次实际读到的服务器版本：

```text
8.4.13
```

镜像 digest 为 `mysql@sha256:8c233bad33d520a7aae1c1e619c3a9775f4a1ba2d463d692fada04ec7f40be00`。命令行里出现的密码只用于这个可丢弃实例；生产请用权限 600 的 `~/.my.cnf` 或 socket 认证，不要把密码写进历史记录。

## 2. 先看默认上限和当前连接

```sql
SHOW VARIABLES WHERE Variable_name IN (
  'max_connections','wait_timeout','interactive_timeout','thread_stack',
  'open_files_limit','admin_address','admin_port');

SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Threads_connected','Threads_running','Threads_created','Threads_cached',
  'Max_used_connections','Max_used_connections_time','Connections',
  'Aborted_connects','Aborted_clients','Connection_errors_max_connections');
```

本次官方镜像、尚未改配置时的关键默认值：

```text
max_connections     151
wait_timeout        28800
interactive_timeout 28800
thread_stack        1048576
admin_address       （空）
admin_port          33062
```

```text
Threads_connected                 1
Max_used_connections              1
Connection_errors_max_connections 0
Aborted_connects                  0
```

与 2026-11-25 的 8.4 手册一致：`max_connections` 默认 151，范围 1 到 100000，可在运行中修改；有效上限还受 `open_files_limit - 810` 约束。`wait_timeout` 默认 28800 秒，作用于非交互连接空闲超时。

`Threads_connected` 是当前打开的客户端连接数，`Max_used_connections` 是启动以来的峰值。它们是看“有没有顶满”的第一组数字。`event_scheduler` 会出现在进程列表里，但不计入这组客户端连接。

## 3. 准备一个普通账号和一个有 CONNECTION_ADMIN 的账号

官方 [Too many connections](https://dev.mysql.com/doc/refman/8.4/en/too-many-connections.html) 写明：服务器实际允许 `max_connections + 1` 条客户端连接，多出来的那一条预留给具有 `CONNECTION_ADMIN` 权限（或已弃用的 `SUPER`）的账号，以便普通连接已经满了时，管理员还能进去做 `SHOW PROCESSLIST`。

```sql
CREATE USER 'app'@'%' IDENTIFIED BY 'AppOnly_ChangeMe';
CREATE USER 'dba'@'%' IDENTIFIED BY 'DbaOnly_ChangeMe';
GRANT SELECT ON lab.* TO 'app'@'%';
GRANT CONNECTION_ADMIN, PROCESS ON *.* TO 'dba'@'%';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'app'@'%';
SHOW GRANTS FOR 'dba'@'%';
```

本次结果：

```text
GRANT USAGE ON *.* TO `app`@`%`
GRANT SELECT ON `lab`.* TO `app`@`%`

GRANT PROCESS ON *.* TO `dba`@`%`
GRANT CONNECTION_ADMIN ON *.* TO `dba`@`%`
```

`app` 没有 `CONNECTION_ADMIN` 或 `SUPER`。`root` 在本镜像里同时拥有这两项，以及 `PROCESS`、`SYSTEM_VARIABLES_ADMIN`。生产环境不要把 `CONNECTION_ADMIN` 授给普通应用账号，否则预留连接就失去意义。

## 4. 把上限临时降到 5，复现 1040

```sql
SET GLOBAL max_connections = 5;
SELECT @@GLOBAL.max_connections;
```

返回 `5`。然后用普通账号打开 5 个一直不退出的会话（这里用 `SELECT SLEEP(600)` 占住，只为了实验）：

```sql
SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Threads_connected','Max_used_connections','Connection_errors_max_connections');
SHOW FULL PROCESSLIST;
```

本次在 5 个 `app` 会话都还在时，用 root 查询看到：

```text
Threads_connected    6
Max_used_connections 6
```

```text
Id  User             Command  State       Info
5   event_scheduler  Daemon   Waiting...  NULL
18  app              Query    User sleep  SELECT SLEEP(600)
19  app              Query    User sleep  SELECT SLEEP(600)
20  app              Query    User sleep  SELECT SLEEP(600)
21  app              Query    User sleep  SELECT SLEEP(600)
22  app              Query    User sleep  SELECT SLEEP(600)
23  root             Query    init        SHOW FULL PROCESSLIST
```

5 个普通连接已经用满 `max_connections`，root 用的是那条预留连接，所以 `Threads_connected` 为 6。官方手册还写：`SHOW PROCESSLIST` 的 INFORMATION_SCHEMA 实现已弃用，建议改用 Performance Schema：

```sql
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, LEFT(INFO,80) AS INFO
  FROM performance_schema.processlist
 ORDER BY ID;
```

本次它额外列出了一条 `system user` 后台线程，这是 `SHOW FULL PROCESSLIST` 里没有的。没有 `PROCESS` 权限的账号通常只能看到自己的会话。

此时再让 `app` 连接：

```text
ERROR 1040 (08004): Too many connections
```

同一个状态下，`dba`（只有 `CONNECTION_ADMIN` 和 `PROCESS`，没有 `SUPER`）仍然可以连上：

```text
CURRENT_USER()  CONNECTION_ID()
dba@%           27
```

这与 8.4 文档中“为 CONNECTION_ADMIN / SUPER 预留额外一条连接”的说明一致。

有两点限制，也在本次观察到了：

- 预留的只有一条。如果管理员自己也用长时间会话把这条占住，其它管理员再连会失败。本次在 5 个 `app` 再加上一个不退出的 `dba` 之后，root 再连得到的是 `ERROR 1040 (HY000): Too many connections`。SQLSTATE 与普通账号被拒时的 `08004` 不同，但错误号仍是 1040。
- 官方还提到专用管理接口。本次 `admin_address` 为空，未启用，也就没有在那条路径上做实测。

## 5. KILL 一个会话后，普通账号可以再连上

先确认要杀的是哪一个会话，再执行 `KILL`。不要误杀正在跑业务的会话。

```sql
SELECT ID, USER, COMMAND, TIME, LEFT(INFO,40) AS INFO
  FROM performance_schema.processlist
 WHERE USER='app'
 ORDER BY ID;
```

本次杀掉了 `Id=13`：

```sql
KILL 13;
```

返回后进程列表里已经没有 13，`Threads_connected` 从 6 降到 5（剩下 4 个 `app` 加上当前这条 root 查询）。随后普通账号立刻可以再连上：

```text
x               id
app-after-kill  24
```

`KILL` 只结束那一个会话，不会改变 `max_connections`。这是满员时最直接的临时处理：先腾位置，再查为什么连接没被释放。

## 6. SET GLOBAL 可以临时调大，但重启会丢，除非写入配置文件

在仍然有若干 `app` 会话占着的情况下：

```sql
SET GLOBAL max_connections = 10;
```

返回 10。随后又成功增加了 4 个 `app` 会话，`Max_used_connections` 达到 9，`Connection_errors_max_connections` 为 1（对应前面那次 1040）。这说明把上限调大能立即允许新的普通连接；它解决的是“现在挤不进去”，并不自动修好连接泄漏。

`SET GLOBAL` 与配置文件、重启的关系，本次只重启了这个实验容器，没有重启共享 Docker 守护进程：

| 操作 | 重启后的 `max_connections` |
| --- | --- |
| 只 `SET GLOBAL` 为 10，`conf.d` 里没有这项 | 151（回到镜像默认） |
| 在 `/etc/mysql/conf.d/mmfei-lab.cnf` 写入 `max_connections=8` 再重启 | 8 |
| 配置文件仍是 8，再 `SET GLOBAL` 为 20，然后重启 | 8（文件赢了运行中的修改） |

配置文件示例（数字只用于这次实验，不是生产推荐值）：

```ini
[mysqld]
max_connections=8
```

文件放进会为 mysqld 读取的目录（本次是镜像的 `/etc/mysql/conf.d/`），权限让 `mysql` 用户能读，然后重启 mysqld。官方还有 `SET PERSIST` 一类把运行时改动写进 `mysqld-auto.cnf` 的机制，本文没有实测。

## 7. wait_timeout 与连接泄漏：先观察，不给生产推荐值

`PROCESSLIST` 里 `Command` 为 `Sleep` 的会话表示当前没有在执行语句，但连接仍占着一个槽，直到客户端断开，或空闲时间达到该会话的 `wait_timeout`（交互式客户端则看 `interactive_timeout`）。本次默认都是 28800 秒。

实验里给一个 `app` 会话执行：

```sql
SET SESSION wait_timeout = 3;
SELECT CONNECTION_ID(), @@session.wait_timeout;
```

随后不再发送 SQL。当时进程列表里可以看到这条 `Command=Sleep` 的 `app` 会话；大约 5 秒后再查，该会话已经消失，`Aborted_clients` 有增加。另一次观察里，一条空闲的 `Sleep` 会话会把 `Threads_connected` 多计 1，把这条客户端关掉后计数就降回去。

这只能说明：空闲连接确实占槽，短的 `wait_timeout` 会把它们收回。它不能推出“生产应该设成 3 秒或某个常用值”。连接池里的空闲连接如果被服务器先断开，应用侧还可能遇到“已经断了却误以为还能用”的错误。真正要查的是：连接池是否按用完归还、有没有会话一直挂着事务或 `SLEEP`、有没有脚本没关连接。

## 8. 内存代价：用官方公式和本实例测到的变量来算，不拍脑袋

加大 `max_connections` 会提高潜在内存占用。官方 [How MySQL Uses Memory](https://dev.mysql.com/doc/refman/8.4/en/memory-use.html) 指出，每个连接线程至少涉及 `thread_stack`、连接缓冲和结果缓冲（由 `net_buffer_length` 起步，可增长到 `max_allowed_packet`），以及每会话 `max_digest_length`；执行具体语句时还可能再分配 `read_buffer_size`、`sort_buffer_size` 等。这些缓冲并不是在每个连接上一开始就全部占满。

8.4 手册的 [InnoDB Startup Configuration](https://dev.mysql.com/doc/refman/8.4/en/innodb-init-startup-configuration.html) 另外给了一个粗算公式，并写明需要按你的版本和配置调整：

```text
innodb_buffer_pool_size
+ key_buffer_size
+ max_connections*(sort_buffer_size+read_buffer_size+binlog_cache_size)
+ max_connections*2MB
```

该页还写：每个线程使用一块栈（常常按 2MB 估，Oracle 提供的某些二进制里曾是 256KB），最坏情况下还会再加上 `sort_buffer_size + read_buffer_size`。

把本实例测到的默认值代入（`innodb_buffer_pool_size=128MiB`，`key_buffer_size=8MiB`，`sort+read+binlog=416KiB`，`max_connections=151`）：

- 按公式里的 `* 2MB` 项计算，合计约 **499.34 MiB**
- 本次 `thread_stack` 实际是 **1048576（1MB）**，若把公式最后一项改成按 1MB 算，合计约 **348.34 MiB**

这只是按官方公式和本容器默认变量做的算术，假设所有连接同时用上公式里的那些缓冲；实际占用可能更低，也可能因排序、大包、连接跟踪等更高。它不是“这台机器应该把 `max_connections` 设成多少”的答案。调大上限前，先确认机器在 InnoDB 缓冲池和其它进程之外，还撑不撑得住最坏情况。

## 常见问题

**已经满了，普通账号连不上，我该登录哪个账号？**  
用拥有 `CONNECTION_ADMIN`（或 `SUPER`）的管理员账号。本次 `dba` 在 5 个普通连接占满时仍然可以登录。不要把这个权限给应用账号。

**`SHOW PROCESSLIST` 和 `performance_schema.processlist` 为什么不完全一样？**  
官方推荐用 Performance Schema 实现。本次它多显示了后台 `system user`。看谁占着客户端槽，主要盯 `User` 为业务账号、`Command` 为 `Query` 或 `Sleep` 的行。

**`SET GLOBAL` 当时生效，维护窗口重启后又变回去？**  
运行中的修改默认不写进配置文件。把需要保留的值写入 mysqld 会读到的选项文件，再重启并核对 `SHOW VARIABLES`。

**把 `max_connections` 加大之后，应用还是报连接不够？**  
先看是不是马上又出现大量 `Sleep` 或未提交的会话。上限只能延后挤满，不能代替修连接池和泄漏。

**错误号都是 1040，SQLSTATE 却不一样？**  
本次普通账号在额度用尽时是 `ERROR 1040 (08004): Too many connections`；预留连接也被占住后，管理员再连是 `ERROR 1040 (HY000): Too many connections`。排查时以错误号和原文为准，同时看当时是否已经有管理员占着那条预留连接。

## 安全注意

- 实验密码、端口和数据目录都是一次性的，容器端口只绑 `127.0.0.1`。生产必须有认证、网段限制和最小权限。
- `KILL` 会打断正在执行的语句并断开会话，可能造成未提交事务回滚。先确认 `INFO` 和 `Time`，不要按感觉杀。
- 命令行密码会进进程列表和 shell 历史。演示里用 `MYSQL_PWD` 同样不适合生产。
- 不要在共享或生产实例上用 `SLEEP` 占满连接做实验。
- 本文没有给生产环境的 `max_connections` 或 `wait_timeout` 推荐值。

## 回滚

若只是 `SET GLOBAL max_connections = ...`，重启且配置文件未改时，会回到文件或编译默认值。本次已验证：只改运行中的值，重启后回到 151。

若已经把值写进选项文件，删掉或改回原来的数字再重启。需要在运行中先改回去时：

```sql
SET GLOBAL max_connections = 151;   -- 改回你原来的值，151 只是本镜像默认
```

实验容器用 `docker rm -f mmfei-20261125-mysql` 删除，并删掉一次性网桥和数据目录即可。不要对共享 `dockerd` 做 restart 或无过滤的 prune。

## 实测环境与来源

- 时间：2026-11-25 09:33–09:37，Asia/Bangkok（UTC+7）。容器内时间为 UTC
- 版本：官方 Docker 镜像 `mysql:8.4.13`，`SELECT VERSION()` 为 `8.4.13`；digest `mysql@sha256:8c233bad33d520a7aae1c1e619c3a9775f4a1ba2d463d692fada04ec7f40be00`
- 实例：容器 `mmfei-20261125-mysql`，自定义网桥 `mmfei-20261125-mysql-net`，发布端口 `127.0.0.1:33070`，数据目录一次性；客户端走 `docker exec` / 容器内 socket。本环境默认 `docker0` 不存在，未重启共享 dockerd
- 已实测：默认 `max_connections=151` 及上述相关变量；`SET GLOBAL` 降到 5 后用 5 个普通会话占满，第 6 个 `app` 报 `ERROR 1040 (08004): Too many connections`；具有 `CONNECTION_ADMIN` 的 `dba` 在已满时仍可连接；`SHOW FULL PROCESSLIST` 与 `performance_schema.processlist`；`KILL` 后普通账号可再连；`SET GLOBAL` 调到 10 后可再增加连接；仅 `SET GLOBAL` 重启回到 151，写入 `conf.d` 后重启保持文件中的 8；`wait_timeout=3` 的空闲会话会消失，`Sleep` 会话会占槽
- 未实测：专用管理接口（`admin_address` 为空）；`SET PERSIST` 写 `mysqld-auto.cnf`；应用连接池在真实框架里的泄漏形态；生产环境“合适的 `max_connections` / `wait_timeout`”；把公式估算与容器实际 RSS 做逐字节对照
- 官方文档读取日期：2026-11-25，链接见文首

