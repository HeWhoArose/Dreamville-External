/**
 * Canonical server-side equipment rules.
 *
 * Phase 9 makes this module the authoritative counterpart to the Genesis
 * equipment rules so client metadata cannot override server legality.
 */

export type EquipmentClass =
	| 'WEAPON'
	| 'ARMOR'
	| 'SHIELD'
	| 'ACCESSORY'
	| 'TOOL'
	| 'CONSUMABLE'
	| 'FOOD'
	| 'POTION'
	| 'DOCUMENT'
	| 'QUEST'
	| 'MATERIAL'
	| 'MISC';

export type HandUsage = 'NONE' | 'MAIN_HAND' | 'OFF_HAND' | 'ONE_HAND' | 'TWO_HAND';

export type EquipmentSlot =
	| 'head'
	| 'cloak'
	| 'body'
	| 'hands'
	| 'waist'
	| 'legs'
	| 'feet'
	| 'mainHand'
	| 'offHand'
	| 'relic'
	| 'ring1'
	| 'ring2'
	| 'neck';

export interface EquipmentMetadataSource {
	category?: string;
	name?: string;
	description?: string;
	equipmentClass?: EquipmentClass;
	equipable?: boolean;
	allowedSlots?: EquipmentSlot[];
	handUsage?: HandUsage;
	properties?: Record<string, unknown>;
	tags?: string[];
}

const SLOT_ALIASES: Record<string, EquipmentSlot> = {
	head: 'head',
	helm: 'head',
	helmet: 'head',
	cloak: 'cloak',
	cape: 'cloak',
	robe: 'cloak',
	back: 'cloak',
	body: 'body',
	chest: 'body',
	armor: 'body',
	torso: 'body',
	cuirass: 'body',
	hands: 'hands',
	gloves: 'hands',
	gauntlets: 'hands',
	waist: 'waist',
	belt: 'waist',
	legs: 'legs',
	pants: 'legs',
	greaves: 'legs',
	feet: 'feet',
	boots: 'feet',
	shoes: 'feet',
	mainhand: 'mainHand',
	weapon: 'mainHand',
	right: 'mainHand',
	primary: 'mainHand',
	offhand: 'offHand',
	shield: 'offHand',
	left: 'offHand',
	secondary: 'offHand',
	relic: 'relic',
	artifact: 'relic',
	ring1: 'ring1',
	ring: 'ring1',
	ring2: 'ring2',
	neck: 'neck',
	amulet: 'neck',
	necklace: 'neck',
};

function normalizeText(value?: string): string {
	return String(value || '').trim().toLowerCase();
}

export function normalizeEquipmentSlot(slot?: string): EquipmentSlot | undefined {
	const normalized = normalizeText(slot).replace(/[\\s_-]/g, '');
	return SLOT_ALIASES[normalized];
}

export function getEquipmentClass(item: EquipmentMetadataSource): EquipmentClass {
	if (item.equipmentClass) return item.equipmentClass;

	const category = normalizeText(item.category).toUpperCase();
	const name = normalizeText(item.name);

	if (
		category === 'WEAPON' ||
		['blade', 'sword', 'bow', 'kunai', 'dagger', 'staff', 'axe', 'spear', 'mace'].some((word) => name.includes(word))
	) return 'WEAPON';
	if (category === 'SHIELD' || name.includes('shield')) return 'SHIELD';
	if (
		category === 'ACCESSORY' ||
		category === 'RING' ||
		category === 'AMULET' ||
		['ring', 'amulet', 'cloak', 'necklace', 'pendant', 'cape'].some((word) => name.includes(word))
	) return 'ACCESSORY';
	if (
		category === 'ARMOR' ||
		['cuirass', 'plate', 'robes', 'helmet', 'armor', 'boots', 'gloves', 'gauntlet', 'belt'].some((word) => name.includes(word))
	) return 'ARMOR';
	if (category === 'POTION' || ['potion', 'vial', 'elixir'].some((word) => name.includes(word))) return 'POTION';
	if (category === 'FOOD' || ['apple', 'ration', 'food', 'bread', 'fruit'].some((word) => name.includes(word))) return 'FOOD';
	if (category === 'CONSUMABLE' || ['candy', 'salve', 'pill', 'scroll'].some((word) => name.includes(word))) return 'CONSUMABLE';
	if (category === 'TOOL' || ['flashlight', 'shovel', 'compass', 'flint', 'grappling'].some((word) => name.includes(word))) return 'TOOL';
	if (category === 'DOCUMENT' || ['map', 'writ', 'letter'].some((word) => name.includes(word))) return 'DOCUMENT';
	if (category === 'QUEST') return 'QUEST';
	if (category === 'MATERIAL') return 'MATERIAL';
	return 'MISC';
}

