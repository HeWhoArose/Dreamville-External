const http = require('http');
function get(path) {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:3000' + path, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    }).on('error', reject);
  });
}
async function run() {
  console.log(await get('/api/game/archive/export'));
}
run();
