-- One-time migration: adds hide_difficulty column to user_settings.
-- Run once against the existing database before deploying the new backend.

BEGIN;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS hide_difficulty BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
