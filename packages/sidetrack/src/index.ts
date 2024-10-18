import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Runtime from "effect/Runtime";

import {
  createSidetrackServiceTag,
  makeLayer,
  SidetrackService,
} from "./effect";
import SidetrackCronJobs from "./models/generated/public/SidetrackCronJobs";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import SidetrackJobStatusEnum from "./models/generated/public/SidetrackJobStatusEnum";
import {
  SidetrackCancelJobOptions,
  SidetrackCronJobOptions,
  SidetrackDeactivateCronScheduleOptions,
  SidetrackDeleteCronScheduleOptions,
  SidetrackDeleteJobOptions,
  SidetrackGetJobOptions,
  SidetrackInsertJobOptions,
  SidetrackListJobsOptions,
  SidetrackListJobStatusesOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
  SidetrackRunJobOptions,
  SidetrackRunJobsOptions,
} from "./types";

/**
 * Main class that contains all the primary methods for interacting with Sidetrack
 */
export class Sidetrack<Queues extends SidetrackQueuesGenericType> {
  /** @internal */
  protected sidetrackService = createSidetrackServiceTag<Queues>();
  /** @internal */
  private sidetrackLayer: Layer.Layer<SidetrackService<Queues>>;
  /** @internal */
  private runtime: Runtime.Runtime<SidetrackService<Queues>>;
  /** @internal */
  protected customRunPromise: <R extends SidetrackService<Queues>, E, A>(
    self: Effect.Effect<A, E, R>,
  ) => Promise<A>;

  constructor(options: SidetrackOptions<Queues>) {
    this.sidetrackLayer = makeLayer(options);

    this.runtime = Effect.runSync(
      Effect.scoped(Layer.toRuntime(this.sidetrackLayer)),
    );

    this.customRunPromise = <R extends SidetrackService<Queues>, E, A>(
      self: Effect.Effect<A, E, R>,
    ) => Runtime.runPromise(this.runtime)(self);
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
   * Schedule a cron job on a queue
   * @param queueName - The queue to schedule the cron job on
   * @param cronExpression - A 5 part cron expression
   */
  async scheduleCron<K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    payload: Queues[K],
    options?: SidetrackCronJobOptions,
  ): Promise<SidetrackCronJobs> {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.scheduleCron(queueName, cronExpression, payload, options),
      ),
    );
  }

  /**
   * Deactivate a cron schedule. This prevents the cron schedule from creating new jobs.
   * @param queueName - The queue to deactivate the cron job from
   * @param cronExpression - The cron expression to deactivate
   */
  async deactivateCronSchedule<K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    options?: SidetrackDeactivateCronScheduleOptions,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.deactivateCronSchedule(queueName, cronExpression, options),
      ),
    );
  }

  /**
   * Delete a cron schedule. This removes the cron job from the database.
   * @param queueName - The queue to delete the cron job from
   * @param cronExpression - The cron expression to delete
   */
  async deleteCronSchedule<K extends keyof Queues>(
    queueName: K,
    cronExpression: string,
    options?: SidetrackDeleteCronScheduleOptions,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.deleteCronSchedule(queueName, cronExpression, options),
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
}

/**
 * Test utility class that extends Sidetrack to also include some utilities you would only use in tests
 * For example, see the list and run methods
 */
export class SidetrackTest<
  Queues extends SidetrackQueuesGenericType,
> extends Sidetrack<Queues> {
  /**
   * Test utility to get a list of jobs
   */
  async listJobs<K extends keyof Queues>(
    options?: SidetrackListJobsOptions<Queues, K>  ,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.testUtils.listJobs(options),
      ),
    );
  }

  /**
   * Test utility to get a list of job statuses and their counts
   */
  async listJobStatuses(options?: SidetrackListJobStatusesOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.testUtils.listJobStatuses(options),
      ),
    );
  }

  /**
   * Test utility to run a job manually without polling
   */
  async runJob(jobId: string, options?: SidetrackRunJobOptions) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.testUtils.runJob(jobId, options),
      ),
    );
  }

  /**
   * Test utility to run all jobs in a queue manually without polling
   */
  async runJobs<K extends keyof Queues>(
    options?: SidetrackRunJobsOptions<Queues, K>,
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.testUtils.runJobs(options),
      ),
    );
  }
}

export * from "./client";
export { runMigrations } from "./migrations";
export * from "./types";
export { SidetrackJobStatusEnum };

/**
 * Re-export of Effect module For compatibility with moduleResolution: node
 * https://stackoverflow.com/questions/70296652/how-can-i-use-exports-in-package-json-for-nested-submodules-and-typescript
 * Export this to use the Effect module
 */
export * as SidetrackEffect from "./effect";
