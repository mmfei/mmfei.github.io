# 在mac用anaconda管理python


## 下载
[https://www.anaconda.com/download](https://www.anaconda.com/download)

# 搭建独立环境
```shell
# 直接建立一个基于python3.9的环境
# 查看本地环境
find `dirname $(dirname $(which python3))` -name "libpython3.*.dylib";

# 设置编译环境
export LOCAL_PYTHON=/opt/homebrew/Cellar/python@3.11/3.11.3
export PYTHON_LIBRARY=$LOCAL_PYTHON/lib/libpython3.9.dylib
export PYTHON_INCLUDE_DIRS=$LOCAL_PYTHON/include
export PATH=$LOCAL_PYTHON/bin:$PATH
export LD_LIBRARY_PATH=$LOCAL_PYTHON/lib
export DYLD_LIBRARY_PATH=$LOCAL_PYTHON/lib

# 从源码编译
git clone https://github.com/PaddlePaddle/Paddle.git
cd Paddle;
pip3 install protobuf
git checkout release/2.4;
mkdir build && cd build;
cmake .. -DPY_VERSION=3.10 -DPYTHON_INCLUDE_DIR=${PYTHON_INCLUDE_DIRS} -DPYTHON_LIBRARY=${PYTHON_LIBRARY} -DWITH_GPU=OFF -DWITH_TESTING=OFF -DCMAKE_BUILD_TYPE=Release -DWITH_AVX=OFF -DWITH_ARM=ON;
make -j10;
cd python/dist;
pip3 install -U paddlepaddle-0.0.0-cp310-cp310-macosx_13_0_arm64.whl;
```


# 彻底清空 anaconda
```shell
conda install anaconda-clean
anaconda-clean --yes
rm -rf ~/anaconda3
# 清理环境变量
vim ~/.zshrc # vim ~/.bashrc
rm -rf ~/.condarc ~/.conda ~/.continuum
```



# 其他链接
[https://zhuanlan.zhihu.com/p/569142358?utm_id=0](https://zhuanlan.zhihu.com/p/569142358?utm_id=0)
