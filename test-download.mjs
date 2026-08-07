import handler from './api/download-gib-pdf.js';
import { adminAuth, db } from './api/firebaseAdmin.js';

(async () => {
    const req = {
        method: 'GET',
        query: { invoiceId: 'SkrZ5sYxY5RdaCBMtyKh' },
        headers: { authorization: 'Bearer FAKE_TOKEN' }
    };
    const res = {
        status: (code) => { console.log('STATUS:', code); return res; },
        json: (data) => { console.log('JSON:', data); return res; },
        setHeader: (k,v) => { console.log('HEADER:', k, v); return res; },
        send: (d) => { console.log('SEND:', d.substring(0, 100)); return res; }
    };
    
    // Mock verifyIdToken
    adminAuth.verifyIdToken = async () => ({ uid: 'L05x2H8eU3Wq8P2HlFm1lS2t8Jb2' }); // Kenan's real UID? Let's just use any string that exists in approved_users
    
    // Actually, I don't need to mock it if I just bypass it, but let's mock it
    const origVerify = adminAuth.verifyIdToken;
    adminAuth.verifyIdToken = async () => {
        // Find a real user in DB
        const users = await db.collection('approved_users').limit(1).get();
        if (!users.empty) return { uid: users.docs[0].id };
        return { uid: 'fake_uid' };
    };

    try {
        await handler(req, res);
    } catch(e) {
        console.error("UNHANDLED EXCEPTION IN HANDLER:", e);
    }
})();
