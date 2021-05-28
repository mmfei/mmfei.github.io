# MacbookMAMP套件安装yasd扩展调试swoole和hyperf代码


这是一个在macbook环境下 , 用MAMP套件的小伙伴 , 如果安装一个yasd扩展进行调试

## 步骤
* 下载yasd
* 编译yasd
* 配置php.ini

## 安装yasd扩展
* debug是在本机debug , 端口是9001
```shell
brew install boost

git clone https://github.com/swoole/yasd.git;
cd yasd;
phpize --clean && \
phpize && \
./configure && \
make clean && \
make && \
make install

export PHP_INI=`php -i | grep "conf/php.ini" | awk '{print $5}'`;
echo '[xdebug]' >> $PHP_INI
echo 'zend_extension=yasd' >> $PHP_INI
echo 'yasd.debug_mode=remote' >> $PHP_INI
echo 'yasd.remote_host=127.0.0.1' >> $PHP_INI
echo 'yasd.remote_port=9001' >> $PHP_INI
```


## phpstorm配置
对应端口改```9001```
![/images/posts/MacbookMAMP套件安装yasd扩展调试swoole和hyperf代码/phpstorm_debug_port_setting.png](/images/posts/MacbookMAMP套件安装yasd扩展调试swoole和hyperf代码/phpstorm_debug_port_setting.png)


