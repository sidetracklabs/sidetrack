import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { Sidetrack } from "../src";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("accepts a query adapter", async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const sidetrack = new Sidetrack<{
      test: { id: string };
      wallet: { amount: number };
    }>({
      queues: {
        test: {
          handler: async (payload) => {
            console.log(payload.id);
          },
        },
        wallet: {
          handler: async (payload) => {
            console.log(payload.amount);
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
      queryAdapter: {
        execute: async (query, params) => {
          const result = await pool.query(query, params);
          console.log("I AM CUSTOM ADAPTER");
          return { rows: result.rows };
        },
      },
    });
    // await sidetrack.start();

    // insert a job API
    const job = await sidetrack.insert(
      "test",
      { id: "string" },
      { maxAttempts: 2 },
    );
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("scheduled");
    // await sidetrack.cleanup();
  });

  it("run job succeeds", async () => {
    const sidetrack = new Sidetrack({
      queues: {
        test: {
          handler: async (payload) => {
            console.log(payload.id);
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    await sidetrack.start();

    // insert a job API
    const job = await sidetrack.insert(
      "test",
      { id: "hello success" },
      { maxAttempts: 2 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("completed");
    await sidetrack.cleanup();
  });

  it("run job fails", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const sidetrack = new Sidetrack({
      queues: {
        test: {
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    await sidetrack.start();

    // insert a job API
    const job = await sidetrack.insert("test", { id: "hello fail" });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("failed");
    await sidetrack.cleanup();
  });

  it("job gets retried", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new Sidetrack({
      queues: {
        test: {
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    await sidetrack.start();

    // insert a job API
    let job = await sidetrack.insert(
      "test",
      { id: "hello fail" },
      { maxAttempts: 2 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("retrying");

    await sidetrack.cleanup();

    await sidetrack.runJob(job.id);
    job = await sidetrack.getJob(job.id);
    expect(job.status).toBe("failed");
    expect(job.current_attempt).toBe(2);
  });

  it("job gets cancelled", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new Sidetrack({
      queues: {
        test: {
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    await sidetrack.start();

    // insert a job API
    let job = await sidetrack.insert(
      "test",
      { id: "hello fail" },
      { maxAttempts: 2 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("retrying");

    await sidetrack.cancelJob(job.id);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    job = await sidetrack.getJob(job.id);
    expect(job.status).toBe("cancelled");
    expect(job.current_attempt).toBe(1);
    await sidetrack.cleanup();
  });

  it("job gets deleted", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new Sidetrack({
      queues: {
        test: {
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    await sidetrack.start();

    // insert a job API
    let job = await sidetrack.insert(
      "test",
      { id: "hello fail" },
      { maxAttempts: 2 },
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(job.id)).status).toBe("retrying");

    await sidetrack.deleteJob(job.id);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    job = await sidetrack.getJob(job.id);
    expect(job).toBeUndefined();
    await sidetrack.cleanup();
  });

  it("run job works", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new Sidetrack<{
      test: { id: string };
    }>({
      queues: {
        test: {
          handler: async (payload) => {
            console.log("hello");
          },
        },
      },
      databaseOptions: {
        connectionString: process.env.DATABASE_URL!,
      },
    });

    // insert a job API
    const job = await sidetrack.insert(
      "test",
      { id: "hello fail" },
      { maxAttempts: 2 },
    );

    expect((await sidetrack.getJob(job.id)).status).toBe("scheduled"); // running

    await sidetrack.runJob(job.id);
    expect((await sidetrack.getJob(job.id)).status).toBe("completed");
  });
});
