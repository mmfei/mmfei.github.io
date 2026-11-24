# Docker 日志清理与限制大小：日志在哪、怎么查看、应急清空与 max-size 根治


服务器磁盘报警，`du` 一查，`/var/lib/docker/containers/` 下某个 `*-json.log` 有几十 GB。这是 Docker 默认日志配置下很常见的情况：默认的 `json-file` 驱动不限制文件大小，容器只要一直往标准输出打日志，这个文件就会一直长。

这篇按排查顺序写：**日志在哪 → 怎么看 → 怎么安全清理 → 怎么用 max-size/max-file 根治 → 怎么核验和回滚**。所有输出都来自一次性测试容器，见文末“实测环境”。

和站内文章的分工：[阿里云的 CentOS 安装 docker-compose](https://www.mmfei.com/2022/01/阿里云的centos安装docker-compose/) 讲安装，[每日备份 Docker 部署的 GitLab 服务](https://www.mmfei.com/2021/06/每日备份docker部署的gitlab服务的最简单方案/) 讲备份；本文只讲容器标准输出日志的占用和限制。应用自己写到挂载目录里的日志文件（比如 `/data/app/logs/*.log`）不归 Docker 管，那类文件可以参考 [保留最新 N 个文件的 bash 脚本](https://www.mmfei.com/2021/06/保留最新n个文件的bash脚本/) 定期清理。

## 一、Docker 日志在哪

默认数据目录是 `/var/lib/docker`，每个容器的标准输出日志在：

```text
/var/lib/docker/containers/<容器完整ID>/<容器完整ID>-json.log
```

不用自己拼 ID，直接问 Docker：

```bash
docker info --format 'DockerRootDir={{.DockerRootDir}} LoggingDriver={{.LoggingDriver}}'
docker inspect --format '{{.LogPath}}' 容器名
```

实测输出：

```text
DockerRootDir=/var/lib/docker LoggingDriver=json-file
/var/lib/docker/containers/929afa9d302c8511568ef9f5cfa8f5800b0be22e308c4960ee89bf9cd5648fc5/929afa9d302c8511568ef9f5cfa8f5800b0be22e308c4960ee89bf9cd5648fc5-json.log
```

如果改过 `data-root`，以 `docker info` 显示的目录为准。用 `local` 驱动时 `LogPath` 是空的，文件在 `<容器目录>/local-logs/container.log`。

### 找出最占空间的容器日志

```bash
# 按大小列出最大的 10 个日志文件
sudo du -h /var/lib/docker/containers/*/*-json.log* | sort -rh | head -10

# 对应到容器名
for id in $(docker ps -aq); do
  p=$(docker inspect -f '{{.LogPath}}' "$id")
  [ -n "$p" ] && echo "$(docker inspect -f '{{.Name}}' "$id") $(sudo du -h "$p" | cut -f1)"
done
```

注意：`docker system df` 列的是镜像、容器、本地卷和构建缓存，没有单列容器日志，所以它看着正常不代表日志没占满磁盘，以 `du` 结果为准。

## 二、查看日志的常用命令

```bash
docker logs --tail 100 容器名          # 最后 100 行
docker logs -f --tail 50 容器名        # 持续跟踪，Ctrl+C 退出
docker logs -t --since 30m 容器名      # 带时间戳，最近 30 分钟
docker logs --since 2026-11-24T10:00:00 --until 2026-11-24T11:00:00 容器名
docker compose logs -f --tail 100 服务名
```

`-t` 打印的时间是 UTC（实测输出 `2026-11-24T12:15:51.859024216Z`，对应曼谷时间 19:15）。`--since` / `--until` 若不带 `Z` 或 `+07:00` 这类时区，会按客户端本地时区解析，不要把 `docker logs -t` 里的 UTC 时间去掉 `Z` 再贴进去，否则窗口会偏 7 小时、结果可能为空。排查时和业务日志对时间要注意换算。

## 三、日志已经很大了：怎么安全清理

### 推荐：给容器加上限制后重建

日志文件跟着容器走，**删除容器时日志文件一起删除**。所以最干净的做法是按第四节加好 `max-size`/`max-file`，然后重建容器：

```bash
# Compose 项目
docker compose up -d --force-recreate 服务名

# docker run 启动的容器：先记下原来的启动参数，再删掉重建
docker rm -f 容器名
docker run -d --name 容器名 --log-opt max-size=50m --log-opt max-file=3 ...原参数...
```

重建会短暂中断服务，旧日志也随之删除。需要留存的，先导出：

```bash
docker logs 容器名 > /backup/容器名-$(date +%F).log 2>&1
```

### 应急：不能停服务时用 truncate 清空

```bash
sudo truncate -s 0 "$(docker inspect --format '{{.LogPath}}' 容器名)"
```

实测：清空后文件从 3856342 字节变为 0，3 秒后变成 252 字节，容器保持 `running`，新日志继续从文件开头写入，不会留下空洞。

但要知道两点：

1. Docker 官方文档明确提示，`json-file` 和 `local` 的日志文件应由 Docker 守护进程独占访问，用外部工具操作“可能干扰日志系统，应当避免”。所以 truncate 只作为磁盘告急时的应急手段，事后一定要按第四节根治。
2. 本次实测中，truncate 之后执行 `docker logs --tail 2 容器名` 挂住超过 60 秒没有返回，最后手动结束；容器本身一直在运行。如果你清空后遇到 `docker logs` 卡住，重建容器即可恢复。

### 不要直接 rm 日志文件

很多人第一反应是 `rm` 掉那个大文件，这样**磁盘空间不会释放**，还会让 `docker logs` 报错。实测：

```text
$ rm -f /var/lib/docker/containers/6609.../6609...-json.log
$ ls -l /proc/<dockerd PID>/fd | grep 6609...-json.log
l-wx------ 1 root root 64 Nov 24 19:11 40 -> /var/lib/docker/containers/6609.../6609...-json.log (deleted)
$ docker logs --tail 2 logclean-b
error from daemon in stream: Error grabbing logs: open /var/lib/docker/containers/6609.../6609...-json.log: no such file or directory
```

dockerd 仍持有已删除文件的句柄，空间要等容器删除或 Docker 重启后才回收。已经误删的，直接重建这个容器。

## 四、根治：用 max-size 和 max-file 限制日志大小

`json-file` 的官方默认值是 `max-size=-1`（不限）、`max-file=1`、`compress=false`。`max-file` 只有在设置了 `max-size` 时才生效。下面三种方式任选，生产环境建议“全局默认 + 个别容器覆盖”。

### 方式 1：单个容器 docker run

```bash
docker run -d --name app \
  --log-driver json-file \
  --log-opt max-size=50m \
  --log-opt max-file=3 \
  nginx:1.27
```

单个容器最多占用约 `50m × 3 = 150m`。

### 方式 2：Compose 文件里按服务配置

```yaml
services:
  app:
    image: nginx:1.27
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "3"
```

改完执行 `docker compose up -d`，Compose 发现配置变化会重建该服务的容器。实测输出 `Container logrecreate-app-1  Recreated`，容器 ID 变了，`LogConfig` 变成 `{"max-file":"3","max-size":"50m"}`。

### 方式 3：daemon.json 全局默认

编辑 `/etc/docker/daemon.json`（没有就新建）：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
```

注意 `log-opts` 里的值**必须是字符串**，`"3"` 不能写成 `3`。然后：

```bash
sudo python3 -m json.tool /etc/docker/daemon.json > /dev/null && echo JSON OK
sudo systemctl restart docker
docker info --format '{{.LoggingDriver}}'
```

### 关键：只对新建的容器生效

这是最容易踩的坑。修改 daemon.json 并重启 Docker 后：

- 已有容器的 `LogConfig` 不变，`docker start` 之后也不会变（实测）；
- 只有之后**新建**（包括 `docker rm` 后重建、`compose up --force-recreate`）的容器才继承新默认值。

实测（daemon.json 设为 100k/3 后）：

```text
/logtest-nolimit {"Type":"json-file","Config":{}}                              # 改配置前创建的旧容器
/logtest-nolimit 重启后 {"Type":"json-file","Config":{}}                       # docker start 后仍然不变
/logtest-new {"Type":"json-file","Config":{"max-file":"3","max-size":"100k"}}  # 新建容器继承默认值
/logtest-nolimit {"Type":"json-file","Config":{"max-file":"3","max-size":"100k"}}  # rm 后同名重建才生效
```

另外，未开启 `live-restore` 时，`systemctl restart docker` 会停止所有运行中的容器（实测重启守护进程后旧容器处于停止状态，需要 `docker start`；设置了 `restart: always/unless-stopped` 的会自动拉起）。生产机请放在维护窗口操作。

## 五、核验是否真的生效

**1. 看容器的实际配置**（不要只看 daemon.json）：

```bash
docker inspect -f '{{.Name}} {{json .HostConfig.LogConfig}}' $(docker ps -q)
```

实测输出：

```text
{"Type":"json-file","Config":{"max-file":"3","max-size":"100k"}}
```

`Config` 为 `{}` 的就是还没限制的容器。

**2. 看日志文件是否在轮转**。测试容器连续输出 2 万行、`max-size=100k max-file=3`：

```text
-rw-r----- 1 root root  65608 Nov 24 19:09 3f15...-json.log
-rw-r----- 1 root root 100023 Nov 24 19:09 3f15...-json.log.1
-rw-r----- 1 root root 100014 Nov 24 19:09 3f15...-json.log.2
268K	total
```

对照组不加限制的同样容器，单个文件 2566632 字节且继续增长。

**3. 知道轮转的代价**：旧日志被删除后 `docker logs` 也看不到了。上面这个容器写了 2 万行，`docker logs` 只能返回最后 2061 行（`line 17939` 到 `line 19999`）。需要长期保留的日志，应该发到日志系统，而不是靠调大 `max-size`。

## 六、local 驱动要不要换

`local` 驱动默认就有限制：每个文件 `20m`、保留 `5` 个、轮转文件默认压缩，每个容器约 100MB。实测 `--log-driver local --log-opt max-size=100k --log-opt max-file=3`：

```text
{"Type":"local","Config":{"max-file":"3","max-size":"100k"}} LogPath=""
-rw-r----- 1 root root 8342 Nov 24 19:10 container.log
-rw-r----- 1 root root 6508 Nov 24 19:10 container.log.1.gz
-rw-r----- 1 root root 6498 Nov 24 19:10 container.log.2.gz
```

取舍：

| | json-file | local |
| --- | --- | --- |
| 默认是否限制 | 不限制 | 约 100MB/容器 |
| 文件格式 | 每行一个 JSON，可直接 `tail`/采集 | 内部二进制格式，只能用 `docker logs` 读 |
| 压缩 | 默认不压缩 | 默认压缩 |
| 适合 | 有 Filebeat/Fluent Bit 等按文件采集 | 不采集文件、只用 `docker logs` 看的单机 |

如果你的日志采集器是直接读 `*-json.log` 文件的，不要切 `local`，给 `json-file` 加限制即可。

## 常见问题

**改了 daemon.json，dockerd 起不来。** 多半是 JSON 写错或数值没加引号。实测把 `max-size` 写成数字 `100` 时 dockerd 报错退出：

```text
unable to configure the Docker daemon with file /etc/docker/daemon.json: json: cannot unmarshal number into Go struct field Config.CommonConfig.LogConfig.log-opts of type string
```

先用 `python3 -m json.tool` 检查，再看 `journalctl -u docker -n 50`。

**想单个容器显式写“不限制”。** 实测 Docker 26.1 的 `--log-opt max-size=-1` 会让容器启动失败（`invalid size: '-1'`），不要这么写；去掉 `max-size` 选项、并确认全局默认里没设置即可。

**改了配置，磁盘还是满的。** 确认容器已经重建（看 `LogConfig`）；确认不是应用写在容器可写层或挂载卷里的文件（用 `docker system df -v` 和 `du` 分别看）。

**docker compose logs 看不到更早的日志。** 已被轮转删除，这是预期行为。

## 安全注意

- `/var/lib/docker` 需要 root 权限，操作前确认路径来自 `docker inspect`，不要用通配符批量 `truncate`/`rm` 整个目录。
- 日志里可能有请求参数、Token、手机号等敏感信息，导出备份时注意权限（如 `chmod 600`），不要上传到公开位置。
- 重启 Docker 和重建容器都会中断服务，生产环境先在维护窗口或单台机器验证。

## 回滚方法

- **单容器 / Compose**：删掉 `--log-opt` 或 `logging:` 段，再重建容器。
- **daemon.json**：改之前先备份 `sudo cp /etc/docker/daemon.json /etc/docker/daemon.json.bak-$(date +%F)`；回滚时恢复备份（或删掉 `log-opts` 段），校验 JSON 后 `sudo systemctl restart docker`。同样只影响之后新建的容器。
- truncate 和轮转删除的日志无法恢复，需要的请先 `docker logs > 文件` 导出。

## 实测环境与来源

- 测试时间：2026-11-24 19:09–19:17（曼谷时间）。
- 环境：Debian 13（trixie），内核 6.12；Docker Engine 26.1.5+dfsg1（Debian 软件包），Docker Compose 2.26.1，镜像 `busybox:1.36`；一次性测试容器，测完已删除。守护进程不是 systemd 托管，重启用的是结束进程后重新启动，生产机对应 `systemctl restart docker`。
- 未实测：Docker Desktop、rootless 模式、`live-restore` 开启时的重启行为、Docker 官方 docker-ce 软件包（本次是 Debian 打包版本，行为预期一致但未验证）。
- 官方文档（2026-11-24 读取）：
  - [JSON File logging driver](https://docs.docker.com/engine/logging/drivers/json-file/)
  - [Local file logging driver](https://docs.docker.com/engine/logging/drivers/local/)
  - [Configure logging drivers](https://docs.docker.com/engine/logging/configure/)
  - [docker container logs](https://docs.docker.com/reference/cli/docker/container/logs/)
  - [Compose 文件 logging 字段](https://docs.docker.com/reference/compose-file/services/#logging)

