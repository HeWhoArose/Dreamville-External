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
  const settings = {
    narrationMode: 'immersive',
    characterVoice: false,
    sfx: true,
    sfxVolume: 0.8,
    ambience: false,
    hapticIntensity: 0.5
  };

  const res1 = await makeRequest('/api/game/sensory/settings', JSON.stringify({
    storyId: 'default_story',
    settings
  }));
  
  const res2 = await makeRequest('/api/game/sensory/state?storyId=default_story', null, 'GET');
  
  console.log("POST settings:", res1.success);
  console.log("GET state settings:", res2.state.settings);
  console.log("Haptic Intensity matches?", res2.state.settings.hapticIntensity === 0.5);
  
  // Test Voice Profile
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
  console.log("GET state voice profile:", res4.state.voiceProfiles['player_actor_default_story']);
}

run().catch(console.error);
