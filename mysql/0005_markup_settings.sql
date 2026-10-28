CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` VARCHAR(100) PRIMARY KEY NOT NULL,
	`value` LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `orders` ADD COLUMN `cost` DOUBLE;
