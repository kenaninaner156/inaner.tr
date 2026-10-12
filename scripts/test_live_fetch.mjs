import fs from 'fs';
import path from 'path';

async function fetchLiveFirestore() {
    const apiKey = "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo";
    const projectId = "v2-tir";
    const refreshToken = fs.readFileSync('firebase_refresh_token.txt', 'utf8').trim();

    console.log("Token yenileniyor...");
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error("Token yenilenemedi:", res.status, errText);
        return;
    }

    const tokenData = await res.json();
    const idToken = tokenData.id_token;
    fs.writeFileSync('firebase_access_token.txt', idToken);
    console.log("✅ Token başarıyla yenilendi!");

    // Test: trucks, loans, open_debts, trips, fuel, invoices
    const collectionsToTest = ['trucks', 'loans', 'open_debts', 'trips', 'fuel', 'invoices', 'payments'];

    for (const col of collectionsToTest) {
        try {
            const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}?pageSize=300`;
            const cRes = await fetch(url, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (!cRes.ok) {
                console.error(`- ${col} çekilemedi: ${cRes.status}`);
            } else {
                const data = await cRes.json();
                const count = data.documents ? data.documents.length : 0;
                console.log(`- ${col}: ${count} doküman bulundu.`);
            }
        } catch (e) {
            console.error(`- ${col} hata:`, e.message);
        }
    }
}

fetchLiveFirestore().catch(console.error);
