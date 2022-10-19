# 部署openresty和kafka的数据采集系统


## 基于Openresty+Lua+Kafka对日志进行实时的采集
![img.png](img.png)

### openresty
```shell
#!/bin/bash
## openresty
apt-get -y install --no-install-recommends wget gnupg ca-certificates
wget -O - https://openresty.org/package/pubkey.gpg | sudo apt-key add -
echo "deb http://openresty.org/package/ubuntu $(lsb_release -sc) main" > openresty.list
cp openresty.list /etc/apt/sources.list.d/
echo "deb http://openresty.org/package/arm64/ubuntu $(lsb_release -sc) main"
apt-get update
apt-get -y install --no-install-recommends openresty
```

### kafka
```shell
apt install default-jdk
java --version
wget https://dlcdn.apache.org/kafka/3.2.3/kafka_2.13-3.2.3.tgz
tar xzf kafka_2.13-3.2.3.tgz
mv kafka_2.13-3.2.3 /usr/local/kafka

cat << EOF > /etc/systemd/system/zookeeper.service
[Unit]
Description=Apache Zookeeper server
Documentation=http://zookeeper.apache.org
Requires=network.target remote-fs.target
After=network.target remote-fs.target

[Service]
Type=simple
ExecStart=/usr/local/kafka/bin/zookeeper-server-start.sh /usr/local/kafka/config/zookeeper.properties
ExecStop=/usr/local/kafka/bin/zookeeper-server-stop.sh
Restart=on-abnormal

[Install]
WantedBy=multi-user.target
EOF

cat << EOF > /etc/systemd/system/kafka.service
[Unit]
Description=Apache Kafka Server
Documentation=http://kafka.apache.org/documentation.html
Requires=zookeeper.service

[Service]
Type=simple
Environment="JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64"
ExecStart=/usr/local/kafka/bin/kafka-server-start.sh /usr/local/kafka/config/server.properties
ExecStop=/usr/local/kafka/bin/kafka-server-stop.sh

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl start zookeeper
systemctl start kafka
```


### create topic 

```shell
cd /usr/local/kafka 
bin/kafka-topics.sh --create --bootstrap-server localhost:19092 --replication-factor 1 --partitions 1 --topic testTopic 
bin/kafka-topics.sh --list --bootstrap-server localhost:19092 
bin/kafka-console-producer.sh --broker-list localhost:19092 --topic testTopic
bin/kafka-console-consumer.sh --bootstrap-server localhost:19092 --topic testTopic --from-beginning 
```
