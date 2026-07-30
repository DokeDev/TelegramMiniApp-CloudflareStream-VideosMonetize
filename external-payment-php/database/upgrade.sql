CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_username VARCHAR(191) NOT NULL,
  action VARCHAR(64) NOT NULL,
  order_no VARCHAR(40) DEFAULT NULL,
  details JSON DEFAULT NULL,
  ip_address VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_logs_order_no (order_no),
  KEY idx_admin_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity_hash CHAR(64) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  username VARCHAR(191) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  failure_reason VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_login_attempts_identity_created (identity_hash, created_at),
  KEY idx_admin_login_attempts_ip_created (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value LONGTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('app_name', 'TG Video Pay'),
  ('base_url', ''),
  ('order_expire_minutes', '30'),
  ('project_api_base_url', ''),
  ('project_external_recharge_secret', ''),
  ('project_timeout_seconds', '6'),
  ('epay_api_url', ''),
  ('epay_merchant_pid', ''),
  ('epay_merchant_key', ''),
  ('epay_alipay_enabled', '1'),
  ('epay_usdt_enabled', '1'),
  ('admin_username', 'admin'),
  ('admin_password_hash', '$2y$10$RWjOSsSTiVKrabdYl61sc.Xbhis4CDzYEmuqTP2qumWez2TwEszVK'),
  ('admin_login_max_attempts', '6'),
  ('admin_login_window_minutes', '10'),
  ('admin_login_lock_minutes', '15'),
  ('packages_json', '[{"code":"credits_320","title":"320 积分","description":"适合短期体验","pay_amount":"300.00","pay_currency":"CNY","credits_amount":320},{"code":"credits_650","title":"650 积分","description":"适合连续观看","pay_amount":"600.00","pay_currency":"CNY","credits_amount":650},{"code":"credits_1200","title":"1200 积分","description":"更高赠送比例","pay_amount":"1000.00","pay_currency":"CNY","credits_amount":1200}]');

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN payment_method ENUM(''alipay'', ''usdt'') NOT NULL DEFAULT ''alipay'' AFTER provider',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'payment_method'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN provider_payload JSON DEFAULT NULL AFTER provider_trade_no',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'provider_payload'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN project_request_id VARCHAR(80) DEFAULT NULL AFTER provider_payload',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'project_request_id'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN project_response JSON DEFAULT NULL AFTER project_request_id',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'project_response'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN failure_reason VARCHAR(255) DEFAULT NULL AFTER project_response',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'failure_reason'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN paid_at DATETIME DEFAULT NULL AFTER failure_reason',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'paid_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN credited_at DATETIME DEFAULT NULL AFTER paid_at',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'credited_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE recharge_orders ADD COLUMN expires_at DATETIME NULL AFTER credited_at',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'recharge_orders' AND column_name = 'expires_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE recharge_orders
  MODIFY COLUMN status ENUM('PENDING', 'PAID', 'CREDITED', 'FAILED', 'PAYMENT_FAILED', 'CREDIT_FAILED', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  MODIFY COLUMN payment_method ENUM('alipay', 'wxpay', 'usdt') NOT NULL DEFAULT 'alipay';

UPDATE recharge_orders
SET status = CASE
  WHEN paid_at IS NOT NULL THEN 'CREDIT_FAILED'
  ELSE 'PAYMENT_FAILED'
END
WHERE status = 'FAILED';

UPDATE recharge_orders
SET payment_method = 'usdt'
WHERE payment_method = 'wxpay';

UPDATE recharge_orders
SET expires_at = DATE_ADD(created_at, INTERVAL 30 MINUTE)
WHERE expires_at IS NULL;

ALTER TABLE recharge_orders
  MODIFY COLUMN status ENUM('PENDING', 'PAID', 'CREDITED', 'PAYMENT_FAILED', 'CREDIT_FAILED', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  MODIFY COLUMN provider VARCHAR(64) NOT NULL DEFAULT 'epay',
  MODIFY COLUMN payment_method ENUM('alipay', 'usdt') NOT NULL DEFAULT 'alipay',
  MODIFY COLUMN expires_at DATETIME NOT NULL;

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key = 'epay_wxpay_pid'
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_usdt_pid' AND target.setting_value = '';

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key = 'epay_wxpay_key'
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_usdt_key' AND target.setting_value = '';

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key = 'epay_pid'
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_alipay_pid' AND target.setting_value = '';

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key = 'epay_key'
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_alipay_key' AND target.setting_value = '';

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key IN ('epay_alipay_pid', 'epay_usdt_pid', 'epay_pid', 'epay_wxpay_pid')
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_merchant_pid' AND target.setting_value = '' AND legacy.setting_value <> '';

UPDATE app_settings AS target
JOIN app_settings AS legacy ON legacy.setting_key IN ('epay_alipay_key', 'epay_usdt_key', 'epay_key', 'epay_wxpay_key')
SET target.setting_value = legacy.setting_value
WHERE target.setting_key = 'epay_merchant_key' AND target.setting_value = '' AND legacy.setting_value <> '';

DELETE FROM app_settings
WHERE setting_key IN (
  'epay_pid',
  'epay_key',
  'epay_notify_url',
  'epay_return_url',
  'epay_alipay_pid',
  'epay_alipay_key',
  'epay_usdt_pid',
  'epay_usdt_key',
  'epay_wxpay_pid',
  'epay_wxpay_key'
);

