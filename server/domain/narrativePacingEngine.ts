import type { CurrentSituation } from './currentSituation';
import type { PlayerIntent } from './playerIntentInterpreter';
import type { ActionResolution } from './actionResolution';
import type { NarrativeContinuityState } from './narrativeContinuityState';

export type NarrativePacingProfile = 'MICRO' | 'COMPACT' | 'STANDARD' | 'EXPANDED' | 'KINETIC' | 'CONSEQUENCE';
export interface NarrativePacingControls { enabled: boolean; minWords: number; maxWords: number; minParagraphs: number; maxParagraphs: number; outputTokenReserve: number; }
export interface NarrativePacingContract { version: 1; profile: NarrativePacingProfile; reason: string; controls: NarrativePacingControls; signals: string[]; variation: string; }
export const DEFAULT_NARRATIVE_PACING_CONTROLS: NarrativePacingControls = { enabled: true, minWords: 45, maxWords: 280, minParagraphs: 1, maxParagraphs: 3, outputTokenReserve: 80 };
function text(value: unknown): string { return String(value ?? '').trim(); }
function lower(value: unknown): string { return text(value).toLowerCase(); }
function hasRecentNarration(situation: CurrentSituation): boolean { return Array.isArray(situation.recentTurns) && situation.recentTurns.some((turn) => text(turn.narration)); }
function hasMajorOutcome(resolution?: ActionResolution): boolean { const tier = lower(resolution?.outcomeTier); return ['critical_success','critical_failure','success_with_cost','failure_with_cost'].includes(tier); }
function hasDiscovery(situation: CurrentSituation, intent: PlayerIntent): boolean {
		// Asking a question or looking for information is not itself a discovery.
		// Ambient population/activity events are scene texture, not proof of a reveal.
		const events = Array.isArray(situation.visibleEvents) ? situation.visibleEvents : [];
		const hasSubstantiveEvent = events.some((event: any) => {
			const type = String(event?.type || '').toUpperCase();
			const source = String(event?.source || '').toUpperCase();
			return !['AMBIENT_ACTIVITY', 'SOCIAL_OPPORTUNITY', 'POTENTIAL_ENCOUNTER', 'NPC_INITIATED_INTERACTION'].includes(type)
				&& !source.includes('WORLD_ACTIVITY_DIRECTOR');
		});
		return hasSubstantiveEvent || Boolean(intent.observationIntent && events.some((event: any) =>
			!['AMBIENT_ACTIVITY', 'SOCIAL_OPPORTUNITY'].includes(String(event?.type || '').toUpperCase())
		));
	}

