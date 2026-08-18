/* eslint-env node */
import admin from 'firebase-admin';
import fs from 'fs';

// Firebase Admin SDK'yı başlatıyoruz (Tek seferlik)
if (!admin.apps.length) {
    try {
        let projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;

        // Yerel geliştirme için masaüstündeki JSON yedek kimlik bilgisi kontrolü
        const localJsonPath = "C:/Users/kenan/Desktop/tr/v2-tir-firebase-adminsdk-fbsvc-7c846d0b8b.json";
        if ((!privateKey || !clientEmail) && fs.existsSync(localJsonPath)) {
            try {
                const fbData = JSON.parse(fs.readFileSync(localJsonPath, 'utf-8'));
                projectId = fbData.project_id;
                clientEmail = fbData.client_email;
                privateKey = fbData.private_key;
                console.log("Firebase Admin SDK yerel JSON dosyasından başarıyla yapılandırıldı.");
            } catch (jsonErr) {
                console.error("Yerel Firebase JSON dosyası okunurken hata:", jsonErr);
            }
        }

        if (!privateKey || !clientEmail) {
            console.warn("Firebase Admin kimlik bilgileri (FIREBASE_PRIVATE_KEY veya FIREBASE_CLIENT_EMAIL) eksik. Admin fonksiyonları çalışmayacaktır.");
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey: privateKey ? privateKey.replace(/\\n/g, '\n') : undefined
            })
        });
    } catch (err) {
        console.error("Firebase Admin SDK başlatılamadı:", err);
    }
}

