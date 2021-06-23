# 如何在vscode编辑器中通过xdebug调试在docker的运行的服务


[https://github.com/oh-my-docker-hub/oh-my-docker/blob/master/build/php7/README.php7.md](https://github.com/oh-my-docker-hub/oh-my-docker/blob/master/build/php7/README.php7.md)


![github last commit](https://img.shields.io/github/last-commit/omydockerhub/php7.svg)
![language](https://img.shields.io/badge/language-dockerfile-3572A5.svg)

## docker hub : [omydockerhub/php7](https://hub.docker.com/r/omydockerhub/php7)
![docker build](https://img.shields.io/docker/cloud/build/omydockerhub/php7.svg)
![docker automated](https://img.shields.io/docker/cloud/automated/omydockerhub/php7.svg)
![docker image size](https://img.shields.io/docker/v/omydockerhub/php7/latest)
![docker hub](https://img.shields.io/docker/pulls/omydockerhub/php7.svg)
![docker image size](https://img.shields.io/docker/image-size/omydockerhub/php7/latest.svg)


# 如何Debug容器里面运行的php服务
## 配置好xdebug
```ini
; conf/conf.d/docker-php-ext-xdebug.ini
; 此文件映射到 /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini
[XDebug]
xdebug.default_enable=1
xdebug.remote_enable=1
xdebug.remote_port=19900;xdebug的远程端口
xdebug.remote_handler=dbgp;
xdebug.remote_connect_back=0
xdebug.remote_host=192.168.0.105 ; 你本机的IP地址(内网,不是公网)
xdebug.idekey=VSCODE
xdebug.remote_autostart=1
xdebug.remote_log=/data1/logs/xdebug/remote.log ;xdebug的日志输出地址，可加可不加	
```

# vscode 配置 xdebug 在 docker 里面调试php  (vscode 要安装 php debug插件 , 下面是vscode 调试的配置)
```json
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [

        {
            "name": "Listen for XDebug",
            "type": "php",
            "request": "launch",
            "port": 19900, // 对应 XDebug 的配置
            "stopOnEntry": true,
            "pathMappings": {
                // "容器中对应的项目地址": "本机项目地址"
                // 绝对路径
                "${workspaceRoot}": "${workspaceRoot}"
            }
        },
        {
            "name": "Launch currently open script",
            "type": "php",
            "request": "launch",
            "program": "${file}",
            "cwd": "${fileDirname}",
            "port": 9090
        } 
   
    ]
}
```

## 然后可以调试了
1. 在vscode先点击debug按钮 , 此时vscode已经告知docker里面的php的xdebug服务 , 此刻开始调试
2. 在浏览器打开一个url 或者 在vscode里面 直接运行一个文件
3. 此时就可以看到效果 (最好设置个断点 , 比较方便看到效果)


![](https://raw.githubusercontent.com/oh-my-docker-hub/oh-my-docker/master/build/php7/static/images/2020-07-03-02-24-11.png)