export class NarrativePacingEngine {
	public static resolve(params: { situation: CurrentSituation; intent: PlayerIntent; actionResolution?: ActionResolution; canonicalOutcome?: string; continuityState?: NarrativeContinuityState; controls?: Partial<NarrativePacingControls>; }): NarrativePacingContract {
		const base = { ...DEFAULT_NARRATIVE_PACING_CONTROLS, ...(params.controls || {}) };
		if (!base.enabled) return { version: 1, profile: 'STANDARD', reason: 'N8 pacing is disabled.', controls: base, signals: ['disabled'], variation: 'Use natural scene rhythm without a hard pacing target.' };
		const intent = params.intent; const signals: string[] = []; const recent = hasRecentNarration(params.situation);
		const movement = intent.movementIntent; const dialogue = intent.interactionMode === 'DIALOGUE' || intent.speechIntent; const combat = intent.interactionMode === 'COMBAT';
		const microAction = !movement && !dialogue && !combat && !intent.observationIntent && text(intent.originalText).length <= 24;
		const majorOutcome = hasMajorOutcome(params.actionResolution) || Boolean(params.canonicalOutcome && params.canonicalOutcome.length > 120);
		const discovery = hasDiscovery(params.situation, intent);
		const continuityMomentum = params.continuityState?.sceneMomentum || 'STEADY';
		const elevatedContinuity = ['BUILDING', 'ESCALATING'].includes(continuityMomentum);
		const releasingContinuity = continuityMomentum === 'RELEASING';
		const newLocation = movement && Boolean(intent.locationTarget) && (!recent || /enter|arrive/i.test(intent.action));
		const activeDialogue = Boolean(params.situation.activeDialogue) && dialogue;
		let profile: NarrativePacingProfile = 'STANDARD'; let reason = 'Normal scene interaction deserves a moderate response.'; let minWords = 85; let maxWords = 190; let minParagraphs = 1; let maxParagraphs = 2;
		if (microAction) { profile='MICRO'; reason='The player action is tiny and self-contained; preserve momentum with a brief beat.'; minWords=25; maxWords=85; maxParagraphs=1; signals.push('tiny_action'); }
		else if (combat) { profile='KINETIC'; reason='Combat benefits from compressed, active beats rather than exposition.'; minWords=70; maxWords=175; maxParagraphs=2; signals.push('combat'); }
		else if (majorOutcome) { profile='CONSEQUENCE'; reason='A meaningful canonical consequence deserves enough space to land without inventing aftermath.'; minWords=120; maxWords=300; maxParagraphs=3; signals.push('major_outcome'); }
		else if ((newLocation || (!recent && Boolean(params.situation.location?.description))) && !dialogue) { profile='EXPANDED'; reason='A new or opening scene benefits from brief spatial grounding before the next beat; prioritize people, action, and the immediate hook over scenic inventory.'; minWords=90; maxWords=190; maxParagraphs=2; signals.push(newLocation ? 'new_location' : 'scene_opening'); }
		else if (dialogue || activeDialogue) { profile='COMPACT'; reason='Dialogue should leave room for the player to respond rather than monologue.'; minWords=45; maxWords=135; maxParagraphs=2; signals.push('awaiting_dialogue'); }
		else if (discovery || elevatedContinuity) { profile=discovery ? 'STANDARD' : 'COMPACT'; reason=discovery ? 'A supported new fact deserves a clear explanation; include atmosphere only when it helps the reveal.' : 'The current scene is building or escalating; advance the beat without padding.'; minWords=discovery ? 75 : 55; maxWords=elevatedContinuity ? 190 : 155; maxParagraphs=2; signals.push(discovery ? 'discovery' : 'continuity_build'); }
		else if (movement) { profile='COMPACT'; reason='Routine movement should advance the scene without turning travel into filler.'; minWords=55; maxWords=145; maxParagraphs=2; signals.push('movement'); }
		if (releasingContinuity && profile === 'STANDARD') { maxWords = 155; signals.push('continuity_release'); }
		else signals.push('normal_interaction');
		if (intent.observationIntent) signals.push('observation'); if (intent.speechIntent) signals.push('speech'); if (params.situation.plot?.currentArc) signals.push('arc:' + params.situation.plot.currentArc.toLowerCase());
		return { version:1, profile, reason, controls:{ ...base, minWords:Math.min(base.maxWords,minWords), maxWords:Math.min(base.maxWords,Math.max(minWords,maxWords)), minParagraphs, maxParagraphs, outputTokenReserve:base.outputTokenReserve }, signals, variation:'Treat these ranges as guidance, not a paragraph template. Let sentence rhythm and the actual scene determine the exact length.' };
	}
	public static toPromptContext(contract: NarrativePacingContract): string { if (!contract.controls.enabled) return 'N8 ADAPTIVE PACING: disabled.'; return ['N8 ADAPTIVE PACING CONTRACT','Profile: '+contract.profile,'Reason: '+contract.reason,'Target range: approximately '+contract.controls.minWords+'-'+contract.controls.maxWords+' words.','Paragraph range: '+contract.controls.minParagraphs+'-'+contract.controls.maxParagraphs+'.','Signals: '+(contract.signals.join(', ') || 'none'),contract.variation,'Do not pad the response to reach the upper bound. Do not truncate a necessary immediate consequence merely to hit the lower bound.'].join('\n'); }
	public static outputTokenBudget(contract: NarrativePacingContract, providerCap=650): number { if (!contract.controls.enabled) return providerCap; const estimated=Math.ceil(contract.controls.maxWords/0.72)+contract.controls.outputTokenReserve; return Math.max(120,Math.min(providerCap,estimated)); }
	public static validateNarration(value:string, contract:NarrativePacingContract): {valid:boolean;wordCount:number;paragraphCount:number;reason?:string} { const wordCount=text(value)?text(value).split(/\s+/).filter(Boolean).length:0; const paragraphCount=text(value)?text(value).split(/\n\s*\n/).filter(Boolean).length:0; if(!contract.controls.enabled)return{valid:true,wordCount,paragraphCount}; const hardUpper=Math.ceil(contract.controls.maxWords*1.35); if(wordCount>hardUpper)return{valid:false,wordCount,paragraphCount,reason:'Narration exceeds N8 pacing ceiling ('+wordCount+' > '+hardUpper+' words).'}; if(paragraphCount>contract.controls.maxParagraphs)return{valid:false,wordCount,paragraphCount,reason:'Narration exceeds N8 paragraph ceiling ('+paragraphCount+' > '+contract.controls.maxParagraphs+').'}; if(contract.profile==='MICRO'&&wordCount>contract.controls.maxWords)return{valid:false,wordCount,paragraphCount,reason:'Micro beat is too long.'}; return{valid:true,wordCount,paragraphCount}; }
}