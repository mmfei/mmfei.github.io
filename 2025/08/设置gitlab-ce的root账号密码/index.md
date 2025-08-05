# 设置gitlab-ce的root账号密码


```shell
docker exec -it <gitlab_container_name_or_id> /bin/bash
gitlab-rails console -e production
user = User.where(id: 1).first  # root 用户的 ID 通常是 1
user.password = '新密码'        # 替换为你要设置的新密码
user.password_confirmation = '新密码'  # 再次输入相同的密码
user.save!  # 保存修改，感叹号表示如果有错误会抛出异常
exit  # 退出控制台
```
