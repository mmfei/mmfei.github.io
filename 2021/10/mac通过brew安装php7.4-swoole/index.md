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

