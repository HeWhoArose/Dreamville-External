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
  const turnRes = await makeRequest('/api/game/orchestrator/turn', JSON.stringify({
    storyId: 'default_story',
    playerAction: 'listen carefully',
    task: 'director.narrative',
    forceModelId: 'mock-reasoning-pro' // this will trigger the override
  }));

  console.log(JSON.stringify(turnRes, null, 2));
}

run().catch(console.error);
