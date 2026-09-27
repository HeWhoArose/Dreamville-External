import type { GeographyGraph } from './geographyGraph';
import type { LocationNode, RouteEdge, TravelMode } from './types';

export type SpatialCoverLevel = 'NONE' | 'HALF' | 'THREE_QUARTERS' | 'TOTAL';

export interface SpatialPoint {
	x: number;
	y: number;
	z?: number;
}

export interface SpatialObstacle {
	id: string;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ?: number;
	maxZ?: number;
	blocksMovement: boolean;
	blocksSight: boolean;
	cover?: SpatialCoverLevel;
}

export interface SpatialHazard {
	id: string;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	type: string;
	severity?: string;
	blocksMovement?: boolean;
}

export interface SpatialLocationProjection {
	locationId: string;
	name: string;
	point: SpatialPoint;
	accessible: boolean;
	discovered: boolean;
	regionId: string;
	environment?: Record<string, unknown>;
}

export interface SpatialPathResult {
	found: boolean;
	routeLocationIds: string[];
	edges: RouteEdge[];
	totalDistanceKm: number;
	estimatedDurationSeconds: number;
	reason?: string;
}

export interface SpatialLineQueryResult {
	clear: boolean;
	blockedBy?: string;
	reason?: string;
	distance: number;
}

export interface SpatialCoverQueryResult {
	level: SpatialCoverLevel;
	sourceId?: string;
	distance: number;
}

export interface SpatialEnvironmentProjection {
	locationId: string;
	elevation?: number;
	terrain?: string;
	weather?: unknown;
	temperature?: unknown;
	wind?: unknown;
	smoke?: unknown;
	hazards: SpatialHazard[];
}

export interface SpatialAuthoritySnapshot {
	version: 1;
	locationCount: number;
	obstacleCount: number;
	hazardCount: number;
}

interface SpatialQueryContext {
	geography: GeographyGraph;
	worldTemplate?: any;
}

function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function clampCover(value: unknown): SpatialCoverLevel {
	const normalized = String(value || 'NONE').toUpperCase().replace(/[ -]/g, '_');
	if (normalized === 'TOTAL') return 'TOTAL';
	if (normalized === 'THREE_QUARTERS' || normalized === 'THREEQUARTERS') return 'THREE_QUARTERS';
	if (normalized === 'HALF') return 'HALF';
	return 'NONE';
}

function normalizeRect(raw: any, fallbackId: string): SpatialObstacle | SpatialHazard | null {
	if (!raw || typeof raw !== 'object') return null;

	const x = Number(raw.x);
	const y = Number(raw.y);
	const minX = finite(raw.minX) ? raw.minX : finite(raw.maxX) ? raw.maxX : x;
	const maxX = finite(raw.maxX) ? raw.maxX : finite(raw.minX) ? raw.minX : x;
	const minY = finite(raw.minY) ? raw.minY : finite(raw.maxY) ? raw.maxY : y;
	const maxY = finite(raw.maxY) ? raw.maxY : finite(raw.minY) ? raw.minY : y;

	if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;

	return {
		id: String(raw.id || fallbackId),
		minX: Math.min(minX, maxX),
		maxX: Math.max(minX, maxX),
		minY: Math.min(minY, maxY),
		maxY: Math.max(minY, maxY),
		...(finite(raw.minZ) ? { minZ: raw.minZ } : {}),
		...(finite(raw.maxZ) ? { maxZ: raw.maxZ } : {}),
		blocksMovement: raw.blocksMovement !== false,
		blocksSight: raw.blocksSight !== false,
		cover: clampCover(raw.cover),
	} as SpatialObstacle;
}

function pointInsideObstacle(point: SpatialPoint, obstacle: SpatialObstacle): boolean {
	if (
		point.x < obstacle.minX ||
		point.x > obstacle.maxX ||
		point.y < obstacle.minY ||
		point.y > obstacle.maxY
	) {
		return false;
	}

	if (obstacle.minZ !== undefined && finite(point.z) && point.z < obstacle.minZ) return false;
	if (obstacle.maxZ !== undefined && finite(point.z) && point.z > obstacle.maxZ) return false;
	return true;
}

function interpolate(a: SpatialPoint, b: SpatialPoint, fraction: number): SpatialPoint {
	return {
		x: a.x + (b.x - a.x) * fraction,
		y: a.y + (b.y - a.y) * fraction,
		z:
			finite(a.z) || finite(b.z)
				? (a.z || 0) + ((b.z || 0) - (a.z || 0)) * fraction
				: undefined,
	};
}

