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

# 上传到服务器
deploy-job:dep:
  stage: deploy
  cache:
    paths:
      - node_modules/
  only:
    - alpha
  script:
    - |
        echo "git checkout ${CI_COMMIT_REF_NAME} --";
        git checkout ${CI_COMMIT_REF_NAME} --
        npm i
        npm run build # 这里需要自己看一下script的build的内容
        ossutil64 config -e $OSS_END_POINT -i $OSS_ACCESS_KEY_ID -k $OSS_ACCESS_KEY_SECRET
        ossutil64 cp -r -f dist/ oss://$OSS_BUCKET_NAME
  tags:
    - deploy
```

### 在gitlab对应项目中增加变量(gitlab-ci会用到)
```
OSS_END_POINT   oss的endpoint
OSS_ACCESS_KEY_ID  oss的accessKeyId
OSS_ACCESS_KEY_SECRET oss的AccessKeySecret
OSS_BUCKET_NAME  oss的bucketName
```

### oss的bucket需要设置
> 对象存储 > bucket name > 权限管理 
* Bucket ACL -> 公开读
* Bucket 授权策略 , 给你的账号读写授权 (账号跟这两个变量关联的 OSS_ACCESS_KEY_ID , OSS_ACCESS_KEY_SECRET)
* 跨域设置(加上自己的访问域)
> 对象存储 > bucket name > 权限管理
* 绑定域名 , 可以设置https证书 , 需要对域名做cname绑定

## 在gitlab-runner机器
### 安装runner(docker的方式)
```shell
docker run -d --name gitlab-share-runner --restart always -v /data/gitlab-runner/config:/etc/gitlab-runner -v /var/run/docker.sock:/var/run/docker.sock gitlab/gitlab-runner:latest //启动一个容器
docker exec -it gitlab-share-runner gitlab-runner register //注册到Gtilab
```
### 安装runner的第二种方式(centos直接安装 , 我选用这种)
```shell
yum install -y gitlab-runner

### 安装nodejs (用mvn管理 , 如果需要其他版本的nvm , 可以 nvm install 14.17.0; nvm alias default v14.17.0)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
echo 'export NVM_DIR="$HOME/.nvm"' > /etc/profile.d/nvm.sh
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm' >> /etc/profile.d/nvm.sh
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion' >> /etc/profile.d/nvm.sh
source /etc/profile
nvm install node

wget http://gosspublic.alicdn.com/ossutil/1.7.3/ossutil64 -O /usr/bin/ossutil64
chmod 755 /usr/bin/ossutil64

### gitlab-runner 也需要安装node , 否则gitlab-ci执行会找到npm
su gitlab-runner
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
nvm install node
```


## 配置script,配合gitlab-ci执行打包上传命令
### package.json
```json
{
  "scripts": {
    "deploy": "npx aliyunoss-cli --releaseEnv dev",
    "publish": "npm i && npm run build && npm run deploy",
    "build": "vue-cli-service build --mode production"
  }
}
```


