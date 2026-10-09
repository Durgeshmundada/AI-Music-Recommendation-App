CREATE TABLE `listening_history` (
	`user_id` text NOT NULL,
	`song_id` text NOT NULL,
	`played_at` integer NOT NULL,
	`resume_seconds` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `song_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_history_user_time` ON `listening_history` (`user_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `playlist_songs` (
	`playlist_id` text NOT NULL,
	`song_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`playlist_id`, `song_id`),
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playlist_songs_order` ON `playlist_songs` (`playlist_id`,`position`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_playlists_owner` ON `playlists` (`owner_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `removed_catalog` (
	`song_id` text PRIMARY KEY NOT NULL,
	`deleted_by` text NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`file_bytes` integer NOT NULL,
	`file_hash` text,
	`state` text DEFAULT 'uploading' NOT NULL,
	`song_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_storage_key_unique` ON `uploads` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_uploads_owner_state` ON `uploads` (`owner_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_uploads_owner_hash` ON `uploads` (`owner_id`,`file_hash`);
