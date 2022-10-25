# Gitlab Ce进入admin_runners报500


## Internal Server Error 500 while accessing /admin/runners
    
    进入 admin/runners , 页面报错: Whoops, something went wrong on our end


### logs:  (大部分都是迁移后 , 需要处理runner,ssl证书等)
```shell
gitlab-rails/production.log:

16: .table-section.section-10
17: .table-mobile-header{ role: ‘rowheader’ }= _(‘Runner token’)
18: .table-mobile-content
19: = link_to runner.short_sha, admin_runner_path(runner)
20:
21: .table-section.section-20
22: .table-mobile-header{ role: ‘rowheader’ }= _(‘Description’)

lib/gitlab/crypto_helper.rb:27:in  `aes256_gcm_decrypt' app/models/concerns/token_authenticatable_strategies/encrypted.rb:45:in ` get_token’
app/models/concerns/token_authenticatable.rb:30:in  `block in add_authentication_token_field' app/models/ci/runner.rb:213:in ` short_sha’
lib/gitlab/metrics/instrumentation.rb:161:in  `block in short_sha' lib/gitlab/metrics/method_call.rb:36:in ` measure’
lib/gitlab/metrics/instrumentation.rb:161:in  `short_sha' app/views/admin/runners/_runner.html.haml:19:in ` _
```


### 修复方式:
### 方法1: 我是用这个方式修复
```shell
gitlab-rails c
settings = ApplicationSetting.last
settings.update_column(:runners_registration_token_encrypted, nil)

```
### 方法2:
```shell
gitlab-rails console
invalid_projects = Project.all.reject(&:valid?); nil
invalid_projects.count
invalid_projects.map(&:name)
invalid_projects.map(&:id)

```

### 方法3:
```shell
gitlab-rails dbconsole --database main
# 重置运行程序注册令牌,清除项目、组和整个实例的所有标记
gitlabhq_production=> UPDATE projects SET runners_token = null, runners_token_encrypted = null;
UPDATE 16
gitlabhq_production=> UPDATE namespaces SET runners_token = null, runners_token_encrypted = null;
UPDATE 33
gitlabhq_production=> UPDATE application_settings SET runners_registration_token_encrypted = null;
UPDATE 1
gitlabhq_production=> UPDATE ci_runners SET token = null, token_encrypted = null;
UPDATE 0
```
