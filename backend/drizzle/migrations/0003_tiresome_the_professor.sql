CREATE TABLE `github_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`github_username` text,
	`avatar_url` text,
	`token_scope` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`github_owner` text NOT NULL,
	`github_repo` text NOT NULL,
	`default_branch` text DEFAULT 'main' NOT NULL,
	`description` text,
	`language` text,
	`avatar_url` text,
	`firebase_project_id` text,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `repos_user_idx` ON `repos` (`user_id`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `mode` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `repo_id` text REFERENCES repos(id);--> statement-breakpoint
ALTER TABLE `conversations` ADD `working_branch` text;