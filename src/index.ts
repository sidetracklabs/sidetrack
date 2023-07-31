import * as Effect from "@effect/io/Effect";
import * as Runtime from "@effect/io/Runtime";
import * as Fiber from "@effect/io/Fiber";
import SidetrackJobs from "./models/public/SidetrackJobs";
import { QueryAdapter } from "./adapter";
import { Pool } from "pg";
import * as Layer from "@effect/io/Layer";
import {
  SidetrackInsertOption,
  SidetrackQueues,
  SidetrackService,
  createSidetrackServiceTag,
  makeLayer,
} from "./effect";
import { makeAppRuntime } from "./runtime";

export class Sidetrack<Queues extends Record<string, Record<string, unknown>>> {
  queryAdapter: QueryAdapter;
  pool: Pool | undefined;
  queues = {} as SidetrackQueues<Queues>;
  databaseOptions: { connectionString: string };
  pollingFiber: Fiber.Fiber<any, any> | undefined;
  sidetrackService = createSidetrackServiceTag<Queues>();
  sidetrackLayer: Layer.Layer<never, never, SidetrackService<Queues>>;
  runtimeHandler: {
    close: Effect.Effect<never, never, void>;
    runtime: Runtime.Runtime<SidetrackService<Queues>>;
  };
  runtime: Runtime.Runtime<SidetrackService<Queues>>;
  customRunPromise: <R extends SidetrackService<Queues>, E, A>(
    self: Effect.Effect<R, E, A>,
  ) => Promise<A>;

  constructor(options: {
    queues: SidetrackQueues<Queues>;
    databaseOptions: {
      connectionString: string;
    };
    queryAdapter?: QueryAdapter;
  }) {
    this.sidetrackLayer = makeLayer(options);

    this.runtimeHandler = Effect.runSync(makeAppRuntime(this.sidetrackLayer));

    this.runtime = this.runtimeHandler.runtime;

    this.customRunPromise = <R extends SidetrackService<Queues>, E, A>(
      self: Effect.Effect<R, E, A>,
    ) => Runtime.runPromise(this.runtime)(self);

    // TODO should we keep this in here? Node specific
    const cleanup = () => Effect.runPromise(this.runtimeHandler.close);
    // TODO should we keep this in here? Node specific
    process.on("beforeExit", cleanup);

    this.queues = options.queues;
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
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.getJob(jobId, options),
      ),
    );
  }

  async insert<K extends keyof Queues>(
    queueName: K,
    payload: Queues[K],
    options?: SidetrackInsertOption,
  ): Promise<SidetrackJobs> {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.insertJob(queueName, payload, options),
      ),
    );
  }

  async cancelJob(jobId: string, options?: { adapter?: QueryAdapter }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.cancelJob(jobId, options),
      ),
    );
  }

  async deleteJob(jobId: string, options?: { adapter?: QueryAdapter }) {
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

  async runJob(jobId: string, options?: { adapter?: QueryAdapter }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runJob(jobId, options),
      ),
    );
  }

  async runQueue<K extends keyof Queues>(
    queue: K,
    options?: { runScheduled?: boolean; adapter?: QueryAdapter },
  ) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.runQueue(queue, options),
      ),
    );
  }

  async listJobs<K extends keyof Queues>(options?: {
    queue?: K | K[];
    adapter?: QueryAdapter;
  }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobs(options),
      ),
    );
  }

  async listJobStatuses(options?: { adapter?: QueryAdapter }) {
    return this.customRunPromise(
      Effect.flatMap(this.sidetrackService, (service) =>
        service.listJobStatuses(options),
      ),
    );
  }
}
