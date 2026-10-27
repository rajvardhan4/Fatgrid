ALTER TABLE `publishers` ADD COLUMN `niches` VARCHAR(255) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `publisher_submissions` ADD COLUMN `niches` VARCHAR(255) DEFAULT '' NOT NULL;
