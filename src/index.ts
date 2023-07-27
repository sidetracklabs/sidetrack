import { Pool, Client } from "pg";
import * as Effect from "@effect/io/Effect";
import * as Schedule from "@effect/io/Schedule";
import * as Duration from "@effect/data/Duration";
import { pipe } from "@effect/data/Function";
import * as Fiber from "@effect/io/Fiber";
import pg_migrate from "node-pg-migrate";
import { fromIterable } from "@effect/data/ReadonlyRecord";
import SidetrackJobs from "./models/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/public/SidetrackJobStatusEnum";

interface QueryAdapter {
  execute: <ResultRow>(
    query: string,
    params?: any[],
  ) => Promise<{ rows: ResultRow[] }>;
}

export const makePgAdapter = (pgClient: Pool | Client): QueryAdapter => ({
  execute: async (query, params) => {
    const result = await pgClient.query(query, params);
    return {
      rows: result.rows,
    };
  },
});

// TODO how to infer the payload type, make it generic?
interface InsertOptions {
  scheduledAt?: Date;
  // TODO this might be a queue-level setting instead of a job-level setting
  maxAttempts?: number;
  adapter?: QueryAdapter;
}

// interface Queue<Name, Payload> {
//   name: Name;
//   handler: (payload: Payload) => Promise<any>;
//   options?: never;
// }

interface SidetrackOptions<Queues extends Record<string, unknown>> {
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

const runMigrations = async (connectionString: string) =>
  pg_migrate({
    databaseUrl: connectionString,
    migrationsTable: "sidetrack_migrations",
    dir: "migrations",
    direction: "up",
  });

type SidetrackQueues<
  Name extends string,
  Payload extends Record<string, unknown>,
> = {
  [key in Name]: {
    handler: (payload: Payload) => any;
    options?: never;
  };
};

export class Sidetrack<
  Name extends string,
  Payload extends Record<string, unknown>,
  Queues extends SidetrackQueues<Name, Payload>,
> {
  queryAdapter: QueryAdapter;
  pool: Pool | undefined;
  queues = {} as any; // ;
  databaseOptions: { connectionString: string };
  pollingFiber: Fiber.Fiber<any, any> | undefined;

  constructor(options: SidetrackOptions<Queues>) {
    this.queues = options.queues;
    // options.queues.map((queue) => {
    //   this.queues[queue.name] = {
    //     handler: queue.handler,
    //     options: queue.options,
    //   };
    // });
    this.databaseOptions = options.databaseOptions;
    this.pool = undefined;
    this.queryAdapter = options.queryAdapter ?? {
      execute: async (_query, _params) => {
        throw new Error(
          "Query adapter not found: You must run the start() function before using sidetrack, or pass in a custom adapter.",
        );
      },
    };
  }

  async getJob(
    jobId: string,
    options?: { adapter?: QueryAdapter },
  ): Promise<SidetrackJobs> {
    return (
      await (options?.adapter || this.queryAdapter).execute<SidetrackJobs>(
        `SELECT * FROM sidetrack_jobs WHERE id = $1`,
        [jobId],
      )
    ).rows[0];
  }

  async insert(
    queueName: Name,
    payload: Payload,
    options?: InsertOptions,
  ): Promise<SidetrackJobs> {
    // TODO the return value should not be casted, otherwise it will truncate at 2 billion
    return (
      await (options?.adapter || this.queryAdapter).execute<SidetrackJobs>(
        `INSERT INTO sidetrack_jobs (
		status,
		queue,
		payload,
		current_attempt,
		max_attempts
	      ) VALUES ('scheduled', $1, $2, 0, $3) RETURNING *`,
        [queueName, payload, options?.maxAttempts ?? 1],
      )
    ).rows[0];
  }

  async cancel(jobId: string, options?: { adapter?: QueryAdapter }) {
    // TODO can you cancel a completed job?
    // TODO do we actually interupt the running promise
    return (
      await (options?.adapter || this.queryAdapter).execute(
        `UPDATE sidetrack_jobs SET status = 'cancelled' WHERE id = $1`,
        [jobId],
      )
    ).rows[0];
  }

  async delete(jobId: string, options?: { adapter?: QueryAdapter }) {
    // TODO can you delete a running job?
    return (
      await (options?.adapter || this.queryAdapter).execute(
        `DELETE FROM sidetrack_jobs WHERE id = $1`,
        [jobId],
      )
    ).rows[0];
  }

  async start() {
    if (!this.queryAdapter) {
      this.pool = new Pool(this.databaseOptions);
      this.queryAdapter = {
        execute: async (query, params) => {
          const queryResult = await this.pool?.query(query, params);
          return { rows: queryResult?.rows ?? ([] as any[]) };
        },
      };
    }

    // TODO migrations can't be performed with a custom adapter currently
    await runMigrations(this.databaseOptions.connectionString);

    return this.startPolling();
  }

  async startPolling() {
    return Effect.runPromise(
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        this.queryAdapter.execute<SidetrackJobs>(
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
            Effect.promise(() =>
              Promise.all(result.map((job) => this.runHandler(job))),
            ),
          ),
        )
        // Decrease polling time potentially?
        .pipe(Effect.repeat(Schedule.spaced(Duration.millis(500))))
        .pipe(Effect.catchAllCause(Effect.logError))
        .pipe(Effect.forkDaemon)
        .pipe(
          Effect.flatMap((fiber) =>
            Effect.sync(() => (this.pollingFiber = fiber)),
          ),
        ),
    );
  }

