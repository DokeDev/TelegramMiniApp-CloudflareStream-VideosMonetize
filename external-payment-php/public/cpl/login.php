<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

if (admin_is_logged_in()) {
    redirect_to('/cpl/');
}

$error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $username = (string) ($_POST['username'] ?? '');
        $password = (string) ($_POST['password'] ?? '');

        if (admin_login($username, $password)) {
            redirect_to('/cpl/');
        }

        $error = '用户名或密码错误';
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

ob_start();
?>
<section class="order-panel">
    <p class="eyebrow">Control Panel</p>
    <h1>独立支付后台</h1>
    <p class="muted">连续输错会临时锁定当前登录来源。</p>
    <?php if ($error): ?>
        <div class="alert"><?= e($error) ?></div>
    <?php endif; ?>
    <form class="pay-form" method="post" action="/cpl/login.php">
        <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
        <label class="field">
            <span>用户名</span>
            <input name="username" autocomplete="username" required>
        </label>
        <label class="field">
            <span>密码</span>
            <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button class="primary-button" type="submit">登录</button>
    </form>
</section>
<?php

render_page('后台登录', ob_get_clean());
