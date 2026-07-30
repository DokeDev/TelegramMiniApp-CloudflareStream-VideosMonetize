# Telegram Mini App + Cloudflare Stream 视频售卖系统

一个基于 **Telegram Mini App + Cloudflare Stream + Node.js + MySQL** 的私域视频售卖项目。项目提供视频商品管理、订单支付、观看权限、水印播放器、播放记录、后台运营、开发测试工具等完整本地开发闭环。

本项目适合用于学习、二次开发或搭建合规的视频内容付费访问系统。

## 法律风险与免责声明

本项目仅供合法合规用途使用。使用者必须确保所售卖、分发、存储、展示、传播的视频内容拥有合法版权、授权或其他合法权利，并遵守所在国家或地区的法律法规、平台规则、支付服务规则、Cloudflare 服务条款以及 Telegram 相关规则。

使用本项目产生的一切后果，包括但不限于版权纠纷、内容违规、支付纠纷、账户封禁、数据泄露、业务损失、法律责任、行政处罚、民事或刑事责任，均由使用者自行承担。

项目作者与贡献者不对任何直接、间接、偶然、特殊、惩罚性或后果性损失承担任何责任，也不对使用者通过本项目进行的任何行为承担责任。使用本项目即表示你理解并同意自行承担全部风险。

## 重要说明

- 播放器层水印、订单号水印、短时播放链接、播放 session 限制只能提高追踪和滥用成本，不能从技术上彻底阻止录屏、翻拍或二次传播。
- Telegram Mini App 前端运行在用户设备上，任何前端限制都不能视为绝对安全措施。
- 真正上线前需要配置 HTTPS 域名、Telegram Webhook、Cloudflare Stream 私密播放签名、强后台密码、数据库备份和日志监控。

## 为什么使用这套模式

本项目采用：

```text
Telegram Mini App
  -> Node.js 后端校验用户、订单和权限
  -> MySQL 保存用户、订单、权限、播放记录
  -> Cloudflare Stream 托管和分发视频
  -> 前端播放器叠加订单号水印和官方水印
```

这套模式的核心目标不是“绝对防录屏”，而是把视频售卖业务拆成几个边界清晰、可控、可追踪的环节：

- Telegram 负责用户入口、Mini App 运行环境和 Telegram Stars 支付入口。
- Node.js 后端负责真正的业务判断：谁买了、买了什么、是否有权限、能不能播放。
- MySQL 负责保存可审计的数据：订单、权限、播放 session、播放事件、后台操作日志。
- Cloudflare Stream 负责视频上传、转码、播放分发和 signed playback，避免自己维护复杂的视频处理链路。
- 前端播放器只负责展示和交互，不把长期有效的视频地址、密钥或授权逻辑放在浏览器里。

相比“直接把视频文件放到对象存储，然后把 mp4 地址发给用户”，这套模式更适合付费视频：

- 对象存储直链一旦泄露，通常很难区分是谁传播的，也不容易做播放级授权。
- 原始 mp4 文件需要自己处理转码、多清晰度、播放器兼容、拖动体验、带宽分发等问题。
- 付费视频需要按用户、订单、权限动态发放播放资格，不能只靠一个静态文件地址。
- 播放 session、订单水印、短时链接、后台日志组合起来，能在发生转卖或传播时提供追踪线索。

因此，本项目把“视频文件分发”交给 Cloudflare Stream，把“谁能看、看多久、怎么看、如何追踪”留在自己的后端和数据库中管理。

## 功能特性

### 前台 Mini App

- 视频列表展示
- 视频价格展示
- Telegram Mini App 环境下支持 Telegram Stars 发票
- 已购买视频播放入口
- 播放器层官方水印
- 播放器层订单号水印
- 订单号水印随机移动
- 播放事件上报：play、pause、heartbeat、ended
- 播放 session 创建
- 单用户并发播放限制

### 后台管理

- 管理员密码登录
- 运营概览
- Telegram Bot Token 配置和测试
- Telegram Stars 支付开关
- Cloudflare Stream 配置和测试
- Cloudflare Stream 视频拉取
- Cloudflare 视频导入本地视频库
- 视频创建、编辑、上架、下架、归档
- Stars 订单管理
- 订单列表
- 订单筛选
- 订单详情
- 手动标记支付
- 手动发放权限
- 权限撤销和恢复
- 用户列表
- 用户搜索
- 用户详情
- 用户订单、权限、播放记录查看
- 播放 session 列表
- 播放 session 搜索
- 播放事件时间线
- 活动日志
- 开发工具：
  - 创建测试用户
  - 创建测试订单
  - 模拟 Telegram 支付回调
  - 清理播放 session 和播放事件

