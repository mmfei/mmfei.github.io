# Linux根据历史记录补全bash命令autocomplete


在shell输入一个命令后 , 可以通过上下方向箭头翻出最近的历史记录.
这么好用的功能,为啥不内置呢0.0....

```bash
cat >> ~/.inputrc <<'EOF'
"\e[A": history-search-backward
"\e[B": history-search-forward
EOF
```


