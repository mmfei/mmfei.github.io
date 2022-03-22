# Nginx统计网站的pv和uv和ip


```nginx
# nginx 配置
log_format tongji '$remote_addr - [$time_iso8601]  "$request" '' - $status "User_Cookie:$guid" ';
                        
 server {
    listen      80;
    server_name xxx.com;
    index index.html index.htm index.php;
    root /alidata/www/tongji;
    #将cookie中key为guid，value为字母、数字部分保存为guid
    if ( $http_cookie ~* "guid=([a-zA-Z0-9]*)"){
        set $guid $1;
    }
    if ($time_iso8601 ~ "(\d{4}-\d{2}-\d{2})") {
        set $date $1;
    }
    #访问日志引用“tongji”的格式化，并按照日期分割保存。
    access_log /alidata/www/nginx_log/access_$date.log tongji;
    location ~* ^(.*)$ {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header REMOTE-HOST $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 8m;
    }
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   html;
    }
}                       
```


## 前端的统计用的埋点 , 主要是写一个cookie
```javascript
var cookie = {
    //当天剩下的毫秒数
    leftTime: function() {
        var curTamp = new Date().getTime();
        //当日凌晨的时间戳,减去一毫秒是为了防止后续得到的时间不会达到00:00:00的状态
        var curWeeHours = new Date(curDate.toLocaleDateString()).getTime() - 1;
        var passedTamp = curTamp - curWeeHours;
        var leftTamp = 24 * 60 * 60 * 1000 - passedTamp;
        return leftTamp;
    },
    //n：键名,v：键值,exp：过期时间(ms)
    setCookie: function(n, v, exp) {
        var date = new Date()
        date.setTime(date.getTime() + exp);
        document.cookie = n + "=" + escape(v) +
            ((exp == null) ? "" : ";expires=" + date.toGMTString())
    },
    //n为想要取到的键值的键名
    getCookie: function(n) {
        var reg = /\s/g;
        var result = document.cookie.replace(reg, "");
        var resultArr = result.split(";");
        for (var i = 0; i < resultArr.length; i++) {
            var nameArr = resultArr[i].split("=");
            if (nameArr[0] == n) {
                return nameArr[1];
            }
        }
    }
};

//生成随机id
var guid = function() {
    function S4() {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }
    return (S4() + S4() + S4() + S4() + S4() + S4() + S4() + S4());
};
//如果guid不存在,则生成guid
console.log(cookie.leftTime() / 1000 / 60);
!cookie.getCookie('guid') && cookie.setCookie('guid', guid(), cookie.leftTime());
document.write(document.cookie);
```

## logfile
```log
61.141.xxx.xxx - [2019-05-16T15:18:34+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
61.141.xxx.xxx - [2019-05-16T15:18:35+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
61.141.xxx.xxx - [2019-05-16T15:18:35+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
61.141.xxx.xxx - [2019-05-16T15:18:35+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
61.141.xxx.xxx - [2019-05-16T15:18:35+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
61.141.xxx.xxx - [2019-05-16T15:18:35+08:00]  "GET /ttt.html HTTP/1.1"  - 304 "User_Cookie:032284f362a63e3d375f8176aad4e0d7" 
```


### 日志分析

命令
````shell
//统计IP
awk '{print $1}' xxx/access.log（你的日志文件路径） | sort -r |uniq -c | wc -l
//统计PV
awk '{print $6}' xxx/access.log（你的日志文件路径） | wc -l
//统计UV
awk '{print $10}' xxx/access.log（你的日志文件路径） | sort -r |uniq -c |wc -l
````

