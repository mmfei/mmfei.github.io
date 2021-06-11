# 怎样让nginx的配置支持https


```conf
server {
    listen       80;
    server_name  api.dev.com;
    error_page   500 502 503 504 /50x.html;
    error_log    /data/nginx/api.dev.com/error.log;
    access_log   /data/nginx/api.dev.com/access_$logdate.log;
    #root     /mnt/d/wsl/www/playsmart/;
    index    index.html index.htm index.php;

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        proxy_pass  http://127.0.0.1:8080;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:8080;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }
}
server {
    listen       443 ssl;
    server_name  api.dev.com;
    error_page   500 502 503 504 /50x.html;
    index        index.html index.htm;

    access_log   /data/nginx/api.dev.com/access_$logdate.log;
    error_log    /data/nginx/api.dev.com/error.log;

    ssl_session_cache    shared:SSL:1m;
    ssl_certificate     pem/api.dev.com/cert.pem;  # pem文件的路径
    ssl_certificate_key  pem/api.dev.com/key.pem; # key文件的路径

    ssl_session_timeout  5m;    #缓存有效期
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;    #加密算法
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;    #安全链接可选的加密协议
    ssl_prefer_server_ciphers on;   #使用服务器端的首选算法

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host api.dev.com;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        proxy_pass  http://127.0.0.1:8080;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host api.dev.com;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:8080;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }

}
```

