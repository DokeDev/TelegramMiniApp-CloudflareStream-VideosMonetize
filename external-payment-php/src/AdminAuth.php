<?php

declare(strict_types=1);

function admin_is_logged_in(): bool
{
    return !empty($_SESSION['admin_logged_in']);
}

function require_admin(): void
{
    if (!admin_is_logged_in()) {
        redirect_to('/cpl/login.php');
    }
}

function admin_login_client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64);
}

function admin_login_identity_hash(string $username): string
{
    return hash('sha256', admin_login_client_ip() . '|' . normalize_username($username));
}

function admin_login_limit_setting(string $key, int $default, int $min, int $max): int
{
    $value = (int) setting($key, (string) $default);
    return min($max, max($min, $value));
}

function admin_login_throttle_status(string $username): array
{
    $maxAttempts = admin_login_limit_setting('admin_login_max_attempts', 6, 3, 20);
    $windowMinutes = admin_login_limit_setting('admin_login_window_minutes', 10, 1, 1440);
    $lockMinutes = admin_login_limit_setting('admin_login_lock_minutes', 15, 1, 1440);
    $identityHash = admin_login_identity_hash($username);

    $pruneCutoff = date('Y-m-d H:i:s', time() - 86400 * 7);
    db()->prepare('DELETE FROM admin_login_attempts WHERE created_at < :cutoff')->execute([':cutoff' => $pruneCutoff]);

    $stmt = db()->prepare(
        'SELECT created_at
         FROM admin_login_attempts
         WHERE identity_hash = :identity_hash AND success = 0 AND failure_reason = :failure_reason
         ORDER BY created_at DESC
         LIMIT ' . $maxAttempts
    );
    $stmt->execute([
        ':identity_hash' => $identityHash,
        ':failure_reason' => 'invalid_credentials',
    ]);
    $failures = $stmt->fetchAll();

    if (count($failures) < $maxAttempts) {
        return ['locked' => false, 'remaining_seconds' => 0];
    }

    $latestFailureAt = strtotime((string) $failures[0]['created_at']);
    $oldestThresholdFailureAt = strtotime((string) $failures[$maxAttempts - 1]['created_at']);
    if ($latestFailureAt === false || $oldestThresholdFailureAt === false) {
        return ['locked' => false, 'remaining_seconds' => 0];
    }

    if ($oldestThresholdFailureAt < time() - $windowMinutes * 60) {
        return ['locked' => false, 'remaining_seconds' => 0];
    }

    $remainingSeconds = ($latestFailureAt + $lockMinutes * 60) - time();
    return [
        'locked' => $remainingSeconds > 0,
        'remaining_seconds' => max(0, $remainingSeconds),
    ];
}

function assert_admin_login_allowed(string $username): void
{
    $status = admin_login_throttle_status($username);
    if (!$status['locked']) {
        return;
    }

    $minutes = max(1, (int) ceil($status['remaining_seconds'] / 60));
    throw new RuntimeException('登录失败次数过多，请 ' . $minutes . ' 分钟后再试');
}

function record_admin_login_attempt(string $username, bool $success, ?string $failureReason = null): void
{
    $stmt = db()->prepare(
        'INSERT INTO admin_login_attempts (identity_hash, ip_address, username, success, failure_reason)
         VALUES (:identity_hash, :ip_address, :username, :success, :failure_reason)'
    );
    $stmt->execute([
        ':identity_hash' => admin_login_identity_hash($username),
        ':ip_address' => admin_login_client_ip(),
        ':username' => substr($username, 0, 191),
        ':success' => $success ? 1 : 0,
        ':failure_reason' => $failureReason,
    ]);
}

function clear_admin_login_failures(string $username): void
{
    $stmt = db()->prepare('DELETE FROM admin_login_attempts WHERE identity_hash = :identity_hash AND success = 0');
    $stmt->execute([':identity_hash' => admin_login_identity_hash($username)]);
}

function admin_login(string $username, string $password): bool
{
    $username = trim($username);
    assert_admin_login_allowed($username);

    $passwordHash = (string) setting('admin_password_hash', '');
    $validUsername = hash_equals((string) setting('admin_username', 'admin'), $username);
    $validPassword = $passwordHash !== '' && password_verify($password, $passwordHash);

    if (!$validUsername || !$validPassword) {
        record_admin_login_attempt($username, false, 'invalid_credentials');
        return false;
    }

    clear_admin_login_failures($username);
    record_admin_login_attempt($username, true);

    session_regenerate_id(true);
    $_SESSION['admin_logged_in'] = true;
    $_SESSION['admin_username'] = $username;

    return true;
}

function admin_logout(): void
{
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
}
