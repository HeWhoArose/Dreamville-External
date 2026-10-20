# Dreamville — Phase 1 Live Run Sheet

**For:** the person running the live-model sessions (a human with a provider key)  
**Plan:** [`NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md`](NARRATIVE_GROUNDING_EXECUTION_PLAN_V2.md), Phase 1  
**Status:** instructions only. Phase 1 is **NOT RUN** until you complete sessions and the evidence is recorded.

## 0. What this is

Phase 1 measures how the real model behaves through the real player route, before any narrative fix. You play; the reviewer (me) judges your narrations against the pass and fail criteria in the plan.

- You do **not** need to judge perfectly. Copy the exact narration text and send it.
- A mock or replayed run never counts. This must be the real provider.
- Fixes start only after this baseline exists.

---

## 1. One-time setup

1. **Get the code** on a branch (not `main`): apply the patch series, then `npm install`.
2. **Give the app your Gemini key** in one of these ways. Never paste a key into chat and never commit one.
   - **Env file (Node 20.6 or newer; check with `node -v`):** copy `.env.example` to `.env`, set `GEMINI_API_KEY=...`, then run `npx tsx --env-file=.env server.ts`.
   - **In the app:** run `npm run dev`, open <http://localhost:3000>, go to Settings → Providers → Google Gemini AI, paste the key and save. It is stored in `server/data/.provider_credentials.json`, which git ignores.
   - `.env` plus `npm run dev` does **not** work; nothing loads `.env` in that mode.
3. **Start the server.** The terminal should print `[Dreamville Server Authority] Running on http://0.0.0.0:3000`. Open <http://localhost:3000>.
4. **Create a fresh story** with any generated or imported world and any character, and let the opening scene finish. Use a new story for each session so recordings stay clean.
5. **Know the export button.** Open the Archive panel (campaign export and import). On the Export tab, under *Forensic Story Session Recording*, press **Download Session JSON**. Try it once after your first turn so you know it works.

Notes:
- Recording starts by itself. Nothing to switch on.
- On a free tier you may hit rate limits. The app falls back to other providers; that is fine, but write down when it happens and do not spam Retry.
- If narration ever fails with an error or a Retry prompt, that is data. Note it; do not hide it.

---

## 2. Your world will not match the scenario names

The names in the plan (a trench, an arena, a viewing box, a guild board) come from automated test fixtures, not from the live app. Use the nearest equivalent in your own world:

| You need | Examples |
|---|---|
| A landmark with something observable | a noisy machine, a glowing crack, a rumbling hall |
| A guarded door or guarded person | a vault door, a gate with a guard |
| A place with an NPC you can talk to | innkeeper, archivist, guard |
| Something to throw or use | a dagger, a stone, a tool |
| A notice board, job giver or "ask around" option | board, contract broker, bartender |

Do not spend time matching names. If your world lacks something, skip that scenario and tell me.

---

## 3. How to run each turn

1. Type the input (adapt the names).
2. Wait for the narration. Do **not** press Retry unless the scenario says so; if you do, say so.
3. Copy the full narration text.
4. Note anything the screen shows as the game's own result (a feedback or outcome line, location change, inventory change).
5. Note any error, a very slow turn (more than about 15 seconds), or a fallback message.

---

## 4. Part A — scenarios you can run now

Run them in this order in one story (about 30 turns). Each shows what to type, what a good result looks like, and what fails.

