import fs from 'node:fs';
import path from 'node:path';
import { MultiModelOrchestrator } from '../server/domain/aiOrchestrator';
import { worldRepository } from '../server/repositories/worldRepository';

interface TurnTelemetryRecord {
  turn: number;
  task: string;
  provider: string;
  model: string;
  attempt: number;
  primaryProvider: boolean;
  fallbackUsed: boolean;
  fallbackReason: string;
  latencyMs: number;
  aiCallsThisTurn: number;
  narrativeText: string;
  validationStatus: string;
  attemptsTrail: any[];
}

const TURNS_SPECS = [
  // Turns 1-10: World Establishment
  { turn: 1, action: "I examine the stationary bronze astrolabe rings and note the silence in the Whispering Orrery." },
  { turn: 2, action: "I look at the fractured third prism ring and ask Maren what happened when the rotation halted." },
  { turn: 3, action: "I check my scribe's satchel to confirm I have my slate, ink stylus, and the archival seal." },
  { turn: 4, action: "I ask Maren about the subterranean resonance pulse that preceded the stoppage." },
  { turn: 5, action: "I examine the limestone floor flagstones for newly opened hairline fractures." },
  { turn: 6, action: "I check the central floor grating at the base of the spindle, listening for conduit air drafts." },
  { turn: 7, action: "I read Maren's open ledger on the plinth to review the logged harmonic frequencies." },
  { turn: 8, action: "I ask Maren if the pressure gauges on the lower hydraulic lines are registering anything." },
  { turn: 9, action: "I suggest inspecting the eastern terrace passage toward the Lantern Vault." },
  { turn: 10, action: "I prepare my tallow lamp and step toward the eastern vaulted archway." },

  // Turns 11-20: Core NPC Relationship
  { turn: 11, action: "I ask Maren if she trusts the foundation dampeners to hold the dome while we investigate." },
  { turn: 12, action: "I observe Maren's hands as she secures the wooden retaining clamps on the prism." },
  { turn: 13, action: "I offer to hold the turnbuckle tension wrench so Maren can adjust the second clamp." },
  { turn: 14, action: "I ask Maren why she stayed at her station instead of fleeing when the tremor struck." },
  { turn: 15, action: "I note Maren's quiet pride in the archive records and acknowledge her dedication." },
  { turn: 16, action: "I ask Maren about her early apprenticeship under Master Corvus and if she noticed any estrangement." },
  { turn: 17, action: "I listen carefully to Maren's hesitation when Corvus's name is mentioned." },
  { turn: 18, action: "I promise Maren that any findings in the lower conduits will be brought directly to her first." },
  { turn: 19, action: "I ask Maren for her personal archive signet to authorize emergency passage if the watch challenges me." },
  { turn: 20, action: "I accept the signet and assure Maren I will return before fourth bell." },

  // Turns 21-30: Semantic Memory
  { turn: 21, action: "I write a memorandum on my slate recording the exact timestamp of the third-ring fracture: three bells past dusk." },
  { turn: 22, action: "I record the specific resonant frequency—inverted 132 hertz—on my slate under Section IV." },
  { turn: 23, action: "I note in my slate that the Lantern Vault drop-bolts rest on shear-pins calibrated to thirty thousand foot-pounds." },
  { turn: 24, action: "I log the secret code-phrase from the Foundation Codex: 'The Starlight Keel beneath the stone shall sing the dawn into the bone.'" },
  { turn: 25, action: "I inspect the bronze plaque on the terrace entrance honoring Master Mason Thorgil's grandfather." },
  { turn: 26, action: "I step out onto the archive terrace and examine the forty-degree shear angle across the flagstones." },
  { turn: 27, action: "I observe the dark silhouette of the Great Aqueduct spanning the gorge under the cold stars." },
  { turn: 28, action: "I check the horn lantern hanging outside the Lantern Vault gatehouse." },
  { turn: 29, action: "I knock three measured raps on the oak wicket door of the Lantern Vault." },
  { turn: 30, action: "I announce myself: 'Scribe Vael from the Orrery. Watchman Orlo, open the wicket.'" },

  // Turns 31-40: Multi-NPC Social Complexity
  { turn: 31, action: "I show Maren's archive signet through the wicket slit to Watchman Orlo." },
  { turn: 32, action: "I inform Orlo that the Orrery has halted and ask why the conduit pressure gauges are dead." },
  { turn: 33, action: "Orlo opens the wicket; I step inside the gatehouse and observe the monitoring board." },
  { turn: 34, action: "I notice Apprentice Dorian shivering by the hearth with a blank stare, and I ask Orlo who he is." },
  { turn: 35, action: "While Orlo explains how he found the boy, I watch Dorian's reaction to the word 'cistern'." },
  { turn: 36, action: "I address Orlo about the security protocol while gesturing subtly to Dorian to remain seated." },
  { turn: 37, action: "Orlo speaks of his duty; Dorian suddenly speaks up, stammering an apology about the valve." },
  { turn: 38, action: "I intervene calmly between Orlo's rising temper and Dorian's panic, demanding the full sequence of events." },
  { turn: 39, action: "Dorian reveals he was given a brass manifold key by an unnamed superior." },
  { turn: 40, action: "I examine the brass manifold key in Dorian's trembling hand and check its guild stamp." },

  // Turns 41-50: Action & Consequence
  { turn: 41, action: "I attempt to turn the rusted emergency isolation valve on the gatehouse wall to test the line." },
  { turn: 42, action: "With the valve seized, I ask Orlo for his heavy iron pry-bar to force the jammed bypass lever." },
  { turn: 43, action: "Together, Orlo and I apply leverage to the iron bar; the lever gives with a violent screech of stripped rust." },
  { turn: 44, action: "I lead the way down the spiral granite stairs into the lower siphon tunnels, holding the bullseye lantern." },
  { turn: 45, action: "At the second landing, I navigate past fallen mortar debris, testing each tread for stability." },
  { turn: 46, action: "I unlock the maintenance grille to the drainage siphon using Dorian's brass key." },
  { turn: 47, action: "I step out onto the perimeter walkway of the Upper Drainage Siphon, surveying the empty basin." },
  { turn: 48, action: "I attempt to climb down the iron ladder into the mud basin, slipping on the damp moss before catching the fifth rung." },
  { turn: 49, action: "I approach the central crater where the fractured bedrock emits a pulsating blue-white glare." },
  { turn: 50, action: "I inspect the crystalline needles of the exposed starlight keel, observing the four-second resonance cycle." },

  // Turns 51-60: Secrets & Revelation
  { turn: 51, action: "I notice fresh chisel marks and pneumatic wedge scars at the severed base of the primary crystal formation." },
  { turn: 52, action: "I question Dorian down the speaking tube about who ordered the pneumatic chisels requisitioned." },
  { turn: 53, action: "Dorian confesses: Master Artificer Corvus personally signed the quarrying order under forged seal." },
  { turn: 54, action: "I discover a dropped tool roll near the fissure bearing Corvus's personal crest: the Black Falcon." },
  { turn: 55, action: "I examine an unexploded alchemical vitriol canister left wedged between two basalt slabs." },
  { turn: 56, action: "I carefully disarm the vitriol canister by unscrewing its copper fuse before it can destabilize." },
  { turn: 57, action: "I collect a dormant three-inch indigo crystal fragment from the shattered rim as physical proof." },
  { turn: 58, action: "I wrap the indigo shard in oiled parchment and secure it inside my leather specimen pouch." },
  { turn: 59, action: "A sudden bedrock shudder rocks the siphon floor; I scramble toward the iron ladder as stones fall." },
  { turn: 60, action: "Orlo hauls me over the walkway rim and slams the heavy iron gate shut against the churning dust." },

  // Turns 61-70: Relationship Evolution
  { turn: 61, action: "Catching our breath at the gate, I thank Orlo for holding the line against orders." },
  { turn: 62, action: "Orlo admits he doubted the scribes for years, but respects the courage shown down in the dark." },
  { turn: 63, action: "I tell Orlo we need to alert the North Gate before Corvus crosses the mountain switchbacks." },
  { turn: 64, action: "We return to the gatehouse; I reassure Dorian that his confession will protect him if he stands with us." },
  { turn: 65, action: "Dorian hands over Corvus's route notes showing the planned meeting point in the Veridian Marches." },
  { turn: 66, action: "I draft an emergency Archival Detention Order and seal it with Maren's signet and my scribe's seal." },
  { turn: 67, action: "Orlo and I ascend to the semaphore tower on the eastern curtain wall to signal the North Gatehouse." },
  { turn: 68, action: "I observe Keeper Jerrick flashing the code sequence across the two-mile chasm to the northern cliffs." },
  { turn: 69, action: "I read the answering light from the North Gate: Corvus has been detained at the secondary portcullis." },
  { turn: 70, action: "Orlo clasps my shoulder in grim satisfaction; we prepare the custody escort team." },

  // Turns 71-80: Location Return
  { turn: 71, action: "We return to the Whispering Orrery; I observe the wide crack in the terrace flagstones has not shifted." },
  { turn: 72, action: "I enter the rotunda and find Maren still holding the turnbuckles on the third prism ring." },
  { turn: 73, action: "I place the wrapped indigo crystal shard on the drafting table before Maren." },
  { turn: 74, action: "Maren inspects the shard, recognizing the primordial starlight keel described in the Foundation Codex." },
  { turn: 75, action: "I verify that the alignment marks on the observation dais remain displaced by three millimeters." },
  { turn: 76, action: "We place the indigo shard into the acoustic resonance cradle in the eastern alcove." },
  { turn: 77, action: "I adjust the first tuning tine on the cradle to 132 hertz, testing sympathetic dampening." },
  { turn: 78, action: "The indigo shard settles into a soft, steady azure glow as the fundamental harmonic neutralizes it." },
  { turn: 79, action: "Maren confirms that an acoustic pulse down the central conduit will pacify the primary vein below." },
  { turn: 80, action: "I prepare to climb the maintenance ladder to the catwalks to trip the secondary resonator bells." },

  // Turns 81-90: Multiple Narrative Threads
  { turn: 81, action: "I climb past the canted astrolabe ring, monitoring the turnbuckle tension on the fractured prism." },
  { turn: 82, action: "From the catwalk, I inspect Bell III while keeping an eye on the vertical conduit shaft below." },
  { turn: 83, action: "I trip Bell III; the sonorous gong rolls through the dome, setting the silver tines singing." },
  { turn: 84, action: "I traverse the planks to Bell VII and release its hammer, blending the solar overtone." },
  { turn: 85, action: "Before striking Bell I, I remember Dorian's warning about the trapped geothermal pressure in the lower flue." },
  { turn: 86, action: "I shout down to Maren: has the exhaust flue been cleared by Orlo's team in the lower gallery?" },
  { turn: 87, action: "A red signal flare bursts up from the conduit well—Orlo has manually locked the exhaust valve open." },
  { turn: 88, action: "I strike Bell I with the full drop-hammer, driving the acoustic pulse down the sounding rod." },
  { turn: 89, action: "The thunderous concussion roars down the shaft; steam howls through the flue as the crystal goes dormant." },
  { turn: 90, action: "I descend to the floor as the rotunda settles into quiet; Maren confirms the subterranean pulse has ceased." },

  // Turns 91-100: High-Density Social/Narrative Pressure
  { turn: 91, action: "At the seventh bell, Archon Valerius arrives with the High Council in the Sun Spire amphitheater." },
  { turn: 92, action: "The Grand Artificer accuses the archives of unauthorized interference with the city waterworks." },
  { turn: 93, action: "I step forward to the witness rail, laying out my recorded slate measurements and the indigo shard." },
  { turn: 94, action: "Maren presents the Foundation Codex, proving the cooling pool was designed as a sacred damper." },
  { turn: 95, action: "Orlo testifies to Corvus's sabotage, producing the forged requisition orders and the broken lock." },
  { turn: 96, action: "Corvus is brought before the Council in chains, defiantly shouting his radical energetic theories." },
  { turn: 97, action: "I challenge Corvus: his ambition nearly triggered a catastrophic caldera breach that would have buried the city." },
  { turn: 98, action: "Archon Valerius renders judgment: Corvus is stripped of rank and banished to the deep quarries." },
  { turn: 99, action: "The Archon transfers subterranean security permanently to the joint command of Archives and Watch." },
  { turn: 100, action: "The Archon commissions Maren and me to oversee the casting of a new bell-metal spindle." },

  // Turns 101-110: Consequence Chain
  { turn: 101, action: "At the Imperial Foundry, I review the blueprint for the new spindle with Master Caster Thorgil." },
  { turn: 102, action: "I insist on adding four circumferential shear-relief grooves to prevent future torque catastrophic failures." },
  { turn: 103, action: "Thorgil approves the sacrificial slip-clutch modification and pours the nine-to-one bell-metal alloy." },
  { turn: 104, action: "In the Sun Crystal Vault, Maren and I select a flawless replacement quartz prism from the First Radiance era." },
  { turn: 105, action: "Back at the Orrery, we carefully unbolt the fractured third prism ring and lower it to safety." },
  { turn: 106, action: "I scrape the warped bronze seating bezel with a bearing tool until the feeler gauge shows true." },
  { turn: 107, action: "We hoist the new quartz prism into place and torque the retaining bolts to exact specifications." },
  { turn: 108, action: "The team of oxen delivers the four-ton bronze spindle to the Orrery terrace." },
  { turn: 109, action: "Using the shear-leg crane, we extract the twisted old spindle from the foundation well." },
  { turn: 110, action: "We lower the new golden spindle into the white babbitt bearing sleeve, seating the triple splines." },

  // Turns 111-120: Long-Session Stress & Information-Seeking Actions
  { turn: 111, action: "I read the report on the hydraulic bearing pressure submitted by the guild mechanics." },
  { turn: 112, action: "I re-read Maren's account of the First Radiance equinox alignment to calibrate the gear backlash." },
  { turn: 113, action: "I read the inscription on the gate of the Lantern Vault before certifying its reinforced locks." },
  { turn: 114, action: "I read the note Dorian left on the maintenance board regarding the daily sluice schedule." },
  { turn: 115, action: "I re-read the document outlining the standing orders of the newly formed Resonant Watch." },
  { turn: 116, action: "I examine the master clutch lever on the dais and prepare to engage the hydraulic drive turbine." },
  { turn: 117, action: "I pull the master clutch lever; the friction plates engage and the four-ton spindle begins its rotation." },
  { turn: 118, action: "The concentric astrolabe rings sweep into motion above, casting dynamic shadows across the dome." },
  { turn: 119, action: "I time the rotation with Maren's water-clock, confirming 120 seconds per celestial degree." },
  { turn: 120, action: "The sunlight strikes the new prism, casting a brilliant, razor-sharp spectrum across the ceiling charts." },

  // Turns 121-125: Final Stress & Closure
  { turn: 121, action: "I sign the Master Archive Ledger alongside Maren, certifying the complete restoration of the Orrery." },
  { turn: 122, action: "I visit the Subterranean Bastion to inspect Warden Orlo's newly installed acoustic warning horns." },
  { turn: 123, action: "I test the 132-hertz monitoring tine in the Bastion, confirming zero anomalous vibration from the keel." },
  { turn: 124, action: "I return to the archive terrace at sunset, watching the golden light fade over the peaceful city of Elysium." },
  { turn: 125, action: "I stand on the observation dais under the turning bronze rings as the night stars align with the prime meridian." },
];

