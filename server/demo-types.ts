/**
 * The historical demo persists extensible JSON snapshots and SQLite rows.
 * Keep that schema evolution at this boundary; launch records use Convex's
 * schema-derived types instead.
 */
export type DemoRecord = Record<string, any>;
export interface DemoState {
  projects: any[];
  posts: any[];
  activity: any[];
  [collection: string]: any;
}
export interface DemoRecords {
  [operation: string]: any;
}
export interface DemoStore {
  records: DemoRecords;
  read(): DemoState;
  update(
    callback: (state: DemoState, records: DemoRecords) => any,
    initializing?: boolean,
  ): any;
  close(): void;
  migrationBackup?: string | null;
}
