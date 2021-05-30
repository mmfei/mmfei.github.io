# bash命令增加提示autocomplete


### 执行以下命令 , 会让命令行更加好用, 会根据历史记录补齐和提醒
```bash
cat >> ~/.inputrc <<'EOF'
"\e[A": history-search-backward
"\e[B": history-search-forward
EOF
```

