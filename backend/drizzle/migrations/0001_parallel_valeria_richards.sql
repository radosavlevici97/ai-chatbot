CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`page_number` integer,
	`token_count` integer,
	`embedding` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_chunks_doc_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`filename` text NOT NULL,
	`original_filename` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`storage_path` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`chunk_count` integer DEFAULT 0,
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_user_created_idx` ON `documents` (`user_id`,`created_at`);