/**
 * İnaner.tr - Donanım Sürücüsüne Otomatik Canlı Arayüz Dağıtıcı (Deploy to Drive)
 * Sitede yapılan tüm güncellemeleri otomatik olarak D:\ (İnaner.tr) USB diskine aktarır.
 * Kök dizini asla kirletmez; tüm web arayüzünü D:\Backup\.webapp gizli sistem klasöründe günceller.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveDriveTarget() {
    const candidateDrives = ['D:\\', 'Z:\\'];
    for (const drive of candidateDrives) {
        if (fs.existsSync(drive)) {
            return drive;
        }
    }
    return null;
}

function deploy() {
    const driveRoot = resolveDriveTarget();
    if (!driveRoot) {
        console.log('[DeployToDrive] Ağ sürücüsü (D: veya Z:) bağlı değil, atlanıyor.');
        return;
    }

    const distDir = path.join(PROJECT_ROOT, 'dist');
    const distIndexHtml = path.join(distDir, 'index.html');

    if (!fs.existsSync(distIndexHtml)) {
        console.log('[DeployToDrive] dist/index.html bulunamadı. Lütfen önce "npm run build" çalıştırın.');
        return;
    }

    // Hedef: Backup klasörü içerisindeki gizli .webapp dizini
    const backupDir = path.join(driveRoot, 'Backup');
    const webAppDir = path.join(backupDir, '.webapp');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    if (!fs.existsSync(webAppDir)) {
        fs.mkdirSync(webAppDir, { recursive: true });
    }

    console.log(`[DeployToDrive] Güncel web arayüzü ${webAppDir} dizinine senkronize ediliyor...`);

    const copyDirRecursive = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDirRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    };

    // 1. dist klasörünü .webapp içine kopyala
    copyDirRecursive(distDir, webAppDir);

    // 2. index.html içine offline-data.js referansı ekle (eğer yoksa)
    const targetHtml = path.join(webAppDir, 'index.html');
    let htmlContent = fs.readFileSync(distIndexHtml, 'utf-8');
    if (!htmlContent.includes('offline-data.js')) {
        htmlContent = htmlContent.replace('<head>', '<head>\n    <script src="./offline-data.js"></script>');
    }
    fs.writeFileSync(targetHtml, htmlContent);

    // 3. server.mjs ve start_silent.vbs dosyalarını .webapp içine kopyala
    const serverMjsSrc = path.join(__dirname, 'server.mjs');
    const startSilentSrc = path.join(__dirname, 'start_silent.vbs');
    if (fs.existsSync(serverMjsSrc)) {
        fs.copyFileSync(serverMjsSrc, path.join(webAppDir, 'server.mjs'));
    }
    if (fs.existsSync(startSilentSrc)) {
        fs.copyFileSync(startSilentSrc, path.join(webAppDir, 'start_silent.vbs'));
    }

    // 4. İkonun varlığını garanti et
    const icoDest = path.join(webAppDir, 'app_logo_v2.ico');
    if (!fs.existsSync(icoDest)) {
        try {
            execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'generate-logo-v2.ps1')}"`, { stdio: 'ignore' });
        } catch (_) {}
    }

    // 5. Kök dizindeki kısayolu oluştur / güncelle
    try {
        execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(__dirname, 'create-shortcut.ps1')}"`, { stdio: 'ignore' });
    } catch (_) {}

    // 6. .webapp dizinini gizli ve sistem klasörü yap
    try {
        execSync(`attrib +h +s "${webAppDir}"`, { stdio: 'ignore' });
    } catch (_) {}

    console.log(`[DeployToDrive] ✓ Sitenin son sürümü ${webAppDir} klasörüne başarıyla kuruldu.`);
}

deploy();
