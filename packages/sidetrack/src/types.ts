import { JsonValue } from "type-fest";

import { SidetrackDatabaseClient } from "./client";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";

export interface SidetrackInsertJobOptions {
  databaseClient?: SidetrackDatabaseClient;
  scheduledAt?: Date;
}

export interface SidetrackCancelJobOptions {
  databaseClient?: SidetrackDatabaseClient;
}

export interface SidetrackGetJobOptions {
  databaseClient?: SidetrackDatabaseClient;
}

export interface SidetrackDeleteJobOptions {
  databaseClient?: SidetrackDatabaseClient;
}

export interface SidetrackListJobsOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  databaseClient?: SidetrackDatabaseClient | undefined;
  queue?: K | K[] | undefined;
}

export interface SidetrackListJobStatusesOptions {
  databaseClient?: SidetrackDatabaseClient;
}

export interface SidetrackRunJobOptions {
  databaseClient?: SidetrackDatabaseClient;
}

export interface SidetrackRunJobsOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  databaseClient?: SidetrackDatabaseClient;
  includeFutureJobs?: boolean;
  queue?: K | K[] | undefined;
}

export interface SidetrackOptions<Queues extends SidetrackQueuesGenericType> {
  databaseClient?: SidetrackDatabaseClient;
  databaseOptions?: {
    connectionString: string;
  };
  queues: SidetrackQueues<Queues>;
}

export class SidetrackHandlerError {
  readonly _tag = "SidetrackHandlerError";
  constructor(readonly error: unknown) {}
}

export type SidetrackJob<Payload extends JsonValue> = Omit<
  SidetrackJobs,
  "payload"
> & { payload: Payload };

export type SidetrackQueues<Queues extends Record<string, JsonValue>> = {
  [K in keyof Queues]: {
    handler: (job: SidetrackJob<Queues[K]>) => Promise<unknown>;
    options?: {
      maxAttempts?: number;
    };
  };
};

export type SidetrackQueuesGenericType = Record<
  string,
  Record<string, JsonValue>
>;
