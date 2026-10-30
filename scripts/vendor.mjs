import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('renderer/vendor', { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) copyFileSync('node_modules/three/build/' + f, 'renderer/vendor/' + f);
console.log('three.js copied');