function distance(a: SpatialPoint, b: SpatialPoint): number {
	const dz = (a.z || 0) - (b.z || 0);
	return Math.hypot(a.x - b.x, a.y - b.y, dz);
}

export function resolveSpatialLineOfSight(
	origin: SpatialPoint,
	destination: SpatialPoint,
	obstacles: SpatialObstacle[],
): SpatialLineQueryResult {
	const totalDistance = distance(origin, destination);
	if (totalDistance === 0) return { clear: true, distance: 0 };

	const blockers = obstacles.filter((obstacle) => obstacle.blocksSight);
	const samples = Math.max(1, Math.min(512, Math.ceil(totalDistance * 4)));

	for (let step = 1; step < samples; step += 1) {
		const point = interpolate(origin, destination, step / samples);
		const blocker = blockers.find((candidate) => pointInsideObstacle(point, candidate));
		if (blocker) {
			return {
				clear: false,
				blockedBy: blocker.id,
				distance: totalDistance,
				reason: `Line of sight is blocked by spatial obstacle "${blocker.id}".`,
			};
		}
	}

	return { clear: true, distance: totalDistance };
}

export function resolveSpatialCoverBetweenPoints(
	origin: SpatialPoint,
	destination: SpatialPoint,
	obstacles: SpatialObstacle[],
): SpatialCoverQueryResult {
	const totalDistance = distance(origin, destination);
	const candidates = obstacles
		.filter((obstacle) => obstacle.cover && obstacle.cover !== 'NONE')
		.filter((obstacle) => {
			const samples = Math.max(1, Math.min(512, Math.ceil(totalDistance * 4)));
			for (let step = 1; step < samples; step += 1) {
				if (pointInsideObstacle(interpolate(origin, destination, step / samples), obstacle)) return true;
			}
			return false;
		})
		.sort((a, b) => {
			const strength = (level?: SpatialCoverLevel) => level === 'TOTAL' ? 3 : level === 'THREE_QUARTERS' ? 2 : level === 'HALF' ? 1 : 0;
			return strength(b.cover) - strength(a.cover) || a.id.localeCompare(b.id);
		});

	const strongest = candidates[0];
	return strongest
		? { level: strongest.cover || 'NONE', sourceId: strongest.id, distance: totalDistance }
		: { level: 'NONE', distance: totalDistance };
}

export interface SpatialGridPoint {
	x: number;
	y: number;
}

export interface SpatialGridParticipant {
	id: string;
	x: number;
	y: number;
	isDead?: boolean;
}

export interface SpatialGridObstacle {
	x: number;
	y: number;
	isImpassable?: boolean;
}

export interface SpatialGridHazard {
	type: string;
	x: number;
	y: number;
	radiusCells?: number;
}

export interface SpatialGridBounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export function isSpatialGridCellBlocked(
	x: number,
	y: number,
	mapBounds: SpatialGridBounds | undefined,
	obstacles: SpatialGridObstacle[],
	hazards: SpatialGridHazard[],
): boolean {
	if (
		mapBounds &&
		(x < mapBounds.minX || x > mapBounds.maxX || y < mapBounds.minY || y > mapBounds.maxY)
	) {
		return true;
	}

	if (obstacles.some((obstacle) =>
		obstacle.x === x &&
		obstacle.y === y &&
		obstacle.isImpassable !== false
	)) {
		return true;
	}

	return hazards.some((hazard) =>
		hazard.type === 'barricade' &&
		hazard.x === x &&
		hazard.y === y
	);
}

export function resolveSpatialGridMovementPath(
	actorId: string,
	from: SpatialGridPoint,
	to: SpatialGridPoint,
	mapBounds: SpatialGridBounds | undefined,
	obstacles: SpatialGridObstacle[],
	hazards: SpatialGridHazard[],
	participants: Iterable<SpatialGridParticipant>,
): SpatialGridPoint[] | undefined {
	const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
	if (steps === 0) return [{ ...from }];

	const occupiedParticipants = Array.from(participants);
	const path: SpatialGridPoint[] = [{ ...from }];

	for (let i = 1; i <= steps; i += 1) {
		const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
		const y = Math.round(from.y + ((to.y - from.y) * i) / steps);

		if (isSpatialGridCellBlocked(x, y, mapBounds, obstacles, hazards)) return undefined;

		const previous = path[path.length - 1];
		const diagonal = previous.x !== x && previous.y !== y;
		if (diagonal) {
			const cornerBlocked =
				isSpatialGridCellBlocked(previous.x, y, mapBounds, obstacles, hazards) ||
				isSpatialGridCellBlocked(x, previous.y, mapBounds, obstacles, hazards);
			if (cornerBlocked) return undefined;
		}

		if (occupiedParticipants.some((participant) =>
			participant.id !== actorId &&
			!participant.isDead &&
			participant.x === x &&
			participant.y === y
		)) {
			return undefined;
		}

		path.push({ x, y });
	}

	return path;
}

