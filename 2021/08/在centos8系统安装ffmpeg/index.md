# 在centos8系统安装ffmpeg

## 方法一: 源码安装
```shell
FFMPEG_VERSION="5.0";
YASM_VERSION='1.3.0';

pwd=`pwd`;
cd $pwd;
wget http://www.tortall.net/projects/yasm/releases/yasm-$YASM_VERSION.tar.gz;
tar -xvf yasm-$YASM_VERSION.tar.gz;
cd yasm-$YASM_VERSION;
./configure && make -j 4 && sudo make install

cd $pwd;

wget http://www.ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.gz

tar -xvf ffmpeg-$FFMPEG_VERSION.tar.gz

cd ffmpeg-$FFMPEG_VERSION/
./configure && make && make install

ffmpeg -version


```

## 方法二: yum 安装 , 现在centos停止维护了,  这个应该用不了了 , 用方法1吧
```shell
yum install https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm
yum install https://download1.rpmfusion.org/free/el/rpmfusion-free-release-8.noarch.rpm https://download1.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-8.noarch.rpm
yum install http://mirror.centos.org/centos/8/PowerTools/x86_64/os/Packages/SDL2-2.0.10-2.el8.x86_64.rpm
yum install ffmpeg ffmpeg-devel
ffmpeg -version
```


> 修正依赖的SDL的版本(SDL2-2.0.8-7.el8.x86_64.rpm => SDL2-2.0.10-2.el8.x86_64.rpm)不对导致下载404的bug


