import express from 'express';
import { gameRouter } from './server/api/gameRoutes.js';
import { worldRepository } from './server/repositories/worldRepository.js';
import { captureCanonicalStateSnapshot, compareCanonicalSnapshots } from './server/domain/canonicalSnapshot.js';

const app = express();
app.use(express.json());
app.use('/api/game', gameRouter);

const server = app.listen(0, '127.0.0.1', async () => {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    const url = `http://127.0.0.1:${addr.port}/api/game/orchestrator/turn`;
    
    const before = captureCanonicalStateSnapshot('default_story', worldRepository);
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: 'default_story',
          playerAction: 'Consult the brass astronomical charts and align the third lens',
          task: 'narrative.generate',
          hardTokenBudget: 400,
        }),
      });
      
      const after = captureCanonicalStateSnapshot('default_story', worldRepository);
      const comparison = compareCanonicalSnapshots(before, after);
      console.log('Identical:', comparison.identical);
      console.log('Differences:', comparison.differences);
    } catch (e) {
      console.error('Request failed:', e);
    }
  }
  server.close();
});
