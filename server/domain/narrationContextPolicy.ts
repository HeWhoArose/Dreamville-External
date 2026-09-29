export interface NarrationContextNeeds {
	includeHealth: boolean;
	includeInventory: boolean;
	includeCapabilities: boolean;
	includeRelationships: boolean;
	includeQuests: boolean;
	includeLore: boolean;
	includeMemories: boolean;
	includeCombat: boolean;
	maxRecentTurns: number;
}

const HAZARD_OR_HEALTH_PATTERN =
	/\b(damage|damaged|hurt|hit|injur|wound|bleed|bleeding|heal|health|hp|fall|fell|falling|trap|poison|toxic|gas|fumes|collapse|debris|crush|crushed|burn|burning|explosion|blast|fireball|drown|drowning|suffocat|death|die|dying)\b/i;

const INVENTORY_PATTERN =
	/\b(inventory|bag|pack|pouch|pocket|equip|equipped|equipment|weapon|armor|armour|item|object|scroll|staff|potion|key|take|pick up|drop|give|use)\b/i;

const CAPABILITY_PATTERN =
	/\b(cast|spell|ability|capability|skill|technique|power|invoke|activate|attack|strike|fire|launch)\b/i;

const LORE_PATTERN =
	/\b(inspect|examine|investigate|identify|decipher|translate|read|glyph|rune|lore|history|ancient|meaning|symbol|artifact)\b/i;

const QUEST_PATTERN =
	/\b(quest|mission|objective|journal|clue|lead|thread|destination|why am i here|what should i do)\b/i;

const RELATIONSHIP_PATTERN =
	/\b(talk|speak|ask|tell|answer|persuade|deceive|intimidate|trust|relationship|friend|enemy|npc|character)\b/i;

export function deriveNarrationContextNeeds(params: {
	actionText: string;
	committedOutcome?: string;
	npcTargetId?: string;
	isInCombat?: boolean;
}): NarrationContextNeeds {
	const source = [
		String(params.actionText || ''),
		String(params.committedOutcome || ''),
	].join(' ');

	const includeHealth = HAZARD_OR_HEALTH_PATTERN.test(source);
	const includeInventory = INVENTORY_PATTERN.test(source);
	const includeCapabilities = CAPABILITY_PATTERN.test(source);
	const includeLore = LORE_PATTERN.test(source);
	const includeQuests = QUEST_PATTERN.test(source);
	const includeRelationships = Boolean(params.npcTargetId) || RELATIONSHIP_PATTERN.test(source);
	const includeCombat = Boolean(params.isInCombat) || /\b(combat|initiative|attack|strike|enemy|target|defend|dodge)\b/i.test(source);

	return {
		includeHealth,
		includeInventory,
		includeCapabilities,
		includeRelationships,
		includeQuests,
		includeLore,
		includeMemories: true,
		includeCombat,
		maxRecentTurns: includeLore || includeRelationships || includeQuests ? 2 : 1,
	};
}
