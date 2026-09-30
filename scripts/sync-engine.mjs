/**
 * İnaner Logistics - Akıllı Senkron Yedekleme Motoru (Smart Sync Engine)
 * 
 * Bu motor:
 * 1. Firebase Firestore üzerindeki 23+ koleksiyonu otomatik olarak çeker ve JSON olarak arşivler.
 * 2. Firestore içerisindeki tüm Cloudinary (görsel/PDF) ve harici belge bağlantılarını tarar.
 * 3. Yerel diskte bulunmayan yeni belgeleri/PDF'leri artımlı (incremental) olarak indirir.
 * 4. Verileri Keenetic modeme bağlı USB diske (veya yerel depolama alanına) tarihli olarak yazar.
 * 5. İnternetsiz ortamda bile çalışabilen Çevrimdışı Görüntüleyiciyi (Offline Viewer) günceller.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// .env dosyasını oku ve ortam değişkenlerine yükle
function loadEnv() {
    const envPaths = [
        path.join(PROJECT_ROOT, '.env'),
        path.join(PROJECT_ROOT, '.env.local'),
        path.join(PROJECT_ROOT, '.env.production')
    ];
    for (const p of envPaths) {
        if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.substring(0, eqIdx).trim();
                    let val = trimmed.substring(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.substring(1, val.length - 1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    }
}
loadEnv();

// Koleksiyon Listesi
const COLLECTIONS = [
    'trips',
    'fuel',
    'maintenance',
    'maintenance_folders',
    'payments',
    'penalties',
    'invoices',
    'payouts',
    'spare_parts',
    'mechanics',
    'shopping_list',
    'geofences',
    'manual_splits',
    'manual_merges',
    'manual_deletes',
    'custom_route_names',
    'company_data',
    'trucks',
    'vehicle_daily_stats',
    'company_notifications',
    'personnel',
    'approved_users',
    'pending_users',
    'live_positions',
    'daily_routes'
];

// Hedef Dizin Belirleme
function resolveBackupDirectory() {
    // 1. Komut satırı argümanı: --dest="Z:\Inaner_Backups"
    const destArg = process.argv.find(a => a.startsWith('--dest='));
    if (destArg) {
        return path.resolve(destArg.split('=')[1].replace(/"/g, ''));
    }

    // 2. Ortam değişkeni
    if (process.env.BACKUP_DEST_DIR) {
        return path.resolve(process.env.BACKUP_DEST_DIR);
    }

    // 3. Olası ağ sürücüleri (D:, Z:, Y:, X: üzerinde Backup kontrolü)
    const candidateDrives = ['D:\\', 'Z:\\', 'Y:\\', 'X:\\', 'W:\\'];
    for (const drive of candidateDrives) {
        if (fs.existsSync(drive)) {
            const backupTarget = path.join(drive, 'Backup');
            if (fs.existsSync(backupTarget)) return backupTarget;
            const legacyTarget = path.join(drive, 'Inaner_Backups');
            if (fs.existsSync(legacyTarget)) return legacyTarget;
            return backupTarget;
        }
    }

    // 4. Varsayılan yerel klasör
    return path.join(PROJECT_ROOT, 'backups');
}

// Güvenli dosya indirme (Native fetch + stream)
async function downloadFile(url, destPath) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Inaner-Backup-Engine/2.0' }
        });
        if (!res.ok) {
            return { success: false, error: `HTTP ${res.status} ${res.statusText}` };
        }
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(destPath, Buffer.from(buffer));
        return { success: true, size: buffer.byteLength };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Nesne içindeki Cloudinary ve belge URL'lerini recursive tara
function extractMediaUrls(obj, found = []) {
    if (!obj || typeof obj !== 'object') return found;

    if (Array.isArray(obj)) {
        for (const item of obj) {
            extractMediaUrls(item, found);
        }
        return found;
    }

    for (const [key, val] of Object.entries(obj)) {
        if (typeof val === 'string') {
            if (val.startsWith('http://') || val.startsWith('https://')) {
                const lower = val.toLowerCase();
                const isCloudinary = lower.includes('cloudinary.com') || lower.includes('res.cloudinary');
                const isDoc = lower.endsWith('.pdf') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp');
                if (isCloudinary || isDoc) {
                    found.push({ field: key, url: val });
                }
            }
        } else if (typeof val === 'object') {
            extractMediaUrls(val, found);
        }
    }
    return found;
}

// Ana Senkronizasyon Akışı
async function runSync() {
    const startTime = Date.now();
    console.log("==================================================");
    console.log("  INANER LOGISTICS - SMART SYNC & BACKUP ENGINE   ");
    console.log("==================================================");

    const baseDest = resolveBackupDirectory();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dateDayStr = new Date().toISOString().slice(0, 10);

    const latestDir = path.join(baseDest, 'latest');
    const snapshotDir = path.join(baseDest, 'snapshots', timestampStr);
    const mediaDir = path.join(baseDest, 'media');

    console.log(`Hedef Dizin : ${baseDest}`);
    console.log(`Zaman Damgası: ${timestampStr}`);
    console.log(`Medya Havuzu : ${mediaDir}`);
    console.log("--------------------------------------------------");

    // Dizinleri oluştur
    [latestDir, snapshotDir, mediaDir].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    // 1. Firebase Bağlantısı Kur (Admin SDK, REST API + Token Refresh, veya Client SDK)
    let db = null;
    let authMode = 'NONE';
    let restToken = null;
    const apiKey = process.env.VITE_FIREBASE_API_KEY || "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo";
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "v2-tir";

    // A. Service Account Denetimi
    const serviceAccountPaths = [
        path.join(PROJECT_ROOT, 'serviceAccountKey.json'),
        path.join(PROJECT_ROOT, 'service-account.json'),
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    ].filter(Boolean);

    for (const saPath of serviceAccountPaths) {
        if (fs.existsSync(saPath)) {
            try {
                const admin = (await import('firebase-admin')).default;
                const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
                if (!admin.apps.length) {
                    admin.initializeApp({ credential: admin.credential.cert(sa) });
                }
                db = admin.firestore();
                authMode = 'SERVICE_ACCOUNT';
                console.log(`Kimlik Doğrulama: Admin SDK (Service Account: ${path.basename(saPath)})`);
                break;
            } catch (e) {
                console.warn(`Admin SDK yüklenemedi: ${e.message}`);
            }
        }
    }

    // B. Token Refresh & REST API (kenan@inaner.com Admin Session)
    if (!db) {
        const refreshTokenPath = path.join(PROJECT_ROOT, 'firebase_refresh_token.txt');
        if (fs.existsSync(refreshTokenPath)) {
            const refreshToken = fs.readFileSync(refreshTokenPath, 'utf8').trim();
            if (refreshToken) {
                try {
                    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
                    });
                    if (res.ok) {
                        const tokenData = await res.json();
                        restToken = tokenData.id_token || tokenData.access_token;
                        fs.writeFileSync(path.join(PROJECT_ROOT, 'firebase_access_token.txt'), restToken);
                        authMode = 'REST_API_TOKEN_REFRESH';
                        console.log(`Kimlik Doğrulama: SecureToken API Yenilendi (Super Admin REST Oturumu)`);
                    } else {
                        console.warn(`SecureToken yenileme yanıtı: HTTP ${res.status}`);
                    }
                } catch (e) {
                    console.warn(`SecureToken yenileme hatası: ${e.message}`);
                }
            }
        }

        // Access token doğrudan var mı?
        if (!restToken) {
            const accessTokenPath = path.join(PROJECT_ROOT, 'firebase_access_token.txt');
            if (fs.existsSync(accessTokenPath)) {
                restToken = fs.readFileSync(accessTokenPath, 'utf8').trim();
                if (restToken) {
                    authMode = 'REST_API_CACHED_TOKEN';
                    console.log(`Kimlik Doğrulama: Mevcut Access Token Kullanılıyor`);
                }
            }
        }
    }

    // C. Client SDK Fallback
    if (!db && !restToken) {
        const { initializeApp } = await import('firebase/app');
        const { getFirestore } = await import('firebase/firestore');
        const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');

        const firebaseConfig = {
            apiKey: apiKey,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "v2-tir.firebaseapp.com",
            projectId: projectId,
            storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "v2-tir.firebasestorage.app",
            messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1000600529147",
            appId: process.env.VITE_FIREBASE_APP_ID || "1:1000600529147:web:526e80325687dc052e285e"
        };

        const app = initializeApp(firebaseConfig, `backup-app-${Date.now()}`);
        db = getFirestore(app);
        const auth = getAuth(app);

        const email = process.env.BACKUP_AUTH_EMAIL || 'kenan@inaner.com';
        const password = process.env.BACKUP_AUTH_PASSWORD;

        if (password) {
            try {
                await signInWithEmailAndPassword(auth, email, password);
                authMode = `CLIENT_AUTH (${email})`;
                console.log(`Kimlik Doğrulama: Firebase Auth Başarılı (${email})`);
            } catch (err) {
                authMode = `CLIENT_UNAUTH (${err.message})`;
                console.warn(`Uyarı: Firebase Auth oturumu açılamadı: ${err.message}`);
            }
        } else {
            authMode = 'CLIENT_UNAUTH (Şifre tanımlanmadı)';
            console.log("Bilgi: BACKUP_AUTH_PASSWORD tanımlanmadı, kural izinleri dahilinde okunacak.");
        }
    }

    console.log("--------------------------------------------------");
    console.log("1. Veritabanı Koleksiyonları Çekiliyor...");

    const allData = {};
    const mediaQueue = [];
    const stats = {
        collections: {},
        totalRecords: 0,
        mediaTotal: 0,
        mediaDownloaded: 0,
        mediaSkipped: 0,
        mediaFailed: 0,
        totalBytes: 0
    };

// Firestore REST Value Decoder
function decodeFirestoreValue(val) {
    if (!val || typeof val !== 'object') return val;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return Number(val.doubleValue);
    if ('booleanValue' in val) return Boolean(val.booleanValue);
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('mapValue' in val) {
        const res = {};
        const fields = val.mapValue?.fields || {};
        for (const [k, v] of Object.entries(fields)) {
            res[k] = decodeFirestoreValue(v);
        }
        return res;
    }
    if ('arrayValue' in val) {
        return (val.arrayValue?.values || []).map(decodeFirestoreValue);
    }
    return val;
}

// Firestore REST Pagination Fetcher
async function fetchCollectionViaRest(projectId, colName, token, maxLimit = 0) {
    let docs = [];
    let pageToken = '';
    do {
        const pageSize = maxLimit > 0 ? Math.min(maxLimit - docs.length, 300) : 300;
        let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${colName}?pageSize=${pageSize}`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
        
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await fetch(url, { headers });
        if (!res.ok) {
            if (res.status === 404) {
                return []; // Koleksiyon henuz yoksa bos liste
            }
            const err = await res.text();
            throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
        }
        const data = await res.json();
        if (data.documents) {
            for (const doc of data.documents) {
                const id = doc.name.split('/').pop();
                const fields = doc.fields || {};
                const clean = { id };
                for (const [k, v] of Object.entries(fields)) {
                    clean[k] = decodeFirestoreValue(v);
                }
                docs.push(clean);
                if (maxLimit > 0 && docs.length >= maxLimit) {
                    return docs;
                }
            }
        }
        pageToken = data.nextPageToken || '';
        if (maxLimit > 0 && docs.length >= maxLimit) break;
    } while (pageToken);
    return docs;
}

// Yerel mevcut yedek verisini guvenle oku (Veri kaybini onleme ve inkremental birlestirme)
function loadLocalCollection(baseDir, colName) {
    const candidates = [
        path.join(baseDir, 'latest', 'database', `${colName}.json`),
        path.join(baseDir, 'latest', `${colName}.json`)
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            try {
                const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
                if (Array.isArray(data) && data.length > 0) return data;
            } catch { /* empty */ }
        }
    }
    // Eger latest icinde bos ise, snapshots icindeki en son gecerli yedegi tara
    const snapshotsDir = path.join(baseDir, 'snapshots');
    if (fs.existsSync(snapshotsDir)) {
        try {
            const dirs = fs.readdirSync(snapshotsDir).sort().reverse();
            for (const d of dirs) {
                const snapFile = path.join(snapshotsDir, d, 'database', `${colName}.json`);
                if (fs.existsSync(snapFile)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
                        if (Array.isArray(data) && data.length > 0) return data;
                    } catch { /* empty */ }
                }
            }
        } catch { /* empty */ }
    }
    return [];
}

    const isFullSync = process.argv.includes('--full') || process.argv.includes('--full-sync');
    let quotaExceeded = false;
    let totalReadsThisRun = 0;
    const MAX_SAFE_READS = 2500;

    // Koleksiyonlari tara
    for (const colName of COLLECTIONS) {
        process.stdout.write(`- [${colName.padEnd(22)}] `);
        const existingDocs = loadLocalCollection(baseDest, colName);

        // Kota asimi tespit edildiyse kalanlari sorgulama, yerel yedegi koru
        if (quotaExceeded || totalReadsThisRun >= MAX_SAFE_READS) {
            allData[colName] = existingDocs;
            stats.collections[colName] = `${existingDocs.length} (Yerel Korundu)`;
            console.log(`ATLANDI (Kota Korumasi: ${existingDocs.length} yerel kayit korundu)`);
            continue;
        }

        try {
            let docs = [];
            // Buyuk ve statik gunluk telemetri koleksiyonlari icin akilli inkremental kontrol
            const isHistoricalTelemetry = (colName === 'daily_routes' || colName === 'vehicle_daily_stats');
            
            if (isHistoricalTelemetry && existingDocs.length > 0 && !isFullSync) {
                // Sadece en son sayfayi cekip yerel gecmisle birlestir (Yuzlerce gereksiz read tasarrufu)
                if (restToken) {
                    docs = await fetchCollectionViaRest(projectId, colName, restToken, 40);
                } else if (authMode === 'SERVICE_ACCOUNT') {
                    const snap = await db.collection(colName).limit(40).get();
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                } else {
                    const { collection, getDocs, limit, query } = await import('firebase/firestore');
                    const snap = await getDocs(query(collection(db, colName), limit(40)));
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                }
            } else {
                // Standart koleksiyonlar
                if (authMode === 'SERVICE_ACCOUNT') {
                    const snap = await db.collection(colName).get();
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                } else if (restToken) {
                    docs = await fetchCollectionViaRest(projectId, colName, restToken);
                } else {
                    const { collection, getDocs } = await import('firebase/firestore');
                    const snap = await getDocs(collection(db, colName));
                    snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                }
            }

            totalReadsThisRun += docs.length;

            // Inkremental Birlestirme (Yerel kayitlar ile Firestore'dan yeni gelenleri merge et)
            const docMap = new Map();
            existingDocs.forEach(d => { if (d.id) docMap.set(d.id, d); });
            docs.forEach(d => { if (d.id) docMap.set(d.id, d); });
            const finalDocs = Array.from(docMap.values());

            allData[colName] = finalDocs;
            stats.collections[colName] = finalDocs.length;
            stats.totalRecords += finalDocs.length;

            // Medya URL'lerini cikar
            const foundUrls = extractMediaUrls(docs);
            foundUrls.forEach(item => {
                mediaQueue.push({ collection: colName, ...item });
            });

            console.log(`OK (${String(finalDocs.length).padStart(4)} kayit, ${docs.length} yeni/guncel)`);
        } catch (err) {
            const errStr = String(err?.message || err);
            const isQuota = errStr.includes('429') || errStr.includes('Quota') || errStr.includes('RESOURCE_EXHAUSTED');
            if (isQuota) {
                quotaExceeded = true;
                console.log(`KOTA ASIMI (HTTP 429) -> Onceki ${existingDocs.length} yerel kayit guvenle korundu`);
            } else {
                console.log(`HATA (${errStr.slice(0, 45)}) -> Onceki ${existingDocs.length} yerel kayit korundu`);
            }
            // Hata olsa bile mevcut yedegi ASLA bosaltma!
            allData[colName] = existingDocs;
            stats.collections[colName] = `${existingDocs.length} (Hata Sonrasi Korundu)`;
        }
    }

    // Toplam gecerli kayit sayisini hesapla
    stats.totalRecords = Object.values(allData).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : 0), 0);

    // Veritabanı JSON dosyalarını kaydet
    const databaseSnapshotDir = path.join(snapshotDir, 'database');
    const databaseLatestDir = path.join(latestDir, 'database');
    [databaseSnapshotDir, databaseLatestDir].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    for (const [colName, records] of Object.entries(allData)) {
        const jsonContent = JSON.stringify(records, null, 2);
        fs.writeFileSync(path.join(databaseSnapshotDir, `${colName}.json`), jsonContent);
        fs.writeFileSync(path.join(databaseLatestDir, `${colName}.json`), jsonContent);
    }
    // Tek parça konsolide veritabanı yedeği
    const consolidatedJson = JSON.stringify(allData, null, 2);
    fs.writeFileSync(path.join(snapshotDir, 'all_collections.json'), consolidatedJson);
    fs.writeFileSync(path.join(latestDir, 'all_collections.json'), consolidatedJson);

    console.log("--------------------------------------------------");
    console.log(`2. Medya & PDF Arşivi Taranıyor (${mediaQueue.length} bağlantı bulundu)...`);

    // Benzersiz medya listesi (Deduplication)
    const uniqueMedia = new Map();
    for (const item of mediaQueue) {
        if (!uniqueMedia.has(item.url)) {
            uniqueMedia.set(item.url, item);
        }
    }

    stats.mediaTotal = uniqueMedia.size;
    console.log(`   Benzersiz Dosya Sayısı: ${stats.mediaTotal}`);

    // Medya indirme dizin yapısı
    for (const [url, item] of uniqueMedia.entries()) {
        try {
            const urlObj = new URL(url);
            let ext = path.extname(urlObj.pathname) || '.jpg';
            if (!ext.startsWith('.')) ext = '.' + ext;
            if (url.includes('/raw/upload/') && !ext) ext = '.pdf';

            // Hash bazlı deterministik güvenli dosya adı
            const urlHash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
            const originalName = path.basename(urlObj.pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
            const safeFileName = `${urlHash}_${originalName.length > 30 ? originalName.slice(-30) : originalName}`;
            
            const categoryFolder = path.join(mediaDir, item.collection);
            const filePath = path.join(categoryFolder, safeFileName);

            // Dosya zaten varsa ve boyutu > 0 ise atla (İnkremental)
            if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                stats.mediaSkipped++;
                continue;
            }

            process.stdout.write(`   + İndiriliyor: [${item.collection}] ${originalName.slice(0, 25)}... `);
            const dl = await downloadFile(url, filePath);
            if (dl.success) {
                stats.mediaDownloaded++;
                stats.totalBytes += dl.size;
                console.log(`OK (${(dl.size / 1024).toFixed(1)} KB)`);
            } else {
                stats.mediaFailed++;
                console.log(`HATA (${dl.error})`);
            }
        } catch (e) {
            stats.mediaFailed++;
        }
    }

    console.log("--------------------------------------------------");
    console.log("3. Çevrimdışı Görüntüleyici (Offline Dashboard) Güncelleniyor...");

    // Manifest ve Özet Verisi
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const manifest = {
        version: "2.0.0",
        system: "Inaner Logistics",
        timestamp: new Date().toISOString(),
        durationSeconds: Number(durationSec),
        authMode: authMode,
        backupLocation: baseDest,
        stats: stats
    };

    fs.writeFileSync(path.join(latestDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const syncMeta = {
        lastSyncTimestamp: new Date().toISOString(),
        durationSeconds: Number(durationSec),
        authMode: authMode,
        quotaExceeded: quotaExceeded,
        totalRecords: stats.totalRecords,
        collections: stats.collections
    };
    fs.writeFileSync(path.join(latestDir, 'last_sync.json'), JSON.stringify(syncMeta, null, 2));

    // 4. Çevrimdışı Bellek Dosyası (offline-data.js) Oluştur
    // Tarayıcıların file:// güvenlik engelini aşmak için veriyi doğrudan script değişkeni olarak sunar
    const offlineJsContent = `window.__INANER_OFFLINE_DB__ = ${consolidatedJson};\nconsole.log("[İnaner.tr] Çevrimdışı veritabanı başarıyla belleğe yüklendi.");\n`;
    fs.writeFileSync(path.join(latestDir, 'offline-data.js'), offlineJsContent);
    fs.writeFileSync(path.join(snapshotDir, 'offline-data.js'), offlineJsContent);

    // 5. Orijinal React Web Sitesini (dist) Sürücüye Dağıt (.webapp Gizli Sistem Klasörü)
    const distDir = path.join(PROJECT_ROOT, 'dist');
    const distIndexHtml = path.join(distDir, 'index.html');

    if (fs.existsSync(distIndexHtml)) {
        console.log("--------------------------------------------------");
        console.log("4. Orijinal Web Sitesi Sürücüye Dağıtılıyor (dist -> Backup/.webapp)...");

        // Dizin kopyalama yardımcı fonksiyonu
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

        // Web App dizini Backup içindeki gizli .webapp klasörüdür (Kök dizin asla kirletilmez)
        const webAppDir = path.join(baseDest, '.webapp');
        copyDirRecursive(distDir, webAppDir);
        fs.writeFileSync(path.join(webAppDir, 'offline-data.js'), offlineJsContent);

        // index.html'in içine offline-data.js scriptini enjekte et
        let htmlContent = fs.readFileSync(distIndexHtml, 'utf-8');
        if (!htmlContent.includes('offline-data.js')) {
            htmlContent = htmlContent.replace('<head>', '<head>\n    <script src="./offline-data.js"></script>');
        }

        fs.writeFileSync(path.join(webAppDir, 'index.html'), htmlContent);
        fs.writeFileSync(path.join(latestDir, 'index.html'), htmlContent);

        // server.mjs ve start_silent.vbs dosyalarını .webapp içine kopyala
        const serverMjsSrc = path.join(__dirname, 'server.mjs');
        const startSilentSrc = path.join(__dirname, 'start_silent.vbs');
        if (fs.existsSync(serverMjsSrc)) {
            fs.copyFileSync(serverMjsSrc, path.join(webAppDir, 'server.mjs'));
        }
        if (fs.existsSync(startSilentSrc)) {
            fs.copyFileSync(startSilentSrc, path.join(webAppDir, 'start_silent.vbs'));
        }

        console.log(`   ✓ Orijinal React Web Arayüzü ${webAppDir} gizli sistem klasörüne kuruldu.`);
    } else {
        // Fallback: dist henüz derlenmemişse basit görüntüleyiciyi kopyala
        const viewerHtmlSource = path.join(__dirname, 'offline-viewer.html');
        if (fs.existsSync(viewerHtmlSource)) {
            fs.copyFileSync(viewerHtmlSource, path.join(baseDest, 'index.html'));
            fs.copyFileSync(viewerHtmlSource, path.join(latestDir, 'index.html'));
        }
    }

    // 6. Eski Snapshot'ları Temizle (Disk Tasarrufu: En son 3 snapshot tutulur)
    pruneOldSnapshots(path.join(baseDest, 'snapshots'), 3);

    console.log("==================================================");
    console.log("           SENKRONİZASYON TAMAMLANDI              ");
    console.log("==================================================");
    console.log(`Kayıt Toplamı    : ${stats.totalRecords}`);
    console.log(`İndirilen Medya  : ${stats.mediaDownloaded} yeni dosya`);
    console.log(`Atlanan (Mevcut) : ${stats.mediaSkipped} dosya`);
    console.log(`Hatalı Medya     : ${stats.mediaFailed}`);
    console.log(`Toplam Süre      : ${durationSec} saniye`);
    console.log(`Yedek Konumu     : ${baseDest}`);
    console.log(`Görüntüleyici    : file:///${path.join(baseDest, 'index.html').replace(/\\/g, '/')}`);
    console.log("==================================================");
}

// Eski snapshotları otomatik temizle (en fazla maxKeep adet tut)
function pruneOldSnapshots(snapshotsDir, maxKeep = 3) {
    if (!fs.existsSync(snapshotsDir)) return;
    try {
        const dirs = fs.readdirSync(snapshotsDir)
            .filter(d => fs.statSync(path.join(snapshotsDir, d)).isDirectory())
            .sort();
        if (dirs.length > maxKeep) {
            const toDelete = dirs.slice(0, dirs.length - maxKeep);
            for (const d of toDelete) {
                const target = path.join(snapshotsDir, d);
                fs.rmSync(target, { recursive: true, force: true });
                console.log(`   [Temizlik] Eski snapshot silindi: ${d}`);
            }
        }
    } catch (e) {
        console.warn(`   [Temizlik Uyarısı] Snapshot temizlenemedi: ${e.message}`);
    }
}

runSync().catch(err => {
    console.error("Kritik Yedekleme Hatası:", err);
    process.exit(1);
});
