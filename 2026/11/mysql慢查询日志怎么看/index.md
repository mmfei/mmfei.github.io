# MySQL 慢查询日志怎么看？开启、mysqldumpslow 分析与日志文件太大清理（MySQL 8 实测）


接口突然变慢，怀疑是数据库，第一步通常是看慢查询日志。但很多人卡在这几步：日志没开、找不到文件、看不懂内容、不知道先优化哪条 SQL；日志开了又忘了关，几天就涨到几个 G。本文按排查顺序，从开启到清理完整走一遍，所有输出都来自一次性容器里的实测。

> 适用：MySQL 8.0 / 8.4（实测 8.4.13 与 8.0.46，官方 Docker 镜像）。安装 MySQL 可以参考站内[Ubuntu安装mysql8](https://www.mmfei.com/2024/06/ubuntu安装mysql8/)。示例密码、表名都是演示用的占位值。

## 1. 先看当前配置

```sql
SHOW VARIABLES WHERE Variable_name IN (
  'slow_query_log','slow_query_log_file','long_query_time',
  'log_queries_not_using_indexes','log_output','min_examined_row_limit');
```

8.4.13 默认值实测：

```text
+-------------------------------+--------------------------------------+
| Variable_name                 | Value                                |
+-------------------------------+--------------------------------------+
| log_output                    | FILE                                 |
| log_queries_not_using_indexes | OFF                                  |
| long_query_time               | 10.000000                            |
| min_examined_row_limit        | 0                                    |
| slow_query_log                | OFF                                  |
| slow_query_log_file           | /var/lib/mysql/e444fbd33f77-slow.log |
+-------------------------------+--------------------------------------+
```

要点：

- 默认**不开启**（`slow_query_log=OFF`）。
- 默认阈值 10 秒，对 Web 接口来说太宽，大多数慢 SQL 根本不会被记下来。
- 日志文件默认在数据目录，文件名是“主机名-slow.log”。Docker 里主机名就是容器 ID，所以每次重建容器文件名都会变。

## 2. 开启慢查询日志

在线开启，并用 `SET PERSIST` 写入 `mysqld-auto.cnf`，重启后仍然有效（8.0 起支持）：

```sql
SET PERSIST slow_query_log = ON;
SET PERSIST long_query_time = 0.1;          -- 超过 100 毫秒就记录，按业务调整
SET PERSIST log_queries_not_using_indexes = OFF;
```

实测核对：

```text
+-------------------------+--------------------------+------------------------------+
| @@GLOBAL.slow_query_log | @@GLOBAL.long_query_time | this_session_long_query_time |
+-------------------------+--------------------------+------------------------------+
|                       1 |                 0.100000 |                    10.000000 |
+-------------------------+--------------------------+------------------------------+
```

注意最后一列：**当前会话的 `long_query_time` 仍是 10 秒**。全局值只对之后新建的连接生效，所以改完要用新连接测试，应用的连接池也要等连接重建后才会按新阈值记录。

重启容器后再查，`slow_query_log=1`、`long_query_time=0.1` 仍然生效，`mysqld-auto.cnf` 里能看到这三项。

如果更习惯写配置文件，也可以在 `my.cnf` 的 `[mysqld]` 段写：

```ini
[mysqld]
slow_query_log      = ON
slow_query_log_file = /var/log/mysql/mysql-slow.log
long_query_time     = 0.1
```

改配置文件需要重启生效；`SET PERSIST` 的值优先级高于配置文件，两边都写时以 `SET PERSIST` 为准，排查“改了 my.cnf 没生效”时先查 `performance_schema.persisted_variables`。

## 3. 慢查询日志怎么看

先找文件：

```sql
SELECT @@slow_query_log_file;
```

实测造了一张 200 万行的 `orders` 表，按客户查最近 20 条订单（`customer_id` 上没有索引）。日志里的一条记录：

```text
# Time: 2026-11-24T12:15:17.216798Z
# User@Host: root[root] @ localhost []  Id:    14
# Query_time: 0.170713  Lock_time: 0.000002 Rows_sent: 20  Rows_examined: 2000020
SET timestamp=1795522517;
SELECT id, amount, created_at FROM orders WHERE customer_id = 12345 ORDER BY created_at DESC LIMIT 20;
```

逐行看：

| 字段 | 含义 | 这条记录说明什么 |
| --- | --- | --- |
| `# Time` | 语句结束时间，UTC | 和北京时间差 8 小时，对日志时别看错 |
| `User@Host`、`Id` | 账号、来源、连接 ID | 判断是哪个应用、哪台机器 |
| `Query_time` | 执行耗时（秒） | 0.17 秒 |
| `Lock_time` | 等锁时间 | 几乎为 0，不是锁的问题 |
| `Rows_sent` | 返回行数 | 20 |
| `Rows_examined` | 扫描行数 | 200 万，返回 20 行却扫了全表，典型缺索引 |
| `SET timestamp` | 语句开始时间戳 | 便于和应用日志对时间 |

经验判断：`Rows_examined` 远大于 `Rows_sent`，通常是缺索引或索引用不上；`Lock_time` 很大，要查锁等待和长事务，加索引不一定有用。

## 4. 用 mysqldumpslow 汇总

日志一多，逐条看不过来。`mysqldumpslow` 会把参数不同、结构相同的 SQL 归成一类（数字替换成 N、字符串替换成 'S'），再按次数或总耗时排序。

官方 `mysql:8.4` Docker 镜像里**没有** `mysqldumpslow`（实测 `command -v` 找不到）。可以把日志拷出来，用装了 MySQL 客户端的机器分析：

```bash
docker cp <容器名>:/var/lib/mysql/<主机名>-slow.log ./slow.log

# 按总耗时排序，取前 5 类
mysqldumpslow -s t -t 5 slow.log

# 按出现次数排序，只看包含 orders 的语句
mysqldumpslow -s c -t 3 -g orders slow.log
```

实测（Ubuntu 24.04 的 mysql-client-core-8.0 8.0.46）：

```text
Count: 1  Time=6.51s (6s)  Lock=0.00s (0s)  Rows=0.0 (0), root[root]@localhost
  INSERT INTO orders (customer_id, status, amount, created_at)
  ...

Count: 5  Time=0.17s (0s)  Lock=0.00s (0s)  Rows=20.0 (100), root[root]@localhost
  SELECT id, amount, created_at FROM orders WHERE customer_id = N ORDER BY created_at DESC LIMIT N

Count: 1  Time=0.16s (0s)  Lock=0.00s (0s)  Rows=1.0 (1), root[root]@localhost
  SELECT COUNT(*) FROM orders WHERE status = N AND amount > N
```

怎么读：`Count` 是出现次数，`Time` 是平均耗时，括号里是总耗时。排在第一的 INSERT 是造数据时的一次性语句，可以忽略；真正要优化的是第二类，它执行了 5 次，每次 0.17 秒。**优先处理“次数多 × 平均耗时高”的那类**，而不是只看单次最慢的一条。

常用参数：`-s t` 按总耗时，`-s c` 按次数，`-s at` 按平均耗时，`-t N` 取前 N 类，`-g` 按关键字过滤。

实测中，Ubuntu 24.04 的 mysqldumpslow（mysql-client-core-8.0 8.0.46）在使用 `-t 5`、而日志里实际只有 3 类语句时，会先完整打印汇总，再报 `Died at /usr/bin/mysqldumpslow line 163, <> chunk 7`，退出码 255。原因已经核对过脚本：第 159 行用 `@sorted[0 .. $opt{t}-1]` 截断，类数不足时会补上空元素，第 163 行 `my $v = $stmt{$_} || die;` 因此退出。汇总结果可用。把 `-t` 改成不超过实际类数（本例 `-t 3`），或者不加 `-t`，就不会出现这行。

## 5. 用 EXPLAIN ANALYZE 定位并加索引

拿汇总出的那类 SQL 带一个真实参数，先看执行计划：

```sql
EXPLAIN SELECT id, amount, created_at FROM orders
WHERE customer_id = 12345 ORDER BY created_at DESC LIMIT 20;
```

```text
| type | possible_keys | key  | rows    | Extra                       |
| ALL  | NULL          | NULL | 1994725 | Using where; Using filesort |
```

`type=ALL` 是全表扫描，`Using filesort` 表示还要额外排序。`EXPLAIN ANALYZE` 会真正执行一次，给出每一步的实际耗时：

```text
-> Limit: 20 row(s)  (actual time=279..279 rows=20 loops=1)
    -> Sort: orders.created_at DESC, limit input to 20 row(s) per chunk  (actual time=279..279 rows=20 loops=1)
        -> Filter: (orders.customer_id = 12345)  (actual time=2.13..279 rows=100 loops=1)
            -> Table scan on orders  (actual time=0.43..205 rows=2e+6 loops=1)
```

`EXPLAIN ANALYZE` 会真的执行语句，在生产库上对 UPDATE/DELETE 或特别重的查询要慎用。

按“等值条件列在前、排序列在后”建联合索引：

```sql
ALTER TABLE orders ADD INDEX idx_customer_created (customer_id, created_at),
  ALGORITHM=INPLACE, LOCK=NONE;
```

再看：

```text
| type | key                  | rows | Extra               |
| ref  | idx_customer_created |  100 | Backward index scan |

-> Limit: 20 row(s)  (actual time=0.971..0.979 rows=20 loops=1)
    -> Index lookup on orders using idx_customer_created (customer_id=12345) (reverse)  (actual time=0.966..0.974 rows=20 loops=1)
```

| 版本 | 加索引前（EXPLAIN ANALYZE 实际耗时） | 加索引后 |
| --- | --- | --- |
| 8.4.13 | 279 ms，扫描 200 万行 | 0.98 ms，扫描 20 行 |
| 8.0.46 | 358 ms | 0.60 ms |

加索引后再执行同一条 SQL，慢日志行数保持 46 行不变，说明它已经低于 0.1 秒阈值，不再被记录。

生产环境加索引前先确认表大小和业务低峰期，大表在线 DDL 也会占用 IO，并且可能需要短暂的元数据锁。

## 6. log_queries_not_using_indexes 要不要开

打开后，没有用到索引的语句即使很快也会被记录，适合短时间排查“哪些 SQL 没走索引”：

```sql
SET GLOBAL log_queries_not_using_indexes = ON;
SET GLOBAL log_throttle_queries_not_using_indexes = 10;   -- 每分钟最多记 10 条这类语句，防止刷屏
```

实测打开后，`SELECT COUNT(*) FROM orders WHERE status = 3` 被记了下来（`Rows_examined: 2000000`）。不过这条语句耗时 0.149 秒，本来就超过 0.1 秒阈值，所以这次实测不能单独证明该参数的效果，“快但没走索引的语句也会被记录”以官方文档为准。排查完记得关掉，否则小表上的全表扫描也会大量写入日志，文件很快变大。

## 7. 慢查询日志文件太大怎么办

先说**不要做的事：直接 `rm` 日志文件**。实测删掉后，目录里看不到文件了，但 mysqld 还持有它：

```text
-> /var/log/mysql-slow/slow.log (deleted)
```

磁盘空间不会释放，新日志继续写进这个看不见的文件，直到执行 `FLUSH SLOW LOGS` 或重启 MySQL。下面是三种安全做法，全部在 8.4.13 上实测过（实测时为了快速产生日志，把阈值设成了 0）。

### 做法 A：改名后执行 FLUSH SLOW LOGS（推荐）

```bash
cd /var/log/mysql            # 慢日志所在目录
mv mysql-slow.log mysql-slow.log.$(date +%Y%m%d%H%M%S)
mysql -uroot -p -e 'FLUSH SLOW LOGS'
gzip mysql-slow.log.2026*    # 压缩或拷走旧文件，再按需删除
```

实测过程：

```text
    709052 slow.log
$ mv slow.log slow.log.20261124192835
    827491 slow.log.20261124192835      # 改名后、FLUSH 前，新日志仍写进改名后的文件（同一个 inode）
$ mysql -e 'FLUSH SLOW LOGS'
    119052 slow.log                     # mysqld 重新打开原文件名，新建 slow.log
    827712 slow.log.20261124192835      # 旧文件不再增长（多出的 221 字节是 FLUSH 语句本身的记录）
$ gzip slow.log.20261124192835
    19606 slow.log.20261124192835.gz
```

所以 `mv` 之后一定要 FLUSH，否则日志还在往旧文件里写。`FLUSH SLOW LOGS` 只重新打开慢日志，不影响 binlog 和错误日志。官方文档还给了另一种不用 FLUSH 的写法：先 `SET GLOBAL slow_query_log = OFF`，改名后再 `ON`。

### 做法 B：原地清空（应急）

磁盘快满、来不及处理时：

```bash
truncate -s 0 /var/log/mysql/mysql-slow.log
```

实测清空后文件从 0 字节开始继续增长，开头就是新的完整记录，没有出现空洞，也不需要重启：

```text
$ truncate -s 0 slow.log
    0 slow.log
    2799 slow.log
# Time: 2026-11-24T12:28:36.055947Z
# User@Host: root[root] @ localhost []  Id:    19
```

缺点是旧内容直接没了，需要保留的先拷走再清空。

### 做法 C：logrotate 定时轮转

长期开着慢日志的机器，交给 logrotate。下面是 Docker 部署时在宿主机上的配置（日志目录已挂载到宿主机）。如果 MySQL 直接装在机器上，把 postrotate 里的命令换成 `mysqladmin flush-logs slow`，账号密码放在 root 的 `~/.my.cnf` 里：

```text
/data/mysql-log/slow.log {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    dateext
    nocreate
    sharedscripts
    postrotate
        docker exec mysql mysqladmin flush-logs slow
    endscript
}
```

- `nocreate`：不让 logrotate 自己创建新文件，由 mysqld 在 flush 时创建，避免属主和权限不对。
- `mysqladmin flush-logs slow`：只刷新慢日志。运维在 MySQL 8.4.13 上核对过，这条命令实际发送的是 `FLUSH SLOW LOGS`，不会切换 binlog。注意不要写成不加类型的 `mysqladmin flush-logs`，那会执行 `FLUSH LOGS`，连 binlog 一起轮转。实测 logrotate 3.22.0 连续轮转两次，每次都生成新的 `slow.log`，上一份被 gzip 压缩。
- 实测时容器内凭据用 `-e MYSQL_PWD=...` 传入，这只是演示。生产环境建议在容器内配置 `~/.my.cnf`（权限 600）或使用 socket 认证，不要把密码写进 logrotate 配置。
- logrotate 要求配置文件属主是 root，否则会报 `Ignoring ... because the file owner is wrong` 并跳过（实测踩到过）。

测试配置时可以用 `logrotate -d` 预演，`logrotate -f` 强制执行一次。

### 排查结束：关掉或调高阈值

```sql
SET PERSIST slow_query_log = OFF;      -- 或者把 long_query_time 调回 1~2 秒长期保留
```

实测关闭后再执行 500 条语句，文件大小不变（237274 → 237274）。

### 如果 log_output=TABLE

慢日志写在 `mysql.slow_log` 表里，清理用：

```sql
TRUNCATE TABLE mysql.slow_log;
```

实测清理前 205 行，清理后剩 1 行，这 1 行是阈值为 0 时 TRUNCATE 语句本身被记了下来。

## 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改了 `long_query_time`，慢 SQL 还是没记 | 全局值只对新连接生效 | 用新连接测试；应用连接池等连接重建 |
| 改了 my.cnf 不生效 | 之前用 SET PERSIST 设置过 | 查 `performance_schema.persisted_variables`，用 `RESET PERSIST` 清除 |
| 删了日志磁盘没变 | mysqld 持有已删除的文件 | `FLUSH SLOW LOGS` |
| 重建容器后找不到旧日志 | 默认文件名带容器 ID，又在数据卷里 | 用 `slow_query_log_file` 指定固定路径并挂载出来 |
| 日志里时间对不上 | `# Time` 是 UTC | 加 8 小时，或核对 `log_timestamps` 参数 |
| 小表的查询也被记了 | 开着 `log_queries_not_using_indexes` | 排查完关掉 |

## 安全注意

- 慢日志里是完整 SQL，可能包含手机号、订单号等业务数据，拷出分析后注意删除，不要随意发给外部。
- `EXPLAIN ANALYZE` 会真的执行语句，生产库上慎用。
- 命令行 `-p密码` 会留在 shell 历史和进程列表里，用 `~/.my.cnf` 或交互输入。

## 回滚

```sql
RESET PERSIST slow_query_log;
RESET PERSIST long_query_time;
RESET PERSIST log_queries_not_using_indexes;
SET GLOBAL slow_query_log = OFF;
SET GLOBAL long_query_time = 10;
ALTER TABLE orders DROP INDEX idx_customer_created;   -- 若是测试索引
```

实测回滚后 `persisted_variables` 中这三项为 0 条，重启后 `slow_query_log=0`、`long_query_time=10`。

## 官方参考

- The Slow Query Log：<https://dev.mysql.com/doc/refman/8.4/en/slow-query-log.html>
- Server Log Maintenance（改名与 flush）：<https://dev.mysql.com/doc/refman/8.4/en/log-file-maintenance.html>
- mysqldumpslow：<https://dev.mysql.com/doc/refman/8.4/en/mysqldumpslow.html>
- EXPLAIN / EXPLAIN ANALYZE：<https://dev.mysql.com/doc/refman/8.4/en/explain.html>
- Persisted System Variables（SET PERSIST）：<https://dev.mysql.com/doc/refman/8.4/en/persisted-system-variables.html>
- FLUSH 语句：<https://dev.mysql.com/doc/refman/8.4/en/flush.html>

