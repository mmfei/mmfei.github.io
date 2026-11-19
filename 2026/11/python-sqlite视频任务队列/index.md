# Python + SQLite 实现视频任务队列：幂等、重试与租约恢复


用户重复点“生成视频”，接口超时后前端又重试，worker 提交模型任务后还没写回状态就退出：三种现象可能都导致重复提交与重复计费。仅给队列消息加一个唯一 ID，并不能自动解决外部接口的重复副作用。

本文用 Python 标准库和 SQLite 写一个单机最小实现。业务场景是提交视频生成任务，技术重点是持久化状态、幂等键、领取租约和有边界的重试。外部提供方使用单独数据库的模拟实现，**不调用模型、不生成视频、不发生API费用**。

## 环境与适用范围

本次使用 Linux、Python 3.13.5 与内置 sqlite3 运行示例。代码是教学用单机队列，不是 Redis、Celery 或分布式调度系统；SQLite 同时只有一个写事务，不应把本例的逻辑验证当成高并发吞吐证明。数据库应放本机受控目录，不把它当共享网络盘队列。

资料依据为 Python 3.13 的 sqlite3 文档与 SQLite 事务文档。Python 文档推荐明确选择事务控制方式；本例有意使用 `isolation_level=None` 配合显式 `BEGIN IMMEDIATE`，不混用隐式事务。数据库忙等超时是5秒，并未实现数据库故障自动恢复。

## 1. 先定义状态与两层幂等

```text
提交请求 → 幂等键检查 → pending
                        ↓ worker领取
                      running（token + lease_until）
                        ├─ 提交成功并确认 → done
                        ├─ 可重试失败 → pending（available延后）
                        └─ 永久错误/次数耗尽 → failed
```

这里的 `done` **只表示“提交到模拟提供方并保存其任务ID成功”**，不表示视频已经生成。真实视频后端通常还要有独立的 `rendering / succeeded / failed` 状态，接收回调或轮询提供方，并核验输出文件。

幂等分两层：

- 本地提交：同一个键和相同规范化 payload 返回同一条记录；同键不同 payload 报冲突，不能悄悄复用旧任务。
- 外部提交：重试时向提供方传同一个键，依赖提供方持久化去重。本例 FakeProvider 用独立数据库模拟这个契约，不是把本地事务跨网络扩展成原子提交。

示例键形如 `tenant-a:job-1`。真实服务必须从已认证用户确定租户并校验权限，不能信任请求中随意传入的 tenant，也不能允许别人仅凭幂等键查询任务。还要验证字段、限制提示词长度和分辨率/时长范围；示例仅展示队列机制。

## 2. 为什么需要租约和领取token

只写 `running=true`，worker 崩溃后可能永远无人处理。用到期租约允许其他worker回收任务，但又产生一个风险：旧worker恢复后把新worker的结果覆盖掉。

因此每次领取生成新token，完成或失败写回都带上“状态仍running、token一致、租约未到期”的条件。数据库只认可当前领取者的确认。注意，这仅隔离本地状态写回，**不能阻止过期worker已经发出的外部网络请求**；外部副作用仍依赖提供方幂等或额外的协调机制。

`BEGIN IMMEDIATE` 把选择候选任务和更新领取状态放在同一写事务内，避免两个领取者都先读到同一条pending再分别更新。实际网络调用必须放到领取事务之外，不能长时间占有SQLite写锁。

## 3. 完整实现

在新的练习目录保存 `durable_queue.py`。需要可写的本地目录，不需要生产数据库连接。所有SQL变量用参数绑定，不拼接提示词。

