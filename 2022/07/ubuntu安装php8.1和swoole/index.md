# Ubuntu安装php8.1和swoole


# hyperf2.2 + swoole + redis + mysql + ubuntu20 的环境 (mysql用的是云商的, 本地不安装)
```bash
apt-get update
apt install php8.1
apt install php8.1-swoole;
apt install php8.1-redis;

echo 'swoole.use_shortname="Off"' >> /etc/php/8.1/cli/conf.d/25-swoole.ini; # 这个是hyperf需要的设置
```
