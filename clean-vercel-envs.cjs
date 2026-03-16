const { execSync } = require('child_process');
const keys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_CLOUDINARY_CLOUD_NAME",
    "VITE_CLOUDINARY_UPLOAD_PRESET"
];

for (const k of keys) {
    console.log(`Removing ${k} from Vercel...`);
    try {
        execSync(`npx vercel env rm ${k} production -y`);
    } catch (e) { }
}
console.log("Cleanup done.");
