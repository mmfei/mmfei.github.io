# M1芯片编译安装paddle


```shell
find `dirname $(dirname $(which python3))` -name "libpython3.*.dylib";
echo " 
 export LOCAL_PYTHON=/Users/mmfei/anaconda3/envs/paddle_speed_python3_9
export PYTHON_LIBRARY=$LOCAL_PYTHON/lib
export PYTHON_INCLUDE_DIRS=$LOCAL_PYTHON/include
export PATH=$LOCAL_PYTHON/bin:$PATH
export LD_LIBRARY_PATH=$LOCAL_PYTHON/lib
export DYLD_LIBRARY_PATH=$LOCAL_PYTHON/lib
export CPLUS_INCLUDE_PATH=$LOCAL_PYTHON/include/python3.9
" >> ~/.zshrc;

git clone https://github.com/PaddlePaddle/Paddle.git;
cd Paddle;
git checkout release/2.4;
mkdir build && cd build;
cmake .. -DPY_VERSION=3.10 -DPYTHON_INCLUDE_DIR=${PYTHON_INCLUDE_DIRS} -DPYTHON_LIBRARY=${PYTHON_LIBRARY} -DWITH_GPU=OFF -DWITH_TESTING=OFF -DCMAKE_BUILD_TYPE=Release -DWITH_AVX=OFF -DWITH_ARM=ON;
make -j10;
cd python/dist;
pip3 install -U paddlepaddle-0.0.0-cp310-cp310-macosx_13_0_arm64.whl;
```
