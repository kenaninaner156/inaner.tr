const { execSync } = require('child_process');
const envs = {
    "VITE_FIREBASE_API_KEY": "AIzaSyAtrVO1BPABlw-ygqpCeM_Jma1TJ-s2auo",
    "VITE_FIREBASE_AUTH_DOMAIN": "tir-muhasebe.firebaseapp.com",
    "VITE_FIREBASE_PROJECT_ID": "tir-muhasebe",
    "VITE_FIREBASE_STORAGE_BUCKET": "tir-muhasebe.firebasestorage.app",
    "VITE_FIREBASE_MESSAGING_SENDER_ID": "105622311370",
    "VITE_FIREBASE_APP_ID": "1:105622311370:web:d95e154e6a3a06d9817f33",
    "VITE_CLOUDINARY_CLOUD_NAME": "dy3wb2qcs",
    "VITE_CLOUDINARY_UPLOAD_PRESET": "orv2fwiw"
};

for (const [k, v] of Object.entries(envs)) {
    console.log(`Removing ${k}...`);
    try {
        execSync(`npx vercel env rm ${k} production -y`, { stdio: 'ignore' });
    } catch (e) { }

    console.log(`Adding ${k} cleanly...`);
    execSync(`npx vercel env add ${k} production`, { input: v, stdio: 'inherit' });
}
console.log("Done syncing envs.");
