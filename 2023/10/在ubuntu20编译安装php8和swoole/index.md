# 在ubuntu20编译安装php8和swoole


```shell
apt install -y gcc libxml2-dev pkg-config libkrb5-dev libssl-dev libsqlite3-dev zlib1g-dev libcurl4-openssl-dev libpng-dev libjpeg-dev libfreetype-dev g++ libonig-dev libxslt-dev libzip-dev libbz2-dev

export SOURCE_DIR="/data/src/install"; # 源码下载目录
export PHP_VERSION="8.1.24"; # PHP的版本
export PHP_INSTALL_DIR="/usr/local/php$PHP_VERSION"; # PHP将要安装到哪个目录
export PHP_REDIS_VERSION="5.3.7";

mkdir -p $SOURCE_DIR;
cd $SOURCE_DIR;

apt -y install libsodium-dev;

wget -c https://www.php.net/distributions/php-$PHP_VERSION.tar.gz;
tar -zxvf php-$PHP_VERSION.tar.gz;
cd php-$PHP_VERSION;
./configure --prefix=$PHP_INSTALL_DIR --with-config-file-path=$PHP_INSTALL_DIR/etc --with-config-file-scan-dir=$PHP_INSTALL_DIR/etc/conf.d --with-curl --with-freetype --enable-gd --with-jpeg  --with-gettext --with-kerberos --with-libdir=lib64 --with-libxml --with-mysqli --with-openssl --with-pdo-mysql  --with-pdo-sqlite --with-pear --enable-sockets --with-mhash --with-ldap-sasl --with-xsl --with-zlib --with-zip -with-bz2 --with-iconv  --enable-fpm --enable-pdo --enable-ftp --enable-bcmath  --enable-mbregex --enable-mbstring --enable-opcache --enable-pcntl  --enable-shmop --enable-soap --enable-sockets --enable-sysvsem --enable-xml --enable-sysvsem --enable-cli --enable-opcache --enable-intl --enable-calendar --enable-static --enable-mysqlnd --with-sodium
make
make install
mkdir -p $PHP_INSTALL_DIR/etc/conf.d/;

if [[ -f "~/.zshrc" ]] ; then
echo "export PATH=\"$PHP_INSTALL_DIR/bin/:\$PATH\"" >> ~/.zshrc
fi
if [[ -f "~/.bashrc" ]] ; then
echo "export PATH=\"$PHP_INSTALL_DIR/bin/:\$PATH\"" >> ~/.bashrc # bash环境的选这个
fi


export SWOOLE_VERSION="5.1.0";
cd $SOURCE_DIR;
wget -c https://github.com/swoole/swoole-src/archive/refs/tags/v$SWOOLE_VERSION.tar.gz;
tar -zxvf v$SWOOLE_VERSION.tar.gz;
cd swoole-src-$SWOOLE_VERSION;
phpize;
./configure --enable-openssl --enable-sockets --enable-mysqlnd --enable-swoole-curl
make
make install;
# 添加ini文件  extension=swoole.so
echo 'extension=swoole.so' >> $PHP_INSTALL_DIR/etc/conf.d/10-swoole.ini
echo 'swoole.use_shortname="Off"' >> $PHP_INSTALL_DIR/etc/conf.d/10-swoole.ini

cd $SOURCE_DIR;
pecl install igbinary;
echo 'extension=igbinary.so' >> $PHP_INSTALL_DIR/etc/conf.d/10-igbinary.ini
pecl install msgpack;
echo 'extension=msgpack.so' >> $PHP_INSTALL_DIR/etc/conf.d/10-msgpack.ini
apt -y install liblzf-dev
apt -y install libzstd-dev

cd $SOURCE_DIR;
wget -c https://github.com/phpredis/phpredis/archive/refs/tags/$PHP_REDIS_VERSION.tar.gz -O phpredis-$PHP_REDIS_VERSION.tar.gz;
tar zxf phpredis-$PHP_REDIS_VERSION.tar.gz;
cd phpredis-$PHP_REDIS_VERSION;
#git clone https://github.com/phpredis/phpredis.git
#cd phpredis; # 切换版本 git checkout -b v5.3.7 5.3.7
phpize
./configure --enable-redis-igbinary --enable-redis-msgpack --enable-redis-lzf --with-liblzf --enable-redis-zstd
make
make install;
echo 'extension=redis.so' >> $PHP_INSTALL_DIR/etc/conf.d/10-redis.ini

```
