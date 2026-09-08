-- DailyBee sync API schema. Aggregates only: there is deliberately no column for URLs or window titles.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  policy JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'var(--hive-400)',
  budget_hours REAL NOT NULL DEFAULT 40,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  tracking BOOLEAN NOT NULL DEFAULT false,
  tracked_seconds INTEGER NOT NULL DEFAULT 0,
  focus SMALLINT NOT NULL DEFAULT 0,
  mix JSONB NOT NULL,
  top_apps JSONB NOT NULL DEFAULT '[]'::jsonb,
  report_status TEXT,
  report_sent_at BIGINT,
  share_focus BOOLEAN NOT NULL DEFAULT false,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS entries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  day DATE NOT NULL,
  task TEXT NOT NULL,
  ref TEXT,
  project TEXT NOT NULL,
  start_ts BIGINT NOT NULL,
  seconds INTEGER NOT NULL,
  done BOOLEAN NOT NULL,
  outcome TEXT,
  blocker BOOLEAN NOT NULL DEFAULT false,
  size TEXT,
  size_check TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS entries_day ON entries(day);

CREATE TABLE IF NOT EXISTS checkins (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  day DATE NOT NULL,
  ts BIGINT NOT NULL,
  kind TEXT NOT NULL,
  answer TEXT,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS nudges (
  id SERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_initials TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
