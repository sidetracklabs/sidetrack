import { Cron, pipe } from "effect";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { fromIterableWith } from "effect/Record";
import * as Record from "effect/Record";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import pg from "pg";

import { SidetrackDatabaseClient, usePg } from "./client";
import { runMigrations } from "./migrations";
import SidetrackCronJobs from "./models/generated/public/SidetrackCronJobs";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/generated/public/SidetrackJobStatusEnum";
import {
  PollingInterval,
  SidetrackCancelJobOptions,
  SidetrackCronJobOptions,
  SidetrackDeactivateCronScheduleOptions,
  SidetrackDeleteCronScheduleOptions,
  SidetrackDeleteJobOptions,
  SidetrackGetJobOptions,
  SidetrackInsertJobOptions,
  SidetrackJob,
  SidetrackJobRunError,
  SidetrackListJobsOptions,
  SidetrackListJobStatusesOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
  SidetrackRunJobOptions,
  SidetrackRunJobsOptions,
} from "./types";

export interface SidetrackService<Queues extends SidetrackQueuesGenericType> {
  cancelJob: (
    jobId: string,
    options?: SidetrackCancelJobOptions,
  ) => Effect.Effect<void>;
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
   * Schedule a cron job on a queue
   * @param queueName - The queue to schedule the cron job on
   * @param cronExpression - A 5 or 6 part cron expression
   */
  scheduleCron: <K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    payload: Queues[K],
    options?: SidetrackCronJobOptions,
  ) => Effect.Effect<SidetrackCronJobs, Cron.ParseError>;

  /**
   * Automatically run migrations and start polling the DB for jobs
   */
  start: () => Effect.Effect<void>;

  /**
   * Turn off polling
   */
  stop: () => void;

  /**
   * Utilities meant to be used with tests only
   */
  testUtils: {
    /**
     * Test utility to get a list of job statuses and their counts
     */
    listJobStatuses: <K extends keyof Queues>(
      options?: SidetrackListJobStatusesOptions<Queues, K>,
    ) => Effect.Effect<Partial<Record<SidetrackJobStatusEnum, number>>>;
    /**
     * Test utility to get a list of jobs
     */
    listJobs: <K extends keyof Queues>(
      options?: SidetrackListJobsOptions<Queues, K>,
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
      options?: SidetrackRunJobsOptions<Queues, K>,
    ) => Effect.Effect<void, unknown>;
  };
}

const pollingIntervalMs = (
  pollingInterval?: PollingInterval,
  defaultValue = 2000,
) =>
  Duration.isDuration(pollingInterval)
    ? pollingInterval
    : pollingInterval
      ? Duration.millis(pollingInterval)
      : Duration.millis(defaultValue);

export const getSidetrackService = <
  Queues extends SidetrackQueuesGenericType,
>() =>
  Context.GenericTag<SidetrackService<Queues>>(
    "@sidetracklabs/sidetrack/effect/service",
  );

