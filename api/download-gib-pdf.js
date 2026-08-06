import { db, adminAuth } from '../src/services/firebaseAdmin.js';
import eFatura from 'e-fatura';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { invoiceId } = req.query;
    if (!invoiceId) {
        return res.status(400).json({ error: 'invoiceId parametresi eksik.' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];

    let decodedToken;
    try {
        decodedToken = await adminAuth.verifyIdToken(token);
    } catch (err) {
        return res.status(401).json({ error: 'Gecersiz veya suresi dolmus ID Token.' });
    }

    const callerUid = decodedToken.uid;
    let callerCompanyId = null;
    try {
        const callerDoc = await db.collection('approved_users').doc(callerUid).get();
        if (callerDoc.exists) {
            callerCompanyId = callerDoc.data().companyId || null;
        }
    } catch (err) {
        return res.status(500).json({ error: 'Kullanici yetkisi kontrol edilirken hata olustu.' });
    }

    if (!callerCompanyId) {
        return res.status(403).json({ error: 'Bagli oldugunuz bir sirket bulunamadi.' });
    }

    let api = null;
    try {
        // 1. Get Invoice from DB
        const invoiceRef = db.collection('invoices').doc(invoiceId);
        const invoiceDoc = await invoiceRef.get();
        if (!invoiceDoc.exists) {
            return res.status(404).json({ error: 'Fatura bulunamadi.' });
        }
        
        const invoiceData = invoiceDoc.data();
        if (invoiceData.companyId !== callerCompanyId) {
            return res.status(403).json({ error: 'Bu faturaya erisim yetkiniz yok.' });
        }
        
        if (!invoiceData.gibUuid) {
            return res.status(400).json({ error: 'Bu faturanin GIB uzerinde taslagi/belgesi bulunmuyor.' });
        }

        // 2. Get Company GIB Credentials
        const companyDoc = await db.collection('companies').doc(callerCompanyId).get();
        if (!companyDoc.exists) {
            return res.status(404).json({ error: 'Sirket bilgileri bulunamadi.' });
        }

        const companyData = companyDoc.data();
        const gibUsername = companyData.gibUsername;
        const gibPassword = companyData.gibPassword;
        const gibTestMode = companyData.gibTestMode || false;

        if (!gibUsername || !gibPassword) {
            return res.status(400).json({ error: 'GIB portal bilgileri eksik.' });
        }

        api = new eFatura.EInvoiceApi();
        
        const originalSendRequest = api.sendRequest;
        api.sendRequest = async function(url, params, config) {
            if (!config) config = {};
            if (!config.dispatcher) {
                config.dispatcher = new (require('undici').Agent)({ connect: { family: 4 } });
            }
            return originalSendRequest.call(this, url, params, config);
        };

        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        await api.initAccessToken();

        // Check if signed. If gibStatus is Signed or Approved, we pass true.
        const isSigned = invoiceData.gibStatus === 'Signed' || invoiceData.gibStatus === 'Approved';

        // 3. Get HTML with Print Script injected (so it acts like a PDF download)
        const htmlString = await api.getInvoiceHtml(invoiceData.gibUuid, isSigned, true);
        
        try { await api.logout(); } catch (e) {}

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(htmlString);
    } catch (err) {
        console.error("GIB PDF indirme hatasi:", err);
        if (api) {
            try { await api.logout(); } catch (e) {}
        }
        return res.status(500).json({ error: 'PDF olusturulurken hata olustu.' });
    }
}
