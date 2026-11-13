// Regenerates src/chain/pixelsArtifact.ts from contracts/Pixels.json.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = JSON.parse(fs.readFileSync(path.join(root, 'contracts/Pixels.json'), 'utf8'));
const ts =
  `// GENERATED from contracts/Pixels.json (Truffle artifact, solc ${a.compiler.version}). Do not edit by hand.\n` +
  `// Regenerate with: npm run gen:abi\n` +
  `export const pixelsAbi = ${JSON.stringify(a.abi, null, 2)} as const;\n\n` +
  `export const pixelsBytecode = "${a.bytecode}" as const;\n\n` +
  `export const pixelsDeployedBytecode = "${a.deployedBytecode}" as const;\n`;
fs.writeFileSync(path.join(root, 'src/chain/pixelsArtifact.ts'), ts);
console.log('wrote src/chain/pixelsArtifact.ts');
