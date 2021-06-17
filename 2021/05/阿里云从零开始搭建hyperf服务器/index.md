# 阿里云从零开始搭建hyperf服务器


### 服务需要用到
* 免密登录配置
* openresty
* php7
* swoole
* nginx config
* gitlab runner
* gitlab ci
* php-redis扩展

### 一些约定
* 编译的源码目录 /data/src/install/{包名}/{src/,*.tag.gz}
* 网站目录 /data/src/web/{域名}
* 服务器说明 /root/README.md
* 服务器部署说明 /root/README.install.md
* 软件安装目录 /usr/local/软件名-版本号 , 并创建一个软链接到 /usr/local/软件名

### 下载安装脚本(直接运行即可)
[centos8_install_openresty_swoole_server.sh](/images/posts/阿里云从零开始搭建hyperf服务器/centos8_install_openresty_swoole_server.sh)

### 安装说明

|软件|路径|源码|备注|
|---|---|---|---|
|openresty|/usr/local/openresty/bin/php|/usr/local/openresty|systemctl restart openresty|
|php|/usr/local/php/bin/php|/usr/local/php|/data/src/install/php-7.4.19|

#### 免密登录配置
```shell
## 在服务器上执行, 下次就可以不输入密码登录
echo "你自己笔记本或者电脑的`cat ~/.ssh/id_rsa.pub`内容" >> ~/.ssh/authorized_keys;
```
#### openresty
```shell
wget https://openresty.org/package/centos/openresty.repo -O /etc/yum.repos.d/openresty.repo
yum check-update
yum install -y openresty
systemctl start openresty
systemctl enable openresty
ls -al /usr/local/openresty/
ls -al /usr/local/openresty/nginx/sbin
```
#### PHP源码编译安装
```shell
yum install -y libxml2-devel krb5-devel openssl-devel sqlite-devel libcurl-devel libxslt-devel libjpeg-devel libzip-devel bzip2-devel libpng-devel freetype-devel autoconf automake libtool
export ONIGURUMA_VERSION=6.9.4
mkdir -p /data/src/install/oniguruma-$ONIGURUMA_VERSION
cd /data/src/install/oniguruma-$ONIGURUMA_VERSION
wget -c https://github.com/kkos/oniguruma/archive/v$ONIGURUMA_VERSION.tar.gz -O oniguruma-$ONIGURUMA_VERSION.tar.gz
tar xvzf oniguruma-$ONIGURUMA_VERSION.tar.gz;
cd oniguruma-$ONIGURUMA_VERSION;
./autogen.sh && ./configure --prefix=/usr
make && make install


# install php
export PHP_VERSION=7.4.19
mkdir -p /data/src/install/php-$PHP_VERSION
cd /data/src/install/php-$PHP_VERSION
wget -c https://www.php.net/distributions/php-$PHP_VERSION.tar.gz --no-check-certificate;
tar xvzf php-$PHP_VERSION.tar.gz;
cd /data/src/install/php-$PHP_VERSION/php-$PHP_VERSION;
./configure --prefix=/usr/local/php-$PHP_VERSION --with-curl --with-freetype --enable-gd --with-jpeg --with-gettext --with-iconv-dir=/usr/local --with-kerberos --with-libdir=lib64 --with-libxml --with-mysqli --with-openssl --with-pdo-mysql --with-pdo-sqlite --with-pear --enable-sockets --with-mhash --with-ldap-sasl --with-xmlrpc --with-xsl --with-zlib --enable-fpm --enable-bcmath --enable-inline-optimization --enable-mbregex --enable-mbstring --enable-opcache --enable-pcntl --enable-shmop --enable-soap --enable-sockets --enable-sysvsem --enable-xml --with-zip --with-config-file-path=/usr/local/php-$PHP_VERSION/etc -with-bz2 --enable-inline-optimization --enable-sysvsem
make && make install
cp php.ini-production /usr/local/php-$PHP_VERSION/etc/php.ini
cp /usr/local/php-$PHP_VERSION/etc/php-fpm.conf.default /usr/local/php-$PHP_VERSION/etc/php-fpm.d/www.conf
ln -s /usr/local/php-$PHP_VERSION /usr/local/php
/usr/local/php/bin/php -v
/usr/local/php-$PHP_VERSION/bin/php -v
echo 'pathmunge /usr/local/php/bin' >> /etc/profile.d/php.sh


# install php-redis
export PHPREDIS_VERSION=5.3.4
mkdir -p /data/src/install/phpredis-$PHPREDIS_VERSION
cd /data/src/install/phpredis-$PHPREDIS_VERSION
wget https://github.com/phpredis/phpredis/archive/refs/tags/$PHPREDIS_VERSION.tar.gz --no-check-certificate -O phpredis-$PHPREDIS_VERSION.tar.gz;
tar xvzf phpredis-$PHPREDIS_VERSION.tar.gz
cd phpredis-$PHPREDIS_VERSION
/usr/local/php/bin/phpize
./configure --with-php-config=/usr/local/php/bin/php-config
make && make install
echo 'extension="redis.so"' >> /usr/local/php/etc/php.ini
php -m | grep redis
```

