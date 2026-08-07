import admin from 'firebase-admin';
import { EInvoiceApi } from 'e-fatura';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = admin.firestore();

export default async function handler(req, res) {
    try {
        const docId = 'info'; 
        const companyDoc = await db.collection('company_data').doc(docId).get();
        const data = companyDoc.data();
        
        const api = new EInvoiceApi();
        
        const originalSendRequest = api.sendRequest;
        api.sendRequest = async function(url, params, config) {
            if (params && params.assoscmd === 'anologin' && this.username && this.username.length < 10) {
                params.assoscmd = 'login';
            }
            return originalSendRequest.call(this, url, params, config);
        };

        api.setCredentials({ username: data.gibUsername, password: data.gibPassword });
        api.setTestMode(data.gibTestMode || false);
        
        await api.initAccessToken();
        
        try {
            const userInfo = await api.getUserInformation();
            return res.json({ success: true, userInfo });
        } catch (infoErr) {
            return res.json({ success: false, error: 'getUserInformation failed', details: infoErr.message, response: infoErr.response?.data });
        }
    } catch (err) {
        return res.json({ error: err.message });
    }
}
