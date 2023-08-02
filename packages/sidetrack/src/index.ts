import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Runtime from "@effect/io/Runtime";

import {
  createSidetrackServiceTag,
  makeLayer,
  SidetrackService,
} from "./effect";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/generated/public/SidetrackJobStatusEnum";
import { makeAppRuntime } from "./runtime";
import {
  SidetrackCancelJobOptions,
  SidetrackDeleteJobOptions,
  SidetrackGetJobOptions,
  SidetrackInsertJobOptions,
  SidetrackListJobsOptions,
  SidetrackListJobStatusesOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
  SidetrackRunJobOptions,
  SidetrackRunQueueOptions,
} from "./types";

/**
 * Main class that contains all the methods for interacting with Sidetrack
 */
export class Sidetrack<Queues extends SidetrackQueuesGenericType> {
  /** @internal */
  private sidetrackService = createSidetrackServiceTag<Queues>();
  /** @internal */
  private sidetrackLayer: Layer.Layer<never, never, SidetrackService<Queues>>;
  /** @internal */
  private runtimeHandler: {
    close: Effect.Effect<never, never, void>;
    runtime: Runtime.Runtime<SidetrackService<Queues>>;
  };
  /** @internal */
  private runtime: Runtime.Runtime<SidetrackService<Queues>>;
  /** @internal */
  private customRunPromise: <R extends SidetrackService<Queues>, E, A>(
    self: Effect.Effect<R, E, A>,
  ) => Promise<A>;

  constructor(options: SidetrackOptions<Queues>) {
    this.sidetrackLayer = makeLayer(options);

    this.runtimeHandler = Effect.runSync(makeAppRuntime(this.sidetrackLayer));

    this.runtime = this.runtimeHandler.runtime;

    this.customRunPromise = <R extends SidetrackService<Queues>, E, A>(
      self: Effect.Effect<R, E, A>,
    ) => Runtime.runPromise(this.runtime)(self);

    // TODO should we keep this in here? Node specific
    const runtimeCleanup = () => Effect.runPromise(this.runtimeHandler.close);
    // TODO should we keep this in here? Node specific
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on("beforeExit", runtimeCleanup);
  }

  async cancelJob(jobId: string, options?: SidetrackCancelJobOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.cancelJob(jobId, options),
      ),
    );
  }

  async deleteJob(jobId: string, options?: SidetrackDeleteJobOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.deleteJob(jobId, options),
      ),
    );
  }

  async getJob(
    jobId: string,
    options?: SidetrackGetJobOptions,
  ): Promise<SidetrackJobs> {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.getJob(jobId, options),
      ),
    );
  }

  async insertJob<K extends keyof Queues>(
    queueName: K,
    payload: Queues[K],
    options?: SidetrackInsertJobOptions,
  ): Promise<SidetrackJobs> {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.insertJob(queueName, payload, options),
      ),
    );
  }

  /**
   * Automatically run migrations and start polling the DB for jobs
   */
  async start() {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) => service.start()),
    );
  }

  /**
   * Turn off polling
   */
  async stop() {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) => service.stop()),
    );
  }

  /**
   * ==================
   * Test Utilities
   * ==================
   */

  /**
   * Test utility to get a list of jobs
   */
  async listJobs<K extends keyof Queues>(
    options?: SidetrackListJobsOptions<Queues, K> | undefined,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobs(options),
      ),
    );
  }

  /**
   * Test utility to get a list of job statuses and their counts
   */
  async listJobStatuses(options?: SidetrackListJobStatusesOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobStatuses(options),
      ),
    );
  }

  /**
   * Test utility to run a job manually without polling
   */
  async runJob(jobId: string, options?: SidetrackRunJobOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runJob(jobId, options),
      ),
    );
  }

  /**
   * Test utility to run all jobs in a queue manually without polling
   */
  async runQueue<K extends keyof Queues>(
    queue: K,
    options?: SidetrackRunQueueOptions,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runQueue(queue, options),
      ),
    );
  }
}

export * from "./adapter";
export { runMigrations } from "./migrations";
export * from "./types";
export { SidetrackJobs, SidetrackJobStatusEnum };
