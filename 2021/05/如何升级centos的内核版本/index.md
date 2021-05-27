# 如何升级centos的内核版本


## 如何升级centos的内核版本

```bash
rpm -import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org
rpm -Uvh http://www.elrepo.org/elrepo-release-7.0-2.el7.elrepo.noarch.rpm


# list all kernel
yum --disablerepo="*" --enablerepo="elrepo-kernel" list


# use newest kernel
 yum --enablerepo=elrepo-kernel -y install kernel-ml kernel-ml-devel
# or use a normal kernel
 yum --enablerepo=elrepo-kernel -y install kernel-lt kernel-lt-devel



# list all kernel can use
awk -F\' '$1=="menuentry " {print i++ " : " $2}' /etc/grub2.cfg

# set boot kernel
grub2-set-default 0
# let grub run
grub2-mkconfig -o /boot/grub2/grub.cfg
# reboot
reboot;


# clean older kernel

# list
rpm -qa | grep kernel

# remove older kernal rmp
# yum remove kernel-tools-3.10.0-957.el7.x86_64 kernel-headers-3.10.0-1062.12.1.el7.x86_64 kernel-3.10.0-957.el7.x86_64 kernel-debug-devel-3.10.0-1062.12.1.el7.x86_64 kernel-tools-libs-3.10.0-957.el7.x86_64
```

