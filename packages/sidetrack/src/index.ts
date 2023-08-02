import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Runtime from "@effect/io/Runtime";

import { SidetrackQueryAdapter } from "./adapter";
import {
  createSidetrackServiceTag,
  makeLayer,
  SidetrackService,
} from "./effect";
import SidetrackJobs from "./models/generated/public/SidetrackJobs";
import { makeAppRuntime } from "./runtime";
import {
  SidetrackInsertJobOptions,
  SidetrackOptions,
  SidetrackQueuesGenericType,
} from "./types";

export class Sidetrack<Queues extends SidetrackQueuesGenericType> {
  private sidetrackService = createSidetrackServiceTag<Queues>();
  private sidetrackLayer: Layer.Layer<never, never, SidetrackService<Queues>>;
  private runtimeHandler: {
    close: Effect.Effect<never, never, void>;
    runtime: Runtime.Runtime<SidetrackService<Queues>>;
  };
  private runtime: Runtime.Runtime<SidetrackService<Queues>>;
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
    const cleanup = () => Effect.runPromise(this.runtimeHandler.close);
    // TODO should we keep this in here? Node specific
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on("beforeExit", cleanup);
  }

  async getJob(
    jobId: string,
    options?: { queryAdapter?: SidetrackQueryAdapter },
  ): Promise<SidetrackJobs> {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.getJob(jobId, options),
      ),
    );
  }

  async insert<K extends keyof Queues>(
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

  async cancelJob(
    jobId: string,
    options?: { queryAdapter?: SidetrackQueryAdapter },
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.cancelJob(jobId, options),
      ),
    );
  }

  async deleteJob(
    jobId: string,
    options?: { queryAdapter?: SidetrackQueryAdapter },
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.deleteJob(jobId, options),
      ),
    );
  }

  async start() {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) => service.start()),
    );
  }

  async cleanup() {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) => service.cleanup()),
    );
  }

  /**
   * ==================
   * Test Utilities
   * ==================
   */

  async runJob(
    jobId: string,
    options?: { queryAdapter?: SidetrackQueryAdapter },
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runJob(jobId, options),
      ),
    );
  }

  async runQueue<K extends keyof Queues>(
    queue: K,
    options?: { queryAdapter?: SidetrackQueryAdapter; runScheduled?: boolean },
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runQueue(queue, options),
      ),
    );
  }

  async listJobs<K extends keyof Queues>(options?: {
    queryAdapter?: SidetrackQueryAdapter;
    queue?: K | K[];
  }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobs(options),
      ),
    );
  }

  async listJobStatuses(options?: { queryAdapter?: SidetrackQueryAdapter }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobStatuses(options),
      ),
    );
  }
}

export * from "./adapter";
export { runMigrations } from "./migrations";
export * from "./types";
export { SidetrackJobs };
