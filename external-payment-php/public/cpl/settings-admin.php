<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

require_admin();

$message = $error = null;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();

        $username = trim((string) ($_POST['admin_username'] ?? ''));
        $password = (string) ($_POST['admin_password'] ?? '');
        $passwordConfirm = (string) ($_POST['admin_password_confirm'] ?? '');
        $maxAttempts = (int) ($_POST['admin_login_max_attempts'] ?? 6);
        $windowMinutes = (int) ($_POST['admin_login_window_minutes'] ?? 10);
        $lockMinutes = (int) ($_POST['admin_login_lock_minutes'] ?? 15);

        if ($username === '') {
            throw new RuntimeException('管理员用户名不能为空');
        }

        if ($maxAttempts < 3 || $maxAttempts > 20) {
            throw new RuntimeException('失败次数限制应在 3 到 20 之间');
        }

        if ($windowMinutes < 1 || $windowMinutes > 1440) {
            throw new RuntimeException('统计窗口应在 1 到 1440 分钟之间');
        }

        if ($lockMinutes < 1 || $lockMinutes > 1440) {
            throw new RuntimeException('锁定时长应在 1 到 1440 分钟之间');
        }

        $values = [
            'admin_username' => $username,
            'admin_login_max_attempts' => (string) $maxAttempts,
            'admin_login_window_minutes' => (string) $windowMinutes,
            'admin_login_lock_minutes' => (string) $lockMinutes,
        ];

        if ($password !== '') {
            if (mb_strlen($password) < 12) {
                throw new RuntimeException('管理员密码至少 12 位');
            }

            if (!hash_equals($password, $passwordConfirm)) {
                throw new RuntimeException('两次输入的管理员密码不一致');
            }

            $values['admin_password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        }

        save_settings($values);
        $_SESSION['admin_username'] = $username;
        audit_admin_action('update_admin_settings', null, [
            'username' => $username,
            'passwordChanged' => $password !== '',
            'loginLimit' => [
                'maxAttempts' => $maxAttempts,
                'windowMinutes' => $windowMinutes,
                'lockMinutes' => $lockMinutes,
            ],
        ]);
        $message = '管理员设置已保存';
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

ob_start();
echo admin_page_header('管理员设置', 'admin');
?>
<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>

<form class="settings-form" method="post">
    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
    <label class="field">
        <span>管理员用户名</span>
        <input name="admin_username" value="<?= e(setting('admin_username', 'admin')) ?>" required maxlength="191">
    </label>
    <label class="field">
        <span>新密码</span>
        <input name="admin_password" type="password" autocomplete="new-password" placeholder="留空表示不修改">
        <small>至少 12 位。上线后不要继续使用默认密码。</small>
    </label>
    <label class="field">
        <span>确认新密码</span>
        <input name="admin_password_confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码">
    </label>
    <label class="field">
        <span>登录失败次数</span>
        <input name="admin_login_max_attempts" type="number" min="3" max="20" value="<?= e(setting('admin_login_max_attempts', '6')) ?>">
        <small>同一 IP 和用户名在统计窗口内输错达到该次数后锁定。</small>
    </label>
    <label class="field">
        <span>统计窗口分钟</span>
        <input name="admin_login_window_minutes" type="number" min="1" max="1440" value="<?= e(setting('admin_login_window_minutes', '10')) ?>">
    </label>
    <label class="field">
        <span>锁定时长分钟</span>
        <input name="admin_login_lock_minutes" type="number" min="1" max="1440" value="<?= e(setting('admin_login_lock_minutes', '15')) ?>">
    </label>
    <button class="primary-button" type="submit">保存管理员设置</button>
</form>
<?php

render_page('管理员设置', ob_get_clean());
