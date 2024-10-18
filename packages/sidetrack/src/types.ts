import { JsonValue } from "type-fest";

import { SidetrackDatabaseClient } from "./client";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";

export interface SidetrackInsertJobOptions {
  dbClient?: SidetrackDatabaseClient;
  scheduledAt?: Date;
  suppressDuplicateUniqueKeyErrors?: boolean;
  uniqueKey?: string;
}

export interface SidetrackCronJobOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackDeactivateCronScheduleOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackDeleteCronScheduleOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackCancelJobOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackGetJobOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackDeleteJobOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackListJobsOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  dbClient?: SidetrackDatabaseClient | undefined;
  queue?: K | K[] | undefined;
}

export interface SidetrackListJobStatusesOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackRunJobOptions {
  dbClient?: SidetrackDatabaseClient;
}

export interface SidetrackRunJobsOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  dbClient?: SidetrackDatabaseClient;
  includeFutureJobs?: boolean;
  queue?: K | K[] | undefined;
}

export interface SidetrackOptions<Queues extends SidetrackQueuesGenericType> {
  databaseOptions?: {
    connectionString: string;
  };
  dbClient?: SidetrackDatabaseClient;
  queues: SidetrackQueues<Queues>;
}

export class SidetrackJobRunError {
  readonly _tag = "SidetrackJobRunError";
  constructor(readonly error: unknown) {}
}

export type SidetrackJob<Payload extends JsonValue> = Omit<
  SidetrackJobs,
  "payload"
> & { payload: Payload };

export type SidetrackQueues<Queues extends Record<string, JsonValue>> = {
  [K in keyof Queues]: {
    options?: {
      maxAttempts?: number;
    };
    run: (
      payload: Queues[K],
      context: { job: SidetrackJob<Queues[K]> },
    ) => Promise<unknown>;
  };
};

export type SidetrackQueuesGenericType = Record<
  string,
  Record<string, JsonValue>
>;
