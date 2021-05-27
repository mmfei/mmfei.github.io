# 通过gitlab的ci自动部署前端项目到阿里云的oss


## 通过gitlab的ci自动部署前端项目到阿里云的oss

### gitlab-ci.yml
```yml
# 指定使用的镜像
image: node:latest

# 执行步骤，依次执行
stages:
  - install
  - build
  - deploy

# 安装依赖 job 下面的 stage 字段和 stages 下面的步骤一一对应
install-job:dep:
  stage: install
  cache:
    paths:
      - node_modules/
  only: # 限定执行脚本的条件，only 支持 branch、tag、change、正则
    - master
    - develop
    - master
  script: # 此 stage 要执行的脚本
    -  npm i
  artifacts:  # 将这个job生成的依赖传递给下一个job。需要设置dependencies
    expire_in: 60 mins   # artifacets 的过期时间，因为这些数据都是直接保存在 Gitlab 机器上的，过于久远的资源就可以删除掉了
    paths:  # 需要被传递给下一个job的目录。
      - node_modules/
# 打包
build-job:dep:
  stage: build
  only:
    - master
    - develop
    - master
  script:
    -  npm run build
  artifacts:  # 将这个job生成的依赖传递给下一个job。需要设置dependencies
    expire_in: 60 mins   # artifacets 的过期时间，因为这些数据都是直接保存在 Gitlab 机器上的，过于久远的资源就可以删除掉了
    paths:  # 需要被传递给下一个job的目录。
      - node_modules/

# 上传到服务器
deploy-job:dep:
  stage: deploy
  only:
    - master
    - develop
    - master
  script:
    -  |
    npm run deploy
```


## 在gitlab-runner机器
### 安装runner(docker的方式)
```shell
docker run -d --name gitlab-share-runner --restart always -v /data/gitlab-runner/config:/etc/gitlab-runner -v /var/run/docker.sock:/var/run/docker.sock gitlab/gitlab-runner:latest //启动一个容器
docker exec -it gitlab-share-runner gitlab-runner register //注册到Gtilab
```
### 安装runner的第二种方式(centos直接安装 , 我选用这种)
```shell
yum install gitlab-runner
```

### 安装阿里云的oss命令行工具
```shell
cd /your_workspace/
npm install aliyunoss-cli --save-dev
ossutils config #配置阿里云的oss配置 ,会生成.ossconfig在工程目录下 , 需要阿里云的AccessKey
```
### .ossconfig
```json
{
  "region": "-",
  "accessKeyId": "-",
  "accessKeySecret": "-",
  "bucket": "-"
}
```

## 配置script,配合gitlab-ci执行打包上传命令
### package.json
```json
{
  "scripts": {
    "deploy": "npx aliyunoss-cli --releaseEnv dev",
    "publish": "npm i && npm run build && npm run deploy"
  }
}
```


