ALTER TABLE "admin_events" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "admin_events" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admin_sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "admin_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "admin_sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admins" ALTER COLUMN "password_changed_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "admins" ALTER COLUMN "password_changed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "admins" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "admins" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "delivered_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "read_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "password_resets" ALTER COLUMN "expires_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "password_resets" ALTER COLUMN "used_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "rate_limits" ALTER COLUMN "window_start" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "rate_limits" ALTER COLUMN "window_start" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "rate_limits" ALTER COLUMN "blocked_until" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "locked_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "last_seen_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "last_seen_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "pin_changed_by_admin_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();