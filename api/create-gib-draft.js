/* eslint-env node */
import admin from 'firebase-admin';
import fs from 'fs';
import { EInvoiceApi, EInvoiceCurrencyType, EInvoiceCountry, EInvoiceUnitType, InvoiceType } from 'e-fatura';

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

        // Clean and sanitize inputs to prevent quote wrapping issues from Vercel settings
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
        return res.status(500).json({ error: 'Firebase Admin SDK baslatilamadi. Lütfen credentials ayarlarini kontrol edin.' });
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
        return res.status(403).json({ error: 'Bagli oldugunuz bir sirket bulunamadi. Islem yapilamaz.' });
    }

    const { 
        invoiceId, 
        invoiceType = 'SATIS',
        buyer, 
        vatRate = 20, 
        isVatIncluded = false, 
        tevkifatKodu = null,
        tevkifatRate = 0,
        kdvMuafiyetKodu = null,
        kdvMuafiyetNedeni = null,
        note = '',
        date = null
    } = req.body;

    if (!invoiceId || !buyer || !buyer.taxOrIdentityNumber || !buyer.buyerTitle) {
        return res.status(400).json({ error: 'Gecersiz istek parametreleri. Fatura ID ve Alici bilgileri (VKN, Unvan) zorunludur.' });
    }

    let api = null;
    try {
        // 3. Faturayi Veritabanindan Cek
        const invoiceDoc = await db.collection('invoices').doc(invoiceId).get();
        if (!invoiceDoc.exists) {
            return res.status(404).json({ error: 'Fatura bulunamadi.' });
        }

        const invoiceData = invoiceDoc.data();

        // Sirket eslesme kontrolü (SaaS Güvenlik Bariyeri)
        if (invoiceData.companyId !== callerCompanyId) {
            return res.status(403).json({ error: 'Bu faturayi gondermeye yetkiniz bulunmamaktadir.' });
        }

        // 4. Sirketin GIB Ayarlarini Firestore'dan Cek
        const companySettingsDocId = callerCompanyId === 'inaner_logistics' ? 'info' : `${callerCompanyId}_info`;
        const settingsDoc = await db.collection('company_data').doc(companySettingsDocId).get();
        if (!settingsDoc.exists) {
            return res.status(400).json({ error: 'Sirket GIB ayarlari bulunamadi. Lütfen baglanti ayarlarini tamamlayin.' });
        }

        const settingsData = settingsDoc.data();
        const { gibUsername, gibPassword, gibTestMode = true } = settingsData;

        if (!gibUsername || !gibPassword) {
            return res.status(400).json({ error: 'GIB portal giris bilgileri (Kullanici adi, sifre) eksik.' });
        }

        // 5. Matematiksel Tutar ve KDV Hesaplamalari
        const grandTotal = Number(invoiceData.grandTotal) || 0;
        const rate = invoiceType === 'ISTISNA' ? 0 : Number(vatRate);
        const tRate = invoiceType === 'TEVKIFAT' ? Number(tevkifatRate) : 0;

        let basePrice = 0;
        let vatAmount = 0;
        let vatAmountOfTax = 0;
        let includedTaxesTotalPrice = 0;
        let paymentPrice = 0;
        let products = [];

        if (req.body.products && Array.isArray(req.body.products) && req.body.products.length > 0) {
            products = req.body.products.map(p => {
                const lineBase = Number(p.price) || 0;
                const lineVat = Number(p.vatAmount) || 0;
                const lineVatOfTax = invoiceType === 'TEVKIFAT' ? (Number(p.vatAmountOfTax) || 0) : 0;
                const lineTotal = Number(p.totalAmount) || 0;

                basePrice += lineBase;
                vatAmount += lineVat;
                vatAmountOfTax += lineVatOfTax;
                includedTaxesTotalPrice += lineTotal;

                const qty = Number(p.quantity) || 1;
                const calculatedUnitPrice = isVatIncluded 
                    ? Number((lineBase / qty).toFixed(6)) 
                    : (Number(p.unitPrice) || 0);

                const productLine = {
                    name: p.name.trim(),
                    quantity: qty,
                    unitType: p.unitType || EInvoiceUnitType.TON, // TON -> TNE
                    unitPrice: calculatedUnitPrice,
                    price: lineBase,
                    vatRate: Number(p.vatRate) ?? rate,
                    vatAmount: lineVat,
                    totalAmount: lineTotal
                };

                if (invoiceType === 'TEVKIFAT') {
                    productLine.tevkifatKodu = tevkifatKodu;
                    productLine.taxRate = Number(tevkifatRate); // vergiOrani
                    productLine.vatAmountOfTax = lineVatOfTax; // vergininKdvTutari
                    productLine.V9015Orani = Number(tevkifatRate);
                    productLine.V9015Tutari = lineVatOfTax;
                } else if (invoiceType === 'ISTISNA') {
                    productLine.kdvMuafiyetKodu = kdvMuafiyetKodu;
                    productLine.kdvMuafiyetNedeni = kdvMuafiyetNedeni;
                }

                return productLine;
            });

            // Round values to 2 decimal places to prevent float precision issues
            basePrice = Number(basePrice.toFixed(2));
            vatAmount = Number(vatAmount.toFixed(2));
            vatAmountOfTax = Number(vatAmountOfTax.toFixed(2));
            includedTaxesTotalPrice = Number(includedTaxesTotalPrice.toFixed(2));
            paymentPrice = Number((includedTaxesTotalPrice - vatAmountOfTax).toFixed(2));
        } else {
            if (invoiceType === 'ISTISNA') {
                basePrice = grandTotal;
                vatAmount = 0;
                vatAmountOfTax = 0;
                includedTaxesTotalPrice = grandTotal;
                paymentPrice = grandTotal;
            } else {
                if (isVatIncluded) {
                    paymentPrice = grandTotal;
                    basePrice = Number((paymentPrice / (1 + (rate / 100) * (1 - tRate / 100))).toFixed(2));
                    vatAmount = Number((basePrice * (rate / 100)).toFixed(2));
                    vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
                    includedTaxesTotalPrice = Number((basePrice + vatAmount).toFixed(2));
                    // Adjust paymentPrice to match exact totals
                    paymentPrice = Number((basePrice + vatAmount - vatAmountOfTax).toFixed(2));
                } else {
                    basePrice = grandTotal;
                    vatAmount = Number((basePrice * (rate / 100)).toFixed(2));
                    vatAmountOfTax = invoiceType === 'TEVKIFAT' ? Number((vatAmount * (tRate / 100)).toFixed(2)) : 0;
                    includedTaxesTotalPrice = Number((basePrice + vatAmount).toFixed(2));
                    paymentPrice = Number((basePrice + vatAmount - vatAmountOfTax).toFixed(2));
                }
            }

            const productLine = {
                name: 'NAKLIYE HIZMET BEDELI',
                quantity: 1,
                unitType: EInvoiceUnitType.ADET,
                unitPrice: basePrice,
                price: basePrice,
                vatRate: rate,
                vatAmount: vatAmount,
                totalAmount: includedTaxesTotalPrice
            };

            if (invoiceType === 'TEVKIFAT') {
                productLine.tevkifatKodu = tevkifatKodu;
                productLine.taxRate = Number(tRate); // vergiOrani
                productLine.vatAmountOfTax = vatAmountOfTax; // vergininKdvTutari
                productLine.V9015Orani = Number(tRate);
                productLine.V9015Tutari = vatAmountOfTax;
            } else if (invoiceType === 'ISTISNA') {
                productLine.kdvMuafiyetKodu = kdvMuafiyetKodu;
                productLine.kdvMuafiyetNedeni = kdvMuafiyetNedeni;
            }

            products = [productLine];
        }

        // 6. GIB e-Arsiv Fatura Payload Hazirlama
        // Plaka bilgisini not kısmına eklemek için arac plakasini bulalim
        let plateText = '';
        if (invoiceData.truckId) {
            const truckDoc = await db.collection('trucks').doc(invoiceData.truckId).get();
            if (truckDoc.exists) {
                plateText = truckDoc.data().plate || '';
            }
        }

        const defaultNote = `${plateText ? plateText + ' plakali arac ile ' : ''}${invoiceData.startDate} - ${invoiceData.endDate} tarihleri arasinda sunulan nakliye hizmet bedelidir.`;
        const finalNote = (note !== undefined && note !== null && note.trim() !== '') ? note.trim() : defaultNote;

        // Map invoiceType to e-fatura InvoiceType Enum
        let invoiceTypeEnum = InvoiceType.SATIS;
        if (invoiceType === 'TEVKIFAT') {
            invoiceTypeEnum = InvoiceType.TEVKIFAT;
        } else if (invoiceType === 'ISTISNA') {
            invoiceTypeEnum = InvoiceType.ISTISNA;
        }

        const gibPayload = {
            currency: EInvoiceCurrencyType.TURK_LIRASI,
            ...(date && { date }), // Add date if provided
            invoiceType: invoiceTypeEnum,
            whichType: '5000/30000',
            taxOrIdentityNumber: buyer.taxOrIdentityNumber.trim(),
            buyerTitle: buyer.buyerTitle.trim(),
            buyerFirstName: buyer.buyerFirstName ? buyer.buyerFirstName.trim() : '',
            buyerLastName: buyer.buyerLastName ? buyer.buyerLastName.trim() : '',
            taxOffice: buyer.taxOffice ? buyer.taxOffice.trim() : ' ',
            fullAddress: buyer.fullAddress ? buyer.fullAddress.trim() : ' ',
            city: buyer.city ? buyer.city.trim() : ' ',
            district: buyer.district ? buyer.district.trim() : ' ',
            country: EInvoiceCountry.TURKIYE,
            products: products,
            base: basePrice,
            productsTotalPrice: basePrice,
            calculatedVAT: vatAmount,
            includedTaxesTotalPrice: includedTaxesTotalPrice,
            paymentPrice: paymentPrice,
            note: finalNote
        };

        // 7. GIB Portal Baglantisi ve Taslak Fatura Olusturma
        api = new EInvoiceApi();
        
        // Intercept sendRequest to empty out the faturaUuid due to GİB's May 2026 API changes
        const originalSendRequest = api.sendRequest;
        api.sendRequest = async function(url, params, config) {
            const isCreateInvoice = params && params.cmd === 'EARSIV_PORTAL_FATURA_OLUSTUR';
            if (isCreateInvoice && params.jp) {
                try {
                    const jpObj = JSON.parse(params.jp);
                    jpObj.faturaUuid = ""; // MUST BE EMPTY STRING for GİB's latest May 2026 API update!
                    params.jp = JSON.stringify(jpObj);
                } catch (err) {
                    console.error("[Hook] Hata:", err);
                }
            }
            return originalSendRequest.call(this, url, params, config);
        };

        api.setCredentials({ username: gibUsername, password: gibPassword });
        api.setTestMode(gibTestMode);
        
        await api.initAccessToken();

        const gibUuid = await api.createDraftInvoice(gibPayload);

        // 8. Fatura Belgesini Firestore'da Guncelle
        await db.collection('invoices').doc(invoiceId).update({
            gibUuid: gibUuid,
            gibStatus: 'Draft',
            gibStatusDate: new Date().toISOString(),
            gibTestMode: gibTestMode
        });

        // 9. GIB Oturumunu Kapat - res.json()'dan ONCE yapilmali!
        try {
            await api.logout();
            console.log("GIB oturumu guvenli bir sekilde sonlandirildi.");
        } catch (logoutErr) {
            console.warn("GIB oturumu sonlandirilirken hata olustu:", logoutErr.message);
        }

        // 10. Sonuc Don
        return res.status(200).json({ success: true, gibUuid });
    } catch (err) {
        console.error("GIB Entegrasyon hatasi:", err);
        
        // Hata durumunda da oturumu kapatmaya calis
        if (api) {
            try {
                await api.logout();
                console.log("GIB oturumu hata sonrasi kapatildi.");
            } catch (logoutErr) {
                console.warn("GIB oturumu hata sonrasi kapatilirken sorun:", logoutErr.message);
            }
        }
        
        let errorMessage = err.message || 'GIB e-Arsiv islemi sirasinda sunucu hatasi olustu.';
        
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
            
            if (hasMultipleLoginMsg) {
                errorMessage = "GİB e-Arşiv sisteminde aktif bir oturumunuz açık bulunuyor (örneğin tarayıcınızda veya başka bir cihazda). Lütfen diğer oturumu kapatıp 1-2 dakika bekledikten sonra tekrar deneyin.";
            } else if (messages.length > 0) {
                errorMessage = messages.map(m => typeof m === 'string' ? m : m.msg).join(' ');
            }
        }
        
        return res.status(500).json({ error: errorMessage });
    }
}
