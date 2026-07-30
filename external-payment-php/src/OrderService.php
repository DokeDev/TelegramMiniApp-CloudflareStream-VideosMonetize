<?php

declare(strict_types=1);

function create_recharge_order(string $username, string $packageCode, string $paymentMethod): array
{
    $package = package_by_code($packageCode);
    if (!$package) {
        throw new InvalidArgumentException('请选择有效的充值套餐');
    }

    $normalized = normalize_username($username);
    if ($normalized === '') {
        throw new InvalidArgumentException('请输入 Telegram 用户名');
    }

    if (!in_array($paymentMethod, ['alipay', 'usdt'], true)) {
        throw new InvalidArgumentException('请选择有效的支付方式');
    }
    assert_payment_method_enabled($paymentMethod);

    $user = lookup_project_user($normalized);
    if (empty($user['telegramUserId'])) {
        throw new RuntimeException('未找到该用户名，请先打开一次 Mini App 完成账号识别');
    }

    $orderNo = random_order_no();
    $provider = active_provider();

    $stmt = db()->prepare(
        'INSERT INTO recharge_orders (
            order_no, username_input, username_normalized, telegram_user_id,
            telegram_username, display_name, package_code, package_title,
            pay_amount, pay_currency, credits_amount, provider, payment_method, expires_at
        ) VALUES (
            :order_no, :username_input, :username_normalized, :telegram_user_id,
            :telegram_username, :display_name, :package_code, :package_title,
            :pay_amount, :pay_currency, :credits_amount, :provider, :payment_method, :expires_at
        )'
    );

    $stmt->execute([
        ':order_no' => $orderNo,
        ':username_input' => $username,
        ':username_normalized' => $normalized,
        ':telegram_user_id' => (string) $user['telegramUserId'],
        ':telegram_username' => $user['username'] ?? null,
        ':display_name' => $user['displayName'] ?? ('@' . $normalized),
        ':package_code' => $package['code'],
        ':package_title' => $package['title'],
        ':pay_amount' => $package['pay_amount'],
        ':pay_currency' => $package['pay_currency'],
        ':credits_amount' => (int) $package['credits_amount'],
        ':provider' => $provider,
        ':payment_method' => $paymentMethod,
        ':expires_at' => date('Y-m-d H:i:s', time() + max(5, (int) setting('order_expire_minutes', '30')) * 60),
    ]);

    return find_order($orderNo);
}

function find_order(string $orderNo): array
{
    expire_pending_orders();
    $stmt = db()->prepare('SELECT * FROM recharge_orders WHERE order_no = :order_no LIMIT 1');
    $stmt->execute([':order_no' => $orderNo]);
    $order = $stmt->fetch();

    if (!$order) {
        throw new RuntimeException('订单不存在');
    }

    return $order;
}

function expire_pending_orders(): void
{
    db()->exec('UPDATE recharge_orders SET status = "EXPIRED", failure_reason = "订单已过期" WHERE status = "PENDING" AND expires_at <= NOW()');
}

function order_filters(string $status = '', string $q = ''): array
{
    $where = [];
    $params = [];

    if ($status !== '') {
        $where[] = 'status = :status';
        $params[':status'] = $status;
    }

    if ($q !== '') {
        $where[] = '(order_no LIKE :q OR username_input LIKE :q OR telegram_username LIKE :q OR provider_trade_no LIKE :q)';
        $params[':q'] = '%' . $q . '%';
    }

    return [$where, $params];
}