### 后端能力

- Fastify API
- Telegram initData 校验
- 开发环境模拟 Telegram 用户
- Prisma + MySQL 数据模型
- Telegram Stars 发票创建
- Telegram Stars Webhook 处理
- Cloudflare Stream signed token 播放链接
- 活动日志记录
- 播放事件记录
- 订单权限发放
- 订单、用户、视频、播放记录筛选

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Node.js + TypeScript + Fastify
- 数据库：MySQL 8.0 + Prisma
- 视频：Cloudflare Stream
- 支付：Telegram Stars
- 图标：lucide-react

## 目录结构

```text
.
├── backend
│   ├── prisma
│   │   ├── migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src
│       ├── admin.ts
│       ├── auth.ts
│       ├── cloudflare.ts
│       ├── payments.ts
│       ├── routes.ts
│       └── settings.ts
├── frontend
│   └── src
│       ├── AdminApp.tsx
│       ├── App.tsx
│       ├── api.ts
│       └── styles.css
├── DEVELOPMENT_FLOW.md
├── 开发流程.md
└── README.md
```

## 本地环境要求

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

根据你的本地 MySQL 修改 `.env` 和 `backend/.env`：

```text
DATABASE_URL=mysql://root:你的密码@127.0.0.1:3306/tgwebapp
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=local-dev-admin-session-secret
ADMIN_SESSION_BINDING=user-agent
ADMIN_ALLOW_PASSWORD_HEADER=false
```

安装依赖：

```bash
npm install
```

初始化数据库：

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

启动开发服务：

```bash
npm run dev
```

默认访问地址：

```text
前台：http://localhost:19327
后台：http://localhost:19327/cpl
后端：http://localhost:18763
```

## 生产部署

