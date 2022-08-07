# Ubuntu安装php8.1和swoole


### hyperf2.2 + php8.1 + swoole + redis + mysql + ubuntu20 的环境
```bash
apt install software-properties-common
add-apt-repository ppa:ondrej/php
apt update

# mysql用的是云商的, 本地不安装
apt-get update
apt install php8.1
apt install php8.1-swoole;
apt install php8.1-redis;
apt install php8.1-xml;
apt install php8.1-simplexml;
apt install php8.1-bcmath;
apt install zip unzip php-zip;

curl -sS https://getcomposer.org/installer -o /tmp/composer-setup.php;
php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer;
composer config -g repo.packagist composer https://mirrors.aliyun.com/composer/;

# 这个是hyperf需要的设置
echo 'swoole.use_shortname="Off"' >> /etc/php/8.1/cli/conf.d/25-swoole.ini; 
```
