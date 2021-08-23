# 在centos8系统安装ffmpeg


```shell
yum install https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm
yum install https://download1.rpmfusion.org/free/el/rpmfusion-free-release-8.noarch.rpm https://download1.rpmfusion.org/nonfree/el/rpmfusion-nonfree-release-8.noarch.rpm
yum install http://mirror.centos.org/centos/8/PowerTools/x86_64/os/Packages/SDL2-2.0.10-2.el8.x86_64.rpm
yum install ffmpeg ffmpeg-devel
ffmpeg -version
```


> 修正依赖的SDL的版本(SDL2-2.0.8-7.el8.x86_64.rpm => SDL2-2.0.10-2.el8.x86_64.rpm)不对导致下载404的bug

