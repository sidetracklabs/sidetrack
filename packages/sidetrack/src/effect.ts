import * as Context from "@effect/data/Context";
import * as Duration from "@effect/data/Duration";
import { fromIterable } from "@effect/data/ReadonlyRecord";
import * as Effect from "@effect/io/Effect";
import * as Fiber from "@effect/io/Fiber";
import * as Layer from "@effect/io/Layer";
import * as Ref from "@effect/io/Ref";
import * as Schedule from "@effect/io/Schedule";
import pg from "pg";

import { SidetrackDatabaseClient } from "./client";
import { runMigrations } from "./migrations";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/generated/public/SidetrackJobStatusEnum";
import {
  SidetrackCancelJobOptions,
  SidetrackDeleteJobOptions,
  SidetrackGetJobOptions,
  SidetrackHandlerError,
  SidetrackInsertJobOptions,
  SidetrackJobWithPayload,
  SidetrackListJobsOptions,
  SidetrackListJobStatusesOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
  SidetrackRunJobOptions,
  SidetrackRunQueueOptions,
} from "./types";

export interface SidetrackService<Queues extends SidetrackQueuesGenericType> {
  cancelJob: (
    jobId: string,
    options?: SidetrackCancelJobOptions,
  ) => Effect.Effect<never, never, void>;
  deleteJob: (
    jobId: string,
    options?: SidetrackDeleteJobOptions,
  ) => Effect.Effect<never, never, void>;
  getJob: (
    jobId: string,
    options?: SidetrackGetJobOptions,
  ) => Effect.Effect<never, never, SidetrackJobs>;
  insertJob: <K extends keyof Queues>(
    queueName: K,
    payload: Queues[K],
    options?: SidetrackInsertJobOptions,
  ) => Effect.Effect<never, never, SidetrackJobs>;
  /**
   * Test utility to get a list of job statuses and their counts
   */
  listJobStatuses: (
    options?: SidetrackListJobStatusesOptions,
  ) => Effect.Effect<never, never, Record<string, string>>;
  /**
   * Test utility to get a list of jobs
   */
  listJobs: <K extends keyof Queues>(
    options?: SidetrackListJobsOptions<Queues, K> | undefined,
  ) => Effect.Effect<never, never, SidetrackJobs[]>;
  /**
   * Test utility to run a job manually without polling
   */
  runJob: (
    jobId: string,
    options?: SidetrackRunJobOptions,
  ) => Effect.Effect<never, unknown, void>;
  /**
   * Test utility to run all jobs in a queue manually without polling
   */
  runQueue: <K extends keyof Queues>(
    queue: K,
    options?: SidetrackRunQueueOptions,
  ) => Effect.Effect<never, unknown, void>;
  /**
   * Automatically run migrations and start polling the DB for jobs
   */
  start: () => Effect.Effect<never, never, void>;
  /**
   * Turn off polling
   */
  stop: () => Effect.Effect<never, never, void>;
}

export const createSidetrackServiceTag = <
  Queues extends SidetrackQueuesGenericType,
>() =>
  Context.Tag<SidetrackService<Queues>>(
    Symbol.for("@sidetracklabs/sidetrack/effect/service"),
  );

