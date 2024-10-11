import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { fromIterableWith } from "effect/Record";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Record from "effect/Record";
import * as Stream from "effect/Stream";
import pg from "pg";

import { SidetrackDatabaseClient, usePg } from "./client";
import { runMigrations } from "./migrations";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/generated/public/SidetrackJobStatusEnum";
import {
  SidetrackCancelJobOptions,
  SidetrackDeleteJobOptions,
  SidetrackGetJobOptions,
  SidetrackHandlerError,
  SidetrackInsertJobOptions,
  SidetrackJob,
  SidetrackListJobsOptions,
  SidetrackListJobStatusesOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
  SidetrackRunJobOptions,
  SidetrackRunJobsOptions,
  SidetrackCronJobOptions,
  SidetrackDeactivateCronScheduleOptions,
  SidetrackDeleteCronScheduleOptions,
} from "./types";
import { Cron } from "effect";
import SidetrackCronJobs from "./models/generated/public/SidetrackCronJobs";

export interface SidetrackService<Queues extends SidetrackQueuesGenericType> {
  cancelJob: (
    jobId: string,
    options?: SidetrackCancelJobOptions,
  ) => Effect.Effect<void>;
  deleteJob: (
    jobId: string,
    options?: SidetrackDeleteJobOptions,
  ) => Effect.Effect<void>;
  getJob: (
    jobId: string,
    options?: SidetrackGetJobOptions,
  ) => Effect.Effect<SidetrackJobs>;
  insertJob: <K extends keyof Queues>(
    queueName: K,
    payload: Queues[K],
    options?: SidetrackInsertJobOptions,
  ) => Effect.Effect<SidetrackJobs>;
  /**
   * Automatically run migrations and start polling the DB for jobs
   */
  start: () => Effect.Effect<void>;

  /**
   * Turn off polling
   */
  stop: () => Effect.Effect<void>;
  /**
   * Schedule a cron job on a queue
   * @param queueName - The queue to schedule the cron job on
   * @param cronExpression - A 5 part cron expression
   */
  scheduleCron: <K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    payload: Queues[K],
    options?: SidetrackCronJobOptions,
  ) => Effect.Effect<SidetrackCronJobs, Cron.ParseError>;

  /**
   * Deactivate a cron schedule. This prevents the cron schedule from creating new jobs.
   * @param queueName - The queue to deactivate the cron job from
   * @param cronExpression - The cron expression to deactivate
   */
  deactivateCronSchedule: <K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    options?: SidetrackDeactivateCronScheduleOptions,
  ) => Effect.Effect<void>;

  /**
   * Delete a cron schedule. This removes the cron job from the database.
   * @param queueName - The queue to delete the cron job from
   * @param cronExpression - The cron expression to delete
   */
  deleteCronSchedule: <K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    options?: SidetrackDeleteCronScheduleOptions,
  ) => Effect.Effect<void>;

  /**
   * Utilities meant to be used with tests only
   */
  testUtils: {
    /**
     * Test utility to get a list of job statuses and their counts
     */
    listJobStatuses: (
      options?: SidetrackListJobStatusesOptions,
    ) => Effect.Effect<Record<SidetrackJobStatusEnum, number>>;
    /**
     * Test utility to get a list of jobs
     */
    listJobs: <K extends keyof Queues>(
      options?: SidetrackListJobsOptions<Queues, K> | undefined,
    ) => Effect.Effect<SidetrackJobs[]>;
    /**
     * Test utility to run a job manually without polling
     */
    runJob: (
      jobId: string,
      options?: SidetrackRunJobOptions,
    ) => Effect.Effect<void, unknown>;
    /**
     * Test utility to run all jobs in a queue manually without polling
     */
    runJobs: <K extends keyof Queues>(
      options?: SidetrackRunJobsOptions<Queues, K> | undefined,
    ) => Effect.Effect<void, unknown>;
  };
}

export const createSidetrackServiceTag = <
  Queues extends SidetrackQueuesGenericType,
>() =>
  Context.GenericTag<SidetrackService<Queues>>(
    "@sidetracklabs/sidetrack/effect/service",
  );

