import assert from 'node:assert';
const BASE_URL = 'http://127.0.0.1:3000/api/game';
async function run() {
    const res = await fetch(`${BASE_URL}/archive/export`);
    const data = await res.json();
    const invStr = data.partitions['canonical/inventory.json'];
    const inv = JSON.parse(invStr);
    console.log(Object.keys(inv));
}
run();
