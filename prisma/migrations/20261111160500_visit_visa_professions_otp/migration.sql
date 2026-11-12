-- DropIndex
DROP INDEX `Submission_category_idx` ON `Submission`;

-- AlterTable
ALTER TABLE `IntakeLink`
    ADD COLUMN `profession` ENUM('STUDENT', 'BUSINESSMAN', 'EMPLOYEE') NULL;

-- Backfill legacy category into profession where applicable
UPDATE `IntakeLink`
SET `profession` = CASE LOWER(`category`)
    WHEN 'student' THEN 'STUDENT'
    WHEN 'business' THEN 'BUSINESSMAN'
    WHEN 'businessman' THEN 'BUSINESSMAN'
    WHEN 'employee' THEN 'EMPLOYEE'
    ELSE NULL
END
WHERE `category` IS NOT NULL;

ALTER TABLE `IntakeLink`
    DROP COLUMN `category`;

-- AlterTable
ALTER TABLE `Submission`
    ADD COLUMN `profession` ENUM('STUDENT', 'BUSINESSMAN', 'EMPLOYEE') NULL,
    ADD COLUMN `visaType` VARCHAR(32) NOT NULL DEFAULT 'visit';

-- Backfill legacy category into profession where applicable (unmapped stays NULL)
UPDATE `Submission`
SET `profession` = CASE LOWER(`category`)
    WHEN 'student' THEN 'STUDENT'
    WHEN 'business' THEN 'BUSINESSMAN'
    WHEN 'businessman' THEN 'BUSINESSMAN'
    WHEN 'employee' THEN 'EMPLOYEE'
    ELSE NULL
END;

ALTER TABLE `Submission`
    DROP COLUMN `category`;

-- AlterTable
ALTER TABLE `SubmissionDocument`
    ADD COLUMN `group` VARCHAR(32) NOT NULL DEFAULT 'common';

-- CreateTable
CREATE TABLE `OtpVerification` (
    `id` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `codeHash` VARCHAR(128) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `verifiedAt` DATETIME(3) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OtpVerification_phone_createdAt_idx`(`phone`, `createdAt`),
    INDEX `OtpVerification_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Submission_profession_idx` ON `Submission`(`profession`);

-- CreateIndex
CREATE INDEX `SubmissionDocument_group_idx` ON `SubmissionDocument`(`group`);

