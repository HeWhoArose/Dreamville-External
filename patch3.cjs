const fs = require('fs');
let content = fs.readFileSync('server/domain/aiOrchestrator.ts', 'utf8');
content = content.replace(
  `for (const [providerId, provider] of this.providers) {`,
  `for (const [providerId, provider] of Array.from(this.providers.entries())) {`
);
content = content.replace(
  `for (const [modelId, record] of this.modelRegistry) {`,
  `for (const [modelId, record] of Array.from(this.modelRegistry.entries())) {`
);
content = content.replace(
  `for (const [ruleId, override] of this.manualOverrides) {`,
  `for (const [ruleId, override] of Array.from(this.manualOverrides.entries())) {`
);
content = content.replace(
  `for (const [task, role] of this.specializedTaskRoles) {`,
  `for (const [task, role] of Array.from(this.specializedTaskRoles.entries())) {`
);
content = content.replace(
  `for (const override of this.manualOverrides.values()) {`,
  `for (const override of Array.from(this.manualOverrides.values())) {`
);
content = content.replace(
  `for (const [mId, mRecord] of this.modelRegistry) {`,
  `for (const [mId, mRecord] of Array.from(this.modelRegistry.entries())) {`
);
content = content.replace(
  `for (const [mId, mRecord] of Array.from(this.modelRegistry.entries())) {`,
  `for (const [mId, mRecord] of Array.from(this.modelRegistry.entries())) {`
); // Note: we'll just fix all instances
fs.writeFileSync('server/domain/aiOrchestrator.ts', content);

let content2 = fs.readFileSync('server/domain/capabilityEngine.ts', 'utf8');
content2 = content2.replace(
  `for (const [capId, state] of this.powerStates) {`,
  `for (const [capId, state] of Array.from(this.powerStates.entries())) {`
);
fs.writeFileSync('server/domain/capabilityEngine.ts', content2);

let content3 = fs.readFileSync('server/domain/combatEngine.ts', 'utf8');
content3 = content3.replace(
  `for (const p of this.participants.values()) {`,
  `for (const p of Array.from(this.participants.values())) {`
);
fs.writeFileSync('server/domain/combatEngine.ts', content3);

let content4 = fs.readFileSync('server/domain/geographyGraph.ts', 'utf8');
content4 = content4.replace(
  `for (const [id, node] of this.nodes) {`,
  `for (const [id, node] of Array.from(this.nodes.entries())) {`
);
content4 = content4.replace(
  `for (const id of this.nodes.keys()) {`,
  `for (const id of Array.from(this.nodes.keys())) {`
);
content4 = content4.replace(
  `for (const node of this.nodes.values()) {`,
  `for (const node of Array.from(this.nodes.values())) {`
);
content4 = content4.replace(
  `for (const childId of children) {`,
  `for (const childId of Array.from(children)) {`
); // Assuming children is a Set
fs.writeFileSync('server/domain/geographyGraph.ts', content4);

let content5 = fs.readFileSync('server/domain/inventoryItem.ts', 'utf8');
content5 = content5.replace(
  `for (const item of this.items.values()) {`,
  `for (const item of Array.from(this.items.values())) {`
);
fs.writeFileSync('server/domain/inventoryItem.ts', content5);

let content6 = fs.readFileSync('server/domain/livingWorldSimulation.ts', 'utf8');
content6 = content6.replace(
  `for (const p of this.physiologies.values()) {`,
  `for (const p of Array.from(this.physiologies.values())) {`
);
content6 = content6.replace(
  `for (const e of this.eventQueue.values()) {`,
  `for (const e of Array.from(this.eventQueue.values())) {`
);
content6 = content6.replace(
  `for (const s of this.scheduleProfiles.values()) {`,
  `for (const s of Array.from(this.scheduleProfiles.values())) {`
);
fs.writeFileSync('server/domain/livingWorldSimulation.ts', content6);

let content7 = fs.readFileSync('server/domain/memoryOpportunityEngine.ts', 'utf8');
content7 = content7.replace(
  `for (const m of this.memories.values()) {`,
  `for (const m of Array.from(this.memories.values())) {`
);
fs.writeFileSync('server/domain/memoryOpportunityEngine.ts', content7);

let content8 = fs.readFileSync('server/domain/sensoryEngine.ts', 'utf8');
content8 = content8.replace(
  `for (const [key, profile] of this.voiceProfiles.entries()) {`,
  `for (const [key, profile] of Array.from(this.voiceProfiles.entries())) {`
);
fs.writeFileSync('server/domain/sensoryEngine.ts', content8);

