# Ubuntu系统初始化设置


> 由于centos停止维护了 , 这次彻底换个系统吧

    要做的东西还是很多的 , 做个笔记

    前提:
        服务器ip 10.0.0.1
        ssh的端口 10087
        ssh的用户 root

    安装文件在 /data/src/install;
    
    防火墙设置
    1. 关闭firewalld
    2. iptables全开放 (ufd最终还是会落到iptables的)
    3. 打开ufd

## 配置服务器的ssh和免密登录
```shell
# 配置sshd的端口
sed -i 's/#Port 22/Port 10087/' /etc/ssh/sshd_config
echo '{你的 ~/.ssh/id_rsa.pub 的内容}' >> ~/.ssh/authorized_keys; # 在你电脑 cat ~/.ssh/id_rsa.pub 可以获得
/etc/init.d/ssh restart

mkdir -p /data/src/install;
```

## 在客户端(自己的电脑)
```shell
echo 'Host sshabc' >> ~/.ssh/config; # 这里可以改个自己喜欢的名字
echo '	HostName 10.0.0.1' >> ~/.ssh/config ; # 改为服务器ip
echo '	Host 10087' >> ~/.ssh/config # 指定端口
echo '	User root' >> ~/.ssh/config # 指定账号
```

## 使用阿里云的源
```shell
#添加阿里源
cat << EOF > /etc/apt/sources.list
deb http://mirrors.aliyun.com/ubuntu/ focal main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ focal main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-security main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ focal-security main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-updates main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ focal-updates main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-proposed main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ focal-proposed main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-backports main restricted universe multiverse
deb-src http://mirrors.aliyun.com/ubuntu/ focal-backports main restricted universe multiverse
EOF
apt-get update
```

## 安装docker和docker-composer
```shell
cd /data/src/install;
cat << EOF > ./docker_docker-compose_install.sh
#!/bin/sh
# -*- coding: utf-8 -*-

 
apt install -y firewalld apt-transport-https ca-certificates curl software-properties-common gcc
 
apt -y install docker.io
 
sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config && setenforce 0
 
apt -y install docker-compose
 
systemctl enable docker.service

systemctl stop firewalld.service;
systemctl disable firewalld.service;
iptables -P INPUT ACCEPT; # 全部打开
iptables -P OUTPUT ACCEPT; # 全部打开

systemctl start ufw;
systemctl enable ufw;

ufw enable
ufw allow 10087
ufw allow 80


reboot

EOF
sh ./docker_docker-compose_install.sh
```

## 安装zsh (可选)
```shell
apt install zsh -y
sh -c "$(curl -fsSL https://raw.github.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"
cd ~/.oh-my-zsh/themes
wget https://raw.githubusercontent.com/zakaziko99/agnosterzak-ohmyzsh-theme/master/agnosterzak.zsh-theme
sed -i 's/ZSH_THEME="robbyrussell"/ZSH_THEME="agnosterzak"/' ~/.zshrc
apt install fonts-powerline git -y
git clone https://github.com/zsh-users/zsh-autosuggestions $ZSH_CUSTOM/plugins/zsh-autosuggestions
sed -i "s/plugins=(git)/plugins=(git extract z zsh-autosuggestions)/" ~/.zshrc
zsh
chsh --shell /bin/zsh
source ~/.zshrc
```



## 如果你是在阿里云的ecs
```shell
apt update
apt install -y apt-transport-https ca-certificates curl gnupg-agent software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
apt update
apt install -y docker-ce docker-ce-cli containerd.io
systemctl status docker

curl -L "https://github.com/docker/compose/releases/download/v2.4.1/docker-compose-$(uname -s| tr '[:upper:]' '[:lower:]')-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose --version

```
