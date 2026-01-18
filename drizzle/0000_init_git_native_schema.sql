CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"stripe_customer_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" varchar(255) NOT NULL,
	"github_login" varchar(255) NOT NULL,
	"email" varchar(255),
	"name" varchar(255),
	"avatar_url" varchar(1024),
	"primary_org_id" uuid,
	"preferences" jsonb,
	"access_token_enc" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_login_at" timestamp,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"processed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"plan" varchar(50) DEFAULT 'free' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"seats" integer DEFAULT 1,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"metric" varchar(50) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pattern_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"reflection_id" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"helped" boolean NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reflections" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"session" varchar(1024) NOT NULL,
	"feeling" varchar(50) NOT NULL,
	"insight" text NOT NULL,
	"method" varchar(50) DEFAULT 'direct',
	"signal" text,
	"outcome" varchar(50),
	"reinforcement" text,
	"warning" text,
	"org" varchar(255) DEFAULT 'default' NOT NULL,
	"project" varchar(255) DEFAULT 'default' NOT NULL,
	"user_id" varchar(255) DEFAULT 'default' NOT NULL,
	"vault" varchar(255),
	"level" integer DEFAULT 0,
	"helpful_count" integer DEFAULT 0,
	"unhelpful_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"from_context" varchar(255) NOT NULL,
	"to_context" varchar(255) NOT NULL,
	"topic" varchar(255),
	"insight" text NOT NULL,
	"org" varchar(255) DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learned_patterns" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"structure" jsonb NOT NULL,
	"source_observations" jsonb,
	"level" varchar(50) DEFAULT 'user',
	"quality_score" numeric(5, 2) DEFAULT '50.00',
	"usage_count" integer DEFAULT 0,
	"acceptance_rate" numeric(5, 4) DEFAULT '0.0',
	"org" varchar(255) DEFAULT 'default' NOT NULL,
	"project" varchar(255),
	"user_id" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"pattern_id" varchar(255),
	"outcome" varchar(50) NOT NULL,
	"prediction" jsonb,
	"modifications" jsonb,
	"feedback" text,
	"confidence" numeric(5, 4),
	"timing_ms" integer,
	"org" varchar(255) DEFAULT 'default' NOT NULL,
	"project" varchar(255) DEFAULT 'default' NOT NULL,
	"user_id" varchar(255) DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_orgs" ADD CONSTRAINT "user_orgs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_orgs" ADD CONSTRAINT "user_orgs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_primary_org_id_orgs_id_fk" FOREIGN KEY ("primary_org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_applications" ADD CONSTRAINT "pattern_applications_reflection_id_reflections_id_fk" FOREIGN KEY ("reflection_id") REFERENCES "public"."reflections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pattern_applications_reflection" ON "pattern_applications" USING btree ("reflection_id");--> statement-breakpoint
CREATE INDEX "idx_reflections_org" ON "reflections" USING btree ("org");--> statement-breakpoint
CREATE INDEX "idx_reflections_project" ON "reflections" USING btree ("org","project");--> statement-breakpoint
CREATE INDEX "idx_reflections_user" ON "reflections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reflections_feeling" ON "reflections" USING btree ("feeling");--> statement-breakpoint
CREATE INDEX "idx_reflections_level" ON "reflections" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_reflections_level_org" ON "reflections" USING btree ("level","org");--> statement-breakpoint
CREATE INDEX "idx_reflections_created" ON "reflections" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_insights_to_context" ON "insights" USING btree ("to_context");--> statement-breakpoint
CREATE INDEX "idx_insights_topic" ON "insights" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "idx_insights_org" ON "insights" USING btree ("org");--> statement-breakpoint
CREATE INDEX "idx_learned_patterns_level" ON "learned_patterns" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_learned_patterns_org" ON "learned_patterns" USING btree ("org");--> statement-breakpoint
CREATE INDEX "idx_learned_patterns_quality" ON "learned_patterns" USING btree ("quality_score");--> statement-breakpoint
CREATE INDEX "idx_observations_session" ON "observations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_observations_pattern" ON "observations" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "idx_observations_outcome" ON "observations" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "idx_observations_org" ON "observations" USING btree ("org");--> statement-breakpoint
CREATE INDEX "idx_observations_created" ON "observations" USING btree ("created_at");