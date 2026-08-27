import { db, adminAuth } from './firebaseAdmin.js';
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
        
        // GIB portal REJECTS queries larger than 1 month, returning an empty list!
        // We query a safe 28-day window around targetDate.
        let startDate = new Date(targetDate);
        startDate.setDate(startDate.getDate() - 14);
        
        let endDate = new Date(targetDate);
        endDate.setDate(endDate.getDate() + 14);

        let basicInvoice = null;

        // Try direct findBasicInvoice first
        if (invoiceData.gibUuid) {
            try {
                basicInvoice = await api.findBasicInvoice(invoiceData.gibUuid, {
                    startDate: startDate,
                    endDate: endDate
                });
            } catch (findErr) {
                console.warn("[sign-gib-invoice] Direct UUID search failed, attempting fallback resolution...", findErr.message);
            }
        }

        // Fallback: If not found directly, search drafts in targetDate window and current window
        if (!basicInvoice) {
            let drafts = [];
            try {
                drafts = await api.getBasicInvoices({ startDate: startDate, endDate: endDate });
            } catch (dErr) {
                console.warn("[sign-gib-invoice] Error getting drafts around targetDate:", dErr.message);
            }

            // If empty, also try the last 28 days from today
            if (!drafts || drafts.length === 0) {
                try {
                    const today = new Date();
                    const past28 = new Date(today);
                    past28.setDate(past28.getDate() - 28);
                    drafts = await api.getBasicInvoices({ startDate: past28, endDate: today });
                } catch (dErr2) {
                    console.warn("[sign-gib-invoice] Error getting drafts from last 28 days:", dErr2.message);
                }
            }

            if (drafts && drafts.length > 0) {
                // 1. Try matching by UUID (stored gibUuid)
                let found = drafts.find(d => (d.uuid === invoiceData.gibUuid || d.ettn === invoiceData.gibUuid));
                
                // 2. Try matching by Buyer VKN for unapproved drafts
                if (!found) {
                    const buyerVkn = (invoiceData.buyerVkn || invoiceData.buyer?.taxOrIdentityNumber || invoiceData.taxOrIdentityNumber || '').replace(/\s/g, '').trim();
                    if (buyerVkn) {
                        found = [...drafts].reverse().find(d => {
                            const dVkn = (d.taxOrIdentityNumber || d.aliciVknTckn || '').replace(/\s/g, '').trim();
                            const dStatus = d.approvalStatus || d.onayDurumu || '';
                            return dVkn === buyerVkn && (dStatus === 'Onaylanmadı' || dStatus.toLowerCase().includes('onaylanma'));
                        });
                    }
                }

                // 3. If there is only one unapproved draft in total, pick it
                if (!found) {
                    const unapprovedDrafts = drafts.filter(d => {
                        const dStatus = d.approvalStatus || d.onayDurumu || '';
                        return dStatus === 'Onaylanmadı' || dStatus.toLowerCase().includes('onaylanma');
                    });
                    if (unapprovedDrafts.length === 1) {
                        found = unapprovedDrafts[0];
                    }
                }

                if (found) {
                    basicInvoice = found;
                    const realUuid = found.uuid || found.ettn;
                    if (realUuid && realUuid !== invoiceData.gibUuid) {
                        console.log(`[sign-gib-invoice] Successfully recovered real UUID: ${realUuid}`);
                        await invoiceRef.update({ gibUuid: realUuid });
                    }
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
