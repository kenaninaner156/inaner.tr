import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const env = fs.readFileSync('./.env', 'utf8');
env.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const k = parts[0].trim();
        const v = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        if (k) process.env[k] = v;
    }
});

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    console.log('--- LIVE FIRESTORE TRUCKS ---');
    const tSnap = await getDocs(collection(db, 'trucks'));
    tSnap.forEach(d => {
        const data = d.data();
        console.log(`Truck ID: ${d.id} | Plate: ${data.plate} | Model: ${data.model} | Company: ${data.companyId} | Deleted: ${data.deleted}`);
    });

    console.log('--- LIVE FIRESTORE COMPANIES ---');
    const cSnap = await getDocs(collection(db, 'companies'));
    cSnap.forEach(d => console.log(`Company ID: ${d.id} | Name: ${d.data().name}`));

    console.log('--- LIVE FIRESTORE PAYMENTS (Vergi & SGK) ---');
    const pSnap = await getDocs(collection(db, 'payments'));
    pSnap.forEach(d => {
        const data = d.data();
        if (data.title?.toLowerCase().includes('demo') || data.category?.toLowerCase().includes('demo') || data.amount < 1000) {
            console.log(`Payment ID: ${d.id} | Title: ${data.title} | Amount: ${data.amount} | Date: ${data.date} | Company: ${data.companyId} | Deleted: ${data.deleted}`);
        }
    });

    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