生产部署说明见：[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

部署阶段建议使用同源模式：

```text
https://your-domain.example/
https://your-domain.example/cpl
https://your-domain.example/api/...
```

后端可以设置 `SERVE_FRONTEND=true`，直接托管 `frontend/dist`，这样服务器只需要反向代理一个 Node.js 端口。

## 常用命令

```bash
npm run dev
npm run build
npm run typecheck
npm run smoke
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

## 环境变量

主要环境变量：

```text
APP_ENV=development
PORT=18763
HOST=127.0.0.1
TRUST_PROXY=false
BODY_LIMIT_BYTES=1048576
FRONTEND_ORIGIN=http://localhost:19327
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX=240
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=change-this-local-session-secret
ADMIN_SESSION_TTL_SECONDS=43200
ADMIN_SESSION_BINDING=user-agent
ADMIN_LOGIN_MAX_ATTEMPTS=8
ADMIN_LOGIN_WINDOW_SECONDS=600
ADMIN_LOGIN_LOCK_SECONDS=900
ADMIN_ALLOW_PASSWORD_HEADER=false
DATABASE_URL=mysql://user:password@127.0.0.1:3306/tgwebapp

TELEGRAM_BOT_TOKEN=
DEV_TELEGRAM_USER_ID=10001
DEV_TELEGRAM_USERNAME=devbuyer

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_STREAM_SIGNING_KEY_ID=
CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY=
TOKEN_TTL_SECONDS=900
DEMO_CLOUDFLARE_VIDEO_UID=

OFFICIAL_WATERMARK_TEXT=Official
VITE_API_BASE_URL=http://localhost:18763
VITE_TELEGRAM_BOT_USERNAME=
```

真实密钥请只写入 `.env` 或后台配置，不要提交到 Git。

后台登录默认使用用户名 + 密码换取短期 token，后台 API 不再默认接受 `x-admin-password` 直连。`ADMIN_SESSION_BINDING=user-agent` 会把 token 绑定到当前浏览器环境，降低 token 被复制后的可用性。

## 本地开发流程

本地普通浏览器没有 Telegram Mini App 的 `openInvoice` 环境，因此前台购买会提示在 Telegram Mini App 内打开。本地需要验证支付闭环时，使用后台开发工具创建 `telegram_stars` 测试订单并模拟 Telegram 回调。

推荐测试顺序：

```text
后台创建或导入视频
  -> 后台开发工具创建 Telegram Stars 测试订单
  -> 点击“模拟 Telegram 支付”
  -> 前台刷新后播放
  -> 后台播放页查看 session 和事件
  -> 后台日志页查看完整操作记录
```

开发工具页还提供“模拟 Telegram 支付”：

```text
创建一笔 provider=telegram_stars 的待支付测试订单
  -> 订单号自动填入“模拟回调订单号”
  -> 点击“模拟 Telegram 支付”
  -> 后端按 Telegram successful_payment 逻辑标记订单 PAID
  -> 自动发放观看权限
  -> 日志页记录模拟回调动作
```

也可以用命令快速跑一遍本地核心链路：

```bash
npm run smoke
```

该脚本会检查后端健康状态、创建一笔 Telegram 待支付测试订单、模拟 Telegram 支付成功、验证订单变为 `PAID` 且权限为 `ACTIVE`，并检查活动日志是否写入。

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

正式环境需要给 Telegram Bot 配置 HTTPS Webhook：

```text
https://你的域名/api/telegram/webhook
```

## 独立 H5 积分充值对接

Mini App 内的数字内容购买保持使用 Telegram Stars。独立 H5 充值系统如果需要给项目积分入账，建议作为单独服务运行，并由外部服务端调用本项目预留接口，不要把接口密钥暴露给浏览器前端。

推荐流程：

```text
用户在独立 H5 输入 @username
  -> 独立 H5 服务端调用 /api/external/users/lookup 查项目账号
  -> H5 展示项目返回的账号信息，让用户确认
  -> 用户选择套餐并完成外部支付
  -> 外部支付回调到独立 H5 服务端
  -> 独立 H5 服务端调用 /api/external/credits/recharge 给锁定的 telegramUserId 入账
```

所有外部接口都需要请求头：

```text
x-external-recharge-secret: 你的 EXTERNAL_RECHARGE_SECRET
```

查账号接口：

```http
POST /api/external/users/lookup
Content-Type: application/json

{
  "username": "@TestUser"
}
```

说明：

- `username` 会自动去掉 `@` 并按小写匹配。
- 项目展示仍使用数据库中保存的 Telegram 原始用户名大小写。
- 找不到时，提示用户先打开一次 Mini App 完成账号识别。
- 查到后，外部支付订单应锁定返回的 `telegramUserId`，不要在支付成功后重新按 username 查询。

充值到账接口：

```http
POST /api/external/credits/recharge
Content-Type: application/json

{
  "requestId": "h5-order-20260715-0001",
  "telegramUserId": "123456789",
  "username": "@TestUser",
  "amount": 320,
  "provider": "external_h5",
  "externalPaymentId": "pay-0001",
  "note": "独立 H5 积分充值"
}
```

说明：

- `requestId` 必须全局唯一，用于幂等，重复回调不会重复加积分。
- 入账只按 `telegramUserId`，`username` 仅用于校验和记录。
- 目标用户必须已经打开过 Mini App 并存在于项目数据库中。
- 被封禁用户不能充值。
- 独立 H5 充值涉及支付渠道和平台规则风险，正式使用前需要自行确认合规性。

## Cloudflare Stream

Cloudflare Stream 是本项目的视频基础设施层，主要负责视频托管、转码、播放分发和私密播放控制。

### 为什么选择 Cloudflare Stream

对于视频售卖系统，视频不是普通静态文件。直接使用对象存储保存 mp4 虽然简单，但后续会遇到这些问题：

- 需要自己处理视频转码和不同设备兼容。
- 需要自己处理大文件传输、拖动、缓冲和播放体验。
- 需要自己处理 CDN 分发和带宽压力。
- 需要自己设计私密播放、防直链、短时访问链接。
- 静态文件地址泄露后，追踪和失效处理比较麻烦。

Cloudflare Stream 更适合这个项目的原因：

- 上传后由平台处理视频转码和播放格式。
- 使用播放器或 iframe 播放，前端集成成本低。
- 可以结合 signed token 生成短时有效播放链接。
- 视频 UID 可以作为业务系统里的视频标识，后台导入和管理比较直接。
- 后端可以在用户有权限时才生成播放地址，避免前端长期持有可复用链接。
- 和 Cloudflare CDN 网络天然结合，后续上线时减少自己维护视频分发基础设施的负担。

### 本项目中的播放链路

```text
用户点击播放
  -> 前端请求 /api/videos/:id/play
  -> 后端校验 Telegram 用户
  -> 后端查询 MySQL 权限 Entitlement
  -> 后端检查并发播放限制
  -> 后端使用 Cloudflare Stream Signing Key 生成短时播放 token
  -> 后端创建 PlaySession
  -> 前端加载 Cloudflare Stream 播放地址
  -> 前端叠加官方水印和订单号水印
  -> 前端周期性上报播放事件
```

这个链路的关键点是：Cloudflare Stream 不直接决定谁能看，真正的权限判断在本项目后端完成。Cloudflare Stream 负责播放和分发，后端负责授权和审计。

### 后台需要配置

后台需要配置：

- Cloudflare Account ID
- Cloudflare API Token
- Stream Signing Key ID
- Stream Signing Private Key
- 默认测试视频 UID

未配置 Cloudflare signed key 时，系统会使用演示播放地址，方便先开发订单、水印和后台流程。

### Cloudflare Stream 与对象存储的区别

| 方案 | 适合场景 | 优点 | 局限 |
| --- | --- | --- | --- |
| Cloudflare Stream | 付费观看、私密播放、需要转码和播放体验的视频业务 | 自动处理视频播放链路，支持 signed playback，前端接入简单 | 需要依赖 Cloudflare Stream 服务，成本和规则以 Cloudflare 为准 |
| 对象存储 | 文件归档、下载型资源、简单公开文件 | 文件存储简单，通用性强 | 视频转码、播放器、多清晰度、防直链、播放鉴权都要自己做 |

如果只是保存文件或提供下载，对象存储足够；如果是“卖观看权限”，Cloudflare Stream 更贴近业务目标。

### 安全边界

Cloudflare Stream signed playback 可以降低固定播放链接被长期传播的风险，但不能阻止以下情况：

- 用户录屏。
- 用户用另一台设备翻拍。
- 用户在浏览器环境中分析临时播放请求。
- 已授权用户在有效期内转发当前播放环境。

因此项目同时加入：

- 订单号水印
- 官方水印
- 播放 session
- 播放心跳
- 并发播放限制
- 后台播放记录
- 活动日志

这些功能用于追踪和提高滥用成本，而不是承诺绝对防复制。

## 防转卖和风控设计

项目当前提供：

- 订单号水印
- 官方水印
- 播放 session 记录
- 播放心跳记录
- 播放事件时间线
- 单用户同时播放数量限制
- 后台用户详情和播放记录追踪
- 活动日志

注意：这些能力只能辅助追踪和提高滥用成本，不能保证视频不会被录屏、翻拍、下载、转卖或传播。

## 数据库模型

核心模型：

- User：Telegram 用户
- Video：视频商品
- Order：订单
- Entitlement：观看权限
- PlaySession：播放会话
- PlayEvent：播放事件
- AppSetting：后台配置
- ActivityLog：后台和系统活动日志

## 上线前检查

上线前至少需要完成：

- 配置 HTTPS 域名
- 配置 Telegram Mini App URL
- 配置 Telegram Bot Webhook
- 启用 Telegram Stars 支付并验证 Webhook
- 配置 Cloudflare Stream 私密播放
- 修改强后台密码
- 配置数据库备份
- 配置错误日志和访问日志
- 检查内容版权和销售合规性
- 检查支付服务地区、品类和平台规则

## 常见问题

### Body cannot be empty when content-type is set to application/json

请求设置了 `Content-Type: application/json`，但没有传 JSON body。GET 请求不要带 body；POST/PUT 请求需要传合法 JSON。

### 购买后没有权限

检查订单是否还是 `PENDING`。如果是 Stars 订单，重点检查 Telegram Webhook 是否配置成功、`pre_checkout_query` 是否被确认、`successful_payment` 是否到达后端。

### 播放被拒绝

可能触发了“单用户同时播放数”限制。可以在配置页临时改成 `0`，或在开发工具里清理播放 session。

### Cloudflare 未配置能不能测试

可以。未配置时会走本地演示播放器，不影响订单、权限、水印、播放 session 和后台流程测试。

## 许可证

本项目采用 **GNU Affero General Public License v3.0 only**，SPDX 标识为：

```text
AGPL-3.0-only
```

这意味着你可以在 AGPL-3.0 条款下使用、复制、修改和分发本项目；如果你修改本项目并通过网络向用户提供服务，也需要按 AGPL-3.0 的要求向这些用户提供相应源代码。

许可证全文见 [LICENSE](./LICENSE)。AGPL-3.0 的官方文本可参考 GNU 官网：https://www.gnu.org/licenses/agpl-3.0.html

本项目的法律风险与免责声明仍然适用：使用本项目产生的一切后果由使用者自行承担，项目作者与贡献者不承担任何责任。
