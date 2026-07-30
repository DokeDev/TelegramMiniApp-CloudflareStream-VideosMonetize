-- Use Telegram Stars (XTR) as the only customer-facing payment currency.
ALTER TABLE `Video` MODIFY `currency` VARCHAR(16) NOT NULL DEFAULT 'XTR';
ALTER TABLE `Order` MODIFY `provider` VARCHAR(64) NOT NULL DEFAULT 'telegram_stars';

UPDATE `Video`
SET
  `priceCents` = GREATEST(1, CEILING(`priceCents` / 100)),
  `currency` = 'XTR'
WHERE `currency` <> 'XTR';
