<?php

declare(strict_types=1);

function project_api_post(string $path, array $payload): array
{
    $config = [
        'api_base_url' => setting('project_api_base_url', ''),
        'external_recharge_secret' => setting('project_external_recharge_secret', ''),
        'timeout_seconds' => setting('project_timeout_seconds', '6'),
    ];
    assert_config_values([
        'project.api_base_url' => $config['api_base_url'] ?? '',
        'project.external_recharge_secret' => $config['external_recharge_secret'] ?? '',
    ]);
    $baseUrl = rtrim($config['api_base_url'], '/');
    $url = $baseUrl . $path;
    $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($body === false) {
        throw new RuntimeException('JSON encode failed');
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'Accept: application/json',
                'x-external-recharge-secret: ' . $config['external_recharge_secret'],
            ],
            'content' => $body,
            'timeout' => (int) ($config['timeout_seconds'] ?? 6),
            'ignore_errors' => true,
        ],
    ]);

    $response = file_get_contents($url, false, $context);
    $status = 0;

    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
            $status = (int) $matches[1];
            break;
        }
    }

    $data = json_decode((string) $response, true);
    if (!is_array($data)) {
        $data = ['error' => 'Invalid project API response'];
    }

    if ($status < 200 || $status >= 300) {
        throw new RuntimeException((string) ($data['error'] ?? 'Project API request failed'));
    }

    return $data;
}

function lookup_project_user(string $username): array
{
    return project_api_post('/api/external/users/lookup', [
        'username' => $username,
    ])['user'] ?? [];
}

function credit_project_user(array $order, string $providerTradeNo): array
{
    return project_api_post('/api/external/credits/recharge', [
        'requestId' => $order['order_no'],
        'telegramUserId' => $order['telegram_user_id'],
        'username' => $order['telegram_username'] ?: $order['username_input'],
        'amount' => (int) $order['credits_amount'],
        'provider' => $order['provider'],
        'externalPaymentId' => $providerTradeNo,
        'note' => '独立 H5 支付充值',
    ]);
}
