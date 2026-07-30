# 部署指南

本文档用于把项目从本地开发切换到可上线部署状态。

## 部署模式

推荐生产链路：

```text
用户 Telegram Mini App
  -> HTTPS 域名
  -> Apache/Nginx/Caddy 反向代理
  -> Node.js app:18763
  -> MySQL 8.0
  -> Cloudflare Stream
  -> Telegram Stars Webhook
```

生产环境建议前端和 API 同源部署：

```text
https://your-domain.example/
https://your-domain.example/admin
https://your-domain.example/api/...
```

这样 Telegram Mini App URL、后台页面、API、Webhook 都在同一个域名下，部署和 CORS 都更简单。

## 必备条件

- 一台 Linux 服务器
- 一个 HTTPS 域名
- Docker 和 Docker Compose，或 Node.js 20+ 和 MySQL 8.0
- Telegram Bot Token
- Telegram Stars 支付使用 Bot Token 和 Webhook，不需要第三方支付 Token
- Cloudflare Stream Account ID、API Token、Signing Key

## 环境变量

复制模板：

```bash
cp .env.production.example .env.production
```

至少修改：

```text
FRONTEND_ORIGIN=https://your-domain.example
PUBLIC_BASE_URL=https://your-domain.example
TRUST_PROXY=true
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX=240
ADMIN_USERNAME=后台用户名
ADMIN_PASSWORD=至少 12 位强密码
ADMIN_SESSION_SECRET=至少 32 位随机长字符串
ADMIN_SESSION_BINDING=user-agent
ADMIN_LOGIN_MAX_ATTEMPTS=8
ADMIN_LOGIN_WINDOW_SECONDS=600
ADMIN_LOGIN_LOCK_SECONDS=900
ADMIN_ALLOW_PASSWORD_HEADER=false
MYSQL_PASSWORD=强密码
MYSQL_ROOT_PASSWORD=强密码
TELEGRAM_BOT_TOKEN=你的 Bot Token
TELEGRAM_WEBHOOK_SECRET=随机长字符串
CLOUDFLARE_ACCOUNT_ID=你的 Cloudflare Account ID
CLOUDFLARE_API_TOKEN=你的 Cloudflare API Token
CLOUDFLARE_STREAM_SIGNING_KEY_ID=你的 Stream Signing Key ID
CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY=你的 Stream Signing Private Key
```

生产环境不要使用：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_SESSION_SECRET=local-dev-admin-session-secret
ADMIN_ALLOW_PASSWORD_HEADER=true
```

后台 API 默认只接受登录后签发的 Bearer token，不建议在生产环境开启 `ADMIN_ALLOW_PASSWORD_HEADER`。

## Docker Compose 部署

构建并启动：

```bash
docker compose --env-file .env.production up -d --build
```

查看日志：

```bash
docker compose logs -f app
```

检查健康状态：

```bash
curl http://127.0.0.1:18763/health
curl http://127.0.0.1:18763/ready
```

`/health` 只表示 Node.js 进程可响应，适合进程存活探针；`/ready` 会执行数据库检查，适合发布后或负载均衡就绪检查。

数据库迁移会在 app 容器启动时执行：

```text
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

## 传统服务器部署

安装依赖：

```bash
npm ci
```

构建：

```bash
VITE_API_BASE_URL= npm run build
```

执行迁移：

```bash
npx prisma migrate deploy --schema backend/prisma/schema.prisma
```

启动：

```bash
APP_ENV=production \
HOST=0.0.0.0 \
PORT=18763 \
SERVE_FRONTEND=true \
FRONTEND_DIST_DIR=../frontend/dist \
npm run start -w backend
```

建议用 systemd、PM2 或 Docker 管理进程。

## Apache 反向代理示例

启用模块：

```bash
a2enmod proxy proxy_http headers ssl rewrite
systemctl reload apache2
```

站点配置示例：

```apache
<VirtualHost *:443>
    ServerName your-domain.example

    SSLEngine on
    SSLCertificateFile /path/to/fullchain.pem
    SSLCertificateKeyFile /path/to/privkey.pem

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass / http://127.0.0.1:18763/
    ProxyPassReverse / http://127.0.0.1:18763/
</VirtualHost>
```

HTTP 跳转 HTTPS：

```apache
<VirtualHost *:80>
    ServerName your-domain.example
    Redirect permanent / https://your-domain.example/
</VirtualHost>
```

## Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name your-domain.example;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.example;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:18763;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

## Telegram Webhook

确认 `.env.production` 中：

```text
PUBLIC_BASE_URL=https://your-domain.example
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
```

设置 webhook：

```bash
set -a
source .env.production
set +a
npm run setup:webhook
```

Webhook 地址：

```text
https://your-domain.example/api/telegram/webhook
```

后端会校验 Telegram 请求头：

```text
x-telegram-bot-api-secret-token
```

## Telegram Mini App

在 BotFather 设置 Mini App URL：

```text
https://your-domain.example/
```

如果只开放后台给管理员使用，建议不要公开传播：

```text
https://your-domain.example/admin
```

## Cloudflare Stream

生产环境需要：

- 上传视频到 Cloudflare Stream
- 创建 Stream Signing Key
- 后台填写 Account ID、API Token、Signing Key ID、Private Key
- 后台 Cloudflare 页拉取视频并导入本地
- 视频状态设为上架

播放时后端会在用户有权限后生成短时 signed playback URL。

## 上线检查

部署前运行：

```bash
set -a
source .env.production
set +a
npm run check:prod-env
```

部署后检查：

```bash
curl https://your-domain.example/health
curl https://your-domain.example/ready
```

进入后台检查：

```text
https://your-domain.example/admin
```

检查项：

- 后台密码已修改
- Telegram Bot Token 可测试通过
- Telegram Stars 已启用
- Cloudflare Stream 可测试通过
- 视频可导入并上架
- Webhook 已设置
- 支付成功后能自动发放权限
- 播放记录和活动日志可见

## 数据备份

Docker Compose MySQL 备份示例：

```bash
docker compose exec mysql mysqldump -u root -p tgwebapp > backup.sql
```

恢复示例：

```bash
docker compose exec -T mysql mysql -u root -p tgwebapp < backup.sql
```

建议至少备份：

- User
- Video
- Order
- Entitlement
- AppSetting
- ActivityLog

## 安全提醒

- 后台密码必须改强密码。
- `.env.production` 不能提交到 Git。
- Telegram Webhook Secret 必须设置随机长字符串。
- Cloudflare API Token 只给 Stream 必要权限。
- MySQL 不要直接暴露公网。
- 生产环境必须 HTTPS。
- 播放器水印和 signed URL 不能彻底防止录屏，只能提高追踪和滥用成本。
