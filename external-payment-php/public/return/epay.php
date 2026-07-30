<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

$payload = $_GET;
$orderNo = (string) ($payload['out_trade_no'] ?? '');

if ($orderNo === '') {
    render_page('支付返回', '<div class="alert">支付返回信息校验失败，请以订单实际状态为准。</div>');
}

try {
    $order = find_order($orderNo);
} catch (Throwable) {
    render_page('支付返回', '<div class="alert">订单不存在或链接无效，请以实际到账状态为准。</div>');
}
if (!verify_epay_signature($payload, $order)) {
    render_page('支付返回', '<div class="alert">支付返回信息校验失败，请以订单实际状态为准。</div>');
}

redirect_to('/order.php?order_no=' . urlencode($orderNo));