```python
import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager


def canonical(payload):
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=5)
    db.row_factory = sqlite3.Row
    return db


@contextmanager
def transaction(db):
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.execute("COMMIT")
    except BaseException:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise


class Queue:
    def __init__(self, path, max_attempts=3):
        if not isinstance(max_attempts, int) or max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        self.db = connect(path)
        self.max_attempts = max_attempts
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs(
            id TEXT PRIMARY KEY, payload TEXT NOT NULL,
            state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
            available REAL NOT NULL, lease_until REAL,
            token TEXT, result TEXT, error TEXT)""")

    def submit(self, key, payload, now):
        if not key or len(key) > 200:
            raise ValueError("invalid idempotency key")
        data = canonical(payload)
        with transaction(self.db):
            old = self.db.execute("SELECT payload FROM jobs WHERE id=?", (key,)).fetchone()
            if old is not None:
                if old["payload"] != data:
                    raise ValueError("same key with different payload")
                return key
            self.db.execute("INSERT INTO jobs(id,payload,state,available) VALUES(?,?,'pending',?)",
                            (key, data, now))
        return key

    def claim(self, now, lease_seconds=30):
        if lease_seconds <= 0:
            raise ValueError("lease must be positive")
        with transaction(self.db):
            # Exhausted and abandoned work must not stay running forever.
            self.db.execute("""UPDATE jobs SET state='failed',token=NULL,error='lease exhausted'
                WHERE state='running' AND lease_until<=? AND attempts>=?""",
                (now, self.max_attempts))
            row = self.db.execute("""SELECT * FROM jobs WHERE attempts<? AND
                ((state='pending' AND available<=?) OR
                 (state='running' AND lease_until<=?))
                ORDER BY available,id LIMIT 1""", (self.max_attempts, now, now)).fetchone()
            if row is None:
                return None
            token = uuid.uuid4().hex
            self.db.execute("""UPDATE jobs SET state='running',attempts=attempts+1,
                lease_until=?,token=? WHERE id=?""", (now + lease_seconds, token, row["id"]))
            return dict(self.db.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone())

    def finish(self, job, now, result):
        r = self.db.execute("""UPDATE jobs SET state='done',result=?,token=NULL,error=NULL
            WHERE id=? AND state='running' AND token=? AND lease_until>?""",
            (canonical(result), job["id"], job["token"], now))
        return r.rowcount == 1

    def fail(self, job, now, retryable=True):
        # An application must classify errors; never retry all exceptions blindly.
        retry = retryable and job["attempts"] < self.max_attempts
        delay = min(60, 2 ** job["attempts"])
        r = self.db.execute("""UPDATE jobs SET state=?,available=?,token=NULL,error=?
            WHERE id=? AND state='running' AND token=? AND lease_until>?""",
            ("pending" if retry else "failed", now + delay,
             "retryable" if retryable else "permanent", job["id"], job["token"], now))
        return r.rowcount == 1

    def get(self, key):
        row = self.db.execute("SELECT * FROM jobs WHERE id=?", (key,)).fetchone()
        return dict(row) if row else None

    def close(self):
        self.db.close()


class FakeProvider:
    """Separate storage models an external provider accepting an idempotency key.
    This is not a real network call or a video model.
    """
    def __init__(self, path):
        self.db = connect(path)
        self.db.execute("""CREATE TABLE IF NOT EXISTS effects(
            key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, result TEXT NOT NULL)""")

    def create(self, key, payload):
        digest = hashlib.sha256(canonical(payload).encode()).hexdigest()
        with transaction(self.db):
            row = self.db.execute("SELECT * FROM effects WHERE key=?", (key,)).fetchone()
            if row:
                if row["payload_hash"] != digest:
                    raise ValueError("provider key conflict")
                return json.loads(row["result"])
            result = {"provider_task_id": uuid.uuid4().hex, "status": "accepted"}
            self.db.execute("INSERT INTO effects VALUES(?,?,?)", (key, digest, canonical(result)))
            return result

    def count(self):
        return self.db.execute("SELECT count(*) FROM effects").fetchone()[0]

    def close(self):
        self.db.close()
```

## 4. 用故障模拟验证，不靠正常路径自证

保存下面的 `test_queue.py`，与上一文件放在同一目录。它会新建唯一临时目录，保留本地队列与模拟提供方的数据库，不删除已有目录。测试时间由参数推进，不实际等待退避时间。

```python
import json
import tempfile
from pathlib import Path
from durable_queue import Queue, FakeProvider

root = Path(tempfile.mkdtemp(prefix="video-queue-test-"))
q = Queue(root / "queue.sqlite")
other = Queue(root / "queue.sqlite")
p = FakeProvider(root / "provider.sqlite")
checks = []

def check(name, ok):
    assert ok, name
    checks.append(name)

payload = {"prompt": "synthetic example", "seconds": 4}
q.submit("tenant-a:job-1", payload, 0)
q.submit("tenant-a:job-1", payload, 0)
check("duplicate submit creates one row", q.db.execute("SELECT count(*) FROM jobs").fetchone()[0] == 1)
try:
    q.submit("tenant-a:job-1", {"seconds": 5}, 0)
    raise AssertionError("must reject key conflict")
except ValueError:
    checks.append("same key different payload rejected")
a = q.claim(0, 10)
check("second connection cannot claim live lease", other.claim(1, 10) is None)
result1 = p.create(a["id"], payload)
# Simulate crash AFTER provider accepted, BEFORE local acknowledgement.
q.close()
q = Queue(root / "queue.sqlite")
b = q.claim(11, 10)
check("restart recovers expired lease", b["attempts"] == 2 and b["token"] != a["token"])
result2 = p.create(b["id"], payload)
check("provider idempotency avoids second effect", p.count() == 1 and result1 == result2)
check("stale worker ack rejected", not q.finish(a, 12, result1))
check("new worker ack accepted", q.finish(b, 12, result2))
check("done job not reclaimed", q.claim(99, 10) is None)
q.submit("tenant-a:retry", payload, 100)
j = q.claim(100)
check("transient failure scheduled", q.fail(j, 101))
check("backoff not due", q.claim(102) is None)
j = q.claim(103)
check("backoff due", j["attempts"] == 2)
check("retry second failure", q.fail(j, 104))
j = q.claim(108)
check("third attempt exists", j["attempts"] == 3)
q.fail(j, 109)
check("retry bounded by attempts", q.get(j["id"])["state"] == "failed")
q.submit("tenant-a:bad-request", payload, 200)
j = q.claim(200)
q.fail(j, 201, retryable=False)
check("permanent error not retried", q.get(j["id"])["state"] == "failed")
q.submit("tenant-a:crash-limit", payload, 300)
for t in (300, 311, 322):
    check("expired lease claim " + str(t), q.claim(t, 10) is not None)
check("exhausted crash does not stay running", q.claim(333, 10) is None and q.get("tenant-a:crash-limit")["state"] == "failed")
q.close(); other.close(); p.close()
print(json.dumps({"sandbox": str(root), "checks": checks, "count": len(checks),
                  "limits": "local sequential multi-connection fault simulation; no real API, no process kill, no load test"}, ensure_ascii=False, indent=2))
```

