const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/game/sensory/state',
  method: 'GET',
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Sensory State:', data));
});
req.on('error', e => console.error(e));
req.end();
