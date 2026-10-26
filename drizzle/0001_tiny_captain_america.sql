CREATE TABLE `monitor_group_history` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitor_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`project_id` text,
	`sources` text NOT NULL,
	`targets` text NOT NULL,
	`interval_hours` integer DEFAULT 0 NOT NULL,
	`next_check` text,
	`last_checked` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`job_id` text,
	`created_at` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_unique` ON `preferences` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `publisher_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`domain` text NOT NULL,
	`project_id` text DEFAULT '' NOT NULL,
	`decision` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_decision_unique` ON `publisher_decisions` (`user_id`,`domain`,`project_id`);--> statement-breakpoint
CREATE TABLE `scan_details` (
	`job_id` text PRIMARY KEY NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`project_id` text,
	`targets` text DEFAULT '[]' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
