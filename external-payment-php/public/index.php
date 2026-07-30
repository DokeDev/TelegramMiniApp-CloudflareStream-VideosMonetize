<?php

declare(strict_types=1);

require_once __DIR__ . '/_boot.php';

$error = null;
$username = '';
$selectedPackage = '';
$availablePaymentMethods = enabled_payment_methods();
$paymentMethod = array_key_first($availablePaymentMethods) ?: 'alipay';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $username = (string) ($_POST['username'] ?? '');
        $selectedPackage = (string) ($_POST['package_code'] ?? '');
        $paymentMethod = (string) ($_POST['payment_method'] ?? 'alipay');
        $order = create_recharge_order($username, $selectedPackage, $paymentMethod);

        redirect_to('/pay.php?order_no=' . urlencode($order['order_no']));
    } catch (Throwable $exception) {
        log_payment_failure('public_order_create_failed', [
            'error' => $exception->getMessage(),
            'username' => $username,
            'package_code' => $selectedPackage,
            'payment_method' => $paymentMethod,
        ]);
        $error = public_error_message($exception);
    }
}

ob_start();
?>
<section class="hero">

    <h1>使用支付宝或USDT购买积分</h1>
</section>

<?php if ($error): ?>
    <div class="alert"><?= e($error) ?></div>
<?php endif; ?>

<form class="pay-form" method="post" action="/">
    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">

    <label class="field">
        <span>Telegram 用户名</span>
        <input name="username" value="<?= e($username) ?>" placeholder="@username" required maxlength="191">
        <small>用户需要先打开一次对应的 Telegram Mini App，系统才能正确充值到账户。</small>
    </label>

    <div class="package-grid">
        <?php foreach (payment_packages() as $index => $package): ?>
            <?php $checked = $selectedPackage === $package['code'] || ($selectedPackage === '' && $index === 0); ?>
            <label class="package-card">
                <input type="radio" name="package_code" value="<?= e($package['code']) ?>" <?= $checked ? 'checked' : '' ?>>
                <strong><?= e($package['title']) ?></strong>
                <span><?= e($package['description']) ?></span>
                <b><?= e($package['pay_amount']) ?> <?= e($package['pay_currency']) ?></b>
            </label>
        <?php endforeach; ?>
    </div>

    <div class="payment-methods">
        <?php foreach ($availablePaymentMethods as $method => $label): ?>
            <label><input type="radio" name="payment_method" value="<?= e($method) ?>" <?= $paymentMethod === $method ? 'checked' : '' ?>> <?= e($label) ?></label>
        <?php endforeach; ?>
    </div>

    <?php if (!$availablePaymentMethods): ?>
        <p class="notice">当前没有启用的支付方式，请稍后再试。</p>
    <?php endif; ?>

    <button class="primary-button" type="submit" <?= !$availablePaymentMethods ? 'disabled' : '' ?>>确认账号并前往支付</button>
</form>
<?php

render_page('积分充值', ob_get_clean());
