-- Phase 5: audit logs, notifications, and DB-level week-lock enforcement.

-- AuditLog table (cross-cutting: week lock/unlock, rate changes, deactivations, token revocations).
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- Notifications table.
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_read_at_created_at_idx"
    ON "notifications"("user_id", "read_at", "created_at");
ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Week-lock DB trigger: rejects writes to time_entries whose started_at falls in a locked ISO week.
-- Spec §8.2 mandates enforcement at the DB level so any path — API, Prisma
-- Studio, psql — can't slip an edit into a locked week.
CREATE OR REPLACE FUNCTION "reject_locked_time_entry_writes"()
RETURNS TRIGGER AS $$
DECLARE
    target_started TIMESTAMPTZ;
    target_year INT;
    target_week INT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_started := OLD.started_at;
    ELSE
        target_started := NEW.started_at;
    END IF;

    target_year := EXTRACT(ISOYEAR FROM target_started AT TIME ZONE 'UTC')::int;
    target_week := EXTRACT(WEEK FROM target_started AT TIME ZONE 'UTC')::int;

    IF EXISTS (
        SELECT 1 FROM "week_locks"
        WHERE "iso_year" = target_year AND "iso_week" = target_week
    ) THEN
        RAISE EXCEPTION 'week_locked: ISO week %-W% is locked; edits are not permitted.',
            target_year, LPAD(target_week::text, 2, '0')
            USING ERRCODE = 'check_violation';
    END IF;

    -- For UPDATE, also block if the *previous* week was locked so you can't
    -- drag a timestamp out of a locked week.
    IF TG_OP = 'UPDATE' THEN
        target_year := EXTRACT(ISOYEAR FROM OLD.started_at AT TIME ZONE 'UTC')::int;
        target_week := EXTRACT(WEEK FROM OLD.started_at AT TIME ZONE 'UTC')::int;
        IF EXISTS (
            SELECT 1 FROM "week_locks"
            WHERE "iso_year" = target_year AND "iso_week" = target_week
        ) THEN
            RAISE EXCEPTION 'week_locked: ISO week %-W% is locked; edits are not permitted.',
                target_year, LPAD(target_week::text, 2, '0')
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "time_entries_week_lock_guard"
    BEFORE INSERT OR UPDATE OR DELETE ON "time_entries"
    FOR EACH ROW
    EXECUTE FUNCTION "reject_locked_time_entry_writes"();
