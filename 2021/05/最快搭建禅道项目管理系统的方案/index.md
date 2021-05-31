# 最快搭建禅道项目管理系统的方案

### 说明
> 系统要求,安装好 docker和docker-compose
> docker-compose up -d 就能拉起
> 禅道系统访问地址 http://127.0.0.1:2048
> 如果需要域名访问 ,请部署个nginx , 转发到 2048端口即可
```shell
# 进入docker-compose.yml文件所在的目录 , 执行以下命令就能拉起一个完整的禅道系统服务
docker network create local_network
docker-compose up -d
```
### file docker-compose.yml
```yml
version: '3'

services:
        #  adminer:
        #    image: adminer
        #    restart: always
        #    networks:
        #      - local_network
        #    ports:
        #      - 8080:8080
        #    healthcheck:
        #      test: ["CMD", "curl", "-f", "http://localhost:8080"]
        #      interval: 1m30s
        #      timeout: 10s
        #      retries: 3
        #      start_period: 30s
  db:
    build:
      context: .
      dockerfile: Dockerfile_db
    restart: always
    networks:
      - local_network
    environment:
       MYSQL_ROOT_PASSWORD: 123456_zentao
       MYSQL_USER: zentao
       MYSQL_PASSWORD: 123456
       MYSQL_DATABASE: zentao
    volumes:
      - mariadb_data:/var/lib/mysql
    healthcheck:
      test: "/usr/bin/mysql --user=zentao --password=123456 --execute \"SHOW DATABASES;\""
      interval: 2m
      timeout: 10s
      retries: 3
    ports:
      - 3309:3306
  initzt:
    image: alpine:latest
    volumes:
      - zentao_data:/home
    networks:
      - local_network
    command:
      - /bin/sh
      - -c
      - |
        cd /home
        wget https://www.zentao.net/dl/zentao/15.0/ZenTaoPMS.15.0.stable.zip
        ls -l
        unzip -q -o ZenTaoPMS.15.0.stable.zip
        rm ZenTaoPMS.15.0.stable.zip
  web:
    build: .
    networks:
      - local_network
    restart: always
    ports:
      - 2048:80
      - 11444:11444
      - 11443:11443
    volumes:
      - zentao_data:/var/www
    depends_on:
      - db
      - initzt

volumes:
  mariadb_data:
  zentao_data:

networks:
  local_network:
    external: true
```



