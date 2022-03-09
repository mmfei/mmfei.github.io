# 阿里云服务器yum报错Errors_during_downloading_metadata_for_repository_AppStream


```bash
[root@mmfei.com yum.repos.d]# yum makecache
Repository epel is listed more than once in the configuration
CentOS-8 - AppStream                                                                                 3.2 kB/s | 2.5 kB     00:00
Errors during downloading metadata for repository 'AppStream':
  - Status code: 404 for http://mirrors.cloud.aliyuncs.com/centos/8/AppStream/x86_64/os/repodata/repomd.xml (IP: 100.100.2.148)
Error: Failed to download metadata for repo 'AppStream': Cannot download repomd.xml: Cannot download repodata/repomd.xml: All mirrors were tried
[root@mmfei.com yum.repos.d]#
```


## 查了各种资料 , 实际上是 centos8 已经停止维护了 , 从此江湖再无centos了...哎
### 所有镜像 , 都关闭了, 只剩下归档用的镜像

    修复方式
```bash
cd /etc/yum.repos.d/;
rename '.repo' '.repo.bak' /etc/yum.repos.d/*.repo;

wget https://mirrors.aliyun.com/repo/Centos-vault-8.5.2111.repo -O /etc/yum.repos.d/Centos-vault-8.5.2111.repo
wget https://mirrors.aliyun.com/repo/epel-archive-8.repo -O /etc/yum.repos.d/epel-archive-8.repo

sed -i 's/mirrors.cloud.aliyuncs.com/url_tmp/g'  /etc/yum.repos.d/Centos-vault-8.5.2111.repo &&  sed -i 's/mirrors.aliyun.com/mirrors.cloud.aliyuncs.com/g' /etc/yum.repos.d/Centos-vault-8.5.2111.repo && sed -i 's/url_tmp/mirrors.aliyun.com/g' /etc/yum.repos.d/Centos-vault-8.5.2111.repo && sed -i 's/mirrors.aliyun.com/mirrors.cloud.aliyuncs.com/g' /etc/yum.repos.d/epel-archive-8.repo
yum clean all;
yum makecache;
```

    还是找个时间换系统吧 , 目前就ubuntu了.....
    再不行就gentoo了 , 要自己去编译了 0.0
