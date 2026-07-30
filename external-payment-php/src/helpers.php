<?php

declare(strict_types=1);

function base_path(string $path = ''): string
{
    $base = dirname(__DIR__);
    return $path === '' ? $base : $base . DIRECTORY_SEPARATOR . ltrim($path, DIRECTORY_SEPARATOR);
}

function config(): array
{
    static $config = null;

    if (is_array($config)) {
        return $config;
    }

    $path = base_path('config/config.php');
    if (!is_file($path)) {
        throw new RuntimeException('缺少 config/config.php，请从 config.example.php 复制并填写真实配置');
    }

    $config = require $path;
    return $config;
}

function assert_config_values(array $values): void
{
    foreach ($values as $name => $value) {
        $value = trim((string) $value);
        if ($value === '' || str_contains($value, 'example.com') || str_contains($value, 'change-this')) {
            throw new RuntimeException('配置项未填写：' . $name);
        }
    }
}

function assert_https_url(string $name, string $url, bool $required = true): void
{
    $url = trim($url);
    if ($url === '') {
        if ($required) {
            throw new RuntimeException($name . '不能为空');
        }
        return;
    }

    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    $host = (string) parse_url($url, PHP_URL_HOST);
    if ($scheme !== 'https' || $host === '') {
        throw new RuntimeException($name . '必须填写 HTTPS 完整地址');
    }
}

function public_error_message(Throwable $exception): string
{
    $safeMessages = [
        '请选择有效的充值套餐',
        '请输入 Telegram 用户名',
        '请选择有效的支付方式',
        '该支付方式暂未启用',
        '未找到该用户名，请先打开一次 Mini App 完成账号识别',
    ];

    $message = $exception->getMessage();
    if (in_array($message, $safeMessages, true)) {
        return $message;
    }

    if (str_contains($message, 'Invalid external recharge secret')) {
        return '主项目充值密钥不匹配，请联系管理员检查配置。';
    }

    if (str_contains($message, 'Project API request failed') || str_contains($message, 'Invalid project API response')) {
        return '主项目接口暂时不可用，请稍后再试或联系客服处理。';
    }

    if (str_contains($message, '配置项未填写')) {
        return '支付配置未完成，请联系管理员处理。';
    }

    return '暂时无法完成操作，请稍后再试或联系客服处理。';
}

function decimal_to_minor_units(string $amount): int
{
    $amount = trim($amount);
    if (!preg_match('/^\d+(?:\.(\d{1,2}))?$/', $amount, $matches)) {
        throw new InvalidArgumentException('支付金额格式无效');
    }

    [$whole, $fraction] = array_pad(explode('.', $amount, 2), 2, '');
    return ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
}

function e(string|int|float|null $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function normalize_username(string $username): string
{
    $username = trim($username);
    $username = ltrim($username, '@');
    return mb_strtolower($username, 'UTF-8');
}

function package_by_code(string $code): ?array
{
    foreach (payment_packages() as $package) {
        if (($package['code'] ?? '') === $code) {
            return $package;
        }
    }

    return null;
}

function random_order_no(): string
{
    return 'HP' . date('ymdHis') . strtoupper(bin2hex(random_bytes(8)));
}

function is_json_request(): bool
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    return str_contains(strtolower($contentType), 'application/json');
}

function request_data(): array
{
    if (is_json_request()) {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    return $_POST;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function redirect_to(string $url): never
{
    header('Location: ' . $url, true, 302);
    exit;
}

function public_asset_version(string $assetPath): string
{
    $candidates = [
        dirname(__DIR__) . '/public/' . ltrim($assetPath, '/'),
        dirname(__DIR__, 3) . '/' . ltrim($assetPath, '/'),
    ];

    foreach ($candidates as $path) {
        if (is_file($path)) {
            return (string) filemtime($path);
        }
    }

    return (string) time();
}

function render_page(string $title, string $content): never
{
    $appName = (string) setting('app_name', 'TG Video Pay');
    $stylesVersion = public_asset_version('assets/styles.css');
    $scriptVersion = public_asset_version('assets/app.js');

    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>' . e($title) . ' - ' . e($appName) . '</title>';
    echo '<link rel="stylesheet" href="/assets/styles.css?v=' . e($stylesVersion) . '">';
    echo '<script src="/assets/app.js?v=' . e($scriptVersion) . '" defer></script>';
    echo '</head><body><main class="shell">';
    echo '<header class="site-header"><div><strong>' . e($appName) . '</strong><span>独立积分充值</span></div></header>';
    echo $content;
    echo '<footer class="site-footer">* 此充值为独立积分，非Telegram的Stars</footer>';
    echo '</main></body></html>';
    exit;
}

function status_label(string $status): string
{
    return match ($status) {
        'PENDING' => '待支付',
        'PAID' => '已支付，等待到账',
        'CREDITED' => '已到账',
        'PAYMENT_FAILED' => '支付失败',
        'CREDIT_FAILED' => '已支付，到账失败',
        'CANCELED' => '已取消',
        'EXPIRED' => '已过期',
        default => $status,
    };
}
