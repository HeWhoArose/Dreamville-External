import type { WorldRepository } from '../repositories/worldRepository';
import type { ItemDefinition, ItemInstance } from './inventoryItem';

export interface ItemUseResolution {
	requested: boolean;
	found: boolean;
	item?: ItemInstance;
	definition?: ItemDefinition;
	availableAmount?: number;
	reason?: string;
}

function normalize(value: unknown): string {
	return String(value || '').trim().toLowerCase();
}

export class NarrativeStateBroker {
	public inspectItemUse(
		repository: WorldRepository,
		storyId: string,
		actorId: string,
		actionText: string,
	): ItemUseResolution {
		const requested = /\b(use|consume|drink|eat|apply|read)\b/i.test(actionText);
		if (!requested) return { requested: false, found: false };

		const normalizedAction = normalize(actionText);
		const inventory = repository.getInventoryEngine(storyId).getActorInventory(actorId);
		const matched = inventory
			.map((item) => ({
				item,
				score: normalizedAction.includes(normalize(item.name)) ? normalize(item.name).length : 0,
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => b.score - a.score)[0]?.item;

		if (!matched) {
			return {
				requested: true,
				found: false,
				reason: 'The requested item is not present in the actor inventory.',
			};
		}

		const definition = repository.getInventoryEngine(storyId).getItemDefinition(matched.defId);
		return {
			requested: true,
			found: true,
			item: matched,
			definition,
			availableAmount: matched.charges ?? matched.quantity,
		};
	}

	public commitItemUse(
		repository: WorldRepository,
		storyId: string,
		actorId: string,
		resolution: ItemUseResolution,
	): {
		success: boolean;
		consumed?: ReturnType<ReturnType<WorldRepository['getInventoryEngine']>['consumeItem']>;
		healing?: { requestedAmount: number; finalAmount: number; healthCurrent: number };
		errorReason?: string;
	} {
		if (!resolution.requested || !resolution.found || !resolution.item || !resolution.definition) {
			return { success: false, errorReason: resolution.reason || 'No canonical item use was resolved.' };
		}

		const consumable = Boolean(
			resolution.definition.consumption ||
			resolution.definition.maxCharges !== undefined ||
			resolution.definition.tags.some((tag) => normalize(tag) === 'consumable') ||
			['Potion', 'Food', 'Scroll'].includes(resolution.definition.category),
		);
		if (!consumable) {
			return { success: true };
		}

		const inventoryEngine = repository.getInventoryEngine(storyId);
		const consumed = inventoryEngine.consumeItem(actorId, resolution.item.id, 1);
		if (!consumed.success) return { success: false, consumed, errorReason: consumed.errorReason };

		const healAmount = Number((resolution.definition.properties as any)?.healAmount ?? 0);
		if (Number.isFinite(healAmount) && healAmount > 0) {
			const conditionEngine = repository.getConditionEngine(storyId);
			const healing = conditionEngine.resolveHealing(actorId, healAmount);
			return { success: true, consumed, healing };
		}

		return { success: true, consumed };
	}
}

export const narrativeStateBroker = new NarrativeStateBroker();
