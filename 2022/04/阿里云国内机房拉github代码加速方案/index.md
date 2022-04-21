# 阿里云国内机房拉github代码加速方案


## 绑定host
su root

vi /etc/hosts
```shell
# github
204.232.175.78 documentcloud.github.com
207.97.227.239 github.com
204.232.175.94 gist.github.com
107.21.116.220 help.github.com
207.97.227.252 nodeload.github.com
199.27.76.130 raw.github.com
107.22.3.110 status.github.com
204.232.175.78 training.github.com
207.97.227.243 www.github.com
```

## 安装神秘客户端

```shell
cd /opt/
wget https://nodejs.org/dist/v14.0.0/node-v14.0.0-linux-x64.tar.xz
tar xvf node-v14.0.0-linux-x64.tar.xz
echo "export NODE_HOME=/opt/node-v14.0.0-linux-x64" >> ~/.bashrc
echo "export PATH=\$NODE_HOME/bin:\$PATH" >> ~/.bashrc
source ~/.bashrc
npm install pm2 -g
touch /opt/clash/start_clash.sh
echo "./clash -d ." > /opt/clash/start_clash.sh
chmod 777 start_clash
pm2 start /opt/clash/start_clash.sh
export https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 all_proxy=socks5://127.0.0.1:7891

```

## 换海外的阿里云ecs(推荐这个)
