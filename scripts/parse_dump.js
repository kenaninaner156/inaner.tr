import fs from 'fs';

const raw = fs.readFileSync('scripts/firestore_dump_from_transcript.txt', 'utf8');
const lines = raw.split('\n').filter(Boolean);

console.log('Total dumped lines:', lines.length);

lines.forEach((line, idx) => {
  try {
    const parsed = JSON.parse(line);
    const content = parsed.content || '';
    console.log(`\n=== ITEM ${idx + 1} (Step: ${parsed.step_index}, Time: ${parsed.created_at}) ===`);
    
    // Doküman kimliklerini ara
    const docMatches = content.match(/documents\/live_positions\/[a-zA-Z0-9_\-]+/g);
    if (docMatches) {
      console.log('Documents referenced:', [...new Set(docMatches)]);
    }

    // lat, lon değerlerini ara
    const latMatches = content.match(/"lat":\s*\{\s*"[^"]+":\s*([0-9\.]+)\s*\}/g);
    const lonMatches = content.match(/"lon":\s*\{\s*"[^"]+":\s*([0-9\.]+)\s*\}/g);
    const speedMatches = content.match(/"speed":\s*\{\s*"[^"]+":\s*([0-9\.]+)\s*\}/g);
    const timeMatches = content.match(/"timestamp":\s*\{\s*"stringValue":\s*"([^"]+)"\s*\}/g);

    console.log(`Lats found: ${latMatches?.length || 0}, Lons found: ${lonMatches?.length || 0}`);
    
    // Cihaz isimleri
    if (content.includes('Goksel') || content.includes('Göksel')) console.log('Contains: Goksel');
    if (content.includes('Mert')) console.log('Contains: Mert');
    if (content.includes('device_id')) console.log('Contains: device_id');

    // Eğer son koordinatlar varsa göster
    if (latMatches && lonMatches) {
      const sample = [];
      for (let i = 0; i < Math.min(latMatches.length, 5); i++) {
        sample.push({ lat: latMatches[i], lon: lonMatches[i], speed: speedMatches?.[i], time: timeMatches?.[i] });
      }
      console.log('Sample Points:', sample);
    }
  } catch (e) {
    console.error(`Error parsing item ${idx}:`, e.message);
  }
});
