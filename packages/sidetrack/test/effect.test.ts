import { Effect } from "effect";
import * as DateTime from "effect/DateTime";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackEffect, usePg } from "../src";
import { createTestPool, runInTransaction } from "./utils";

describe("Effect API", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("inserts and runs a job using Effect API", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { id: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => {
              expect(payload.id).toBe("effect test");
              return Promise.resolve(payload);
            },
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const job = yield* sidetrack.insertJob("test", { id: "effect test" });
        yield* sidetrack.testUtils.runJob(job.id);
        const completedJob = yield* sidetrack.getJob(job.id);
        expect(completedJob.status).toBe("completed");
        return completedJob;
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("handles job failures and retries", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { id: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            maxAttempts: 2,
            run: () => Promise.reject(new Error("Test failure")),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const job = yield* sidetrack.insertJob("test", { id: "retry test" });

        // First attempt
        yield* sidetrack.testUtils.runJob(job.id);
        let updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("retrying");

        // Second attempt
        yield* sidetrack.testUtils.runJob(job.id);
        updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("failed");
        expect(updatedJob.current_attempt).toBe(2);
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("cancels jobs", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { id: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: () => Promise.reject(new Error("Test failure")),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const job = yield* sidetrack.insertJob("test", { id: "cancel test" });

        yield* sidetrack.testUtils.runJob(job.id);
        let updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("failed");

        yield* sidetrack.cancelJob(job.id);
        updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("cancelled");
        expect(updatedJob.cancelled_at).toBeDefined();
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("schedules cron jobs", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { message: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;

        // Schedule a cron job
        const cronJob = yield* sidetrack.scheduleCron(
          "test",
          "*/5 * * * *", // every 5 minutes
          { message: "cron test" },
        );

        expect(cronJob.cron_expression).toBe("*/5 * * * *");
        expect(cronJob.queue).toBe("test");

        // Deactivate the cron schedule
        yield* sidetrack.deactivateCronSchedule("test", "*/5 * * * *");

        // Delete the cron schedule
        yield* sidetrack.deleteCronSchedule("test", "*/5 * * * *");
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("lists jobs and job statuses", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { id: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;

        // Insert multiple jobs
        yield* sidetrack.insertJob("test", { id: "list test 1" });
        yield* sidetrack.insertJob("test", { id: "list test 2" });

        // List all jobs
        const jobs = yield* sidetrack.testUtils.listJobs({ queue: "test" });
        expect(jobs.length).toBe(2);

        // Check job statuses
        const statuses = yield* sidetrack.testUtils.listJobStatuses({
          queue: "test",
        });
        expect(statuses.scheduled).toBe(2);
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("processes multiple queues concurrently", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        queue1: { value: number };
        queue2: { value: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          queue1: {
            run: (payload) => Promise.resolve(payload),
          },
          queue2: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;

        // Insert jobs to both queues
        const job1 = yield* sidetrack.insertJob("queue1", { value: 42 });
        const job2 = yield* sidetrack.insertJob("queue2", { value: "test" });

        // Start the service to begin processing
        yield* sidetrack.start();

        // Run both jobs
        yield* sidetrack.testUtils.runJobs({ queue: ["queue1", "queue2"] });

        // Verify both jobs completed
        const completedJob1 = yield* sidetrack.getJob(job1.id);
        const completedJob2 = yield* sidetrack.getJob(job2.id);

        expect(completedJob1.status).toBe("completed");
        expect(completedJob2.status).toBe("completed");

        // Stop the service
        sidetrack.stop();
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("handles payload transformation", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { date: Date };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        payloadTransformer: {
          deserialize: (payload) => ({
            ...payload,
            date: new Date((payload as { date: string }).date),
          }),
          serialize: (payload) => ({
            ...payload,
            date: (payload as { date: Date }).date.toISOString(),
          }),
        },
        queues: {
          test: {
            run: (payload) => {
              expect(payload.date).toBeInstanceOf(Date);
              return Promise.resolve(payload);
            },
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const date = new Date();
        const job = yield* sidetrack.insertJob("test", { date });

        // Verify serialization
        const insertedJob = yield* sidetrack.getJob(job.id);
        expect((insertedJob.payload as { date: string }).date).toBeTypeOf(
          "string",
        );

        // Run job and verify deserialization
        yield* sidetrack.testUtils.runJob(job.id);
        const completedJob = yield* sidetrack.getJob(job.id);
        expect(completedJob.status).toBe("completed");
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("handles scheduled jobs", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { message: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const futureDate = new Date(Date.now() + 60000); // 1 minute in future

        const job = yield* sidetrack.insertJob(
          "test",
          { message: "future job" },
          { scheduledAt: futureDate },
        );

        // Try to run jobs without includeFutureJobs
        yield* sidetrack.testUtils.runJobs({ queue: "test" });
        let updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("scheduled");

        // Run with includeFutureJobs
        yield* sidetrack.testUtils.runJobs({
          includeFutureJobs: true,
          queue: "test",
        });
        updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("completed");
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("handles jobs scheduled with DateTime from effect library", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { message: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;
        const now = yield* DateTime.now;
        const futureDateTime = DateTime.add(now, { minutes: 1 });

        const job = yield* sidetrack.insertJob(
          "test",
          { message: "future job with DateTime" },
          { scheduledAt: futureDateTime },
        );

        // Try to run jobs without includeFutureJobs
        yield* sidetrack.testUtils.runJobs({ queue: "test" });
        let updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("scheduled");

        // Run with includeFutureJobs
        yield* sidetrack.testUtils.runJobs({
          includeFutureJobs: true,
          queue: "test",
        });
        updatedJob = yield* sidetrack.getJob(job.id);
        expect(updatedJob.status).toBe("completed");
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("maintains type safety between similar queue payloads", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        admin: { id: string; type: "admin" };
        post: { content: string; id: string };
        user: { id: string; type: "user" };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        queues: {
          admin: {
            run: (payload) => {
              // Type narrowing should work here
              payload.type satisfies "admin";
              return Promise.resolve(payload);
            },
          },
          post: {
            run: (payload) => {
              // Should have content property
              payload.content satisfies string;
              return Promise.resolve(payload);
            },
          },
          user: {
            run: (payload) => {
              // Type narrowing should work here
              payload.type satisfies "user";
              return Promise.resolve(payload);
            },
          },
        },
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;

        // These should compile
        yield* sidetrack.insertJob("user", { id: "1", type: "user" });
        yield* sidetrack.insertJob("admin", { id: "2", type: "admin" });
        yield* sidetrack.insertJob("post", { content: "test", id: "3" });

        // @ts-expect-error wrong payload type for queue
        yield* sidetrack.insertJob("user", { id: "4", type: "admin" });

        // @ts-expect-error missing required property
        yield* sidetrack.insertJob("post", { id: "5" });

        yield* sidetrack
          // @ts-expect-error wrong queue name
          .insertJob("invalid", { id: "6" })
          .pipe(Effect.catchAllCause((cause) => Effect.succeed(cause)));
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });

  it("automatically starts job processing when startOnInitialization is true", async () => {
    await runInTransaction(pool, async (client) => {
      interface Queues {
        test: { id: string };
      }

      const SidetrackService = SidetrackEffect.getSidetrackService<Queues>();
      let jobProcessed = false;

      const sidetrackLayer = SidetrackEffect.layer<Queues>({
        dbClient: usePg(client),
        pollingInterval: 100,
        queues: {
          test: {
            run: (payload) => {
              jobProcessed = true;
              expect(payload.id).toBe("auto-start");
              return Promise.resolve(payload);
            },
          },
        },
        startOnInitialization: true,
      });

      const program = Effect.gen(function* () {
        const sidetrack = yield* SidetrackService;

        // Insert a job that should be automatically processed
        const job = yield* sidetrack.insertJob("test", { id: "auto-start" });

        // Allow some time for the job to be processed by the automatic polling
        yield* Effect.sleep("300 millis");

        // We shouldn't need to call start() or runJob() explicitly
        const completedJob = yield* sidetrack.getJob(job.id);

        expect(jobProcessed).toBe(true);
        expect(completedJob.status).toBe("completed");

        // Clean up by stopping the service
        sidetrack.stop();
      });

      await Effect.runPromise(program.pipe(Effect.provide(sidetrackLayer)));
    });
  });
});
