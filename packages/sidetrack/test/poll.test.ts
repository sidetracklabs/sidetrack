import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SidetrackTest, usePg } from "../src";
import { createTestPool } from "./utils";

describe("polling", () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("continuously polls and processes new jobs", async () => {
    const client = await pool.connect();
    const jobIds: string[] = [];
    const sidetrack = new SidetrackTest<{
      pollSequenceTest: { description: string; sequence: number };
    }>({
      dbClient: usePg(client),
      pollingInterval: 100,
      queues: {
        pollSequenceTest: {
          run: async (payload) => Promise.resolve(payload),
        },
      },
    });

    try {
      // Insert first job
      const job1 = await sidetrack.insertJob("pollSequenceTest", {
        description: "First job in polling sequence",
        sequence: 1,
      });
      jobIds.push(job1.id);
      expect(job1.status).toBe("scheduled");

      // Start polling
      await sidetrack.start();

      // Wait for first job to complete
      await new Promise((resolve) => setTimeout(resolve, 200));
      const processedJob1 = await sidetrack.getJob(job1.id);
      expect(processedJob1.status).toBe("completed");

      // Insert second job after first one completes
      const job2 = await sidetrack.insertJob("pollSequenceTest", {
        description: "Second job in polling sequence",
        sequence: 2,
      });
      jobIds.push(job2.id);

      // Wait for second job to be picked up by next polling cycle
      await new Promise((resolve) => setTimeout(resolve, 200));
      const processedJob2 = await sidetrack.getJob(job2.id);
      expect(processedJob2.status).toBe("completed");

      // Insert third job after second one completes
      const job3 = await sidetrack.insertJob("pollSequenceTest", {
        description: "Third job in polling sequence",
        sequence: 3,
      });
      jobIds.push(job3.id);

      // Wait for third job to be picked up
      await new Promise((resolve) => setTimeout(resolve, 200));
      const processedJob3 = await sidetrack.getJob(job3.id);
      expect(processedJob3.status).toBe("completed");

      // Verify jobs were processed in sequence
      const timestamps = [processedJob1, processedJob2, processedJob3].map(
        (job) => job.attempted_at!.getTime(),
      );
      expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(100); // At least one polling interval
      expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(100);
    } finally {
      // Clean up
      await sidetrack.stop();

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

  it("processes jobs from multiple queues concurrently", async () => {
    const client = await pool.connect();
    const jobIds: string[] = [];
    const sidetrack = new SidetrackTest<{
      queue1: { description: string; value: number };
      queue2: { description: string; value: string };
    }>({
      dbClient: usePg(client),
      pollingInterval: 100,
      queues: {
        queue1: {
          run: async (payload) => Promise.resolve(payload),
        },
        queue2: {
          run: async (payload) => Promise.resolve(payload),
        },
      },
    });

    try {
      await sidetrack.start();

      // Insert jobs to both queues
      const job1 = await sidetrack.insertJob("queue1", {
        description: "Job from queue 1",
        value: 42,
      });
      jobIds.push(job1.id);

      const job2 = await sidetrack.insertJob("queue2", {
        description: "Job from queue 2",
        value: "test",
      });
      jobIds.push(job2.id);

      // Wait for jobs to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify both jobs were processed
      const processedJob1 = await sidetrack.getJob(job1.id);
      const processedJob2 = await sidetrack.getJob(job2.id);

      expect(processedJob1.status).toBe("completed");
      expect(processedJob2.status).toBe("completed");

      // Verify jobs from different queues can be processed around the same time
      const job1Time = processedJob1.attempted_at!.getTime();
      const job2Time = processedJob2.attempted_at!.getTime();
      expect(Math.abs(job1Time - job2Time)).toBeLessThan(100); // Should be processed within the same polling interval
    } finally {
      await sidetrack.stop();

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

  it("stops processing jobs when polling is stopped", async () => {
    const client = await pool.connect();
    let jobId: string | undefined;
    const sidetrack = new SidetrackTest<{
      pollStopTest: { description: string; timestamp: string };
    }>({
      dbClient: usePg(client),
      pollingInterval: 100,
      queues: {
        pollStopTest: {
          run: async (payload) => Promise.resolve(payload),
        },
      },
    });

    try {
      await sidetrack.start();
      await sidetrack.stop();

      const job = await sidetrack.insertJob("pollStopTest", {
        description: "Job inserted after polling stopped",
        timestamp: new Date().toISOString(),
      });
      jobId = job.id;

      // Check status immediately after insert
      const immediateStatus = await sidetrack.getJob(job.id);
      expect(immediateStatus.status).toBe("scheduled");

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check job status - should still be scheduled
      const unprocessedJob = await sidetrack.getJob(job.id);
      expect(unprocessedJob.status).toBe("scheduled");
    } finally {
      // Ensure job is cleaned up
      if (jobId) {
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

  it("stops polling when SIGTERM is received", async () => {
    const client = await pool.connect();
    const jobIds: string[] = [];
    const sidetrack = new SidetrackTest<{
      sigtermTest: { description: string; sequence: number };
    }>({
      dbClient: usePg(client),
      pollingInterval: 100,
      queues: {
        sigtermTest: {
          run: async (payload) => Promise.resolve(payload),
        },
      },
    });

    try {
      await sidetrack.start();

      // Insert a job
      const job1 = await sidetrack.insertJob("sigtermTest", {
        description: "Job before SIGTERM",
        sequence: 1,
      });
      jobIds.push(job1.id);

      // Wait for first job to complete
      await new Promise((resolve) => setTimeout(resolve, 200));
      const processedJob1 = await sidetrack.getJob(job1.id);
      expect(processedJob1.status).toBe("completed");

      // Simulate SIGTERM
      process.emit("SIGTERM");

      // Wait for stop to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Insert another job after SIGTERM
      const job2 = await sidetrack.insertJob("sigtermTest", {
        description: "Job after SIGTERM",
        sequence: 2,
      });
      jobIds.push(job2.id);

      // Wait to verify no processing happens
      await new Promise((resolve) => setTimeout(resolve, 500));
      const unprocessedJob = await sidetrack.getJob(job2.id);
      expect(unprocessedJob.status).toBe("scheduled");
    } finally {
      // Clean up
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
});
