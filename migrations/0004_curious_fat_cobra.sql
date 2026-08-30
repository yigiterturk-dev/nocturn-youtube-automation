CREATE TABLE "trend_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar NOT NULL,
	"views" bigint NOT NULL,
	"likes" bigint NOT NULL,
	"comments" bigint NOT NULL,
	"views_per_hour" real NOT NULL,
	"acceleration" real DEFAULT 0 NOT NULL,
	"outlier_score" real NOT NULL,
	"engagement_rate" real NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_watchlists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"name" text NOT NULL,
	"queries" text[] NOT NULL,
	"region" text DEFAULT 'US' NOT NULL,
	"category_id" text DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trend_watchlists" ADD CONSTRAINT "trend_watchlists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_external_id" ON "opportunities" USING btree ("external_id");