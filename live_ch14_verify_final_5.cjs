const http = require('http');

function makeRequest(path, data, method = 'POST') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: data ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      } : {}
    };

    const req = http.request(options, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
           resolve(JSON.parse(resData));
        } catch(e) {
           resolve(resData);
        }
      });
    });
    req.on('error', e => reject(e));
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const overridePackage = {
    narrative: ["You hear things."],
    dialogue: [],
    events: [],
    stateChanges: [],
    memoryCandidates: [],
    audioCues: [
      "echo in loc_whispering_orrery", 
      "shout from a hidden_monster",
      "rumble at loc_unknown_abyss",
      "player"
    ]
  };
  await makeRequest('/api/game/orchestrator/overrides', JSON.stringify({
    modelId: 'mock-reasoning-pro',
    override: JSON.stringify(overridePackage)
  }));

  const turnRes = await makeRequest('/api/game/orchestrator/turn', JSON.stringify({
    storyId: 'default_story',
    playerAction: 'listen carefully',
    task: 'director.narrative',
    forceModelId: 'mock-reasoning-pro'
  }));

  if (turnRes.sensoryEvents) {
    console.log("Sensory Events returned to client:");
    turnRes.sensoryEvents.forEach((ev, i) => {
      console.log(`Event ${i + 1}: ${ev.visualDirection}`);
      console.log(`  Suppressed: ${ev.suppressed}`);
      if (ev.audioDirection) {
        console.log(`  Radius: ${ev.audioDirection.radius}, Volume: ${ev.audioDirection.volume}`);
      } else {
        console.log(`  AudioDirection: missing (EXPECTED FOR UNAUTHORIZED)`);
      }
    });
  } else {
    console.log("No sensoryEvents returned!", turnRes);
  }
}

run().catch(console.error);
