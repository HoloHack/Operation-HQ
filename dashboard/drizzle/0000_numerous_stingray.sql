CREATE TABLE `hq_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
