ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_payload";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "view_once" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "opened_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "content_deleted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "media_retention_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_payload" CHECK (("messages"."kind" = 'TEXT' AND "messages"."attachment_id" IS NULL AND ("messages"."body" IS NOT NULL OR "messages"."content_deleted_at" IS NOT NULL)) OR ("messages"."kind" <> 'TEXT' AND ("messages"."attachment_id" IS NOT NULL OR "messages"."content_deleted_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_media_retention" CHECK ("settings"."media_retention_days" IN (0, 30, 90, 180, 365));