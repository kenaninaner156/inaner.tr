import fs from 'fs';
import readline from 'readline';

async function run() {
  const filePath = 'C:/Users/kenan/.gemini/antigravity/brain/a4e77523-6527-42e3-a5d8-af1b55739380/.system_generated/logs/transcript_full.jsonl';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.includes('Goksel') || line.includes('Göksel')) {
      console.log('--- FOUND GOKSEL MATCH ---');
      console.log(line.slice(0, 1000));
    }
  }
}
run();
