const http = require('http');
async function doFetch(path, method, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3000, path: path, method: method, headers: { 'Content-Type': 'application/json' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch(e) {}
        resolve({ status: res.statusCode, data: parsed })
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
async function run() {
    let stateRes = await doFetch('/api/game/state', 'GET');
    console.log("Characters is array?", Array.isArray(stateRes.data.characters));
    console.log("Keys if object:", Object.keys(stateRes.data.characters || {}));
}
run();
