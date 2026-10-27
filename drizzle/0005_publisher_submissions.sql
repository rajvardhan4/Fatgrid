CREATE TABLE `publisher_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`guest_post_price` real,
	`link_insertion_price` real,
	`follow` text DEFAULT 'dofollow' NOT NULL,
	`sponsored` integer DEFAULT 0 NOT NULL,
	`restricted` integer DEFAULT 0 NOT NULL,
	`sample_url` text DEFAULT '' NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`user_id` text,
	`created_at` text NOT NULL,
	`reviewed_at` text
);
--> statement-breakpoint
CREATE INDEX `publisher_submissions_status` ON `publisher_submissions` (`status`,`created_at`);