import fs from 'fs';
import path from 'path';

const snapDir = 'D:/Backup/snapshots/2026-09-29T03-30-06';
const srcOfflineData = path.join(snapDir, 'offline-data.js');
const srcAllCollections = path.join(snapDir, 'all_collections.json');

console.log('Reading from snapshot:', snapDir);
console.log('Source offline-data.js size:', (fs.statSync(srcOfflineData).size / 1024 / 1024).toFixed(2), 'MB');

// Target 1: D:/Backup/.webapp/offline-data.js
fs.copyFileSync(srcOfflineData, 'D:/Backup/.webapp/offline-data.js');
console.log('✓ Restored D:/Backup/.webapp/offline-data.js');

// Target 2: D:/Backup/offline-data.js
fs.copyFileSync(srcOfflineData, 'D:/Backup/offline-data.js');
console.log('✓ Restored D:/Backup/offline-data.js');

// Target 3: D:/Backup/latest/offline-data.js
fs.copyFileSync(srcOfflineData, 'D:/Backup/latest/offline-data.js');
console.log('✓ Restored D:/Backup/latest/offline-data.js');

// Target 4: D:/Backup/latest/all_collections.json
fs.copyFileSync(srcAllCollections, 'D:/Backup/latest/all_collections.json');
console.log('✓ Restored D:/Backup/latest/all_collections.json');

console.log('All database files restored successfully!');
