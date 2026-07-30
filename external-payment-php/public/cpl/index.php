<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/_boot.php';

require_admin();

$message = $error = null;
$status = (string) ($_GET['status'] ?? '');
$q = trim((string) ($_GET['q'] ?? ''));

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    try {
        assert_csrf();
        $action = (string) ($_POST['action'] ?? '');
        if ($action === 'delete_selected') {
            $selected = $_POST['order_nos'] ?? [];
            if (!is_array($selected)) {
                throw new RuntimeException('请选择要删除的订单');
            }
            $deleted = delete_orders($selected);
            if ($deleted === 0) {
                throw new RuntimeException('请选择要删除的订单');
            }
            audit_admin_action('delete_orders', null, ['count' => $deleted]);
            $message = '已删除 ' . $deleted . ' 条订单。';
        }
    } catch (Throwable $exception) {
        $error = $exception->getMessage();
    }
}

$perPage = 20;
$totalOrders = count_orders($status, $q);
$totalPages = max(1, (int) ceil($totalOrders / $perPage));
$page = max(1, min($totalPages, (int) ($_GET['page'] ?? 1)));
$orders = list_orders($status, $q, $perPage, ($page - 1) * $perPage);

function orders_page_url(int $targetPage, string $status, string $q): string
{
    return '/cpl/?' . http_build_query(array_filter([
        'status' => $status,
        'q' => $q,
        'page' => $targetPage,
    ], static fn (mixed $value): bool => $value !== ''));
}

ob_start();
?>
<?= admin_page_header('充值订单', 'orders') ?>

<?php if ($message): ?><div class="success"><?= e($message) ?></div><?php endif; ?>
<?php if ($error): ?><div class="alert"><?= e($error) ?></div><?php endif; ?>

<form class="filter-form" method="get" action="/cpl/">
    <input name="q" value="<?= e($q) ?>" placeholder="订单号 / 用户名 / 流水号">
    <select name="status">
        <option value="">全部状态</option>
        <?php foreach (['PENDING', 'PAID', 'CREDITED', 'PAYMENT_FAILED', 'CREDIT_FAILED', 'CANCELED', 'EXPIRED'] as $item): ?>
            <option value="<?= e($item) ?>" <?= $status === $item ? 'selected' : '' ?>><?= e(status_label($item)) ?></option>
        <?php endforeach; ?>
    </select>
    <button class="secondary-button" type="submit">筛选</button>
</form>

<form method="post" action="/cpl/" data-confirm="确定删除选中的订单？删除后不可恢复。">
<input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<input type="hidden" name="status" value="<?= e($status) ?>">
<input type="hidden" name="q" value="<?= e($q) ?>">
<div class="bulk-actions">
    <button class="danger-button" name="action" value="delete_selected" type="submit">删除选中订单</button>
</div>
<div class="order-table">
    <table>
        <thead>
            <tr>
                <th>选择</th>
                <th>订单</th>
                <th>用户</th>
                <th>套餐</th>
                <th>金额</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($orders as $order): ?>
                <tr>
                    <td><input type="checkbox" name="order_nos[]" value="<?= e($order['order_no']) ?>"></td>
                    <td>
                        <strong><?= e($order['order_no']) ?></strong>
                        <small><?= e($order['provider_trade_no'] ?: '-') ?></small>
                    </td>
                    <td>
                        <?= e($order['display_name']) ?>
                        <small>@<?= e($order['telegram_username'] ?: $order['username_normalized']) ?></small>
                    </td>
                    <td><?= e($order['package_title']) ?><small><?= e((string) $order['credits_amount']) ?>积分</small></td>
                    <td><?= e($order['pay_amount']) ?> <?= e($order['pay_currency']) ?><small><?= ($order['payment_method'] ?? 'alipay') === 'usdt' ? 'USDT' : '支付宝' ?></small></td>
                    <td><?= e(status_label($order['status'])) ?></td>
                    <td><?= e($order['created_at']) ?><small><?= e($order['credited_at'] ?: '') ?></small></td>
                    <td>
                        <div class="row-actions">
                            <a class="secondary-link" href="/cpl/order.php?order_no=<?= urlencode($order['order_no']) ?>">详情</a>
                            <a class="secondary-link" href="/order.php?order_no=<?= urlencode($order['order_no']) ?>">前台</a>
                        </div>
                    </td>
                </tr>
            <?php endforeach; ?>
            <?php if (!$orders): ?>
                <tr><td colspan="8">暂无订单</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>
</form>

<nav class="pagination" aria-label="订单分页">
    <span>共 <?= e($totalOrders) ?> 条，第 <?= e($page) ?> / <?= e($totalPages) ?> 页</span>
    <div>
        <?php if ($page > 1): ?>
            <a href="<?= e(orders_page_url($page - 1, $status, $q)) ?>">上一页</a>
        <?php else: ?>
            <span class="disabled">上一页</span>
        <?php endif; ?>
        <?php if ($page < $totalPages): ?>
            <a href="<?= e(orders_page_url($page + 1, $status, $q)) ?>">下一页</a>
        <?php else: ?>
            <span class="disabled">下一页</span>
        <?php endif; ?>
    </div>
</nav>
<?php

render_page('充值后台', ob_get_clean());
