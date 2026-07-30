# Telegram Mini App + Cloudflare Stream Videos Monetize

一个基于 **Telegram Mini App + Cloudflare Stream + Node.js + MySQL** 的视频付费访问系统。项目包含 Mini App 前台、运营后台、Telegram Stars 支付、Cloudflare Stream 私密播放、订单/权限/播放记录、播放器水印、风控日志和服务端积分充值接口。

## 免责声明

本项目仅供合法合规用途使用。使用者必须确保所售卖、分发、存储、展示、传播的视频内容拥有合法版权、授权或其他合法权利，并遵守所在国家或地区的法律法规、平台规则、支付服务规则、Cloudflare 服务条款以及 Telegram 相关规则。

使用本项目产生的一切后果，包括但不限于版权纠纷、内容违规、支付纠纷、账户封禁、数据泄露、业务损失、法律责任、行政处罚、民事或刑事责任，均由使用者自行承担。

项目作者与贡献者不对任何直接、间接、偶然、特殊、惩罚性或后果性损失承担任何责任，也不对使用者通过本项目进行的任何行为承担责任。使用本项目即表示你理解并同意自行承担全部风险。

## 能力边界

- 播放器层水印、订单号水印、短时播放链接、播放 session 限制只能提高追踪和滥用成本，不能彻底阻止录屏、翻拍或二次传播。
- Telegram Mini App 前端运行在用户设备上，任何前端限制都不能视为绝对安全措施。
- Cloudflare Stream signed playback 可以降低长期直链泄露风险，但不能替代版权管理、合规审核和风控运营。
- 生产环境必须使用 HTTPS、强后台密码、数据库备份、日志监控、Webhook 校验和密钥隔离。

## 架构

```text
Telegram Mini App
  -> React 前台
  -> Fastify Node.js API
  -> MySQL + Prisma
  -> Telegram Stars / Webhook
  -> Cloudflare Stream signed playback
  -> 播放器水印、播放 session、播放事件
```

### 为什么使用 Cloudflare Stream

相比直接把 mp4 放到对象存储，Cloudflare Stream 更适合“按权限观看”的视频业务：

- 上传后自动处理转码和播放格式。
- 结合 signed playback 生成短时播放地址。
- 后端可以在用户有权限时才签发播放链接。
- 避免自己维护多清晰度、拖动缓冲、播放器兼容和 CDN 分发链路。
- 视频 UID 可以作为业务系统的视频标识，便于后台导入和管理。

对象存储适合归档和下载型资源；付费观看场景更需要动态授权、播放审计和短时访问控制。

## 功能

### Mini App 前台

- 系列/视频列表
- 视频价格展示：Stars 或项目积分
- Telegram Stars 支付发票
- 使用 Stars 兑换项目积分
- 已购买视频播放
- 价格为 0 的视频领取后播放
- 播放器官方水印
- 播放器订单号水印
- 水印随机移动
- 播放 session 创建与释放
- 播放事件上报：play、pause、heartbeat、ended
- 用户个人中心、积分余额、购买状态
- 用户协议、退款说明、封号规则、版权声明页面
- `robots.txt` 和 noindex 响应头，避免搜索引擎收录 Mini App

### 运营后台

- `/admin` 后台路径
- 管理员用户名/密码登录
- 登录失败限制，防撞库
- 后台 Bearer token 会话
- 运营概览和统计图表
- Telegram Bot 配置与测试
- Telegram Payments / Stars 配置
- Cloudflare Stream 配置与测试
- Cloudflare Stream 视频拉取和导入
- 系列管理
- 视频管理：创建、编辑、上架、下架、归档
- 批量导入系列/视频
- Stars 订单管理
- 项目积分订单管理
- 外部服务端充值记录
- 手动发放/撤销权限
- 用户搜索、详情、积分调整
- 用户黑名单/封禁管理
- 播放 session、播放事件、异常检测
- 风控事件记录
- 活动日志和后台操作审计
- 开发工具：测试用户、测试订单、模拟支付、清理播放记录

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + Fastify
- 数据库：MySQL 8.0 + Prisma
- 视频：Cloudflare Stream
- Mini App 支付：Telegram Stars
- 图标：lucide-react

## 目录结构

```text
.
├── backend                 Node.js API、Prisma、Webhook、后台接口
├── frontend                React Mini App 和后台页面
├── docs                    部署文档
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .env.production.example
└── README.md
```

## 本地开发

要求：

```text
Node.js 20+
npm
MySQL 8.0
```

创建数据库：

