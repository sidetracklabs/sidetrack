import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackTest, usePg } from "../src";
import SidetrackJobs from "../src/models/generated/public/SidetrackJobs";
import { createTestPool, runInTransaction } from "./utils";

describe("cron jobs", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("schedules a cron job", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        cronScheduleTest: { description: string; scheduleId: string };
      }>({
        dbClient: usePg(client),
        queues: {
          cronScheduleTest: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      const cronJob = await sidetrack.scheduleCron(
        "cronScheduleTest",
        "*/5 * * * *",
        {
          description: "Test cron job running every 5 minutes",
          scheduleId: "cron-test-001",
        },
      );

      expect(cronJob.queue).toBe("cronScheduleTest");
      expect(cronJob.cron_expression).toBe("*/5 * * * *");
      expect(cronJob.payload).toEqual({
        description: "Test cron job running every 5 minutes",
        scheduleId: "cron-test-001",
      });
      expect(cronJob.status).toBe("active");
    });
  });

  it("deactivates a cron schedule", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { message: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      await sidetrack.scheduleCron("test", "*/5 * * * *", {
        message: "deactivate test",
      });

      await sidetrack.deactivateCronSchedule("test", "*/5 * * * *");

      // Query the database directly to verify the status
      const result = await client.query<{ status: string }>(
        "SELECT status FROM sidetrack_cron_jobs WHERE queue = $1 AND cron_expression = $2",
        ["test", "*/5 * * * *"],
      );
      expect(result.rows[0].status).toBe("inactive");
    });
  });

  it("deletes a cron schedule", async () => {
    await runInTransaction(pool, async (client) => {
      const sidetrack = new SidetrackTest<{
        test: { message: string };
      }>({
        dbClient: usePg(client),
        queues: {
          test: {
            run: (payload) => Promise.resolve(payload),
          },
        },
      });

      await sidetrack.scheduleCron("test", "*/5 * * * *", {
        message: "delete test",
      });

      await sidetrack.deleteCronSchedule("test", "*/5 * * * *");

      // Query the database directly to verify deletion
      const result = await client.query(
        "SELECT * FROM sidetrack_cron_jobs WHERE queue = $1 AND cron_expression = $2",
        ["test", "*/5 * * * *"],
      );
      expect(result.rows.length).toBe(0);
    });
  });

  it("executes multiple cron jobs and processes their jobs", async () => {
    const client = await pool.connect();
    const cronJobIds: string[] = [];
    let jobIds: string[] = [];

    const sidetrackInstance = new SidetrackTest<{
      queue1: { description: string; sequence: number };
      queue2: { description: string; sequence: number };
    }>({
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

    try {
      await sidetrackInstance.start();

      // Schedule two cron jobs to run every second
      const cronJob1 = await sidetrackInstance.scheduleCron(
        "queue1",
        "* * * * * *",
        {
          description: "First cron job",
          sequence: 1,
        },
      );
      cronJobIds.push(cronJob1.id);

      const cronJob2 = await sidetrackInstance.scheduleCron(
        "queue2",
        "* * * * * *",
        {
          description: "Second cron job",
          sequence: 2,
        },
      );
      cronJobIds.push(cronJob2.id);

      // Wait for jobs to be created and processed
      const maxAttempts = 15;
      let attempts = 0;
      let queue1Jobs: SidetrackJobs[] = [];
      let queue2Jobs: SidetrackJobs[] = [];

      while (attempts < maxAttempts) {
        queue1Jobs = await sidetrackInstance.listJobs({
          queue: ["queue1"],
        });
        queue2Jobs = await sidetrackInstance.listJobs({
          queue: ["queue2"],
        });

        if (
          queue1Jobs.length >= 1 &&
          queue2Jobs.length >= 1 &&
          queue1Jobs.some((job) => job.status === "completed") &&
          queue2Jobs.some((job) => job.status === "completed")
        ) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      jobIds = [
        ...queue1Jobs.map((job) => job.id),
        ...queue2Jobs.map((job) => job.id),
      ];

      // Verify jobs were created and completed
      expect(queue1Jobs.length).toBeGreaterThanOrEqual(1);
      expect(queue2Jobs.length).toBeGreaterThanOrEqual(1);
      expect(queue1Jobs.some((job) => job.status === "completed")).toBe(true);
      expect(queue2Jobs.some((job) => job.status === "completed")).toBe(true);

      // Verify payloads
      expect(queue1Jobs[0].payload).toEqual({
        description: "First cron job",
        sequence: 1,
      });
      expect(queue2Jobs[0].payload).toEqual({
        description: "Second cron job",
        sequence: 2,
      });
    } finally {
      await sidetrackInstance.stop();

      // Clean up cron jobs and their generated jobs
      for (const cronJobId of cronJobIds) {
        await client.query("DELETE FROM sidetrack_cron_jobs WHERE id = $1", [
          cronJobId,
        ]);
      }

      for (const jobId of jobIds) {
        await client.query("DELETE FROM sidetrack_jobs WHERE id = $1", [jobId]);
      }

      client.release();
    }
  }, 20000);

  it("stops creating jobs when cron is stopped", async () => {
    const client = await pool.connect();
    let cronJobId: string | undefined;
    const sidetrackInstance = new SidetrackTest<{
      test: { message: string };
    }>({
      dbClient: usePg(client),
      queues: {
        test: {
          run: (payload) => Promise.resolve(payload),
        },
      },
    });

    try {
      // Schedule a cron job to run every second
      const cronJob = await sidetrackInstance.scheduleCron(
        "test",
        "* * * * * *", // every second
        { message: "cron stop test" },
      );
      cronJobId = cronJob.id;

      // Start the service
      await sidetrackInstance.start();

      // Wait for some jobs to be created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get count of jobs before stopping
      const beforeJobs = await sidetrackInstance.listJobs({ queue: ["test"] });
      const beforeCount = beforeJobs.length;

      // Stop the service
      await sidetrackInstance.stop();

      // Wait to ensure no more jobs are created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get count of jobs after stopping
      const afterJobs = await sidetrackInstance.listJobs({ queue: ["test"] });
      const afterCount = afterJobs.length;

      // Job count should be the same since cron is stopped
      expect(afterCount).toBe(beforeCount);

      // Clean up jobs
      for (const job of afterJobs) {
        await client.query("DELETE FROM sidetrack_jobs WHERE id = $1", [
          job.id,
        ]);
      }
    } finally {
      if (cronJobId) {
        try {
          await client.query("DELETE FROM sidetrack_cron_jobs WHERE id = $1", [
            cronJobId,
          ]);
        } catch (e) {
          console.error("Failed to clean up cron job:", e);
        }
      }
      client.release();
    }
  });
});
