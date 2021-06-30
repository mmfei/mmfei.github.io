# 每日备份docker部署的gitlab服务的最简单方案


> 每日备份docker部署的gitlab服务的最简单的方案 , 简单直接
> gitlab的服务器每日执行下备份
> 另一台服务器每日从gitlab服务器rsync备份文件到本地(此服务器需要对gitlab服务器完成ssh免密登录)


### 需要具备以下知识才能看懂
1. ssh免密登录
2. crontab定时服务
3. 理解 gitlab服务器 和 备份服务器 的关系
4. 了解docker
5. 了解如何在服务器上修改一个文件
6. 了解shell或者bash

## 最终实现每日定期备份gitlab源码所有数据
> 每日3点1分 , gitlab服务器自动备份; 
> 
> 每日5点1分 , 备份机器自动去gitlab服务器同步备份文件

## gitlab的服务器
    在gitlab服务器上存放一个文件 `/data/src/script/backup_gitlab.sh`
    chmod +x /data/src/script/backup_gitlab.sh; # 需要给一个执行权限
    
### /data/src/script/backup_gitlab.sh
```bash
#!/bin/sh
# 此脚本完成 
#   1. 立刻备份gitlab项目 (会在backup生成一个备份包)
#   2. 指定目录 下 backup 文件只保留最新的5份

dir="/data/backups" # gitlab备份所在的目录 , 需要docker -v /data/backups:/var/opt/gitlab/backups:rw 挂载好
save_number="5" # 备份只留最新5份
keyword="backup" # 过滤关键字,防止目录有混淆其他文件删错了
docker exec -t gitlab gitlab-rake gitlab:backup:create   # 这里要注意去掉-i,否则备份不成功
cd $dir
save_file=`ls -lrt | grep "$keyword" | tail -$save_number | awk '{print $NF}'`
ls | grep "$keyword" | grep -v "$save_file" | xargs rm -rf
echo "finish!"
```

    在gitlab服务器配好定时器crontab (命令: crontab -e 能直接编辑)

### crontab
```crontab
# 每日三点零1分开始备份
1 3 * * * /data/src/script/backup_gitlab.sh > "/data/logs/gitlab_backups/gitlab.backup.$(date +"\%Y-\%m-\%d+\%T").log" 2>&1
```


## 备份数据的机器
    在备份机存放以下脚本 /data/src/script/pull_gitlab_backup.sh
### /data/src/script/pull_gitlab_backup.sh
```bash
# 注意: 备份服务器 需要提前完成对 gitlab服务器的 免密登录

local_backup_dir="/data/gitlab_backups/" #本地gitlab备份文件存放的位置
gitlab_server_host="ip"  #gitlab服务器的ip
gitlab_server_ssh_port="22" #gitlab服务器的ssh的端口
gitlab_backup_dir_in_server="/data/backups/" #gitlab服务器上的备份目录"/"结尾

# 开始同步服务器的备份文件下来
rsync -avz -e "ssh -P $gitlab_server_ssh_port" root@$gitlab_server_host:$gitlab_backup_dir_in_server $local_backup_dir

# 删除多余的备份文件 , 只保留最新五份

save_number="5" # 备份只留最新5份
keyword="backup" # 过滤关键字,防止目录有混淆其他文件删错了
cd $local_backup_dir
save_file=`ls -lrt | grep "$keyword" | tail -$save_number | awk '{print $NF}'`
ls | grep "$keyword" | grep -v "$save_file" | xargs rm -rf

echo 'finished';
```
### 在备份机配好定时器

    在备份数据的机器配好定时器crontab (命令: crontab -e 能直接编辑)
```crontab
# 每日五点零1分开始备份 (预计2小时内服务器已经完成备份)
1 3 * * * /data/src/script/pull_gitlab_backup.sh > "/data/logs/gitlab_backups/gitlab.backup.$(date +"\%Y-\%m-\%d+\%T").log" 2>&1
```


### 可以给备份数据的机器 设置免密登录

```shell
# file ~/.ssh/config
#Host gitlab_server_demo
#    HostName gitlab服务器的公网ip
#    Port gitlab服务器的ssh的端口,一般是22
#    User gitlab服务器ssh登录账号,一般是root(更建议是低权的账号)
#    IdentityFile 私钥文件(一般是:~/.ssh/id_rsa)


# 以下配置需要把 `cat ~/.ssh/id_rsa.pub` 的内容追加到 gitlab服务器的 ~/.ssh/authorized_keys
# 在备份服务执行 ssh gitlab_server 如果正常是可以免密登录了
Host gitlab_server
    HostName 8.8.8.8
    Port 8888
    User root
    IdentityFile ~/.ssh/id_rsa
```


