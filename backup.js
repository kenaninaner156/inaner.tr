import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs/promises';

const firebaseConfig = {
    apiKey: "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo",
    authDomain: "v2-tir.firebaseapp.com",
    projectId: "v2-tir",
    storageBucket: "v2-tir.firebasestorage.app",
    messagingSenderId: "1000600529147",
    appId: "1:1000600529147:web:526e80325687dc052e285e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTIONS = [
    'trips', 'fuel', 'maintenance', 'payments', 'maintenance_folders', 
    'admin_logs', 'penalties', 'invoices', 'pending_users', 'approved_users',
    'spare_parts', 'mechanics', 'shopping_list', 'geofences', 'manual_splits',
    'custom_route_names', 'company_data', 'presence'
];

async function runBackup() {
    console.log("Yedekleme başlıyor...");
    const backupData = {};
    
    for (const colName of COLLECTIONS) {
        try {
            const querySnapshot = await getDocs(collection(db, colName));
            backupData[colName] = [];
            querySnapshot.forEach((doc) => {
                backupData[colName].push({ id: doc.id, ...doc.data() });
            });
            console.log(`- ${colName} tablosu yedeklendi (${backupData[colName].length} kayıt)`);
        } catch (error) {
            console.log(`! ${colName} tablosu okunurken hata: ${error.message}`);
        }
    }

    await fs.writeFile('firebase_backup.json', JSON.stringify(backupData, null, 2));
    console.log("✅ Yedekleme tamamlandı: firebase_backup.json oluşturuldu.");
}

runBackup();
