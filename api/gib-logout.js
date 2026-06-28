/* eslint-env node */
import admin from 'firebase-admin';
import fs from 'fs';
import { EInvoiceApi } from 'e-fatura';

// Initialize Firebase Admin SDK (Single Instance Check)
if (!admin.apps.length) {
    try {
        let projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        // Local development fallback
        const localJsonPath = "C:/Users/kenan/Desktop/tr/v2-tir-firebase-adminsdk-fbsvc-7c846d0b8b.json";
        if ((!privateKey || !clientEmail) && fs.existsSync(localJsonPath)) {
            try {
                const fbData = JSON.parse(fs.readFileSync(localJsonPath, 'utf-8'));
                projectId = fbData.project_id;
                clientEmail = fbData.client_email;
                privateKey = fbData.private_key;
                console.log("Firebase Admin SDK local JSON configuration loaded successfully.");
            } catch (jsonErr) {
                console.error("Error reading local Firebase JSON file:", jsonErr);
            }
        }

        // Clean and sanitize inputs
        if (projectId) {
            projectId = projectId.trim();
            if (projectId.startsWith('"') && projectId.endsWith('"')) projectId = projectId.substring(1, projectId.length - 1);
            if (projectId.startsWith("'") && projectId.endsWith("'")) projectId = projectId.substring(1, projectId.length - 1);
        }
        if (clientEmail) {
            clientEmail = clientEmail.trim();
            if (clientEmail.startsWith('"') && clientEmail.endsWith('"')) clientEmail = clientEmail.substring(1, clientEmail.length - 1);
            if (clientEmail.startsWith("'") && clientEmail.endsWith("'")) clientEmail = clientEmail.substring(1, clientEmail.length - 1);
        }
        if (privateKey) {
            privateKey = privateKey.trim();
            if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.substring(1, privateKey.length - 1);
            if (privateKey.startsWith("'") && privateKey.endsWith("'")) privateKey = privateKey.substring(1, privateKey.length - 1);
            privateKey = privateKey.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey
            })
        });
    } catch (err) {
        console.error("Firebase Admin SDK initialization failed:", err);
    }
}

const db = admin.apps.length ? admin.firestore() : null;
const auth = admin.apps.length ? admin.auth() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST kabul edilir.' });
    }

    if (!db || !auth) {
        return res.status(500).json({ error: 'Firebase Admin SDK baslatilamadi.' });
    }

    // 1. Authorization Kontrolü
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Yetkilendirme basligi eksik veya gecersiz formatta.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;

    try {
        decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
        return res.status(401).json({ error: 'Gecersiz veya suresi dolmus ID Token.', details: err.message });
    }

    const callerUid = decodedToken.uid;

    // 2. Caller Yetki ve Company Kontrolü
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
        return res.status(403).json({ error: 'Bagli oldugunuz bir sirket bulunamadi.' });
    }

    let api = null;
    try {
        // 3. GIB Baglanti Bilgilerini Al
        const docId = callerCompanyId === 'inaner_logistics' ? 'info' : `${callerCompanyId}_info`;
        const companyDoc = await db.collection('company_data').doc(docId).get();
        
        if (!companyDoc.exists) {
            return res.status(404).json({ error: 'Sirket GIB ayarlari bulunamadi.' });
        }

        const companyData = companyDoc.data();
        const gibUsername = companyData.gibUsername;
        const gibPassword = companyData.gibPassword;
        const gibTestMode = companyData.gibTestMode ?? true;

        if (!gibUsername || !gibPassword) {
            return res.status(400).json({ error: 'GIB portal giriş bilgileri (kullanici adi ve sifre) tanimli degil.' });
        }

        // 4. Oturumu Aç
        api = new EInvoiceApi();
        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        await api.initAccessToken();
        
        // Return success
        return res.status(200).json({ success: true, message: "GİB portal oturumu başarıyla sonlandırıldı." });
    } catch (err) {
        console.error("GIB Oturum kapatma hatası:", err);
        
        let errorMessage = err.message || 'GİB oturumu sonlandırılırken hata oluştu.';
        
        if (err.response && err.response.data) {
            const data = err.response.data;
            const messages = data.messages || [];
            
            // Check for multiple login warning
            const hasMultipleLoginMsg = messages.some(msg => {
                const text = typeof msg === 'string' ? msg : (msg && msg.msg) || '';
                return text.toLowerCase().includes('birden fazla') || 
                       text.toLowerCase().includes('ayni anda') || 
                       text.toLowerCase().includes('aynı anda') || 
                       text.toLowerCase().includes('oturum');
            });
            
            if (hasMultipleLoginMsg || data.error === '1') {
                errorMessage = "GİB portalında zaten aktif bir oturum açık olduğu için oturum kapatma servisi giriş yapamadı. Lütfen 1-2 dakika bekleyin, GİB sunucusu oturumu otomatik olarak düşürecektir.";
            } else if (messages.length > 0) {
                errorMessage = messages.map(m => typeof m === 'string' ? m : m.msg).join(' ');
            }
        }
        
        return res.status(500).json({ error: errorMessage });
    } finally {
        if (api) {
            try {
                await api.logout();
            } catch (logoutErr) {
                console.warn("Finally blogunda GIB oturumu kapatilirken hata:", logoutErr.message);
            }
        }
    }
}
