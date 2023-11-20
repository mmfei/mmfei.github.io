# 用docker快速搭建一个phpmyadmin


> phpmyadmin的配置  docker-compose.yml  映射本机的6080端口 , abc.com 请替换成你的域名
```yml
version: '3.1'
services:
  phpmyadmin:
    image: phpmyadmin
    restart: always
    ports:
      - 6080:80
    environment:
      - PMA_ARBITRARY=3
      - PMA_PORT=3306
      - PMA_HOST=你的mysql的host
      - PMA_USER=你的mysql的user
      - PMA_PASSWORD=你的mysql的密码
```

# nginx配置
```apacheconf
server {
    listen       80;
    server_name  abc.com;
    error_page   500 502 503 504 /50x.html;
    error_log    /data/nginx/abc.com/error.log;
    access_log   /data/nginx/abc.com/access_$logdate.log;
    index    index.html index.htm index.php;

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_pass  http://127.0.0.1:6080;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:6080;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }
}
```

## 使用方式

```bash
# 进入docker-compose.yml 目录
docker-compose up -d;
```
