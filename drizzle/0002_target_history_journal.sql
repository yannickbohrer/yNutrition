CREATE TABLE `change_log` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`tbl` text NOT NULL,
	`op` text NOT NULL,
	`row_key` text NOT NULL,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `target_history` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`targets` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
