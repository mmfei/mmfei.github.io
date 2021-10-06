# Mac通过brew安装php7.4+swoole


```bash
brew install php@7.4
brew install openssl
pecl install igbinary
brew install redis
pecl install swoole
```
## 这里会有三四个询问确认的 , 需要注意的是 ssl那个选项 , 要选择 `yes --with-openssl-dir=/usr/local/opt/openssl@1.1`



## 启动php服务进行调试(要带`-e`参数)
```shell
> php -e test.php # 如果没在ide没监听debug信息 , 会出现这段文字 , 意思是没找到监听
[yasd] Connect IDE failed (Connection refused), please check that the IDE is in a listening state
```

## 补一个hyperf2.2+swoole 4.6 组合的bug
> hyperf 2.2 框架用了pcntl_fork函数 , 但是这个函数在swoole 4.6.0 后被禁用了.这个问题据说在linux不会出现 , 比较神奇
> 如果是hyperf2.2 搭配了 swoole4.6以上版本 , 会出现很魔幻的报错:

```shell
> php ./bin/hyperf.php start
Warning: pcntl_fork() has been disabled for security reasons
```

我查了这个问题很久 , 网上到处说的是php的 disable_function , 实际上是swoole在协程环境下,禁用了危险参数:
```
使用协程时禁用不安全功能，包括 `pcntl_fork/pcntl_wait/pcntl_waitpid/pcntl_sigtimedwait`
```

> 解决方案就是用swoole 4.5版本的
```shell
brew install php@7.4
brew install openssl
pecl install igbinary
brew install redis
pecl install install https://pecl.php.net/get/swoole-4.5.2.tgz
yes --with-openssl-dir=/usr/local/opt/openssl@1.1
```

