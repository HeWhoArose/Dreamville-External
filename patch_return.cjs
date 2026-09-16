const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');

content = content.replace(
  `          return {
            success: true,
            turnPackage: validation.turnPackage,
            telemetry,
            adjudicationResult: adjudication,
            checkpoint,
          };`,
  `          return {
            success: true,
            turnPackage: validation.turnPackage,
            telemetry,
            adjudicationResult: adjudication,
            checkpoint,
            audioResultBase64: providerRes.audioBase64,
          };`
);

content = content.replace(
  `          return {
            success: true,
            turnPackage: validation.turnPackage,
            telemetry,
            adjudicationResult: adjudication,
            checkpoint,
          };`,
  `          return {
            success: true,
            turnPackage: validation.turnPackage,
            telemetry,
            adjudicationResult: adjudication,
            checkpoint,
            audioResultBase64: res.audioBase64,
          };`
);

fs.writeFileSync('server/domain/aiOrchestrator.ts', content);