```sql
CREATE DATABASE tgwebapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

复制环境变量：

```bash
cp .env.example .env
cp .env.example backend/.env
```

至少修改：

```text
DATABASE_URL=mysql://user:password@127.0.0.1:3306/tgwebapp
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=change-this-local-session-secret
```

安装依赖并初始化：

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

启动：

```bash
npm run dev
```

默认地址：

```text
前台：http://localhost:19327
后台：http://localhost:19327/admin
后端：http://localhost:18763
```

本地普通浏览器没有 Telegram Mini App 的 `openInvoice` 环境，购买 Stars 时会提示从 Telegram 中打开。需要验证支付闭环时，可以使用后台开发工具创建测试订单并模拟支付回调，或运行：

```bash
npm run smoke
```

## 生产部署

详细说明见：[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

推荐同源部署：

```text
https://your-domain.example/
https://your-domain.example/admin
https://your-domain.example/api/...
```

后端设置：

```text
SERVE_FRONTEND=true
FRONTEND_DIST_DIR=/app/frontend/dist
```

这样服务器只需要反向代理一个 Node.js 端口。

### Docker Compose

```bash
cp .env.production.example .env.production
docker compose --env-file .env.production up -d --build
```

### 传统部署

```bash
npm ci
VITE_API_BASE_URL= npm run build
npx prisma migrate deploy --schema backend/prisma/schema.prisma
node backend/dist/src/index.js
```

## 关键环境变量

```text
APP_ENV=production
HOST=0.0.0.0
PORT=18763
TRUST_PROXY=true
PUBLIC_BASE_URL=https://your-domain.example
FRONTEND_ORIGIN=https://your-domain.example
SERVE_FRONTEND=true
DATABASE_URL=mysql://user:password@host:3306/tgwebapp

ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
EXTERNAL_RECHARGE_SECRET=

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_STREAM_SIGNING_KEY_ID=
CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY=
TOKEN_TTL_SECONDS=900
```

真实密钥只能写入 `.env`、`.env.production` 或后台配置，不能提交到 Git。

## Telegram Stars

支付链路：

```text
Mini App 点击购买
  -> 后端创建 PENDING 订单
  -> 后端调用 Telegram createInvoiceLink
  -> Mini App 调用 Telegram.WebApp.openInvoice
  -> Telegram 发送 pre_checkout_query 到 webhook
  -> 后端 answerPreCheckoutQuery
  -> Telegram 支付成功后发送 successful_payment
  -> 后端标记订单 PAID 并发放观看权限
```

生产环境需要设置 HTTPS Webhook：

```text
https://your-domain.example/api/telegram/webhook
```

命令：

```bash
npm run setup:webhook
```

## 服务端积分充值接口

外部服务端调用主项目积分充值接口时必须携带：

```text
x-external-recharge-secret: EXTERNAL_RECHARGE_SECRET
```

查账号：

```http
POST /api/external/users/lookup
Content-Type: application/json

{
  "username": "@TestUser"
}
```

充值到账：

```http
POST /api/external/credits/recharge
Content-Type: application/json

{
  "requestId": "external-order-0001",
  "telegramUserId": "123456789",
  "username": "@TestUser",
  "amount": 320,
  "provider": "external_server",
  "externalPaymentId": "pay-0001",
  "note": "服务端积分充值"
}
```

说明：

- `requestId` 必须全局唯一，用于幂等。
- 入账以 `telegramUserId` 为准，`username` 只用于展示、记录和辅助校验。
- 用户必须先打开过 Mini App，主项目数据库中已有该用户。
- 被封禁用户不能充值。

## 上线前检查

- 已配置 HTTPS 域名
- 已配置 Telegram Mini App URL
- 已配置 Telegram Webhook
- 已完成 Telegram Stars 小额测试
- 已配置 Cloudflare Stream 和 signed playback
- 已修改强后台密码和 session secret
- 已关闭生产环境危险调试项
- 已配置数据库备份
- 已配置错误日志、访问日志和进程守护
- 已检查内容版权、支付品类、平台规则和地区限制
- 已确认 `.env`、真实 logo、真实域名、真实 Token 没有提交

## 常见问题

### Body cannot be empty when content-type is set to application/json

请求设置了 `Content-Type: application/json`，但没有传 JSON body。GET 请求不要带 body；POST/PUT 请求需要传合法 JSON。

### 购买后没有权限

检查订单是否仍为 `PENDING`。如果是 Stars 订单，重点检查 Telegram Webhook 是否配置成功、`pre_checkout_query` 是否被确认、`successful_payment` 是否到达后端。

### 播放被拒绝

可能触发单用户同时播放限制。可以在后台清理播放 session，或调整并发播放配置。

### Cloudflare 未配置能不能测试

可以。未配置时会走演示播放地址，方便先测试订单、权限、水印、播放 session 和后台流程。

## 许可证

本项目采用 **GNU Affero General Public License v3.0 only**，SPDX 标识：

```text
AGPL-3.0-only
```

如果你修改本项目并通过网络向用户提供服务，需要按 AGPL-3.0 的要求向这些用户提供相应源代码。

许可证全文见 [LICENSE](./LICENSE)。