async function run() {
  console.log('=== STARTING 125-TURN LIVE GEMINI INTEGRATION & PROVENANCE TEST ===');
  const orchestrator = new MultiModelOrchestrator(worldRepository);
  const records: TurnTelemetryRecord[] = [];
  const outputPath = path.resolve(process.cwd(), 'tests', 'artifacts', '125_turn_live_telemetry.json');

  const startTotalTime = Date.now();

  for (let i = 0; i < TURNS_SPECS.length; i++) {
    const spec = TURNS_SPECS[i];
    const turnStart = Date.now();
    console.log(`[Turn ${spec.turn}/125] Action: "${spec.action.slice(0, 60)}..."`);

    try {
      const result = await orchestrator.executeTurn({
        storyId: 'default_story',
        playerAction: spec.action,
        task: 'narrative.generate',
        timeoutMs: 4000, // Balanced timeout so slow attempts fall over cleanly to Gemini Flash-Lite/Floor
      });

      const telem = result.telemetry;
      const turnElapsed = Date.now() - turnStart;
      const trail = result.attemptsTrail || [];
      const failedAttempts = trail.filter((a: any) => a.status === 'FAILED');
      const isPrimary = telem.selectedProviderId === 'google_gemini' && telem.selectedModelId === 'gemini-3.5-flash';
      const fallbackReason = isPrimary
        ? 'NONE'
        : (failedAttempts.length > 0
            ? failedAttempts.map((f: any) => `${f.providerId}::${f.modelId} (${f.error || 'error'})`).join(' -> ')
            : 'Preflight / breaker check routed to fallback');

      const record: TurnTelemetryRecord = {
        turn: spec.turn,
        task: telem.taskId || 'narrative.generate',
        provider: telem.selectedProviderId || 'UNKNOWN',
        model: telem.selectedModelId || 'UNKNOWN',
        attempt: telem.attempts || 1,
        primaryProvider: isPrimary,
        fallbackUsed: !isPrimary,
        fallbackReason,
        latencyMs: telem.latencyMs || turnElapsed,
        aiCallsThisTurn: telem.aiCallBudget?.totalLogicalCalls || 1,
        narrativeText: result.turnPackage?.narrative?.join(' ') || result.fallbackText || '',
        validationStatus: result.telemetry.validated ? 'VALIDATED' : 'UNVALIDATED',
        attemptsTrail: trail,
      };

      records.push(record);
      console.log(` -> Result: ${record.provider}::${record.model} (Attempt ${record.attempt}, ${record.latencyMs}ms)`);

      // Write intermediate progress every 10 turns
      if (spec.turn % 10 === 0 || spec.turn === 125) {
        fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), 'utf-8');
      }
    } catch (err: any) {
      console.error(`Error on Turn ${spec.turn}:`, err.message);
      records.push({
        turn: spec.turn,
        task: 'narrative.generate',
        provider: 'UNKNOWN',
        model: 'UNKNOWN',
        attempt: 1,
        primaryProvider: false,
        fallbackUsed: true,
        fallbackReason: `Unhandled exception: ${err.message}`,
        latencyMs: Date.now() - turnStart,
        aiCallsThisTurn: 0,
        narrativeText: '',
        validationStatus: 'ERROR',
        attemptsTrail: [],
      });
    }
  }

  const totalDuration = Date.now() - startTotalTime;
  console.log(`=== TEST COMPLETED in ${(totalDuration / 1000).toFixed(1)}s ===`);
  console.log(`Total records: ${records.length}. Saved to ${outputPath}`);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
