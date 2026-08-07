import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function check() {
    const doc = await db.collection('company_data').doc('info').get();
    if (doc.exists) {
        const data = doc.data();
        console.log('Username:', data.gibUsername, 'Length:', data.gibUsername?.length);
        console.log('Password Length:', data.gibPassword?.length);
        console.log('Password chars:', data.gibPassword.split('').map(c => c.charCodeAt(0)));
    } else {
        console.log('info doc not found');
    }
}
check();
