import { db, adminAuth } from '../lib/firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';

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

        // 3. Find BasicInvoice
        // Determine target date from invoiceDate, date, endDate, startDate, or createdAt
        let targetDate;
        if (invoiceData.invoiceDate) {
            targetDate = new Date(invoiceData.invoiceDate);
        } else if (invoiceData.date) {
            targetDate = new Date(invoiceData.date);
        } else if (invoiceData.endDate) {
            targetDate = new Date(invoiceData.endDate);
        } else if (invoiceData.startDate) {
            targetDate = new Date(invoiceData.startDate);
        } else if (invoiceData.createdAt) {
            targetDate = new Date(invoiceData.createdAt);
        } else {
            targetDate = new Date();
        }
        
        // 3. Find BasicInvoice
        // GİB portalı 7 günden uzun tarih aralıklarını 'Seçilen tarih aralığı 7 günden fazla olamaz!' hatası ile reddeder.
        // Bu nedenle güvenli 6 günlük pencereler halinde arama yapıyoruz.
        const searchWindows = [];
        const tDate = new Date(targetDate);
        const today = new Date();

        // 1. targetDate etrafında 6 günlük pencere (-3 gün, +3 gün)
        const s1 = new Date(tDate); s1.setDate(s1.getDate() - 3);
        const e1 = new Date(tDate); e1.setDate(e1.getDate() + 3);
        searchWindows.push({ start: s1, end: e1 });

        // 2. Bugün etrafında 6 günlük pencere (-6 gün, bugün)
        const s2 = new Date(today); s2.setDate(s2.getDate() - 6);
        const e2 = new Date(today);
        searchWindows.push({ start: s2, end: e2 });

        // 3. targetDate öncesi 6 günlük pencere (-9 gün, -3 gün)
        const s3 = new Date(tDate); s3.setDate(s3.getDate() - 9);
        const e3 = new Date(tDate); e3.setDate(e3.getDate() - 3);
        searchWindows.push({ start: s3, end: e3 });

        // 4. targetDate sonrası 6 günlük pencere (+3 gün, +9 gün)
        const s4 = new Date(tDate); s4.setDate(s4.getDate() + 3);
        const e4 = new Date(tDate); e4.setDate(e4.getDate() + 9);
        searchWindows.push({ start: s4, end: e4 });

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
            } catch (err) {
                console.warn("[sign-gib-invoice] Window search error:", err.message);
            }
        }

        let basicInvoice = null;

        if (drafts.length > 0) {
            // 1. UUID eşleşmesi (Doğrudan saklanan gibUuid)
            if (invoiceData.gibUuid) {
                basicInvoice = drafts.find(d => (d.uuid === invoiceData.gibUuid || d.ettn === invoiceData.gibUuid));
            }
            
            // 2. Alıcı VKN eşleşmesi (Onaylanmamış taslaklar arasından)
            if (!basicInvoice) {
                const buyerVkn = (invoiceData.buyerVkn || invoiceData.buyer?.taxOrIdentityNumber || invoiceData.taxOrIdentityNumber || '').replace(/\s/g, '').trim();
                if (buyerVkn) {
                    basicInvoice = [...drafts].reverse().find(d => {
                        const dVkn = (d.taxOrIdentityNumber || d.aliciVknTckn || '').replace(/\s/g, '').trim();
                        const dStatus = d.approvalStatus || d.onayDurumu || '';
                        return dVkn === buyerVkn && (dStatus === 'Onaylanmadı' || dStatus.toLowerCase().includes('onaylanma'));
                    });
                }
            }

            // 3. Sistemde onaylanmamış tek taslak varsa seç
            if (!basicInvoice) {
                const unapprovedDrafts = drafts.filter(d => {
                    const dStatus = d.approvalStatus || d.onayDurumu || '';
                    return dStatus === 'Onaylanmadı' || dStatus.toLowerCase().includes('onaylanma');
                });
                if (unapprovedDrafts.length === 1) {
                    basicInvoice = unapprovedDrafts[0];
                }
            }

            if (basicInvoice) {
                const realUuid = basicInvoice.uuid || basicInvoice.ettn;
                if (realUuid && realUuid !== invoiceData.gibUuid) {
                    console.log(`[sign-gib-invoice] Successfully recovered real UUID: ${realUuid}`);
                    await invoiceRef.update({ gibUuid: realUuid });
                }
            }
        }

        if (!basicInvoice) {
            throw new Error("GİB portalında onaylanacak taslak fatura bulunamadı. Lütfen faturanın GİB portalında mevcut olduğundan ve henüz onaylanmadığından emin olun.");
        }

        // 4. Sign Invoice
        const signed = await api.signInvoices(code, oid, basicInvoice);
        
        if (!signed) {
            throw new Error("Fatura imzalama islemi basarisiz oldu. SMS kodu yanlis olabilir.");
        }

        // 5. Update DB Status & Auto-attach official invoice document
        const updatePayload = {
            gibStatus: 'Signed',
            gibStatusDate: new Date().toISOString()
        };

        let gibAmount = 0;
        const rawAmount = basicInvoice?.odenecekTutar || basicInvoice?.vergilerDahilToplam || basicInvoice?.toplamTutar || basicInvoice?.amount;
        if (typeof rawAmount === 'number') {
            gibAmount = rawAmount;
        } else if (typeof rawAmount === 'string') {
            gibAmount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.')) || parseFloat(rawAmount) || 0;
        }
        if (gibAmount > 0 && (!invoiceData.grandTotal || Number(invoiceData.grandTotal) <= 0)) {
            updatePayload.grandTotal = gibAmount;
        }

        try {
            const htmlString = await api.getInvoiceHtml(uuid, true, false);
            if (htmlString) {
                const currentFiles = invoiceData.files || [];
                const docNumber = basicInvoice.documentNumber || basicInvoice.belgeNumarasi || invoiceData.invoiceNo || 'GIB';
                const base64Data = 'data:text/html;charset=utf-8;base64,' + Buffer.from(htmlString).toString('base64');
                const officialFile = {
                    id: Date.now(),
                    name: `${docNumber}_e-Arsiv.html`,
                    type: 'text/html',
                    size: Buffer.byteLength(htmlString, 'utf8'),
                    data: base64Data
                };
                updatePayload.files = [...currentFiles, officialFile];
            }
        } catch (fetchErr) {
            console.warn("[sign-gib-invoice] Auto-attach official invoice failed:", fetchErr.message);
        }

        await invoiceRef.update(updatePayload);

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
