import { QueryAdapter } from "./adapter";

export interface SidetrackInsertOption {
  adapter?: QueryAdapter;
  scheduledAt?: Date;
}

export interface SidetrackOptions<Queues extends Record<string, unknown>> {
  databaseOptions: {
    connectionString: string;
  };
  queryAdapter?: QueryAdapter;
  queues: Queues;
}

export class SidetrackHandlerError {
  readonly _tag = "SidetrackHandlerError";
  constructor(readonly error: unknown) {}
}

export type SidetrackQueues<
  Queues extends Record<string, Record<string, unknown>>,
> = {
  [K in keyof Queues]: {
    handler: (payload: Queues[K]) => Promise<unknown>;
    options?: {
      maxAttempts?: number;
    };
  };
};
