<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

require_admin();

$message = $error = null;
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        if (($_POST['action'] ?? '') === 'clear_logs') {
            clear_payment_logs();
            audit_admin_action('clear_payment_logs', null);
            $message = '支付日志已清空。';
        }
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$logs = recent_payment_logs(120);

function admin_log_context(array $entry): string
{
    $context = $entry['context'] ?? [];
    if (!is_array($context)) {
        return (string) $context;
    }

    return json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) ?: '-';
}

ob_start();
?>
<?= admin_page_header('支付日志', 'logs') ?>

<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>

<p class="notice">这里只显示最近 120 条支付/到账异常日志。日志文件位于项目内 <code>storage/logs/payment-failures.log</code>，请不要放到公网根目录。</p>

<form method="post" action="/cpl/logs.php" data-confirm="确定清空支付日志？此操作不可恢复。">
    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
    <button class="danger-button" name="action" value="clear_logs" type="submit">清空日志</button>
</form>

<div class="order-table">
    <table>
        <thead>
            <tr>
                <th>时间</th>
                <th>原因</th>
                <th>IP</th>
                <th>上下文</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($logs as $entry): ?>
                <tr>
                    <td><?= e((string) ($entry['time'] ?? '-')) ?></td>
                    <td><strong><?= e((string) ($entry['reason'] ?? '-')) ?></strong></td>
                    <td><?= e((string) ($entry['ip'] ?? '-')) ?><small><?= e((string) ($entry['user_agent'] ?? '')) ?></small></td>
                    <td><pre class="inline-pre"><?= e(admin_log_context($entry)) ?></pre></td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$logs): ?>
                <tr><td colspan="4">暂无异常日志</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php render_page('支付日志', ob_get_clean());
