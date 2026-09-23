import { deterministicId } from './deterministicRng';

export type FacilityNodeKind = 'ROOM' | 'CORRIDOR' | 'ENTRANCE' | 'EXIT' | 'VENT' | 'ELEVATOR' | 'HIDDEN_AREA';
export type FacilityDeviceKind = 'CAMERA' | 'SENSOR' | 'LOCK' | 'DOOR' | 'TRAP' | 'TERMINAL';
export type FacilityAlarmState = 'DISARMED' | 'ARMED' | 'ALERT' | 'LOCKDOWN';

export interface FacilityNode {
	id: string;
	kind: FacilityNodeKind;
	name: string;
	hidden: boolean;
	connectedNodeIds: string[];
	securityZoneId?: string;
	state: Record<string, unknown>;
}

export interface FacilityDevice {
	id: string;
	kind: FacilityDeviceKind;
	nodeId: string;
	hidden: boolean;
	active: boolean;
	difficulty: number;
	state: Record<string, unknown>;
}

export interface FacilitySecurityZone {
	id: string;
	name: string;
	alarmState: FacilityAlarmState;
	powerCircuitId?: string;
	communicationsEnabled: boolean;
	guardEntityIds: string[];
	ruleIds: string[];
}

export interface FacilityState {
	schemaVersion: number;
	facilityId: string;
	nodes: Record<string, FacilityNode>;
	devices: Record<string, FacilityDevice>;
	securityZones: Record<string, FacilitySecurityZone>;
	power: Record<string, { enabled: boolean; load: number; capacity: number }>;
	communications: Record<string, boolean>;
	discoveredNodeIds: string[];
	discoveredDeviceIds: string[];
	updatedAtSeconds: number;
}

export interface FacilityDiscoveryResult {
	success: boolean;
	foundDeviceIds: string[];
	checkedDeviceIds: string[];
	reason: string;
}

export class FacilitySimulationEngine {
	public createState(facilityId: string, now = 0): FacilityState {
		return {
			schemaVersion: 1,
			facilityId,
			nodes: {},
			devices: {},
			securityZones: {},
			power: {},
			communications: {},
			discoveredNodeIds: [],
			discoveredDeviceIds: [],
			updatedAtSeconds: now,
		};
	}

	public addNode(state: FacilityState, node: Omit<FacilityNode, 'connectedNodeIds'> & { connectedNodeIds?: string[] }): void {
		state.nodes[node.id] = { ...node, connectedNodeIds: [...(node.connectedNodeIds || [])] };
	}

	public addDevice(state: FacilityState, device: FacilityDevice): void {
		if (!state.nodes[device.nodeId]) throw new Error(`Facility node '${device.nodeId}' does not exist.`);
		state.devices[device.id] = { ...device, state: { ...device.state } };
	}

	public addSecurityZone(state: FacilityState, zone: FacilitySecurityZone): void {
		state.securityZones[zone.id] = { ...zone, guardEntityIds: [...zone.guardEntityIds], ruleIds: [...zone.ruleIds] };
	}

	public connectNodes(state: FacilityState, a: string, b: string): void {
		if (!state.nodes[a] || !state.nodes[b]) throw new Error('Both facility nodes must exist before connecting them.');
		if (!state.nodes[a].connectedNodeIds.includes(b)) state.nodes[a].connectedNodeIds.push(b);
		if (!state.nodes[b].connectedNodeIds.includes(a)) state.nodes[b].connectedNodeIds.push(a);
	}

	public searchNode(state: FacilityState, nodeId: string, searchScore: number, now = state.updatedAtSeconds): FacilityDiscoveryResult {
		const node = state.nodes[nodeId];
		if (!node) return { success: false, foundDeviceIds: [], checkedDeviceIds: [], reason: 'Unknown facility node.' };
		const checked = Object.values(state.devices).filter((d) => d.nodeId === nodeId);
		const found = checked.filter((device) => !device.hidden || searchScore >= device.difficulty).map((d) => d.id);
		if (!state.discoveredNodeIds.includes(nodeId)) state.discoveredNodeIds.push(nodeId);
		for (const deviceId of found) {
			if (!state.discoveredDeviceIds.includes(deviceId)) state.discoveredDeviceIds.push(deviceId);
		}
		state.updatedAtSeconds = now;
		return {
			success: true,
			foundDeviceIds: found,
			checkedDeviceIds: checked.map((d) => d.id),
			reason: found.length === checked.length ? 'All discoverable devices were found.' : 'Some facility devices remain undiscovered.',
		};
	}

	public detectDevice(state: FacilityState, deviceId: string, now = state.updatedAtSeconds): { detected: boolean; alarmRaised: boolean; zoneId?: string } {
		const device = state.devices[deviceId];
		if (!device || !device.active) return { detected: false, alarmRaised: false };
		const node = state.nodes[device.nodeId];
		const zone = node?.securityZoneId ? state.securityZones[node.securityZoneId] : undefined;
		const alarmRaised = !!zone && zone.alarmState !== 'DISARMED';
		if (zone && zone.alarmState === 'ARMED') zone.alarmState = 'ALERT';
		state.updatedAtSeconds = now;
		return { detected: true, alarmRaised, zoneId: zone?.id };
	}

	public setPower(state: FacilityState, circuitId: string, enabled: boolean, load = state.power[circuitId]?.load ?? 0, capacity = state.power[circuitId]?.capacity ?? 100): void {
		state.power[circuitId] = { enabled, load, capacity };
		for (const device of Object.values(state.devices)) {
			const circuit = String(device.state.powerCircuitId || '');
			if (circuit === circuitId) device.active = enabled;
		}
	}

	public serialize(state: FacilityState): FacilityState {
		return JSON.parse(JSON.stringify(state));
	}

	public static stableId(...parts: string[]): string {
		return deterministicId('facility', ...parts);
	}
}
