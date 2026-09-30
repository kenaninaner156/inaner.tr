import fs from 'fs';

const raw = fs.readFileSync('scripts/firestore_dump_from_transcript.txt', 'utf8');
const lines = raw.split('\n').filter(Boolean);

[7, 8, 15, 16, 17].forEach(idx => {
  if (lines[idx]) {
    const p = JSON.parse(lines[idx]);
    console.log(`\n=================== STEP ${p.step_index} ===================`);
    console.log(p.content.slice(0, 3000));
  }
});
