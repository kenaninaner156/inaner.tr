import { db, adminAuth } from '../lib/firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';

export default async function handler(req, res) {
    try {
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
                return res.status(400).json({ error: 'GIB portal bilgileri eksik.' });
            }
            api = new EInvoiceApi();

            api.setCredentials({ username: gibUsername, password: gibPassword });
            api.setTestMode(gibTestMode);
            
            await api.initAccessToken();

            const isSigned = invoiceData.gibStatus === 'Signed' || invoiceData.gibStatus === 'Approved';
            let realUuid = invoiceData.gibUuid;

            let htmlString;
            try {
                htmlString = await api.getInvoiceHtml(realUuid, isSigned, true);
            } catch (err) {
                console.warn("[download-gib-pdf] Direct getInvoiceHtml failed, attempting fallback UUID lookup...", err.message);
                let targetDate;
                if (invoiceData.invoiceDate) targetDate = new Date(invoiceData.invoiceDate);
                else if (invoiceData.date) targetDate = new Date(invoiceData.date);
                else if (invoiceData.endDate) targetDate = new Date(invoiceData.endDate);
                else if (invoiceData.startDate) targetDate = new Date(invoiceData.startDate);
                else if (invoiceData.createdAt) targetDate = new Date(invoiceData.createdAt);
                else targetDate = new Date();

                const today = new Date();
                const searchWindows = [];

                const s1 = new Date(targetDate); s1.setDate(s1.getDate() - 3);
                const e1 = new Date(targetDate); e1.setDate(e1.getDate() + 3);
                searchWindows.push({ start: s1, end: e1 });

                const s2 = new Date(today); s2.setDate(s2.getDate() - 6);
                const e2 = new Date(today);
                searchWindows.push({ start: s2, end: e2 });

                const seenUuids = new Set();
                const drafts = [];

                for (const w of searchWindows) {
                    try {
                        const list = await api.getBasicInvoices({ startDate: w.start, endDate: w.end });
                        for (const d of (list || [])) {
                            if (d.error) continue;
                            const uid = d.uuid || d.ettn;
                            if (uid && !seenUuids.has(uid)) {
                                seenUuids.add(uid);
                                drafts.push(d);
                            }
                        }
                    } catch (_) {}
                }

                const buyerVkn = (invoiceData.buyerVkn || invoiceData.buyer?.taxOrIdentityNumber || invoiceData.taxOrIdentityNumber || '').replace(/\s/g, '').trim();
                let found = drafts.find(d => (d.uuid === realUuid || d.ettn === realUuid));
                if (!found && buyerVkn) {
                    found = drafts.find(d => (d.taxOrIdentityNumber || d.aliciVknTckn || '').replace(/\s/g, '').trim() === buyerVkn);
                }
                if (!found && drafts.length === 1) {
                    found = drafts[0];
                }

                if (found && (found.uuid || found.ettn)) {
                    realUuid = found.uuid || found.ettn;
                    await invoiceRef.update({ gibUuid: realUuid });
                    htmlString = await api.getInvoiceHtml(realUuid, isSigned, true);
                } else {
                    throw err;
                }
            }
            
            try { await api.logout(); } catch (e) {}

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.send(htmlString);
        } catch (err) {
            console.error("GIB PDF indirme hatasi ic blok:", err);
            if (api) {
                try { await api.logout(); } catch (e) {}
            }
            let errorMessage = 'PDF olusturulurken hata olustu. Hata detayi: ' + (err.message || 'Bilinmiyor');
            const gibResponseData = err.data || (err.response && err.response.data);
            if (gibResponseData) {
                const messages = gibResponseData.messages || [];
                if (messages.length > 0) {
                    const rawMsg = messages.map(m => typeof m === 'string' ? m : (m.text || m.mesaj || m.msg)).join('\n');
                    if (rawMsg.includes('Sisteme ayni anda birden fazla giris yapamazsiniz') || rawMsg.includes('Sisteme aynı anda birden fazla giriş yapamazsınız')) {
                        errorMessage = "GİB portalında şu an açık bir oturumunuz bulunuyor (veya önceki işleminizden henüz çıkış yapılmadı). Lütfen arka planda açık GİB sekmeleri varsa kapatıp 1-2 dakika bekledikten sonra tekrar deneyin.";
                    } else {
                        errorMessage = rawMsg;
                    }
                } else {
                    errorMessage = typeof gibResponseData === 'object' ? JSON.stringify(gibResponseData) : gibResponseData;
                }
            }
            return res.status(500).json({ error: errorMessage });
        }
    } catch (globalErr) {
        console.error("GIB PDF GLOBAL HATA:", globalErr);
        return res.status(500).json({ error: 'Kritik sunucu hatasi: ' + globalErr.message });
    }
}
