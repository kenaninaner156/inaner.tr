import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo",
    authDomain: "v2-tir.firebaseapp.com",
    projectId: "v2-tir",
    storageBucket: "v2-tir.firebasestorage.app",
    messagingSenderId: "1000600529147",
    appId: "1:1000600529147:web:526e80325687dc052e285e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function checkTodayData() {
    console.log("Logging in...");
    try {
        await signInWithEmailAndPassword(auth, 'mert@inaner.com', 'Mert0310.');
        console.log("Login successful! Fetching all coordinates for today (June 19)...");
        
        const q = query(
            collection(db, 'truck_routes'),
            where('timestamp', '>=', '2026-06-19T00:00:00.000Z'),
            where('timestamp', '<=', '2026-06-19T23:59:59.999Z'),
            orderBy('timestamp', 'asc')
        );
        
        const snap = await getDocs(q);
        console.log(`Found ${snap.size} records for today.`);
        
        let mockCount = 0;
        let realCount = 0;
        
        snap.forEach(doc => {
            const data = doc.data();
            const isMock = data.lat === 39.9334 && data.lon === 32.8597;
            if (isMock) mockCount++;
            else realCount++;
            
            console.log(`[${isMock ? 'MOCK' : 'REAL'}] ID: ${doc.id} | Driver: ${data.driverId} | TS: ${data.timestamp} | Rec: ${data.recordedAt} | Lat: ${data.lat}, Lon: ${data.lon} | Speed: ${data.speed}`);
        });
        
        console.log(`\nSummary: Mock=${mockCount}, Real=${realCount}`);
    } catch (error) {
        console.error("Error executing query:", error);
    }
}

checkTodayData().catch(console.error);
