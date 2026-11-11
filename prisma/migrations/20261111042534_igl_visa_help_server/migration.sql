-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntakeLink` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `countryCode` VARCHAR(16) NULL,
    `category` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `IntakeLink_token_key`(`token`),
    INDEX `IntakeLink_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Submission` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `countryCode` VARCHAR(16) NOT NULL,
    `countryName` VARCHAR(128) NOT NULL,
    `category` VARCHAR(64) NOT NULL,
    `officialVisaName` VARCHAR(512) NOT NULL,
    `applicantName` VARCHAR(255) NOT NULL,
    `applicantPhone` VARCHAR(64) NOT NULL,
    `applicantEmail` VARCHAR(255) NULL,
    `answers` JSON NOT NULL,
    `status` ENUM('NEW', 'CHECKED', 'PROCESSING', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'NEW',
    `downloadTokenHash` VARCHAR(128) NOT NULL,
    `intakeLinkId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Submission_reference_key`(`reference`),
    UNIQUE INDEX `Submission_downloadTokenHash_key`(`downloadTokenHash`),
    INDEX `Submission_status_idx`(`status`),
    INDEX `Submission_countryCode_idx`(`countryCode`),
    INDEX `Submission_category_idx`(`category`),
    INDEX `Submission_createdAt_idx`(`createdAt`),
    INDEX `Submission_applicantName_idx`(`applicantName`),
    INDEX `Submission_applicantPhone_idx`(`applicantPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubmissionDocument` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `documentKey` VARCHAR(128) NOT NULL,
    `label` VARCHAR(512) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `storedName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(128) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SubmissionDocument_submissionId_idx`(`submissionId`),
    INDEX `SubmissionDocument_documentKey_idx`(`documentKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_intakeLinkId_fkey` FOREIGN KEY (`intakeLinkId`) REFERENCES `IntakeLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SubmissionDocument` ADD CONSTRAINT `SubmissionDocument_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `Submission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
