<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/_boot.php';
require_admin();
$message = $error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $apiBaseUrl = rtrim(trim((string) ($_POST['project_api_base_url'] ?? '')), '/');
        assert_https_url('主项目 API 地址', $apiBaseUrl, false);
        $values = [
            'project_api_base_url' => $apiBaseUrl,
            'project_timeout_seconds' => max(2, min(15, (int) ($_POST['project_timeout_seconds'] ?? 6))),
        ];
        $secret = trim((string) ($_POST['project_external_recharge_secret'] ?? ''));
        if (preg_match('/[\r\n]/', $secret)) {
            throw new RuntimeException('充值密钥不能包含换行');
        }
        if ($secret !== '') { $values['project_external_recharge_secret'] = $secret; }
        save_settings($values);
        audit_admin_action('update_project_settings', null);
        $message = '主项目接口设置已保存';
    } catch (Throwable $exception) { $error = $exception->getMessage(); }
}
ob_start(); echo admin_page_header('主项目接口', 'project');
?>
<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>
<form class="settings-form" method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<label class="field"><span>API 地址</span><input name="project_api_base_url" value="<?= e(setting('project_api_base_url', '')) ?>"></label>
<label class="field"><span>充值密钥</span><input name="project_external_recharge_secret" type="password" value="" autocomplete="new-password" spellcheck="false" placeholder="留空表示不修改"><small>当前：<?= setting('project_external_recharge_secret', '') !== '' ? '已设置' : '未设置' ?></small></label>
<label class="field"><span>超时秒数</span><input name="project_timeout_seconds" type="number" min="2" max="15" value="<?= e(setting('project_timeout_seconds', '6')) ?>"><small>推荐 6 秒。主项目正常应在 1 秒内返回，最多不建议超过 10 秒。</small></label>
<button class="primary-button" type="submit">保存接口设置</button></form>
<?php render_page('主项目接口', ob_get_clean());
