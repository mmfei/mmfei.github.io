# 搭建robot Framework Ride测试框架

![/images/posts/搭建robot-framework-ride测试框架/img.png](/images/posts/搭建robot-framework-ride测试框架/img.png)
> 方案1 (直接本地安装)
```shell
# 
pip install -U robotframework
pip install -U -r https://raw.githubusercontent.com/robotframework/RIDE/master/requirements.txt
pip install -U robotframework-ride

mkdir project;
cd project;
pipenv --three
pipenv install robotframework-ride
robotframework-ride
```


> 方案2 (docker方案 , 容器运行ride.py + xquartz + socat , 完成通讯;)

>> osx
```shell
# 安装xquartz
[https://www.xquartz.org/](https://www.xquartz.org/)
# 安装 socat
brew install socat

# 启动docker里面的ride.py
socat TCP-LISTEN:6000,reuseaddr,fork UNIX-CLIENT:\"$DISPLAY\"
open -a XQuartz

git clone https://github.com/mmfei/docker-robotframework-ride;
cd docker-robotframework-ride;  # 目录: /data1/src/script/robots/test
docker-compose up -d;

```
>> Windows (请先装好虚拟机和x client)
```shell
docker run --rm -e DISPLAY=$DISPLAY -v /data1/src/script/robots/test:/robot softsam/robotframework-ride

# 或者
git clone https://github.com/mmfei/docker-robotframework-ride;
cd docker-robotframework-ride;  # 目录: /data1/src/script/robots/test
docker-compose up -d;
```

