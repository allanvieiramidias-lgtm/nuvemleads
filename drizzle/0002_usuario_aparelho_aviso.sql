CREATE TABLE "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"pin_version" integer NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"last_used_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_devices_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "unread_notice" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
-- Quem já existe ganha um usuário a partir do primeiro nome, sem acento ("Maria Clara" → "maria"; repetidos → "maria2").
UPDATE "users" u SET "username" = c.candidate FROM (
  SELECT id, CASE WHEN rn = 1 THEN base ELSE base || rn END AS candidate FROM (
    SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY created_at) AS rn FROM (
      SELECT id, created_at,
        CASE WHEN length(clean) < 3 THEN clean || repeat('x', 3 - length(clean)) ELSE clean END AS base
      FROM (
        SELECT id, created_at,
          left(regexp_replace(translate(lower(split_part(trim(name), ' ', 1)),
            'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9._-]', '', 'g'), 20) AS clean
        FROM "users" WHERE "username" IS NULL
      ) a
    ) b
  ) d
) c
WHERE u.id = c.id;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trusted_devices_user_id_index" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[a-z0-9._-]{3,24}$');