export function makeLayer<Queues extends SidetrackQueuesGenericType>(
  layerOptions: SidetrackOptions<Queues>,
): Layer.Layer<SidetrackService<Queues>> {
  return Layer.sync(createSidetrackServiceTag<Queues>(), () => {
    const queues = layerOptions.queues;
    const databaseOptions = layerOptions.databaseOptions;
    const pool =
      !layerOptions.dbClient && databaseOptions
        ? new pg.Pool(databaseOptions)
        : undefined;
    const dbClient: SidetrackDatabaseClient =
      layerOptions.dbClient ??
      (pool
        ? usePg(pool)
        : (() => {
            throw new Error(
              "No database client set for sidetrack, you must pass in a connection string or a custom db client",
            );
          })());

    const pollingFiber = Ref.unsafeMake<Fiber.Fiber<unknown, unknown>>(
      Fiber.void,
    );

    // TODO should we use a hashmap or supervisor? We'll need to convert this layer into an Effect
    const cronFibers = Ref.unsafeMake(
      Record.empty<string, Fiber.Fiber<unknown, unknown>>(),
    );

    const startPolling = () =>
      Effect.promise(() =>
        dbClient.execute<SidetrackJobs>(
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
                concurrency: "inherit",
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
        )
          .pipe(Effect.flatMap(() => startPolling()))
          .pipe(Effect.flatMap(() => startCronSchedules()));
      };

    const cancelJob = (jobId: string, options?: SidetrackCancelJobOptions) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute(
          `UPDATE sidetrack_jobs SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.asVoid);

    // TODO should we return the deleted job or the number of rows deleted? There is a difference between a job actually being deleted and a job not being found
    const deleteJob = (jobId: string, options?: SidetrackDeleteJobOptions) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute(
          `DELETE FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.asVoid);

    const stop = () =>
      Ref.get(pollingFiber)
        .pipe(Effect.flatMap((fiber) => Fiber.interrupt(fiber)))
        .pipe(
          Effect.flatMap(() => Ref.get(cronFibers)),
          Effect.flatMap((fibers) =>
            Effect.forEach(Record.values(fibers), (fiber) =>
              Fiber.interrupt(fiber),
            ),
          ),
        )
        .pipe(Effect.asVoid);

    const runHandler = (
      job: SidetrackJobs,
      options?: { dbClient?: SidetrackDatabaseClient },
    ) =>
      Effect.tryPromise({
        catch: (e) => {
          return new SidetrackHandlerError(e);
        },
        try: () =>
          queues[job.queue].handler(job as SidetrackJob<Queues[string]>),
      })
        .pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              (options?.dbClient ?? dbClient).execute(
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

                return (options?.dbClient ?? dbClient).execute(
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
                return (options?.dbClient ?? dbClient).execute(
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
        .pipe(Effect.asVoid);

    const insertJob = <K extends keyof Queues>(
      queueName: K,
      payload: Queues[K],
      options?: SidetrackInsertJobOptions,
    ) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute<SidetrackJobs>(
          `INSERT INTO sidetrack_jobs (
      status,
      queue,
      payload,
      current_attempt,
      max_attempts,
      scheduled_at,
      unique_key
          ) VALUES ('scheduled', $1, $2, 0, $3, $4, $5)
          ${
            options?.suppressDuplicateUniqueKeyErrors
              ? "ON CONFLICT (unique_key) DO NOTHING"
              : ""
          }
          RETURNING *`,
          [
            queueName,
            payload,
            queues[queueName].options?.maxAttempts ?? 1,
            options?.scheduledAt ?? new Date(),
            options?.uniqueKey,
          ],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const getJob = (jobId: string, options?: SidetrackGetJobOptions) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const scheduleCron = <K extends keyof Queues>(
      queueName: K,
      cronExpression: string,
      payload: Queues[K],
      options?: SidetrackCronJobOptions,
    ) =>
      Cron.parse(cronExpression)
        .pipe(
          Effect.flatMap((_cron) =>
            Effect.promise(() =>
              (options?.dbClient || dbClient).execute<SidetrackCronJobs>(
                `INSERT INTO sidetrack_cron_jobs (queue, cron_expression, payload)
           VALUES ($1, $2, $3)
           ON CONFLICT (queue, cron_expression) DO UPDATE
           SET payload = $3 RETURNING *`,
                [queueName, cronExpression, payload],
              ),
            ),
          ),
        )

        .pipe(
          Effect.map((result) => result.rows[0]),
          Effect.tap((cronJob) => startCronJob(cronJob, options)),
        );

    /**
     * @internal
     */
    const startCronSchedules = () =>
      Effect.promise(() =>
        dbClient.execute<SidetrackCronJobs>(
          `SELECT * FROM sidetrack_cron_jobs`,
        ),
      ).pipe(
        Effect.flatMap((result) =>
          Effect.forEach(
            result.rows,
            (cronJob) => startCronJob(cronJob, cronJob.payload as any),
            { concurrency: "inherit" },
          ),
        ),
      );

    /**
     * @internal
     */
    const startCronJob = (
      cronJob: SidetrackCronJobs,
      options?: SidetrackCronJobOptions,
    ) => {
      // This grabs the interval within which the cron job is running, and uses that as a unique key so multiple cron jobs on the same schedule don't conflict
      // alternatively, we could explore using cron.next and just using Effect.schedule instead of draining a stream
      return Stream.fromSchedule(Schedule.cron(cronJob.cron_expression)).pipe(
        Stream.mapEffect((value) =>
          insertJob(cronJob.queue, cronJob.payload as any, {
            ...options,
            uniqueKey: value.toString(),
            suppressDuplicateUniqueKeyErrors: true,
          }),
        ),
        Stream.catchAllCause(Effect.logError),
        Stream.runDrain,
        Effect.forkDaemon,
        Effect.flatMap((fiber) =>
          Ref.update(cronFibers, (fibers) =>
            Record.set(fibers, cronJob.id, fiber),
          ),
        ),
      );
    };

    // TODO should we return the updated cron job or the number of rows updated? There is a difference between a cron job actually being updated and a cron job not being found
    const deactivateCronSchedule = <K extends keyof Queues>(
      queueName: K,
      cronExpression: string,
      options?: SidetrackDeactivateCronScheduleOptions,
    ) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute(
          `UPDATE sidetrack_cron_jobs SET status = 'inactive' WHERE queue = $1 AND cron_expression = $2`,
          [queueName, cronExpression],
        ),
      ).pipe(Effect.asVoid);

    // TODO should we return the deleted cron job or the number of rows deleted? There is a difference between a cron job actually being deleted and a cron job not being found
    const deleteCronSchedule = <K extends keyof Queues>(
      queueName: K,
      cronExpression: string,
      options?: SidetrackDeleteCronScheduleOptions,
    ) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute(
          `DELETE FROM sidetrack_cron_jobs WHERE queue = $1 AND cron_expression = $2`,
          [queueName, cronExpression],
        ),
      ).pipe(Effect.asVoid);

    const runJob = (jobId: string, options?: SidetrackRunJobOptions) =>
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute<SidetrackJobs>(
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

    const runJobs = <K extends keyof Queues>(
      options?: SidetrackRunJobsOptions<Queues, K> | undefined,
    ) =>
      Effect.promise(() =>
        (options?.dbClient ?? dbClient).execute<SidetrackJobs>(
          `WITH next_jobs AS (
              SELECT
                id
              FROM
                sidetrack_jobs
              WHERE
              (status = 'scheduled' or status = 'retrying')
                ${options?.includeFutureJobs ? "" : "AND scheduled_at <= NOW()"}
                ${
                  options?.queue
                    ? typeof options.queue === "string"
                      ? "AND queue = $1"
                      : "AND queue = ANY($1)"
                    : ""
                }
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
          options?.queue ? [options?.queue] : undefined,
        ),
      )

        .pipe(Effect.map((result) => result.rows))
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => runHandler(job, options), {
              concurrency: "inherit",
            }),
          ),
        )
        .pipe(Effect.asVoid);

    const listJobs = <K extends keyof Queues>(
      options?: SidetrackListJobsOptions<Queues, K>,
    ) =>
      // get jobs
      Effect.promise(() =>
        (options?.dbClient || dbClient).execute<SidetrackJobs>(
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
        (options?.dbClient || dbClient).execute<{
          count: number;
          status: SidetrackJobStatusEnum;
        }>(
          // unsafely cast to int for now because you probably won't have 2 billion jobs
          `SELECT status, count(*)::integer FROM sidetrack_jobs GROUP BY status`,
        ),
      ).pipe(
        Effect.map((result) =>
          fromIterableWith(result.rows, (row) => [row.status, row.count]),
        ),
      );

    return {
      cancelJob,
      deleteJob,
      getJob,
      insertJob,
      start,
      stop,
      deactivateCronSchedule,
      deleteCronSchedule,
      testUtils: {
        listJobStatuses,
        listJobs,
        runJob,
        runJobs,
      },
      scheduleCron,
    };
  });
}
