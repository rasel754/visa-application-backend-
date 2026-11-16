-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `prefix` VARCHAR(16) NOT NULL,
    `logoUrl` VARCHAR(512) NULL,
    `phone` VARCHAR(64) NULL,
    `address` VARCHAR(255) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Company_slug_key`(`slug`),
    UNIQUE INDEX `Company_prefix_key`(`prefix`),
    INDEX `Company_slug_idx`(`slug`),
    INDEX `Company_prefix_idx`(`prefix`),
    INDEX `Company_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default company to preserve existing data
INSERT INTO `Company` (`id`, `name`, `slug`, `prefix`, `logoUrl`, `phone`, `address`, `isActive`, `createdAt`, `updatedAt`)
VALUES ('cmw_igl_company_001', 'IGL Visa Help', 'igl-visa-help', 'IGL', '/logo.png', '+880-1958-666999', 'Dhaka, Bangladesh', true, NOW(), NOW());

-- AlterTable AdminUser
ALTER TABLE `AdminUser` ADD COLUMN `role` ENUM('SUPER_ADMIN', 'COMPANY') NOT NULL DEFAULT 'COMPANY',
    ADD COLUMN `companyId` VARCHAR(191) NULL;

UPDATE `AdminUser` SET `companyId` = 'cmw_igl_company_001' WHERE `companyId` IS NULL;

-- CreateIndex
CREATE INDEX `AdminUser_companyId_idx` ON `AdminUser`(`companyId`);
CREATE INDEX `AdminUser_role_idx` ON `AdminUser`(`role`);

-- AlterTable IntakeLink
ALTER TABLE `IntakeLink` ADD COLUMN `companyId` VARCHAR(191) NOT NULL DEFAULT 'cmw_igl_company_001';

-- CreateIndex
CREATE INDEX `IntakeLink_companyId_idx` ON `IntakeLink`(`companyId`);

-- AlterTable Submission
ALTER TABLE `Submission` ADD COLUMN `companyId` VARCHAR(191) NOT NULL DEFAULT 'cmw_igl_company_001';

-- CreateIndex
CREATE INDEX `Submission_companyId_idx` ON `Submission`(`companyId`);

-- Drop default values on companyId
ALTER TABLE `IntakeLink` ALTER COLUMN `companyId` DROP DEFAULT;
ALTER TABLE `Submission` ALTER COLUMN `companyId` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `AdminUser` ADD CONSTRAINT `AdminUser_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IntakeLink` ADD CONSTRAINT `IntakeLink_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