运行：

```bash
python3 test_queue.py
```

本次实际运行完成19个断言，重点覆盖：重复提交只有一条记录；同键异参拒绝；第二连接不能领取有效租约；关闭并重开本地连接后回收过期租约；提供方已接受但本地未确认时重投只保留一次模拟副作用；旧token确认被拒绝；退避时机、永久错误和重试次数上限正确；连续放弃租约到达次数上限后转failed，不永久挂running。

测试是**顺序驱动的双连接与状态故障模拟**，不是同时多进程抢占压测，也没有真的kill进程、断电或调用远端模型。关闭连接并重开覆盖持久化读取，但不能替代系统级崩溃恢复测试。这些限制不能在转述时删去。

## 5. 接真实模型接口时该改什么

worker的生产逻辑应以“领取 → 在事务外提交 → 条件确认”为边界：

```python
# 示意流程，不是已对接任何提供方的SDK。
job = queue.claim(now=time.time(), lease_seconds=30)
if job is not None:
    # provider应设置网络超时，并明确支持幂等键契约。
    # 成功后用当前时间调用finish；失败先按错误类别处理。
    pass
```

这段只是接入位置说明，不能直接运行成一个生产worker。真实适配层还需要：

1. 明确提供方幂等键保存多久、作用域是什么、超时后能否按键查询。没有这个能力时，本例不能保证避免重复计费。
2. 区分认证失败、参数错误、额度不足、限速、临时网络错误与“结果未知”。不能把所有4xx或所有异常都无限重试。
3. 服务端确认远程任务已创建但客户端超时时，先按提供方能力查询，不随意换新键重新创建。
4. 处理 Retry-After、退避上限与随机抖动。本例固定指数退避便于测试，**没有抖动，也没有解析HTTP响应**。
5. 明确网络超时小于租约，或实现条件续租。视频任务通常长于一次提交请求，不能简单把租约设为整个视频时长就不再管理。
6. 回调验签、回调幂等、轮询间隔、对象存储地址有效期和权限要单独实现。

## 6. 从SQLite迁移到Redis或服务型队列

选择SQLite是为了用标准库复现状态机，不意味着Redis多余。需要多机、复杂调度、监控和较高并发时，应评估成熟队列与数据库方案。

迁移时仍保留业务任务表、幂等键唯一约束和提供方任务ID；队列消息只负责唤醒，不要成为唯一业务真相。若“业务入库”与“消息投递”跨系统，需另外设计事务消息或outbox，不能把本地事务写法直接复制成跨系统原子性保证。

## 运维、安全与回滚

- 关注pending积压、最老等待时间、running租约过期、重试率、failed及提供方账单；测试没有给出任何吞吐或成本数字。
- 不把模型密钥写进数据库payload、日志或公开测试文件；提示词和素材地址也可能含私人信息，应按业务需要最小化保存。
- 程序退出前关闭连接；数据库错误向上报告，不能悄悄标done。磁盘满、IO错误、时钟回拨及任务取消不在本例覆盖范围。
- 示例没有删除和保留策略。生产中应先确定幂等记录保留期，过早清理会让旧键再次触发副作用。
- 回滚worker版本前先停止新领取并评估在途任务。不要删除队列数据库“重新跑”，也不要把failed批量改pending而不评估重复费用。

## 官方参考

- [Python 3.13 sqlite3事务控制](https://docs.python.org/3.13/library/sqlite3.html#transaction-control)
- [SQLite事务、单写者与BEGIN IMMEDIATE](https://www.sqlite.org/lang_transaction.html)

