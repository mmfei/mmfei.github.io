# Docker 磁盘满了怎么清理：先用 system df 查占用，再按容器、镜像、卷和构建缓存安全清理


`df` 显示磁盘快满，`du` 指向 Docker 数据目录，但不一定是日志。镜像、已退出容器的可写层、卷、构建缓存都会占空间。这篇按排查顺序写：**先查清空间去向，再按对象做有针对性的清理**，并实测 `docker system prune -a` 会删掉「没在跑、但你可能还想留」的镜像。

容器标准输出日志（`*-json.log`）是另一类常见原因，清理和 `max-size` 限制见 [Docker 日志清理与限制大小](https://www.mmfei.com/2026/11/docker日志清理与限制大小/)，本文不再重复 truncate 或改日志驱动的步骤。应用自己写到挂载目录里的日志文件，可以参考 [保留最新 N 个文件的 bash 脚本](https://www.mmfei.com/2021/06/保留最新n个文件的bash脚本/)。

`docker system df` 列的是镜像、容器、本地卷和构建缓存，**没有单列容器日志**。df 看起来正常，磁盘仍满，先按日志那篇用 `du` 查 `*-json.log`。

## 一、结论速查

| 你想删的东西 | 命令 | 实测结果（Docker 26.1.5） |
| --- | --- | --- |
| 已退出的容器（含可写层） | `docker container prune` | 只删退出的容器；正在运行的不动 |
| 悬空镜像（`<none>:<none>`） | `docker image prune`（不加 `-a`） | 只删悬空镜像；带标签但没被容器用的镜像还在。本实测回收显示 0B，层还留在构建缓存里 |
| 构建缓存 | `docker builder prune` | 回收未被镜像占用的缓存；与现有镜像共享的层会留下 |
| 未使用的匿名卷 | `docker volume prune` 或 `docker system prune --volumes` | 只删匿名未用卷；**具名未用卷还在** |
| 未使用的具名卷 | `docker volume prune -a` | 会删掉没有容器引用的具名卷，数据不可恢复 |
| 退出的容器 + 悬空镜像 + 未用网络 + 构建缓存 | `docker system prune`（不加 `-a`、不加 `--volumes`） | **不删**带标签的未用镜像，**不删**卷 |
| 再加「所有未被容器引用的镜像」 | `docker system prune -a` | 会删掉未用但带标签的镜像（本实测中的 `mmfei-keep:latest` 被删）。正在运行的容器及其镜像还在 |
| 只停容器、不删 | `docker stop` | 可写层空间**不会**收回，必须 `docker rm` |

不要一上来就跑 `docker system prune -a`，更不要 `--volumes` 一起加。不要执行 `rm -rf /var/lib/docker`：那会丢掉这个守护进程上的全部镜像、容器、卷和网络。

## 二、先确认数据目录，再看 df

数据目录以 `docker info` 为准，不要假定一定是 `/var/lib/docker`（改过 `data-root` 时路径不同）：

```bash
docker info --format '{{.DockerRootDir}} {{.Driver}} {{.LoggingDriver}} {{.ServerVersion}}'
sudo du -sh "$(docker info --format '{{.DockerRootDir}}')"
docker system df
docker system df -v
```

本机共享守护进程的输出：

```text
/var/lib/docker overlay2 json-file 26.1.5+dfsg1
```

下面的清理对照是在一个**独立的临时 dockerd**（`--data-root` 为 `/tmp/mmfei-20261125-dockerd-data`）上做的，避免误清理这台机器上的共享 Docker。生产环境直接对正在提供服务的守护进程执行即可，但命令效果相同，风险也相同。

空库时 `docker system df` 四行都是 0。拉取 `alpine:latest`（8.43MB，镜像 ID `3ea06e4cb95e`），再造出未用镜像、悬空镜像、退出的容器、未用卷和构建缓存之后：

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          5         1         27.31MB   27.31MB (100%)
Containers      3         2         7B        7B (100%)
Local Volumes   3         1         15.73MB   15.73MB (99%)
Build Cache     12        0         532B      532B
```

`docker system df -v` 能对上具体对象。当时镜像包括：

- `alpine:latest`（3 个容器在用）
- `mmfei-keep:latest`（带标签、没有容器用，模拟「还想留着的镜像」）
- `mmfei-dangling:demo`、`mmfei-cache:demo`（带标签、未用）
- `<none>:<none>`（同一标签打过两次，旧镜像变成悬空）

卷包括：匿名未用卷约 7.34MB、具名未用卷 `mmfei-named-unused` 约 8.39MB、正在被容器使用的 `mmfei-used-vol`。

百分比有时不好直接解读（上面 Images 的 RECLAIMABLE 曾显示 100%，但 alpine 实际还被运行中的容器引用）。以 `-v` 明细和 `docker images`、`docker ps -a`、`docker volume ls` 为准。

另外，容器正在运行时，对数据目录做 `du` 可能把 overlay 的 `merged` 和 `diff` 重复计算，数字会偏大。看可写层大小，优先用 `docker system df` 和 `docker ps -s`。

## 三、按对象清理：每条命令实际删了什么

下面都加了 `-f` 以免交互确认卡住；生产上第一次建议先不加 `-f`，看警告再确认。

### 1. `docker container prune`：只删已退出的容器

```bash
docker container prune -f
```

```text
Deleted Containers:
5e4e93e64e2c61ad10980ad2198f635489c8e6583f72d08c6f4bcae20f169a12

Total reclaimed space: 7B
```

退出的 `mmfei-exited` 被删；`mmfei-running`、`mmfei-running-vol` 仍在运行。可写层里如果写过较大文件，回收的就是这一块，见第七节。

### 2. `docker image prune`（不加 `-a`）：只删悬空镜像

```bash
docker image prune -f
```

```text
Deleted Images:
deleted: sha256:bf2eaf9377448e8ab9ea8f18ac095b6d53529bd15262a8bfde6865d9d9ef4aaa

Total reclaimed space: 0B
```

`<none>:<none>` 没了，`mmfei-keep:latest` 等带标签镜像都还在。回收显示 0B，是因为那一层随即出现在构建缓存里：`Build Cache` 从 532B 变成了 4.195MB。只跑 `image prune` 不一定能把磁盘空间要回来，还需要清理构建缓存。

### 3. `docker builder prune`：清构建缓存

```bash
docker builder prune -f
docker builder du
```

这次回收了 4.195MB（上一步留下来的悬空层）。`docker builder du` 里仍有带 `*` 的项，那是和现有镜像共享的层，不会在这次「只清未用缓存」里删掉。

### 4. `docker system prune`（不加 `-a`、不加 `--volumes`）

先再造一个已退出容器，并把旧镜像打成悬空，然后：

```bash
docker system prune -f
```

```text
Deleted Containers:
f7ace2af1183896cf8670a9c271539a9f3d7405f8de682ea3cec9606e09c0f34

Deleted Images:
deleted: sha256:833737456d3ecbc477f482fb6944710e1bbb85078af4f19faca6593a1250da79
deleted: sha256:34553c727cf4c58df39dc7fd730226d32315a92ade39a99482214ec74d02796e

Deleted build cache objects:
...

Total reclaimed space: 9.438MB
```

删掉的是退出的容器、**悬空**镜像和未用构建缓存。`mmfei-keep:latest` 还在，三个卷也还在，运行中的容器还在。数据目录从约 62MB 降到 53MB。

官方文档对这条命令的警告是：将删除所有已停止容器、未被容器使用的网络、悬空镜像和未用构建缓存。与实测一致。

## 四、`docker system prune -a` 的危险

先放一个「没在用、但还想留」的镜像 `mmfei-keep:latest`（ID `7389a5ce6043`，约 13.7MB），再执行：

```bash
docker system prune -a -f
```

```text
Deleted Images:
untagged: mmfei-keep:latest
deleted: sha256:7389a5ce6043b22331227d7e86d84556c6deb3653cd403298baea0fcf89e1c9c
untagged: mmfei-dangling:demo
deleted: sha256:dd947d5f865e63d45b8f40141742c3abfdaabe9a0e58b5ba14119d21363c2b5e
untagged: mmfei-cache:demo
deleted: sha256:b5031995fc9d5fe48ca9b801f5f20933ace10e6ed14736e080cd09c22e823863

Deleted build cache objects:
...

Total reclaimed space: 9.437MB
```

之后 `docker images -a` 只剩正在被容器使用的 `alpine:latest`。`mmfei-keep:latest` 已经不在——这就是 `-a` 的危险：它会删除**所有没有被至少一个容器引用的镜像**，不管有没有标签、你是不是还准备稍后再用。

运行中的容器还在：

```text
CONTAINER ID   IMAGE           STATUS          NAMES
d050f62296cf   alpine:latest   Up 37 seconds   mmfei-running-vol
861abbc1ceb2   alpine:latest   Up 37 seconds   mmfei-running
```

`-a` **不会**删正在运行的容器，也不会删它们正在用的镜像。它删的是「现在没人用」的镜像。

这次没有加 `--volumes`，具名卷 `mmfei-named-unused` 和正在使用的 `mmfei-used-vol` 都还在。

如果确实要清掉长期不用的旧镜像，优先用带过滤的方式，例如只删若干小时之前的：

```bash
docker image prune -a --filter "until=24h"
```

先用 `docker images` 核对再执行。过滤语法见官方 `docker image prune` 文档。

## 五、卷：默认 prune 不会删，`--volumes` 也只删匿名卷

官方说明：默认不删除卷，以免容器暂时不在时把数据清掉。实测与文档一致。

`docker system prune`（不加 `--volumes`）之后，匿名未用卷、具名未用卷、正在用的卷都还在。

再加上 `--volumes`：

```bash
docker system prune -f --volumes
```

```text
Deleted Volumes:
4e07bf81fd952a2075e5b53cd75a5a81f8a68d2c53f015596842e4e215b1da14

Total reclaimed space: 7.34MB
```

只删除了**匿名**未用卷。具名未用卷 `mmfei-named-unused` 还在。官方警告原文也写的是 *all anonymous volumes not used by at least one container*。

`docker volume prune`（不加 `-a`）同样只删匿名未用卷。要删具名未用卷必须显式加 `-a`：

```bash
docker volume prune -f        # 本实测回收 0B，具名未用卷仍在
docker volume prune -a -f
```

```text
Deleted Volumes:
mmfei-named-unused

Total reclaimed space: 8.389MB
```

之后只剩正在被 `mmfei-running-vol` 使用的 `mmfei-used-vol`。正在使用的卷不会被 prune 掉。

**具名卷里往往是数据库或业务数据。** 没有备份不要跑 `volume prune -a`，也不要把 `--volumes` 和 `-a` 随手组合在 `system prune` 上。

## 六、可写层：只停不删，空间还在

容器里写到容器文件系统（不是卷）的数据，落在可写层。用 `alpine` 起一个容器，在里面写入 30MB：

```bash
docker run -d --name mmfei-writable alpine:latest sh -c 'sleep 3600'
docker exec mmfei-writable sh -c 'dd if=/dev/zero of=/big.bin bs=1M count=30'
docker system df
docker ps -s --filter name=mmfei-writable
```

写入后：

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          1         1         8.431MB   0B (0%)
Containers      3         3         31.46MB   0B (0%)
```

```text
088ef8a7d057   alpine:latest   ...   mmfei-writable   31.5MB (virtual 39.9MB)
```

`SIZE` 是可写层，`virtual` 是可写层加镜像。对应的 overlay `UpperDir` 约为 31MB，里面能看到 `big.bin`。

只执行 `docker stop mmfei-writable`：

```text
Containers      3         2         31.46MB   31.46MB (100%)
```

容器变成 `Exited`，`UpperDir` 里的 `big.bin` 还在，`docker system df` 仍显示 31.46MB，只是变成可回收。 **只停不删，空间不会回来。**

再执行 `docker rm mmfei-writable`：Containers 的 SIZE 回到 0B，`UpperDir` 被删除，数据目录大小回到写入前的水平。

所以：要回收可写层空间，需要删掉容器（`docker rm` 或 `container prune`），不是 `stop`。

## 七、常见问题与安全注意

**磁盘满了但 `docker system df` 不大。** 先查容器日志，见 [Docker 日志清理与限制大小](https://www.mmfei.com/2026/11/docker日志清理与限制大小/)。也可以在 `DockerRootDir` 下用 `du --max-depth=2` 看是 `overlay2`、`volumes`、`containers` 还是 `buildkit`。

**`image prune` 之后空间几乎没变。** 本实测回收 0B，层转到了构建缓存，需要再跑 `docker builder prune` 或 `docker system prune`。

**镜像占了几百 GB，能不能直接 `prune -a`？** 先用 `docker system df -v` 和 `docker images` 看哪些还要保留。`-a` 会删掉当前没有容器引用的镜像，包括你准备回滚用的旧版本。更稳妥的是按仓库或 `until` 过滤，或显式 `docker rmi` 指定镜像。

**能不能 `rm -rf /var/lib/docker`？** 不要。这相当于毁掉该守护进程的全部数据（镜像、容器、卷、网络、构建缓存）。路径还可能不是 `/var/lib/docker`。即使磁盘已经写满，也先停不需要的容器、删日志、再按上面的 prune 回收；实在要重置，先备份卷，再有意识地卸载/重装或换 `data-root`，而不是直接 `rm -rf`。

**生产机多人共用同一个 Docker。** `prune` 没有确认列表以外的「预览删除对象」完整清单（尤其是负向 label 过滤）。在共用守护进程上不要无过滤地 `system prune -a` 或 `volume prune -a`。

## 八、回滚

prune 删除的镜像、容器可写层、卷和构建缓存无法从 Docker 里「撤消」。

- 镜像：可以从仓库重新 `docker pull`，或从你自己的备份 `docker load`。
- 卷：没有备份就没了。重要数据应在清理前 `docker run --rm -v 卷名:/data -v $(pwd):/backup alpine tar czf /backup/vol.tgz -C /data .` 一类方式备份。
- 容器可写层：没有事先 `docker commit` 或拷出文件，删除后不能恢复。需要保留的数据应放在卷或绑定挂载里。

## 九、实测环境与来源

- 测试时间：2026-11-25 09:19–09:23，Asia/Bangkok（UTC+7）。
- 系统：Debian 13 (trixie)，内核 6.12.113，Docker Engine 26.1.5+dfsg1，containerd 1.7.24，runc 1.1.15，存储驱动 overlay2，日志驱动 json-file。
- 所有 `prune`（含 `system prune -a`、`volume prune -a`）都打在临时 dockerd 上：独立 `--data-root /tmp/mmfei-20261125-dockerd-data`、独立 sock 与 pidfile，`--bridge=none`、`--iptables=false`。未对共享守护进程执行 prune，未使用 `systemctl`，未结束共享 dockerd。测完已停止临时 dockerd 并删除其 data-root。共享守护进程仍在，`DockerRootDir=/var/lib/docker`，镜像与容器数为 0（测试前就是空的）。
- 已实测：`docker system df` / `df -v` 四类占用；造未用镜像、悬空镜像、退出容器、未用匿名/具名卷、构建缓存；`container prune`、`image prune`、`builder prune`、`system prune`（不加 `-a`）、`system prune --volumes`、`system prune -a`、`volume prune` / `volume prune -a` 的删除范围；`-a` 删除未用标签镜像 `mmfei-keep:latest`，运行中容器及其镜像保留；卷默认不被 `system prune` 删除，`--volumes` 只删匿名未用卷；可写层写入后 df 变化，只停不删空间仍在，`rm` 后收回；数据目录以 `docker info` 为准。
- 未实测：`prune --filter` 的各种时间/标签组合；Swarm、镜像仓库回收、Windows 容器；把 `rm -rf` 数据目录当作操作步骤（仅作为反面警告，未执行）；在共享守护进程上执行任何无过滤 prune。
- 官方文档（2026-11-25 查阅）：
  - https://docs.docker.com/reference/cli/docker/system/df/
  - https://docs.docker.com/reference/cli/docker/system/prune/
  - https://docs.docker.com/reference/cli/docker/image/prune/
  - https://docs.docker.com/reference/cli/docker/container/prune/
  - https://docs.docker.com/reference/cli/docker/volume/prune/
  - https://docs.docker.com/reference/cli/docker/builder/prune/

