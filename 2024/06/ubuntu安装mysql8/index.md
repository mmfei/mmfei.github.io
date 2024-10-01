# Ubuntu安装mysql8


```bash
sudo apt update ; # 更新包管理器的包列表
sudo apt install mysql-server ; # 安装MySQL 服务器
sudo mysql_secure_installation ; # 安全配置MySQL
sudo systemctl start mysql.service ; # 启动MySQL服务
sudo systemctl enable mysql.service ; # 使MySQL服务在系统启动时自动启动
sudo systemctl status mysql.service ; # 检查MySQL服务的状态
sudo mysql -u root -p ; # 登录到MySQL服务

```

