-- backend/db/schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS problems (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        UNIQUE NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL,
  difficulty  TEXT        NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  topic_tags  TEXT[]      NOT NULL DEFAULT '{}',
  leetcode_id INT         UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  streak            INT         NOT NULL DEFAULT 1 CHECK (streak >= 1),
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages   TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title      BOOLEAN NOT NULL DEFAULT TRUE,
  hide_difficulty BOOLEAN NOT NULL DEFAULT TRUE,
  active_topics   TEXT[]  NOT NULL DEFAULT '{}',
  tour_done       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS saved_problems (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);

CREATE TABLE IF NOT EXISTS topic_proficiency (
  user_id       UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic         TEXT   NOT NULL,
  stage         TEXT   NOT NULL,
  score         FLOAT  NOT NULL DEFAULT 0.0,
  session_count INT    NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic, stage)
);

CREATE TABLE IF NOT EXISTS proficiency_sessions (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id   UUID NOT NULL REFERENCES problems(id)   ON DELETE CASCADE,
  topic        TEXT NOT NULL,
  stage        TEXT NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, problem_id, topic, stage, session_date)
);

-- delete rows older than 30 days at 3am UTC daily
SELECT cron.schedule('cleanup-proficiency-sessions', '0 3 * * *',
  'DELETE FROM proficiency_sessions WHERE session_date < CURRENT_DATE - INTERVAL ''30 days''')
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-sessions'
);

CREATE TABLE IF NOT EXISTS proficiency_score_snapshots (
  user_id       UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic         TEXT  NOT NULL,
  stage         TEXT  NOT NULL,
  score         FLOAT NOT NULL,
  snapshot_date DATE  NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, topic, stage, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_proficiency_score_snapshots_user_date
  ON proficiency_score_snapshots (user_id, snapshot_date);

-- nightly snapshot at 2am UTC: copy current scores into history
SELECT cron.schedule('snapshot-proficiency-scores', '0 2 * * *', $$
  INSERT INTO proficiency_score_snapshots (user_id, topic, stage, score, snapshot_date)
  SELECT user_id, topic, stage, score, CURRENT_DATE
  FROM topic_proficiency
  ON CONFLICT DO NOTHING
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snapshot-proficiency-scores'
);

-- cleanup: delete snapshots older than 90 days at 3:30am UTC
SELECT cron.schedule('cleanup-proficiency-snapshots', '30 3 * * *', $$
  DELETE FROM proficiency_score_snapshots WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-snapshots'
);
