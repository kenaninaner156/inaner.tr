import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3456;
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
    // CORS basliklari
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const backupDir = path.resolve(__dirname, '..');
    let filePath;

    if (reqPath.startsWith('/media/') || reqPath.startsWith('/snapshots/')) {
        filePath = path.normalize(path.join(backupDir, reqPath));
    } else {
        filePath = path.normalize(path.join(__dirname, reqPath));
    }

    // Path traversal korumasi (Backup dizini disina cikilamaz)
    if (!filePath.startsWith(backupDir)) {
        res.writeHead(403);
        res.end('Erisim engellendi.');
        return;
    }

    // Dosya yoksa SPA routing icin index.html don
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const indexHtml = path.join(__dirname, 'index.html');
        if (fs.existsSync(indexHtml)) {
            filePath = indexHtml;
        } else {
            res.writeHead(404);
            res.end('Dosya bulunamadi.');
            return;
        }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        // Port zaten dinleniyor, sessizce cik
        process.exit(0);
    } else {
        console.error('[Inaner Server Error]', err);
        process.exit(1);
    }
});

server.listen(PORT, '127.0.0.1', () => {
    const url = `http://localhost:${PORT}`;
    console.log(`==================================================`);
    console.log(`  INANER.TR - CEVRIMDISI DONANIM WEB SUNUCUSU     `);
    console.log(`==================================================`);
    console.log(`Yerel Adres : ${url}`);
    console.log(`Konum       : ${__dirname}`);
    console.log(`Durum       : Calisiyor`);
    console.log(`==================================================`);
});
