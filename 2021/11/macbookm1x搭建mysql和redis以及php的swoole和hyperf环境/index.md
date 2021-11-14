# MacBookM1X搭建mysql和redis以及php的swoole和hyperf环境


```shell
brew install php@7.4
brew install openssl
pecl install igbinary
brew install redis
pecl install swoole

brew install boost; # 在m1x环境 , yasd在编译的时候会找不到这个boost依赖 , 解决方式如下

# 这里是解决yasd安装的时候找不到boost库的提示
sudo ln -s /opt/homebrew/Cellar/boost/1.76.0/lib/libboost_filesystem.dylib /usr/local/lib
sudo mkdir /usr/local/include
sudo ln -s /opt/homebrew/Cellar/boost/1.76.0/include/boost /usr/local/include/boost

# 安装yasd调试扩展 , 记得加-e参数才能debug
git clone https://github.com/swoole/yasd;
cd yasd;
./configure;
make;
make install;
```

```shell
#重建系统
brew install iTerm2
brew install hugo;
brew install bat;
```
