import fs from 'fs';
import { execSync } from 'child_process';

async function pushEnvs() {
    console.log("Yerel .env dosyası okunuyor...");
    if (!fs.existsSync('.env')) {
        console.error("Hata: Kök dizinde .env dosyası bulunamadı.");
        process.exit(1);
    }

    const envContent = fs.readFileSync('.env', 'utf-8');
    const lines = envContent.split('\n');

    // Add Vercel project variables
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        
        const key = line.substring(0, eqIdx).trim();
        let val = line.substring(eqIdx + 1).trim();
        
        // Tırnak işaretlerini temizle
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
        }
        
        console.log(`\nVercel: ${key} ekleniyor...`);
        try {
            // Use --value and --yes for completely non-interactive setting in newer Vercel CLI
            execSync(`npx vercel env add ${key} production --value "${val.replace(/"/g, '\\"')}" --yes --force`, { stdio: 'inherit' });
            console.log(`✓ ${key} başarıyla eklendi.`);
        } catch(err) {
            console.error(`✗ ${key} eklenirken hata oluştu:`, err.message);
        }
    }
    
    // Add Firebase Admin credentials from Desktop JSON file as well
    const firebaseJsonPath = "C:/Users/kenan/Desktop/tr/v2-tir-firebase-adminsdk-fbsvc-7c846d0b8b.json";
    if (fs.existsSync(firebaseJsonPath)) {
        console.log("\nFirebase JSON dosyası okunuyor...");
        const fbData = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf-8'));
        
        const extraEnvs = {
            FIREBASE_PROJECT_ID: fbData.project_id,
            FIREBASE_CLIENT_EMAIL: fbData.client_email,
            FIREBASE_PRIVATE_KEY: fbData.private_key
        };
        
        for (const [key, val] of Object.entries(extraEnvs)) {
            console.log(`\nVercel: ${key} ekleniyor...`);
            try {
                // Escape newlines for private key properly in double quotes
                const escapedVal = val.replace(/"/g, '\\"').replace(/\n/g, '\\n');
                execSync(`npx vercel env add ${key} production --value "${escapedVal}" --yes --force`, { stdio: 'inherit' });
                console.log(`✓ ${key} başarıyla eklendi.`);
            } catch(err) {
                console.error(`✗ ${key} eklenirken hata oluştu:`, err.message);
            }
        }
    }
    
    console.log("\n🎉 Tüm çevre değişkenleri Vercel'e başarıyla aktarıldı!");
    process.exit(0);
}

pushEnvs();
