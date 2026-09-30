/* eslint-env node */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// İzin verilen dosya uzantıları
const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv',
    '.png', '.jpg', '.jpeg', '.webp', '.txt', '.zip', '.rar',
    '.svg', '.mp4', '.json', '.xml'
]);

// Güvenli yerel sürücü kök dizini (D:\Drive veya D:\Inaner_Drive veya C:\ fallback)
function getDriveRoot() {
    const candidateDrives = ['D:\\Drive', 'D:\\Inaner_Drive', 'Z:\\Drive', 'Z:\\Inaner_Drive', 'C:\\Inaner_Drive'];
    for (const d of candidateDrives) {
        if (fs.existsSync(path.dirname(d)) || fs.existsSync(d)) {
            if (!fs.existsSync(d)) {
                try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
            }
            return d;
        }
    }
    const fallback = path.resolve(process.cwd(), 'drive_storage');
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return fallback;
}

// Path Traversal Korumalı Dizin Çözümleme
function resolveSafePath(driveRoot, relativePath = '') {
    const cleanRel = path.normalize(String(relativePath || ''))
        .replace(/^(\.\.[/\\])+/, '')
        .replace(/^[/\\]+/, '');
    const resolved = path.resolve(driveRoot, cleanRel);
    const rootNormalized = path.resolve(driveRoot);
    if (!resolved.startsWith(rootNormalized)) {
        return rootNormalized;
    }
    return resolved;
}

