import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const CURRENT_PERSISTENCE_VERSION = 3 as const;

export interface PersistenceSchemaVersions {
  world: number;
  character: number;
  rules: number;
  content: number;
}

export const CURRENT_SCHEMA_VERSIONS: PersistenceSchemaVersions = {
  world: 2,
  character: 3,
  rules: 2,
  content: 2,
};

export interface DeletionTombstoneData {
  entityType: 'WORLD' | 'STORY_RUN' | 'CHARACTER' | 'CHARACTER_DRAFT' | 'USER_DATA';
  entityId: string;
  scopeId?: string;
  deletedAt: string;
  reason: 'USER_REQUESTED';
}

export interface VersionedPersistenceData {
  version: number;
  schemaVersions: PersistenceSchemaVersions;
  worldTemplates: Record<string, any>;
  storyRuns: Record<string, any>;
  confirmedCharacters: Record<string, any>;
  characterDrafts: Record<string, any>;
  userData: Record<string, Record<string, any>>;
  deletionTombstones: DeletionTombstoneData[];
  [key: string]: any;
}

export interface PersistenceInspection {
  valid: boolean;
  exists: boolean;
  path?: string;
  currentVersion?: number;
  targetVersion: number;
  schemaVersions?: PersistenceSchemaVersions;
  needsMigration: boolean;
  errors: string[];
  warnings: string[];
  backupPath?: string;
}

export interface PersistenceRepairResult {
  success: boolean;
  changed: boolean;
  inspection: PersistenceInspection;
  backupPath?: string;
  errorReason?: string;
}

const EMPTY_DATA: VersionedPersistenceData = {
  version: CURRENT_PERSISTENCE_VERSION,
  schemaVersions: { ...CURRENT_SCHEMA_VERSIONS },
  worldTemplates: {},
  storyRuns: {},
  confirmedCharacters: {},
  characterDrafts: {},
  userData: {},
  deletionTombstones: [],
};

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeMaps(data: any): VersionedPersistenceData {
  const schemaVersions = {
    ...CURRENT_SCHEMA_VERSIONS,
    ...(isRecord(data.schemaVersions) ? data.schemaVersions : {}),
    character: CURRENT_SCHEMA_VERSIONS.character,
  } as PersistenceSchemaVersions;

  return {
    ...clone(data),
    version: CURRENT_PERSISTENCE_VERSION,
    schemaVersions,
    worldTemplates: isRecord(data.worldTemplates) ? clone(data.worldTemplates) : {},
    storyRuns: isRecord(data.storyRuns) ? clone(data.storyRuns) : {},
    confirmedCharacters: isRecord(data.confirmedCharacters) ? clone(data.confirmedCharacters) : {},
    characterDrafts: isRecord(data.characterDrafts) ? clone(data.characterDrafts) : {},
    userData: isRecord(data.userData) ? clone(data.userData) : {},
    deletionTombstones: Array.isArray(data.deletionTombstones) ? clone(data.deletionTombstones) : [],
  };
}

/**
 * Structural normalization without per-collection deep clones.
 *
 * migratePersistenceData() must stay defensive: it is an import boundary that also
 * serves arbitrary JSON. The store hot path (load/save on every persistLibrary())
 * only ever handles repository-produced objects, so it can safely build the
 * versioned envelope with a shallow spread and reuse the input collections. The
 * returned object is a new envelope; input collections are never mutated, but they
 * are referenced. Callers must treat the result as read-only or copy defensively
 * before mutating (the repository already hands save() a detached payload).
 */
