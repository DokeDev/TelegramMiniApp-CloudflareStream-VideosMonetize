<?php

declare(strict_types=1);

function active_provider(): string
{
    return 'epay';
}

function payment_url_for_order(array $order): ?string
{
    if (($order['provider'] ?? '') !== active_provider()) {
        throw new RuntimeException('订单支付渠道与当前配置不一致');
    }

    return match (active_provider()) {
        'epay' => epay_payment_url($order),
        default => null,
    };
}

function epay_payment_url(array $order): string
{
    $payment = epay_payment_request($order);
    return $payment['url'] . '?' . http_build_query($payment['params'], '', '&', PHP_QUERY_RFC3986);
}

function epay_payment_request(array $order): array
{
    assert_payment_method_enabled((string) $order['payment_method']);
    $epay = epay_config((string) $order['payment_method']);
    assert_epay_config((string) $order['payment_method']);
    $baseUrl = epay_submit_url((string) $epay['api_url']);
    $params = [
        'pid' => (string) $epay['pid'],
        'type' => (string) $epay['type'],
        'out_trade_no' => (string) $order['order_no'],
        'notify_url' => (string) $epay['notify_url'],
        'return_url' => (string) $epay['return_url'],
        'name' => (string) $order['package_title'],
        'money' => number_format(decimal_to_minor_units((string) $order['pay_amount']) / 100, 2, '.', ''),
        'clientip' => $_SERVER['REMOTE_ADDR'] ?? '',
        'param' => (string) $order['telegram_user_id'],
    ];
    $params['sign'] = epay_sign($params, (string) $epay['key']);
    $params['sign_type'] = 'MD5';

    return [
        'url' => $baseUrl,
        'params' => $params,
    ];
}

function epay_sign(array $params, string $key): string
{
    unset($params['sign'], $params['sign_type']);
    ksort($params);

    $parts = [];
    foreach ($params as $name => $value) {
        if ($value === '' || $value === null) {
            continue;
        }
        $parts[] = $name . '=' . $value;
    }

    return md5(implode('&', $parts) . $key);
}

function epay_submit_url(string $apiUrl): string
{
    $apiUrl = trim($apiUrl);
    if ($apiUrl === '') {
        return '';
    }

    $apiUrl = strtok($apiUrl, '?') ?: $apiUrl;
    $apiUrl = rtrim($apiUrl, '/');
    $path = parse_url($apiUrl, PHP_URL_PATH);
    if ($path === '' || $path === false || $path === null) {
        return $apiUrl . '/source/plugin/keke_pay/submit.php';
    }
    if (preg_match('#/source/plugin/keke_pay$#i', $apiUrl)) {
        return $apiUrl . '/submit.php';
    }
    if (!preg_match('#/submit\.php$#i', $apiUrl)) {
        return $apiUrl . '/submit.php';
    }

    return $apiUrl;
}

function verify_epay_signature(array $payload, array $order): bool
{
    $method = (string) ($order['payment_method'] ?? '');
    $epay = epay_config($method);
    assert_epay_config($method);
    if (($payload['type'] ?? $epay['type']) !== $epay['type']) {
        return false;
    }

    $provided = (string) ($payload['sign'] ?? '');
    if ($provided === '') {
        return false;
    }

    $merchantMatches = hash_equals((string) $epay['pid'], (string) ($payload['pid'] ?? ''));
    return $merchantMatches && hash_equals(epay_sign($payload, (string) $epay['key']), $provided);
}

function assert_epay_config(string $method): void
{
    $epay = epay_config($method);
    assert_config_values([
        'base_url' => setting('base_url', ''),
        'epay.api_url' => $epay['api_url'] ?? '',
        'epay.pid' => $epay['pid'] ?? '',
        'epay.key' => $epay['key'] ?? '',
        'epay.notify_url' => $epay['notify_url'] ?? '',
        'epay.return_url' => $epay['return_url'] ?? '',
    ]);
}

function epay_config(string $method): array
{
    if (!in_array($method, ['alipay', 'usdt'], true)) {
        throw new RuntimeException('订单支付方式无效');
    }

    $baseUrl = rtrim((string) setting('base_url', ''), '/');
    return [
        'api_url' => setting('epay_api_url', ''),
        'pid' => epay_merchant_pid(),
        'key' => epay_merchant_key(),
        'type' => epay_gateway_type_for_method($method),
        'notify_url' => $baseUrl . '/callback/epay.php',
        'return_url' => $baseUrl . '/return/epay.php',
    ];
}

function epay_merchant_pid(): string
{
    $pid = (string) setting('epay_merchant_pid', '');
    if ($pid !== '') {
        return $pid;
    }

    return (string) (setting('epay_alipay_pid', '') ?: setting('epay_usdt_pid', ''));
}

function epay_merchant_key(): string
{
    $key = (string) setting('epay_merchant_key', '');
    if ($key !== '') {
        return $key;
    }

    return (string) (setting('epay_alipay_key', '') ?: setting('epay_usdt_key', ''));
}

function payment_method_enabled(string $method): bool
{
    if (!in_array($method, ['alipay', 'usdt'], true)) {
        return false;
    }

    return (string) setting('epay_' . $method . '_enabled', '1') === '1';
}

function assert_payment_method_enabled(string $method): void
{
    if (!payment_method_enabled($method)) {
        throw new RuntimeException('该支付方式暂未启用');
    }
}

function enabled_payment_methods(): array
{
    $methods = [];
    foreach (['alipay' => '支付宝', 'usdt' => 'USDT'] as $method => $label) {
        if (payment_method_enabled($method)) {
            $methods[$method] = $label;
        }
    }

    return $methods;
}

function epay_gateway_type_for_method(string $method): string
{
    return match ($method) {
        'alipay' => 'alipay',
        // keke_pay still names the upstream-modified USDT channel "wxpay".
        'usdt' => 'wxpay',
        default => throw new RuntimeException('订单支付方式无效'),
    };
}

function epay_payload_to_paid_callback(array $payload): array
{
    return [
        'order_no' => (string) ($payload['out_trade_no'] ?? ''),
        'trade_no' => (string) ($payload['trade_no'] ?? ''),
        'status' => strtolower((string) ($payload['trade_status'] ?? '')),
        'amount' => (string) ($payload['money'] ?? ''),
        'raw' => $payload,
    ];
}
