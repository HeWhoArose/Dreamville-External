import * as crypto from 'node:crypto';

export interface DeletionTombstone {
  entityType: 'WORLD' | 'STORY_RUN' | 'CHARACTER' | 'CHARACTER_DRAFT' | 'USER_DATA';
  entityId: string;
  scopeId?: string;
  deletedAt: string;
  reason: 'USER_REQUESTED';
}

export interface UserDataArchivePayload {
  worldTemplates: Record<string, any>;
  storyRuns: Record<string, any>;
  confirmedCharacters: Record<string, any>;
  characterDrafts: Record<string, any>;
  userData: Record<string, Record<string, any>>;
  deletionTombstones: DeletionTombstone[];
}

export interface UserDataArchive {
  format: 'DREAMBOOK_USER_DATA_ARCHIVE';
  archiveSchemaVersion: '1.0.0';
  engineVersion: string;
  createdAt: string;
  payload: UserDataArchivePayload;
  sha256: string;
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export class UserDataArchiveService {
  static readonly FORMAT = 'DREAMBOOK_USER_DATA_ARCHIVE' as const;
  static readonly CURRENT_SCHEMA_VERSION = '1.0.0' as const;
  static readonly ENGINE_VERSION = 'dreambook-durable-user-data-v1' as const;

  static computeSha256(payload: UserDataArchivePayload): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(payload), 'utf8')
      .digest('hex');
  }

  static create(payload: UserDataArchivePayload): UserDataArchive {
    const normalized = clone(payload);
    return {
      format: this.FORMAT,
      archiveSchemaVersion: this.CURRENT_SCHEMA_VERSION,
      engineVersion: this.ENGINE_VERSION,
      createdAt: new Date().toISOString(),
      payload: normalized,
      sha256: this.computeSha256(normalized),
    };
  }

  static validate(archive: unknown): { valid: boolean; errorReason?: string } {
    if (!archive || typeof archive !== 'object') {
      return { valid: false, errorReason: 'Archive root must be an object.' };
    }
    const candidate = archive as Partial<UserDataArchive>;
    if (candidate.format !== this.FORMAT) {
      return { valid: false, errorReason: 'Unsupported user-data archive format.' };
    }
    if (candidate.archiveSchemaVersion !== this.CURRENT_SCHEMA_VERSION) {
      return { valid: false, errorReason: `Unsupported user-data archive schema ${String(candidate.archiveSchemaVersion)}.` };
    }
    if (!candidate.payload || typeof candidate.payload !== 'object') {
      return { valid: false, errorReason: 'Archive payload is missing.' };
    }

    const payload = candidate.payload as UserDataArchivePayload;
    for (const key of ['worldTemplates', 'storyRuns', 'confirmedCharacters', 'characterDrafts', 'userData'] as const) {
      if (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])) {
        return { valid: false, errorReason: `Archive payload field '${key}' must be an object map.` };
      }
    }
    if (!Array.isArray(payload.deletionTombstones)) {
      return { valid: false, errorReason: 'Archive deletionTombstones must be an array.' };
    }

    const expectedHash = this.computeSha256(payload);
    if (candidate.sha256 !== expectedHash) {
      return { valid: false, errorReason: 'Archive integrity check failed: SHA-256 does not match payload.' };
    }

    return { valid: true };
  }

  static extract(archive: UserDataArchive): UserDataArchivePayload {
    const validation = this.validate(archive);
    if (!validation.valid) {
      throw new Error(validation.errorReason || 'Invalid user-data archive.');
    }
    return clone(archive.payload);
  }
}