const db = admin.apps.length ? admin.firestore() : null;
const auth = admin.apps.length ? admin.auth() : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST kabul edilir.' });
    }

    if (!db || !auth) {
        return res.status(500).json({ error: 'Firebase Admin SDK yapılandırılmamış. Lütfen Vercel panelinden FIREBASE_PRIVATE_KEY ve FIREBASE_CLIENT_EMAIL değerlerini girin.' });
    }

    // 1. Authorization Header Kontrolü (Caller ID Token)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header eksik veya geçersiz formatta.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;

    try {
        decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
        return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş ID Token.', details: err.message });
    }

    const callerUid = decodedToken.uid;
    const callerEmail = decodedToken.email;

    // 2. Caller Yetki Kontrolü
    let callerRole = 'user';
    let callerCompanyId = null;

    // Kenan kullanıcısı için varsayılan olarak super_admin ataması yapıyoruz (Acil Durum Fallback)
    const isSuperAdminFallback = callerEmail === 'kenan@inaner.com' || callerEmail === 'admin@inaner.com';

    try {
        const callerDoc = await db.collection('approved_users').doc(callerUid).get();
        if (callerDoc.exists) {
            const data = callerDoc.data();
            callerRole = data.role || 'user';
            callerCompanyId = data.companyId || null;
        } else if (isSuperAdminFallback) {
            callerRole = 'super_admin';
        } else {
            return res.status(403).json({ error: 'Kullanıcı kaydınız onaylı kullanıcılar arasında bulunamadı.' });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Kullanıcı yetkisi kontrol edilirken hata oluştu.', details: err.message });
    }

    const { action, payload } = req.body;

    if (!action) {
        return res.status(400).json({ error: 'Eylem (action) belirtilmemiş.' });
    }

    try {
        switch (action) {
            case 'createUser': {
                // Genel kullanıcı oluşturma (Super Admin veya ilgili Şirketin Yöneticisi)
                const { username, password, role, companyId } = payload;
                if (!username || !password || !role || !companyId) {
                    return res.status(400).json({ error: 'Eksik parametreler: username, password, role ve companyId zorunludur.' });
                }

                const targetCompanyId = companyId;

                // Yetki Denetimi:
                // Super Admin her rolü ve her şirkete kullanıcı oluşturabilir.
                // Company Admin sadece kendi şirketine şoför/user oluşturabilir (başka yöneticiler veya super_admin oluşturamaz).
                if (callerRole !== 'super_admin' && (callerRole !== 'company_admin' || callerCompanyId !== targetCompanyId || role === 'company_admin' || role === 'super_admin')) {
                    return res.status(403).json({ error: 'Bu kullanıcıyı oluşturmak veya bu role atamak için yetkiniz yok.' });
                }

                const uname = username.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
                const email = `${uname}@inaner.com`;

                // Firebase Auth kullanıcısı oluştur
                const userRecord = await auth.createUser({
                    email,
                    password,
                    displayName: username
                });

                // approved_users koleksiyonuna UID'yi döküman kimliği yaparak yaz (şifreyi Firestore'a yazmıyoruz)
                await db.collection('approved_users').doc(userRecord.uid).set({
                    username: uname,
                    authEmail: email,
                    role,
                    companyId: targetCompanyId,
                    createdAt: new Date().toISOString(),
                    status: 'approved'
                });

                return res.status(200).json({ success: true, uid: userRecord.uid });
            }

            case 'approveUser': {
                // Bekleyen kullanıcıyı onaylama (Super Admin veya ilgili Şirketin Yöneticisi)
                const { uid, role, assignedCompanyId } = payload;
                if (!uid || !role) {
                    return res.status(400).json({ error: 'Eksik parametreler: uid ve role zorunludur.' });
                }

                // Bekleyen kullanıcıyı Firestore'dan çek
                const pendingDocRef = db.collection('pending_users').doc(uid);
                const pendingSnapshot = await pendingDocRef.get();
                if (!pendingSnapshot.exists) {
                    return res.status(404).json({ error: 'Onaylanacak bekleyen kullanıcı bulunamadı.' });
                }

                const pendingData = pendingSnapshot.data();
                const targetCompanyId = assignedCompanyId || pendingData.companyId || callerCompanyId;

                // Yetki Denetimi: Super Admin değilse ve kendi şirketinden değilse reddet
                if (callerRole !== 'super_admin' && (callerRole !== 'company_admin' || callerCompanyId !== targetCompanyId)) {
                    return res.status(403).json({ error: 'Bu kullanıcıyı onaylamak için yetkiniz yok.' });
                }

                const email = `${pendingData.username}@inaner.com`;

                // approved_users koleksiyonuna UID ile kaydet
                await db.collection('approved_users').doc(uid).set({
                    username: pendingData.username,
                    firstName: pendingData.firstName || '',
                    lastName: pendingData.lastName || '',
                    fullName: pendingData.fullName || `${pendingData.firstName || ''} ${pendingData.lastName || ''}`.trim() || pendingData.username,
                    authEmail: email,
                    role,
                    companyId: targetCompanyId,
                    approvedAt: new Date().toISOString(),
                    status: 'approved'
                });

                // pending_users'tan sil
                await pendingDocRef.delete();

                return res.status(200).json({ success: true });
            }

            case 'updateUserPassword': {
                // Şifre güncelleme (Super Admin veya ilgili Şirketin Yöneticisi)
                const { uid, newPassword } = payload;
                if (!uid || !newPassword) {
                    return res.status(400).json({ error: 'Eksik parametreler: uid ve newPassword zorunludur.' });
                }

                if (newPassword.length < 6) {
                    return res.status(400).json({ error: 'Şifre en az 6 karakterden oluşmalıdır.' });
                }

                // Hedef kullanıcıyı Firestore'dan bul
                const targetDocRef = db.collection('approved_users').doc(uid);
                const targetSnapshot = await targetDocRef.get();
                if (!targetSnapshot.exists) {
                    return res.status(404).json({ error: 'Hedef kullanıcı bulunamadı.' });
                }

                const targetData = targetSnapshot.data();

                // Yetki Denetimi
                if (callerRole !== 'super_admin' && (callerRole !== 'company_admin' || callerCompanyId !== targetData.companyId)) {
                    return res.status(403).json({ error: 'Bu kullanıcının şifresini değiştirmek için yetkiniz yok.' });
                }

                // Firebase Auth şifresini güncelle
                await auth.updateUser(uid, {
                    password: newPassword
                });

                // Firestore'daki şifreyi (varsa) kaldırıyoruz. Güvenlik için şifreleri açık metin olarak Firestore'da tutmuyoruz.
                if (targetData.password !== undefined) {
                    await targetDocRef.update({
                        password: admin.firestore.FieldValue.delete()
                    });
                }

                return res.status(200).json({ success: true });
            }

            case 'deleteUser': {
                // Kullanıcı silme (Super Admin veya ilgili Şirketin Yöneticisi)
                const { uid } = payload;
                if (!uid) {
                    return res.status(400).json({ error: 'Eksik parametreler: uid zorunludur.' });
                }

                // Hedef kullanıcıyı bul
                const targetDocRef = db.collection('approved_users').doc(uid);
                const targetSnapshot = await targetDocRef.get();
                
                // Eğer approved_users içinde yoksa pending_users içinde olabilir
                if (!targetSnapshot.exists) {
                    const pendingDocRef = db.collection('pending_users').doc(uid);
                    const pendingSnapshot = await pendingDocRef.get();

                    if (!pendingSnapshot.exists) {
                        return res.status(404).json({ error: 'Silinecek kullanıcı bulunamadı.' });
                    }

                    const pendingData = pendingSnapshot.data();
                    if (callerRole !== 'super_admin' && (callerRole !== 'company_admin' || callerCompanyId !== pendingData.companyId)) {
                        return res.status(403).json({ error: 'Bu kullanıcıyı silmek için yetkiniz yok.' });
                    }

                    // Hem Auth'tan hem pending'den sil
                    await auth.deleteUser(uid);
                    await pendingDocRef.delete();
                    return res.status(200).json({ success: true });
                }

                const targetData = targetSnapshot.data();

                // Yetki Denetimi
                if (callerRole !== 'super_admin' && (callerRole !== 'company_admin' || callerCompanyId !== targetData.companyId)) {
                    return res.status(403).json({ error: 'Bu kullanıcıyı silmek için yetkiniz yok.' });
                }

                // Firebase Auth'tan sil
                await auth.deleteUser(uid);

                // Firestore'dan sil
                await targetDocRef.delete();

                return res.status(200).json({ success: true });
            }

            case 'sendPushNotification': {
                // Bildirim Gönderme Eylemi (Yalnızca Super Admin veya ilgili Şirketin Yöneticisi)
                if (callerRole !== 'super_admin' && callerRole !== 'company_admin' && callerRole !== 'admin') {
                    return res.status(403).json({ error: 'Bildirim göndermek için yönetici yetkiniz bulunmamaktadır.' });
                }

                const { targetUid, allCompany, title, body, imageUrl, targetTab, vibrationPattern, requireAck } = payload;
                
                if (!title || !body) {
                    return res.status(400).json({ error: 'Eksik parametreler: Başlık ve mesaj metni zorunludur.' });
                }

                const targetCompanyId = (callerRole === 'super_admin' && payload.companyId) ? payload.companyId : (callerCompanyId || payload.companyId);
                if (!targetCompanyId) {
                    return res.status(400).json({ error: 'Hata: Şirket kimliği bulunamadı.' });
                }

                let tokens = [];

                if (allCompany) {
                    // Şirketteki tüm onaylı kullanıcıların FCM tokenlarını çek
                    const usersSnapshot = await db.collection('approved_users')
                        .where('companyId', '==', targetCompanyId)
                        .get();
                    
                    usersSnapshot.forEach(doc => {
                        const userData = doc.data();
                        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                            tokens.push(...userData.fcmTokens);
                        }
                    });
                } else if (targetUid) {
                    // Belirli bir kullanıcının tokenlarını çek
                    const userDoc = await db.collection('approved_users').doc(targetUid).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        
                        // Yetki Denetimi: Şirket yöneticisi sadece kendi şirketindeki birine gönderebilir
                        if (callerRole !== 'super_admin' && userData.companyId !== targetCompanyId) {
                            return res.status(403).json({ error: 'Bu kullanıcıya bildirim göndermek için yetkiniz yok.' });
                        }

                        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                            tokens.push(...userData.fcmTokens);
                        }
                    } else {
                        return res.status(404).json({ error: 'Hedef kullanıcı bulunamadı.' });
                    }
                } else {
                    return res.status(400).json({ error: 'Hatalı parametreler: targetUid veya allCompany belirtilmelidir.' });
                }

                // Benzersiz tokenlar
                tokens = [...new Set(tokens)].filter(t => !!t);

                // Bildirimi Firestore company_notifications koleksiyonuna arşivle
                const notifRecord = {
                    companyId: targetCompanyId,
                    senderUid: callerUid,
                    senderEmail: callerEmail,
                    targetType: allCompany ? 'all' : 'user',
                    targetUid: targetUid || null,
                    title: title.trim(),
                    body: body.trim(),
                    imageUrl: imageUrl ? imageUrl.trim() : null,
                    targetTab: targetTab || 'dashboard',
                    vibrationPattern: vibrationPattern || 'general',
                    requireAck: !!requireAck,
                    acknowledgements: {},
                    readBy: [],
                    createdAt: new Date().toISOString()
                };

                const savedNotifDoc = await db.collection('company_notifications').add(notifRecord);

                if (tokens.length === 0) {
                    return res.status(200).json({ 
                        success: true, 
                        message: 'Bildirim arşive kaydedildi fakat şu anda bu şirkette bildirim iznini açmış aktif cihaz bulunamadı.', 
                        sentCount: 0,
                        notificationId: savedNotifDoc.id
                    });
                }

                // Titreşim paterni
                let vibratePatternArr = [200, 100, 200];
                if (vibrationPattern === 'sos') {
                    vibratePatternArr = [300, 100, 300, 100, 300, 200, 600, 100, 600, 100, 600, 200, 300, 100, 300];
                } else if (vibrationPattern === 'general') {
                    vibratePatternArr = [200];
                } else if (vibrationPattern === 'silent') {
                    vibratePatternArr = [];
                }

                // Kilit ekranı aksiyon butonları
                const tabTitles = {
                    dashboard: '📊 Özeti Aç',
                    trips: '🚚 Seferleri Gör',
                    fuel: '⛽ Mazot Fişleri',
                    maintenance: '🔧 Araç Bakım',
                    detaylar: '⚠️ Cezalar & Belgeler',
                    invoices: '📑 Faturalar',
                    earsiv: '🧾 E-Arşiv',
                    payments: '💳 Ödemeler',
                    map: '📍 Canlı Harita',
                    chat: '💬 Sohbete Git'
                };

                const pushActions = [];
                if (requireAck) {
                    pushActions.push({ action: 'ack_approved', title: '👍 Onayladım' });
                    pushActions.push({ action: 'ack_rejected', title: '❌ Sorun Var' });
                } else if (targetTab && tabTitles[targetTab]) {
                    pushActions.push({ action: `nav_${targetTab}`, title: tabTitles[targetTab] });
                }

                // Firebase Cloud Messaging üzerinden multicast gönderim
                try {
                    const message = {
                        notification: {
                            title,
                            body,
                            ...(imageUrl ? { image: imageUrl } : {})
                        },
                        data: {
                            notificationId: savedNotifDoc.id,
                            title,
                            body,
                            imageUrl: imageUrl || '',
                            targetTab: targetTab || 'dashboard',
                            vibrationPattern: vibrationPattern || 'general',
                            requireAck: requireAck ? 'true' : 'false',
                            click_action: targetTab ? `/#tab=${targetTab}` : '/'
                        },
                        webpush: {
                            headers: {
                                Urgency: vibrationPattern === 'sos' ? 'high' : 'normal'
                            },
                            notification: {
                                title,
                                body,
                                icon: '/tir-clear.png',
                                badge: '/tir-clear.png',
                                ...(imageUrl ? { image: imageUrl } : {}),
                                vibrate: vibratePatternArr,
                                tag: `inaner-${savedNotifDoc.id}`,
                                renotify: true,
                                actions: pushActions,
                                data: {
                                    notificationId: savedNotifDoc.id,
                                    targetTab: targetTab || 'dashboard',
                                    url: targetTab ? `/#tab=${targetTab}` : '/'
                                }
                            },
                            fcmOptions: {
                                link: targetTab ? `/#tab=${targetTab}` : '/',
                                ...(imageUrl ? { image: imageUrl } : {})
                            }
                        },
                        tokens: tokens
                    };

                    const response = await admin.messaging().sendEachForMulticast(message);
                    
                    // Geçersiz/hatalı tokenları temizleme
                    const invalidTokens = [];
                    response.responses.forEach((resp, idx) => {
                        if (!resp.success) {
                            const errorCode = resp.error?.code;
                            if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
                                invalidTokens.push(tokens[idx]);
                            }
                        }
                    });

                    if (invalidTokens.length > 0) {
                        const batch = db.batch();
                        const usersSnapshot = await db.collection('approved_users').get();
                        usersSnapshot.forEach(doc => {
                            const data = doc.data();
                            if (data.fcmTokens && Array.isArray(data.fcmTokens)) {
                                const newTokens = data.fcmTokens.filter(t => !invalidTokens.includes(t));
                                if (newTokens.length !== data.fcmTokens.length) {
                                    batch.update(doc.ref, { fcmTokens: newTokens });
                                }
                            }
                        });
                        await batch.commit();
                    }

                    return res.status(200).json({ 
                        success: true, 
                        successCount: response.successCount, 
                        failureCount: response.failureCount,
                        sentCount: response.successCount,
                        notificationId: savedNotifDoc.id
                    });
                } catch (messagingError) {
                    console.error('FCM Multicast gönderim hatası:', messagingError);
                    return res.status(500).json({ error: 'Bildirim gönderilirken bir hata oluştu.', details: messagingError.message });
                }
            }

            case 'acknowledgeNotification': {
                // Şoförün / Personelin bildirimi onaylama veya sorun bildirme eylemi
                const { notificationId, status, note } = payload;
                if (!notificationId || !status) {
                    return res.status(400).json({ error: 'notificationId ve status parametreleri zorunludur.' });
                }

                const notifRef = db.collection('company_notifications').doc(notificationId);
                const notifDoc = await notifRef.get();
                if (!notifDoc.exists) {
                    return res.status(404).json({ error: 'Bildirim kaydı bulunamadı.' });
                }

                const callerDoc = await db.collection('approved_users').doc(callerUid).get();
                const driverName = callerDoc.exists ? (callerDoc.data().username || callerDoc.data().displayName || callerEmail) : callerEmail;

                await notifRef.update({
                    [`acknowledgements.${callerUid}`]: {
                        status: status === 'approved' ? 'approved' : 'rejected',
                        respondedAt: new Date().toISOString(),
                        driverName,
                        note: note || ''
                    },
                    readBy: admin.firestore.FieldValue.arrayUnion(callerUid)
                });

                return res.status(200).json({ success: true, status });
            }

            case 'markNotificationRead': {
                const { notificationId } = payload;
                if (!notificationId) {
                    return res.status(400).json({ error: 'notificationId parametresi zorunludur.' });
                }

                const notifRef = db.collection('company_notifications').doc(notificationId);
                await notifRef.update({
                    readBy: admin.firestore.FieldValue.arrayUnion(callerUid)
                });

                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Geçersiz eylem: ${action}` });
        }
    } catch (error) {
        console.error(`Admin islemi sırasında hata (${action}):`, error);
        return res.status(500).json({ error: 'Eylem gerçekleştirilirken sunucu hatası oluştu.', details: error.message });
    }
}