export function calculateSpatialGridMovementCost(
	path: SpatialGridPoint[],
	hazards: SpatialGridHazard[],
): number {
	let cost = 0;

	for (let i = 1; i < path.length; i += 1) {
		const previous = path[i - 1];
		const current = path[i];
		const diagonal = previous.x !== current.x && previous.y !== current.y;
		const base = diagonal ? Math.SQRT2 : 1;
		const difficult = hazards.some((hazard) =>
			hazard.type === 'ice_patch' &&
			Math.hypot(current.x - hazard.x, current.y - hazard.y) <= (hazard.radiusCells || 0)
		);
		cost += difficult ? base * 2 : base;
	}

	return cost;
}

export class SpatialAuthority {
	private readonly context: SpatialQueryContext;

	public constructor(geography: GeographyGraph, worldTemplate?: any) {
		this.context = { geography, worldTemplate };
	}

	public getLocation(locationId: string): SpatialLocationProjection | null {
		const node = this.context.geography.getNode(locationId);
		if (!node) return null;

		const coordinates = node.coordinates || { x: 0, y: 0 };
		return {
			locationId: node.id,
			name: node.name,
			point: {
				x: Number(coordinates.x) || 0,
				y: Number(coordinates.y) || 0,
				z: finite(coordinates.elevation) ? coordinates.elevation : undefined,
			},
			accessible: Boolean(node.accessible),
			discovered: Boolean(node.discovered),
			regionId: node.regionId,
			environment: this.getRawLocationEnvironment(node),
		};
	}

	public getAllLocations(): SpatialLocationProjection[] {
		return this.context.geography.getAllNodes()
			.map((node) => this.getLocation(node.id))
			.filter((location): location is SpatialLocationProjection => Boolean(location));
	}

	public findPath(originLocationId: string, destinationLocationId: string, mode: TravelMode = 'Foot'): SpatialPathResult {
		const origin = this.getLocation(originLocationId);
		const destination = this.getLocation(destinationLocationId);

		if (!origin) {
			return {
				found: false,
				routeLocationIds: [],
				edges: [],
				totalDistanceKm: 0,
				estimatedDurationSeconds: 0,
				reason: `Origin "${originLocationId}" does not exist.`,
			};
		}

		if (!destination) {
			return {
				found: false,
				routeLocationIds: [],
				edges: [],
				totalDistanceKm: 0,
				estimatedDurationSeconds: 0,
				reason: `Destination "${destinationLocationId}" does not exist.`,
			};
		}

		if (!destination.accessible && originLocationId !== destinationLocationId) {
			return {
				found: false,
				routeLocationIds: [],
				edges: [],
				totalDistanceKm: 0,
				estimatedDurationSeconds: 0,
				reason: `Destination "${destination.name}" is spatially inaccessible.`,
			};
		}

		const route = this.context.geography.findPath(originLocationId, destinationLocationId, mode);
		if (!route.found) {
			return {
				...route,
				reason: `No traversable spatial route exists between "${origin.name}" and "${destination.name}".`,
			};
		}

		const blockedSpatialNode = route.routeLocationIds
			.slice(1, -1)
			.map((id) => this.getLocation(id))
			.find((location) => location && !location.accessible);

		if (blockedSpatialNode) {
			return {
				...route,
				found: false,
				reason: `Route crosses inaccessible location "${blockedSpatialNode.name}".`,
			};
		}

		return route;
	}

	public distanceBetweenLocations(originLocationId: string, destinationLocationId: string): number | null {
		const origin = this.getLocation(originLocationId);
		const destination = this.getLocation(destinationLocationId);
		if (!origin || !destination) return null;
		return distance(origin.point, destination.point);
	}

	public canSeeLocations(originLocationId: string, destinationLocationId: string): SpatialLineQueryResult {
		const origin = this.getLocation(originLocationId);
		const destination = this.getLocation(destinationLocationId);
		if (!origin || !destination) {
			return {
				clear: false,
				distance: 0,
				reason: 'Both spatial locations must exist before line-of-sight can be resolved.',
			};
		}

		return this.canSeePoints(origin.point, destination.point);
	}

	public canSeePoints(origin: SpatialPoint, destination: SpatialPoint): SpatialLineQueryResult {
		return resolveSpatialLineOfSight(origin, destination, this.getObstacles());
	}

