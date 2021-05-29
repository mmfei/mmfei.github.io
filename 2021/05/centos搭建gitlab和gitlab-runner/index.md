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

curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-ci-multi-runner/script.rpm.sh | sudo bash
yum install gitlab-runner
gitlab-runner register
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

