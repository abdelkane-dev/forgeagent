-- ─────────────────────────────────────────────────────────────────────────────
-- Agent isolation, enforced by PostgreSQL itself.
--
-- The application connects as `forge_app` (never owner, never superuser), so Row-Level
-- Security always applies. Each transaction declares its context with set_config:
--   app.mode     'user' | 'task' | 'platform'   (anything else = no access)
--   app.user_id  the signed-in user (mode user)
--   app.agent_id the single agent being worked on (required for task and platform)
-- One function decides: forge_can_access(agent_id). Without context, every agent table is empty.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    CREATE ROLE forge_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO forge_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forge_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forge_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON audit_log, platform_audit FROM forge_app;
--> statement-breakpoint
-- Tables added by later migrations get the same grants (and must enable RLS themselves).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forge_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO forge_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION forge_mode() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.mode', true), ''), 'none')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_uid() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_aid() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.agent_id', true), '')
$$;
--> statement-breakpoint

-- Reads agent_members with the owner's rights (members are themselves protected by RLS).
CREATE OR REPLACE FUNCTION forge_member_role(aid text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM agent_members WHERE agent_id = aid AND user_id = forge_uid()
$$;
--> statement-breakpoint

-- In user mode, a request scoped to one agent (app.agent_id set) can only touch that agent,
-- even if the user is also a member of others.
CREATE OR REPLACE FUNCTION forge_can_access(aid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE forge_mode()
    WHEN 'user' THEN forge_uid() IS NOT NULL AND forge_member_role(aid) IS NOT NULL AND (forge_aid() IS NULL OR forge_aid() = aid)
    WHEN 'task' THEN aid = forge_aid()
    WHEN 'platform' THEN aid = forge_aid()
    ELSE false
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_can_write(aid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE forge_mode()
    WHEN 'user' THEN forge_member_role(aid) IN ('owner', 'editor') AND (forge_aid() IS NULL OR forge_aid() = aid)
    WHEN 'task' THEN aid = forge_aid()
    WHEN 'platform' THEN aid = forge_aid()
    ELSE false
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_is_owner(aid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE forge_mode()
    WHEN 'user' THEN forge_member_role(aid) = 'owner' AND (forge_aid() IS NULL OR forge_aid() = aid)
    WHEN 'platform' THEN aid = forge_aid()
    ELSE false
  END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_agent_unclaimed(aid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM agent_members WHERE agent_id = aid)
$$;
--> statement-breakpoint

-- ── agents ──────────────────────────────────────────────────────────────────
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY forge_read ON agents FOR SELECT USING (forge_can_access(id));
--> statement-breakpoint
-- Any signed-in user may create an agent; it becomes visible once its owner membership exists.
CREATE POLICY forge_insert ON agents FOR INSERT WITH CHECK (forge_mode() = 'user' AND forge_uid() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY forge_update ON agents FOR UPDATE USING (forge_can_write(id)) WITH CHECK (forge_can_write(id));
--> statement-breakpoint
CREATE POLICY forge_delete ON agents FOR DELETE USING (forge_is_owner(id));
--> statement-breakpoint

-- ── agent_members ───────────────────────────────────────────────────────────
ALTER TABLE agent_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE agent_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY forge_read ON agent_members FOR SELECT USING (forge_can_access(agent_id));
--> statement-breakpoint
-- Owners manage members; the creator claims a brand-new agent as owner.
CREATE POLICY forge_insert ON agent_members FOR INSERT WITH CHECK (
  forge_is_owner(agent_id)
  OR (forge_mode() = 'user' AND user_id = forge_uid() AND role = 'owner' AND forge_agent_unclaimed(agent_id))
);
--> statement-breakpoint
CREATE POLICY forge_update ON agent_members FOR UPDATE USING (forge_is_owner(agent_id)) WITH CHECK (forge_is_owner(agent_id));
--> statement-breakpoint
CREATE POLICY forge_delete ON agent_members FOR DELETE USING (forge_is_owner(agent_id));
--> statement-breakpoint

-- ── every other agent table: same four policies ─────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_projects', 'agent_versions', 'agent_skills', 'agent_docs', 'agent_secrets', 'api_keys',
    'integrations', 'webhooks', 'knowledge_docs', 'knowledge_chunks', 'memories', 'runs', 'run_steps',
    'logs', 'config_checks', 'approvals', 'audit_log', 'usage_costs', 'eval_suites', 'eval_cases',
    'eval_runs', 'workflows', 'workflow_versions', 'workflow_runs', 'team_requests', 'team_tasks', 'team_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY forge_read ON %I FOR SELECT USING (forge_can_access(agent_id))', t);
    EXECUTE format('CREATE POLICY forge_insert ON %I FOR INSERT WITH CHECK (forge_can_write(agent_id))', t);
    EXECUTE format('CREATE POLICY forge_update ON %I FOR UPDATE USING (forge_can_write(agent_id)) WITH CHECK (forge_can_write(agent_id))', t);
    EXECUTE format('CREATE POLICY forge_delete ON %I FOR DELETE USING (forge_can_write(agent_id))', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Every member, readers included, appends to the audit of their agent.
DROP POLICY forge_insert ON audit_log;
--> statement-breakpoint
CREATE POLICY forge_insert ON audit_log FOR INSERT WITH CHECK (forge_can_access(agent_id));
--> statement-breakpoint

-- ── append-only journals ────────────────────────────────────────────────────
-- The only deletion allowed is the purge of a whole agent (app.purge = its id, set by the purge).
CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'audit_log' AND OLD.agent_id = nullif(current_setting('app.purge', true), '') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
--> statement-breakpoint
CREATE TRIGGER platform_audit_append_only BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
--> statement-breakpoint

-- ── narrow lookups that must work before the agent is known ─────────────────
-- API key → agent. Returns only the key's own metadata.
CREATE OR REPLACE FUNCTION forge_resolve_key(h text)
RETURNS TABLE (key_id text, agent_id text, scope text, environment text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, agent_id, scope, environment FROM api_keys WHERE key_hash = h AND revoked_at IS NULL
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forge_touch_key(kid text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE api_keys SET last_used_at = now() WHERE id = kid
$$;
--> statement-breakpoint
-- Ids of agents in given states: lets schedulers open one task context per agent. No data.
CREATE OR REPLACE FUNCTION forge_agent_ids(states text[]) RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM agents WHERE status = ANY(states) ORDER BY id
$$;
--> statement-breakpoint
-- Platform admin listing: metadata only (never knowledge, logs, costs…). The API checks the admin role.
CREATE OR REPLACE FUNCTION forge_admin_agents()
RETURNS TABLE (id text, name text, status text, owners text[], members int, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.status,
    coalesce(array_agg(u.email) FILTER (WHERE m.role = 'owner'), '{}'),
    count(m.user_id)::int,
    a.created_at
  FROM agents a
  LEFT JOIN agent_members m ON m.agent_id = a.id
  LEFT JOIN users u ON u.id = m.user_id
  GROUP BY a.id
  ORDER BY a.created_at DESC
$$;
