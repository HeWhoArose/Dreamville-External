const fs = require('fs');
let content = fs.readFileSync('server/domain/campaignArchive.ts', 'utf8');

content = content.replace(
  `'canonical/living_world.json'?: string;`,
  `'canonical/living_world.json'?: string;\n    'canonical/sensory_config.json'?: string;`
);

content = content.replace(
  `livingWorldState?: unknown;`,
  `livingWorldState?: unknown;\n    sensoryState?: unknown;`
);

content = content.replace(
  `const livingWorldJson = JSON.stringify(params.livingWorldState ?? {}, null, 2);`,
  `const livingWorldJson = JSON.stringify(params.livingWorldState ?? {}, null, 2);\n    const sensoryJson = JSON.stringify(params.sensoryState ?? {}, null, 2);`
);

content = content.replace(
  `'canonical/living_world.json': this.computeSha256(livingWorldJson),`,
  `'canonical/living_world.json': this.computeSha256(livingWorldJson),\n      'canonical/sensory_config.json': this.computeSha256(sensoryJson),`
);

content = content.replace(
  `'canonical/living_world.json': livingWorldJson,`,
  `'canonical/living_world.json': livingWorldJson,\n        'canonical/sensory_config.json': sensoryJson,`
);

content = content.replace(
  `livingWorld?: unknown;`,
  `livingWorld?: unknown;\n  sensoryConfig?: unknown;`
);

content = content.replace(
  `livingWorld: archive.partitions['canonical/living_world.json']
        ? JSON.parse(archive.partitions['canonical/living_world.json'])
        : undefined,`,
  `livingWorld: archive.partitions['canonical/living_world.json']
        ? JSON.parse(archive.partitions['canonical/living_world.json'])
        : undefined,\n      sensoryConfig: archive.partitions['canonical/sensory_config.json']
        ? JSON.parse(archive.partitions['canonical/sensory_config.json'])
        : undefined,`
);

fs.writeFileSync('server/domain/campaignArchive.ts', content);
