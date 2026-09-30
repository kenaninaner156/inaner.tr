import fs from 'fs';
import readline from 'readline';

async function run() {
  const filePath = 'C:/Users/kenan/.gemini/antigravity/brain/a4e77523-6527-42e3-a5d8-af1b55739380/.system_generated/logs/transcript_full.jsonl';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let out = [];
  for await (const line of rl) {
    if (line.includes('live_positions') && line.includes('fields')) {
      out.push(line);
    }
  }
  console.log(`Found ${out.length} lines with live_positions and fields.`);
  fs.writeFileSync('scripts/firestore_dump_from_transcript.txt', out.join('\n'));
  console.log('Saved to scripts/firestore_dump_from_transcript.txt');
}
run();