  async cleanup() {
    if (this.pollingFiber) {
      return Effect.runPromise(Fiber.interrupt(this.pollingFiber));
    }
  }

  async runHandler(job: any) {
    return Effect.runPromise(
      pipe(
        Effect.tryPromise({
          try: () => this.queues[job.queue].handler(job.payload),
          catch: (e) => {
            return new HandlerError(e);
          },
        }),
        Effect.flatMap(() =>
          Effect.promise(() =>
            this.queryAdapter.execute(
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

                    return this.queryAdapter.execute(
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
                    return this.queryAdapter.execute(
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
                  console.log("UPDATING THE JOB TABLE FAILED", e);
                  return e;
                },
              }),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * ==================
   * Test Utilities
   * ==================
   */

  // TODO potentially return job info?
  async runJob(jobId: string, options?: { adapter?: QueryAdapter }) {
    // mark as running, and then run job.
    return Effect.runPromise(
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        (options?.adapter || this.queryAdapter).execute<SidetrackJobs>(
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
            Effect.promise(() =>
              Promise.all(result.map((job) => this.runHandler(job))),
            ),
          ),
        ),
    );
  }

  async runQueue(
    queue: string,
    options?: { runScheduled?: boolean; adapter?: QueryAdapter },
  ) {
    // mark as running, and then run job.
    return Effect.runPromise(
      Effect.promise(() =>
        // TODO type a sidetrack job table (or generate the types from the database)
        this.queryAdapter.execute<SidetrackJobs>(
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
        ),
      )

        .pipe(Effect.map((result) => result.rows))
        // TODO this probably needs to be forked so it doesn't block the polling
        .pipe(
          Effect.flatMap((result) =>
            Effect.promise(() =>
              Promise.all(result.map((job) => this.runHandler(job))),
            ),
          ),
        ),
    );
  }

  async list_jobs(options?: { queue?: string; adapter?: QueryAdapter }) {
    // get jobs
    return Effect.runPromise(
      Effect.promise(() =>
        (options?.adapter || this.queryAdapter).execute<SidetrackJobs>(
          `SELECT * FROM sidetrack_jobs ${
            options?.queue ? "WHERE queue = $1" : ""
          }}`,
          options?.queue ? [options?.queue] : undefined,
        ),
      ).pipe(Effect.map((result) => result.rows)),
    );
  }

  async list_job_statuses(options?: { adapter?: QueryAdapter }) {
    // get jobs and group by status
    return Effect.runPromise(
      Effect.promise(() =>
        (options?.adapter || this.queryAdapter).execute<{
          status: SidetrackJobStatusEnum;
          count: string;
        }>(`SELECT status, count(*) FROM sidetrack_jobs GROUP BY status`),
      ).pipe(
        Effect.map((result) =>
          fromIterable(result.rows, (row) => [row.status, row.count]),
        ),
      ),
    );
  }
}
