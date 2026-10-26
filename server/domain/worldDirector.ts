/**
 * World Director — opening-scene readiness diagnostics.
 *
 * This first slice is intentionally read-only: it identifies when an
 * investigation premise is not backed by the canonical scene projection.
 * It does not create facts or replace any canonical authority.
 */

export type WorldDirectorSceneProfile = 'INVESTIGATION' | 'GENERAL';

export type WorldDirectorReadinessStatus =
  | 'READY'
  | 'READY_WITH_UNCERTAINTY'
  | 'INCOMPLETE'
  | 'NOT_APPLICABLE';

export interface WorldDirectorSceneObjectEvidence {
  id?: string;
  name?: string;
  description?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
  visible?: boolean;
  visibleToPlayer?: boolean;
}

export interface WorldDirectorEntityEvidence {
  id?: string;
  name?: string;
  displayName?: string;
  role?: string;
  kind?: string;
  presence?: string;
  isAlive?: boolean;
  visibleToPlayer?: boolean;
  currentActivity?: string;
}

export interface WorldDirectorEventEvidence {
  id?: string;
  summary?: string;
  type?: string;
  locationId?: string;
}

export interface OpeningSceneReadinessInput {
  startingSituation?: string;
  sceneObjects?: WorldDirectorSceneObjectEvidence[];
  visibleEntities?: WorldDirectorEntityEvidence[];
  visibleEvents?: WorldDirectorEventEvidence[];
}

export interface WorldDirectorReadinessIssue {
  code: 'INVESTIGATION_VICTIM_NOT_ESTABLISHED' | 'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED';
  requirement: string;
  message: string;
}

export interface WorldDirectorReadinessReport {
  profile: WorldDirectorSceneProfile;
  status: WorldDirectorReadinessStatus;
  issues: WorldDirectorReadinessIssue[];
  evidenceCounts: {
    visibleSceneObjects: number;
    visibleEntities: number;
    visibleEvents: number;
  };
}

/**
 * Conservative signal only: the premise selects a readiness profile; it does
 * not establish that any victim, clue, culprit, or event exists canonically.
 */
function isInvestigationPremise(value: string): boolean {
  return /\b(?:murder|murdered|homicide|corpse|dead body|crime scene|victim|forensic examination)\b/i.test(value)
    || /\binvestigat\w{0,12}.{0,48}\b(?:death|body|victim|crime|murder)\b/i.test(value);
}

function normalizedVisibleObjects(objects: WorldDirectorSceneObjectEvidence[]) {
  return objects.filter((object) => object.visible !== false && object.visibleToPlayer !== false);
}

function normalizedVisibleEntities(entities: WorldDirectorEntityEvidence[]) {
  return entities.filter((entity) =>
    entity.visibleToPlayer !== false &&
    (entity.presence === undefined || entity.presence === 'present'),
  );
}

function searchableObjectText(object: WorldDirectorSceneObjectEvidence): string {
  return [
    object.name,
    object.description,
    ...(Array.isArray(object.tags) ? object.tags : []),
    object.properties ? JSON.stringify(object.properties) : '',
  ].filter(Boolean).join(' ').toLowerCase();
}

function searchableEntityText(entity: WorldDirectorEntityEvidence): string {
  return [entity.name, entity.displayName, entity.role, entity.kind, entity.currentActivity]
    .filter(Boolean).join(' ').toLowerCase();
}

export class WorldDirector {
  /**
   * Checks whether a starting investigation is backed by visible canonical
   * scene anchors. A READY report is not proof that the full incident is
   * complete; it only means this initial minimum contract is satisfied.
   */
  public static assessOpeningSceneReadiness(
    input: OpeningSceneReadinessInput,
  ): WorldDirectorReadinessReport {
    const objects = normalizedVisibleObjects(input.sceneObjects || []);
    const entities = normalizedVisibleEntities(input.visibleEntities || []);
    const events = (input.visibleEvents || []).filter((event) => Boolean(String(event.summary || '').trim()));
    const evidenceCounts = {
      visibleSceneObjects: objects.length,
      visibleEntities: entities.length,
      visibleEvents: events.length,
    };

    if (!isInvestigationPremise(String(input.startingSituation || ''))) {
      return {
        profile: 'GENERAL',
        status: 'NOT_APPLICABLE',
        issues: [],
        evidenceCounts,
      };
    }

    const objectText = objects.map(searchableObjectText);
    const entityText = entities.map(searchableEntityText);
    const victimEstablished = [...objectText, ...entityText].some((value) =>
      /\b(?:victim|corpse|dead body|body of|deceased|murdered person|casualty)\b/.test(value),
    );

    const evidenceEstablished = objects.some((object) => {
      const value = searchableObjectText(object);
      return /\b(?:evidence|clue|blood|bloodstain|bloodied|weapon|footprint|fingerprint|forensic|shell casing|spent casing|broken lock|forced entry|drag mark|struggle)\b/.test(value);
    }) || events.some((event) =>
      /\b(?:evidence|clue|blood|weapon|footprint|fingerprint|forensic|forced entry|struggle)\b/i.test(String(event.summary || '')),
    );

    const issues: WorldDirectorReadinessIssue[] = [];
    if (!victimEstablished) {
      issues.push({
        code: 'INVESTIGATION_VICTIM_NOT_ESTABLISHED',
        requirement: 'A visible canonical representation of the victim or body',
        message: 'The starting situation establishes an investigation, but the visible canonical scene projection does not establish a victim/body anchor.',
      });
    }
    if (!evidenceEstablished) {
      issues.push({
        code: 'INVESTIGATION_EVIDENCE_NOT_ESTABLISHED',
        requirement: 'At least one visible canonical evidence or clue anchor',
        message: 'The starting situation establishes an investigation, but no visible canonical evidence/clue anchor is present in the scene projection.',
      });
    }

    return {
      profile: 'INVESTIGATION',
      status: issues.length ? 'INCOMPLETE' : 'READY',
      issues,
      evidenceCounts,
    };
  }
}
