# 保留最新n个文件的bash脚本

> 保留最新n个文件的bash脚本

```bash
#!/bin/sh
usage()
{
  echo "Usage: $0 dir"
  echo "Usage: $0 dir save_number"
  echo "Usage: $0 dir save_number keyword"
  exit 1
}
if [ $# -lt 1 ] ; then
    usage
fi
dir="$1"
save_number="$2"
keyword="$3"
if [[ -z "$save_number" ]]; then
  save_number=5
fi
if [[ "$keyword" == '' ]]; then
  keyword=''
fi
cd $dir
if [[ "$keyword" == '' ]]; then
  echo "save_file=`ls -lrt | tail -$save_number | awk '{print $NF}'`"
  save_file=`ls -lrt | tail -$save_number | awk '{print $NF}'`
  echo $save_file
  ls | grep -v "$save_file" | xargs rm -rf
else
  save_file=`ls -lrt | grep "$keyword" | tail -$save_number | awk '{print $NF}'`
  echo $save_file
  ls | grep "$keyword" | grep -v "$save_file" | xargs rm -rf
fi
echo "finish!"
```

