import * as Effect from "@effect/io/Effect";
import { pipe } from "@effect/data/Function";
import * as Schedule from "@effect/io/Schedule";
import * as Duration from "@effect/data/Duration";
import * as Context from "@effect/data/Context";
import * as Layer from "@effect/io/Layer";
import * as Fiber from "@effect/io/Fiber";
import * as Exit from "@effect/io/Exit";
import SidetrackJobs from "./models/public/SidetrackJobs";
import { Pool, Client } from "pg";
import { QueryAdapter } from "./adapter";
import { runMigrations } from "./migrations";
import { fromIterable } from "@effect/data/ReadonlyRecord";
import SidetrackJobStatusEnum from "./models/public/SidetrackJobStatusEnum";
import * as Ref from "@effect/io/Ref";
import * as Option from "@effect/data/Option";
export interface SidetrackService<
  Queues extends Record<string, Record<string, unknown>>,
> {
  start: () => Effect.Effect<never, never, void>;
  cleanup: () => Effect.Effect<never, never, Exit.Exit<any, any> | void>;
  cancelJob: (
    jobId: string,
    options?: {
      adapter?: QueryAdapter;
    },
  ) => Effect.Effect<never, never, unknown>;
  deleteJob: (
    jobId: string,
    options?: {
      adapter?: QueryAdapter;
    },
  ) => Effect.Effect<never, never, unknown>;
  insertJob: <K extends keyof Queues>(
    queueName: K,
    payload: Queues[K],
    options?: SidetrackInsertOption,
  ) => Effect.Effect<never, never, SidetrackJobs>;
  getJob: (
    jobId: string,
    options?: {
      adapter?: QueryAdapter;
    },
  ) => Effect.Effect<never, never, SidetrackJobs>;
  runJob: (
    jobId: string,
    options?: {
      adapter?: QueryAdapter;
    },
  ) => Effect.Effect<
    never,
    unknown,
    {
      rows: unknown[];
    }[]
  >;
  runQueue: <K extends keyof Queues>(
    queue: K,
    options?: {
      runScheduled?: boolean;
      adapter?: QueryAdapter;
    },
  ) => Effect.Effect<
    never,
    unknown,
    {
      rows: unknown[];
    }[]
  >;
  listJobs: <K extends keyof Queues>(
    options?:
      | {
          queue?: K | undefined;
          adapter?: QueryAdapter | undefined;
        }
      | undefined,
  ) => Effect.Effect<never, never, SidetrackJobs[]>;
  listJobStatuses: (options?: {
    adapter?: QueryAdapter;
  }) => Effect.Effect<never, never, Record<string, string>>;
}

export interface SidetrackInsertOption {
  scheduledAt?: Date;
  // TODO this might be a queue-level setting instead of a job-level setting
  maxAttempts?: number;
  adapter?: QueryAdapter;
}

export interface SidetrackOptions<Queues extends Record<string, unknown>> {
  queues: Queues;
  databaseOptions: {
    connectionString: string;
  };
  queryAdapter?: QueryAdapter;
}

class HandlerError {
  readonly _tag = "HandlerError";
  constructor(readonly error: unknown) {}
}

export const createSidetrackService = <
  Queues extends Record<string, Record<string, unknown>>,
>() =>
  Context.Tag<SidetrackService<Queues>>(
    Symbol.for("@sidetracklabs/sidetrack/effect/service"),
  );

export type SidetrackQueues<
  Queues extends Record<string, Record<string, unknown>>,
> = {
  [K in keyof Queues]: {
    // TODO return type shouldn't be any
    handler: (payload: Queues[K]) => any;
    options?: never;
  };
};

export function makeLayer<
  Queues extends Record<string, Record<string, unknown>>,