#### swoole
```shell
yum install -y glibc-headers gcc-c++
export SWOOLE_VERSION=4.6.7
mkdir -p /data/src/install/swoole-$SWOOLE_VERSION
cd /data/src/install/swoole-$SWOOLE_VERSION
wget -c https://pecl.php.net/get/swoole-$SWOOLE_VERSION.tgz -O /data/src/install/swoole-$SWOOLE_VERSION/swoole-$SWOOLE_VERSION.tgz --no-check-certificate
tar -zvxf swoole-$SWOOLE_VERSION.tgz
cd swoole-$SWOOLE_VERSION
/usr/local/php/bin/phpize
./configure --with-php-config=/usr/local/php/bin/php-config --enable-openssl --enable-http2 --enable-swoole-json --enable-swoole-curl
make && make install
echo 'extension="swoole.so"' >> /usr/local/php/etc/php.ini
echo 'swoole.use_shortname = off' >> /usr/local/php/etc/php.ini
php -m | grep swoole
```

#### nginx config
```nginx
server {
    listen       80;
    server_name  api.abc.com;
    error_page   500 502 503 504 /50x.html;
    error_log    /data/nginx/api.abc.com/error.log;
    access_log   /data/nginx/api.abc.com/access_$logdate.log;
    #root     /mnt/d/wsl/www/playsmart/;
    index    index.html index.htm index.php;

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        proxy_pass  http://127.0.0.1:9701;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host $http_host;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:9701;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }
}
server {
    listen       443 ssl;
    server_name  api.abc.com;
    error_page   500 502 503 504 /50x.html;
    index        index.html index.htm;

    access_log   /data/nginx/api.abc.com/access_$logdate.log;
    error_log    /data/nginx/api.abc.com/error.log;

    ssl_session_cache    shared:SSL:1m;
    ssl_certificate     pem/api.abc.com/cert.pem;  # pem文件的路径
    ssl_certificate_key  pem/api.abc.com/key.pem; # key文件的路径

    ssl_session_timeout  5m;    #缓存有效期
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE:ECDH:AES:HIGH:!NULL:!aNULL:!MD5:!ADH:!RC4;    #加密算法
    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;    #安全链接可选的加密协议
    ssl_prefer_server_ciphers on;   #使用服务器端的首选算法

    location = / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host api.abc.com;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        proxy_pass  http://127.0.0.1:9701;
    }

    location / {
        proxy_set_header    X-Real-IP $remote_addr;
        proxy_set_header    Host api.abc.com;
        proxy_set_header    X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header    Access-Control-Expose-Headers Content-Disposition;
        proxy_http_version  1.1;
        proxy_set_header    Connection keep-alive;
        proxy_cookie_path   / "/; secure; HttpOnly; SameSite=strict";

        if (!-e $request_filename) {
            proxy_pass  http://127.0.0.1:9701;
        }
    }

    location = /50x.html {
        root  /usr/share/nginx/html;
    }

}
```

#### gitlab runner

#### gitlab ci

