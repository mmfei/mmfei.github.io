# Centos8搭建gitlab和gitlab-Runner


## docker-compose.yml
```yaml
version: '3'
services:
  gitlab.abc.com:
    container_name: gitlab.abc.com
    image: gitlab/gitlab-ce:latest
    # image: gitlab/gitlab-ce:11.0.1-ce.0
    restart: always
    privileged: true
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.abc.com'
        gitlab_rails['time_zone'] = 'Asia/Shanghai'
        nginx['enable'] = false
        prometheus_monitoring['enable'] = false
        gitlab_workhorse['listen_network'] = "tcp"
        gitlab_workhorse['listen_addr'] = ":19900"
        gitlab_rails['gitlab_shell_ssh_port'] = 19901
    ports:
      - "19900:19900"
      - "19901:22"
      - "19091:9090"
    volumes:
      - "./ssl:/etc/gitlab/ssl"
      - "/data/gitlab.abc.com/config:/etc/gitlab:rw"
      - "/data/gitlab.abc.com/logs:/var/log/gitlab:rw"
      - "/data/gitlab.abc.com/data:/var/opt/gitlab:rw"
      - "/data/gitlab.abc.com/backups:/var/opt/gitlab/backups:rw"
  gitlab-runner:
      restart: always
      image: gitlab/gitlab-runner
      depends_on:
      - gitlab.abc.com
      volumes:
      - /data/gitlab/gitlab-runner/config:/etc/gitlab-runner:Z
      - /var/run/docker.sock:/var/run/docker.sock
      environment:
      - TZ=Asia/Shanghai
```

>> 如果不知道root的密码 , 这样可以查看密码 `docker exec -it gitlab grep 'Password:' /etc/gitlab/initial_root_password`

```shell
yum install -y yum-utils
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum -y remove docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotat docker-engine
yum -y install docker-ce docker-ce-cli containerd.io
systemctl start docker
curl -L https://github.com/docker/compose/releases/download/1.23.2/docker-compose-`uname -s`-`uname -m` -o /usr/bin/docker-compose
chmod +x /usr/bin/docker-compose
mkdir -p /data/gitlab.abc.com/{logs,config,data,backups}
mkdir -p ./ssl

curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh | sudo bash
yum -y install gitlab-runner
gitlab-runner register
# 查看: https://your.gitlab.url/admin/runners
```

### gitlab-runner register
#### 从gitlab获得注册所需要的信息
![https://www.mmfei.com/images/posts/centos8搭建gitlab的gitlab-runner/gitlab_admin_panel.png](https://www.mmfei.com/images/posts/centos8搭建gitlab的gitlab-runner/gitlab_admin_panel.png)

#### 注册需要输入的内容
```shell
gitlab-runner register
Runtime platform                                    arch=amd64 os=linux pid=291523 revision=7a6612da version=13.12.0
Running in system-mode.

Enter the GitLab instance URL (for example, https://gitlab.com/):
https://gitlab.abc.com/    # 这里填入上图 标注的 1 的url
Enter the registration token:
{{ token }}  # 这里填入上图标注 2 的 token 字符串
Enter a description for the runner:
[adasdf]: sg-aliyun-test    # 给你的runner起个名字
Enter tags for the runner (comma-separated):
test,deploy,build,gitlab-ci   # 起个标签 , 跟.gitlab-ci.yaml 的tags一致 , 它表示可以执行跟ci指定tags同名的tags的任务
Registering runner... succeeded                     runner=adfasdfasdf
Enter an executor: parallels, ssh, virtualbox, custom, docker, docker-ssh, kubernetes, shell, docker+machine, docker-ssh+machine:
shell   # 这里选shell即可
Runner registered successfully. Feel free to start it, but if it's running already the config should be automatically reloaded!
```

#### docker版本注册runner (注意gitlab的名字最好不要用域名,容易掉坑)
```shell
gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.abc.com" \
  --registration-token "{token}" \
  --executor "docker" \
  --docker-image alpine:latest \
  --description "docker-runner" \
  --maintenance-note "Free-form maintainer notes about this runner" \
  --tag-list "docker_sg" \
  --run-untagged="true" \
  --locked="false" \
  --access-level="not_protected"
```

## 配置本地的nginx服务器
```editorconfig
# gitlab.abc.com.conf
upstream gitlab{
    # 域名对应 docker宿主机域名
    # 端口对应 docker宿主机映射域名
    server  127.0.0.1:19900;
}
server {
    listen 80;
    server_name gitlab.abc.com;
    rewrite ^(.*)$ https://${server_name}$1 permanent;
}
server {
    proxy_headers_hash_max_size 51200;
    proxy_headers_hash_bucket_size 6400;
	proxy_ssl_server_name on;
	proxy_ssl_name gitlab.abc.com;

    listen       443 ssl;
    server_name  gitlab.abc.com;

    access_log   /data/nginx/gitlab.abc.com/access_$logdate.log;
    error_log    /data/nginx/gitlab.abc.com/error.log;

    ssl_session_cache    shared:SSL:1m;
    ssl_certificate     pem/gitlab.abc.com/cert.pem;  # pem文件的路径
    ssl_certificate_key  pem/gitlab.abc.com/key.pem; # key文件的路径

    ssl_session_timeout  5m;    #缓存有效期
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;    #加密算法
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;    #安全链接可选的加密协议
    ssl_prefer_server_ciphers on;   #使用服务器端的首选算法

    location / {
        proxy_pass http://gitlab;
   	    proxy_http_version 1.1;
        proxy_set_header X_FORWARDED_PROTO https;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }

    location ~ .*\.(js|css|png)$ {
        proxy_pass  http://gitlab;
    }
}

```

> 卸载 gitlab-runner
```shell
!/bin/bash
# 卸载gitlab-runner

# 停止服务
gitlab-runner stop

# 取消随机启动
chkconfig gitlab-runner off

# 卸载服务
gitlab-runner uninstall

# 清理文件
rm -rf /etc/gitlab-runner
rm -rf /usr/local/bin/gitlab-runner
rm -rf /usr/bin/gitlab-runner
rm -rf /etc/sudoers.d/gitlab-runner

# 删除用户
userdel -r gitlab-runner
```

