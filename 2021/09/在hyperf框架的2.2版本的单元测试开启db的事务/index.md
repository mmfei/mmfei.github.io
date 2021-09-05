# 在hyperf框架的2.2版本的单元测试开启db的事务

![/images/posts/在hyperf框架的2.2版本的单元测试开启db的事务/img.png](/images/posts/在hyperf框架的2.2版本的单元测试开启db的事务/img.png)

背景 : 
    我们团队一直在使用优秀的hyperf框架 , 并在内部推行了单元测试 , 一直使用db的事务回滚的方式在测试环境跑得很顺畅 , 这样不会有脏数据. 
    最近它更新了2.2版本. 上周升级了下 , 发现hyperf/testing在新版2.2版本下,正常的测试用例跑不下去了 , 
    定位了一个下午发现问题所在 , 是由于没复用第一次首次初始化的db连接导致的, 考虑到项目比较急 , 没把握一时半会处理完,就先退回2.1版本去了.2版本

今天下午抽了个空把问题修完 , 记录下.

## 如何在hyperf的testcase中开启mysql的事务处理
最终处理方式
> 1. testcase基类, setUp 和 tearDown 分别做 事务开启和事务关闭的逻辑
> 2. 在testClient的协程上下文切换的时候 , 塞入已经开启好事务的db连接到到容器中
```php
<?php
# file test/HttpTestCase.php
declare(strict_types=1);
namespace HyperfTest;

use Hyperf\Contract\ConfigInterface;
use Hyperf\DbConnection\Db;
use Hyperf\Utils\ApplicationContext;
use PHPUnit\Framework\TestCase;

/**
 * Class HttpTestCase.
 * @method get($uri, $data = [], $headers = [])
 * @method post($uri, $data = [], $headers = [])
 * @method json($uri, $data = [], $headers = [])
 * @method file($uri, $data = [], $headers = [])
 * @method request($method, $path, $options = [])
 */
abstract class HttpTestCase extends TestCase
{
    /**
     * @var TestClient
     */
    protected $client;

    private $connections = [];

    public function __construct($name = null, array $data = [], $dataName = '')
    {
        parent::__construct($name, $data, $dataName);
    }

    public function __call($name, $arguments)
    {
        return $this->client->{$name}(...$arguments);
    }

    public function setUp(): void
    {
        $container         = ApplicationContext::getContainer();
        $config            = $container->get(ConfigInterface::class);
        $databases_configs = $config->get('databases');
        foreach (array_keys($databases_configs) as $pool_name) {
            $connection = Db::connection($pool_name);
            // "打开DB的事务[{$pool_name}]"
            $connection->isTransaction() || $connection->beginTransaction();
            $this->connections[$pool_name] = $connection;
        }
        $this->client  = make(TestClient::class);
        $this->client->setDbConnection($this->connections); //给TestClient设置好所有的db
    }

    public function tearDown(): void
    {
        //所有db事务rollback
        foreach ($this->connections as $pool_name => $connection) {
            // "回滚DB的事务[{$pool_name}]";
            $connection->rollBack();
        }
    }
}
```

```php
<?php
# file test/TestClient.php
namespace HyperfTest;

use Hyperf\Contract\ConfigInterface;
use Hyperf\Testing\Client;
use Hyperf\Utils\ApplicationContext;
use Hyperf\Utils\Context;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

class TestClient extends Client
{
    protected $query = [];

    protected $headers = [];

    protected $user;

    private $connections = [];

    public function setDbConnection($connections) {
        $this->connections = $connections;
    }

    protected function persistToContext(ServerRequestInterface $request, ResponseInterface $response)
    {
        // 初始化test client的时候, 会带入的上下文
        parent::persistToContext($request, $response);
        foreach ($this->connections as $pool_name => $connection) {
            $id = $this->getContextKey($pool_name);
            Context::set($id, $connection); // 把打开了事务的connection , 塞入到协程的上下文中
        }
    }
    /**
     * The key to identify the connection object in coroutine context.
     * @param mixed $name
     */
    private function getContextKey($name): string
    {
        return sprintf('database.connection.%s', $name);
    }
}
```




