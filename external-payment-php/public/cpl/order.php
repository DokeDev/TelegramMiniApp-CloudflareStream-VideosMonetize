<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

require_admin();

$message = null;
$error = null;
$orderNo = (string) ($_POST['order_no'] ?? $_GET['order_no'] ?? '');

function admin_pretty_json(mixed $value): string
{
    if ($value === null || $value === '') {
        return '-';
    }

    if (is_string($value)) {
        $decoded = json_decode($value, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $value = $decoded;
        }
    }

    if (is_array($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) ?: '-';
    }

    return (string) $value;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $action = (string) ($_POST['action'] ?? '');

        if ($action === 'mark_paid') {
            if (($_POST['confirm_manual_payment'] ?? '') !== 'yes') {
                throw new RuntimeException('请先确认已经核对真实收款记录');
            }
            mark_order_paid($orderNo, 'manual-' . $orderNo . '-' . date('YmdHis'), ['source' => 'admin', 'action' => 'mark_paid']);
            audit_admin_action('mark_paid', $orderNo, ['confirmed' => true]);
            $message = '已标记为已支付，可以继续点击“重新通知主项目”。';
        } elseif ($action === 'retry_credit') {
            credit_order_to_project($orderNo);
            audit_admin_action('retry_credit', $orderNo);
            $message = '已重新通知主项目，积分到账。';
        } elseif ($action === 'cancel') {
            cancel_order($orderNo);
            audit_admin_action('cancel', $orderNo);
            $message = '订单已取消。';
        } elseif ($action === 'delete') {
            delete_order($orderNo);
            audit_admin_action('delete_order', $orderNo);
            redirect_to('/cpl/');
        }
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

try {
    $order = find_order($orderNo);
} catch (Throwable $exception) {
    $order = null;
    $error = $error ?: $exception->getMessage();
}

ob_start();
?>
<?= admin_page_header('订单详情', 'orders') ?>

<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>

<?php if ($order): ?>
    <section class="order-detail-panel">
        <div class="section-heading">
            <div>
                <p class="eyebrow">Order</p>
                <h2><?= e($order['order_no']) ?></h2>
            </div>
            <a class="secondary-link" href="/order.php?order_no=<?= urlencode($order['order_no']) ?>">打开前台订单页</a>
        </div>

        <dl class="detail-list">
            <div><dt>状态</dt><dd><?= e(status_label($order['status'])) ?></dd></div>
            <div><dt>支付方式</dt><dd><?= ($order['payment_method'] ?? 'alipay') === 'usdt' ? 'USDT' : '支付宝' ?></dd></div>
            <div><dt>用户</dt><dd><?= e($order['display_name']) ?> / @<?= e($order['telegram_username'] ?: $order['username_normalized']) ?></dd></div>
            <div><dt>TG ID</dt><dd><?= e($order['telegram_user_id']) ?></dd></div>
            <div><dt>套餐</dt><dd><?= e($order['package_title']) ?>，<?= e((string) $order['credits_amount']) ?> 积分</dd></div>
            <div><dt>金额</dt><dd><?= e($order['pay_amount']) ?> <?= e($order['pay_currency']) ?></dd></div>
            <div><dt>支付流水</dt><dd><?= e($order['provider_trade_no'] ?: '-') ?></dd></div>
            <div><dt>失败原因</dt><dd><?= e($order['failure_reason'] ?: '-') ?></dd></div>
            <div><dt>创建时间</dt><dd><?= e($order['created_at']) ?></dd></div>
            <div><dt>支付时间</dt><dd><?= e($order['paid_at'] ?: '-') ?></dd></div>
            <div><dt>到账时间</dt><dd><?= e($order['credited_at'] ?: '-') ?></dd></div>
            <div><dt>过期时间</dt><dd><?= e($order['expires_at']) ?></dd></div>
        </dl>

        <div class="detail-actions">
            <?php if ($order['status'] === 'PENDING'): ?>
                <form method="post" action="/cpl/order.php">
                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                    <input type="hidden" name="order_no" value="<?= e($order['order_no']) ?>">
                    <label><input type="checkbox" name="confirm_manual_payment" value="yes"> 已核对真实收款记录</label>
                    <button class="secondary-button" name="action" value="mark_paid" type="submit">手动标记已支付</button>
                    <button class="secondary-button" name="action" value="cancel" type="submit">取消订单</button>
                </form>
            <?php endif; ?>

            <?php if (in_array($order['status'], ['PAID', 'CREDIT_FAILED'], true)): ?>
                <form method="post" action="/cpl/order.php" data-confirm="确定重新通知主项目为该用户增加积分？系统会使用订单号作为幂等请求ID。">
                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                    <input type="hidden" name="order_no" value="<?= e($order['order_no']) ?>">
                    <button class="primary-button" name="action" value="retry_credit" type="submit">重新通知主项目</button>
                </form>
            <?php endif; ?>

            <form method="post" action="/cpl/order.php" data-confirm="确定删除此订单？删除后不可恢复。已支付订单只会删除本支付站记录，不会扣减 Mini App 积分。">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                <input type="hidden" name="order_no" value="<?= e($order['order_no']) ?>">
                <button class="danger-button" name="action" value="delete" type="submit">删除订单</button>
            </form>
        </div>
    </section>

    <section class="order-debug-grid">
        <article>
            <h2>支付回调原文</h2>
            <pre><?= e(admin_pretty_json($order['provider_payload'])) ?></pre>
        </article>
        <article>
            <h2>主项目到账响应</h2>
            <pre><?= e(admin_pretty_json($order['project_response'])) ?></pre>
        </article>
    </section>
<?php else: ?>
    <p class="notice">未找到订单。</p>
<?php endif; ?>

<?php render_page('订单详情', ob_get_clean());
