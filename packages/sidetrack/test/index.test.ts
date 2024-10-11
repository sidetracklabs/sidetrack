/* eslint-disable @typescript-eslint/require-await */
import pg from "pg";
import { describe, expect, it } from "vitest";

import { SidetrackTest, usePg } from "../src";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("accepts a database client", async () => {
    const pool = new pg.Pool({
      connectionString: process.env["DATABASE_URL"],
    });

    const sidetrack = new SidetrackTest<{
      test: { id: string };
      wallet: { amount: number };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      dbClient: usePg(pool),
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

    // insert a job API
    const job = await sidetrack.insertJob("test", { id: "string" });
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");
    // await sidetrack.cleanup();
  });

  it("run job succeeds", async () => {
    const sidetrack = new SidetrackTest({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (job) => {
            expect(job.status).toBe("running");
            expect(job.payload).toMatchObject({ id: "hello success" });
          },
        },
      },
    });
    // insert a job API
    const job = await sidetrack.insertJob("test", { id: "hello success" });
    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("completed");
  });

  it("run job fails", async () => {
    const sidetrack = new SidetrackTest({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (_payload) => {
            throw new Error("Hello failed");
          },
        },
      },
    });
    // insert a job API
    const job = await sidetrack.insertJob("test", { id: "hello fail" });
    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("failed");
  });

  it("job gets retried", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (_payload) => {
            throw new Error("Hello failed");
          },
          options: { maxAttempts: 2 },
        },
      },
    });
    // insert a job API
    let job = await sidetrack.insertJob("test", { id: "hello fail" });
    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("retrying");
    await sidetrack.runJob(job.id);
    job = await sidetrack.getJob(job.id);
    expect(job.status).toBe("failed");
    expect(job.current_attempt).toBe(2);
  });

  it("job gets cancelled", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (_payload) => {
            throw new Error("Hello failed");
          },
        },
      },
    });
    // insert a job API
    let job = await sidetrack.insertJob("test", { id: "hello fail" });
    await sidetrack.runJob(job.id);
    const insertedAt = job.inserted_at;
    expect((await sidetrack.getJob(job.id)).status).toBe("failed");

    await sidetrack.cancelJob(job.id);

    job = await sidetrack.getJob(job.id);
    expect(job.status).toBe("cancelled");
    expect(job.current_attempt).toBe(1);
    expect(+job.cancelled_at!).toBeGreaterThan(+insertedAt);
  });

  it("job gets deleted", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (_payload) => {
            throw new Error("Hello failed");
          },
        },
      },
    });

    // insert a job API
    let job = await sidetrack.insertJob("test", { id: "hello fail" });
    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("failed");

    await sidetrack.deleteJob(job.id);

    job = await sidetrack.getJob(job.id);
    expect(job).toBeUndefined();
  });

  it("run job works", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    // insert a job API
    const job = await sidetrack.insertJob("test", { id: "hello fail" });

    expect((await sidetrack.getJob(job.id)).status).toBe("scheduled"); // running

    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("completed");
  });

  it("run queue works", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest<{
      test: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        test: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    // insert a job API
    const job = await sidetrack.insertJob("test", { id: "hello world" });

    expect((await sidetrack.getJob(job.id)).status).toBe("scheduled"); // running

    await sidetrack.runJobs({ queue: "test" });
    expect((await sidetrack.getJob(job.id)).status).toBe("completed");
  });

  it("list job works", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest<{
      one: { id: string };
      two: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
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

    // insert a job API
    await sidetrack.insertJob("one", { id: "hello world" });

    await sidetrack.insertJob("one", { id: "hello universe" });

    await sidetrack.insertJob("two", { id: "hello universe" });

    // todo, clear db
    expect(
      (await sidetrack.listJobs({ queue: ["one", "two"] })).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("list job statuses works", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new SidetrackTest<{
      one: { id: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        one: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    // insert a job API
    await sidetrack.insertJob("one", { id: "hello world" });

    await sidetrack.insertJob("one", { id: "hello universe" });

    // todo, clear db
    expect(
      (await sidetrack.listJobStatuses()).scheduled,
    ).toBeGreaterThanOrEqual(2);
  });

  it("job insertion with scheduledAt option works", async () => {
    const sidetrack = new SidetrackTest<{
      scheduled: { message: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
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

    // Check that the job is inserted but not yet run
    const jobsBeforeSchedule = await sidetrack.listJobs({
      queue: ["scheduled"],
    });
    expect(jobsBeforeSchedule.length).toBe(1);
    expect(jobsBeforeSchedule[0].status).toBe("scheduled");
    expect(jobsBeforeSchedule[0].scheduled_at).toEqual(futureDate);

    // TODO support time travel
    // Wait for the scheduled time to pass
    // await new Promise((resolve) => setTimeout(resolve, 61000));

    // Run jobs to process the scheduled job
    await sidetrack.runJobs({ queue: ["scheduled"] });

    // Check that the job has been processed
    const jobsAfterSchedule = await sidetrack.listJobs({
      queue: ["scheduled"],
    });
    expect(jobsAfterSchedule.length).toBe(1);
    expect(jobsAfterSchedule[0].status).toBe("scheduled");
    expect(jobsAfterSchedule[0].payload).toEqual({ message: "Future job" });

    await sidetrack.runJobs({
      queue: ["scheduled"],
      includeFutureJobs: true,
    });

    // Check that the job has been processed
    const jobsAfterRun = await sidetrack.listJobs({
      queue: ["scheduled"],
    });
    expect(jobsAfterRun.length).toBe(1);
    expect(jobsAfterRun[0].status).toBe("completed");
    expect(jobsAfterRun[0].payload).toEqual({ message: "Future job" });
  });

  it("cron job functionality works", { timeout: 80000 }, async () => {
    const sidetrack = new SidetrackTest<{
      cronTest: { message: string };
    }>({
      databaseOptions: {
        connectionString: process.env["DATABASE_URL"]!,
      },
      queues: {
        cronTest: {
          handler: async (payload) => {
            return payload;
          },
        },
      },
    });

    // Schedule a cron job to run every minute
    // TODO this cron will start immediately, which mostly defeats the purpose of the test
    // TODO We need to do some sort of specific time-based test and time-travel
    await sidetrack.scheduleCron("cronTest", "* * * * *", {
      message: "Cron job test",
    });

    await sidetrack.runJobs({ queue: ["cronTest"] });

    // Check if a job was inserted and completed
    const jobs = await sidetrack.listJobs({ queue: ["cronTest"] });
    expect(jobs.length).toBeGreaterThanOrEqual(1);

    const completedJobs = jobs.filter((job) => job.status === "completed");
    expect(completedJobs.length).toBeGreaterThanOrEqual(1);

    const lastCompletedJob = completedJobs[completedJobs.length - 1];
    expect(lastCompletedJob.payload).toEqual({ message: "Cron job test" });
  });
});
