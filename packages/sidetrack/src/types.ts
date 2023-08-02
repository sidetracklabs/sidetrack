import { JsonValue } from "type-fest";

import { SidetrackQueryAdapter } from "./adapter";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";

export interface SidetrackInsertJobOptions {
  queryAdapter?: SidetrackQueryAdapter;
  scheduledAt?: Date;
}

export interface SidetrackCancelJobOptions {
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackGetJobOptions {
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackDeleteJobOptions {
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackListJobsOptions<
  Queues extends SidetrackQueuesGenericType,
  K extends keyof Queues,
> {
  queryAdapter?: SidetrackQueryAdapter | undefined;
  queue?: K | K[] | undefined;
}

export interface SidetrackListJobStatusesOptions {
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackRunJobOptions {
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackRunQueueOptions {
  includeFutureJobs?: boolean;
  queryAdapter?: SidetrackQueryAdapter;
}

export interface SidetrackOptions<Queues extends SidetrackQueuesGenericType> {
  databaseOptions?: {
    connectionString: string;
  };
  queryAdapter?: SidetrackQueryAdapter;
  queues: SidetrackQueues<Queues>;
}

export class SidetrackHandlerError {
  readonly _tag = "SidetrackHandlerError";
  constructor(readonly error: unknown) {}
}

export type SidetrackJobWithPayload<Payload extends JsonValue> = Omit<
  SidetrackJobs,
  "payload"
> & { payload: Payload };

export type SidetrackQueues<Queues extends Record<string, JsonValue>> = {
  [K in keyof Queues]: {
    handler: (job: SidetrackJobWithPayload<Queues[K]>) => Promise<unknown>;
    options?: {
      maxAttempts?: number;
    };
  };
};

export type SidetrackQueuesGenericType = Record<
  string,
  Record<string, JsonValue>
>;
