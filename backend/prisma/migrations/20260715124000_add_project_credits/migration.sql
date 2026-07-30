-- Add project credits as an internal balance separate from Telegram Stars.
ALTER TABLE `User`
  ADD COLUMN `creditBalance` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `Video`
  ADD COLUMN `priceCredits` INTEGER NOT NULL DEFAULT 0;

UPDATE `Video`
SET `priceCredits` = GREATEST(1, `priceCents` - 1)
WHERE `priceCredits` = 0;

CREATE TABLE `CreditTransaction` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `userId` INTEGER NOT NULL,
  `orderId` INTEGER NULL,
  `videoId` INTEGER NULL,
  `amount` INTEGER NOT NULL,
  `balanceAfter` INTEGER NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `note` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `CreditTransaction_userId_idx`(`userId`),
  INDEX `CreditTransaction_orderId_idx`(`orderId`),
  INDEX `CreditTransaction_videoId_idx`(`videoId`),
  INDEX `CreditTransaction_type_idx`(`type`),
  INDEX `CreditTransaction_createdAt_idx`(`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CreditTransaction`
  ADD CONSTRAINT `CreditTransaction_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `CreditTransaction`
  ADD CONSTRAINT `CreditTransaction_orderId_fkey`
  FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `CreditTransaction`
  ADD CONSTRAINT `CreditTransaction_videoId_fkey`
  FOREIGN KEY (`videoId`) REFERENCES `Video`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