export function normalizeMapsInPlace(data: any): VersionedPersistenceData {
  if (!isRecord(data)) {
    throw new Error('Cannot migrate persistence data: root is not an object.');
  }
  const sourceVersion = Number(data.version ?? 1);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    throw new Error(`Cannot migrate persistence data: invalid source version '${String(sourceVersion)}'.`);
  }
  if (sourceVersion > CURRENT_PERSISTENCE_VERSION) {
    throw new Error(`Persistence version ${sourceVersion} is newer than supported version ${CURRENT_PERSISTENCE_VERSION}.`);
  }

  const schemaVersions = {
    ...CURRENT_SCHEMA_VERSIONS,
    ...(isRecord(data.schemaVersions) ? data.schemaVersions : {}),
    character: CURRENT_SCHEMA_VERSIONS.character,
  } as PersistenceSchemaVersions;

  const normalized: any = { ...data };
  normalized.version = CURRENT_PERSISTENCE_VERSION;
  normalized.schemaVersions = schemaVersions;
  normalized.worldTemplates = isRecord(data.worldTemplates) ? data.worldTemplates : {};
  normalized.storyRuns = isRecord(data.storyRuns) ? data.storyRuns : {};
  normalized.confirmedCharacters = isRecord(data.confirmedCharacters) ? data.confirmedCharacters : {};
  normalized.characterDrafts = isRecord(data.characterDrafts) ? data.characterDrafts : {};
  normalized.userData = isRecord(data.userData) ? data.userData : {};
  normalized.deletionTombstones = Array.isArray(data.deletionTombstones) ? data.deletionTombstones : [];
  const errors = validateShape(normalized);
  if (errors.length > 0) {
    throw new Error(`Migrated persistence failed validation: ${errors.join(' | ')}`);
  }
  return normalized;
}

function validateShape(data: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(data)) return ['Persistence root must be a JSON object.'];

  if (data.version !== CURRENT_PERSISTENCE_VERSION) {
    errors.push(`Unsupported persistence version ${String(data.version)}; expected ${CURRENT_PERSISTENCE_VERSION}.`);
  }

  if (!isRecord(data.schemaVersions)) {
    errors.push('schemaVersions must be an object.');
  } else {
    for (const key of ['world', 'character', 'rules', 'content'] as const) {
      if (data.schemaVersions[key] !== CURRENT_SCHEMA_VERSIONS[key]) {
        errors.push(`schemaVersions.${key} must be ${CURRENT_SCHEMA_VERSIONS[key]}.`);
      }
    }
  }

  for (const key of ['worldTemplates', 'storyRuns', 'confirmedCharacters', 'characterDrafts', 'userData'] as const) {
    if (!isRecord(data[key])) errors.push(`${key} must be an object map.`);
  }

  if (!Array.isArray(data.deletionTombstones)) {
    errors.push('deletionTombstones must be an array.');
  }

  return errors;
}

export function migratePersistenceData(input: unknown): VersionedPersistenceData {
  if (!isRecord(input)) {
    throw new Error('Cannot migrate persistence data: root is not an object.');
  }

  const sourceVersion = Number(input.version ?? 1);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
    throw new Error(`Cannot migrate persistence data: invalid source version '${String(input.version)}'.`);
  }

  if (sourceVersion > CURRENT_PERSISTENCE_VERSION) {
    throw new Error(`Persistence version ${sourceVersion} is newer than supported version ${CURRENT_PERSISTENCE_VERSION}.`);
  }

  // Migration is intentionally additive. Unknown root fields survive so a newer subsystem
  // can be deployed without older code silently discarding data it does not understand.
  const migrated = normalizeMaps(input);
  const errors = validateShape(migrated);
  if (errors.length > 0) {
    throw new Error(`Migrated persistence failed validation: ${errors.join(' | ')}`);
  }

  return migrated;
}

