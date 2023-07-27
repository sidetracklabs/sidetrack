import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Layer from "@effect/io/Layer";
import SidetrackJobs from "./models/public/SidetrackJobs";
import { Pool, Client } from "pg";

interface QueryAdapter {
  execute: <ResultRow>(
    query: string,
    params?: any[],
  ) => Promise<{ rows: ResultRow[] }>;
}

interface Queue {
  name: string;
  handler: (payload: any) => Promise<any>;
  options?: never;
}

export interface SidetrackService {
  queues: Queue[];
  databaseOptions: {
    connectionString: string;
  };
  queryAdapter: QueryAdapter;
  pool: Pool | undefined;
}

export const SidetrackService = Context.Tag<SidetrackService>();

export const makeLayer = (options: {
  queues: Queue[];
  databaseOptions: {
    connectionString: string;
  };
  queryAdapter?: QueryAdapter;
}) =>
  Layer.sync(SidetrackService, () => {
    const queues = {};

    options.queues.map((queue) => {
      queues[queue.name] = {
        handler: queue.handler,
        options: queue.options,
      };
    });

    return {
      queues: queues,
      databaseOptions: options.databaseOptions,
      pool: undefined,
      queryAdapter: options.queryAdapter ?? {
        execute: async (_query, _params) => {
          throw new Error(
            "Query adapter not found: You must run the start() function before using sidetrack, or pass in a custom adapter.",
          );
        },
      },
    };
  });

export const getJob = (
  jobId: string,
  options?: { queryAdapter?: QueryAdapter },
) =>
  Effect.flatMap(SidetrackService, (service) =>
    Effect.promise(() =>
      (options?.queryAdapter || service.queryAdapter).execute<SidetrackJobs>(
        `SELECT * FROM sidetrack_jobs WHERE id = $1`,
        [jobId],
      ),
    ),
  ).pipe(Effect.map((result) => result.rows[0]));
