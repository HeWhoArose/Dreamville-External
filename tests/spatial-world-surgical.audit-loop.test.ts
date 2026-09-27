import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryWorldRepository } from '../server/repositories/worldRepository';
import { WorldSimulationService } from '../server/simulation/worldSimulationService';
import {
	SpatialAuthority,
	resolveSpatialLineOfSight,
	resolveSpatialCoverBetweenPoints,
	type SpatialObstacle,
} from '../server/domain/spatialAuthority';

test('S6 spatial authority and integrations survive ten surgical audit passes', () => {
	for (let pass = 1; pass <= 10; pass += 1) {
		const repo = new InMemoryWorldRepository({ disablePersistence: true });
		const storyId = `s6_spatial_audit_${pass}`;
		repo.seedStory(storyId);

		const spatial = repo.getSpatialAuthority(storyId);
		assert.ok(spatial instanceof SpatialAuthority, `Pass ${pass}: repository did not expose SpatialAuthority`);

		const origin = spatial.getLocation('loc_whispering_orrery');
		const vault = spatial.getLocation('loc_lantern_vault');
		const glasswood = spatial.getLocation('loc_glasswood_verge');
		assert.ok(origin && vault && glasswood, `Pass ${pass}: default geography projection is incomplete`);

		const pathToVault = spatial.findPath('loc_whispering_orrery', 'loc_lantern_vault', 'Foot');
		assert.equal(pathToVault.found, true, `Pass ${pass}: spatial path to discovered accessible location failed`);
		assert.ok(pathToVault.routeLocationIds.length >= 2, `Pass ${pass}: route did not contain both endpoints`);
		assert.ok(pathToVault.totalDistanceKm > 0, `Pass ${pass}: route distance was not canonical`);

		const blockedPath = spatial.findPath('loc_whispering_orrery', 'loc_glasswood_verge', 'Foot');
		assert.equal(blockedPath.found, false, `Pass ${pass}: inaccessible destination was incorrectly traversable`);
		assert.match(blockedPath.reason || '', /inaccessible|No traversable spatial route/i);

		const blocker: SpatialObstacle = {
			id: `audit_wall_${pass}`,
			minX: 4,
			maxX: 6,
			minY: -1,
			maxY: 1,
			blocksMovement: true,
			blocksSight: true,
			cover: 'TOTAL',
		};

		const blockedSight = resolveSpatialLineOfSight(
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			[blocker],
		);
		assert.equal(blockedSight.clear, false, `Pass ${pass}: LOS ignored blocking geometry`);
		assert.equal(blockedSight.blockedBy, blocker.id);

		const clearSight = resolveSpatialLineOfSight(
			{ x: 0, y: 5 },
			{ x: 10, y: 5 },
			[blocker],
		);
		assert.equal(clearSight.clear, true, `Pass ${pass}: LOS falsely reported a blocker`);

		const cover = resolveSpatialCoverBetweenPoints(
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			[blocker],
		);
		assert.equal(cover.level, 'TOTAL', `Pass ${pass}: cover query disagreed with blocking geometry`);

		const gridPath = resolveSpatialGridMovementPath(
			'actor',
			{ x: 0, y: 0 },
			{ x: 3, y: 3 },
			{ minX: -10, maxX: 10, minY: -10, maxY: 10 },
			[{ x: 1, y: 1, isImpassable: true }],
			[],
			[],
		);
		assert.equal(gridPath, undefined, `Pass ${pass}: tactical grid path crossed an impassable blocker`);

		const clearGridPath = resolveSpatialGridMovementPath(
			'actor',
			{ x: 0, y: 0 },
			{ x: 3, y: 2 },
			{ minX: -10, maxX: 10, minY: -10, maxY: 10 },
			[],
			[{ type: 'ice_patch', x: 2, y: 1, radiusCells: 2 }],
			[],
		);
		assert.ok(clearGridPath, `Pass ${pass}: tactical grid path was not resolved by spatial authority`);
		assert.ok(calculateSpatialGridMovementCost(clearGridPath!, [{ type: 'ice_patch', x: 2, y: 1, radiusCells: 2 }]) > 0);

		let spatialAuthorityCalls = 0;
		const originalGetSpatialAuthority = repo.getSpatialAuthority.bind(repo);
		(repo as any).getSpatialAuthority = (id: string) => {
			spatialAuthorityCalls += 1;
			return originalGetSpatialAuthority(id);
		};

		const simulation = new WorldSimulationService(repo);
		const travel = simulation.startPlayerTravel(storyId, 'loc_lantern_vault', 'Foot');
		assert.equal(travel.success, true, `Pass ${pass}: macro travel did not resolve through canonical spatial routing`);
		assert.equal(spatialAuthorityCalls, 1, `Pass ${pass}: WorldSimulationService did not call SpatialAuthority`);

		const lifecycle = repo.getPlayerLifecycle(storyId);
		assert.equal(lifecycle?.activeJourney?.destinationLocationId, 'loc_lantern_vault');
		assert.equal(lifecycle?.locationId, 'loc_whispering_orrery', `Pass ${pass}: travel mutated location before arrival`);
	}
});
