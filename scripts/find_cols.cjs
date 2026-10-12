const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) results = results.concat(walk(full));
        else if (file.endsWith('.js') || file.endsWith('.jsx')) results.push(full);
    });
    return results;
}

const files = walk('./src');
const collections = new Set();
const regex = /collection\(\s*db\s*,\s*['"]([^'"]+)['"]/g;

files.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = regex.exec(content)) !== null) {
        collections.add(match[1]);
    }
});

console.log(JSON.stringify(Array.from(collections).sort(), null, 2));
