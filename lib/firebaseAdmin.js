import admin from 'firebase-admin';
import fs from 'fs';

// Initialize Firebase Admin SDK (Single Instance Check)
if (!admin.apps.length) {
    try {
        let projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        // Vercel raw JSON service account support
        if (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
            try {
                const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
                const fbData = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
                projectId = fbData.project_id || projectId;
                clientEmail = fbData.client_email || clientEmail;
                privateKey = fbData.private_key || privateKey;
            } catch (e) {
                console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env:", e);
            }
        }

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
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
        console.error("Firebase Admin SDK initialization error:", error);
    }
}

export const db = admin.firestore();
export const adminAuth = admin.auth();
