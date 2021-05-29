#!/bin/bash
echo 'INSTALL OpenResty';
wget -c https://openresty.org/package/centos/openresty.repo -O /etc/yum.repos.d/openresty.repo
yum check-update
yum install -y openresty
systemctl start openresty
systemctl enable openresty
ls -al /usr/local/openresty/
ls -al /usr/local/openresty/nginx/sbin

echo 'INSTALL PHP'
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
source /etc/profile

# install php-redis
echo 'INSTALL php-redis';
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


#### swoole
echo 'INSTALL swoole';
yum install -y glibc-headers gcc-c++
export SWOOLE_VERSION=4.6.7
mkdir -p /data/src/install/swoole-$SWOOLE_VERSION
cd /data/src/install/swoole-$SWOOLE_VERSION
wget -c https://pecl.php.net/get/swoole-$SWOOLE_VERSION.tgz -O /data/src/install/swoole-$SWOOLE_VERSION/swoole-$SWOOLE_VERSION.tgz --no-check-certificate
tar -zvxf swoole-$SWOOLE_VERSION.tgz
cd swoole-$SWOOLE_VERSION
/usr/local/php/bin/phpize
./configure --with-php-config=/usr/local/php/bin/php-config
make && make install
echo 'extension="swoole.so"' >> /usr/local/php/etc/php.ini
echo 'swoole.use_shortname = off' >> /usr/local/php/etc/php.ini
php -m | grep swoole

echo 'INSTALL success';
