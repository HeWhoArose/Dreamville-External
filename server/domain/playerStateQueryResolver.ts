import type { ActionLog } from '../../src/types';
import type { InventoryItemEngine } from './inventoryItem';

export type PlayerStateQueryKind = 'CURRENCY_BALANCE' | 'INVENTORY_SUMMARY';

export interface PlayerStateQueryResult {
	kind: PlayerStateQueryKind;
	response: string;
	evidenceItemIds: string[];
	isFollowUp: boolean;
}

const CURRENCY_TERMS = /\b(?:currency|money|cash|coins?|gold pieces?|silver pieces?|copper pieces?|platinum pieces?|purse|wallet|funds|balance|wealth)\b/i;
const INVENTORY_TERMS = /\b(?:inventory|items? (?:do|in) i have|what am i carrying|what(?:'s| is) in my bag|check my items|my belongings)\b/i;
const CURRENCY_QUESTION = /\b(?:how much|how many|check|count|calculate|calculate|total|sum|add up|work out|what amount|what(?:'s| is) my)\b/i;
const CALCULATION_FOLLOW_UP = /\b(?:calculate|compute|count|total|sum|add up|work out|how much|how many)\b/i;
const REFERENTIAL_FOLLOW_UP = /\b(?:it|there|that|those|them|the amount|the total|the currency|the coins)\b/i;

function clean(value: unknown): string {
	return String(value ?? '').trim();
}

function isPriorCurrencyQuery(value: unknown): boolean {
	const text = clean(value);
	return CURRENCY_TERMS.test(text) && CURRENCY_QUESTION.test(text);
}

function normalizeName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export class PlayerStateQueryResolver {
	public static resolve(params: {
		actionText: string;
		actorId: string;
		inventory: InventoryItemEngine;
		recentActions: Array<Pick<ActionLog, 'description' | 'actionType'>>;
	}): PlayerStateQueryResult | null {
		const actionText = clean(params.actionText);
		if (!actionText) return null;

		const recentCurrencyContext = params.recentActions
			.slice(0, 8)
			.some((entry) => isPriorCurrencyQuery(entry.description));
		const currencyQuery = CURRENCY_TERMS.test(actionText) && CURRENCY_QUESTION.test(actionText);
		const currencyFollowUp = !CURRENCY_TERMS.test(actionText)
			&& CALCULATION_FOLLOW_UP.test(actionText)
			&& REFERENTIAL_FOLLOW_UP.test(actionText)
			&& recentCurrencyContext;
		const inventoryQuery = INVENTORY_TERMS.test(actionText);

		if (!currencyQuery && !currencyFollowUp && !inventoryQuery) return null;

		const items = params.inventory.getActorInventory(params.actorId)
			.filter((item) => item.containerType === 'actor' && item.destroyedAtSeconds === undefined);
		const currencyItems = items.filter((item) => {
			const definition = params.inventory.getItemDefinition(item.defId);
			const evidence = [
				item.name,
				item.category,
				definition?.name,
				definition?.category,
				...(definition?.tags || []),
				...Object.entries(definition?.properties || {})
					.filter(([key, value]) => /currency|denomination|coin/i.test(key) && (value === true || typeof value === 'string'))
					.map(([key, value]) => key + ' ' + String(value)),
			].map(clean).join(' ');
			return /\b(?:currency|coins?|money|cash|gold coins?|silver coins?|copper coins?|platinum coins?|gold pieces?|silver pieces?|copper pieces?|platinum pieces?|ducats?|credits?)\b/i.test(evidence)
				|| String(definition?.category || '').toLowerCase() === 'currency'
				|| (definition?.tags || []).some((tag) => /^(currency|coin|coins|money)$/i.test(tag));
		});

		if (currencyQuery || currencyFollowUp) {
			if (currencyItems.length === 0) {
				return {
					kind: 'CURRENCY_BALANCE',
					response: currencyFollowUp
						? 'There is no recorded currency amount to calculate. Your canonical inventory contains no currency or coin items, and no separate wallet balance is recorded for this character. I cannot confirm a total without inventing one.'
						: 'I checked your recorded inventory, but no currency or coin items are listed, and no separate wallet balance is recorded for this character. I cannot confirm how much currency you have, so I will not invent a purse or coin total.',
					evidenceItemIds: [],
					isFollowUp: currencyFollowUp,
				};
			}

			const holdings = new Map<string, { name: string; quantity: number; ids: string[] }>();
			for (const item of currencyItems) {
				const definition = params.inventory.getItemDefinition(item.defId);
				const name = clean(item.name || definition?.name || item.defId);
				const key = normalizeName(name);
				const existing = holdings.get(key) || { name, quantity: 0, ids: [] };
				existing.quantity += Math.max(0, Math.trunc(Number(item.quantity) || 0));
				existing.ids.push(item.id);
				holdings.set(key, existing);
			}
			const listed = Array.from(holdings.values())
				.map((holding) => holding.quantity + ' × ' + holding.name)
				.join('; ');
			return {
				kind: 'CURRENCY_BALANCE',
				response: 'Your canonical inventory records these currency holdings: ' + listed + '. These are separate recorded stacks; I have not converted denominations or treated an item’s sale value as money.',
				evidenceItemIds: currencyItems.map((item) => item.id),
				isFollowUp: currencyFollowUp,
			};
		}

		const listed = items.map((item) => clean(item.name) + ' × ' + Math.max(0, Math.trunc(Number(item.quantity) || 0)));
		return {
			kind: 'INVENTORY_SUMMARY',
			response: listed.length
				? 'Your recorded inventory contains: ' + listed.join('; ') + '.'
				: 'Your canonical inventory currently has no owned item stacks recorded.',
			evidenceItemIds: items.map((item) => item.id),
			isFollowUp: false,
		};
	}
}
