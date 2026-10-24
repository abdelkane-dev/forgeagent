CREATE TABLE "agent_docs" (
	"agent_id" text NOT NULL,
	"version" integer NOT NULL,
	"markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_docs_agent_id_version_pk" PRIMARY KEY("agent_id","version")
);
--> statement-breakpoint
CREATE TABLE "agent_members" (
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_members_agent_id_user_id_pk" PRIMARY KEY("agent_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agent_projects" (
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "agent_projects_agent_id_project_id_pk" PRIMARY KEY("agent_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "agent_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"value_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_skills" (
	"agent_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_skills_agent_id_skill_id_pk" PRIMARY KEY("agent_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"agent_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"note" text NOT NULL,
	"author" text NOT NULL,
	"regression_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_agent_id_version_pk" PRIMARY KEY("agent_id","version")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mission" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"subcategory" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"autonomy" text DEFAULT 'suggest_only' NOT NULL,
	"model" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tone" text DEFAULT 'Professionnel' NOT NULL,
	"language" text DEFAULT 'Français' NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"triggers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"integrations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guardrails" jsonb NOT NULL,
	"cost_cap_per_day" double precision DEFAULT 20 NOT NULL,
	"monthly_budget" double precision DEFAULT 300 NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"environment" text NOT NULL,
	"scope" text DEFAULT 'secret' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"source" text DEFAULT 'agent' NOT NULL,
	"request_id" text,
	"workflow_run_id" text,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"risk" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"result" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "config_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"results" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'mcp' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"endpoint" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"input" text NOT NULL,
	"expect" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"score" integer NOT NULL,
	"passed" integer NOT NULL,
	"total" integer NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_suites" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"regression" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_check_at" timestamp with time zone,
	"latency_ms" integer,
	"secret_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"idx" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"size" text DEFAULT '…' NOT NULL,
	"status" text DEFAULT 'indexing' NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"storage_key" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"message" text NOT NULL,
	"run_id" text
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"session_id" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"stack" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"environments" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"run_id" text NOT NULL,
	"idx" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"start_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"source" text NOT NULL,
	"environment" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input" text NOT NULL,
	"output" text,
	"error" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"version" text DEFAULT '0.1.0' NOT NULL,
	"author" text NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"request_id" text NOT NULL,
	"task_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_role" text NOT NULL,
	"to_role" text,
	"type" text NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "team_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text,
	"steps" integer DEFAULT 0 NOT NULL,
	"agent_calls" integer DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"request_id" text NOT NULL,
	"parent_id" text,
	"role" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"input_hash" text NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_costs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"ref_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"platform_role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"secret_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text NOT NULL,
	"input" text DEFAULT '' NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"agent_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_versions_workflow_id_version_pk" PRIMARY KEY("workflow_id","version")
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"trigger" jsonb NOT NULL,
	"nodes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_docs" ADD CONSTRAINT "agent_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_projects" ADD CONSTRAINT "agent_projects_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_projects" ADD CONSTRAINT "agent_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_secrets" ADD CONSTRAINT "agent_secrets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_checks" ADD CONSTRAINT "config_checks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_suite_id_eval_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."eval_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_id_eval_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."eval_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suites" ADD CONSTRAINT "eval_suites_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_doc_id_knowledge_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."knowledge_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_events" ADD CONSTRAINT "team_events_request_id_team_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."team_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_requests" ADD CONSTRAINT "team_requests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_request_id_team_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."team_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_costs" ADD CONSTRAINT "usage_costs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_members_user_idx" ON "agent_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_secrets_name_uq" ON "agent_secrets" USING btree ("agent_id","name");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_agent_idx" ON "api_keys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "approvals_agent_status_idx" ON "approvals" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "audit_agent_at_idx" ON "audit_log" USING btree ("agent_id","at");--> statement-breakpoint
CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" USING btree ("suite_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_suites_agent_idx" ON "eval_suites" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "integrations_agent_idx" ON "integrations" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_agent_idx" ON "knowledge_chunks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "knowledge_docs_agent_idx" ON "knowledge_docs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "logs_agent_at_idx" ON "logs" USING btree ("agent_id","at");--> statement-breakpoint
CREATE INDEX "memories_agent_idx" ON "memories" USING btree ("agent_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_uq" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "run_steps_run_idx" ON "run_steps" USING btree ("run_id","idx");--> statement-breakpoint
CREATE INDEX "runs_agent_started_idx" ON "runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_events_request_idx" ON "team_events" USING btree ("request_id","id");--> statement-breakpoint
CREATE INDEX "team_requests_agent_idx" ON "team_requests" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "team_tasks_request_idx" ON "team_tasks" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "team_tasks_agent_idx" ON "team_tasks" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "usage_agent_at_idx" ON "usage_costs" USING btree ("agent_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "webhooks_agent_idx" ON "webhooks" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_wf_idx" ON "workflow_runs" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE INDEX "workflows_agent_idx" ON "workflows" USING btree ("agent_id");