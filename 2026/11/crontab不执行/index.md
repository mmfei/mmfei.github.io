# crontab 不执行、手动却可以：PATH、百分号、权限、工作目录和怎么查日志


写好了 crontab，脚本在终端里跑得通，到点却没反应，或者根本不知道有没有跑过。这通常不是「cron 坏了」，而是 cron 的环境和手工执行不一样。这篇按本机实测，把最常见的几类失败对上原因和改法。

常被放进 crontab 的日志轮转脚本，可以参考 [保留最新 N 个文件的 bash 脚本](https://www.mmfei.com/2021/06/保留最新n个文件的bash脚本/)。

## 一、先确认 cron 能跑

用一条每分钟任务验证「到点会执行」。输出写到你指定的文件，不要依赖系统邮件：

```bash
crontab -e
```

```cron
# 先确认能跑，验证完删掉
* * * * * date -Iseconds >> /tmp/cron-baseline.log 2>&1
```

本机在 09:20:01 和 09:22:01（Asia/Bangkok）各写下了一行，说明 `/usr/sbin/cron` 在运行、用户 crontab 已被加载、时间字段也生效。若过了两分钟文件还是空的，再查用户是否允许使用 crontab（`/etc/cron.allow` / `/etc/cron.deny`）、crontab 最后一行是否有换行（Debian `crontab(5)` 写明缺换行会被视为损坏），以及系统时间是否正确。

用户 crontab 是五段时间 + 命令，不要写成 `/etc/crontab` 那种六段（中间多一个用户名）。本机没有改 `/etc/crontab` 或他人的 crontab。

## 二、cron 的默认环境和手工执行不一样

本机用一条任务把 cron 里的环境完整打出来。用户 crontab、未另行设置时只有这些：

```text
HOME=/home/box
LOGNAME=box
MAILTO=
PATH=/usr/bin:/bin
PWD=/home/box
SHELL=/bin/sh
```

对照要点：

- `PATH` 只有 `/usr/bin:/bin`，没有 `/usr/local/bin`，也没有你在交互 shell 里加过的目录。
- 工作目录是家目录（这里是 `/home/box`），不是你手工执行时所在的项目目录。
- `SHELL` 是 `/bin/sh`，不是 bash；不会自动读 `~/.bashrc`。
- `HOME`、`LOGNAME` 会按 `/etc/passwd` 设置（与 `crontab(5)` 一致）。本机 `USER` 未设置。
- 自定义变量（例如应用要的 token）默认没有。

`crontab(5)` 还写明：环境变量赋值**不会**做 `$PATH` 或 `~` 展开。写成 `PATH=$HOME/bin:$PATH` 不会按你在 shell 里的习惯工作。要改 PATH，写绝对路径列表。

## 三、典型失败：手工成功，cron 失败

以下每条都在本机做过对照。失败任务跑在 09:20（以及随后一分钟），修复后的任务跑在 09:22。

### 1. PATH 过短

准备一个只存在于自定义目录的命令 `/tmp/mmfei-20261125-cron/bin/mmfei-hello`，脚本里直接调用 `mmfei-hello`。

手工把该目录加进 PATH 后成功：

```text
PATH=/tmp/mmfei-20261125-cron/bin:...
command -v mmfei-hello: /tmp/mmfei-20261125-cron/bin/mmfei-hello
mmfei-20261125-hello-ok
```

cron 默认 `PATH=/usr/bin:/bin`，同样的脚本：

```text
PWD=/home/box
PATH=/usr/bin:/bin
command -v mmfei-hello: not found
/tmp/mmfei-20261125-cron/path-test.sh: 11: mmfei-hello: not found
```

修复：在 crontab 里写绝对路径，或显式设置 PATH：

```cron
PATH=/tmp/mmfei-20261125-cron/bin:/usr/bin:/bin
* * * * * /bin/sh /tmp/mmfei-20261125-cron/path-test.sh >> /tmp/path-ok.log 2>&1
```

09:22 的输出里 `command -v mmfei-hello` 已能找到，命令执行成功。本机 `/usr/bin/python3`、`/usr/bin/date` 在默认 PATH 里，这类命令不会踩这个坑；容易出问题的是装在 `/usr/local/bin`、`$HOME/.local/bin` 或项目 `bin` 里的命令。

### 2. `%` 会被当成换行

Debian `crontab(5)` 原文：命令字段里未用反斜杠转义的 `%` 会变成换行，第一个 `%` 之后的内容作为该命令的标准输入。

手工执行 `date +%F` 得到 `2026-11-25`。把同样写法放进 crontab（为了能把错误写进日志，把重定向放在第一个 `%` 之前）：

```cron
* * * * * exec >> /tmp/date-unescaped.log 2>&1; echo start; date +%F; echo after-date
```

cron 实际执行的是 `exec >> ...; echo start; date +`，后面的 `F; echo after-date` 变成了 `date` 的标准输入。日志只有：

```text
mmfei-20261125-pct-unescaped start
```

`after-date` 没有作为命令执行，也没有写出日期。

转义后：

```cron
* * * * * date +\%F > /tmp/date-escaped.log 2>&1
```

```text
2026-11-25
mmfei-20261125-pct-escaped ok
```

`date +%F`、`date +%Y-%m-%d`，以及 `mysqldump`、`find -printf` 里的 `%`，在 crontab 里都要写成 `\%`。

### 3. 没有可执行权限，或 shebang 不对

脚本内容没问题，但权限是 `644`（没有 `+x`）。手工用解释器打开成功：

```bash
/bin/bash /tmp/mmfei-20261125-cron/perm-test.sh    # 成功
/tmp/mmfei-20261125-cron/perm-test.sh              # Permission denied，退出码 126
```

cron 里直接写脚本路径，等同于直接执行：

```text
/bin/sh: 1: /tmp/mmfei-20261125-cron/perm-test.sh: Permission denied
```

加上 `chmod +x` 后，09:22 的 cron 任务执行成功。也可以不改权限，改成 `/bin/bash /path/to/script.sh`。

shebang 指向不存在的解释器时是另一类失败。本机脚本第一行是 `#!/usr/bin/mmfei-no-such-interpreter`，手工 `bash 脚本` 会忽略 shebang、执行成功；直接执行则报 `cannot execute: required file not found`（退出码 127）。cron 里是：

```text
/bin/sh: 1: /tmp/mmfei-20261125-cron/shebang-bad.sh: not found
```

修复：把 shebang 改成真实存在的解释器（如 `#!/bin/bash` 或 `#!/bin/sh`），或在 crontab 里用 `/bin/bash /path/to/script.sh` 调用。后者在 09:22 实测成功。

### 4. 工作目录不是你以为的那个

脚本用相对路径读 `secret.txt`。在文件所在目录手工执行成功；在家目录执行则 `cat: secret.txt: No such file or directory`。

cron 的 `PWD` 是 `/home/box`，同样失败：

```text
PWD=/home/box
pwd=/home/box
relative cat secret.txt: cat: secret.txt: No such file or directory
cat-exit=1
```

修复：在 crontab 里先 `cd` 到目标目录，或全部改成绝对路径：

```cron
* * * * * cd /tmp/mmfei-20261125-cron/workdir && /tmp/mmfei-20261125-cron/cwd-test.sh >> /tmp/cwd-ok.log 2>&1
```

09:22 输出：`PWD=/tmp/mmfei-20261125-cron/workdir`，相对路径读取成功。

### 5. 缺少应用依赖的环境变量

本机 cron 会设置 `HOME`，但不会设置你在 `.bashrc` 里 export 的变量。用自定义变量 `MMFEI_TOKEN` 做对照：脚本在变量为空时退出 1。

手工 `MMFEI_TOKEN=secret-mmfei-20261125` 执行成功；不设则失败。cron 未声明该变量时：

```text
HOME=/home/box
SHELL=/bin/sh
PATH=/usr/bin:/bin
LOGNAME=box
USER=<unset>
PWD=/home/box
MMFEI_TOKEN is empty/unset
```

在 crontab 里加入 `MMFEI_TOKEN=secret-mmfei-20261125` 后，09:22 任务报告变量已设置（长度为 21）。需要的变量要写在 crontab 里，或在脚本开头显式加载配置文件，不要指望 `.bashrc`。

## 四、怎么看出 cron 有没有跑过

最可靠的办法是任务自己写日志：

```cron
MAILTO=""
* * * * * /path/to/job.sh >> /var/log/myjob.log 2>&1
```

`2>&1` 把错误也记下，否则权限问题和「command not found」可能只进邮件，你在文件里看不到。

本机还查了系统日志，结果如下，供对照：

- `/var/log/syslog`、`/var/log/cron`、`/var/log/messages` 都不存在。
- `journalctl` 无论是否用 root，都提示 *No journal files were found*；`/var/log/journal` 是空目录。本机 PID 1 是 `tini`，不是 systemd，`systemd-journald` 未运行。
- `/dev/log` 是指向 `/run/systemd/journal/dev-log` 的悬空符号链接，syslog 套接字不可用。
- 任务设置了 `MAILTO=""`，`/var/mail` 下也没有用户邮件。

也就是说，在这台机器上**看不到** cron 守护进程自己的执行记录，只能靠任务重定向的文件判断有没有跑、跑出了什么错。`cron(8)` 写明日志打到 syslog 的 `cron` facility；在常见的 Debian systemd 机器上，一般会去看 `/var/log/syslog`（或 `journalctl -u cron` / `journalctl -t cron`）。**这些查法未在本机实测**，因为这里没有 syslog、也没有用 systemd 拉起 cron。

生产机若用 systemd 管理 cron，可以用 `systemctl status cron` 看服务是否在跑。本机 PID 1 不是 systemd，这条也未实测。

## 五、常见问题与安全注意

**改完 crontab 要等多久？** cron 每分钟检查一次 spool。本机用 `crontab` 命令装入后，下一分钟就会跑，不用重启 cron。不要为了「马上看效果」去 `kill` 系统 cron。

**交互 shell 能跑，cron 不能。** 按第三节的顺序查：PATH、`%`、权限与 shebang、工作目录、环境变量。把 cron 的 `env` 重定向到文件，和手工 `env` 对比最快。

**任务重叠。** 每分钟（或每小时）任务如果跑不完，下一轮可能再起一条。本篇未测锁与超时，需要时在脚本里用 `flock` 一类互斥。

**不要在 crontab 里写破坏性命令的相对路径。** 工作目录是家目录，`rm *.log` 之类很容易删错地方。一律绝对路径，先在测试目录验证。

**`/etc/crontab` 和 `/etc/cron.d/` 多一列用户名**，格式与用户 crontab 不同。没有把握不要改系统 crontab。

## 六、回滚

```bash
crontab -l              # 先看当前内容
crontab -l > crontab.bak
crontab crontab.bak     # 恢复
crontab -r              # 删除当前用户的全部 crontab（本机测试后已恢复为空）
```

只删某一行时，把 `crontab -l` 的备份改好再装回去，不要直接改 `/var/spool/cron/crontabs/` 下的文件。

## 七、实测环境与来源

- 测试时间：2026-11-25 09:18–09:23，Asia/Bangkok（UTC+7）。
- 系统：Debian 13 (trixie)，内核 6.12.113，cron 3.0pl1-197（`/usr/sbin/cron` 已在运行，非 systemd 拉起）。用户 `box` 的 crontab 原先为空。
- 所有条目都带标记 `mmfei-20261125`，输出只写入 `/tmp/mmfei-20261125-cron/`。测完已 `crontab -r`，用户 crontab 恢复为空；未改 `/etc/crontab`、`/etc/cron.d/` 或他人 crontab。
- 已实测：每分钟任务能跑；默认环境（`PATH=/usr/bin:/bin`、工作目录为 `$HOME`、`SHELL=/bin/sh`、`HOME`/`LOGNAME` 有值、`USER` 未设置）；PATH 过短导致自定义命令失败，设置 PATH 或绝对路径后成功；未转义 `%` 使 `date +%F` 失败，`\%` 后成功；无执行权限、错误 shebang 的失败与修复；相对路径因工作目录不是预期目录而失败，`cd` 到目标目录后成功；缺少自定义环境变量失败，在 crontab 中声明后成功；本机系统日志路径与查不到 cron 守护进程记录的情况。
- 未实测：crontab 末行缺换行导致的损坏；`/etc/cron.allow`、`/etc/cron.deny`；`/etc/crontab` 与 `/etc/cron.d/` 的系统格式；`cron` 的 systemd 服务管理（`systemctl status cron`）以及 `journalctl -u cron`、`/var/log/syslog` 中的 CRON 记录（本机无 systemd、无 syslog）；PAM 或 SELinux 对 cron 的影响；任务重叠与 `flock`。
- 官方文档（2026-11-25 查阅）：
  - https://manpages.debian.org/trixie/cron/crontab.5.en.html
  - https://manpages.debian.org/trixie/cron/cron.8.en.html

