import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CURRENT_PERSISTENCE_VERSION,
  CURRENT_SCHEMA_VERSIONS,
  PersistenceMigrationService,
  type PersistenceInspection,
  type PersistenceRepairResult,
  migratePersistenceData,
  normalizeMapsInPlace,
  type VersionedPersistenceData,
} from './persistenceMigrationService';

export type PersistentGameStoreData = VersionedPersistenceData;

const EMPTY_STORE: PersistentGameStoreData = PersistenceMigrationService.emptyData();

export function isRunningUnderTests(): boolean {
	return Boolean(
		process.env.NODE_TEST_CONTEXT ||
		process.env.npm_lifecycle_event === 'test' ||
		process.argv.some((arg) => arg.includes('--test'))
	);
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export class PersistentGameStore {
  private readonly filePath?: string;
  private readonly isEnabled: boolean;
  private readonly snapshotLimit: number;

  constructor(filePath = process.env.DREAMBOOK_PERSISTENCE_PATH) {
    if (filePath) {
      this.filePath = resolve(filePath);
      this.isEnabled = true;
    } else if (isRunningUnderTests()) {
      this.filePath = undefined;
      this.isEnabled = false;
    } else {
      this.filePath = resolve(process.cwd(), '.dreambook', 'data.json');
      this.isEnabled = true;
    }

    const configuredLimit = Number(process.env.DREAMBOOK_PERSISTENCE_SNAPSHOT_LIMIT || 20);
    this.snapshotLimit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20;
  }

  load(): PersistentGameStoreData {
    if (!this.isEnabled || !this.filePath || !existsSync(this.filePath)) {
      return clone(EMPTY_STORE);
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      // A single normalization pass straight out of the parsed JSON. Re-serializing the
      // whole store here was measurable on large campaigns and this read path runs on
      // every process boot; validateShape already guarantees the versioned contract.
      // The clone detaches the result from the parsed JSON so callers can own it.
      const normalized = normalizeMapsInPlace(parsed);
      return clone(normalized);
    } catch (error) {
      const recovered = this.tryRecoverFromLatestSnapshot(error);
      if (recovered) return recovered;
      console.error('[PersistentGameStore] Persistence load failed and no valid snapshot could be recovered.', error);
      throw error;
    }
  }

  save(data: PersistentGameStoreData): void {
    if (!this.isEnabled || !this.filePath) return;

    // Structural normalization only (no per-collection deep clones). The repository
    // hands us a freshly built payload; we serialize it immediately without mutating
    // it. clone(data) plus five per-collection clones turned every save into four
    // full-store serializations on hot paths that persist several times per turn.
    const normalized = normalizeMapsInPlace(data);
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true });

    if (existsSync(this.filePath)) {
      this.createSnapshot();
    }

    const temporaryPath = `${this.filePath}.tmp`;
    // Compact serialization: pretty-printing multiplied file size ~4x and pushed
    // large campaigns into multi-second synchronous writes per turn.
    writeFileSync(temporaryPath, JSON.stringify(normalized), 'utf8');
    renameSync(temporaryPath, this.filePath);
    this.pruneSnapshots();
  }

  private migrateIfNeeded(migrated: PersistentGameStoreData): void {
    if (!this.filePath) return;
    const inspection = PersistenceMigrationService.inspectFile(this.filePath);
    if (!inspection.needsMigration) return;
    // migrateFile validates, creates a pre-migration backup, atomically writes,
    // and restores the original source if post-migration validation fails.
    PersistenceMigrationService.migrateFile(this.filePath);
    // Keep the typed migration result available for callers even if the file was
    // concurrently changed between inspection and migration.
    void migrated;
  }

  private getSnapshotDirectory(): string {
    return this.filePath ? `${dirname(this.filePath)}/history` : '';
  }

  private createSnapshot(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    const snapshotDirectory = this.getSnapshotDirectory();
    mkdirSync(snapshotDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = `${snapshotDirectory}/data-${stamp}-${process.pid}.json`;
    copyFileSync(this.filePath, snapshotPath);
  }

  private pruneSnapshots(): void {
    const directory = this.getSnapshotDirectory();
    if (!directory || !existsSync(directory)) return;

    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();

    for (const file of files.slice(this.snapshotLimit)) {
      try { unlinkSync(`${directory}/${file}`); } catch {}
    }
  }

  private tryRecoverFromLatestSnapshot(loadError: unknown): PersistentGameStoreData | null {
    const directory = this.getSnapshotDirectory();
    if (!directory || !existsSync(directory)) return null;

    const candidates = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();

    for (const candidate of candidates) {
      const path = `${directory}/${candidate}`;
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        const recovered = migratePersistenceData(parsed);
        console.error('[PersistentGameStore] Primary persistence was unreadable; recovered the last valid snapshot.', {
          primaryPath: this.filePath,
          snapshotPath: path,
          error: loadError instanceof Error ? loadError.message : String(loadError),
        });
        return clone(recovered);
      } catch {
        // Continue searching older snapshots.
      }
    }

    return null;
  }

  getPath(): string | undefined {
    return this.filePath;
  }

  getSnapshots(): string[] {
    const directory = this.getSnapshotDirectory();
    if (!directory || !existsSync(directory)) return [];
    return readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse()
      .map((name) => `${directory}/${name}`);
  }

  inspectPersistence(): PersistenceInspection {
    return PersistenceMigrationService.inspectFile(this.filePath);
  }

  migratePersistence(): PersistenceInspection {
    return PersistenceMigrationService.migrateFile(this.filePath);
  }

  repairPersistence(): PersistenceRepairResult {
    return PersistenceMigrationService.repairFile(this.filePath);
  }

  getPersistenceHealth(): {
    enabled: boolean;
    path?: string;
    snapshotCount: number;
    latestSnapshot?: string;
  } {
    const snapshots = this.getSnapshots();
    return {
      enabled: this.isEnabled,
      path: this.filePath,
      snapshotCount: snapshots.length,
      latestSnapshot: snapshots[0],
    };
  }
}
