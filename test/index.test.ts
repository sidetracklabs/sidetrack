import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { Sidetrack } from "../src";

// TODO configure with global setup later: https://vitest.dev/config/#globalsetup

describe("jobs", () => {
  it("accepts a query adapter", async () => {
    const pool = new Pool({
      connectionString:
        "postgres://postgres:password@localhost:5432/sidetrack?sslmode=disable",
    });

    const sidetrack = new Sidetrack({
      queues: [
        {
          name: "test",
          handler: async (payload) => {
            console.log(payload.id);
          },
        },
      ],
      databaseOptions: {
        connectionString:
          "postgres://postgres:password@localhost:5432/sidetrack?sslmode=disable",
      },
      customAdapter: {
        execute: async (query, params) => {
          const result = await pool.query(query, params);
          console.log("I AM CUSTOM ADAPTER");
          return { rows: result.rows };
        },
      },
    });
    sidetrack.start();

    // insert a job API
    const insertedId = await sidetrack.insert(
      "test",
      { id: "hello success" },
      { maxAttempts: 2 }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(insertedId)).status).toBe("completed");

    await sidetrack.cleanup();
  });

  it("run job succeeds", async () => {
    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack = new Sidetrack({
      queues: [
        {
          name: "test",
          handler: async (payload) => {
            console.log(payload.id);
          },
        },
      ],
      databaseOptions: {
        connectionString:
          "postgres://postgres:password@localhost:5432/sidetrack?sslmode=disable",
      },
    });

    sidetrack.start();

    // insert a job API
    const insertedId = await sidetrack.insert(
      "test",
      { id: "hello success" },
      { maxAttempts: 2 }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack.getJob(insertedId)).status).toBe("completed");

    expect(insertedId).toBeGreaterThan(0);

    await sidetrack.cleanup();
  });

  it("run job fails", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack2 = new Sidetrack({
      queues: [
        {
          name: "test",
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      ],
      databaseOptions: {
        connectionString:
          "postgres://postgres:password@localhost:5432/sidetrack?sslmode=disable",
      },
    });

    sidetrack2.start();

    // insert a job API
    const insertedId = await sidetrack2.insert("test", { id: "hello fail" });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack2.getJob(insertedId)).status).toBe("failed");

    expect(insertedId).toBeGreaterThan(0);

    await sidetrack2.cleanup();
  });

  it("job gets retried", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // // 1 . define queue and function to call, (and queue opts?)
    const sidetrack2 = new Sidetrack({
      queues: [
        {
          name: "test",
          handler: async (payload) => {
            throw new Error("Hello failed");
          },
        },
      ],
      databaseOptions: {
        connectionString:
          "postgres://postgres:password@localhost:5432/sidetrack?sslmode=disable",
      },
    });

    sidetrack2.start();

    // insert a job API
    const insertedId = await sidetrack2.insert(
      "test",
      { id: "hello fail" },
      { maxAttempts: 2 }
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect((await sidetrack2.getJob(insertedId)).status).toBe("retrying");

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const job = await sidetrack2.getJob(insertedId);
    expect(job.status).toBe("failed");
    expect(job.current_attempt).toBe(2);

    expect(insertedId).toBeGreaterThan(0);

    await sidetrack2.cleanup();
  });
});
