<?php

declare(strict_types=1);

function payment_log_path(): string
{
    return base_path('storage/logs/payment-failures.log');
}

function sanitize_payment_log_value(string $key, mixed $value): mixed
{
    $lower = strtolower($key);
    if (str_contains($lower, 'password') || str_contains($lower, 'secret') || str_contains($lower, 'token') || str_contains($lower, 'key')) {
        return '[redacted]';
    }
    if ($lower === 'sign' && is_scalar($value)) {
        $sign = (string) $value;
        return strlen($sign) > 12 ? substr($sign, 0, 8) . '...' : '[present]';
    }
    if (is_array($value)) {
        $clean = [];
        foreach ($value as $childKey => $childValue) {
            $clean[(string) $childKey] = sanitize_payment_log_value((string) $childKey, $childValue);
        }
        return $clean;
    }
    return $value;
}

function log_payment_failure(string $reason, array $context = []): void
{
    $path = payment_log_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }

    $entry = [
        'time' => date('Y-m-d H:i:s'),
        'reason' => $reason,
        'ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        'context' => sanitize_payment_log_value('context', $context),
    ];

    @file_put_contents($path, json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND | LOCK_EX);
}

function recent_payment_logs(int $limit = 100): array
{
    $path = payment_log_path();
    if (!is_file($path)) {
        return [];
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        return [];
    }

    $lines = array_slice($lines, -max(1, min(500, $limit)));
    $entries = [];
    foreach (array_reverse($lines) as $line) {
        $data = json_decode($line, true);
        if (is_array($data)) {
            $entries[] = $data;
        }
    }

    return $entries;
}

function clear_payment_logs(): void
{
    $path = payment_log_path();
    if (is_file($path)) {
        file_put_contents($path, '', LOCK_EX);
    }
}