export function layer<Queues extends SidetrackQueuesGenericType>(
  layerOptions: SidetrackOptions<Queues>,
): Layer.Layer<SidetrackService<Queues>> {
  return Layer.scoped(
    getSidetrackService<Queues>(),
    Effect.gen(function* () {
      const layerScope = yield* Effect.scope;
      const queues = layerOptions.queues;
      const databaseOptions = layerOptions.databaseOptions;
      const pool =
        !layerOptions.dbClient &&
        !layerOptions.disableDbClientInitialization &&
        databaseOptions
          ? new pg.Pool({ connectionString: databaseOptions.databaseUrl })
          : undefined;

      const dbClient: SidetrackDatabaseClient =
        layerOptions.dbClient ??
        (pool
          ? usePg(pool)
          : (() => {
              if (layerOptions.disableDbClientInitialization) {
                return {
                  execute: () => {
                    throw new Error(
                      "You are trying to execute a sidetrack method without a database client passed in or initialized.",
                    );
                  },
                };
              } else {
                throw new Error(
                  "No database client set for sidetrack, you must pass in a connection string or a custom db client",
                );
              }
            })());

      const globalPayloadTransformer = layerOptions.payloadTransformer;

      const payloadSerializer = <K extends keyof Queues>(
        queueName: K,
        payload: Queues[K],
      ) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        queues[queueName].payloadTransformer
          ? (queues[queueName].payloadTransformer.serialize(
              payload,
            ) as Queues[K])
          : globalPayloadTransformer
            ? (globalPayloadTransformer.serialize(payload) as Queues[K])
            : payload;

      const payloadDeserializer = <K extends keyof Queues>(
        queueName: K,
        payload: Queues[K],
      ) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        queues[queueName].payloadTransformer
          ? (queues[queueName].payloadTransformer.deserialize(
              payload,
            ) as Queues[K])
          : globalPayloadTransformer
            ? (globalPayloadTransformer.deserialize(payload) as Queues[K])
            : payload;

      const pollingInterval = pollingIntervalMs(layerOptions.pollingInterval);

      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      const pollingFibers: Array<Fiber.RuntimeFiber<number | void, never>> = [];
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      const cronFibers: Array<Fiber.RuntimeFiber<number | void, never>> = [];

      /**
       * Each queue is polled separately for new jobs, and the polling interval can be configured per queue
       */
      const startPolling = () =>
        Effect.forEach(
          Record.toEntries(queues),
          ([queueName, queue]) =>
            Effect.promise(() =>
              dbClient.execute<SidetrackJobs>(
                `WITH next_jobs AS (
                  SELECT
                    id
                  FROM
                    sidetrack_jobs
                  WHERE
                    (status = 'scheduled' OR status = 'retrying')
                    AND scheduled_at <= NOW()
                    AND queue = $1
                  ORDER BY
                    scheduled_at
                  FOR UPDATE SKIP LOCKED
                )
                UPDATE sidetrack_jobs
                SET
                  status = 'running',
                  attempted_at = NOW()
                WHERE
                  id IN (SELECT id FROM next_jobs)
                RETURNING *`,
                [queueName],
              ),
            ).pipe(
              Effect.map((result) => result.rows),
              Effect.flatMap((result) =>
                Effect.forEach(
                  result,
                  (job) =>
                    executeJobRunner(job).pipe(
                      Effect.catchAllCause(Effect.logError),
                      Effect.forkDaemon,
                    ),
                  {
                    concurrency: "inherit",
                  },
                ),
              ),
              Effect.repeat(
                Schedule.spaced(
                  queue.pollingInterval
                    ? pollingIntervalMs(queue.pollingInterval)
                    : pollingInterval,
                ),
              ),
              Effect.catchAllCause(Effect.logError),
              Effect.forkIn(layerScope),
              Effect.tap((fiber) =>
                Effect.sync(() => {
                  pollingFibers.push(fiber);
                }),
              ),
              Effect.withSpan("sidetrack.startPolling", {
                attributes: { queue: queueName },
              }),
            ),
          { concurrency: "inherit" },
        );

      const start = () =>
        pipe(
          !!databaseOptions?.databaseUrl,
          Effect.if({
            onFalse: () =>
              // TODO migrations can't be performed with a custom client currently
              Effect.logWarning(
                "No connection string provided, cannot run sidetrack migrations",
              ),
            onTrue: () =>
              Effect.promise(() =>
                databaseOptions?.databaseUrl
                  ? runMigrations(databaseOptions.databaseUrl)
                  : Promise.resolve(),
              ),
          }),
          Effect.flatMap(() => startPolling()),
          Effect.flatMap(() => startCronSchedules()),
          Effect.withSpan("sidetrack.start"),
        );

      const cancelJob = (jobId: string, options?: SidetrackCancelJobOptions) =>
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute(
            `UPDATE sidetrack_jobs
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE id = $1`,
            [jobId],
          ),
        ).pipe(
          Effect.asVoid,
          Effect.withSpan("sidetrack.cancelJob", {
            attributes: { jobId },
          }),
        );

      // TODO should we return the deleted job or the number of rows deleted? There is a difference between a job actually being deleted and a job not being found
      const deleteJob = (jobId: string, options?: SidetrackDeleteJobOptions) =>
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute(
            `DELETE FROM sidetrack_jobs
             WHERE id = $1`,
            [jobId],
          ),
        ).pipe(
          Effect.asVoid,
          Effect.withSpan("sidetrack.deleteJob", {
            attributes: { jobId },
          }),
        );

      const stop = () => {
        pollingFibers.forEach((fiber) =>
          fiber.unsafeInterruptAsFork(fiber.id()),
        );
        cronFibers.forEach((fiber) => fiber.unsafeInterruptAsFork(fiber.id()));
        pollingFibers.length = 0;
        cronFibers.length = 0;
      };

      const executeJobRunner = (
        job: SidetrackJobs,
        options?: { dbClient?: SidetrackDatabaseClient },
      ) =>
        Effect.tryPromise({
          catch: (e) =>
            new SidetrackJobRunError({
              cause: e,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
              message: (e as any).message,
            }),
          try: () =>
            queues[job.queue]!.run(
              payloadDeserializer(job.queue, job.payload as Queues[string]),
              {
                job: job as SidetrackJob<Queues[string]>,
              },
            ),
        }).pipe(
          Effect.flatMap(() =>
            Effect.promise(() =>
              (options?.dbClient ?? dbClient).execute(
                `UPDATE sidetrack_jobs
                 SET
                   status = 'completed',
                   current_attempt = current_attempt + 1,
                   completed_at = NOW()
                 WHERE id = $1`,
                [job.id],
              ),
            ),
          ),
          Effect.catchTag("SidetrackJobRunError", (jobRunError) =>
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
                  `UPDATE sidetrack_jobs
                   SET
                     status = 'retrying',
                     scheduled_at = NOW() + interval '${backoff} seconds',
                     current_attempt = current_attempt + 1,
                     errors = (
                       CASE
                         WHEN errors IS NULL THEN '[]'::JSONB
                         ELSE errors
                       END
                     ) || $2::jsonb
                   WHERE id = $1`,
                  [
                    job.id,
                    // TODO make sure we handle cases where this is not an Error, and also not serializable?
                    JSON.stringify(
                      jobRunError.cause,
                      Object.getOwnPropertyNames(jobRunError.cause),
                    ),
                  ],
                );
              } else {
                return (options?.dbClient ?? dbClient).execute(
                  `UPDATE sidetrack_jobs
                   SET
                     status = 'failed',
                     attempted_at = NOW(),
                     failed_at = NOW(),
                     current_attempt = current_attempt + 1,
                     errors = (
                       CASE
                         WHEN errors IS NULL THEN '[]'::JSONB
                         ELSE errors
                       END
                     ) || $2::jsonb
                   WHERE id = $1`,
                  [
                    job.id,
                    // TODO make sure we handle cases where this is not an Error, and also not serializable?
                    JSON.stringify(
                      jobRunError.cause,
                      Object.getOwnPropertyNames(jobRunError.cause),
                    ),
                  ],
                );
              }
            }),
          ),
          Effect.asVoid,
          Effect.withSpan("sidetrack.executeJobRunner", {
            attributes: { jobId: job.id, queue: job.queue },
          }),
        );

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
             )
             VALUES (
               'scheduled',
               $1,
               $2,
               0,
               COALESCE($3, 1),
               COALESCE($4, NOW()),
               $5
             )
             ${
               options?.suppressDuplicateUniqueKeyErrors
                 ? "ON CONFLICT (unique_key) DO NOTHING"
                 : ""
             }
             RETURNING *`,
            [
              queueName,
              payloadSerializer(queueName, payload),
              queues[queueName]?.maxAttempts,
              options?.scheduledAt
                ? DateTime.isDateTime(options.scheduledAt)
                  ? DateTime.toDateUtc(options.scheduledAt)
                  : options?.scheduledAt
                : undefined,
              options?.uniqueKey,
            ],
          ),
        ).pipe(
          Effect.map((result) => result.rows[0]!),
          Effect.withSpan("sidetrack.insertJob", {
            attributes: {
              queue: queueName,
              uniqueKey: options?.uniqueKey,
            },
          }),
        );

      const getJob = (jobId: string, options?: SidetrackGetJobOptions) =>
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute<SidetrackJobs>(
            `SELECT *
             FROM sidetrack_jobs
             WHERE id = $1`,
            [jobId],
          ),
        ).pipe(
          Effect.map((result) => result.rows[0]!),
          Effect.withSpan("sidetrack.getJob", {
            attributes: { jobId },
          }),
        );

      const scheduleCron = <K extends keyof Queues>(
        queueName: K,
        cronExpression: string,
        payload: Queues[K],
        options?: SidetrackCronJobOptions,
      ) =>
        Cron.parse(
          cronExpression,
          options?.timezone
            ? DateTime.isTimeZone(options.timezone)
              ? options.timezone
              : DateTime.zoneUnsafeMakeNamed(options.timezone)
            : undefined,
        ).pipe(
          Effect.flatMap((_cron) =>
            Effect.promise(() =>
              (options?.dbClient || dbClient).execute<SidetrackCronJobs>(
                `INSERT INTO sidetrack_cron_jobs (
                   queue,
                   cron_expression,
                   payload,
                   timezone
                 )
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (queue, cron_expression)
                 DO UPDATE SET
                   payload = $3,
                   timezone = $4
                 RETURNING *`,
                [
                  queueName,
                  cronExpression,
                  payload,
                  options?.timezone
                    ? DateTime.isTimeZone(options.timezone)
                      ? DateTime.zoneToString(options.timezone)
                      : options.timezone
                    : undefined,
                ],
              ),
            ),
          ),
          Effect.map((result) => result.rows[0]!),
          Effect.tap((cronJob) => startCronJob(cronJob, options)),
          Effect.withSpan("sidetrack.scheduleCron", {
            attributes: {
              cronExpression,
              queue: queueName,
              timezone: options?.timezone,
            },
          }),
        );

      /**
       * @internal
       */
      const startCronSchedules = () =>
        Effect.promise(() =>
          dbClient.execute<SidetrackCronJobs>(
            `SELECT *
             FROM sidetrack_cron_jobs`,
          ),
        ).pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result.rows, (cronJob) => startCronJob(cronJob), {
              concurrency: "inherit",
            }),
          ),
          Effect.withSpan("sidetrack.startCronSchedules"),
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
        return Cron.parse(
          cronJob.cron_expression,
          cronJob.timezone
            ? DateTime.zoneUnsafeMakeNamed(cronJob.timezone)
            : undefined,
        ).pipe(
          Stream.flatMap((cron) => Stream.fromSchedule(Schedule.cron(cron))),
          Stream.mapEffect((value) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            insertJob(cronJob.queue, cronJob.payload as any, {
              ...options,
              suppressDuplicateUniqueKeyErrors: true,
              uniqueKey: value.toString(),
            }),
          ),
          Stream.catchAllCause(Effect.logError),
          Stream.runDrain,
          Effect.forkIn(layerScope),
          Effect.tap((fiber) =>
            Effect.sync(() => {
              cronFibers.push(fiber);
            }),
          ),
          Effect.withSpan("sidetrack.startCronJob", {
            attributes: {
              cronExpression: cronJob.cron_expression,
              queue: cronJob.queue,
            },
          }),
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
            `UPDATE sidetrack_cron_jobs
             SET status = 'inactive'
             WHERE queue = $1
             AND cron_expression = $2`,
            [queueName, cronExpression],
          ),
        ).pipe(
          Effect.asVoid,
          Effect.withSpan("sidetrack.deactivateCronSchedule", {
            attributes: { cronExpression, queue: queueName },
          }),
        );

      // TODO should we return the deleted cron job or the number of rows deleted? There is a difference between a cron job actually being deleted and a cron job not being found
      const deleteCronSchedule = <K extends keyof Queues>(
        queueName: K,
        cronExpression: string,
        options?: SidetrackDeleteCronScheduleOptions,
      ) =>
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute(
            `DELETE FROM sidetrack_cron_jobs
             WHERE queue = $1
             AND cron_expression = $2`,
            [queueName, cronExpression],
          ),
        ).pipe(
          Effect.asVoid,
          Effect.withSpan("sidetrack.deleteCronSchedule", {
            attributes: { cronExpression, queue: queueName },
          }),
        );

      const runJob = (jobId: string, options?: SidetrackRunJobOptions) =>
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute<SidetrackJobs>(
            `WITH next_job AS (
               SELECT id
               FROM sidetrack_jobs
               WHERE
                 (status = 'scheduled' OR status = 'retrying')
                 AND id = $1
               ORDER BY scheduled_at
               FOR UPDATE SKIP LOCKED
             )
             UPDATE sidetrack_jobs
             SET
               status = 'running',
               attempted_at = NOW()
             WHERE
               id IN (SELECT id FROM next_job)
             RETURNING *`,
            [jobId],
          ),
        ).pipe(
          Effect.map((result) => result.rows[0]!),
          Effect.flatMap((job) => executeJobRunner(job, options)),
          Effect.withSpan("sidetrack.runJob", {
            attributes: { jobId },
          }),
        );

      const runJobs = <K extends keyof Queues>(
        options?: SidetrackRunJobsOptions<Queues, K>,
      ) =>
        Effect.promise(() =>
          (options?.dbClient ?? dbClient).execute<SidetrackJobs>(
            `WITH next_jobs AS (
               SELECT id
               FROM sidetrack_jobs
               WHERE
                 (status = 'scheduled' OR status = 'retrying')
                 ${options?.includeFutureJobs ? "" : "AND scheduled_at <= NOW()"}
                 ${
                   options?.queue
                     ? typeof options.queue === "string"
                       ? "AND queue = $1"
                       : "AND queue = ANY($1)"
                     : ""
                 }
               ORDER BY scheduled_at
               FOR UPDATE SKIP LOCKED
             )
             UPDATE sidetrack_jobs
             SET
               status = 'running',
               attempted_at = NOW()
             WHERE
               id IN (SELECT id FROM next_jobs)
             RETURNING *`,
            options?.queue ? [options?.queue] : undefined,
          ),
        ).pipe(
          Effect.map((result) => result.rows),
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => executeJobRunner(job, options), {
              concurrency: "inherit",
              discard: true,
            }),
          ),
          Effect.withSpan("sidetrack.runJobs", {
            attributes: {
              includeFutureJobs: options?.includeFutureJobs,
              queue: options?.queue,
            },
          }),
        );

      const listJobs = <K extends keyof Queues>(
        options?: SidetrackListJobsOptions<Queues, K>,
      ) =>
        // get jobs
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute<SidetrackJobs>(
            `SELECT *
             FROM sidetrack_jobs
             ${
               options?.queue
                 ? typeof options.queue === "string"
                   ? "WHERE queue = $1"
                   : "WHERE queue = ANY($1)"
                 : ""
             }`,
            options?.queue ? [options?.queue] : undefined,
          ),
        ).pipe(
          Effect.map((result) => result.rows),
          Effect.withSpan("sidetrack.listJobs", {
            attributes: {
              queue: options?.queue,
            },
          }),
        );

      const listJobStatuses = <K extends keyof Queues>(
        options?: SidetrackListJobStatusesOptions<Queues, K>,
      ) =>
        // get jobs and group by status
        Effect.promise(() =>
          (options?.dbClient || dbClient).execute<{
            count: number;
            status: SidetrackJobStatusEnum;
          }>(
            // unsafely cast to int for now because you probably won't have 2 billion jobs
            `SELECT
               status,
               count(*)::integer
             FROM sidetrack_jobs
             ${
               options?.queue
                 ? typeof options.queue === "string"
                   ? "WHERE queue = $1"
                   : "WHERE queue = ANY($1)"
                 : ""
             }
             GROUP BY status`,
            options?.queue ? [options?.queue] : undefined,
          ),
        ).pipe(
          Effect.map((result) =>
            fromIterableWith(result.rows, (row) => [row.status, row.count]),
          ),
          Effect.withSpan("sidetrack.listJobStatuses", {
            attributes: {
              queue: options?.queue,
            },
          }),
        );

      if (layerOptions.startOnInitialization) {
        yield* start();
      }

      return {
        cancelJob,
        deactivateCronSchedule,
        deleteCronSchedule,
        deleteJob,
        getJob,
        insertJob,
        scheduleCron,
        start,
        stop,
        testUtils: {
          listJobStatuses,
          listJobs,
          runJob,
          runJobs,
        },
      };
    }),
  );
}