	public canHearLocations(originLocationId: string, destinationLocationId: string, maxDistance = 30): boolean {
		const separation = this.distanceBetweenLocations(originLocationId, destinationLocationId);
		return separation !== null && separation <= maxDistance;
	}

	public hasLineOfFire(originLocationId: string, destinationLocationId: string): SpatialLineQueryResult {
		const line = this.canSeeLocations(originLocationId, destinationLocationId);
		if (!line.clear) return line;

		const cover = this.getCoverBetweenLocations(originLocationId, destinationLocationId);
		if (cover.level === 'TOTAL') {
			return {
				clear: false,
				distance: line.distance,
				blockedBy: cover.sourceId,
				reason: 'Line of fire is blocked by total cover.',
			};
		}

		return line;
	}

	public getCoverBetweenLocations(originLocationId: string, destinationLocationId: string): SpatialCoverQueryResult {
		const origin = this.getLocation(originLocationId);
		const destination = this.getLocation(destinationLocationId);
		if (!origin || !destination) {
			return { level: 'NONE', distance: 0 };
		}
		return resolveSpatialCoverBetweenPoints(origin.point, destination.point, this.getObstacles());
	}

	public getElevationDifference(originLocationId: string, destinationLocationId: string): number | null {
		const origin = this.getLocation(originLocationId);
		const destination = this.getLocation(destinationLocationId);
		if (!origin || !destination) return null;
		return (destination.point.z || 0) - (origin.point.z || 0);
	}

	public getEnvironment(locationId: string): SpatialEnvironmentProjection | null {
		const location = this.getLocation(locationId);
		if (!location) return null;

		const rawNode: any = this.context.geography.getNode(locationId);
		const rawEnvironment =
			rawNode?.environment ||
			this.context.worldTemplate?.geography?.locationEnvironment?.[locationId] ||
			this.context.worldTemplate?.geography?.environments?.[locationId] ||
			{};

		const hazards = this.getHazardsForPoint(location.point);

		return {
			locationId,
			elevation: location.point.z,
			terrain: rawEnvironment?.terrain || rawNode?.terrain,
			weather: rawEnvironment?.weather,
			temperature: rawEnvironment?.temperature,
			wind: rawEnvironment?.wind,
			smoke: rawEnvironment?.smoke,
			hazards,
		};
	}

	public getObstacles(): SpatialObstacle[] {
		const geography = this.context.worldTemplate?.geography || {};
		const raw = [
			...(Array.isArray(geography.spatialObstacles) ? geography.spatialObstacles : []),
			...(Array.isArray(geography.obstacles) ? geography.obstacles : []),
		];
		return raw
			.map((item, index) => normalizeRect(item, `obstacle_${index + 1}`))
			.filter((item): item is SpatialObstacle => Boolean(item));
	}

	public getHazards(): SpatialHazard[] {
		const geography = this.context.worldTemplate?.geography || {};
		const raw = [
			...(Array.isArray(geography.spatialHazards) ? geography.spatialHazards : []),
			...(Array.isArray(geography.hazards) ? geography.hazards : []),
		];
		return raw
			.map((item, index) => {
				const normalized = normalizeRect(item, `hazard_${index + 1}`);
				if (!normalized) return null;
				return {
					id: normalized.id,
					minX: normalized.minX,
					maxX: normalized.maxX,
					minY: normalized.minY,
					maxY: normalized.maxY,
					type: String((item as any)?.type || (item as any)?.kind || 'ENVIRONMENTAL'),
					severity: typeof (item as any)?.severity === 'string' ? (item as any).severity : undefined,
					blocksMovement: Boolean((item as any)?.blocksMovement),
				} as SpatialHazard;
			})
			.filter((item): item is SpatialHazard => Boolean(item));
	}

	public getSpatialSnapshot(): SpatialAuthoritySnapshot {
		return {
			version: 1,
			locationCount: this.context.geography.getAllNodes().length,
			obstacleCount: this.getObstacles().length,
			hazardCount: this.getHazards().length,
		};
	}

	private getRawLocationEnvironment(node: LocationNode): Record<string, unknown> | undefined {
		const source = node as any;
		const environment = source.environment;
		return environment && typeof environment === 'object' ? { ...environment } : undefined;
	}


	private getHazardsForPoint(point: SpatialPoint): SpatialHazard[] {
		return this.getHazards().filter((hazard) =>
			point.x >= hazard.minX &&
			point.x <= hazard.maxX &&
			point.y >= hazard.minY &&
			point.y <= hazard.maxY
		);
	}
}
