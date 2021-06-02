# 如何使用hugo快速创建一个github的page



### 如何使用hugo快速创建一个github page

##### 创建github项目(私有项目 + 公开项目)

1. github.com/mmfei/mmfei.github.io.source; # `源项目`  主要是用来生成网站项目 , 私有
2. github.com/mmfei/mmfei.github.io; # `网站项目` 用来做 github page 的网站目录

```shell
# 安装hugo (mac环境下的安装方式 , 其他环境请看 gohugo.io)
brew install hugo;

# clone 私有项目
git clone github.com/mmfei/mmfei.github.io.source;
cd mmfei.github.io.source;
hugo new site .;
hugo new post/first.md; # 往里面填充点内容

# 修改文件 config.tom
cat config.tom <<EOT
theme = "beautifulhugo"
EOT
# 修改文件 config.toml
cat config.toml <<EOT
baseURL = "https://mmfei.github.io/"
languageCode = "en-us"
title = "木木飞"
theme = "beautifulhugo"
EOT

git add *;
git commit -m "commit_message";
git push origin master;
```

#### 创建本人在github的token(作为 GH_TOKEN 的值)
[https://github.com/settings/tokens](https://github.com/settings/tokens)

#### 创建TOKEN (MY_GH_TOKEN)  (需要赋予写仓库的权限,这个token是要给mmfei.github.io.source项目生成mmfei.github.io文件用的)
[https://github.com/mmfei/mmfei.github.io/settings/secrets/actions](https://github.com/mmfei/mmfei.github.io/settings/secrets/actions)

#### 设置page
[https://github.com/mmfei/mmfei.github.io/settings/pages](https://github.com/mmfei/mmfei.github.io/settings/pages)


#### 生成部署相关的公私钥 , 用来从 mmfei.github.io.source 发布 内容到 mmfei.github.io
```bash
ssh-keygen -t rsa -b 4069 -C "abc@abc.com";  # 这里要替换成为你的邮箱地址 , 假设指定生成的文件为 ~/.ssh/id_rs_hugo_deploy.pub , ~/.ssh/id_rs_hugo_deploy
## 下面的 ACTIONS_DEPLOY_KEY 的值
/bin/cat ~/.ssh/id_rs_hugo_deploy.pub;
## 下面的 deploy key 的数值
/bin/cat ~/.ssh/id_rs_hugo_deploy;
```

#### 设置 mmfei.github.io 项目
[https://github.com/mmfei/mmfei.github.io/settings/keys](https://github.com/mmfei/mmfei.github.io/settings/keys)
* 创建一个deploy key (值是上面的 ~/.ssh/id_rs_hugo_deploy 的内容), 需要写入权限 , 目的是给source项目推内容上来用 


### 打开源目录的url,设置
### 设置 mmfei.github.io.source
[https://github.com/mmfei/mmfei.github.io.source/settings/secrets/actions](https://github.com/mmfei/mmfei.github.io.source/settings/secrets/actions)
创建两个secret
`ACTIONS_DEPLOY_KEY` 的值为上面生成的pub
`GH_TOKEN` 的值为上面的MY_GH_TOKEN的值

### 设置构建脚本
```bash
cat >> ./.github/workflows/main.yml <<EOT
name: Deploy Hugo Site to Github Pages on Master Branch

on:
  push:
    branches:
      - master

jobs:
  build-deploy:
    runs-on: ubuntu-18.04
    steps:
      - uses: actions/checkout@v1 # v2 does not have submodules option now
      # with:
      #   submodules: true

      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v2
        with:
          hugo-version: "0.83.1"
          extended: true

      - name: Build
        run: |
          git clone https://github.com/mmfei/LoveIt themes/LoveIt
          echo 'gen';
          hugo --theme=LoveIt;
          echo 'build done';
          echo 'www.mmfei.com' > public/CNAME

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          deploy_key: ${{ secrets.ACTIONS_DEPLOY_KEY }} # 这里的 ACTIONS_DEPLOY_KEY 则是上面设置 Private Key的变量名
          github_token: ${{ secrets.MMFEI_GH_TOKEN }}
          external_repository: mmfei/mmfei.github.io
          publish_dir: "./public"
          keep_files: false # remove existing files
          publish_branch: master # deploying branch
          commit_message: ${{ github.event.head_commit.message }}
          user_name: "mmfei"
          user_email: "wlfkongl@163.com"

      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '12.x'
      - name: Install automic-algolia
        run: |
          npm install -g atomic-algolia
          atomic-algolia
        env:
          ALGOLIA_APP_ID: ${{ secrets.ALGOLIA_APP_ID }}
          ALGOLIA_ADMIN_KEY: ${{ secrets.ALGOLIA_ADMIN_KEY }}
          ALGOLIA_INDEX_NAME: ${{ secrets.ALGOLIA_INDEX_NAME }}
          ALGOLIA_INDEX_FILE: "./public/index.json"

EOT

git add ./.github/workflows/main.yml;
git commit -m 'add deploy file';
git push origin master;
```



