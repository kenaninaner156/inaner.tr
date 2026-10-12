import fs from 'fs';
import path from 'path';

// Helper to convert Firestore REST API document format to standard JS object
function parseFirestoreDoc(doc) {
    const fields = doc.fields || {};
    const obj = { id: doc.name.split('/').pop() };
    
    function parseValue(val) {
        if (!val) return null;
        if ('stringValue' in val) return val.stringValue;
        if ('integerValue' in val) return parseInt(val.integerValue, 10);
        if ('doubleValue' in val) return parseFloat(val.doubleValue);
        if ('booleanValue' in val) return val.booleanValue;
        if ('timestampValue' in val) return val.timestampValue;
        if ('nullValue' in val) return null;
        if ('arrayValue' in val) {
            return (val.arrayValue.values || []).map(parseValue);
        }
        if ('mapValue' in val) {
            const m = {};
            const mf = val.mapValue.fields || {};
            for (const k in mf) {
                m[k] = parseValue(mf[k]);
            }
            return m;
        }
        return null;
    }

    for (const key in fields) {
        obj[key] = parseValue(fields[key]);
    }
    return obj;
}

async function fetchAllCollectionDocs(collectionName, idToken, projectId) {
    const docs = [];
    let pageToken = '';
    do {
        let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}?pageSize=300`;
        if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
        
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });

        if (!res.ok) {
            console.error(`Hata ${collectionName}:`, res.status);
            break;
        }

        const data = await res.json();
        if (data.documents) {
            data.documents.forEach(d => {
                docs.push(parseFirestoreDoc(d));
            });
        }
        pageToken = data.nextPageToken || '';
    } while (pageToken);

    return docs;
}

async function main() {
    const apiKey = "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo";
    const projectId = "v2-tir";
    const refreshToken = fs.readFileSync('firebase_refresh_token.txt', 'utf8').trim();

    console.log("Token yenileniyor...");
    const tokenRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    });

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    console.log("Token hazır.");

    const collections = [
        "trucks",
        "loans",
        "open_debts",
        "trips",
        "fuel",
        "invoices",
        "maintenance",
        "maintenance_folders",
        "penalties",
        "payments",
        "payouts",
        "companies",
        "personnel",
        "approved_users",
        "spare_parts",
        "mechanics",
        "shopping_list",
        "company_data"
    ];

    const fullData = {};

    for (const col of collections) {
        process.stdout.write(`${col} çekiliyor... `);
        const docs = await fetchAllCollectionDocs(col, idToken, projectId);
        fullData[col] = docs;
        console.log(`${docs.length} kayıt`);
    }

    fs.writeFileSync('live_full_backup.json', JSON.stringify(fullData, null, 2));
    console.log("✅ Tam canlı yedek 'live_full_backup.json' dosyasına kaydedildi!");
}

main().catch(console.error);
