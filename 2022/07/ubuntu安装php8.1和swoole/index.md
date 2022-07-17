# Ubuntu安装php8.1和swoole


### hyperf2.2 + php8.1 + swoole + redis + mysql + ubuntu20 的环境
```bash
# mysql用的是云商的, 本地不安装
apt-get update
apt install php8.1
apt install php8.1-swoole;
apt install php8.1-redis;
apt install php8.1-xml;
apt install php8.1-simplexml;
apt install php8.1-bcmath;

# 这个是hyperf需要的设置
echo 'swoole.use_shortname="Off"' >> /etc/php/8.1/cli/conf.d/25-swoole.ini; 
```
