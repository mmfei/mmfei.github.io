# 在ubuntu搭建hyperf


```shell

// 安装php
$ wget https://gitee.com/yurunsoft/php-env/raw/master/apt-php.sh && bash apt-php.sh
// 安装 redis 扩展
$ wget https://gitee.com/yurunsoft/php-env/raw/master/php-redis.sh && bash php-redis.sh
// 安装 composer
$ wget https://gitee.com/yurunsoft/php-env/raw/master/composer.sh && bash composer.sh
// 安装 swoole
$ wget https://gitee.com/yurunsoft/php-env/raw/master/install-swoole.sh && bash install-swoole.shco
// 查看php.ini文件 添加 swoole.use_shortname="off"
$ php --ini
// 报错 4核8G
1. 解决方法 https://wenda.swoole.com/detail/107272
2. 编译时选择no
   g++: fatal error: Killed signal terminated program cc1plus
   compilation terminated.
   make: *** [Makefile:204: ext-src/swoole_client_coro.lo] Error 1
   g++: fatal error: Killed signal terminated program cc1plus
   compilation terminated.
   make: *** [Makefile:192: ext-src/php_swoole.lo] Error 1
   g++: fatal error: Killed signal terminated program cc1plus
   compilation terminated.
   // 查看php /composer/ swoole是否安装成功
   $ php -v
   $ composer -v
   $ php --ri swoole
   swoole

   Swoole => enabled
   Author => Swoole Team <team@swoole.com>
   Version => 4.6.7
   Built => May 28 2021 17:15:13
   coroutine => enabled with boost asm context
   epoll => enabled
   eventfd => enabled
   signalfd => enabled
   cpu_affinity => enabled
   spinlock => enabled
   rwlock => enabled
   openssl => OpenSSL 1.1.1f  31 Mar 2020
   dtls => enabled
   http2 => enabled
   pcre => enabled
   zlib => 1.2.11
   mutex_timedlock => enabled
   pthread_barrier => enabled
   futex => enabled
   mysqlnd => enabled
   async_redis => enabled

   Directive => Local Value => Master Value
   swoole.enable_coroutine => On => On
   swoole.enable_library => On => On
   swoole.enable_preemptive_scheduler => Off => Off
   swoole.display_errors => On => On
   swoole.use_shortname => Off => Off
   swoole.unixsock_buffer_size => 8388608 => 8388608
```