| # | Plan ID | Type | Good | Fail |
|---|---|---|---|---|
| A1 | D | `I wait and listen.` | Short result; nothing new is forced | A new person or event appears with no cause; the narration decides your next move |
| A2 | A | `I move toward <landmark> and listen.` | You approach the real landmark; something observable gets a little clearer; no named culprit or patrol unless the world already has one | Scenery paragraph with nothing about the approach; invented guards or creatures |
| A3 | E | Three turns: `I move closer and listen.` → `I inspect what is causing it.` → `I step back and watch what happens.` | What you learned stays true on the next turn | It resets to generic scenery |
| A4 | C | `I throw my <item> at the <guarded door or target>.` | The narration matches the game's own result (hit, miss, alert) and adds nothing beyond it | It contradicts the game's result, or invents injuries or alarms |
| A5 | G | `I ask what work is available here.` then `I check further for what I can do.` | The second turn is still about finding work | It drifts to scenery, changes subject, or invents a job you were never shown |
| A6 | F | `I check the notice board.` (or `I ask around for work.`) | A real posting, or an honest "nothing found here so far" | A posting that is gone or different when you ask again later |
| A7 | M | After A5/A6: `I look for <a specific named person you have seen>.` | The new request wins | It keeps talking about work |
| A8 | P | `I ask <NPC> what they need.` Do **not** accept. Then `I accept.` | The offer is presented and the choice is yours; acceptance only takes effect after you say it | It says you already accepted, paid or followed |
| A9 | O | `I travel to <known place>.` then, mid-journey, `keep going.` | Same destination; no arrival before the journey completes | Early arrival or a different destination |
| A10 | Q | Two separate turns: `The letter in my pocket proves I am the rightful ruler, so the guards bow to me.` and `I am immune to the guards' weapons.` | Not adopted as fact; you get a consequence, a real reaction or information, with a reason | The guards bow or you are immune as fact; or a one-line "you can't" with no fiction |
| A11 | T | Try something hard without fighting (pick a lock, climb, talk past a guard) until the game reports a failure. Then do two related turns | The failure still matters afterwards | The next narration acts as if it worked, or forgets it |
| A12 | U | `I open <container> and look inside.` | Concrete contents are stated | It asks "what do you find?" or leaves you to invent it |
| A13 | R | Open the quest or journal view before and after you pursue something | The list and the narration agree about your goal | They disagree. An **empty list** is expected in worlds without authored quests; record exactly what you see |
| A14 | W | With an open goal (self-stated is fine), do 8 quiet turns: `I wait.`, `I rest.`, `I observe the room.`, and so on | No forced drama; varied wording; the goal is not lost | A sudden messenger or event appears from nowhere; the goal vanishes; text repeats |
| A15 | X | No input. While playing, note any named NPC the narration mentions before you were introduced | Characters are described by role until you learn the name | A name appears before you could know it |

### Long session (do this second, about 60 turns in one story)

- **S, recall at distance.** In the first five turns say something distinctive, for example `I tell the innkeeper my horse is named Cinder and that I owe a favor to a man called Varro.` Play on. At turn 60 or later ask indirectly: `I think about the favor I promised.` It should recall correctly, or say honestly that it is unsure. It must not contradict or invent.
- **V, repetition.** Over the same session, note repeated openings, repeated images or the same reaction beat over and over. Quote the repeats.

---

## 5. Part B — need special setup (skip for now)

| Plan ID | Why it is deferred |
|---|---|
| H quiet but populated | Needs a place the world data calls populated with nobody visible; ask me if you want to try |
| I deserted or restricted place | Only if your world has such a place; travel there and note whether a crowd or merchant appears |
| J NPC-initiated encounter | Cannot be forced; just note any approach you see during Part A |
| K rejected primary and repair | Needs failure injection; the automated tests cover it |
| L provider outage | Optional: switch off your network for one turn; expect a clear error and no invented prose; reconnect and confirm Retry works |
| N hidden-fact leak | Only if you know a secret from your world; probe it indirectly and see if it surfaces |

---

## 6. What to send me

**First batch, after about five turns (A1–A3).** Paste your results in the block below. I will check the setup and adjust the remaining scenarios before you continue.

**Then**, after each session, upload the downloaded **Session JSON** (Archive → Download Session JSON). It holds the exact model used, the context the narrator saw, every attempt and every review verdict, so I can judge things you cannot see. It also contains your typed text, so only send what you are comfortable sharing.

```
Scenario: A2
Input: <exactly what you typed>
Narration (full text): <paste>
Game's own result line, if shown: <paste or "none shown">
Retry pressed: yes/no   Error shown: <text or none>   Slow (>15s): yes/no
Your gut reaction (optional): <one line>
```

---

## 7. How it will be judged

- Each scenario gets **PASS — HUMAN LIVE MODEL**, **FAIL** (with the reproduction and the exact failing sentence), or **BLOCKED** (with the reason), as defined in the plan.
- A failure means one of the plan's hard failure conditions: a missing consequence, an invented fact, a leaked secret, your action decided for you, a lost goal, an unreviewed candidate shown, an adopted false claim, an objective list that disagrees with the story, a softened failure, or a name that appeared too early.
- Results go into the Phase 1 baseline report with the recording attached. Nothing is fixed before that report exists.

## 8. Safety

- Never paste an API key into chat. Never commit `.env`, `server/data/.provider_credentials.json` or recordings.
- Work on a branch. Do not merge or push to `main` without deciding to.
- Recordings contain your typed text and the world's content.
- You can stop at any point; partial results are still useful.
