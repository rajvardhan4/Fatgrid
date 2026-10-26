CREATE TABLE IF NOT EXISTS `users` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`email` VARCHAR(254) NOT NULL,
	`name` LONGTEXT NOT NULL,
	`password_hash` LONGTEXT,
	`role` LONGTEXT DEFAULT ('member') NOT NULL,
	`plan` LONGTEXT DEFAULT ('start') NOT NULL,
	`units` BIGINT DEFAULT 10 NOT NULL,
	`period` VARCHAR(40) NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
	`stripe_customer` LONGTEXT,
	`stripe_subscription` LONGTEXT,
 UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `publishers` (

	`domain` VARCHAR(253) PRIMARY KEY NOT NULL,
	`title` LONGTEXT DEFAULT ('') NOT NULL,
	`category` LONGTEXT DEFAULT ('') NOT NULL,
	`language` LONGTEXT DEFAULT ('English') NOT NULL,
	`country` LONGTEXT DEFAULT ('') NOT NULL,
	`authority` BIGINT,
	`dr` BIGINT,
	`traffic` BIGINT,
	`referring_domains` BIGINT,
	`updated_at` VARCHAR(40) NOT NULL,
	`metrics_source` LONGTEXT DEFAULT ('Imported') NOT NULL,
	`traffic_top` BIGINT,
	`all_traffic_top` BIGINT,
	`all_traffic` BIGINT,
	`monthly_min` BIGINT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`name` LONGTEXT NOT NULL,
	`domain` VARCHAR(253) DEFAULT '' NOT NULL,
	`description` LONGTEXT DEFAULT ('') NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
	`archived` BIGINT DEFAULT 0 NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `support_requests` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`subject` LONGTEXT NOT NULL,
	`status` LONGTEXT DEFAULT ('open') NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `jobs` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`kind` LONGTEXT NOT NULL,
	`query` LONGTEXT NOT NULL,
	`status` LONGTEXT NOT NULL,
	`cost` BIGINT NOT NULL,
	`result` LONGTEXT,
	`error` LONGTEXT,
	`created_at` VARCHAR(40) NOT NULL,
	`finished_at` VARCHAR(40),
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `offers` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`domain` VARCHAR(253) NOT NULL,
	`marketplace` VARCHAR(191) NOT NULL,
	`price` DOUBLE NOT NULL,
	`type` VARCHAR(64) NOT NULL,
	`follow` LONGTEXT DEFAULT ('dofollow') NOT NULL,
	`sponsored` BIGINT DEFAULT 0 NOT NULL,
	`restricted` BIGINT DEFAULT 0 NOT NULL,
	`url` LONGTEXT DEFAULT ('') NOT NULL,
	`active` BIGINT DEFAULT 1 NOT NULL,
	`updated_at` VARCHAR(40) NOT NULL,
 UNIQUE KEY `offer_unique` (`domain`,`marketplace`,`type`),
FOREIGN KEY (`domain`) REFERENCES `publishers`(`domain`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitor_groups` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`name` LONGTEXT NOT NULL,
	`project_id` VARCHAR(191),
	`sources` LONGTEXT NOT NULL,
	`targets` LONGTEXT NOT NULL,
	`interval_hours` BIGINT DEFAULT 0 NOT NULL,
	`next_check` VARCHAR(40),
	`last_checked` VARCHAR(40),
	`status` LONGTEXT DEFAULT ('pending') NOT NULL,
	`result` LONGTEXT,
	`job_id` VARCHAR(191),
	`created_at` VARCHAR(40) NOT NULL,
	`archived` BIGINT DEFAULT 0 NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ledger` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`amount` BIGINT NOT NULL,
	`reason` LONGTEXT NOT NULL,
	`job_id` VARCHAR(191),
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `messages` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`request_id` VARCHAR(191) NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`body` LONGTEXT NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`request_id`) REFERENCES `support_requests`(`id`) ON UPDATE no action ON DELETE cascade,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitors` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`source_url` LONGTEXT NOT NULL,
	`target_domain` VARCHAR(253) NOT NULL,
	`status` LONGTEXT DEFAULT ('pending') NOT NULL,
	`anchor` LONGTEXT,
	`rel` LONGTEXT,
	`http_status` BIGINT,
	`last_checked` VARCHAR(40),
	`error` LONGTEXT,
	`created_at` VARCHAR(40) NOT NULL,
 `source_hash` BINARY(32) GENERATED ALWAYS AS (UNHEX(SHA2(source_url,256))) STORED,
 UNIQUE KEY `monitor_unique` (`user_id`,`source_hash`,`target_domain`),
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitor_checks` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`monitor_id` VARCHAR(191) NOT NULL,
	`status` LONGTEXT NOT NULL,
	`previous_status` LONGTEXT NOT NULL,
	`anchor` LONGTEXT,
	`rel` LONGTEXT,
	`http_status` BIGINT,
	`error` LONGTEXT,
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orders` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`offer_id` VARCHAR(191) NOT NULL,
	`domain` VARCHAR(253) NOT NULL,
	`marketplace` VARCHAR(191) NOT NULL,
	`price` DOUBLE NOT NULL,
	`content` LONGTEXT NOT NULL,
	`target_url` LONGTEXT NOT NULL,
	`anchor` LONGTEXT NOT NULL,
	`status` LONGTEXT DEFAULT ('draft') NOT NULL,
	`placement_url` LONGTEXT,
	`stripe_session` LONGTEXT,
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_domains` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`project_id` VARCHAR(191) NOT NULL,
	`domain` VARCHAR(253) NOT NULL,
	`status` LONGTEXT DEFAULT ('prospect') NOT NULL,
	`notes` LONGTEXT DEFAULT ('') NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
 UNIQUE KEY `project_domain_unique` (`project_id`,`domain`),
FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `rate_limits` (

	`key` VARCHAR(191) PRIMARY KEY NOT NULL,
	`count` BIGINT NOT NULL,
	`expires_at` BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (

	`token_hash` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`expires_at` BIGINT NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_events` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`created_at` VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitor_group_history` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`group_id` VARCHAR(191) NOT NULL,
	`result` LONGTEXT NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`group_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `preferences` (

	`user_id` VARCHAR(191) NOT NULL,
	`key` VARCHAR(191) NOT NULL,
	`value` LONGTEXT NOT NULL,
 PRIMARY KEY (`user_id`,`key`),
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `publisher_decisions` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`domain` VARCHAR(253) NOT NULL,
	`project_id` VARCHAR(191) DEFAULT '' NOT NULL,
	`decision` LONGTEXT DEFAULT ('') NOT NULL,
	`favorite` BIGINT DEFAULT 0 NOT NULL,
	`notes` LONGTEXT DEFAULT ('') NOT NULL,
 UNIQUE KEY `publisher_decision_unique` (`user_id`,`domain`,`project_id`),
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scan_details` (

	`job_id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`country` LONGTEXT DEFAULT ('') NOT NULL,
	`language` LONGTEXT DEFAULT ('en') NOT NULL,
	`project_id` VARCHAR(191),
	`targets` LONGTEXT DEFAULT ('[]') NOT NULL,
	`model` LONGTEXT DEFAULT ('') NOT NULL,
FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `quote_requests` (

	`id` VARCHAR(191) PRIMARY KEY NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`domain` VARCHAR(253) NOT NULL,
	`link_type` LONGTEXT NOT NULL,
	`niche` LONGTEXT NOT NULL,
	`status` LONGTEXT DEFAULT ('pending') NOT NULL,
	`price` DOUBLE,
	`request_id` VARCHAR(191) NOT NULL,
	`created_at` VARCHAR(40) NOT NULL,
	`updated_at` VARCHAR(40) NOT NULL,
FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
FOREIGN KEY (`request_id`) REFERENCES `support_requests`(`id`) ON UPDATE no action ON DELETE no action
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;