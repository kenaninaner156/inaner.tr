import { db } from './api/firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';

async function run() {
    let api = null;
    try {
        console.log("=== FIRESTORE INVOICES ===");
        const snap = await db.collection('invoices').get();
        console.log(`Total invoices in Firestore: ${snap.docs.length}`);
        
        let targetInvoiceDoc = null;
        for (const doc of snap.docs) {
            const data = doc.data();
            if (data.gibStatus || data.startDate?.includes('08') || data.endDate?.includes('08') || Number(data.grandTotal) > 300000) {
                console.log(`Invoice Doc ID: ${doc.id}`);
                console.log(`  gibStatus: ${data.gibStatus}`);
                console.log(`  gibUuid: ${data.gibUuid}`);
                console.log(`  invoiceDate: ${data.invoiceDate}`);
                console.log(`  startDate: ${data.startDate}, endDate: ${data.endDate}`);
                console.log(`  grandTotal: ${data.grandTotal}`);
                console.log(`  companyId: ${data.companyId}`);
                console.log(`  buyerVkn: ${data.buyerVkn}`);
                if (data.gibStatus === 'Draft' || !targetInvoiceDoc) {
                    targetInvoiceDoc = doc;
                }
            }
        }

        const infoDoc = await db.collection('company_data').doc('info').get();
        if (!infoDoc.exists) {
            console.log("No info doc found.");
            return;
        }
        const settings = infoDoc.data();
        console.log("\n=== GIB SETTINGS ===");
        console.log("gibUsername:", settings.gibUsername);
        console.log("gibTestMode:", settings.gibTestMode);

        api = new EInvoiceApi();
        api.setCredentials({ username: settings.gibUsername, password: settings.gibPassword });
        api.setTestMode(settings.gibTestMode || false);

        console.log("\nLogging in to GIB...");
        await api.initAccessToken();
        console.log("Logged in to GIB! Token:", api.token);

        console.log("\nPatching invoice A8qd8cfhH7aT4VUoK8xh with real GIB UUID 1d14eeb9-2967-4649-a946-f471ba70e451...");
        await db.collection('invoices').doc('A8qd8cfhH7aT4VUoK8xh').update({
            gibUuid: '1d14eeb9-2967-4649-a946-f471ba70e451',
            buyerVkn: '7720698422',
            invoiceDate: '2026-08-21T00:00:00.000Z'
        });
        console.log("SUCCESS! Firestore updated!");
    } catch (err) {
        console.error("Inspect error:", err);
    }
}

run();

