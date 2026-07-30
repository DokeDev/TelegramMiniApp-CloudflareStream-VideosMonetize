<?php

declare(strict_types=1);

require_once __DIR__ . '/_boot.php';

$orderNo = (string) ($_GET['order_no'] ?? '');
try {
    $order = find_order($orderNo);
} catch (Throwable) {
    render_page('充值订单', '<section class="order-panel"><div class="alert">订单不存在或链接无效。</div><a class="secondary-link" href="/">返回重新充值</a></section>');
}
$paymentError = null;
$paymentUrl = null;
if ($order['status'] === 'PENDING') {
    try {
        $paymentUrl = payment_url_for_order($order);
    } catch (Throwable $exception) {
        log_payment_failure('payment_url_failed', [
            'order_no' => $order['order_no'],
            'error' => $exception->getMessage(),
        ]);
        $paymentError = public_error_message($exception);
    }
}

ob_start();
?>
<section class="order-panel">
    <p class="eyebrow">充值订单</p>
    <h1><?= e(status_label($order['status'])) ?></h1>

    <dl class="detail-list">
        <div>
            <dt>订单号</dt>
            <dd><?= e($order['order_no']) ?></dd>
        </div>
        <div>
            <dt>充值账号</dt>
            <dd><?= e($order['display_name']) ?><?= $order['telegram_username'] ? ' (@' . e($order['telegram_username']) . ')' : '' ?></dd>
        </div>
        <div>
            <dt>套餐</dt>
            <dd><?= e($order['package_title']) ?> / <?= e((string) $order['credits_amount']) ?> 积分</dd>
        </div>
        <div>
            <dt>应付金额</dt>
            <dd><?= e($order['pay_amount']) ?> <?= e($order['pay_currency']) ?></dd>
        </div>
        <div>
            <dt>支付方式</dt>
            <dd><?= ($order['payment_method'] ?? 'alipay') === 'usdt' ? 'USDT' : '支付宝' ?></dd>
        </div>
    </dl>

    <?php if ($order['status'] === 'PENDING'): ?>
        <?php if ($paymentUrl): ?>
            <a class="primary-link" href="<?= e($paymentUrl) ?>">继续支付</a>
        <?php elseif ($paymentError): ?>
            <div class="notice">
                <?= e($paymentError) ?> 请联系管理员检查支付站域名、商户 ID、商户密钥和易支付接口地址。
            </div>
        <?php else: ?>
            <div class="notice">
                当前支付方式暂不可用，请稍后再试或联系客服处理。
            </div>
        <?php endif; ?>
    <?php elseif ($order['status'] === 'CREDITED'): ?>
        <div class="success">充值成功，积分已到账。请回到 Telegram Mini App 查看余额。</div>
    <?php elseif ($order['failure_reason']): ?>
        <div class="alert"><?= e($order['failure_reason']) ?></div>
    <?php endif; ?>

    <a class="secondary-link" href="/">返回重新充值</a>
</section>
<?php

render_page('充值订单', ob_get_clean());
