import fs from 'fs';

const raw = fs.readFileSync('scripts/mert_raw_output.txt', 'utf8');
const obj = JSON.parse(raw);
const text = obj.content;

// Split by "mapValue":
const parts = text.split('"mapValue":');
const points = [];

for (let i = 1; i < parts.length; i++) {
  const chunk = parts[i];
  const latM = chunk.match(/"lat":\s*\{\s*"(?:doubleValue|integerValue)":\s*"?([0-9.]+)"?\s*\}/);
  const lonM = chunk.match(/"lon":\s*\{\s*"(?:doubleValue|integerValue)":\s*"?([0-9.]+)"?\s*\}/);
  const spdM = chunk.match(/"speed":\s*\{\s*"(?:doubleValue|integerValue)":\s*"?([0-9.]+)"?\s*\}/);
  const altM = chunk.match(/"altitude":\s*\{\s*"(?:doubleValue|integerValue)":\s*"?([0-9.]+)"?\s*\}/);
  const tsM = chunk.match(/"timestamp":\s*\{\s*"stringValue":\s*"([^"]+)"\s*\}/);

  if (latM && lonM) {
    points.push({
      lat: parseFloat(latM[1]),
      lon: parseFloat(lonM[1]),
      speed: spdM ? parseFloat(spdM[1]) : 0,
      altitude: altM ? parseFloat(altM[1]) : 0,
      timestamp: tsM ? tsM[1] : new Date().toISOString()
    });
  }
}

console.log('Total extracted real points:', points.length);
if (points.length > 0) {
  console.log('Sample point:', points[0]);
  fs.writeFileSync('scripts/mert_real_points.json', JSON.stringify(points, null, 2));
}
