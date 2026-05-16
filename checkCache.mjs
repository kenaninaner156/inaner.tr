import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo",
    authDomain: "v2-tir.firebaseapp.com",
    projectId: "v2-tir",
    storageBucket: "v2-tir.firebasestorage.app",
    messagingSenderId: "1000600529147",
    appId: "1:1000600529147:web:526e80325687dc052e285e",
    measurementId: "G-Q68SX8GZEE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkCache() {
    console.log("Fetching vehicle_daily_stats...");
    try {
        const querySnapshot = await getDocs(collection(db, "vehicle_daily_stats"));
        if (querySnapshot.empty) {
            console.log("No caches found in vehicle_daily_stats.");
            return;
        }
        
        console.log(`Found ${querySnapshot.size} cached days!`);
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = data.date;
            const device = data.deviceId;
            // Parse sessionsJson to find number of sessions
            let numSessions = 0;
            if (data.sessionsJson) {
                try {
                    const parsed = JSON.parse(data.sessionsJson);
                    numSessions = parsed.length;
                } catch (e) {
                    numSessions = "invalid JSON";
                }
            }
            console.log(`- Document ID: ${doc.id}`);
            console.log(`  Date: ${date}, Device: ${device}, Sessions: ${numSessions}, Calculated At: ${data.calculatedAt}`);
        });
    } catch (e) {
        console.error("Error fetching data:", e);
    }
    process.exit(0);
}

checkCache();
