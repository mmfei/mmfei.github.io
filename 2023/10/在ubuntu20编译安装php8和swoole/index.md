# 在ubuntu20编译安装php8和swoole


```shell
apt install -y gcc libxml2-dev pkg-config libkrb5-dev libssl-dev libsqlite3-dev zlib1g-dev libcurl4-openssl-dev libpng-dev libjpeg-dev libfreetype-dev g++ libonig-dev libxslt-dev libzip-dev libbz2-dev 

export SOURCE_DIR="/data/src/install"; # 源码下载目录
export PHP_VERSION="8.1.24"; # PHP的版本
export PHP_INSTALL_DIR="/usr/local/php$PHP_VERSION"; # PHP将要安装到哪个目录

mkdir -p $SOURCE_DIR;
cd $SOURCE_DIR;

wget -c https://www.php.net/distributions/php-$PHP_VERSION.tar.gz;
tar -zxvf php-$PHP_VERSION.tar.gz;
cd php-$PHP_VERSION;

./configure --prefix=$PHP_INSTALL_DIR --with-config-file-path=$PHP_INSTALL_DIR/etc --with-config-file-scan-dir=$PHP_INSTALL_DIR/etc/conf.d --with-curl --with-freetype --enable-gd --with-jpeg  --with-gettext --with-kerberos --with-libdir=lib64 --with-libxml --with-mysqli --with-openssl --with-pdo-mysql  --with-pdo-sqlite --with-pear --enable-sockets --with-mhash --with-ldap-sasl --with-xsl --with-zlib --with-zip -with-bz2 --with-iconv  --enable-fpm --enable-pdo --enable-ftp --enable-bcmath  --enable-mbregex --enable-mbstring --enable-opcache --enable-pcntl  --enable-shmop --enable-soap --enable-sockets --enable-sysvsem --enable-xml --enable-sysvsem --enable-cli --enable-opcache --enable-intl --enable-calendar --enable-static --enable-mysqlnd
make 
make install;
# 注意需要确认env是不是以这个版本的php为主
php -v;

export SWOOLE_VERSION="5.1.0";
cd $SOURCE_DIR;
wget -c https://github.com/swoole/swoole-src/archive/refs/tags/v$SWOOLE_VERSION.tar.gz;
tar -zxvf v$SWOOLE_VERSION.tar.gz;
cd swoole-src-$SWOOLE_VERSION;
phpize;
./configure
make
make install;
# 添加ini文件  extension=swoole.so
# echo 'swoole.use_shortname="Off"' >> $PHP_INSTALL_DIR/etc/

php -m; # 查看安装的扩展
php --ri swoole; # 查看swoole 
```
