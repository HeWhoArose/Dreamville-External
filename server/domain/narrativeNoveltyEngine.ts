export type NarrativeNoveltyCategory = 'PHRASE' | 'IMAGE' | 'OPENING' | 'REACTION' | 'TROPE';
export interface NarrativeNoveltyItem { category: NarrativeNoveltyCategory; key: string; text: string; count: number; lastSeenTurn: number; }
export interface NarrativeNoveltyState { version: 1; storyId: string; turnCount: number; items: NarrativeNoveltyItem[]; }
export interface NarrativeNoveltyControls { enabled: boolean; maxItems: number; maxPromptItems: number; recentTurnWindow: number; repetitionThreshold: number; }
export const DEFAULT_NARRATIVE_NOVELTY_CONTROLS: NarrativeNoveltyControls = { enabled: true, maxItems: 120, maxPromptItems: 18, recentTurnWindow: 20, repetitionThreshold: 2 };

const TROPE_PATTERNS: Array<[RegExp,string]> = [
 [/shadows?\s+(?:dance|danced|dancing|creep|crept|stretch|stretched)/i,'dancing_shadows'],
 [/a\s+chill\s+(?:runs|ran|creeps|crept)\s+(?:down|along)/i,'chill_runs_down'],
 [/hair\s+(?:on|at)\s+(?:the|your)\s+(?:back|neck)\s+(?:rise|stood)/i,'hair_raising_chill'],
 [/air\s+(?:grows|grew|becomes|became)\s+(?:heavy|thick|still)/i,'heavy_air'],
 [/silence\s+(?:hangs|hung|falls|fell|settles|settled)/i,'heavy_silence'],
 [/eyes?\s+(?:narrow|narrowed|flick|flicked|lock|locked)\s+on/i,'intense_eye_contact'],
 [/voice\s+(?:drops|dropped|lowers|lowered)\s+to\s+a\s+(?:whisper|murmur)/i,'lowered_whisper'],
];
const IMAGE_PATTERNS: Array<[string,RegExp]> = [
 ['shadow',/\bshadow(?:s|ed|ing)?\b/i],['darkness',/\bdark(?:ness|en|ened|ening)?\b/i],['wind',/\bwind(?:y|s|ing)?\b/i],
 ['rain',/\brain(?:s|ing|ed)?\b/i],['smoke',/\bsmok(?:e|y|ed|ing)\b/i],['dust',/\bdust(?:y|ed|ing)?\b/i],
 ['stone',/\bstone(?:s|y)?\b/i],['metal',/\bmetal(?:lic)?\b/i],['fog',/\bfog(?:gy|ged)?\b/i],
 ['fire',/\bfire(?:s|light)?\b/i],['cold',/\bcold\b/i],['silence',/\bsilence\b/i],
];
function normalize(v: unknown): string { return String(v ?? '').replace(/\s+/g,' ').trim().toLowerCase(); }
function words(v: string): string[] { return normalize(v).split(/[^a-z0-9']+/).filter(w=>w.length>=4); }
function extract(text: string): NarrativeNoveltyItem[] {
 const out:NarrativeNoveltyItem[]=[]; const ws=words(text);
 for(let size=4;size>=3;size--){for(let i=0;i<=ws.length-size;i++){const key=ws.slice(i,i+size).join(' ');if(!/\b(?:the|and|with|from|that|this|your|into|then)\b/.test(key)) out.push({category:'PHRASE',key,text:key,count:1,lastSeenTurn:0});if(out.length>=10)break;}if(out.length>=10)break;}
 const first=(normalize(text).split(/(?<=[.!?])\s+/)[0]||''); const opening=words(first).slice(0,6).join(' '); if(opening) out.push({category:'OPENING',key:opening,text:opening,count:1,lastSeenTurn:0});
 const reaction=normalize(text).match(/\b(?:hesitat\w*|flinch\w*|stare\w*|glare\w*|smile\w*|laugh\w*|trembl\w*|whisper\w*|shout\w*|pause\w*)\b/); if(reaction) out.push({category:'REACTION',key:reaction[0],text:reaction[0],count:1,lastSeenTurn:0});
 for(const [name,p] of IMAGE_PATTERNS) if(p.test(text)) out.push({category:'IMAGE',key:name,text:name,count:1,lastSeenTurn:0});
 for(const [p,name] of TROPE_PATTERNS) if(p.test(text)) out.push({category:'TROPE',key:name,text:name.replace(/_/g,' '),count:1,lastSeenTurn:0});
 return out;
}
export class NarrativeNoveltyEngine {
 public static readonly NAMESPACE='runtimeState.narrativeNovelty';
 public static defaultState(storyId:string):NarrativeNoveltyState{return{version:1,storyId,turnCount:0,items:[]};}
 public static resolve(repository:{getStoryRun(storyId:string):any},storyId:string):NarrativeNoveltyState{const p=repository.getStoryRun(storyId)?.runtimeState?.narrativeNovelty;return p&&typeof p==='object'?{...this.defaultState(storyId),...JSON.parse(JSON.stringify(p))}:this.defaultState(storyId);}
 public static inspect(params:{repository:{getStoryRun(storyId:string):any};storyId:string;narration:string;controls?:Partial<NarrativeNoveltyControls>}){
  const c={...DEFAULT_NARRATIVE_NOVELTY_CONTROLS,...(params.controls||{})};const s=this.resolve(params.repository,params.storyId);if(!c.enabled)return{state:s,repeated:[],discouraged:[],score:100};
  const repeated=extract(params.narration).map(item=>({item,prior:s.items.find(x=>x.category===item.category&&x.key===item.key)})).filter(x=>x.prior&&(x.prior.count>=c.repetitionThreshold||s.turnCount-x.prior.lastSeenTurn<=c.recentTurnWindow)).map(x=>({category:x.item.category,text:x.item.text,count:x.prior!.count}));
  const discouraged=repeated.filter(x=>['TROPE','OPENING','PHRASE'].includes(x.category)); const penalty=repeated.reduce((n,x)=>n+(x.category==='TROPE'?18:x.category==='OPENING'?14:x.category==='PHRASE'?7:3),0);return{state:s,repeated,discouraged,score:Math.max(0,100-penalty)};
 }
 public static recordAcceptedTurn(params:{repository:{getStoryRun(storyId:string):any;saveStoryRun(run:any):void};storyId:string;narration:string;turnNumber?:number;controls?:Partial<NarrativeNoveltyControls>}):NarrativeNoveltyState{
  const c={...DEFAULT_NARRATIVE_NOVELTY_CONTROLS,...(params.controls||{})};const prev=this.resolve(params.repository,params.storyId);if(!c.enabled)return prev;const turn=params.turnNumber??prev.turnCount+1;const map=new Map(prev.items.map(i=>[i.category+':'+i.key,{...i}]));for(const i of extract(params.narration)){const k=i.category+':'+i.key,e=map.get(k);map.set(k,e?{...e,count:e.count+1,lastSeenTurn:turn}:{...i,lastSeenTurn:turn});}const state={version:1 as const,storyId:params.storyId,turnCount:prev.turnCount+1,items:Array.from(map.values()).sort((a,b)=>b.lastSeenTurn-a.lastSeenTurn||b.count-a.count).slice(0,c.maxItems)};const run=params.repository.getStoryRun(params.storyId);if(run){run.runtimeState={...(run.runtimeState||{}),narrativeNovelty:state};params.repository.saveStoryRun(run);}return state;
 }
 public static toPromptContext(state:NarrativeNoveltyState,controls:Partial<NarrativeNoveltyControls>={}):string{const c={...DEFAULT_NARRATIVE_NOVELTY_CONTROLS,...controls};const items=state.items.filter(i=>i.count>=c.repetitionThreshold||state.turnCount-i.lastSeenTurn<=c.recentTurnWindow).sort((a,b)=>b.count-a.count||b.lastSeenTurn-a.lastSeenTurn).slice(0,c.maxPromptItems);return items.length?'N7 NOVELTY LEDGER — vary these repeated/recent patterns; do not mechanically replace them with another cliché:\n'+items.map(i=>'- '+i.category+': '+i.text+' (count='+i.count+')').join('\n'):'N7 novelty ledger: no repeated narrative patterns are currently discouraged.';}
 public static compactPromptContext(state:NarrativeNoveltyState):string{return'N7 novelty: avoid repeating '+(state.items.filter(i=>i.count>=2).slice(0,8).map(i=>i.text).join(', ')||'no tracked patterns')+'. Prefer fresh, scene-specific phrasing.';}
}