function count_orders(string $status = '', string $q = ''): int
{
    [$where, $params] = order_filters($status, $q);
    $sql = 'SELECT COUNT(*) FROM recharge_orders';
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

function list_orders(string $status = '', string $q = '', int $limit = 20, int $offset = 0): array
{
    [$where, $params] = order_filters($status, $q);
    $sql = 'SELECT * FROM recharge_orders';
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY id DESC LIMIT :limit';
    $sql .= ' OFFSET :offset';

    $stmt = db()->prepare($sql);
    foreach ($params as $name => $value) {
        $stmt->bindValue($name, $value);
    }
    $stmt->bindValue(':limit', max(1, min(500, $limit)), PDO::PARAM_INT);
    $stmt->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll();
}

function apply_paid_callback(array $payload): array
{
    $orderNo = trim((string) ($payload['order_no'] ?? ''));
    $tradeNo = trim((string) ($payload['trade_no'] ?? ''));
    $status = strtolower(trim((string) ($payload['status'] ?? '')));
    $amount = (string) ($payload['amount'] ?? '');

    if ($orderNo === '' || $tradeNo === '') {
        throw new InvalidArgumentException('缺少订单号或支付流水号');
    }

    $order = find_order($orderNo);
    if (($order['provider'] ?? '') !== active_provider()) {
        throw new RuntimeException('回调渠道与订单渠道不一致');
    }

    if (in_array($order['status'], ['CREDITED', 'CANCELED'], true)) {
        return $order;
    }

    if (decimal_to_minor_units((string) $order['pay_amount']) !== decimal_to_minor_units($amount)) {
        mark_payment_failed($orderNo, '支付金额不匹配', $payload);
        throw new RuntimeException('支付金额不匹配');
    }

    if (!in_array($status, ['paid', 'success', 'completed', 'trade_success'], true)) {
        mark_payment_failed($orderNo, '支付状态不是成功', $payload);
        return find_order($orderNo);
    }

    mark_order_paid($orderNo, $tradeNo, $payload);

    return credit_order_to_project($orderNo, $tradeNo);
}

function mark_order_paid(string $orderNo, string $tradeNo, array $payload = []): array
{
    $stmt = db()->prepare(
        'UPDATE recharge_orders
         SET status = "PAID", provider_trade_no = :trade_no, provider_payload = :payload, paid_at = COALESCE(paid_at, NOW())
         WHERE order_no = :order_no AND status IN ("PENDING", "PAID", "PAYMENT_FAILED", "CREDIT_FAILED", "EXPIRED")'
    );
    $stmt->execute([
        ':trade_no' => $tradeNo,
        ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':order_no' => $orderNo,
    ]);

    return find_order($orderNo);
}

function credit_order_to_project(string $orderNo, ?string $tradeNo = null): array
{
    $order = find_order($orderNo);
    if ($order['status'] === 'CREDITED') {
        return $order;
    }

    if (!in_array($order['status'], ['PAID', 'CREDIT_FAILED'], true)) {
        throw new RuntimeException('订单尚未支付，不能到账');
    }

    try {
        $projectResponse = credit_project_user($order, $tradeNo ?: ($order['provider_trade_no'] ?: $orderNo));
    } catch (Throwable $exception) {
        mark_credit_failed($orderNo, $exception->getMessage());
        throw $exception;
    }

    $stmt = db()->prepare(
        'UPDATE recharge_orders
         SET status = "CREDITED", project_request_id = :request_id, project_response = :response, failure_reason = NULL, credited_at = NOW()
         WHERE order_no = :order_no'
    );
    $stmt->execute([
        ':request_id' => $orderNo,
        ':response' => json_encode($projectResponse, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':order_no' => $orderNo,
    ]);

    return find_order($orderNo);
}

function cancel_order(string $orderNo): array
{
    $stmt = db()->prepare(
        'UPDATE recharge_orders
         SET status = "CANCELED"
         WHERE order_no = :order_no AND status = "PENDING"'
    );
    $stmt->execute([':order_no' => $orderNo]);

    return find_order($orderNo);
}

function delete_order(string $orderNo): void
{
    $stmt = db()->prepare('DELETE FROM recharge_orders WHERE order_no = :order_no');
    $stmt->execute([':order_no' => $orderNo]);
}

function delete_orders(array $orderNos): int
{
    $orderNos = array_values(array_unique(array_filter(array_map(
        static fn (mixed $orderNo): string => trim((string) $orderNo),
        $orderNos
    ))));

    if (!$orderNos) {
        return 0;
    }

    $placeholders = [];
    $params = [];
    foreach ($orderNos as $index => $orderNo) {
        $name = ':order_no_' . $index;
        $placeholders[] = $name;
        $params[$name] = $orderNo;
    }

    $stmt = db()->prepare('DELETE FROM recharge_orders WHERE order_no IN (' . implode(',', $placeholders) . ')');
    $stmt->execute($params);

    return $stmt->rowCount();
}

function mark_payment_failed(string $orderNo, string $reason, array $payload): void
{
    log_payment_failure('payment_failed', [
        'order_no' => $orderNo,
        'reason' => $reason,
        'payload' => $payload,
    ]);

    $stmt = db()->prepare(
        'UPDATE recharge_orders
         SET status = "PAYMENT_FAILED", failure_reason = :reason, provider_payload = :payload
         WHERE order_no = :order_no AND status IN ("PENDING", "PAYMENT_FAILED")'
    );
    $stmt->execute([
        ':reason' => $reason,
        ':payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':order_no' => $orderNo,
    ]);
}

function mark_credit_failed(string $orderNo, string $reason): void
{
    log_payment_failure('credit_failed', [
        'order_no' => $orderNo,
        'reason' => $reason,
    ]);

    $stmt = db()->prepare(
        'UPDATE recharge_orders SET status = "CREDIT_FAILED", failure_reason = :reason
         WHERE order_no = :order_no AND status IN ("PAID", "CREDIT_FAILED")'
    );
    $stmt->execute([':reason' => mb_substr($reason, 0, 255), ':order_no' => $orderNo]);
}

function audit_admin_action(string $action, ?string $orderNo, array $details = []): void
{
    $stmt = db()->prepare(
        'INSERT INTO admin_audit_logs (admin_username, action, order_no, details, ip_address)
         VALUES (:admin_username, :action, :order_no, :details, :ip_address)'
    );
    $stmt->execute([
        ':admin_username' => (string) ($_SESSION['admin_username'] ?? 'unknown'),
        ':action' => $action,
        ':order_no' => $orderNo,
        ':details' => json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':ip_address' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    ]);
}
