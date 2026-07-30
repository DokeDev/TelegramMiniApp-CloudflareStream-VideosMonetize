<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_boot.php';
require_admin();
$message = $error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $apiUrl = trim((string) ($_POST['epay_api_url'] ?? ''));
        assert_https_url('易支付接口地址', $apiUrl, false);
        $values = [
            'epay_api_url' => $apiUrl,
            'epay_merchant_pid' => trim((string) ($_POST['epay_merchant_pid'] ?? '')),
            'epay_alipay_enabled' => isset($_POST['epay_alipay_enabled']) ? '1' : '0',
            'epay_usdt_enabled' => isset($_POST['epay_usdt_enabled']) ? '1' : '0',
        ];
        $key = trim((string) ($_POST['epay_merchant_key'] ?? ''));
        if (preg_match('/[\r\n]/', $key)) {
            throw new RuntimeException('商户密钥不能包含换行');
        }
        if ($key !== '') {
            $values['epay_merchant_key'] = $key;
        }
        save_settings($values);
        audit_admin_action('update_epay_settings', null);
        $message = '易支付设置已保存';
    } catch (Throwable $exception) { $error = $exception->getMessage(); }
}
ob_start(); echo admin_page_header('易支付', 'epay');
?>
<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>
<form class="settings-form" method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<h2>公共设置</h2>
<label class="field"><span>接口地址</span><input name="epay_api_url" value="<?= e(setting('epay_api_url', '')) ?>" placeholder="https://bbs.example.com/source/plugin/keke_pay/submit.php"><small>对接 keke_pay 时填写“下游网关完整地址”，通常以 /source/plugin/keke_pay/submit.php 结尾。</small></label>
<p class="notice">当前实际提交地址：<?= e(epay_submit_url((string) setting('epay_api_url', '')) ?: '-') ?></p>
<label class="field"><span>商户 ID</span><input name="epay_merchant_pid" value="<?= e(epay_merchant_pid()) ?>" placeholder="keke_pay 下游商户 PID"></label>
<label class="field"><span>商户密钥</span><input name="epay_merchant_key" type="password" value="" autocomplete="new-password" spellcheck="false" placeholder="留空表示不修改"><small>当前：<?= epay_merchant_key() !== '' ? '已设置' : '未设置' ?></small></label>

<h2>支付方式</h2>
<div class="toggle-list">
    <label><input type="checkbox" name="epay_alipay_enabled" value="1" <?= payment_method_enabled('alipay') ? 'checked' : '' ?>> 启用支付宝</label>
    <label><input type="checkbox" name="epay_usdt_enabled" value="1" <?= payment_method_enabled('usdt') ? 'checked' : '' ?>> 启用 USDT <small>keke_pay 中该通道实际使用 wxpay 类型，上游已改为 USDT。</small></label>
</div>
<button class="primary-button" type="submit">保存易支付设置</button></form>
<?php render_page('易支付', ob_get_clean());
