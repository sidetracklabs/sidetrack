import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackJobStatusEnum, SidetrackTest, usePg } from "../src";
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

  it("executes cron jobs on schedule", async () => {
    const client = await pool.connect();
    let cronJobId: string | undefined;
    let jobIds: string[] = [];
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
        "* * * * * *", // every second (6-part cron expression)
        { message: "cron execution test" },
      );
      cronJobId = cronJob.id;

      // Verify the cron job was inserted correctly
      const cronResult = await client.query(
        "SELECT * FROM sidetrack_cron_jobs WHERE id = $1",
        [cronJobId],
      );
      expect(cronResult.rows.length).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(cronResult.rows[0].queue).toBe("test");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(cronResult.rows[0].cron_expression).toBe("* * * * * *");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(cronResult.rows[0].payload).toEqual({
        message: "cron execution test",
      });

      // Start the service
      await sidetrackInstance.start();

      // Wait for a couple of executions
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // List all jobs created by the cron
      const jobs = await sidetrackInstance.listJobs({ queue: ["test"] });
      jobIds = jobs.map((job) => job.id);

      // Should have at least 2 jobs created
      expect(jobs.length).toBeGreaterThanOrEqual(2);

      // Jobs should have the correct payload
      expect(jobs[0].payload).toEqual({ message: "cron execution test" });

      // At least some jobs should be completed
      expect(
        jobs.some((job) => job.status === SidetrackJobStatusEnum.completed),
      ).toBe(true);
    } finally {
      // Clean up
      await sidetrackInstance.stop();

      if (cronJobId) {
        try {
          await client.query("DELETE FROM sidetrack_cron_jobs WHERE id = $1", [
            cronJobId,
          ]);
        } catch (e) {
          console.error("Failed to clean up cron job:", e);
        }
      }

      // Clean up created jobs
      for (const jobId of jobIds) {
        try {
          await client.query("DELETE FROM sidetrack_jobs WHERE id = $1", [
            jobId,
          ]);
        } catch (e) {
          console.error("Failed to clean up job:", e);
        }
      }

      client.release();
    }
  });

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
