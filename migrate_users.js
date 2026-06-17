import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDZBOiVMPCQEiGxvJ1SIbFIxpfr1xIHoYo",
    authDomain: "v2-tir.firebaseapp.com",
    projectId: "v2-tir",
    storageBucket: "v2-tir.firebasestorage.app",
    messagingSenderId: "1000600529147",
    appId: "1:1000600529147:web:526e80325687dc052e285e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function migrateUsers() {
    console.log("Kullanıcı taşıma işlemi (Migration) Native SDK ile başlıyor...");
    
    const approvedUsersSnap = await getDocs(collection(db, 'approved_users'));
    let successCount = 0;
    
    for (const userDoc of approvedUsersSnap.docs) {
        const data = userDoc.data();
        if (!data.username || !data.password) {
            console.log(`- Atlanıyor (Kullanıcı adı veya şifre yok): ${userDoc.id}`);
            continue;
        }

        const email = `${data.username.toLowerCase().replace(/[^a-z0-9]/g, '')}@inaner.com`;
        
        // Şifre çözme
        let plainPassword = data.password;
        try {
            const decoded = Buffer.from(plainPassword, 'base64').toString('utf8');
            if (decoded && decoded.length > 3 && /^[ -~]+$/.test(decoded)) {
                if (plainPassword.endsWith('=') || /^[A-Za-z0-9+/]+={0,2}$/.test(plainPassword)) {
                    plainPassword = decoded;
                }
            }
        } catch(e) {}
        
        if (plainPassword.length < 6) {
            plainPassword = plainPassword + "123";
        }

        try {
            let user;
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, plainPassword);
                user = userCredential.user;
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') {
                    // Try to sign in to fetch their UID
                    const userCredential = await signInWithEmailAndPassword(auth, email, plainPassword);
                    user = userCredential.user;
                } else {
                    throw error;
                }
            }
            
            // approved_users dökümanını UID'si ile oluştur
            await setDoc(doc(db, 'approved_users', user.uid), {
                username: data.username.toLowerCase(),
                authEmail: email,
                role: data.role || 'şoför',
                companyId: data.companyId || null,
                createdAt: data.createdAt || new Date().toISOString(),
                status: 'approved'
            });

            // Eğer döküman ID'si ile UID uyuşmuyorsa eski dökümanı sil (UID'ye taşındı)
            if (userDoc.id !== user.uid) {
                await deleteDoc(doc(db, 'approved_users', userDoc.id));
            }

            console.log(`+ Başarılı: ${data.username} taşındı. (UID: ${user.uid})`);
            successCount++;
        } catch (error) {
            console.log(`- Hata (${data.username}): ${error.message} (${error.code})`);
        }
    }
    
    // Super Admin (Kenan)
    try {
        const email = 'kenan@inaner.com';
        const password = 'Mert0310.';
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log(`+ Başarılı: SUPER_ADMIN (kenan) taşındı. (UID: ${userCredential.user.uid})`);
    } catch(error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log(`- Zaten kayıtlı: SUPER_ADMIN`);
        } else {
            console.log(`- Hata (kenan): ${error.message}`);
        }
    }

    console.log(`\n🎉 İşlem tamamlandı. ${successCount} kullanıcı taşındı.`);
    process.exit(0);
}

migrateUsers();