function makeBackupPath(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${filePath}.pre-migration-${stamp}.bak`;
}

function atomicWrite(filePath: string, data: unknown): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.migration-tmp`;
  writeFileSync(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  renameSync(temporaryPath, filePath);
}

export class PersistenceMigrationService {
  public static inspectFile(filePath?: string): PersistenceInspection {
    if (!filePath) {
      return {
        valid: true,
        exists: false,
        targetVersion: CURRENT_PERSISTENCE_VERSION,
        needsMigration: false,
        errors: [],
        warnings: ['Persistence is disabled because no persistence path is configured.'],
      };
    }

    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      return {
        valid: true,
        exists: false,
        path: resolvedPath,
        targetVersion: CURRENT_PERSISTENCE_VERSION,
        needsMigration: false,
        errors: [],
        warnings: [],
      };
    }

    try {
      const parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
      const sourceVersion = Number(parsed?.version ?? 1);
      const schemaVersions = isRecord(parsed?.schemaVersions)
        ? parsed.schemaVersions as PersistenceSchemaVersions
        : undefined;
      const migrated = migratePersistenceData(parsed);
      const needsMigration =
        sourceVersion !== CURRENT_PERSISTENCE_VERSION ||
        JSON.stringify(schemaVersions || {}) !== JSON.stringify(migrated.schemaVersions);

      return {
        valid: true,
        exists: true,
        path: resolvedPath,
        currentVersion: sourceVersion,
        targetVersion: CURRENT_PERSISTENCE_VERSION,
        schemaVersions,
        needsMigration,
        errors: [],
        warnings: [],
      };
    } catch (error: any) {
      return {
        valid: false,
        exists: true,
        path: resolvedPath,
        targetVersion: CURRENT_PERSISTENCE_VERSION,
        needsMigration: false,
        errors: [error?.message || 'Persistence validation failed.'],
        warnings: [],
      };
    }
  }

  public static migrateFile(filePath?: string): PersistenceInspection {
    const inspection = this.inspectFile(filePath);
    if (!filePath || !inspection.exists || !inspection.path || !inspection.valid || !inspection.needsMigration) {
      return inspection;
    }

    const original = JSON.parse(readFileSync(inspection.path, 'utf8'));
    const migrated = migratePersistenceData(original);
    const backupPath = makeBackupPath(inspection.path);
    copyFileSync(inspection.path, backupPath);

    try {
      atomicWrite(inspection.path, migrated);
    } catch (error) {
      try { copyFileSync(backupPath, inspection.path); } catch {}
      throw error;
    }

    const postWriteInspection = this.inspectFile(inspection.path);
    if (!postWriteInspection.valid || postWriteInspection.needsMigration) {
      try { copyFileSync(backupPath, inspection.path); } catch {}
      throw new Error('Post-migration validation failed; the original persistence file was restored from backup.');
    }

    return { ...postWriteInspection, backupPath };
  }

  public static repairFile(filePath?: string): PersistenceRepairResult {
    const inspection = this.inspectFile(filePath);
    if (!filePath || !inspection.exists || !inspection.path) {
      return { success: true, changed: false, inspection };
    }

    try {
      const original = JSON.parse(readFileSync(inspection.path, 'utf8'));
      const repaired = migratePersistenceData(original);
      if (JSON.stringify(original) === JSON.stringify(repaired)) {
        return { success: true, changed: false, inspection: this.inspectFile(inspection.path) };
      }

      const backupPath = makeBackupPath(inspection.path);
      copyFileSync(inspection.path, backupPath);
      try {
        atomicWrite(inspection.path, repaired);
      } catch (error) {
        try { copyFileSync(backupPath, inspection.path); } catch {}
        throw error;
      }

      const repairedInspection = this.inspectFile(inspection.path);
      if (!repairedInspection.valid) {
        try { copyFileSync(backupPath, inspection.path); } catch {}
        return {
          success: false,
          changed: false,
          inspection: this.inspectFile(inspection.path),
          backupPath,
          errorReason: 'Repair output failed post-write validation; original backup was preserved.',
        };
      }

      return { success: true, changed: true, inspection: repairedInspection, backupPath };
    } catch (error: any) {
      return {
        success: false,
        changed: false,
        inspection,
        errorReason: error?.message || 'Persistence repair failed.',
      };
    }
  }

  public static emptyData(): VersionedPersistenceData {
    return clone(EMPTY_DATA);
  }
}
