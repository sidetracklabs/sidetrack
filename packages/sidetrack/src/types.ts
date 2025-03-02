import { Data, Duration } from "effect";
import { DateTime, TimeZone } from "effect/DateTime";

import { SidetrackDatabaseClient } from "./client";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";

export interface SidetrackInsertJobOptions {
  dbClient?: SidetrackDatabaseClient;
  scheduledAt?: Date | DateTime;
  suppressDuplicateUniqueKeyErrors?: boolean;
  uniqueKey?: string;
}

export interface SidetrackCronJobOptions {
  dbClient?: SidetrackDatabaseClient;
  timezone?: TimeZone | string;
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

export interface SidetrackListJobStatusesOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  dbClient?: SidetrackDatabaseClient;
  queue?: K | K[] | undefined;
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

export type PollingInterval = Duration.Duration | number;

export interface SidetrackOptions<Queues extends SidetrackQueuesGenericType> {
  databaseOptions?: {
    databaseUrl: string;
  };
  dbClient?: SidetrackDatabaseClient;
  payloadTransformer?: SidetrackPayloadTransformer;
  /**
   * Number of milliseconds to wait between polling for new jobs
   * Alternatively, pass in an Duration (@link https://effect-ts.github.io/effect/effect/Duration.ts.html)
   */
  pollingInterval?: PollingInterval;
  queues: SidetrackQueues<Queues>;
}

export class SidetrackJobRunError extends Data.TaggedError(
  "SidetrackJobRunError",
)<{
  cause: unknown;
  message: string;
}> {}

export type SidetrackJob<Payload> = Omit<SidetrackJobs, "payload"> & {
  payload: Payload;
};

export interface SidetrackJobContext<Payload> {
  job: SidetrackJob<Payload>;
}

export type SidetrackQueues<Queues extends SidetrackQueuesGenericType> = {
  [K in keyof Queues]: {
    maxAttempts?: number;
    payloadTransformer?: SidetrackPayloadTransformer;
    /**
     * Number of milliseconds to wait between polling for new jobs
     * Alternatively, pass in a Duration (@link https://effect-ts.github.io/effect/effect/Duration.ts.html)
     */
    pollingInterval?: PollingInterval;
    run: (
      payload: Queues[K],
      context: SidetrackJobContext<Queues[K]>,
    ) => Promise<unknown>;
  };
};

// TODO making this type more specific causes issues with TypeScript when passing in types/interfaces for the queue types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SidetrackQueuesGenericType = Record<string, any>;

export interface SidetrackPayloadTransformer {
  /**
   * Transform payload prior to running the job.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deserialize<T>(payload: T): any;

  /**
   * Transform payload prior to storing in the database
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serialize<T>(payload: T): any;
}
