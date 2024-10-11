// @generated
// This file is automatically generated by Kanel. Do not modify manually.

/** Identifier type for public.sidetrack_cron_jobs */
export type SidetrackCronJobsId = string;

/** Represents the table public.sidetrack_cron_jobs */
export default interface SidetrackCronJobs {
  id: SidetrackCronJobsId;

  queue: string;

  cron_expression: string;

  payload: unknown;

  created_at: Date | null;

  updated_at: Date | null;
}

/** Represents the initializer for the table public.sidetrack_cron_jobs */
export interface SidetrackCronJobsInitializer {
  /** Default value: gen_random_uuid() */
  id?: SidetrackCronJobsId;

  queue: string;

  cron_expression: string;

  payload: unknown;

  /** Default value: now() */
  created_at?: Date | null;

  /** Default value: now() */
  updated_at?: Date | null;
}

/** Represents the mutator for the table public.sidetrack_cron_jobs */
export interface SidetrackCronJobsMutator {
  id?: SidetrackCronJobsId;

  queue?: string;

  cron_expression?: string;

  payload?: unknown;

  created_at?: Date | null;

  updated_at?: Date | null;
}
