import { db, adminAuth } from '../src/services/firebaseAdmin.js';
import eFatura from 'e-fatura';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { invoiceId, code, oid } = req.body;
    if (!invoiceId || !code || !oid) {
        return res.status(400).json({ error: 'Gerekli parametreler eksik (invoiceId, code, oid).' });
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
        return res.status(401).json({ error: 'Gecersiz veya suresi dolmus ID Token.', details: err.message });
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
            return res.status(403).json({ error: 'Bu faturayi onaylama yetkiniz yok.' });
        }
        
        if (!invoiceData.gibUuid) {
            return res.status(400).json({ error: 'Bu faturanin GIB uzerinde taslagi bulunmuyor.' });
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
            // If the e-fatura library tries to use 'anologin' (IVD Login) but the username is an 8-digit code
            if (params && params.assoscmd === 'anologin' && this.username && this.username.length < 10) {
                params.assoscmd = 'login'; // Fallback to classic e-Arşiv login for legacy User Codes
            }
            if (!config) config = {};
            if (!config.dispatcher) {
                config.dispatcher = new (require('undici').Agent)({ connect: { family: 4 } });
            }
            return originalSendRequest.call(this, url, params, config);
        };

        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        await api.initAccessToken();

        // 3. Find BasicInvoice
        const basicInvoice = await api.findBasicInvoice(invoiceData.gibUuid);
        if (!basicInvoice) {
            throw new Error("GIB portalinda fatura bulunamadi.");
        }

        // 4. Sign Invoice
        const signed = await api.signInvoices(code, oid, basicInvoice);
        
        if (!signed) {
            throw new Error("Fatura imzalama islemi basarisiz oldu. SMS kodu yanlis olabilir.");
        }

        // 5. Update DB Status
        await invoiceRef.update({
            gibStatus: 'Signed',
            gibStatusDate: new Date().toISOString()
        });

        try { await api.logout(); } catch (e) {}

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("GIB Imzalama hatasi:", err);
        if (api) {
            try { await api.logout(); } catch (e) {}
        }
        
        let errorMessage = err.message || 'GIB faturasi imzalanirken hata olustu.';
        if (err.response && err.response.data) {
            const data = err.response.data;
            const messages = data.messages || [];
            if (messages.length > 0) {
                errorMessage = messages.map(m => typeof m === 'string' ? m : m.msg).join('\n');
            }
        }
        return res.status(500).json({ error: errorMessage });
    }
}
