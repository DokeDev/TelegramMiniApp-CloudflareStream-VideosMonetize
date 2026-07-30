<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/Security.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Settings.php';
require_once __DIR__ . '/PaymentLog.php';
require_once __DIR__ . '/ProjectApi.php';
require_once __DIR__ . '/PaymentGateway.php';
require_once __DIR__ . '/OrderService.php';
require_once __DIR__ . '/AdminAuth.php';
require_once __DIR__ . '/AdminView.php';

set_exception_handler(function (Throwable $exception): void {
    http_response_code(500);

    if (is_json_request()) {
        json_response([
            'ok' => false,
            'error' => 'Internal Server Error',
        ], 500);
    }

    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>系统错误</title></head><body><h1>系统暂时不可用</h1><p>请检查服务配置或稍后再试。</p></body></html>';
});

send_security_headers();
start_secure_session();
