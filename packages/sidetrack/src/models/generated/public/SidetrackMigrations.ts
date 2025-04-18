// @generated
// This file is automatically generated by Kanel. Do not modify manually.

/** Identifier type for public.sidetrack_migrations */
export type SidetrackMigrationsId = number;

/** Represents the table public.sidetrack_migrations */
export default interface SidetrackMigrations {
  id: SidetrackMigrationsId;

  name: string;

  run_on: Date;
}

/** Represents the initializer for the table public.sidetrack_migrations */
export interface SidetrackMigrationsInitializer {
  /** Default value: nextval('sidetrack_migrations_id_seq'::regclass) */
  id?: SidetrackMigrationsId;

  name: string;

  run_on: Date;
}

/** Represents the mutator for the table public.sidetrack_migrations */
export interface SidetrackMigrationsMutator {
  id?: SidetrackMigrationsId;

  name?: string;

  run_on?: Date;
}
