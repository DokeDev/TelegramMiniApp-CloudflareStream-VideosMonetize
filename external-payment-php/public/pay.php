<?php

declare(strict_types=1);

require_once __DIR__ . '/_boot.php';

$orderNo = (string) ($_GET['order_no'] ?? '');
try {
    $order = find_order($orderNo);
} catch (Throwable) {
    render_page('继续支付', '<section class="order-panel"><div class="alert">订单不存在或链接无效。</div><a class="secondary-link" href="/">返回重新充值</a></section>');
}

if ($order['status'] !== 'PENDING') {
    redirect_to('/order.php?order_no=' . urlencode($order['order_no']));
}

try {
    if (($order['provider'] ?? '') !== active_provider()) {
        throw new RuntimeException('订单支付渠道与当前配置不一致');
    }
    $paymentRequest = epay_payment_request($order);
    ob_start();
    ?>
    <section class="order-panel">
        <p class="eyebrow">Payment</p>
        <h1>正在前往支付</h1>
        <p class="notice">如果页面没有自动跳转，请点击下方按钮继续。</p>
        <form id="epay-submit-form" data-auto-submit="payment" method="post" action="<?= e($paymentRequest['url']) ?>">
            <?php foreach ($paymentRequest['params'] as $name => $value): ?>
                <input type="hidden" name="<?= e((string) $name) ?>" value="<?= e((string) $value) ?>">
            <?php endforeach; ?>
            <button class="primary-button" type="submit">继续支付</button>
        </form>
    </section>
    <?php
    render_page('正在前往支付', ob_get_clean());
} catch (Throwable $exception) {
    log_payment_failure('payment_url_failed', [
        'order_no' => $order['order_no'],
        'error' => $exception->getMessage(),
    ]);
}

redirect_to('/order.php?order_no=' . urlencode($order['order_no']));
