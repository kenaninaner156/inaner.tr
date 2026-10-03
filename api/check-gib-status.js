/* eslint-env node */
import { db } from '../lib/firebaseAdmin.js';
import { EInvoiceApi } from 'e-fatura';

export default async function handler(req, res) {
    const startTime = Date.now();
    try {
        let username = req.body?.gibUsername || req.query?.gibUsername;
        let password = req.body?.gibPassword || req.query?.gibPassword;
        let testMode = req.body?.gibTestMode !== undefined ? req.body.gibTestMode : (req.query?.gibTestMode !== undefined ? req.query.gibTestMode === 'true' : undefined);

        if (!username || !password) {
            if (db) {
                try {
                    const docId = 'info';
                    const companyDoc = await db.collection('company_data').doc(docId).get();
                    const data = companyDoc.exists ? companyDoc.data() : {};
                    username = username || data.gibUsername;
                    password = password || data.gibPassword;
                    if (testMode === undefined) testMode = data.gibTestMode ?? false;
                } catch (dbErr) {
                    console.warn("Db fallback error:", dbErr.message);
                }
            }
        }
        if (testMode === undefined) testMode = false;

        if (!username || !password) {
            return res.json({
                success: true,
                status: 'unconfigured',
                message: 'GİB Giriş Bilgileri Yapılandırılmadı',
                latencyMs: 0,
                testMode: false
            });
        }

        let api = new EInvoiceApi();
        api.setCredentials({ username, password });
        api.setTestMode(testMode);

        // Quick login token handshake with timeout
        await api.initAccessToken();
        const latencyMs = Date.now() - startTime;

        let healthStatus = 'optimal'; // 🟢 Aktif (< 2.5s)
        if (latencyMs > 3500) {
            healthStatus = 'slow'; // 🟡 Yoğun / Gecikmeli (> 3.5s)
        }

        // Anında oturumu kapat (Arkada açık oturum bırakmamak için)
        try {
            await api.logout();
        } catch (_) {}

        return res.json({
            success: true,
            status: healthStatus,
            message: healthStatus === 'optimal' ? 'GİB Servisi Aktif' : 'GİB Servisinde Yoğunluk Var',
            latencyMs,
            testMode,
            lastChecked: new Date().toISOString()
        });
    } catch (err) {
        const latencyMs = Date.now() - startTime;
        return res.json({
            success: false,
            status: 'down', // 🔴 Kapalı / Yanıt Vermiyor
            message: 'GİB Servisleri Yanıt Vermiyor (Yoğun / Bakımda)',
            error: err.message,
            latencyMs,
            lastChecked: new Date().toISOString()
        });
    }
}
