# GitLab 备份还原到另一台服务器：gitlab-backup、gitlab-secrets.json 和版本一致性实测（Docker 部署）


GitLab 换服务器，最常见的翻车不是备份失败，而是**还原命令显示成功，用起来却不对**：CI/CD 变量读不出来，旧的访问令牌全部 401（官方文档还提到 Runner 会连不上、双因素认证用户无法登录）。原因几乎都是同一个：`gitlab-backup` 生成的备份包里**不含** `gitlab-secrets.json`。

这篇按迁移顺序写：**旧机备份 → 带走三样文件 → 新机装同版本 → 按顺序还原 → 校验**，并实测了三种常见错误：忘带密钥文件、版本不一致、备份文件权限不对。

测试用的是两台一次性的 `gitlab/gitlab-ce` 容器（都是 19.6.1），A 当旧服务器，B 当新服务器，详见文末“实测环境”。日常定时备份可以看站内的 [每日备份 Docker 部署的 GitLab 服务的最简单方案](https://www.mmfei.com/2021/06/每日备份docker部署的gitlab服务的最简单方案/)，本文只讲**把备份还原到另一台机器**。新机从零搭建可参考 [CentOS8 搭建 GitLab 和 gitlab-runner](https://www.mmfei.com/2021/05/centos8搭建gitlab和gitlab-runner/)，迁移后忘了 root 密码可参考 [设置 GitLab CE 的 root 账号密码](https://www.mmfei.com/2025/08/设置gitlab-ce的root账号密码/)。

## 迁移前先确认三件事

1. **版本完全一致**：还原只能在和备份**完全相同的版本和类型**（CE/EE）上进行，19.6.1 的备份不能还原到 19.6.0 或 19.7.0。先在旧机查版本：

   ```bash
   docker exec gitlab cat /opt/gitlab/embedded/service/gitlab-rails/VERSION
   # 实测输出：19.6.1
   ```

   新机 Docker 镜像要写死同一个标签，例如 `gitlab/gitlab-ce:19.6.1-ce.0`，**不要用 `latest`**，否则两台机器拉到的版本可能不同。
2. **新机先装好并能正常打开**：还原要求目标 GitLab 已经在运行，而且最好是全新安装、没有业务数据。
3. **磁盘空间**：官方文档说明，还原前会检查备份目录剩余空间，至少要有备份包大小的 3 倍，不够会直接停止（本次备份包很小，这一项**未实测**）。

## 一、旧服务器：备份并带走三样文件

```bash
docker exec -t gitlab gitlab-backup create
```

实测（测试数据：1 个项目、2 个提交、1 个议题、1 个 CI/CD 变量、1 个附件）用时 25 秒，结尾有两行需要注意：

```text
2026-11-24 13:08:29 UTC -- Backup 1795525706_2026_11_24_19.6.1 is done.
2026-11-24 13:08:29 UTC -- Warning: Your gitlab.rb and gitlab-secrets.json files contain sensitive data
and are not included in this backup. You will need these files to restore a backup.
```

- 备份文件在容器的 `/var/opt/gitlab/backups/`，文件名是 `<备份ID>_gitlab_backup.tar`，备份 ID **里带着版本号**（`..._19.6.1`）。里面有数据库（`db/database.sql.gz`）、仓库（`repositories/`）、附件、构建产物等。
- 程序自己提示了：`gitlab.rb` 和 `gitlab-secrets.json` **不在备份里**。

要带到新机的就是这三样（容器里的 `/etc/gitlab` 一般挂载在宿主机上，下面用 `/srv/gitlab/config` 举例，按你的 `-v` 参数替换）：

| 文件 | 位置 | 作用 |
|---|---|---|
| `*_gitlab_backup.tar` | `/srv/gitlab/data/backups/` | 数据库、仓库、附件等数据 |
| `gitlab-secrets.json` | `/srv/gitlab/config/` | 数据库加密密钥：CI/CD 变量、访问令牌、双因素认证、Runner 令牌都靠它解密 |
| `gitlab.rb` | `/srv/gitlab/config/` | 实例配置（域名、邮件、存储路径等） |

打包、记校验值，再传到新机：

```bash
mkdir -p ~/gitlab-migrate && cd ~/gitlab-migrate
sudo cp /srv/gitlab/data/backups/1795525706_2026_11_24_19.6.1_gitlab_backup.tar .
sudo cp /srv/gitlab/config/gitlab-secrets.json /srv/gitlab/config/gitlab.rb .
sudo sha256sum * | sudo tee SHA256SUMS
# 传到新机（换成你的地址和目录）
sudo scp -r ~/gitlab-migrate root@新服务器:/root/
```

实测在同一台宿主机内复制，新机这边三样文件的 sha256 与旧机一致；跨服务器的 `scp` 这一步**未实测**。如果想让用户 `git clone` 时不出现“主机密钥已变更”的提示，可以把 `ssh_host_*` 密钥也一起带走；HTTPS 证书同理（**未实测**）。

## 二、新服务器：装同一个版本

```bash
docker run -d --name gitlab --hostname gitlab.example.com \
  -p 80:80 -p 443:443 -p 2222:22 --shm-size 256m \
  -v /srv/gitlab/config:/etc/gitlab \
  -v /srv/gitlab/logs:/var/log/gitlab \
  -v /srv/gitlab/data:/var/opt/gitlab \
  gitlab/gitlab-ce:19.6.1-ce.0
```

等它完全起来（实测两台各用了约 2.5 分钟）再继续：

```bash
docker exec gitlab curl -fsS http://localhost/-/readiness && echo ready
docker exec gitlab cat /opt/gitlab/embedded/service/gitlab-rails/VERSION   # 必须和旧机一致
```

## 三、按顺序还原（顺序很重要）

**先放密钥文件，再还原数据。** 第五节实测了顺序反过来会留下什么问题。

```bash
cd /root/gitlab-migrate && sha256sum -c SHA256SUMS

# 1. 先备份新机自己的密钥文件，再换成旧机的
sudo cp -a /srv/gitlab/config/gitlab-secrets.json /srv/gitlab/config/gitlab-secrets.json.new-server
sudo cp gitlab-secrets.json gitlab.rb /srv/gitlab/config/
sudo chown root:root /srv/gitlab/config/gitlab-secrets.json /srv/gitlab/config/gitlab.rb
sudo chmod 600 /srv/gitlab/config/gitlab-secrets.json /srv/gitlab/config/gitlab.rb
docker exec gitlab gitlab-ctl reconfigure

# 2. 备份包放进备份目录，属主改成容器里的 git 用户
sudo cp 1795525706_2026_11_24_19.6.1_gitlab_backup.tar /srv/gitlab/data/backups/
docker exec gitlab chown git:git /var/opt/gitlab/backups/1795525706_2026_11_24_19.6.1_gitlab_backup.tar

# 3. 停掉连接数据库的进程，其他保持运行
docker exec gitlab gitlab-ctl stop puma
docker exec gitlab gitlab-ctl stop sidekiq

# 4. 还原：BACKUP= 后面写备份 ID，不带 _gitlab_backup.tar
docker exec -it gitlab gitlab-backup restore BACKUP=1795525706_2026_11_24_19.6.1

# 5. 重启容器
docker restart gitlab
```

说明：

- 还原会**清空新机的数据库**。按官方文档，删除现有表之前等几个节点会询问是否继续，输入 `yes`；写脚本时加 `force=yes`（或设 `GITLAB_ASSUME_YES=1`）跳过询问。本次实测用的是 `force=yes`，所以没有看到询问。
- 实测 `reconfigure` 用时 27 秒；还原用时 32–36 秒；重启后约 50 秒恢复可用。
- 宿主机上看到备份文件属主是一个陌生的用户名或数字，是正常的：容器里的 `git` 用户 ID 在宿主机上对应别的名字，按上面在容器里 `chown` 即可。
- 还原日志里实测出现了 6 行 `ERROR: must be owner of extension pg_trgm`（还有 `btree_gist`、`amcheck`），两次还原都有。官方排错文档列了这类报错，本次还原后的全部校验都通过了。

## 四、还原后怎么校验

```bash
# 1. 数据库里的加密数据能不能用当前密钥解开
docker exec gitlab gitlab-rake gitlab:doctor:secrets
# 2. 整体检查
docker exec gitlab gitlab-rake gitlab:check SANITIZE=true
# 3. 附件、构建产物、LFS 完整性
docker exec gitlab gitlab-rake gitlab:uploads:check
docker exec gitlab gitlab-rake gitlab:artifacts:check
docker exec gitlab gitlab-rake gitlab:lfs:check
```

按正确顺序还原后的实测结果：

- `gitlab:doctor:secrets` 结尾是 `Total: 0 row(s) affected`，没有解密失败。
- `gitlab:check` 各项都是 `yes` / `OK`（systemd 相关两项在 Docker 里显示 skipped，正常）。
- `uploads:check` 显示 `Failures: 0`。

再人工核对业务数据（实测全部和旧机一致）：

- 项目、两个提交、`app.txt` 的内容都在，从另一台容器 `git clone` 成功。
- 议题在；附件链接返回 200。
- CI/CD 变量 `DEPLOY_TOKEN` 能读出原值。
- 旧机创建的个人访问令牌在新机调用 API 返回 200；root 用旧密码能登录。

都确认后再把域名解析切到新机。**旧服务器在切换完成、观察几天之前不要删**，这就是最简单的回滚方案：新机有问题，把解析切回去即可。

## 五、实测：忘带 gitlab-secrets.json 会怎样

故意只拷备份包、不拷密钥文件，在 B 上还原。还原命令**照样成功**（退出码 0，结尾 `Restore task is done.`），重启后网页也能打开，但：

```text
# gitlab:doctor:secrets
- Ci::Variable failures: 1
- Project failures: 1
Total: 3 row(s) affected
```

- 读 CI/CD 变量报 `OpenSSL::Cipher::CipherError: bad decrypt`，流水线拿不到变量。
- 旧机创建的个人访问令牌调用 API 返回 **401**。
- root 用旧密码**能**登录。所以“能登录”不能说明迁移成功，一定要跑 `doctor:secrets`。

接着补救：把旧机的 `gitlab-secrets.json` 拷过去、`reconfigure`、重启。CI 变量和令牌恢复了，但 `doctor:secrets` 仍有 1 条失败：

```text
- User failures: 1
  - User[1]: static_object_token
```

这是在“已还原数据、但还用着新机密钥”的那段时间里，GitLab 用错误的密钥新写入了一个字段。之后**按正确顺序把同一个备份再还原一次**（密钥已经就位），`doctor:secrets` 才变成 `Total: 0 row(s) affected`。

结论：顺序做反了，补拷密钥文件不一定能全部修好，**最稳妥的是放好密钥后重新还原一次**。要是旧机的 `gitlab-secrets.json` 已经找不回来，就只能按官方排错文档逐项重置 CI 变量、令牌、Runner 注册等，代价很大。所以**每次备份都要把它和 `gitlab.rb` 一起另存**。

## 六、实测：版本不一致的报错

只有一个版本的镜像，所以这项是**模拟测试**：把备份包里 `backup_information.yml` 的 `gitlab_version` 改成 19.5.0，再还原到 19.6.1：

```text
-- Unpacking backup ... done
-- GitLab version mismatch:
  Your current GitLab version (19.6.1) differs from the GitLab version in the backup!
  Please switch to the following version and try again:
  version: 19.5.0
-- Hint: git checkout v19.5.0
```

从日志看，还原在解包后、恢复数据库之前就停止了（退出码 1）。处理办法是新机换成和备份**完全一致**的版本，还原成功后再按官方升级路径升级，不要反过来先升级新机。

## 常见报错

| 报错 / 现象 | 原因与处理 |
|---|---|
| `GitLab version mismatch` | 版本或 CE/EE 类型不一致。新机装成备份里写的版本再还原 |
| `tar: ..._gitlab_backup.tar: Cannot open: Permission denied` / `Unpacking backup failed` | 实测：备份包属主是 root、权限 600 时出现。在容器里 `chown git:git` 后重试 |
| 还原成功，但 CI 变量 `bad decrypt`、令牌 401 | 实测：没有恢复旧机的 `gitlab-secrets.json`。见第五节（Runner 连不上是官方文档提到的同类后果，本次未测 Runner） |
| `doctor:secrets` 里有 `User[...]: static_object_token` 之类的失败 | 还原后、放入密钥前，新机用自己的密钥写过数据。放好密钥后重新还原 |
| `ERROR: must be owner of extension pg_trgm` 等 | 实测两次还原都出现，还原后的校验全部通过 |
| `repository already exists` | 官方文档说明：新机上已有同名仓库时会出现，请用全新安装的实例还原（本次未遇到） |
| 还原前提示空间不足 | 备份目录剩余空间要有备份包的 3 倍（官方文档，未实测） |

## 安全注意

- `gitlab-secrets.json` 能解开数据库里所有加密数据。它和备份包最好**分开存放**，至少不要放在同一个公开可访问的位置；传输用 `scp` 或 `rsync -e ssh`，落盘后 `chmod 600`。
- 备份包里有全部代码和数据库，和服务器本身同等重要，不要留在 `/tmp` 或 Web 目录下。
- 新机还原完、确认无误后，清理 `~/gitlab-migrate` 里的副本。

## 实测环境

- 测试时间：2026-11-24 20:02–20:24（曼谷时间，UTC+7）。
- 宿主机：Debian 13（trixie），8 核、约 15GB 内存；Docker Engine 26.1.5（Debian 软件包）。两台一次性容器同时运行，镜像都是 `gitlab/gitlab-ce:latest`（`VERSION` 为 19.6.1，CE），A 运行时内存约 3.4GB。为节省内存关闭了 Prometheus 监控，Puma 用单进程模式，和生产配置不同，但不影响备份还原流程。
- 网络：测试机的 docker0 默认网桥当天傍晚出过故障，为了不依赖它，两台容器放在单独创建的 Docker 网络里，测完已删除。
- 测完已删除两台容器、自建网络和全部数据目录；没有重启 Docker 守护进程，也没有动其他容器。
- 未实测：跨服务器 `scp` 传输；Linux 软件包（非 Docker）安装方式；EE 版；对象存储；容器镜像仓库、Pages；带双因素认证的用户；SSH 主机密钥和 HTTPS 证书迁移；大仓库的耗时；真实的不同版本还原（第六节是改元数据模拟的）。
- 官方文档（2026-11-24 读取均可访问）：
  - [Back up GitLab](https://docs.gitlab.com/administration/backup_restore/backup_gitlab/)
  - [Restore GitLab](https://docs.gitlab.com/administration/backup_restore/restore_gitlab/)
  - [Migrate to a new server](https://docs.gitlab.com/administration/backup_restore/migrate_to_new_server/)
  - [Back up GitLab running in a Docker container](https://docs.gitlab.com/install/docker/backup/)
  - [Troubleshooting GitLab backups](https://docs.gitlab.com/administration/backup_restore/troubleshooting_backup_gitlab/)