>(options: {
  queues: SidetrackQueues<Queues>;
  databaseOptions: {
    connectionString: string;
  };
  queryAdapter?: QueryAdapter;
}): Layer.Layer<never, never, SidetrackService<Queues>> {
  // TODO we might need to accept this service tag as an argument because it might be unique
  return Layer.sync(createSidetrackService<Queues>(), () => {
    const queues = options.queues;
    const databaseOptions = options.databaseOptions;
    const pool = new Pool(databaseOptions);
    const queryAdapter: QueryAdapter = options.queryAdapter ?? {
      execute: async (query, params) => {
        const queryResult = await pool?.query(query, params);
        return { rows: queryResult?.rows ?? ([] as any[]) };
      },
    };
    // let pool: Pool | undefined = undefined;
    // let queryAdapter = options.queryAdapter ?? {
    // execute: async (_query, _params) => {
    // throw new Error(
    // "Query adapter not found: You must run the start() function before using sidetrack, or pass in a custom adapter.",
    // );
    // },
    // };
    const pollingFiber = Ref.unsafeMake<Option.Option<Fiber.Fiber<any, any>>>(
      Option.none(),
    );

    const startPolling = () =>
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        queryAdapter.execute<SidetrackJobs>(
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
        // TODO this probably needs to be forked so it doesn't block the polling
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => runHandler(job), {
              concurrency: "unbounded",
            }),
          ),
        )
        // Decrease polling time potentially?
        .pipe(Effect.repeat(Schedule.spaced(Duration.millis(500))))
        .pipe(Effect.catchAllCause(Effect.logError))
        .pipe(Effect.forkDaemon)
        .pipe(
          Effect.flatMap((fiber) =>
            Ref.update(pollingFiber, () => Option.some(fiber)),
          ),
        );

    const start = () =>
      // TODO migrations can't be performed with a custom adapter currently
      Effect.promise(() =>
        runMigrations(databaseOptions.connectionString),
      ).pipe(Effect.flatMap(() => startPolling()));

    const cancelJob = (jobId: string, options?: { adapter?: QueryAdapter }) =>
      // TODO can you cancel a completed job?
      // TODO do we actually interupt the running promise
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute(
          `UPDATE sidetrack_jobs SET status = 'cancelled' WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const deleteJob = (jobId: string, options?: { adapter?: QueryAdapter }) =>
      // TODO can you delete a running job?
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute(
          `DELETE FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const cleanup = () =>
      Ref.get(pollingFiber).pipe(
        Effect.flatMap((fiberOption) =>
          Option.match(fiberOption, {
            onNone: () => Effect.unit,
            onSome: (fiber) => Fiber.interrupt(fiber),
          }),
        ),
      );

    const runHandler = (job: SidetrackJobs) =>
      pipe(
        Effect.tryPromise({
          try: () => queues[job.queue].handler(job.payload as Queues[string]),
          catch: (e) => {
            return new HandlerError(e);
          },
        }),
        Effect.flatMap(() =>
          Effect.promise(() =>
            queryAdapter.execute(
              `UPDATE sidetrack_jobs SET status = 'completed', current_attempt = current_attempt + 1, completed_at = NOW() WHERE id = $1`,
              [job.id],
            ),
          ),
        ),
        Effect.catchTag("HandlerError", (handlerError) =>
          Effect.sync(() => console.log("AM I HANDLING ERROR")).pipe(
            Effect.flatMap(() =>
              Effect.tryPromise({
                try: () => {
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

                    return queryAdapter.execute(
                      `UPDATE sidetrack_jobs SET status = 'retrying', scheduled_at = NOW() + interval '${backoff} seconds', current_attempt = current_attempt + 1, errors =
                          (CASE
                              WHEN errors IS NULL THEN '[]'::JSONB
                              ELSE errors
                          END) || $2::jsonb WHERE id = $1`,
                      [
                        job.id,
                        //       TODO make sure we handle cases where this is not an Error, and also not serializable?
                        JSON.stringify(
                          handlerError.error,
                          Object.getOwnPropertyNames(handlerError.error),
                        ),
                      ],
                    );
                  } else {
                    return queryAdapter.execute(
                      `UPDATE sidetrack_jobs SET status = 'failed', attempted_at = NOW(), failed_at = NOW(), current_attempt = current_attempt + 1, errors =
                            (CASE
                            WHEN errors IS NULL THEN '[]'::JSONB
                            ELSE errors
                        END) || $2::jsonb WHERE id = $1`,
                      [
                        job.id,
                        //       TODO make sure we handle cases where this is not an Error, and also not serializable?
                        JSON.stringify(
                          handlerError.error,
                          Object.getOwnPropertyNames(handlerError.error),
                        ),
                      ],
                    );
                  }
                },
                catch: (e) => {
                  // TODO return proper error
                  console.log("UPDATING THE JOB TABLE FAILED", e);
                  return e;
                },
              }),
            ),
          ),
        ),
      );

    const insertJob = <K extends keyof Queues>(
      queueName: K,
      payload: Queues[K],
      options?: SidetrackInsertOption,
    ) =>
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute<SidetrackJobs>(
          `INSERT INTO sidetrack_jobs (
      status,
      queue,
      payload,
      current_attempt,
      max_attempts
          ) VALUES ('scheduled', $1, $2, 0, $3) RETURNING *`,
          [queueName, payload, options?.maxAttempts ?? 1],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const getJob = (jobId: string, options?: { adapter?: QueryAdapter }) =>
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs WHERE id = $1`,
          [jobId],
        ),
      ).pipe(Effect.map((result) => result.rows[0]));

    const runJob = (jobId: string, options?: { adapter?: QueryAdapter }) =>
      // mark as running, and then run job.
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        (options?.adapter || queryAdapter).execute<SidetrackJobs>(
          `WITH next_jobs AS (
              SELECT
                id
              FROM
                sidetrack_jobs
              WHERE
                status != 'running'
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
                  next_jobs
              ) RETURNING *`,
          [jobId],
        ),
      )

        .pipe(Effect.map((result) => result.rows))
        // TODO this probably needs to be forked so it doesn't block the polling
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => runHandler(job), {
              concurrency: "unbounded",
            }),
          ),
        );

    const runQueue = <K extends keyof Queues>(
      queue: K,
      options?: { runScheduled?: boolean; adapter?: QueryAdapter },
    ) =>
      // mark as running, and then run job.
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        queryAdapter.execute<SidetrackJobs>(
          `WITH next_jobs AS (
              SELECT
                id
              FROM
                sidetrack_jobs
              WHERE
                (status != 'running')
                ${
                  options?.runScheduled ? "" : "AND scheduled_at <= NOW()"
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
        // TODO this probably needs to be forked so it doesn't block the polling
        .pipe(
          Effect.flatMap((result) =>
            Effect.forEach(result, (job) => runHandler(job), {
              concurrency: "unbounded",
            }),
          ),
        );

    const listJobs = <K extends keyof Queues>(options?: {
      queue?: K;
      adapter?: QueryAdapter;
    }) =>
      // get jobs
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs ${
            options?.queue ? "WHERE queue = $1" : ""
          }`,
          options?.queue ? [options?.queue] : undefined,
        ),
      ).pipe(Effect.map((result) => result.rows));

    const listJobStatuses = (options?: { adapter?: QueryAdapter }) =>
      // get jobs and group by status
      Effect.promise(() =>
        (options?.adapter || queryAdapter).execute<{
          status: SidetrackJobStatusEnum;
          count: string;
        }>(`SELECT status, count(*) FROM sidetrack_jobs GROUP BY status`),
      ).pipe(
        Effect.map((result) =>
          fromIterable(result.rows, (row) => [row.status, row.count]),
        ),
      );

    return {
      start,
      cleanup,
      getJob,
      insertJob,
      cancelJob,
      deleteJob,
      runJob,
      runQueue,
      listJobs,
      listJobStatuses,
    };
  });
}
