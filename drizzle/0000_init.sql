CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_lock_minutes" integer DEFAULT 5 NOT NULL,
	"lock_on_tab_leave" boolean DEFAULT true NOT NULL,
	"lock_on_reopen" boolean DEFAULT true NOT NULL
);
