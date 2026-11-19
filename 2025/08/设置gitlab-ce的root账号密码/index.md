# 重置 GitLab CE 的 root 密码


原文只给出一段 `docker exec` 进入容器后启动 `gitlab-rails console`，再用 `User.where(id: 1)` 改密码的命令。GitLab 官方文档把 **Rake 任务**作为重置密码的标准方法之一，并单独说明了 root 账户与故障排查。本文按 2026-11-19 核读的官方说明修订，保留容器场景，但不再把 Rails console 当作唯一做法。标题改为“重置”，更贴近实际操作；

> **2026-11-19 更新说明：补充交互式重置入口与生产风险。** 本文**未对任何 GitLab 实例实测**这些命令，不编造 rake、console 或登录结果。文中密码一律写作「新密码」，不要把真实密码写进命令、截图、工单或文章。

## 适用范围与前提

本篇适用于 **GitLab Self-Managed**（包括常用的 GitLab CE / EE Linux 软件包，以及官方 Docker 镜像；官方 Docker 镜像使用的是 Linux package）。官方页面：[Reset user passwords](https://docs.gitlab.com/security/reset_user_password/)。GitLab.com（SaaS）不在范围内。

官方前提：

- 你必须能以该实例管理员身份执行这些维护命令（在丢失 root 密码时，通常意味着你仍有这台宿主机或容器的系统管理员权限）。
- 新密码必须满足该实例的密码要求。官方重置页写明须符合 *all password requirements*；过短、过弱或不满足复杂度时，重置会失败。具体规则以该实例的管理员设置为准，本文不链未单独核验过的子文档。

生产环境额外建议（官方重置页未把这些写成命令步骤，但操作前应自行满足）：

- 先有可用备份，并选择可中断登录的维护窗口。本站另有一篇 [每日备份 docker 部署的 GitLab](https://www.mmfei.com/2021/06/每日备份docker部署的gitlab服务的最简单方案/)，请注意该文**没有恢复步骤**，有备份不等于已经演练过还原。
- 重置会立即覆盖该用户当前密码，依赖旧密码的登录、脚本或集成会失效。
- 不要在共享屏幕或可被记录的会话里粘贴真实密码。优先使用 rake 的交互提示，而不是把密码写在命令行参数里。

## 先确认安装形态

同一条官方 rake 任务，调用方式因安装形态而不同：

| 形态 | 在哪里执行 | 官方调用 |
| --- | --- | --- |
| 宿主机上的 Linux package（Omnibus） | 宿主机 | `sudo gitlab-rake "gitlab:password:reset"` |
| 从源码安装 | 应用目录，按官方源码说明 | `bundle exec rake "gitlab:password:reset"` |
| 官方 Docker 镜像 | **容器内**运行与 Linux package 相同的 `gitlab-rake`；从宿主机用 `docker exec` 进入 | 见下一节 |

官方重置文档按前两种形态给出了命令。Docker 配置文档把该镜像说明为官方 Linux package，并用 `sudo docker exec -it gitlab /bin/bash` 进入容器。因此，在 Docker 场景应把 Omnibus 的 `gitlab-rake` 放到容器里执行，而不是在没有安装 GitLab 软件包的宿主机上直接找 `gitlab-rake`。

先确认容器名称或 ID（名称以本机为准，原文占位是 `<gitlab_container_name_or_id>`，官方 Docker 示例常用 `gitlab`）：

```bash
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'
```

## 官方推荐：Rake 任务

官方用法是先请求用户名、密码和确认密码；也可以把用户名作为参数。root 账户名如果没有改过，用户名就是 `root`。

### 宿主机 Linux package

```bash
sudo gitlab-rake "gitlab:password:reset[root]"
```

也可以不带用户名，按提示输入：

```bash
sudo gitlab-rake "gitlab:password:reset"
```

### Docker 容器

在宿主机上指定容器，直接调用容器内的 `gitlab-rake`（不必先开一个交互 bash 再找命令）。容器内进程通常已是 root，是否还需要 `sudo` 以镜像实际情况为准；下面按在容器内直接调用 rake 来写：

```bash
docker exec -it <gitlab_container_name_or_id> gitlab-rake "gitlab:password:reset[root]"
```

或不带用户名：

```bash
docker exec -it <gitlab_container_name_or_id> gitlab-rake "gitlab:password:reset"
```

出现密码提示时输入「新密码」并再确认一次。本文未执行，不描述提示原文或成功语句。若 shell 把方括号吃掉，保持官方那种双引号写法。

如果 root 的用户名已经被改掉，应使用**当前**用户名，而不是写死 `root`。若既不知道用户名、又必须找回默认管理员，官方说明：在几乎所有情况下，第一个用户（ID `1`）是默认管理员账户，可由维护者按官方 Rails console 说明定位账户。不要把 “ID 一定是 1” 当成在所有做过迁移、导入或手工改库的实例上都无需核对的事实。

## 备选：Rails console 的安全边界

GitLab 官方提供 Rails console 备选方法，详见 [Reset user passwords](https://docs.gitlab.com/security/reset_user_password/)。本篇不提供把真实密码字面值写入 console 的赋值示例，避免读者替换占位符后把密码留在历史、会话录制或审计日志中。优先使用上文的交互式 Rake 任务，并确保终端没有录屏或不适当的会话记录。

如果只是用户名发生变化，先确认目标账户的实际用户名，再使用交互式任务。确需 console 或按用户 ID 定位时，由具备权限的维护者按对应版本官方说明处理；不能把“默认管理员通常为 ID 1”当作所有实例都无需核验的事实。本文未验证安全的 console 密码输入流程，因此不将其作为可照抄步骤。

## 验证

重置成功后，用「新密码」在 GitLab 登录页登录 root（或你实际重置的用户名）。本文未做登录测试。

若新密码无法登录，官方排查包括：

- **邮箱确认问题**：文档示例是进入 Rails console 后执行 `user = User.find(1)` 与 `user.skip_reconfirmation!`，然后再尝试登录。只在确认属于这类问题时使用。
- **未满足密码要求**：密码过短、过弱或不满足复杂度。先核对该实例的密码策略，而不是反复改 console 代码。
- **密码已过期**：官方指向 LDAP 等场景下的过期错误说明，按实例实际认证方式查阅，不要套用到无关环境。

还要确认自己改的是预期账户：登录后看用户名与是否仍具备管理员权限。若实例还启用了双因素认证，官方本页没有把“重置密码等于关闭 2FA”写成步骤；遇到第二步验证时，按该实例的 2FA 恢复流程处理，不要在未核文档的情况下删除 2FA 记录。

## 生产风险与回滚注意

- **没有“撤销本次重置”的对称命令。** 旧密码被覆盖后，不能靠再跑一次 rake 自动回到旧值，除非你仍然记得旧密码并再次设置回去，或使用符合恢复策略的备份 / 另一名管理员。把备份和窗口放在重置之前。
- 重置立即生效，可能打断正在使用的会话、CI 作业以外仍用密码认证的集成，以及任何保存了旧密码的本地工具。API token、Deploy Key 等是否受影响，以该实例版本为准，不要在未核对时假设“只改密码、其他凭据都不变”或“全部失效”。
- 在错误的容器或错误的用户上执行 rake，会改到错误的实例。先用 `docker ps` 或主机名 / `external_url` 确认目标。
- 不要把 Rails console 开在无人值守的共享会话里，也不要在生产 console 里执行与改密码无关的破坏性语句。
- 本操作不能替代对异常登录、权限或 500 错误的排查。例如本站 [Gitlab Ce进入admin_runners报500](https://www.mmfei.com/2022/10/gitlab-ce进入admin_runners报500/) 是另一类问题。

## 相关笔记

- [Centos8搭建gitlab和gitlab-Runner](https://www.mmfei.com/2021/05/centos8搭建gitlab和gitlab-runner/)
- [每日备份docker部署的gitlab服务的最简单方案](https://www.mmfei.com/2021/06/每日备份docker部署的gitlab服务的最简单方案/)（无恢复步骤）
- [Gitlab Ce进入admin_runners报500](https://www.mmfei.com/2022/10/gitlab-ce进入admin_runners报500/)

以上三篇在 2026-11-19 以 HTTPS GET 核验为 HTTP 200。

## 官方参考（核读日期 2026-11-19）

- [Reset user passwords](https://docs.gitlab.com/security/reset_user_password/)（含 UI、Rake、Rails console、重置 root、排错）
- [Password maintenance Rake tasks](https://docs.gitlab.com/administration/raketasks/password/)（指向同一重置说明）
- [Configure GitLab running in a Docker container](https://docs.gitlab.com/install/docker/configuration/)（镜像使用 Linux package；`docker exec` 进入容器的官方写法）
- [Install GitLab in a Docker container](https://docs.gitlab.com/install/docker/installation/)

