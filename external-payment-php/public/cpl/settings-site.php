<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_boot.php';
require_admin();
$message = $error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $appName = trim((string) ($_POST['app_name'] ?? ''));
        if ($appName === '') {
            throw new RuntimeException('站点名称不能为空');
        }
        $baseUrl = rtrim(trim((string) ($_POST['base_url'] ?? '')), '/');
        $orderExpireMinutes = max(5, min(1440, (int) ($_POST['order_expire_minutes'] ?? 30)));
        assert_https_url('支付站域名', $baseUrl, false);
        save_settings([
            'app_name' => $appName,
            'base_url' => $baseUrl,
            'order_expire_minutes' => $orderExpireMinutes,
        ]);
        audit_admin_action('update_site_settings', null);
        $message = '站点设置已保存';
    } catch (Throwable $exception) { $error = $exception->getMessage(); }
}
ob_start(); echo admin_page_header('站点设置', 'site');
?>
<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>
<form class="settings-form" method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<label class="field"><span>站点名称</span><input name="app_name" value="<?= e(setting('app_name', 'TG Video Pay')) ?>" required></label>
<label class="field"><span>支付站域名</span><input name="base_url" value="<?= e(setting('base_url', '')) ?>" placeholder="https://pay.example.com"></label>
<label class="field"><span>订单过期分钟</span><input name="order_expire_minutes" type="number" min="5" max="1440" value="<?= e(setting('order_expire_minutes', '30')) ?>"></label>
<button class="primary-button" type="submit">保存站点设置</button></form>
<?php render_page('站点设置', ob_get_clean());
