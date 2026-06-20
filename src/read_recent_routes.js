import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, getDocs, orderBy } from 'firebase/firestore';
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

async function checkRecentData() {
    console.log("Logging in as mert@inaner.com...");
    try {
        await signInWithEmailAndPassword(auth, 'mert@inaner.com', 'Mert0310.');
        console.log("Login successful! Fetching last 5 location records...");
        
        // Single-field ordering does NOT require composite index
        const q = query(
            collection(db, 'truck_routes'),
            orderBy('timestamp', 'desc'),
            limit(5)
        );
        
        const snap = await getDocs(q);
        console.log(`Query returned ${snap.size} records.`);
        if (snap.size === 0) {
            console.log("No coordinates found in truck_routes collection at all!");
        } else {
            snap.forEach(doc => {
                const data = doc.data();
                console.log(`Document ID: ${doc.id}`);
                console.log(`- Driver ID: ${data.driverId || data.deviceId}`);
                console.log(`- Timestamp: ${data.timestamp}`);
                console.log(`- RecordedAt: ${data.recordedAt}`);
                console.log(`- Coordinates: ${data.lat}, ${data.lon}`);
                console.log(`- Speed: ${data.speed}`);
                console.log("------------------------");
            });
        }
    } catch (error) {
        console.error("Error executing query:", error);
    }
}

checkRecentData().catch(console.error);
