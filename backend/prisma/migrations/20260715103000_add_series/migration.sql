-- CreateTable
CREATE TABLE `Series` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Series_slug_key`(`slug`),
    INDEX `Series_status_sortOrder_idx`(`status`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Video`
    ADD COLUMN `seriesId` INTEGER NULL,
    ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Video_seriesId_idx` ON `Video`(`seriesId`);

-- CreateIndex
CREATE INDEX `Video_status_sortOrder_idx` ON `Video`(`status`, `sortOrder`);

-- Seed default series for existing videos.
INSERT INTO `Series` (`id`, `title`, `description`, `slug`, `status`, `sortOrder`, `createdAt`, `updatedAt`)
VALUES (1, '默认系列', '迁移已有视频时自动创建。', 'default-series', 'ACTIVE', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

UPDATE `Video` SET `seriesId` = 1 WHERE `seriesId` IS NULL;

-- AddForeignKey
ALTER TABLE `Video` ADD CONSTRAINT `Video_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `Series`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
