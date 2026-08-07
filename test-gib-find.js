import { db } from './api/firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';
import fs from 'fs';

async function run() {
    try {
        console.log("Fetching invoice from Firestore...");
        
        // Find the most recent draft invoice without ordering to avoid index errors
        const invoicesSnapshot = await db.collection('invoices')
            .where('gibStatus', '==', 'Draft')
            .get();
            
        if (invoicesSnapshot.empty) {
            console.log("No draft invoices found in Firestore.");
            return;
        }

        console.log(`Found ${invoicesSnapshot.docs.length} draft invoices in Firestore:`);
        invoicesSnapshot.docs.forEach(doc => {
            console.log(`- ${doc.id}: gibUuid=${doc.data().gibUuid}, date=${doc.data().invoiceDate}`);
        });

        const invoiceDoc = invoicesSnapshot.docs[0];
        const invoiceData = invoiceDoc.data();
        console.log("Found invoice:", invoiceDoc.id);
        console.log("gibUuid:", invoiceData.gibUuid);
        console.log("invoiceDate:", invoiceData.invoiceDate);
        console.log("createdAt:", invoiceData.createdAt);
        console.log("companyId:", invoiceData.companyId);

        console.log("\nFetching company credentials...");
        // Fallback checks for company info
        const companySettingsDocId = invoiceData.companyId === 'inaner_logistics' ? 'info' : `${invoiceData.companyId}_info`;
        const settingsDoc = await db.collection('company_data').doc(companySettingsDocId).get();

        if (!settingsDoc.exists) {
            console.log("Company settings not found.");
            return;
        }
        
        console.log("Settings data:", settingsDoc.data());

        const gibUsername = settingsDoc.data().gibUsername;
        const gibPassword = settingsDoc.data().gibPassword;
        const gibTestMode = settingsDoc.data().gibTestMode || false;
        
        console.log("Test mode:", gibTestMode);

        const api = new EInvoiceApi();
        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        console.log("\nLogging in to GIB...");
        await api.initAccessToken();
        console.log("Logged in!");

        // Try getting ALL basic invoices for the last 30 days
        let eDate = new Date();
        let sDate = new Date();
        sDate.setDate(eDate.getDate() - 30);
        
        console.log("\nQuerying basic invoices from", sDate.toISOString(), "to", eDate.toISOString());
        
        const invoices = await api.getBasicInvoices({
            startDate: sDate,
            endDate: eDate
        });
        
        console.log(`Found ${invoices.length} invoices on GIB!`);
        for (const inv of invoices) {
            console.log(` - UUID: ${inv.uuid}, Date: ${inv.date}, Buyer: ${inv.buyerTitle}, Status: ${inv.approvalStatus}, Amount: ${inv.odenecekTutar}`);
            // Let's also print the raw object mapping to see odenecekTutar format
        }
        
        // Let's fetch basic invoices again without mapping to see raw output
        const uuidModule = await import('uuid');
        const rawInvoices = await api.sendRequest(api.constructor.DISPATCH_PATH, {
            cmd: 'EARSIV_PORTAL_TASLAKLARI_GETIR',
            callid: uuidModule.v1(),
            pageName: 'RG_BASITTASLAKLAR',
            token: api.token,
            jp: JSON.stringify({
                baslangic: '01/07/2026',
                bitis: '07/08/2026',
                hangiTip: '5000/30000',
                table: []
            })
        });
        
        if (rawInvoices && rawInvoices.data) {
            const draft = rawInvoices.data.find(d => d.ettn === '1be09b37-ef8b-4f8d-af7a-1363c22b660f');
            console.log("RAW DRAFT FROM GIB:");
            console.dir(draft, { depth: null });
        }
        
        console.log("\nPatching the stuck invoice in Firestore with the real UUID...");
        try {
            await invoiceDoc.ref.update({
                gibUuid: '6fc95e44-0e52-4a4b-bc7b-4212ed28a1f2'
            });
            console.log("SUCCESS! Invoice gibUuid updated to the real UUID!");
        } catch (err) {
            console.error("FAILED to patch invoice:", err.message);
        }

    } catch (err) {
        console.error("Script error:", err);
    }
}

run();
