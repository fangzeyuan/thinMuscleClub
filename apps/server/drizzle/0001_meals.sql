CREATE TABLE IF NOT EXISTS "foods" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text NOT NULL,
	"kcal_100g" double precision NOT NULL,
	"protein_100g" double precision NOT NULL,
	"carbs_100g" double precision NOT NULL,
	"fat_100g" double precision NOT NULL,
	"units" jsonb NOT NULL,
	"default_unit" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_items" (
	"id" text PRIMARY KEY NOT NULL,
	"meal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"food_id" text,
	"name" text NOT NULL,
	"amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"grams" double precision,
	"kcal" integer,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"position" integer NOT NULL,
	"confidence" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"slot" text NOT NULL,
	"eaten_at" timestamp with time zone,
	"title" text NOT NULL,
	"kcal" integer,
	"protein_g" double precision,
	"carbs_g" double precision,
	"fat_g" double precision,
	"input_method" text NOT NULL,
	"confidence" text,
	"photo_key" text,
	"source" text NOT NULL,
	"chat_msg_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "foods" ADD CONSTRAINT "foods_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "foods_owner" ON "foods" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meal_items_meal" ON "meal_items" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meals_user_date" ON "meals" USING btree ("user_id","date");