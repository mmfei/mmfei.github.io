# Ubuntu安装openresty


# 直接执行
```shell
#!/bin/bash
set -e
rm -rf openresty-1.19.3.2 openresty-1.19.3.2.tar.gz

apt-get update -y
apt-get install -y libpcre3-dev \
  libssl-dev \
  perl \
  make \
  build-essential \
  curl \
  zlib1g-dev

curl -LO https://openresty.org/download/openresty-1.19.3.2.tar.gz
tar zxf openresty-1.19.3.2.tar.gz
cd openresty-1.19.3.2

./configure \
  --with-http_gzip_static_module \
  --with-http_v2_module \
  --with-http_stub_status_module

make
make install

mkdir -p /usr/lib/systemd/system
cat > /usr/lib/systemd/system/openresty.service <<EOF
# Stop dance for OpenResty
# =========================
#
# ExecStop sends SIGSTOP (graceful stop) to OpenResty's nginx process.
# If, after 5s (--retry QUIT/5) nginx is still running, systemd takes control
# and sends SIGTERM (fast shutdown) to the main process.
# After another 5s (TimeoutStopSec=5), and if nginx is alive, systemd sends
# SIGKILL to all the remaining processes in the process group (KillMode=mixed).
#
# nginx signals reference doc:
# http://nginx.org/en/docs/control.html
#
[Unit]
Description=The OpenResty Application Platform
After=syslog.target network-online.target remote-fs.target nss-lookup.target
Wants=network-online.target
[Service]
Type=forking
PIDFile=/usr/local/openresty/nginx/logs/nginx.pid
ExecStartPre=/usr/local/openresty/nginx/sbin/nginx -t -q -g 'daemon on; master_process on;'
ExecStart=/usr/local/openresty/nginx/sbin/nginx -g 'daemon on; master_process on;'
ExecReload=/usr/local/openresty/nginx/sbin/nginx -g 'daemon on; master_process on;' -s reload
ExecStop=-/sbin/start-stop-daemon --quiet --stop --retry QUIT/5 --pidfile /usr/local/openresty/nginx/logs/nginx.pid
TimeoutStopSec=5
KillMode=mixed
[Install]
WantedBy=multi-user.target
EOF

# systemctl enable openresty
# systemctl start openresty
# systemctl status openresty

rm -rf openresty-1.19.3.2 openresty-1.19.3.2.tar.gz
```


> pem的目录: /usr/local/openresty/nginx/conf/pem

```conf
server {
    listen       80;
    server_name  www.mmfei.com
    error_page   500 502 503 504 /50x.html;
    error_log    /data/nginx/www.mmfei.com/error.log;
    access_log   /data/nginx/www.mmfei.com/access_$logdate.log;
    index    index.html index.htm index.php;

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_pass  http://127.0.0.1:9601;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:9601;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }
}
server {
    listen       443 ssl;
    server_name  www.mmfei.com
    error_page   500 502 503 504 /50x.html;
    index        index.html index.htm;

    access_log   /data/nginx/www.mmfei.com/access_$logdate.log;
    error_log    /data/nginx/www.mmfei.com/error.log;

    ssl_session_cache    shared:SSL:1m;
    ssl_certificate     pem/www.mmfei.com/cert.pem;  # pem文件的路径
    ssl_certificate_key  pem/www.mmfei.com/key.pem; # key文件的路径

    ssl_session_timeout  5m;    #缓存有效期
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;    #加密算法
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;    #安全链接可选的加密协议
    ssl_prefer_server_ciphers on;   #使用服务器端的首选算法

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	    proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_pass  http://127.0.0.1:9601;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:9601;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }
}
```
