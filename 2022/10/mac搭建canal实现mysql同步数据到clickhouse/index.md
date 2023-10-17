# Mac搭建canal实现mysql同步数据到clickhouse


## mysql配置
```sql
-- 在主库开启slave通道
show variables like 'log_%';  -- 其中 log_bin 要 on
-- 在主库创建canal账号
create user 'canal'@'%' IDENTIFIED BY '123456';
grant select , replication client , replication slave on *.* TO 'canal'@'%';
flush PRIVILEGES;
```

## canal 安装
```shell
#下载canalan安装包
CANAL_VERSION="1.1.6";
CANAL_PROJECT="mm";
wget https://github.com/alibaba/canal/releases/download/canal-$CANAL_VERSION/canal.deployer-$CANAL_VERSION.tar.gz

#解压到指定目录
mkdir -p /usr/local/bin/canal
tar zxvf  canal.deployer-$CANAL_VERSION.tar.gz  -C  /usr/local/bin/canal

#解压后进入目录，结构如下
#drwxr-xr-x   7 staff  staff   238 12 14 23:34 bin
#drwxr-xr-x   9 staff  staff   306 12 14 23:32 conf
#drwxr-xr-x  83 staff  staff  2822 12 14 23:30 lib
#drwxr-xr-x   4 staff  staff   136 12 14 23:34 logs

# canal启动时会读取conf目录下面的文件夹，当作instance,进入conf目录下复制example文件夹
cp -R  conf/example／  conf/$CANAL_PROJECT/

#移除example文件夹
mv -rf example

#修改canal.properties(一定要修改)
# instance列表，conf目录下必须有同名的目录
canal.destinations = $CANAL_PROJECT

#修改maxwell文件夹下面的instance.properties文件下面几项为你自己的数据库配置即可
vi conf/$CANAL_PROJECT/instance.properties

# position info
canal.instance.master.address=127.0.0.1:3306

# username/password
canal.instance.dbUsername=canal
canal.instance.dbPassword=123456

# 启动，安装目录下执行以下命令,server,instance出现下面日记说明启动成功
bin/startup.sh
# 查看server日记，会出现以下日记
tail -200f  logs/canal/canal.log

2019-12-14 23:34:47.247 [main] INFO  com.alibaba.otter.canal.deployer.CanalLauncher - ## set default uncaught exception handler
2019-12-14 23:34:47.312 [main] INFO  com.alibaba.otter.canal.deployer.CanalLauncher - ## load canal configurations
2019-12-14 23:34:47.334 [main] INFO  com.alibaba.otter.canal.deployer.CanalStarter - ## start the canal server.
2019-12-14 23:34:47.406 [main] INFO  com.alibaba.otter.canal.deployer.CanalController - ## start the canal server[192.168.0.111(192.168.0.111):11111]
2019-12-14 23:34:49.026 [main] INFO  com.alibaba.otter.canal.deployer.CanalStarter - ## the canal server is running now ......

# 查看instance日记，会出现以下日记
tail -200f  logs/$CANAL_PROJECT/maxwell.log

2019-12-15 17:59:12.908 [destination = example , address = /192.168.0.102:3306 , EventParser] WARN  c.a.o.c.p.inbound.mysql.rds.RdsBinlogEventParserProxy - ---> begin to find start position, it will be long time for reset or first position
2019-12-15 17:59:12.913 [destination = example , address = /192.168.0.102:3306 , EventParser] WARN  c.a.o.c.p.inbound.mysql.rds.RdsBinlogEventParserProxy - prepare to find start position just last position
{"identity":{"slaveId":-1,"sourceAddress":{"address":"192.168.0.102","port":3306}},"postion":{"gtid":"","included":false,"journalName":"bin.000002","position":249315,"serverId":1,"timestamp":1576282583000}}
2019-12-15 17:59:13.015 [destination = example , address = /192.168.0.102:3306 , EventParser] WARN  c.a.o.c.p.inbound.mysql.rds.RdsBinlogEventParserProxy - ---> find start position successfully, EntryPosition[included=false,journalName=bin.000002,position=249315,serverId=1,gtid=,timestamp=1576282583000] cost : 105ms , the next step is binlog dump


#关闭
sh bin/stop.sh
```
