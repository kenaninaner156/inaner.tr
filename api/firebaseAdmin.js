import admin from 'firebase-admin';
import fs from 'fs';

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

        if (privateKey) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        } else {
            console.warn("FIREBASE_PRIVATE_KEY is missing. Admin SDK initialization may fail.");
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
