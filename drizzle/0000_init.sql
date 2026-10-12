CREATE TYPE "public"."attachment_status" AS ENUM('PENDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."avatar_tone" AS ENUM('ACCENT', 'NEUTRAL');--> statement-breakpoint
CREATE TYPE "public"."lock_reason" AS ENUM('TAB', 'BLUR', 'IDLE', 'MANUAL', 'REOPEN');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "admin_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploader_id" uuid NOT NULL,
	"kind" "message_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_name" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_sec" integer,
	"status" "attachment_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_not_text" CHECK ("attachments"."kind" <> 'TEXT')
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_pair_order" CHECK ("conversations"."user_a_id" < "conversations"."user_b_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"kind" "message_kind" NOT NULL,
	"body" varchar(4000),
	"attachment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	CONSTRAINT "messages_attachmentId_unique" UNIQUE("attachment_id"),
	CONSTRAINT "messages_kind_payload" CHECK (("messages"."kind" = 'TEXT' AND "messages"."body" IS NOT NULL AND "messages"."attachment_id" IS NULL) OR ("messages"."kind" <> 'TEXT' AND "messages"."attachment_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "password_resets_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"auto_lock_minutes" integer DEFAULT 5 NOT NULL,
	"lock_on_tab_leave" boolean DEFAULT true NOT NULL,
	"lock_on_reopen" boolean DEFAULT true NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_auto_lock" CHECK ("settings"."auto_lock_minutes" IN (1, 5, 15, 30))
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"pin_version" integer NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"lock_reason" "lock_reason",
	"locked_at" timestamp with time zone,
	"fresh" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tone" "avatar_tone" DEFAULT 'NEUTRAL' NOT NULL,
	"avatar_key" text,
	"pin_hash" text NOT NULL,
	"pin_version" integer DEFAULT 1 NOT NULL,
	"pin_changed_by_admin_at" timestamp with time zone,
	"pin_notice_seen" boolean DEFAULT true NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_slug_unique" UNIQUE("slug"),
	CONSTRAINT "users_slug_length" CHECK (char_length("users"."slug") >= 10)
);
--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_id_index" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_user_a_id_user_b_id_index" ON "conversations" USING btree ("user_a_id","user_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_sender_id_client_id_index" ON "messages" USING btree ("sender_id","client_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_index" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_index" ON "user_sessions" USING btree ("user_id");