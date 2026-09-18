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
  const res2 = await makeRequest('/api/game/sensory/state?storyId=default_story', null, 'GET');
  console.log("GET state settings:", res2.settings);
  console.log("Haptic Intensity matches?", res2.settings.hapticIntensity === 0.5);
  console.log("Soundscape:", res2.soundscape);
  console.log("Voice Profiles:", res2.voiceProfiles);
}

run().catch(console.error);
