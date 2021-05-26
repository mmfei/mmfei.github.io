# Centos_install_bat_a_better_cat


## install in centos
```shell
#!/bin/sh
URL=https://github.com/sharkdp/bat/releases/download/v0.18.1/bat-v0.18.1-x86_64-unknown-linux-musl.tar.gz
wget -c -O bat.tar.gz $URL;
tar -xvzf bat.tar.gz -C /usr/local;
ln -s /usr/local/bat-v0.18.1-x86_64-unknown-linux-musl/bat /usr/local/bin/bat
```

