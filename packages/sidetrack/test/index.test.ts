/* eslint-disable @typescript-eslint/require-await */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackTest, usePg } from "../src";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe.concurrent("jobs", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({
      connectionString: process.env["DATABASE_URL"],
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function runInTransaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("ROLLBACK");
      return result;
    } finally {
      client.release();
    }
  }

  it("accepts a database client", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
        wallet: { amount: number };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (payload) => {
              return payload;
            },
          },
          wallet: {
            handler: async (payload) => {
              return payload;
            },
          },
        },
      });

      const job = await sidetrack.insertJob("test", { id: "string" });
      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");
    });
  });

  it("run job succeeds", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (_payload, { job }) => {
              expect(job.status).toBe("running");
              expect(job.payload).toMatchObject({ id: "hello success" });
            },
          },
        },
      });
      const job = await sidetrack.insertJob("test", { id: "hello success" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("run job fails", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });
      const job = await sidetrack.insertJob("test", { id: "hello fail" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("failed");
    });
  });

  it("job gets retried", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (_payload) => {
              throw new Error("Hello failed");
            },
            options: { maxAttempts: 2 },
          },
        },
      });
      let job = await sidetrack.insertJob("test", { id: "hello fail" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("retrying");
      await sidetrack.runJob(job.id);
      job = await sidetrack.getJob(job.id);
      expect(job.status).toBe("failed");
      expect(job.current_attempt).toBe(2);
    });
  });

  it("job gets cancelled", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });
      let job = await sidetrack.insertJob("test", { id: "hello fail" });
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
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (_payload) => {
              throw new Error("Hello failed");
            },
          },
        },
      });

      let job = await sidetrack.insertJob("test", { id: "hello fail" });
      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("failed");

      await sidetrack.deleteJob(job.id);

      job = await sidetrack.getJob(job.id);
      expect(job).toBeUndefined();
    });
  });

  it("run job works", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (payload) => {
              return payload;
            },
          },
        },
      });

      const job = await sidetrack.insertJob("test", { id: "hello fail" });

      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");

      await sidetrack.runJob(job.id);
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("run queue works", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            handler: async (payload) => {
              return payload;
            },
          },
        },
      });

      const job = await sidetrack.insertJob("test", { id: "hello world" });

      expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");

      await sidetrack.runJobs({ queue: "test" });
      expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    });
  });

  it("list job works", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        one: { id: string };
        two: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          one: {
            handler: async (payload) => {
              return payload;
            },
          },
          two: {
            handler: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob("one", { id: "hello world" });
      await sidetrack.insertJob("one", { id: "hello universe" });
      await sidetrack.insertJob("two", { id: "hello universe" });

      expect((await sidetrack.listJobs({ queue: ["one", "two"] })).length).toBe(
        3,
      );
    });
  });

  it("list job statuses works", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        one: { id: string };
      }>({
        dbClient: usePg(client),
        queues: {
          one: {
            handler: async (payload) => {
              return payload;
            },
          },
        },
      });

      await sidetrack.insertJob("one", { id: "hello world" });
      await sidetrack.insertJob("one", { id: "hello universe" });

      expect((await sidetrack.listJobStatuses()).scheduled).toBe(2);
    });
  });

  it("job insertion with scheduledAt option works", async () => {
    await runInTransaction(async (client) => {
      const sidetrack = new SidetrackTest<{
        scheduled: { message: string };
      }>({
        dbClient: usePg(client),
        queues: {
          scheduled: {
            handler: async (payload) => {
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
      expect(jobsBeforeSchedule[0].status).toBe("scheduled");
      expect(jobsBeforeSchedule[0].scheduled_at).toEqual(futureDate);

      await sidetrack.runJobs({ queue: ["scheduled"] });

      const jobsAfterSchedule = await sidetrack.listJobs({
        queue: ["scheduled"],
      });
      expect(jobsAfterSchedule.length).toBe(1);
      expect(jobsAfterSchedule[0].status).toBe("scheduled");
      expect(jobsAfterSchedule[0].payload).toEqual({ message: "Future job" });

      await sidetrack.runJobs({
        includeFutureJobs: true,
        queue: ["scheduled"],
      });

      const jobsAfterRun = await sidetrack.listJobs({
        queue: ["scheduled"],
      });
      expect(jobsAfterRun.length).toBe(1);
      expect(jobsAfterRun[0].status).toBe("completed");
      expect(jobsAfterRun[0].payload).toEqual({ message: "Future job" });
    });
  });
});
