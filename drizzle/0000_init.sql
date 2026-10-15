CREATE TABLE "accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"label_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"domain" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"show_names" boolean DEFAULT true NOT NULL,
	"min_group" boolean DEFAULT true NOT NULL,
	"perf_visibility" text DEFAULT 'jefes' NOT NULL,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#1546C9' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'texto' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"image_data" text,
	"image_width" integer DEFAULT 120 NOT NULL,
	"image_pos" text DEFAULT 'izquierda' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"replied_at" timestamp with time zone,
	"sender_type" text NOT NULL,
	"to_me" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_sync" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pending" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_collaborators" (
	"task_id" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "task_collaborators_task_id_email_pk" PRIMARY KEY("task_id","email")
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'hacer' NOT NULL,
	"priority" text DEFAULT 'Media' NOT NULL,
	"due_date" text,
	"project_id" text,
	"assignee_email" text NOT NULL,
	"created_by_id" text NOT NULL,
	"thread_id" text,
	"thread_owner_id" text,
	"thread_subject" text,
	"thread_from" text,
	"thread_summary" text,
	"share_email" boolean DEFAULT false NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nudged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_cache" (
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"history_id" text NOT NULL,
	"subject" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"snippet" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"label_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"message_count" integer NOT NULL,
	"last_from_me" boolean NOT NULL,
	"to_me" boolean DEFAULT true NOT NULL,
	"ai" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_cache_user_id_thread_id_pk" PRIMARY KEY("user_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "thread_states" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"state" text DEFAULT 'pendiente' NOT NULL,
	"state_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"no_reply" boolean DEFAULT false NOT NULL,
	"snooze_until" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"follow_up_note" text,
	"waiting_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sig_new_id" text,
	"sig_reply_id" text,
	"sla_targets" jsonb DEFAULT '{"Clientes":4,"Equipo":8,"Proveedores":24}'::jsonb NOT NULL,
	"sla_biz" boolean DEFAULT true NOT NULL,
	"vip_emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"supplier_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"org_metrics" boolean DEFAULT true NOT NULL,
	"reopen_rule" boolean DEFAULT true NOT NULL,
	"group_by" text DEFAULT 'semana' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"domain" text NOT NULL,
	"role" text DEFAULT 'miembro' NOT NULL,
	"area" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_sync" ADD CONSTRAINT "sla_sync_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_cache" ADD CONSTRAINT "thread_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_states" ADD CONSTRAINT "thread_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sla_events_user_msg" ON "sla_events" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "sla_events_user_received" ON "sla_events" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "tasks_domain_status" ON "tasks" USING btree ("domain","status");--> statement-breakpoint
CREATE INDEX "thread_cache_user_date" ON "thread_cache" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_states_user_thread" ON "thread_states" USING btree ("user_id","thread_id");--> statement-breakpoint
CREATE INDEX "thread_states_user_state" ON "thread_states" USING btree ("user_id","state");