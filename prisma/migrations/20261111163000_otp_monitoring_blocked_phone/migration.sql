-- AlterTable
ALTER TABLE `OtpVerification` ADD COLUMN `status` ENUM('SENT', 'VERIFIED', 'EXPIRED', 'FAILED', 'USED') NOT NULL DEFAULT 'SENT';

-- Backfill any existing OtpVerification rows
UPDATE `OtpVerification`
SET `status` = CASE
    WHEN `usedAt` IS NOT NULL THEN 'USED'
    WHEN `verifiedAt` IS NOT NULL THEN 'VERIFIED'
    WHEN `expiresAt` < NOW(3) THEN 'EXPIRED'
    ELSE 'SENT'
END;

-- AlterTable
ALTER TABLE `Submission` ADD COLUMN `otpVerificationId` VARCHAR(191) NULL,
    ADD COLUMN `otpVerified` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `otpVerifiedPhone` VARCHAR(32) NULL;

-- CreateTable
CREATE TABLE `BlockedPhone` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BlockedPhone_phone_key`(`phone`),
    INDEX `BlockedPhone_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `OtpVerification_status_idx` ON `OtpVerification`(`status`);

-- CreateIndex
CREATE UNIQUE INDEX `Submission_otpVerificationId_key` ON `Submission`(`otpVerificationId`);

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_otpVerificationId_fkey` FOREIGN KEY (`otpVerificationId`) REFERENCES `OtpVerification`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

