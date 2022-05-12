# 一个golang的优秀框架go-zero


    暗中观察了golang的生态 , 变化很快 , 正在迅速成长
    喷涌而出的框架 viper ,cobra , beego, martini, iris , gin , goframe , go-zero
    包管理从 GOPATH , golide, vgo, godep , govender, gomod 演变
    编辑器 vim , sublime text , goland , vscode 持续在支持

几年前用过beego开发了一个配置管理服务 , 当时应该是1.15的时候 , 还不够成熟. 就浅尝辄止了.后来试了gin , martini 只是web的框架.
直到前年开始关注到框架 goframe和go-zero , 暗中观察了很久 , 最后看起来go-zero更适合我

今天花了半小时看了下官方文档 , 貌似还最近更新了一次 , 我就体验一把先

go-zero适合做微服务和web , 它已经相对成熟了 , 该有的都有.点个赞

```shell
cd mm;
go mod init mm;
goctl api new mm;
go run mm/mm.go -f ./mm/etc/mm-api.yaml
```

后续的等我持续体验了再更新吧
