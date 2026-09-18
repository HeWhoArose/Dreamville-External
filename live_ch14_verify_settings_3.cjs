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
  const profile = {
    actorId: 'player_actor_default_story',
    providerId: 'provider_mock_stt',
    voiceId: 'mock-1',
    pitch: 1.0,
    speed: 1.0,
    language: 'en',
    style: 'neutral',
    enabled: true
  };
  const res3 = await makeRequest('/api/game/sensory/voice-profile', JSON.stringify({
    storyId: 'default_story',
    profile
  }));
  console.log("POST voice profile:", res3.success);
  
  const res4 = await makeRequest('/api/game/sensory/state?storyId=default_story', null, 'GET');
  console.log("GET state voice profiles:", res4.voiceProfiles);
}

run().catch(console.error);
