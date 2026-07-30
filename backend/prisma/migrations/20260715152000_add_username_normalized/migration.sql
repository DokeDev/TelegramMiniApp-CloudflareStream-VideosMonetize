ALTER TABLE `User` ADD COLUMN `usernameNormalized` VARCHAR(191) NULL;

UPDATE `User`
SET `usernameNormalized` = LOWER(TRIM(LEADING '@' FROM `username`))
WHERE `username` IS NOT NULL AND `username` <> '';

CREATE INDEX `User_usernameNormalized_idx` ON `User`(`usernameNormalized`);
