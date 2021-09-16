# 用mediainfo代替ffmpeg读取视频文件的毫秒级的时长


    背景:
    由于我们有个功能需要把用户库中的视频文件播放时长的毫秒数读取出来并入库.
    经过调研以及对大名鼎鼎的ffmpeg的信仰 , 果断选了ffmpeg去完成这个重任.
    
```shell
> ffmpeg -i /250a40a2293b978736a43c715fcab538.mp4

[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f835800ac00] stream 0, timescale not set
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/250a40a2293b978736a43c715fcab538.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    encoder         : Lavf58.29.100
  Duration: 00:00:07.05, start: 0.000000, bitrate: 1268 kb/s
  Stream #0:0(und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv), 640x360 [SAR 1144:1143 DAR 18304:10287], 740 kb/s, 25 fps, 25 tbr, 12800 tbn, 60 tbc (default)
    Metadata:
      handler_name    : VideoHandler
      vendor_id       : [0][0][0][0]
  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 22050 Hz, mono, fltp, 24 kb/s (default)
    Metadata:
      handler_name    : SoundHandler
      vendor_id       : [0][0][0][0]
  Stream #0:2: Video: png, rgb24(pc), 640x360 [SAR 1144:1143 DAR 18304:10287], 90k tbr, 90k tbn, 90k tbc (attached pic)
At least one output file must be specified
```

上面出来的有个关键的内容 Duration: `00:00:07.05`, start: 0.000000, bitrate: 1268 kb/s

这就是 `00:00:07 秒 + 05 毫秒`.....
然而我错了 , 这个 05 大有玄机... 
```
 .05  == 050 毫秒
 .78 == 78(0-9) 毫秒
```

万万想不到啊....兄弟.... 被坑了 , 果断换方案...

找到另外一个 `mediainfo`.....

记录一下在centos安装 mediainfo 的过程 , 略坑
```shell
wget http://mirror.centos.org/centos/8/PowerTools/x86_64/os/Packages/tinyxml2-6.0.0-3.el8.x86_64.rpm
rpm -i tinyxml2-6.0.0-3.el8.x86_64.rpm
dnf install mediainfo
```

## 使用mediainfo读取视频时长
```shell
> mediainfo /250a40a2293b978736a43c715fcab538.mp4

General
Complete name                            : /250a40a2293b978736a43c715fcab538.mp4
Format                                   : MPEG-4
Format profile                           : Base Media
Codec ID                                 : isom (isom/iso2/avc1/mp41)
File size                                : 1.07 MiB
Duration                                 : 7 s 47 ms
Overall bit rate                         : 1 268 kb/s
Writing application                      : Lavf58.29.100
Cover                                    : Yes

Video
ID                                       : 1
Format                                   : AVC
Format/Info                              : Advanced Video Codec
Format profile                           : Main@L4.2
Format settings                          : CABAC / 1 Ref Frames

> mediainfo --Output='General;%Duration%' /250a40a2293b978736a43c715fcab538.mp4
7047
```

> 第二个命令真香 , 直出毫秒数 , 完美啊...果断换方案了

