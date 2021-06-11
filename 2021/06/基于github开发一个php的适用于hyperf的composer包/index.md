# 基于github开发一个php的适用于hyperf的composer包

## 准备下环境
```bash
# 在github创建一个仓库 , 并clone到本地
# 计划 在 your_component 文件夹开发 your_component/your_component 包
composer create-project hyperf/hyperf-skeleton  # 主项目 , 它会使用下面那个自建的组件
composer create-project hyperf/component-creater your_component dev-master # 自建的组件项目
cd hyperf-skeleton
composer config repositories '[{"name": "your_component/your_component","type": "path","url": "../your_component/src/*"}]' # 设置主项目依赖的自建组件为本地目录 , hyperf 官方教程旧了,新的composer要用这个结构
composer config require."your_component/your_component" dev-master # 指定项目依赖包 your_component.your_component , 等同于 composer require your_component.your_component 只是还没发布,所以手动编辑
cd hyperf-skeleton;rm -rf composer.lock && rm -rf vendor && composer update # 初始化主项目 , 把依赖都装上
ls -al vendor/your_component # 此时看到的应该是软连接
```

### 仔细看设计规范

[https://hyperf.wiki/2.0/#/zh-cn/component-guide/configprovider](https://hyperf.wiki/2.0/#/zh-cn/component-guide/configprovider)


### 省略开发过程一万字 (主要是要记得提交 your_component 目录的内容到github仓库)

### 发布一个可以使用的hyperf组件(通过composer可以安装)
> 去下面的地址 , 提交自己的包即可
> 包管理就是release一个包就好了
[https://packagist.org/packages/submit](https://packagist.org/packages/submit)

