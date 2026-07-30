-- Add Stars-to-project-credit packages.
CREATE TABLE `CreditPackage` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(191) NOT NULL,
  `starsAmount` INTEGER NOT NULL,
  `creditsAmount` INTEGER NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CreditPackage_status_sortOrder_idx`(`status`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RechargeOrder` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `orderCode` VARCHAR(32) NOT NULL,
  `userId` INTEGER NOT NULL,
  `packageId` INTEGER NOT NULL,
  `starsAmount` INTEGER NOT NULL,
  `creditsAmount` INTEGER NOT NULL,
  `currency` VARCHAR(16) NOT NULL DEFAULT 'XTR',
  `status` ENUM('PENDING', 'PAID', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
  `provider` VARCHAR(64) NOT NULL DEFAULT 'telegram_stars',
  `providerPaymentId` VARCHAR(191) NULL,
  `paidAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `RechargeOrder_orderCode_key`(`orderCode`),
  INDEX `RechargeOrder_userId_idx`(`userId`),
  INDEX `RechargeOrder_packageId_idx`(`packageId`),
  INDEX `RechargeOrder_status_idx`(`status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RechargeOrder`
  ADD CONSTRAINT `RechargeOrder_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `RechargeOrder`
  ADD CONSTRAINT `RechargeOrder_packageId_fkey`
  FOREIGN KEY (`packageId`) REFERENCES `CreditPackage`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `CreditTransaction`
  ADD COLUMN `rechargeOrderId` INTEGER NULL;

CREATE INDEX `CreditTransaction_rechargeOrderId_idx`
  ON `CreditTransaction`(`rechargeOrderId`);

ALTER TABLE `CreditTransaction`
  ADD CONSTRAINT `CreditTransaction_rechargeOrderId_fkey`
  FOREIGN KEY (`rechargeOrderId`) REFERENCES `RechargeOrder`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `CreditPackage`
  (`title`, `starsAmount`, `creditsAmount`, `status`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES
  ('10Stars = 11积分', 10, 11, 'ACTIVE', 10, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('50Stars = 60积分', 50, 60, 'ACTIVE', 20, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('100Stars = 130积分', 100, 130, 'ACTIVE', 30, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
