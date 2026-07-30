CREATE TABLE IF NOT EXISTS recharge_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(40) NOT NULL,
  username_input VARCHAR(191) NOT NULL,
  username_normalized VARCHAR(191) NOT NULL,
  telegram_user_id VARCHAR(32) NOT NULL,
  telegram_username VARCHAR(191) DEFAULT NULL,
  display_name VARCHAR(191) NOT NULL,
  package_code VARCHAR(64) NOT NULL,
  package_title VARCHAR(191) NOT NULL,
  pay_amount DECIMAL(18, 2) NOT NULL,
  pay_currency VARCHAR(16) NOT NULL,
  credits_amount INT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'PAID', 'CREDITED', 'PAYMENT_FAILED', 'CREDIT_FAILED', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(64) NOT NULL DEFAULT 'epay',
  payment_method ENUM('alipay', 'usdt') NOT NULL DEFAULT 'alipay',
  provider_trade_no VARCHAR(191) DEFAULT NULL,
  provider_payload JSON DEFAULT NULL,
  project_request_id VARCHAR(80) DEFAULT NULL,
  project_response JSON DEFAULT NULL,
  failure_reason VARCHAR(255) DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL,
  credited_at DATETIME DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recharge_orders_order_no (order_no),
  UNIQUE KEY uq_recharge_orders_provider_trade_no (provider, provider_trade_no),
  KEY idx_recharge_orders_username_normalized (username_normalized),
  KEY idx_recharge_orders_telegram_user_id (telegram_user_id),
  KEY idx_recharge_orders_status_created_at (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  ('epay_merchant_pid', ''), ('epay_merchant_key', ''),
  ('epay_alipay_enabled', '1'), ('epay_usdt_enabled', '1'),
  ('admin_username', 'admin'),
  ('admin_password_hash', '$2y$10$RWjOSsSTiVKrabdYl61sc.Xbhis4CDzYEmuqTP2qumWez2TwEszVK'),
  ('admin_login_max_attempts', '6'),
  ('admin_login_window_minutes', '10'),
  ('admin_login_lock_minutes', '15'),
  ('packages_json', '[{"code":"credits_320","title":"320 积分","description":"适合短期体验","pay_amount":"300.00","pay_currency":"CNY","credits_amount":320},{"code":"credits_650","title":"650 积分","description":"适合连续观看","pay_amount":"600.00","pay_currency":"CNY","credits_amount":650},{"code":"credits_1200","title":"1200 积分","description":"更高赠送比例","pay_amount":"1000.00","pay_currency":"CNY","credits_amount":1200}]');