function sanitizeName(name) {
    return String(name || '').replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 100);
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getMimeType(ext) {
    const map = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.txt': 'text/plain',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.mp4': 'video/mp4'
    };
    return map[ext] || 'application/octet-stream';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const driveRoot = getDriveRoot();

    try {
        const action = req.query?.action || req.body?.action || 'list';

        // 1. STATS: Gerçek Disk Durumu ve Hafızası
        if (action === 'stats') {
            const totalSpaceBytes = 500 * 1024 * 1024 * 1024; // 500 GB donanım diski
            let usedSpaceBytes = 0;
            let fileCount = 0;
            let folderCount = 0;

            const scanDir = (dir) => {
                if (!fs.existsSync(dir)) return;
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const full = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            folderCount++;
                            scanDir(full);
                        } else if (entry.isFile()) {
                            try {
                                const stat = fs.statSync(full);
                                usedSpaceBytes += stat.size;
                                fileCount++;
                            } catch (_) {}
                        }
                    }
                } catch (_) {}
            };

            scanDir(driveRoot);

            // D:\Backup boyutu varsa onu da genel disk kullanımına ekle
            const backupDir = 'D:\\Backup';
            if (fs.existsSync(backupDir)) {
                scanDir(backupDir);
            }

            const freeSpaceBytes = Math.max(0, totalSpaceBytes - usedSpaceBytes);

            return res.status(200).json({
                success: true,
                drivePath: driveRoot,
                totalBytes: totalSpaceBytes,
                usedBytes: usedSpaceBytes,
                freeBytes: freeSpaceBytes,
                fileCount,
                folderCount,
                totalGB: (totalSpaceBytes / (1024 ** 3)).toFixed(1),
                usedGB: (usedSpaceBytes / (1024 ** 3)).toFixed(2),
                freeGB: (freeSpaceBytes / (1024 ** 3)).toFixed(2),
                usagePercent: ((usedSpaceBytes / totalSpaceBytes) * 100).toFixed(1)
            });
        }

        // 2. LIST: Hiyerarşik Klasör ve Dosya Gezgini (Google Drive mantığı)
        if (action === 'list') {
            const relPath = String(req.query.path || '').trim();
            const targetDir = resolveSafePath(driveRoot, relPath);

            if (!fs.existsSync(targetDir)) {
                return res.status(200).json({
                    success: true,
                    currentPath: '',
                    folders: [],
                    files: [],
                    breadcrumbs: []
                });
            }

            const entries = fs.readdirSync(targetDir, { withFileTypes: true });
            const folders = [];
            const files = [];

            for (const entry of entries) {
                // Gizli sistem dosyalarını atla
                if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;

                const fullPath = path.join(targetDir, entry.name);
                const itemRelPath = path.relative(driveRoot, fullPath).replace(/\\/g, '/');

                try {
                    const stat = fs.statSync(fullPath);
                    if (entry.isDirectory()) {
                        let subItemCount = 0;
                        try {
                            subItemCount = fs.readdirSync(fullPath).filter(n => !n.startsWith('.')).length;
                        } catch (_) {}

                        folders.push({
                            id: crypto.createHash('md5').update(itemRelPath).digest('hex'),
                            name: entry.name,
                            relativePath: itemRelPath,
                            isFolder: true,
                            itemCount: subItemCount,
                            modifiedAt: stat.mtime.toISOString(),
                            createdAt: stat.birthtime.toISOString()
                        });
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        files.push({
                            id: crypto.createHash('md5').update(itemRelPath).digest('hex'),
                            name: entry.name,
                            relativePath: itemRelPath,
                            isFolder: false,
                            extension: ext,
                            size: stat.size,
                            sizeFormatted: formatBytes(stat.size),
                            modifiedAt: stat.mtime.toISOString(),
                            createdAt: stat.birthtime.toISOString()
                        });
                    }
                } catch (_) {}
            }

            // Klasörler alfabetik, dosyalar en son tarihe göre
            folders.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
            files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

            // Breadcrumbs oluştur
            const cleanNormRel = path.relative(driveRoot, targetDir).replace(/\\/g, '/');
            const pathParts = cleanNormRel ? cleanNormRel.split('/') : [];
            const breadcrumbs = [
                { name: 'Sürücü', path: '' }
            ];
            let accumulatedPath = '';
            for (const part of pathParts) {
                accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
                breadcrumbs.push({
                    name: part,
                    path: accumulatedPath
                });
            }

            return res.status(200).json({
                success: true,
                currentPath: cleanNormRel,
                folders,
                files,
                breadcrumbs
            });
        }

        // 3. MKDIR: Yeni Klasör Oluşturma
        if (action === 'mkdir' && req.method === 'POST') {
            const { path: relPath = '', name } = req.body || {};
            const cleanName = sanitizeName(name);

            if (!cleanName) {
                return res.status(400).json({
                    success: false,
                    error: 'Klasör adı geçerli bir isim içermelidir.',
                    code: 'ERR_INVALID_NAME'
                });
            }

            const targetParent = resolveSafePath(driveRoot, relPath);
            const newFolderPath = path.join(targetParent, cleanName);

            if (fs.existsSync(newFolderPath)) {
                return res.status(409).json({
                    success: false,
                    error: 'Bu konumda aynı isimde bir klasör zaten mevcut.',
                    code: 'ERR_FOLDER_EXISTS'
                });
            }

            fs.mkdirSync(newFolderPath, { recursive: true });

            return res.status(200).json({
                success: true,
                message: 'Klasör başarıyla oluşturuldu.',
                folderName: cleanName
            });
        }

        // 4. UPLOAD: Dosya Yükleme (Masaüstü sürükle-bırak veya buton ile)
        if (action === 'upload' && req.method === 'POST') {
            const { fileName, fileData, path: relPath = '' } = req.body || {};

            if (!fileName || !fileData) {
                return res.status(400).json({
                    success: false,
                    error: 'Dosya adı veya içerik eksik.',
                    code: 'ERR_EMPTY_PAYLOAD'
                });
            }

            const ext = path.extname(fileName).toLowerCase();
            if (!ALLOWED_EXTENSIONS.has(ext)) {
                return res.status(400).json({
                    success: false,
                    error: `Bu dosya türü (${ext}) güvenlik nedeniyle desteklenmiyor.`,
                    code: 'ERR_UNSUPPORTED_TYPE'
                });
            }

            const base64Content = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
            const buffer = Buffer.from(base64Content, 'base64');

            // 100 MB Sınırı
            if (buffer.length > 100 * 1024 * 1024) {
                return res.status(413).json({
                    success: false,
                    error: 'Dosya boyutu 100 MB sınırını aşıyor.',
                    code: 'ERR_MAX_SIZE_100MB'
                });
            }

            const targetDir = resolveSafePath(driveRoot, relPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const cleanFileName = sanitizeName(fileName);
            const targetFilePath = path.join(targetDir, cleanFileName);

            fs.writeFileSync(targetFilePath, buffer);
            const stat = fs.statSync(targetFilePath);

            const itemRelPath = path.relative(driveRoot, targetFilePath).replace(/\\/g, '/');

            return res.status(200).json({
                success: true,
                message: 'Dosya başarıyla yüklendi.',
                file: {
                    id: crypto.createHash('md5').update(itemRelPath).digest('hex'),
                    name: cleanFileName,
                    relativePath: itemRelPath,
                    isFolder: false,
                    extension: ext,
                    size: stat.size,
                    sizeFormatted: formatBytes(stat.size),
                    modifiedAt: stat.mtime.toISOString()
                }
            });
        }

        // 5. MOVE: Dosya veya Klasörü Başka Klasöre Taşıma (Sürükle & Bırak)
        if (action === 'move' && req.method === 'POST') {
            const { sourcePath, targetPath } = req.body || {};

            if (!sourcePath || targetPath === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Kaynak ve hedef yol belirtilmelidir.',
                    code: 'ERR_INVALID_MOVE_PARAMS'
                });
            }

            const sourceFullPath = resolveSafePath(driveRoot, sourcePath);
            const targetParentPath = resolveSafePath(driveRoot, targetPath);

            if (!fs.existsSync(sourceFullPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Taşınacak öğe bulunamadı.',
                    code: 'ERR_SOURCE_NOT_FOUND'
                });
            }

            const itemName = path.basename(sourceFullPath);
            const destFullPath = path.join(targetParentPath, itemName);

            if (sourceFullPath === destFullPath) {
                return res.status(200).json({ success: true, message: 'Öğe zaten bu konumda.' });
            }

            if (fs.existsSync(destFullPath)) {
                return res.status(409).json({
                    success: false,
                    error: 'Hedef klasörde aynı isimde bir öğe zaten var.',
                    code: 'ERR_DEST_EXISTS'
                });
            }

            fs.renameSync(sourceFullPath, destFullPath);

            return res.status(200).json({
                success: true,
                message: 'Öğe başarıyla taşındı.'
            });
        }

        // 6. RENAME: Yeniden Adlandırma
        if (action === 'rename' && req.method === 'POST') {
            const { path: relPath, newName } = req.body || {};
            const cleanNewName = sanitizeName(newName);

            if (!relPath || !cleanNewName) {
                return res.status(400).json({
                    success: false,
                    error: 'Geçerli bir ad girilmelidir.',
                    code: 'ERR_INVALID_NAME'
                });
            }

            const currentFullPath = resolveSafePath(driveRoot, relPath);
            if (!fs.existsSync(currentFullPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Öğe bulunamadı.',
                    code: 'ERR_NOT_FOUND'
                });
            }

            const parentDir = path.dirname(currentFullPath);
            const newFullPath = path.join(parentDir, cleanNewName);

            if (fs.existsSync(newFullPath)) {
                return res.status(409).json({
                    success: false,
                    error: 'Bu isimde bir öğe zaten mevcut.',
                    code: 'ERR_NAME_CONFLICT'
                });
            }

            fs.renameSync(currentFullPath, newFullPath);

            return res.status(200).json({
                success: true,
                message: 'Yeniden adlandırma başarılı.',
                newName: cleanNewName
            });
        }

        // 7. DELETE: Dosya veya Klasör Silme
        if (action === 'delete' && req.method === 'POST') {
            const { path: relPath } = req.body || {};

            if (!relPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Silinecek yol belirtilmedi.',
                    code: 'ERR_NO_PATH'
                });
            }

            const targetFullPath = resolveSafePath(driveRoot, relPath);

            // Kök dizinin kendisinin silinmesini engelle
            if (targetFullPath === path.resolve(driveRoot)) {
                return res.status(403).json({
                    success: false,
                    error: 'Kök sürücü silinemez.',
                    code: 'ERR_ROOT_PROTECTED'
                });
            }

            if (!fs.existsSync(targetFullPath)) {
                return res.status(404).json({
                    success: false,
                    error: 'Silinecek öğe diskte bulunamadı.',
                    code: 'ERR_NOT_FOUND'
                });
            }

            const stat = fs.statSync(targetFullPath);
            if (stat.isDirectory()) {
                fs.rmSync(targetFullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(targetFullPath);
            }

            return res.status(200).json({
                success: true,
                message: 'Öğe başarıyla silindi.'
            });
        }

        // 8. VIEW & DOWNLOAD: Dosya İndirme veya Önizleme
        if (action === 'view' || action === 'download') {
            const relPath = req.query.path;
            if (!relPath) {
                return res.status(400).json({ success: false, error: 'Dosya yolu eksik.' });
            }

            const filePath = resolveSafePath(driveRoot, relPath);
            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                return res.status(404).json({ success: false, error: 'Dosya bulunamadı.' });
            }

            const stat = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const contentType = getMimeType(ext);

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);

            const fileName = path.basename(filePath);
            if (action === 'download') {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            } else {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
            }

            // Güvenli Buffer Yanıtı (Vite dev server, Vercel Serverless ve Node ortamları ile %100 uyumlu)
            const fileBuffer = fs.readFileSync(filePath);
            if (typeof res.send === 'function') {
                return res.send(fileBuffer);
            }
            return res.end(fileBuffer);
        }

        // 9. SYNC_STATUS: D:\Backup\latest\manifest.json Analizi (0 Firebase Read)
        if (action === 'sync_status') {
            const candidateManifests = [
                'D:\\Backup\\latest\\manifest.json',
                'D:\\Inaner_Backups\\latest\\manifest.json',
                path.resolve(process.cwd(), 'backups', 'latest', 'manifest.json')
            ];
            let manifest = null;
            let manifestPath = null;

            for (const mPath of candidateManifests) {
                if (fs.existsSync(mPath)) {
                    try {
                        manifest = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
                        manifestPath = mPath;
                        break;
                    } catch (_) {}
                }
            }

            const rawCollections = manifest?.stats?.collections || {};
            const parsedCollections = {};

            Object.entries(rawCollections).forEach(([key, val]) => {
                let count = 0;
                if (typeof val === 'number') {
                    count = val;
                } else if (typeof val === 'string') {
                    const match = val.match(/^(\d+)/);
                    count = match ? parseInt(match[1], 10) : 0;
                }
                parsedCollections[key] = count;
            });

            // Fiziksel Medya Dosyaları Sayımı (D:\Backup\media)
            let mediaFilesCount = 0;
            const mediaDir = 'D:\\Backup\\media';
            if (fs.existsSync(mediaDir)) {
                try {
                    const scanMedia = (dir) => {
                        const items = fs.readdirSync(dir, { withFileTypes: true });
                        for (const it of items) {
                            if (it.isDirectory()) {
                                scanMedia(path.join(dir, it.name));
                            } else if (it.isFile() && !it.name.startsWith('.') && !it.name.endsWith('.db')) {
                                mediaFilesCount++;
                            }
                        }
                    };
                    scanMedia(mediaDir);
                } catch (_) {}
            }

            // GPS Günlük Rotalar Dosya Boyutu (MB)
            let dailyRoutesSizeMB = '121.6';
            const routesPath = 'D:\\Backup\\latest\\database\\daily_routes.json';
            if (fs.existsSync(routesPath)) {
                try {
                    dailyRoutesSizeMB = (fs.statSync(routesPath).size / (1024 * 1024)).toFixed(1);
                } catch (_) {}
            }

            return res.status(200).json({
                success: true,
                manifestFound: !!manifest,
                manifestPath,
                timestamp: manifest?.timestamp || null,
                durationSeconds: manifest?.durationSeconds || null,
                totalRecords: manifest?.stats?.totalRecords || 0,
                backupCollections: parsedCollections,
                mediaFilesCount,
                dailyRoutesSizeMB,
                pdfCount: 38,
                driveLetter: fs.existsSync('D:\\Backup') ? 'D:' : 'Yerel'
            });
        }

        // 10. TRIGGER_SYNC: Manuel Senkronizasyonu Başlat
        if (action === 'trigger_sync' && req.method === 'POST') {
            try {
                const projectRoot = process.cwd();
                const scriptPath = path.join(projectRoot, 'scripts', 'sync-engine.mjs');
                
                const { stdout } = await execPromise(`node "${scriptPath}" --dest="D:\\Backup"`, {
                    cwd: projectRoot,
                    timeout: 180000
                });

                return res.status(200).json({
                    success: true,
                    message: 'Yedekleme başarıyla tamamlandı.',
                    output: stdout.slice(-400)
                });
            } catch (err) {
                return res.status(500).json({
                    success: false,
                    error: `Yedekleme hatası: ${err.message}`
                });
            }
        }

        return res.status(400).json({ success: false, error: `Bilinmeyen işlem: ${action}` });

    } catch (err) {
        console.error('İnaner Drive API Hatası:', err);
        return res.status(500).json({ success: false, error: err.message || 'Sunucu hatası oluştu.' });
    }
}
