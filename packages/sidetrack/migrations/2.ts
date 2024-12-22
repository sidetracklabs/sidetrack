import { MigrationBuilder } from "@sidetrack/pg-migrate";

export default {
  up: async (pgm: MigrationBuilder) => {
    pgm.sql(`

    CREATE TYPE sidetrack_cron_job_status_enum AS ENUM (
      'active',
      'inactive'
    );

    CREATE TABLE IF NOT EXISTS sidetrack_cron_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        queue TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        timezone TEXT,
        payload JSONB NOT NULL,
        status sidetrack_cron_job_status_enum NOT NULL DEFAULT 'active',
        inserted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(queue, cron_expression)
      );

      ALTER TABLE sidetrack_jobs ADD COLUMN cron_job_id uuid REFERENCES sidetrack_cron_jobs(id);

      ALTER TABLE sidetrack_jobs ADD COLUMN unique_key TEXT;

      CREATE UNIQUE INDEX ON sidetrack_jobs (unique_key);
    `);
  },
  down: async (_pgm: MigrationBuilder) => {},
  name: "2",
};