export function isEquipable(item: EquipmentMetadataSource): boolean {
	if (typeof item.equipable === 'boolean') return item.equipable;
	switch (getEquipmentClass(item)) {
		case 'WEAPON':
		case 'ARMOR':
		case 'SHIELD':
		case 'ACCESSORY':
			return true;
		default:
			return false;
	}
}

export function getHandUsage(item: EquipmentMetadataSource): HandUsage {
	if (item.handUsage) return item.handUsage;

	const eqClass = getEquipmentClass(item);
	if (eqClass === 'SHIELD') return 'OFF_HAND';
	if (eqClass !== 'WEAPON') return 'NONE';

	const fullText = `${normalizeText(item.name)} ${normalizeText(item.description)} ${JSON.stringify(item.properties || {}).toLowerCase()} ${(item.tags || []).join(' ').toLowerCase()}`;
	if (
		fullText.includes('two-hand') ||
		fullText.includes('2h') ||
		['greatsword', 'greataxe', 'longbow', 'crossbow', 'staff', 'spear', 'polearm', 'halberd'].some((word) => fullText.includes(word))
	) return 'TWO_HAND';

	return 'ONE_HAND';
}

export function getCompatibleEquipmentSlots(item: EquipmentMetadataSource): EquipmentSlot[] {
	if (!isEquipable(item)) return [];

	if (Array.isArray(item.allowedSlots) && item.allowedSlots.length > 0) {
		return [...new Set(item.allowedSlots.map((slot) => normalizeEquipmentSlot(slot)).filter((slot): slot is EquipmentSlot => Boolean(slot)))];
	}

	const eqClass = getEquipmentClass(item);
	const name = normalizeText(item.name);

	if (eqClass === 'WEAPON') {
		const usage = getHandUsage(item);
		if (usage === 'OFF_HAND') return ['offHand'];
		return ['mainHand', 'offHand'];
	}
	if (eqClass === 'SHIELD') return ['offHand'];
	if (eqClass === 'ARMOR') {
		if (['helmet', 'hat', 'crown', 'hood', 'visor', 'cap', 'helm'].some((word) => name.includes(word))) return ['head'];
		if (['boots', 'shoes', 'greaves', 'sabatons'].some((word) => name.includes(word))) return ['feet'];
		if (['gloves', 'gauntlets', 'bracers'].some((word) => name.includes(word))) return ['hands'];
		if (['belt', 'girdle'].some((word) => name.includes(word))) return ['waist'];
		if (['pants', 'leggings', 'cuisses'].some((word) => name.includes(word))) return ['legs'];
		return ['body'];
	}
	if (eqClass === 'ACCESSORY') {
		if (name.includes('ring')) return ['ring1', 'ring2'];
		if (name.includes('neck') || name.includes('amulet') || name.includes('pendant')) return ['neck'];
		if (name.includes('cloak') || name.includes('cape') || name.includes('backpack')) return ['cloak'];
		if (name.includes('glove')) return ['hands'];
		if (name.includes('belt')) return ['waist'];
		return ['ring1', 'ring2'];
	}
	return [];
}

export function getOccupiedSlots(item: EquipmentMetadataSource, targetSlot: EquipmentSlot): EquipmentSlot[] {
	const usage = getHandUsage(item);
	if (usage === 'TWO_HAND' && (targetSlot === 'mainHand' || targetSlot === 'offHand')) {
		return ['mainHand', 'offHand'];
	}
	return [targetSlot];
}

export function canEquipItemToSlot(item: EquipmentMetadataSource, slot: string): boolean {
	const normalized = normalizeEquipmentSlot(slot);
	return Boolean(normalized && isEquipable(item) && getCompatibleEquipmentSlots(item).includes(normalized));
}

export function normalizeEquipmentMetadata<T extends EquipmentMetadataSource>(item: T): T & {
	equipmentClass: EquipmentClass;
	equipable: boolean;
	handUsage: HandUsage;
	allowedSlots: EquipmentSlot[];
} {
	const equipmentClass = getEquipmentClass(item);
	const equipable = isEquipable(item);
	const handUsage = getHandUsage(item);
	const allowedSlots = getCompatibleEquipmentSlots(item);
	return {
		...item,
		equipmentClass,
		equipable,
		handUsage,
		allowedSlots,
	};
}
