UPDATE `Video`
SET `priceCredits` = GREATEST(1, `priceCents` - 20);

INSERT INTO `CreditPackage`
  (`id`, `title`, `starsAmount`, `creditsAmount`, `status`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES
  (1, '300Stars = 320积分', 300, 320, 'ACTIVE', 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (2, '600Stars = 650积分', 600, 650, 'ACTIVE', 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (3, '1000Stars = 1200积分', 1000, 1200, 'ACTIVE', 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `starsAmount` = VALUES(`starsAmount`),
  `creditsAmount` = VALUES(`creditsAmount`),
  `status` = VALUES(`status`),
  `sortOrder` = VALUES(`sortOrder`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

UPDATE `CreditPackage`
SET `status` = 'ARCHIVED',
    `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `id` NOT IN (1, 2, 3);
