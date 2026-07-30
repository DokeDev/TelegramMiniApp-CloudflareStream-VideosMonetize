<?php

declare(strict_types=1);

function setting(string $key, mixed $default = null): mixed
{
    $values = settings_cache();

    return array_key_exists($key, $values) ? $values[$key] : $default;
}

function settings_cache(?array $newValues = null): array
{
    static $values = null;

    if ($newValues !== null) {
        $values = $newValues;
        return $values;
    }

    if ($values !== null) {
        return $values;
    }

    $values = [];
    $stmt = db()->query('SELECT setting_key, setting_value FROM app_settings');
    foreach ($stmt->fetchAll() as $row) {
        $values[$row['setting_key']] = $row['setting_value'];
    }

    return $values;
}

function save_settings(array $values): void
{
    $stmt = db()->prepare(
        'INSERT INTO app_settings (setting_key, setting_value) VALUES (:setting_key, :setting_value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
    );

    foreach ($values as $key => $value) {
        $stmt->execute([':setting_key' => $key, ':setting_value' => (string) $value]);
    }

    $current = settings_cache();
    foreach ($values as $key => $value) {
        $current[$key] = (string) $value;
    }
    settings_cache($current);
}

function payment_packages(): array
{
    $packages = json_decode((string) setting('packages_json', '[]'), true);
    return is_array($packages) ? $packages : [];
}
