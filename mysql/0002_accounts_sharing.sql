CREATE TABLE IF NOT EXISTS `password_resets` (
	`token_hash` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`expires_at` BIGINT NOT NULL,
	`used` BIGINT DEFAULT 0 NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_members` (
	`project_id` VARCHAR(191) NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`role` VARCHAR(20) DEFAULT 'viewer' NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
 PRIMARY KEY (`project_id`,`user_id`),
 KEY `project_members_user` (`user_id`),
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
