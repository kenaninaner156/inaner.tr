import fs from 'fs';
import path from 'path';

const versionData = {
  version: Date.now().toString(),
  buildTime: new Date().toISOString()
};

fs.writeFileSync(
  path.resolve(process.cwd(), 'public', 'version.json'),
  JSON.stringify(versionData, null, 2)
);

console.log('[Version] Generated version.json:', versionData);
