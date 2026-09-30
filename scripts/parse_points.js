import fs from 'fs';

const raw = fs.readFileSync('scripts/mert_raw_output.txt', 'utf8');
const obj = JSON.parse(raw);
const text = obj.content || JSON.stringify(obj);

// Regex for coordinates
const regex = /"lat":\s*\{\s*"doubleValue":\s*([0-9.]+)\s*\},[^}]*"lon":\s*\{\s*"doubleValue":\s*([0-9.]+)\s*\},[^}]*"speed":\s*\{\s*"doubleValue":\s*([0-9.]+)\s*\},[^}]*"timestamp":\s*\{\s*"stringValue":\s*"([^"]+)"\s*\}/g;

const points = [];
let match;
while ((match = regex.exec(text)) !== null) {
  points.push({
    lat: parseFloat(match[1]),
    lon: parseFloat(match[2]),
    speed: parseFloat(match[3]),
    timestamp: match[4]
  });
}

console.log('Parsed points count:', points.length);
if (points.length > 0) {
  console.log('First point:', points[0]);
  console.log('Last point:', points[points.length - 1]);
  fs.writeFileSync('scripts/parsed_points.json', JSON.stringify(points, null, 2));
}
