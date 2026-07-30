# TG Video 独立 H5 积分充值

这是当前 Telegram Mini App 项目的独立 H5 充值站骨架，运行环境为：

```text
PHP 8.3
Apache 2.4
MySQL 8.0
```

它不直接操作 Mini App 主库，而是通过主项目已经预留的服务端接口完成充值：

```text
POST /api/external/users/lookup
POST /api/external/credits/recharge
```

这样独立支付站只负责收款、订单、回调和到账通知；Mini App 主项目仍然负责用户、积分余额、风控和消费记录。

## 流程

```text
用户输入 Telegram username
  -> H5 站服务端调用主项目查账号
  -> 用户确认账号和套餐
  -> H5 站创建本地充值订单
  -> 第三方支付成功回调 H5 站
  -> H5 站校验签名和金额
  -> H5 站调用主项目外部充值接口
  -> Mini App 用户积分到账
```

## 部署

1. 创建 MySQL 数据库：

```sql
CREATE DATABASE tg_video_pay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 导入表结构：

```bash
mysql -u你的用户 -p tg_video_pay < database/schema.sql
```

3. 复制配置：

```bash
cp config/config.example.php config/config.php
```

4. `config/config.php` 只填写数据库连接：

```php
'database' => [
    'dsn' => 'mysql:host=127.0.0.1;dbname=tg_video_pay;charset=utf8mb4',
    'user' => '数据库用户',
    'password' => '数据库密码',
],
'session_name' => 'tg_video_pay',
```

5. 登录 `/cpl/`，通过顶部的站点、主项目、易支付和套餐入口完成配置。业务配置保存在数据库 `app_settings` 表中，密钥字段不会在页面回显。

6. Apache 站点根目录指向：

```text
external-payment-php/public
```

不要把站点根目录指向 `external-payment-php`，否则配置文件有暴露风险。

## 支付网关

首版生产环境开放 keke_pay 易支付中间件的支付宝和 USDT：

```text
keke_pay / epay + alipay / usdt
```

`manual` 和 `generic_hmac` 不作为当前生产模式启用；`/callback/generic.php` 默认返回 404，后续要接自定义 USDT 网关时再单独开启。

在后台“易支付”页面修改：

填写 keke_pay 下游网关接口地址、商户 ID 和商户密钥。对接 keke_pay 时，接口地址填写它后台显示的“下游网关完整地址”，通常类似：

```text
https://bbs.example.com/source/plugin/keke_pay/submit.php
```

keke_pay 内部仍把微信通道命名为 `wxpay`。当前上游已把这个微信通道改为 USDT，所以本项目对用户显示 `USDT`，但发给 keke_pay 的支付类型会自动映射为 `wxpay`，回调中收到 `type=wxpay` 也会按 USDT 订单验签和入账。

支付宝和 USDT 是否开放由后台两个开关分别控制；商户 ID 和商户密钥只填一套。通知和返回地址由支付站域名自动生成。

易支付回调成功后，系统会：

```text
校验 MD5 签名
校验订单金额
标记订单 PAID
调用主项目 /api/external/credits/recharge
标记订单 CREDITED
```

回调同时校验签名、商户 PID、订单渠道和订单金额。金额使用分为单位比较，不经过浮点数判断。

## 上线检查

1. 复制 `config/config.example.php` 为 `config/config.php`，只填写数据库连接和 session 名。
2. 导入 `database/schema.sql`；已有数据库则执行 `database/upgrade.sql`。
3. 登录 `/cpl/` 后先进入“管理员”修改默认后台密码。
4. 进入“站点”填写支付站 HTTPS 域名，例如 `https://pay.example.com`。
5. 进入“主项目”填写 Mini App 主项目 API 地址和 `EXTERNAL_RECHARGE_SECRET`。
6. 进入“易支付”填写 keke_pay 下游网关地址、商户 ID、商户密钥，并按需启用支付宝和 USDT。
7. 确认自动生成的 `notify_url` 和 `return_url` 均为 HTTPS 公网地址。
8. Apache DocumentRoot 必须指向 `public/`，并启用 HTTPS。
9. 用真实小额订单依次验证：创建订单、支付宝支付、异步回调、积分到账、重复回调不重复加积分。

不要把本地 `config/config.php` 直接上传到线上。线上应复制 `config/config.example.php` 后填写服务器数据库连接；打包时也不要包含 `.DS_Store`、日志和本地临时文件。

### 宝塔 open_basedir 兼容部署

如果宝塔开启“防跨站攻击(open_basedir)”，并且允许路径只有：

```text
/www/wwwroot/your-pay.example/public/:/tmp/
```

PHP 将无法读取项目根目录下的 `src/` 和 `config/`。不修改宝塔配置时，可以使用 public-only 模式：

```text
public/_private/src/       复制项目的 src/
public/_private/config/    复制 config/config.example.php 后改名为 config.php 并填写线上数据库
public/_private/storage/   可留空，日志目录会自动创建
```

此模式下，公开入口会优先加载 `public/_private/src/bootstrap.php`。`public/.htaccess` 已禁止浏览器访问 `_private/`，但 Apache 必须启用 `.htaccess` / `AllowOverride`。

订单默认 30 分钟过期。已经产生的有效支付宝成功回调即使稍晚到达，仍会正常入账。

## 状态与补单

后台 `/cpl/` 的订单列表提供管理端详情页：

```text
/cpl/order.php?order_no=订单号
```

详情页会展示支付回调原文、主项目到账响应、失败原因和支付流水。订单处于“已支付，等待到账”或“已支付，到账失败”时，可以点击“重新通知主项目”，系统会继续使用订单号作为幂等请求 ID，避免重复加积分。

支付回调验签失败、支付金额不匹配、主项目到账失败会写入：

```text
storage/logs/payment-failures.log
```

后台 `/cpl/logs.php` 会展示最近 120 条异常日志。日志中会自动遮蔽密钥、密码、token 和完整签名。

`public/robots.txt` 默认禁止搜索引擎收录整个独立充值站。

```text
PENDING         待支付
PAID            已支付，等待项目入账
CREDITED        已到账
PAYMENT_FAILED  支付回调未表明成功或金额错误，禁止直接补发
CREDIT_FAILED   已确认支付但项目入账失败，可安全重试
EXPIRED         待支付订单已过期
CANCELED        管理员取消
```

后台订单列表只展示订单状态和入口；会改变订单状态的操作集中在订单详情页。详情页里的“手动标记已支付”只标记订单已收款，“重新通知主项目”才执行积分入账。操作会记录管理员、IP、订单号和内容；已支付或已到账订单禁止删除。

## 安全说明

- `external_recharge_secret` 只能放在 PHP 服务端配置里，不能暴露到浏览器。
- 支付回调必须校验签名、金额、订单状态和幂等。
- 充值前必须先查账号，避免用户输错 username 后把积分充到错误账号。
- username 匹配使用小写归一化，用户输入 `@Name`、`name`、`NAME` 都会归一处理。
- 后台登录按“IP + 用户名”记录失败次数，默认 10 分钟内输错 6 次后锁定 15 分钟；可在“管理员”页面调整。
- 公开页面会隐藏内部配置错误，详细原因写入后台日志。
- 支付站域名、主项目 API 地址和易支付接口地址上线时都应使用 HTTPS。
- 本项目不处理退款；退款规则以主项目协议和你的支付通道规则为准。

## 后台

后台地址：

```text
/cpl/
```

默认账号：

```text
admin
change-this-admin-password
```

上线后请立即登录 `/cpl/`，进入“管理员”页面修改管理员用户名和新密码。
