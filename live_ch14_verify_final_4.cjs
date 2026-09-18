const http = require('http');

function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method
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
    req.end();
  });
}

async function run() {
  const models = await makeRequest('/api/game/orchestrator/models');
  console.log("Models:", models.models.map(m => m.modelId));
}

run().catch(console.error);
