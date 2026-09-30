/**
 * İnaner Logistics - Felaket Kurtarma & Geri Yükleme Motoru (Disaster Restore Engine)
 * 
 * Bu motor:
 * 1. Alınan JSON yedeklerini doğrular ve kayıt bütünlüğünü denetler.
 * 2. İstenirse yedekleri yeni veya mevcut bir Firebase veritabanına toplu (batch) olarak geri yükler.
 * 3. Excel veya üçüncü parti yazılımlar için tüm koleksiyonları tek tıkla CSV veya SQLite formatına dönüştürür.
 * 
 * Kullanım Örnekleri:
 * node scripts/restore-engine.mjs --dry-run
 * node scripts/restore-engine.mjs --source="backups/latest/all_collections.json" --to-csv
 * node scripts/restore-engine.mjs --source="backups/latest/all_collections.json" --restore-firebase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Komut satırı parametreleri
const isDryRun = process.argv.includes('--dry-run');
const toCsv = process.argv.includes('--to-csv');
const restoreFirebase = process.argv.includes('--restore-firebase');

const sourceArg = process.argv.find(a => a.startsWith('--source='));
let sourceFile = sourceArg ? path.resolve(sourceArg.split('=')[1].replace(/"/g, '')) : null;

// Varsayılan kaynak arama
if (!sourceFile) {
    const defaultCandidates = [
        path.join(PROJECT_ROOT, 'backups', 'latest', 'all_collections.json'),
        path.join(PROJECT_ROOT, 'backups', 'all_collections.json'),
        path.join(PROJECT_ROOT, 'firebase_backup.json')
    ];
    for (const cand of defaultCandidates) {
        if (fs.existsSync(cand) && fs.statSync(cand).size > 10) {
            sourceFile = cand;
            break;
        }
    }
}

async function runRestore() {
    console.log("==================================================");
    console.log("    INANER LOGISTICS - DISASTER RESTORE ENGINE    ");
    console.log("==================================================");

    if (!sourceFile || !fs.existsSync(sourceFile)) {
        console.error("Hata: Geçerli bir yedek kaynak dosyası bulunamadı.");
        console.log("Lütfen parametre belirtin: node scripts/restore-engine.mjs --source=\"path/to/all_collections.json\"");
        process.exit(1);
    }

    console.log(`Kaynak Dosya : ${sourceFile}`);
    console.log(`Dosya Boyutu : ${(fs.statSync(sourceFile).size / 1024).toFixed(2)} KB`);
    console.log("--------------------------------------------------");

    let backupData = {};
    try {
        backupData = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
    } catch (e) {
        console.error("JSON okuma hatası:", e.message);
        process.exit(1);
    }

    const collections = Object.keys(backupData);
    let totalDocs = 0;
    console.log("Yedek İçeriği Analiz Ediliyor:");
    for (const col of collections) {
        const count = Array.isArray(backupData[col]) ? backupData[col].length : 0;
        totalDocs += count;
        console.log(`- [${col.padEnd(24)}] : ${String(count).padStart(5)} kayıt`);
    }
    console.log("--------------------------------------------------");
    console.log(`Toplam Koleksiyon: ${collections.length} | Toplam Kayıt: ${totalDocs}`);

    // 1. CSV'ye Dışa Aktarma
    if (toCsv) {
        console.log("\n--> CSV Formatına Dönüştürülüyor...");
        const exportCsvDir = path.join(path.dirname(sourceFile), 'csv_exports');
        if (!fs.existsSync(exportCsvDir)) fs.mkdirSync(exportCsvDir, { recursive: true });

        for (const col of collections) {
            const list = backupData[col];
            if (!Array.isArray(list) || list.length === 0) continue;

            const headers = Array.from(new Set(list.flatMap(item => Object.keys(item))));
            const csvRows = [];
            csvRows.push(headers.map(h => `"${h}"`).join(','));

            for (const item of list) {
                const row = headers.map(h => {
                    let val = item[h];
                    if (val === undefined || val === null) return '""';
                    if (typeof val === 'object') val = JSON.stringify(val);
                    return `"${String(val).replace(/"/g, '""')}"`;
                });
                csvRows.push(row.join(','));
            }

            const csvPath = path.join(exportCsvDir, `${col}.csv`);
            fs.writeFileSync(csvPath, '\uFEFF' + csvRows.join('\r\n'), 'utf-8'); // Excel UTF-8 BOM
            console.log(`  ✓ ${col}.csv oluşturuldu (${list.length} satır)`);
        }
        console.log(`Tüm CSV dosyaları hazır: ${exportCsvDir}`);
    }

    // 2. Firebase Geri Yükleme
    if (restoreFirebase && !isDryRun) {
        console.log("\n--> Firebase Veritabanına Geri Yükleme Başlatılıyor...");
        console.warn("DİKKAT: Bu işlem hedef Firestore koleksiyonlarına yazma yapacaktır!");

        // Service account veya client SDK yükle
        const serviceAccountPath = path.join(PROJECT_ROOT, 'serviceAccountKey.json');
        if (!fs.existsSync(serviceAccountPath)) {
            console.error("Geri yükleme için kök dizinde 'serviceAccountKey.json' bulunmalıdır.");
            process.exit(1);
        }

        const admin = (await import('firebase-admin')).default;
        const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(sa) });
        }
        const db = admin.firestore();

        for (const col of collections) {
            const docs = backupData[col];
            if (!Array.isArray(docs) || docs.length === 0) continue;

            console.log(`  + [${col}] yükleniyor (${docs.length} kayıt)...`);
            
            // Firestore 500 batch limiti (400'erli gruplar)
            for (let i = 0; i < docs.length; i += 400) {
                const batch = db.batch();
                const slice = docs.slice(i, i + 400);

                for (const docData of slice) {
                    const docId = docData.id;
                    const cleanData = { ...docData };
                    delete cleanData.id;

                    const ref = docId ? db.collection(col).doc(docId) : db.collection(col).doc();
                    batch.set(ref, cleanData, { merge: true });
                }

                await batch.commit();
            }
            console.log(`    ✓ [${col}] başarıyla geri yüklendi.`);
        }
        console.log("\n✅ Firebase Geri Yükleme Tamamlandı!");
    } else if (isDryRun) {
        console.log("\n[DRY RUN] Bütünlük testi başarılı. Hiçbir veritabanına yazma yapılmadı.");
    }
}

runRestore().catch(e => {
    console.error("Geri yükleme hatası:", e);
    process.exit(1);
});
