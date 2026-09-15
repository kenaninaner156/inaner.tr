import https from 'https';
import fs from 'fs';

const KEY = process.env.CLOUDFLARE_API_KEY || '';
const EMAIL = process.env.CLOUDFLARE_EMAIL || '';
const ACCOUNT_ID = 'a45c0624edbc5fd01d465883f6cf291a';
const ZONE_ID = 'f2e8ca3d21b70edbbcbaf415dcdaf451';
const SCRIPT_NAME = 'gps-bridge';

const scriptContent = fs.readFileSync('cloudflare-worker.js', 'utf8');

async function deployWorker() {
  const boundary = '----WebKitFormBoundaryWorkerDeploy' + Date.now();
  const metadata = JSON.stringify({
    main_module: 'worker.js',
    compatibility_date: '2024-09-01'
  });

  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"; filename="blob"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n${scriptContent}\r\n`,
    `--${boundary}--\r\n`
  ];

  const bodyBuffer = Buffer.concat(parts.map(p => Buffer.from(p, 'utf8')));

  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}`, {
      method: 'PUT',
      headers: {
        'X-Auth-Email': EMAIL,
        'X-Auth-Key': KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: JSON.parse(data) });
      });
    });
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

async function addRoute() {
  const pattern = '*inaner.tr/api/save-location*';
  const postData = JSON.stringify({
    pattern,
    script: SCRIPT_NAME
  });

  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`, {
      method: 'POST',
      headers: {
        'X-Auth-Email': EMAIL,
        'X-Auth-Key': KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log("1. Deploying Worker...");
  const workerRes = await deployWorker();
  console.log("Worker status:", workerRes.status, workerRes.data.success ? "SUCCESS" : workerRes.data.errors);

  console.log("2. Adding Worker Route on Zone...");
  const routeRes = await addRoute();
  console.log("Route status:", routeRes.status, routeRes.data.success ? "SUCCESS" : routeRes.data.errors);
})();
