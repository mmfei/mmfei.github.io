# 用穿透的方式解决国内阿里云访问github不顺畅的问题


# 国内阿里云访问github.com , 经常不顺畅

1. 解决方式 , 在海外买一台服务器
2. 国内的服务直接穿透过去

# 在国内阿里云服务器配置
### ~/.ssh/config
```
Host github.com
    ProxyCommand  ssh 用户名@海外机器IP nc %h %p
```


## 链路

```mermaid
%%{init: {'theme': 'forest', 'fill': 'white' } }%%
sequenceDiagram
    participant 深圳服务器 
    participant 海外服务器
    participant github
    深圳服务器->>海外服务器: 访问github从海外穿透过去
    海外服务器->>github: 海外去获取github
    github->>海外服务器: github返回
    海外服务器->>深圳服务器: 海外返回深圳服务器
```

