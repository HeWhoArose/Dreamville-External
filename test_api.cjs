const http = require('http');

const data = JSON.stringify({
  storyId: 'default_story',
  actorId: 'test_actor',
  text: 'Hello world'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/game/sensory/speech',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => console.log('Speech:', resData));
});
req.on('error', e => console.error(e));
req.write(data);
req.end();

const data2 = JSON.stringify({
  storyId: 'default_story',
  audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='
});

const options2 = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/game/sensory/transcribe',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data2)
  }
};

const req2 = http.request(options2, res => {
  let resData = '';
  res.on('data', chunk => resData += chunk);
  res.on('end', () => console.log('Transcribe:', resData));
});
req2.on('error', e => console.error(e));
req2.write(data2);
req2.end();
