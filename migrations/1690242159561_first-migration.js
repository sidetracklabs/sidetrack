/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE sidetrack_job_status_enum AS ENUM (
    'scheduled',
    'running',
    'canceled',
    'failed',
    'retrying',
    'completed'
);

CREATE TABLE sidetrack_jobs (
    id bigserial PRIMARY KEY,
    status sidetrack_job_status_enum NOT NULL,
    queue_name text NOT NULL,
    payload jsonb NOT NULL,
    errors jsonb,
    current_attempt integer NOT NULL,
    max_attempts integer NOT NULL,
    inserted_at timestamptz NOT NULL DEFAULT now(),
    scheduled_at timestamptz NOT NULL DEFAULT now(),
    attempted_at timestamptz,
    canceled_at timestamptz,
    failed_at timestamptz,
    completed_at timestamptz
);

-- TODO these need to be updated
CREATE INDEX sidetrack_jobs_status_idx ON sidetrack_jobs(status);

CREATE INDEX sidetrack_jobs_queue_name_idx ON sidetrack_jobs(queue_name);

CREATE INDEX sidetrack_jobs_scheduled_at_idx ON sidetrack_jobs(scheduled_at);`);
};

exports.down = (pgm) => {};
