import { db, adminAuth } from './firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
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
            const data = callerDoc.data();
            callerCompanyId = data.companyId || null;
        } else {
            return res.status(403).json({ error: 'Kullanici kaydiniz onayli kullanicilar arasinda bulunamadi.' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Kullanici yetkisi kontrol edilirken hata olustu.', details: err.message });
    }

    if (!callerCompanyId) {
        return res.status(403).json({ error: 'Bagli oldugunuz bir sirket bulunamadi. Islem yapilamaz.' });
    }

    let api = null;
    try {
        const companySettingsDocId = callerCompanyId === 'inaner_logistics' ? 'info' : `${callerCompanyId}_info`;
        const settingsDoc = await db.collection('company_data').doc(companySettingsDocId).get();
        if (!settingsDoc.exists) {
            return res.status(404).json({ error: 'Sirket GIB ayarlari bulunamadi.' });
        }

        const settingsData = settingsDoc.data();
        const gibUsername = settingsData.gibUsername;
        const gibPassword = settingsData.gibPassword;
        const gibTestMode = settingsData.gibTestMode || false;

        if (!gibUsername || !gibPassword) {
            return res.status(400).json({ error: 'Sirketinizin GIB portal bilgileri (Kullanici Adi / Sifre) eksik.' });
        }
        api = new EInvoiceApi();
        // No need for undici patch if it's not installed, native fetch works.

        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        await api.initAccessToken();

        const smsResult = await api.sendSMSCode();

        try {
            await api.logout();
        } catch (logoutErr) {}

        const formattedResult = {
            oid: smsResult.oid || '',
            phone: smsResult.phoneNumber || smsResult.phone || '',
            phoneNumber: smsResult.phoneNumber || smsResult.phone || ''
        };

        return res.status(200).json({ success: true, smsResult: formattedResult });
    } catch (err) {
        console.error("GIB SMS hatasi:", err);
        if (api) {
            try { await api.logout(); } catch (e) {}
        }
        
        let errorMessage = err.message || 'GIB SMS gonderimi sirasinda hata olustu.';
        
        // e-fatura library attaches raw GIB payload to err.data or err.response.data
        const gibResponseData = err.data || (err.response && err.response.data);
        if (gibResponseData) {
            // If GIB returned an OID despite throwing an error, recover and return success!
            if (gibResponseData.data && gibResponseData.data.oid) {
                return res.status(200).json({
                    success: true,
                    smsResult: {
                        oid: gibResponseData.data.oid,
                        phone: '',
                        phoneNumber: ''
                    }
                });
            }

            const messages = gibResponseData.messages || [];
            const hasMultipleLoginMsg = messages.some(msg => {
                const text = typeof msg === 'string' ? msg : (msg && msg.msg) || '';
                return text.includes('Farklı bir bilgisayardan veya tarayıcıdan sisteme giriş') || 
                       text.includes('oturumu kapatilacaktir');
            });
            if (hasMultipleLoginMsg) {
                errorMessage = "GIB Portal'a baska bir cihazdan veya tarayicidan giris yapilmis durumda. GIB guvenlik geregi ayni anda sadece 1 aktif oturuma izin veriyor.";
            } else if (messages.length > 0) {
                errorMessage = messages.map(m => typeof m === 'string' ? m : m.msg).join('\n');
            }
        }
        return res.status(500).json({ error: errorMessage });
    }
}
