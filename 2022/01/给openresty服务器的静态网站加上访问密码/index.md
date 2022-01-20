# 给openresty服务器的静态网站加上访问密码

# 背景 , 一个没权限保护的静态资源所有人可以访问 , 期望加一些密码
```
原来访问地址: static.mmfei.com
改正后的地址: static.mmfei.com/?doc_access_token=123456
```

# 没啥好说的 , 上配置
```shell
# 密码是: 123456 , 自己改
# 参数名: doc_access_token
server {
    listen       80;
    server_name  static.mmfei.com;
    error_page   500 502 503 504 /50x.html;
    root         /static.mmfei.com/dist;
    index        index.html index.htm;
    access_log   /static.mmfei.com/access_$logdate.log;
    error_log    /static.mmfei.com/error.log;
    location ~ .*\.(js|css|yaml|json)$ {
      root /static.mmfei.com/dist;
    }
    location / {
        charset  off;
	    alias /static.mmfei.com/dist/;
        access_by_lua '
            local token  = ngx.var.arg_doc_access_token
            local access_token = "123456"
            if token == access_token then
                return true
            else
               ngx.exit(403)
            end
        ';
        try_files $uri $uri/ /index.html;
    }
}
```
