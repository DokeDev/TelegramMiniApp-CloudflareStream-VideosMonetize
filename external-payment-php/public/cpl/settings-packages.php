<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_boot.php';
require_admin();
$message = $error = null;
$packages = payment_packages();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $rows = $_POST['packages'] ?? [];
        if (!is_array($rows)) { throw new RuntimeException('套餐数据格式错误'); }
        $packages = [];
        $codes = [];
        foreach ($rows as $row) {
            if (!is_array($row) || trim((string) ($row['code'] ?? '')) === '') { continue; }
            $code = trim((string) $row['code']);
            if (!preg_match('/^[a-zA-Z0-9_-]{2,64}$/', $code)) {
                throw new RuntimeException('套餐代码只能使用 2-64 位字母、数字、下划线或横线');
            }
            if (isset($codes[$code])) {
                throw new RuntimeException('套餐代码不能重复：' . $code);
            }
            $codes[$code] = true;
            $amount = trim((string) ($row['pay_amount'] ?? ''));
            decimal_to_minor_units($amount);
            $credits = (int) ($row['credits_amount'] ?? 0);
            if ($credits <= 0) { throw new RuntimeException('套餐积分必须大于 0'); }
            $packages[] = [
                'code' => $code,
                'title' => trim((string) ($row['title'] ?? '')),
                'description' => trim((string) ($row['description'] ?? '')),
                'pay_amount' => $amount,
                'pay_currency' => 'CNY',
                'credits_amount' => $credits,
            ];
        }
        if (!$packages) { throw new RuntimeException('至少保留一个充值套餐'); }
        save_settings(['packages_json' => json_encode($packages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        audit_admin_action('update_packages', null, ['count' => count($packages)]);
        $message = '充值套餐已保存';
    } catch (Throwable $exception) { $error = $exception->getMessage(); }
}
while (count($packages) < 5) { $packages[] = ['code' => '', 'title' => '', 'description' => '', 'pay_amount' => '', 'credits_amount' => '']; }
ob_start(); echo admin_page_header('充值套餐', 'packages');
?>
<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>
<form class="settings-form" method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<p class="notice">留空套餐代码即可停用该行。当前支付币种固定为人民币 CNY。</p>
<div class="package-editor">
<?php foreach ($packages as $index => $package): ?>
<fieldset><legend>套餐 <?= $index + 1 ?></legend>
<label class="field"><span>套餐代码</span><input name="packages[<?= $index ?>][code]" value="<?= e($package['code'] ?? '') ?>"></label>
<label class="field"><span>显示标题</span><input name="packages[<?= $index ?>][title]" value="<?= e($package['title'] ?? '') ?>"></label>
<label class="field"><span>描述</span><input name="packages[<?= $index ?>][description]" value="<?= e($package['description'] ?? '') ?>"></label>
<label class="field"><span>支付金额（元）</span><input name="packages[<?= $index ?>][pay_amount]" value="<?= e($package['pay_amount'] ?? '') ?>"></label>
<label class="field"><span>到账积分</span><input type="number" min="1" name="packages[<?= $index ?>][credits_amount]" value="<?= e($package['credits_amount'] ?? '') ?>"></label>
</fieldset>
<?php endforeach; ?>
</div><button class="primary-button" type="submit">保存充值套餐</button></form>
<?php render_page('充值套餐', ob_get_clean());
