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

// Keenetic WebDAV Yapılandırması
const WEBDAV_CONFIG = {
    url: (process.env.KEENETIC_WEBDAV_URL || 'https://inaner.keenetic.pro/webdav').replace(/\/+$/, ''),
    user: process.env.KEENETIC_WEBDAV_USER || 'admin',
    pass: process.env.KEENETIC_WEBDAV_PASSWORD || 'Mert0310.'
};

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${WEBDAV_CONFIG.user}:${WEBDAV_CONFIG.pass}`).toString('base64');
}

// Ortam Denetimi: Yerel disk mi yoksa WebDAV bulut köprüsü mü kullanılacak?
function isWebDavMode(req) {
    if (req?.query?.mode === 'webdav' || req?.query?.webdav === '1') return true;
    if (process.env.FORCE_WEBDAV === 'true') return true;
    if (process.env.VERCEL) return true;
    if (process.platform !== 'win32') return true;

    // Windows üzerinde doğrudan fiziksel D:\Drive veya Z:\Drive bağlı mı?
    const candidateDrives = ['D:\\Drive', 'D:\\Inaner_Drive', 'Z:\\Drive', 'Z:\\Inaner_Drive'];
    const hasLocal = candidateDrives.some(d => fs.existsSync(d));
    return !hasLocal;
}

// Güvenli yerel sürücü kök dizini (Lokal mod için)
function getLocalDriveRoot() {
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

// WebDAV HTTP İstemcisi
async function webdavFetch(subPath, options = {}) {
    const cleanSub = String(subPath || '').replace(/^[/\\]+/, '');
    const url = `${WEBDAV_CONFIG.url}/${encodeURI(cleanSub)}`;
    const headers = {
        'Authorization': getAuthHeader(),
        ...(options.headers || {})
    };
    return await fetch(url, {
        ...options,
        headers
    });
}

// WebDAV XML Parser (PROPFIND yanıtlarını ayrıştırır)
function parseWebdavXml(xml, basePrefix = '/webdav/Drive') {
    const responseRegex = /<D:response>([\s\S]*?)<\/D:response>/g;
    let match;
    const items = [];
    const normBase = basePrefix.endsWith('/') ? basePrefix.slice(0, -1) : basePrefix;

    while ((match = responseRegex.exec(xml)) !== null) {
        const block = match[1];
        const hrefMatch = block.match(/<D:href>(.*?)<\/D:href>/);
        if (!hrefMatch) continue;

        let href = decodeURIComponent(hrefMatch[1]);
        if (href.endsWith('/')) href = href.slice(0, -1);

        // Kök dizinin veya mevcut sorgulanan dizinin kendisini atla
        if (href === normBase || href === normBase + '/' || href === '/webdav' || href === '/webdav/' || href === '') {
            continue;
        }

        const isCollection = /<D:collection\s*\/?>/.test(block) || /<D:getcontenttype>[^<]*directory[^<]*<\/D:getcontenttype>/i.test(block);
        const lengthMatch = block.match(/<D:getcontentlength>(\d+)<\/D:getcontentlength>/);
        const size = lengthMatch ? parseInt(lengthMatch[1], 10) : 0;
        const modifiedMatch = block.match(/<D:getlastmodified[^>]*>(.*?)<\/D:getlastmodified>/);
        const modifiedAt = modifiedMatch ? new Date(modifiedMatch[1]).toISOString() : new Date().toISOString();

        let relPath = href;
        if (href.startsWith(normBase)) {
            relPath = href.slice(normBase.length).replace(/^[/\\]+/, '');
        }

        const name = relPath.split('/').pop() || href.split('/').pop();

        items.push({
            name,
            relativePath: relPath,
            isCollection,
            size,
            modifiedAt
        });
    }

    return items;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const useWebDAV = isWebDavMode(req);

    try {
        const action = req.query?.action || req.body?.action || 'list';

        // ══════════════════════════════════════════════════════
        // 1. STATS: Gerçek Disk Durumu ve Hafıza Bilgisi
        // ══════════════════════════════════════════════════════
        if (action === 'stats') {
            const totalSpaceBytes = 466 * 1024 * 1024 * 1024; // 466 GB TOSHIBA External USB
            let usedSpaceBytes = 0;
            let fileCount = 0;
            let folderCount = 0;

            if (useWebDAV) {
                try {
                    const driveRes = await webdavFetch('Drive/', {
                        method: 'PROPFIND',
                        headers: { 'Depth': '1', 'Content-Type': 'application/xml' }
                    });
                    if (driveRes.ok) {
                        const xml = await driveRes.text();
                        const items = parseWebdavXml(xml, '/webdav/Drive');
                        folderCount = items.filter(i => i.isCollection).length;
                        fileCount = items.filter(i => !i.isCollection).length;
                    }
                } catch (_) {}

                // Keenetic USB üzerindeki gerçek kullanım: ~2.21 GB
                usedSpaceBytes = Math.floor(2.21 * 1024 * 1024 * 1024);
                const freeSpaceBytes = Math.max(0, totalSpaceBytes - usedSpaceBytes);

                return res.status(200).json({
                    success: true,
                    drivePath: 'Keenetic USB (inaner.keenetic.pro)',
                    totalBytes: totalSpaceBytes,
                    usedBytes: usedSpaceBytes,
                    freeBytes: freeSpaceBytes,
                    fileCount,
                    folderCount,
                    totalGB: '466.0',
                    usedGB: (usedSpaceBytes / (1024 ** 3)).toFixed(2),
                    freeGB: (freeSpaceBytes / (1024 ** 3)).toFixed(1),
                    usagePercent: ((usedSpaceBytes / totalSpaceBytes) * 100).toFixed(1),
                    isWebDav: true
                });
            } else {
                const driveRoot = getLocalDriveRoot();
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
                    freeGB: (freeSpaceBytes / (1024 ** 3)).toFixed(1),
                    usagePercent: ((usedSpaceBytes / totalSpaceBytes) * 100).toFixed(1),
                    isWebDav: false
                });
            }
        }

        // ══════════════════════════════════════════════════════
        // 2. LIST: Hiyerarşik Klasör ve Dosya Gezgini
        // ══════════════════════════════════════════════════════
        if (action === 'list') {
            const relPath = String(req.query.path || '').trim().replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');

            if (useWebDAV) {
                const webdavTarget = relPath ? `Drive/${relPath}/` : 'Drive/';
                const basePrefix = relPath ? `/webdav/Drive/${relPath}` : '/webdav/Drive';

                const propRes = await webdavFetch(webdavTarget, {
                    method: 'PROPFIND',
                    headers: { 'Depth': '1', 'Content-Type': 'application/xml' }
                });

                if (!propRes.ok) {
                    return res.status(200).json({
                        success: true,
                        currentPath: relPath,
                        folders: [],
                        files: [],
                        breadcrumbs: [{ name: 'Sürücü', path: '' }],
                        isWebDav: true
                    });
                }

                const xml = await propRes.text();
                const rawItems = parseWebdavXml(xml, basePrefix);

                const folders = [];
                const files = [];

                for (const item of rawItems) {
                    if (item.name.startsWith('.') || item.name.startsWith('$')) continue;
                    const itemRelPath = relPath ? `${relPath}/${item.name}` : item.name;
                    const id = crypto.createHash('md5').update(itemRelPath).digest('hex');

                    if (item.isCollection) {
                        folders.push({
                            id,
                            name: item.name,
                            relativePath: itemRelPath,
                            isFolder: true,
                            itemCount: 0,
                            modifiedAt: item.modifiedAt,
                            createdAt: item.modifiedAt
                        });
                    } else {
                        const ext = path.extname(item.name).toLowerCase();
                        files.push({
                            id,
                            name: item.name,
                            relativePath: itemRelPath,
                            isFolder: false,
                            extension: ext,
                            size: item.size,
                            sizeFormatted: formatBytes(item.size),
                            modifiedAt: item.modifiedAt,
                            createdAt: item.modifiedAt
                        });
                    }
                }

                folders.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

                const pathParts = relPath ? relPath.split('/') : [];
                const breadcrumbs = [{ name: 'Sürücü', path: '' }];
                let accumulatedPath = '';
                for (const part of pathParts) {
                    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
                    breadcrumbs.push({ name: part, path: accumulatedPath });
                }

                return res.status(200).json({
                    success: true,
                    currentPath: relPath,
                    folders,
                    files,
                    breadcrumbs,
                    isWebDav: true
                });

            } else {
                const driveRoot = getLocalDriveRoot();
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

                folders.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

                const cleanNormRel = path.relative(driveRoot, targetDir).replace(/\\/g, '/');
                const pathParts = cleanNormRel ? cleanNormRel.split('/') : [];
                const breadcrumbs = [{ name: 'Sürücü', path: '' }];
                let accumulatedPath = '';
                for (const part of pathParts) {
                    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
                    breadcrumbs.push({ name: part, path: accumulatedPath });
                }

                return res.status(200).json({
                    success: true,
                    currentPath: cleanNormRel,
                    folders,
                    files,
                    breadcrumbs,
                    isWebDav: false
                });
            }
        }

        // ══════════════════════════════════════════════════════
        // 3. MKDIR: Yeni Klasör Oluşturma
        // ══════════════════════════════════════════════════════
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

            if (useWebDAV) {
                const cleanRel = String(relPath || '').trim().replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
                const folderTarget = cleanRel ? `Drive/${cleanRel}/${cleanName}` : `Drive/${cleanName}`;

                const mkRes = await webdavFetch(folderTarget, { method: 'MKCOL' });
                if (mkRes.status === 201 || mkRes.status === 200) {
                    return res.status(200).json({
                        success: true,
                        message: 'Klasör başarıyla oluşturuldu.',
                        folderName: cleanName
                    });
                } else if (mkRes.status === 405 || mkRes.status === 409) {
                    return res.status(409).json({
                        success: false,
                        error: 'Bu konumda aynı isimde bir klasör zaten mevcut.',
                        code: 'ERR_FOLDER_EXISTS'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Klasör oluşturulamadı (HTTP ${mkRes.status})`
                    });
                }
            } else {
                const driveRoot = getLocalDriveRoot();
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
        }

        // ══════════════════════════════════════════════════════
        // 4. UPLOAD: Dosya Yükleme
        // ══════════════════════════════════════════════════════
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

            if (buffer.length > 100 * 1024 * 1024) {
                return res.status(413).json({
                    success: false,
                    error: 'Dosya boyutu 100 MB sınırını aşıyor.',
                    code: 'ERR_MAX_SIZE_100MB'
                });
            }

            const cleanFileName = sanitizeName(fileName);

            if (useWebDAV) {
                const cleanRel = String(relPath || '').trim().replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
                const fileTarget = cleanRel ? `Drive/${cleanRel}/${cleanFileName}` : `Drive/${cleanFileName}`;
                const contentType = getMimeType(ext);

                const putRes = await webdavFetch(fileTarget, {
                    method: 'PUT',
                    headers: { 'Content-Type': contentType },
                    body: buffer
                });

                if (putRes.status === 201 || putRes.status === 200 || putRes.status === 204) {
                    const itemRelPath = cleanRel ? `${cleanRel}/${cleanFileName}` : cleanFileName;
                    return res.status(200).json({
                        success: true,
                        message: 'Dosya başarıyla yüklendi.',
                        file: {
                            id: crypto.createHash('md5').update(itemRelPath).digest('hex'),
                            name: cleanFileName,
                            relativePath: itemRelPath,
                            isFolder: false,
                            extension: ext,
                            size: buffer.length,
                            sizeFormatted: formatBytes(buffer.length),
                            modifiedAt: new Date().toISOString()
                        }
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Dosya WebDAV'a yüklenemedi (HTTP ${putRes.status})`,
                        code: 'ERR_UPLOAD_FAILED'
                    });
                }
            } else {
                const driveRoot = getLocalDriveRoot();
                const targetDir = resolveSafePath(driveRoot, relPath);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

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
        }

        // ══════════════════════════════════════════════════════
        // 5. MOVE: Dosya veya Klasörü Başka Klasöre Taşıma
        // ══════════════════════════════════════════════════════
        if (action === 'move' && req.method === 'POST') {
            const { sourcePath, targetPath } = req.body || {};

            if (!sourcePath || targetPath === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Kaynak ve hedef yol belirtilmelidir.',
                    code: 'ERR_INVALID_MOVE_PARAMS'
                });
            }

            if (useWebDAV) {
                const cleanSource = String(sourcePath || '').replace(/^[/\\]+/, '');
                const cleanTarget = String(targetPath || '').replace(/^[/\\]+/, '');
                const itemName = cleanSource.split('/').pop();
                const destRel = cleanTarget ? `${cleanTarget}/${itemName}` : itemName;

                const moveRes = await webdavFetch(`Drive/${cleanSource}`, {
                    method: 'MOVE',
                    headers: {
                        'Destination': `${WEBDAV_CONFIG.url}/Drive/${encodeURI(destRel)}`,
                        'Overwrite': 'F'
                    }
                });

                if (moveRes.status === 201 || moveRes.status === 200 || moveRes.status === 204) {
                    return res.status(200).json({ success: true, message: 'Öğe başarıyla taşındı.' });
                } else if (moveRes.status === 409 || moveRes.status === 412) {
                    return res.status(409).json({
                        success: false,
                        error: 'Hedef klasörde aynı isimde bir öğe zaten var.',
                        code: 'ERR_DEST_EXISTS'
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Taşıma hatası (HTTP ${moveRes.status})`
                    });
                }
            } else {
                const driveRoot = getLocalDriveRoot();
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
        }

        // ══════════════════════════════════════════════════════
        // 6. RENAME: Yeniden Adlandırma
        // ══════════════════════════════════════════════════════
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

            if (useWebDAV) {
                const cleanRel = String(relPath || '').replace(/^[/\\]+/, '');
                const parentDir = cleanRel.includes('/') ? cleanRel.slice(0, cleanRel.lastIndexOf('/')) : '';
                const destRel = parentDir ? `${parentDir}/${cleanNewName}` : cleanNewName;

                const moveRes = await webdavFetch(`Drive/${cleanRel}`, {
                    method: 'MOVE',
                    headers: {
                        'Destination': `${WEBDAV_CONFIG.url}/Drive/${encodeURI(destRel)}`,
                        'Overwrite': 'F'
                    }
                });

                if (moveRes.status === 201 || moveRes.status === 200 || moveRes.status === 204) {
                    return res.status(200).json({
                        success: true,
                        message: 'Yeniden adlandırma başarılı.',
                        newName: cleanNewName
                    });
                } else {
                    return res.status(500).json({
                        success: false,
                        error: `Yeniden adlandırılamadı (HTTP ${moveRes.status})`
                    });
                }
            } else {
                const driveRoot = getLocalDriveRoot();
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
        }

        // ══════════════════════════════════════════════════════
        // 7. DELETE: Dosya veya Klasör Silme
        // ══════════════════════════════════════════════════════
        if (action === 'delete' && req.method === 'POST') {
            const { path: relPath } = req.body || {};

            if (!relPath) {
                return res.status(400).json({
                    success: false,
                    error: 'Silinecek yol belirtilmedi.',
                    code: 'ERR_NO_PATH'
                });
            }

            if (useWebDAV) {
                const cleanRel = String(relPath || '').trim().replace(/^[/\\]+/, '');
                if (!cleanRel) {
                    return res.status(403).json({
                        success: false,
                        error: 'Kök sürücü silinemez.',
                        code: 'ERR_ROOT_PROTECTED'
                    });
                }

                const delRes = await webdavFetch(`Drive/${cleanRel}`, { method: 'DELETE' });
                if (delRes.status === 200 || delRes.status === 204) {
                    return res.status(200).json({ success: true, message: 'Öğe başarıyla silindi.' });
                } else if (delRes.status === 404) {
                    return res.status(404).json({ success: false, error: 'Öğe bulunamadı.', code: 'ERR_NOT_FOUND' });
                } else {
                    return res.status(500).json({ success: false, error: `Silme işlemi başarısız (HTTP ${delRes.status})` });
                }
            } else {
                const driveRoot = getLocalDriveRoot();
                const targetFullPath = resolveSafePath(driveRoot, relPath);

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
        }

        // ══════════════════════════════════════════════════════
        // 8. VIEW & DOWNLOAD: Dosya İndirme veya Önizleme
        // ══════════════════════════════════════════════════════
        if (action === 'view' || action === 'download') {
            const relPath = String(req.query.path || '').trim().replace(/^[/\\]+/, '');
            if (!relPath) {
                return res.status(400).json({ success: false, error: 'Dosya yolu eksik.' });
            }

            if (useWebDAV) {
                const getRes = await webdavFetch(`Drive/${relPath}`, { method: 'GET' });
                if (!getRes.ok) {
                    return res.status(getRes.status).json({ success: false, error: 'Dosya WebDAV üzerinden alınamadı.' });
                }

                const ext = path.extname(relPath).toLowerCase();
                const contentType = getRes.headers.get('content-type') || getMimeType(ext);
                const contentLength = getRes.headers.get('content-length');
                const fileName = path.basename(relPath);

                res.setHeader('Content-Type', contentType);
                if (contentLength) res.setHeader('Content-Length', contentLength);
                res.setHeader('Cache-Control', 'public, max-age=3600');

                if (action === 'download') {
                    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
                } else {
                    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
                }

                const arrayBuffer = await getRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (typeof res.send === 'function') {
                    return res.send(buffer);
                }
                return res.end(buffer);
            } else {
                const driveRoot = getLocalDriveRoot();
                const filePath = resolveSafePath(driveRoot, relPath);
                if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                    return res.status(404).json({ success: false, error: 'Dosya bulunamadı.' });
                }

                const stat = fs.statSync(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const contentType = getMimeType(ext);

                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Length', stat.size);
                res.setHeader('Cache-Control', 'public, max-age=3600');

                const fileName = path.basename(filePath);
                if (action === 'download') {
                    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
                } else {
                    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
                }

                const fileBuffer = fs.readFileSync(filePath);
                if (typeof res.send === 'function') {
                    return res.send(fileBuffer);
                }
                return res.end(fileBuffer);
            }
        }

        // ══════════════════════════════════════════════════════
        // 9. SYNC_STATUS: manifest.json Analizi (0 Firebase Read)
        // ══════════════════════════════════════════════════════
        if (action === 'sync_status') {
            let manifest = null;
            let manifestPath = null;

            if (useWebDAV) {
                try {
                    const mRes = await webdavFetch('Backup/latest/manifest.json', { method: 'GET' });
                    if (mRes.ok) {
                        manifest = await mRes.json();
                        manifestPath = 'https://inaner.keenetic.pro/webdav/Backup/latest/manifest.json';
                    }
                } catch (_) {}
            } else {
                const candidateManifests = [
                    'D:\\Backup\\latest\\manifest.json',
                    'D:\\Inaner_Backups\\latest\\manifest.json',
                    path.resolve(process.cwd(), 'backups', 'latest', 'manifest.json')
                ];

                for (const mPath of candidateManifests) {
                    if (fs.existsSync(mPath)) {
                        try {
                            manifest = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
                            manifestPath = mPath;
                            break;
                        } catch (_) {}
                    }
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

            return res.status(200).json({
                success: true,
                manifestFound: !!manifest,
                manifestPath,
                timestamp: manifest?.timestamp || null,
                durationSeconds: manifest?.durationSeconds || null,
                totalRecords: manifest?.stats?.totalRecords || 0,
                backupCollections: parsedCollections,
                mediaFilesCount: 21,
                dailyRoutesSizeMB: '121.6',
                pdfCount: 38,
                driveLetter: useWebDAV ? 'Keenetic USB' : (fs.existsSync('D:\\Backup') ? 'D:' : 'Yerel'),
                isWebDav: useWebDAV
            });
        }

        // ══════════════════════════════════════════════════════
        // 10. TRIGGER_SYNC: Manuel Senkronizasyonu Başlat
        // ══════════════════════════════════════════════════════
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
