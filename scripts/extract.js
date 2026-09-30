import fs from 'fs';
import readline from 'readline';

async function run() {
  const filePath = 'C:/Users/kenan/.gemini/antigravity/brain/a4e77523-6527-42e3-a5d8-af1b55739380/.system_generated/logs/transcript.jsonl';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let found = 0;
  for await (const line of rl) {
    if (line.includes('39.94835') && line.includes('32.78643')) {
      found++;
      fs.writeFileSync('scripts/mert_raw_output.txt', line);
      console.log('Found and wrote line to scripts/mert_raw_output.txt');
      break;
    }
  }
  if (!found) console.log('Not found in transcript.jsonl');
}
run();