export function makeLayer<Queues extends SidetrackQueuesGenericType>(
  layerOptions: SidetrackOptions<Queues>,
): Layer.Layer<never, never, SidetrackService<Queues>> {
  return Layer.sync(createSidetrackServiceTag<Queues>(), () => {
    const queues = layerOptions.queues;
    const databaseOptions = layerOptions.databaseOptions;
    const pool = databaseOptions ? new pg.Pool(databaseOptions) : undefined;
    const databaseClient: SidetrackDatabaseClient =
      layerOptions.databaseClient ?? {
        execute: async <ResultRow>(query: string, params?: unknown[]) => {
          const queryResult = await pool?.query(query, params);
          return { rows: (queryResult?.rows ?? []) as ResultRow[] };
        },
      };
    const pollingFiber = Ref.unsafeMake<Fiber.Fiber<unknown, unknown>>(
      Fiber.unit,
    );

    const startPolling = () =>
      Effect.promise(() =>
        databaseClient.execute<SidetrackJobs>(
          `WITH next_jobs AS (
        SELECT
          id
        FROM
          sidetrack_jobs
        WHERE
          (status = 'scheduled' or status = 'retrying')
          AND scheduled_at <= NOW()
        ORDER BY
          scheduled_at
        FOR UPDATE SKIP LOCKED
      )
      UPDATE
        sidetrack_jobs
      SET
        status = 'running',
        attempted_at = NOW()
      WHERE
        id IN (
          SELECT
            id
          FROM
            next_jobs
        ) RETURNING *`,
        ),
      )
        .pipe(Effect.map((result) => result.rows))
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(
              result,
              (job) =>
                runHandler(job)
                  .pipe(Effect.catchAllCause(Effect.logError))
                  .pipe(Effect.forkDaemon),
              {
                concurrency: "unbounded",
              },
            ),
          ),
        )
        // Decrease polling time potentially?
        .pipe(Effect.repeat(Schedule.spaced(Duration.millis(500))))
        .pipe(Effect.catchAllCause(Effect.logError))
        .pipe(Effect.forkDaemon)
        .pipe(Effect.flatMap((fiber) => Ref.update(pollingFiber, () => fiber)));

    const start = () =>
      // TODO migrations can't be performed with a custom client currently
      {
        if (!databaseOptions?.connectionString)
          return Effect.dieMessage(
            "No connection string provided, cannot run sidetrack migrations",
          );
        return Effect.promise(() =>
          runMigrations(databaseOptions.connectionString),
        ).pipe(Effect.flatMap(() => startPolling()));
      };

    const cancelJob = (jobId: string, options?: SidetrackCancelJobOptions) =>
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute(
          `UPDATE sidetrack_jobs SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.asUnit);

    const deleteJob = (jobId: string, options?: SidetrackDeleteJobOptions) =>
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute(
          `DELETE FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.asUnit);

    const stop = () =>
      Ref.get(pollingFiber)
        .pipe(Effect.flatMap((fiber) => Fiber.interrupt(fiber)))
        .pipe(Effect.asUnit);

    const runHandler = (
      job: SidetrackJobs,
      options?: { databaseClient?: SidetrackDatabaseClient },
    ) =>
      Effect.tryPromise({
        catch: (e) => {
          return new SidetrackHandlerError(e);
        },
        try: () =>
          queues[job.queue].handler(
            job as SidetrackJobWithPayload<Queues[string]>,
          ),
      })
        .pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              (options?.databaseClient ?? databaseClient).execute(
                `UPDATE sidetrack_jobs SET status = 'completed', current_attempt = current_attempt + 1, completed_at = NOW() WHERE id = $1`,
                [job.id],
              ),
            ),
          ),
        )
        .pipe(
          Effect.catchTag("SidetrackHandlerError", (handlerError) =>
            Effect.promise(() => {
              if (job.current_attempt + 1 < job.max_attempts) {
                // Exponential backoff with jitter
                // Based of the historic Resque/Sidekiq algorithm

                const backoff = Math.trunc(
                  Math.pow(job.current_attempt + 1, 4) +
                    15 +
                    // Number between 1 and 30
                    Math.floor(Math.random() * (30 - 1 + 1) + 1) *
                      job.current_attempt +
                    1,
                );

                return (options?.databaseClient ?? databaseClient).execute(
                  `UPDATE sidetrack_jobs SET status = 'retrying', scheduled_at = NOW() + interval '${backoff} seconds', current_attempt = current_attempt + 1, errors =
                          (CASE
                              WHEN errors IS NULL THEN '[]'::JSONB
                              ELSE errors
                          END) || $2::jsonb WHERE id = $1`,
                  [
                    job.id,
                    // TODO make sure we handle cases where this is not an Error, and also not serializable?
                    JSON.stringify(
                      handlerError.error,
                      Object.getOwnPropertyNames(handlerError.error),
                    ),
                  ],
                );
              } else {
                return (options?.databaseClient ?? databaseClient).execute(
                  `UPDATE sidetrack_jobs SET status = 'failed', attempted_at = NOW(), failed_at = NOW(), current_attempt = current_attempt + 1, errors =
                            (CASE
                            WHEN errors IS NULL THEN '[]'::JSONB
                            ELSE errors
                        END) || $2::jsonb WHERE id = $1`,
                  [
                    job.id,
                    // TODO make sure we handle cases where this is not an Error, and also not serializable?
                    JSON.stringify(
                      handlerError.error,
                      Object.getOwnPropertyNames(handlerError.error),
                    ),
                  ],
                );
              }
            }),
          ),
        )
        .pipe(Effect.asUnit);

    const insertJob = <K extends keyof Queues>(
      queueName: K,
      payload: Queues[K],
      options?: SidetrackInsertJobOptions,
    ) =>
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute<SidetrackJobs>(
          `INSERT INTO sidetrack_jobs (
      status,
      queue,
      payload,
      current_attempt,
      max_attempts
          ) VALUES ('scheduled', $1, $2, 0, $3) RETURNING *`,
          [queueName, payload, queues[queueName].options?.maxAttempts ?? 1],
        ),
      ).pipe(Effect.map((result) => result.rows[0]!));

    const getJob = (jobId: string, options?: SidetrackGetJobOptions) =>
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const runJob = (jobId: string, options?: SidetrackRunJobOptions) =>
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute<SidetrackJobs>(
          `WITH next_job AS (
              SELECT
                id
              FROM
                sidetrack_jobs
              WHERE
                (status = 'scheduled' or status = 'retrying')
                AND id = $1
              ORDER BY
                scheduled_at
                FOR UPDATE
                SKIP LOCKED
            )
            UPDATE
              sidetrack_jobs
            SET
              status = 'running',
              attempted_at = NOW()
            WHERE
              id IN (
                SELECT
                  id
                FROM
                  next_job
              ) RETURNING *`,
          [jobId],
        ),
      )

        .pipe(Effect.map((result) => result.rows[0]))
        .pipe(Effect.flatMap((job) => runHandler(job, options)));

    const runQueue = <K extends keyof Queues>(
      queue: K,
      options?: SidetrackRunQueueOptions,
    ) =>
      Effect.promise(() =>
        (options?.databaseClient ?? databaseClient).execute<SidetrackJobs>(
          `WITH next_jobs AS (
              SELECT
                id
              FROM
                sidetrack_jobs
              WHERE
              (status = 'scheduled' or status = 'retrying')
                ${
                  options?.includeFutureJobs ? "" : "AND scheduled_at <= NOW()"
                } AND queue = $1
              ORDER BY
                scheduled_at
                FOR UPDATE
                SKIP LOCKED
            )
            UPDATE
              sidetrack_jobs
            SET
              status = 'running',
              attempted_at = NOW()
            WHERE
              id IN (
                SELECT
                  id
                FROM
                  next_jobs
              ) RETURNING *`,
          [queue],
        ),
      )

        .pipe(Effect.map((result) => result.rows))
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => runHandler(job, options), {
              concurrency: "unbounded",
            }),
          ),
        )
        .pipe(Effect.asUnit);

    const listJobs = <K extends keyof Queues>(
      options?: SidetrackListJobsOptions<Queues, K>,
    ) =>
      // get jobs
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs ${
            options?.queue
              ? typeof options.queue === "string"
                ? "WHERE queue = $1"
                : "WHERE queue = ANY($1)"
              : ""
          }`,
          options?.queue ? [options?.queue] : undefined,
        ),
      ).pipe(Effect.map((result) => result.rows));

    const listJobStatuses = (options?: SidetrackListJobStatusesOptions) =>
      // get jobs and group by status
      Effect.promise(() =>
        (options?.databaseClient || databaseClient).execute<{
          count: string;
          status: SidetrackJobStatusEnum;
        }>(`SELECT status, count(*) FROM sidetrack_jobs GROUP BY status`),
      ).pipe(
        Effect.map((result) =>
          fromIterable(result.rows, (row) => [row.status, row.count]),
        ),
      );

    return {
      cancelJob,
      deleteJob,
      getJob,
      insertJob,
      listJobStatuses,
      listJobs,
      runJob,
      runQueue,
      start,
      stop,
    };
  });
}
