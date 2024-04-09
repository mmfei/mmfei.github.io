# swoole内存泄漏例子

## 类的静态变量追加数据
```php
//不停的调用func1() 内存就会一直涨
function func1(){
  ClassA::$array[] = "the string!!!...........";
}
```


## 全局变量追加数据
```php
//不停的调用foo1() 内存就会一直涨
function foo1(){
  $GLOBAL['arr'][] = "the string!!!...........";
}
```

## 向函数静态变量不停追加数据
```php
//不停的调用foo2() 内存就会一直涨
function foo2(){
  static $array = [];
  $array[] = "the string!!!...........";
}
```

## 这样也会泄露 , 主要是循环调用foo , foo里面每次都在全局变量追加一个字符串
```php
function foo()
{
    $obj = new ClassA(); //foo函数结束后将自动释放 $obj对象
    $obj->pro[] = str_repeat("big string", 1024);
}

while (1) {
    foo();
    sleep(1);
}

class classA
{
    public $pro;
    public function __construct()
    {
        $this->pro = &$GLOBALS['arr']; //pro是其他变量的引用
    }
}

```

## 常驻服务 中 的变量也会一直累积
```php
class Test
{
    public $pro = null;
    function run()
    {
        $var = "Im global var now";//此处 $var 是长生命周期。
        $http = new \Swoole\Http\Server("0.0.0.0", 9501, SWOOLE_BASE);
        $http->on("request", function($req, $resp) {
            //此处没有给类的静态属性赋值，没有给全局变量赋值，
            //也没有给函数的静态变量赋值，但是这里是泄漏的，因为 $this 变成长生命周期了。
            $this->pro[] = str_repeat("big string", 1024);
            $resp->end("hello world");
        });
        $http->start();
        echo "run done\n"; //输出不了
        //这个函数永远不会结束，局部变量也变成了"全局变量"
    }

}
(new Test())->run();
```


摘自 [https://wenda.swoole.com/detail/107688](https://wenda.swoole.com/detail/107688)
