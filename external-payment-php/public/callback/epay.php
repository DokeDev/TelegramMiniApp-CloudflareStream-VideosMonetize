<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

try {
    $payload = $_POST ?: $_GET;
    $order = find_order((string) ($payload['out_trade_no'] ?? ''));

    if (!verify_epay_signature($payload, $order)) {
        log_payment_failure('epay_signature_verify_failed', [
            'order_no' => $payload['out_trade_no'] ?? '',
            'payload' => $payload,
        ]);
        echo 'fail';
        exit;
    }

    apply_paid_callback(epay_payload_to_paid_callback($payload));
    echo 'success';
} catch (Throwable $exception) {
    log_payment_failure('epay_callback_failed', [
        'error' => $exception->getMessage(),
        'payload' => $_POST ?: $_GET,
    ]);
    echo 'fail';
}
