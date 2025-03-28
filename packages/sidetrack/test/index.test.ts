/* eslint-disable @typescript-eslint/require-await */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackTest, usePg } from "../src";
import { createTestPool, runInTransaction } from "./utils";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe.concurrent("jobs", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("accepts a database client", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
        wallet: { amount: number };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
          wallet: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const job = await sidetrack.insertJob("test", {
        id: "accepts a database client",
      });
      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");
    });
  });

  it("run job succeeds", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (_payload, { job }) => {
              expect(job.status).toBe("running");
              expect(job.payload).toMatchObject({ id: "run job succeeds" });
            },
          },
        },
      });
      const job = await sidetrack.insertJob("test", { id: "run job succeeds" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("run job fails", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });
      const job = await sidetrack.insertJob("test", { id: "run job fails" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("failed");
    });
  });

  it("job gets retried", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            maxAttempts: 2,
            run: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });
      let job = await sidetrack.insertJob("test", { id: "job gets retried" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("retrying");
      await sidetrack.runJob(job.id);
      job = await sidetrack.getJob(job.id);
      expect(job.status).toBe("failed");
      expect(job.current_attempt).toBe(2);
    });
  });

  it("job gets cancelled", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });
      let job = await sidetrack.insertJob("test", { id: "job gets cancelled" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("failed");

      await sidetrack.cancelJob(job.id);

      job = await sidetrack.getJob(job.id);
      expect(job.status).toBe("cancelled");
      expect(job.current_attempt).toBe(1);
      expect(job.cancelled_at).toBeDefined();
    });
  });

  it("job gets deleted", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });

      let job = await sidetrack.insertJob("test", { id: "job gets deleted" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("failed");

      await sidetrack.deleteJob(job.id);

      job = await sidetrack.getJob(job.id);
      expect(job).toBeUndefined();
    });
  });

  it("run job works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      const job = await sidetrack.insertJob("test", { id: "run job works" });

      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");

      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("run queue works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      const job = await sidetrack.insertJob("test", { id: "run queue works" });

      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");

      await sidetrack.runJobs({ queue: "test" });
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("list job works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        one: { id: string };
        two: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          one: {
            run: async (payload) => {
              return payload;
            },
          },
          two: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob("one", { id: "list job works one first" });
      await sidetrack.insertJob("one", { id: "list job works one second" });
      await sidetrack.insertJob("two", { id: "list job works two" });

      expect((await sidetrack.listJobs({ queue: ["one", "two"] })).length).toBe(
        3,
      );
    });
  });

  it("list job statuses works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        one: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          one: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob("one", { id: "list job status works first" });
      await sidetrack.insertJob("one", { id: "list job status works second" });

      expect(
        (await sidetrack.listJobStatuses({ queue: ["one"] })).scheduled,
      ).toBe(2);
    });
  });

  it("job insertion with scheduledAt option works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        scheduled: { message: string };
      }>({
        dbClient: usePg(client),
        queues: {
          scheduled: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      const futureDate = new Date(Date.now() + 60000); // 1 minute in the future
      await sidetrack.insertJob(
        "scheduled",
        { message: "Future job" },
        { scheduledAt: futureDate },
      );

      const jobsBeforeSchedule = await sidetrack.listJobs({
        queue: ["scheduled"],
      });
      expect(jobsBeforeSchedule.length).toBe(1);
      expect(jobsBeforeSchedule[0]?.status).toBe("scheduled");
      expect(jobsBeforeSchedule[0]?.scheduled_at).toEqual(futureDate);

      await sidetrack.runJobs({ queue: ["scheduled"] });

      const jobsAfterSchedule = await sidetrack.listJobs({
        queue: ["scheduled"],
      });
      expect(jobsAfterSchedule.length).toBe(1);
      expect(jobsAfterSchedule[0]?.status).toBe("scheduled");
      expect(jobsAfterSchedule[0]?.payload).toEqual({ message: "Future job" });

      await sidetrack.runJobs({
        includeFutureJobs: true,
        queue: ["scheduled"],
      });

      const jobsAfterRun = await sidetrack.listJobs({
        queue: ["scheduled"],
      });
      expect(jobsAfterRun.length).toBe(1);
      expect(jobsAfterRun[0]?.status).toBe("completed");
      expect(jobsAfterRun[0]?.payload).toEqual({ message: "Future job" });
    });
  });

  it("unique key prevents duplicate jobs", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob(
        "test",
        { id: "unique job" },
        { uniqueKey: "test-unique-key" },
      );

      // Attempting to insert another job with same unique key should throw
      await expect(
        sidetrack.insertJob(
          "test",
          { id: "unique job 2" },
          { uniqueKey: "test-unique-key" },
        ),
      ).rejects.toThrow();
    });
  });

  it("can suppress unique key errors", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob(
        "test",
        { id: "suppress unique 1" },
        { uniqueKey: "suppress-key" },
      );

      // Should not throw when suppressDuplicateUniqueKeyErrors is true
      await sidetrack.insertJob(
        "test",
        { id: "suppress unique 2" },
        {
          suppressDuplicateUniqueKeyErrors: true,
          uniqueKey: "suppress-key",
        },
      );

      const jobs = await sidetrack.listJobs({ queue: ["test"] });
      expect(jobs.length).toBe(1);
      expect(jobs[0]?.payload).toEqual({ id: "suppress unique 1" });
    });
  });

  it("payload transformer works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { date: Date };
      }>({
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
            run: async (payload, { job }) => {
              expect(payload.date).toBeInstanceOf(Date);
              expect(
                (job.payload as unknown as { date: string }).date,
              ).toBeTypeOf("string");
              return payload;
            },
          },
        },
      });

      const date = new Date();
      const job = await sidetrack.insertJob("test", { date });

      const retrievedJob = await sidetrack.getJob(job.id);
      expect((retrievedJob.payload as { date: string }).date).toBeTypeOf(
        "string",
      );

      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("queue level payload transformer works", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { date: Date };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            payloadTransformer: {
              deserialize: (payload) => {
                if (typeof (payload as { date: string }).date === "string") {
                  return {
                    ...payload,
                    date: new Date((payload as { date: string }).date),
                  };
                }
                return payload;
              },
              serialize: (payload) => {
                if ((payload as { date: Date }).date instanceof Date) {
                  return {
                    ...payload,
                    date: (payload as { date: Date }).date.toISOString(),
                  };
                }
                return payload;
              },
            },
            run: async (payload, { job }) => {
              expect(payload.date).toBeInstanceOf(Date);
              expect(
                (job.payload as unknown as { date: string }).date,
              ).toBeTypeOf("string");
              return payload;
            },
          },
        },
      });

      const date = new Date();
      const job = await sidetrack.insertJob("test", { date });

      const retrievedJob = await sidetrack.getJob(job.id);
      expect((retrievedJob.payload as { date: string }).date).toBeTypeOf(
        "string",
      );

      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("queue level payload transformer overrides instance level transformer", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { date: Date };
      }>({
        dbClient: usePg(client),
        payloadTransformer: {
          deserialize: (_payload) => {
            // This should not be called
            throw new Error("Instance level transformer should not be used");
          },
          serialize: (_payload) => {
            // This should not be called
            throw new Error("Instance level transformer should not be used");
          },
        },
        queues: {
          test: {
            payloadTransformer: {
              deserialize: (payload) => {
                if (typeof (payload as { date: string }).date === "string") {
                  return {
                    ...payload,
                    date: new Date((payload as { date: string }).date),
                  };
                }
                return payload;
              },
              serialize: (payload) => {
                if ((payload as { date: Date }).date instanceof Date) {
                  return {
                    ...payload,
                    date: (payload as { date: Date }).date.toISOString(),
                  };
                }
                return payload;
              },
            },
            run: async (payload, { job }) => {
              expect(payload.date).toBeInstanceOf(Date);
              expect(
                (job.payload as unknown as { date: string }).date,
              ).toBeTypeOf("string");
              return payload;
            },
          },
        },
      });

      const date = new Date();
      const job = await sidetrack.insertJob("test", { date });

      const retrievedJob = await sidetrack.getJob(job.id);
      expect((retrievedJob.payload as { date: string }).date).toBeTypeOf(
        "string",
      );

      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("throws helpful error when no database client is provided", async () => {
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      disableDbClientInitialization: true,
      queues: {
        test: {
          run: async (payload) => {
            return payload;
          },
        },
      },
    });

    await expect(() =>
      sidetrack.insertJob("test", { id: "this should throw" }),
    ).rejects.toThrow();
  });
});
