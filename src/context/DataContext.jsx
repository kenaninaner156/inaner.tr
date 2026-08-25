import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, doc, getDoc, updateDoc, deleteDoc, query, setDoc, getDocs, writeBatch, where, deleteField, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useCompany } from './CompanyContext';
import { useTruck } from './TruckContext';
// eslint-disable-next-line react-refresh/only-export-components
export const DataContext = createContext();

export const DataProvider = ({ children }) => {
    const { activeCompanyId } = useCompany();
    const { activeTruckId } = useTruck();

    const [trips, setTrips] = useState([]);
    const [fuelRecords, setFuelRecords] = useState([]);
    const [maintenanceRecords, setMaintenanceRecords] = useState([]);
    const [paymentRecords, setPaymentRecords] = useState([]);
    const [maintenanceFolders, setMaintenanceFolders] = useState([]);
    const [adminLog, setAdminLog] = useState([]);
    const [pendingUsers, setPendingUsers] = useState([]);
    const [approvedUsers, setApprovedUsers] = useState([]);
    const [docs, setDocs] = useState({});
    const [penalties, setPenalties] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [shoppingItems, setShoppingItems] = useState([]);
    const [geofences, setGeofences] = useState([]);
    const [manualSplits, setManualSplits] = useState([]);
    const [manualMerges, setManualMerges] = useState([]);
    const [manualDeletes, setManualDeletes] = useState([]);
    const [customRouteNames, setCustomRouteNames] = useState({});
    const [payouts, setPayouts] = useState([]);
    const [premiums, setPremiums] = useState([]);
    const [companyNotifications, setCompanyNotifications] = useState([]);

    const [vehicleInfo, setVehicleInfo] = useState({
        plate: '06 FTN 692', trailerPlate: '06 ABC 123', driverName: 'Ahmet Şoför',
        model: 'İveco Stralis 460', insuranceDate: '2026-12-31', inspectionDate: '2026-10-15'
    });
    const [drivers, setDrivers] = useState([]);
    const [dailyNotes, setDailyNotes] = useState({});
    const [spareParts, setSpareParts] = useState([]);
    const [sparePartCategories, setSparePartCategories] = useState(['Yağ', 'Filtre', 'Kayış', 'Balata', 'Aydınlatma', 'Lastik', 'Genel']);
    const [maintenanceTypes, setMaintenanceTypes] = useState(['Periyodik Bakım', 'Lastik', 'Motor', 'Fren', 'Şanzıman', 'Elektrik', 'Kaporta', 'Diğer']);
    const [periodicMaintenanceItems, setPeriodicMaintenanceItems] = useState([
        { id: '1', name: 'Motor Yağı', intervalKm: 40000, warningKm: 2000 },
        { id: '2', name: 'Şanzıman Yağı', intervalKm: 80000, warningKm: 5000 },
        { id: '3', name: 'Hava Filtresi', intervalKm: 20000, warningKm: 1000 }
    ]);
    const [mechanics, setMechanics] = useState([]);
    const [routes, setRoutes] = useState([]);
    const [savedTrackingRoutes, setSavedTrackingRoutes] = useState([]);
    const [routeHistory, setRouteHistory] = useState({});
    const [draftInvoice, setDraftInvoice] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [dataError, setDataError] = useState(null);

    const [currentSession, setCurrentSession] = useState(() => {
        const token = localStorage.getItem('tir_auth_kenan_v1');
        const user = localStorage.getItem('tir_current_user');
        const uid = localStorage.getItem('tir_current_uid');
        const role = localStorage.getItem('tir_current_role') || 'user';
        const ip = localStorage.getItem('tir_current_ip') || 'Bilinmiyor';
        const device = localStorage.getItem('tir_current_device') || 'PC';
        const location = localStorage.getItem('tir_current_location') || 'Bilinmiyor';
        const rawDevice = localStorage.getItem('tir_current_rawDevice') || 'Bilinmiyor';
        const screen = localStorage.getItem('tir_current_screen') || 'Bilinmiyor';
        const cores = localStorage.getItem('tir_current_cores') || 'Bilinmiyor';
        const tz = localStorage.getItem('tir_current_tz') || 'Bilinmiyor';
        const lang = localStorage.getItem('tir_current_lang') || 'Bilinmiyor';
        const isKnownDevice = localStorage.getItem('tir_current_isKnownDevice') === 'true';
        const vpnRisk = localStorage.getItem('tir_current_vpnRisk') === 'true';
        const incognitoRisk = localStorage.getItem('tir_current_incognitoRisk') === 'true';
        const sessionStart = localStorage.getItem('tir_session_start');
        
        let presenceId = localStorage.getItem('tir_presence_id');
        if (token && user && !presenceId) {
            presenceId = Math.random().toString(36).substring(2, 11);
            localStorage.setItem('tir_presence_id', presenceId);
            if (!sessionStart) localStorage.setItem('tir_session_start', new Date().toISOString());
        }

        if (token && user) return { username: user, uid, role, ip, device, location, rawDevice, screen, cores, tz, lang, isKnownDevice, vpnRisk, incognitoRisk, presenceId, sessionStart: sessionStart || new Date().toISOString() };
        return null;
    });

    const loginSession = async (user) => {
        localStorage.setItem('tir_current_user', user.username);
        if (user.uid) localStorage.setItem('tir_current_uid', user.uid);
        localStorage.setItem('tir_current_role', user.role || 'user');
        if (user.ip) localStorage.setItem('tir_current_ip', user.ip);
        if (user.device) localStorage.setItem('tir_current_device', user.device);
        if (user.location) localStorage.setItem('tir_current_location', user.location);
        if (user.rawDevice) localStorage.setItem('tir_current_rawDevice', user.rawDevice);
        if (user.screen) localStorage.setItem('tir_current_screen', user.screen);
        if (user.cores) localStorage.setItem('tir_current_cores', user.cores);
        if (user.tz) localStorage.setItem('tir_current_tz', user.tz);
        if (user.lang) localStorage.setItem('tir_current_lang', user.lang);
        localStorage.setItem('tir_current_isKnownDevice', user.isKnownDevice);
        localStorage.setItem('tir_current_vpnRisk', user.vpnRisk);
        localStorage.setItem('tir_current_incognitoRisk', user.incognitoRisk);

        if (user.companyId) {
            localStorage.setItem('tir_current_company', user.companyId);
        } else if (user.username === 'kenan') {
            localStorage.setItem('tir_current_company', 'inaner_logistics'); // fallback for super_admin
        }
        localStorage.setItem('tir_auth_kenan_v1', 'temp_token'); // Mock auth token
        const newPresenceId = Math.random().toString(36).substring(2, 11);
        const newSessionStart = new Date().toISOString();
        localStorage.setItem('tir_presence_id', newPresenceId);
        localStorage.setItem('tir_session_start', newSessionStart);
        setCurrentSession({ username: user.username, uid: user.uid, role: user.role || 'user', ip: user.ip, device: user.device, location: user.location, rawDevice: user.rawDevice, screen: user.screen, cores: user.cores, tz: user.tz, lang: user.lang, isKnownDevice: user.isKnownDevice, vpnRisk: user.vpnRisk, incognitoRisk: user.incognitoRisk, presenceId: newPresenceId, sessionStart: newSessionStart });

        const userKey = user.username === 'kenan' ? 'admin' : user.username;
        await addLog('KULLANICI_GIRIS', `${userKey} sisteme giriş yaptı`, { ip: user.ip || 'Bilinmiyor', device: user.device || 'Bilinmiyor', location: user.location || 'Bilinmiyor', rawDevice: user.rawDevice || 'Bilinmiyor' }, userKey);
    };

    const logoutSession = async () => {
        const userToLogOut = currentSession;

        try {
            await signOut(auth);
        } catch(e) {}

        // Hemen state ve localStorage temizliği yaparak anında UI geçişini sağla (bekleme/animasyon sarkmasını önler)
        localStorage.removeItem('tir_auth_kenan_v1');
        localStorage.removeItem('tir_current_user');
        localStorage.removeItem('tir_current_uid');
        localStorage.removeItem('tir_current_role');
        localStorage.removeItem('tir_current_ip');
        localStorage.removeItem('tir_current_device');
        localStorage.removeItem('tir_current_location');
        localStorage.removeItem('tir_current_rawDevice');
        localStorage.removeItem('tir_current_screen');
        localStorage.removeItem('tir_current_cores');
        localStorage.removeItem('tir_current_tz');
        localStorage.removeItem('tir_current_lang');
        localStorage.removeItem('tir_current_isKnownDevice');
        localStorage.removeItem('tir_current_vpnRisk');
        localStorage.removeItem('tir_current_incognitoRisk');
        localStorage.removeItem('tir_presence_id');
        localStorage.removeItem('tir_session_start');
        setCurrentSession(null);

        // Firebase loglama ve online presence silme işlemlerini arka planda asenkron yap
        if (userToLogOut?.username) {
            const userKey = userToLogOut.username === 'kenan' ? 'admin' : userToLogOut.username;
            addLog('KULLANICI_CIKIS', `${userKey} sistemden çıkış yaptı`, null, userKey).catch(() => {});
            
            if (userToLogOut.presenceId) {
                deleteDoc(doc(db, 'presence', `${userToLogOut.username}_${userToLogOut.presenceId}`)).catch(() => {});
            }
        }
    };

    // Firebase Auth State Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (!user) {
                // If Firebase Auth says we are logged out, but local storage thinks we are logged in, clear it.
                if (localStorage.getItem('tir_current_user')) {
                    logoutSession();
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Firebase Listener Setup
    useEffect(() => {
        // Only establish Firestore snapshot listeners if we have an active, authenticated user session
        if (!currentSession?.username || !activeCompanyId) {
            setIsDataLoading(false);
            return;
        }

        // RESET DATA STATES ON COMPANY CHANGE (Isolation)
        setTrips([]);
        setFuelRecords([]);
        setMaintenanceRecords([]);
        setPaymentRecords([]);
        setMaintenanceFolders([]);
        setAdminLog([]);
        setPendingUsers([]);
        setApprovedUsers([]);
        setPenalties([]);
        setInvoices([]);
        setShoppingItems([]);
        setSpareParts([]);
        setMechanics([]);
        setGeofences([]);
        setManualSplits([]);
        setManualMerges([]);
        setManualDeletes([]);
        setCustomRouteNames({});
        setDocs({});
        setPayouts([]);
        setPremiums([]);
        
        // Defaults for non-existing company docs
        const isInaner = activeCompanyId === 'inaner_logistics';
        setSparePartCategories(['Yağ', 'Filtre', 'Kayış', 'Balata', 'Aydınlatma', 'Lastik', 'Genel']);
        setMaintenanceTypes(['Periyodik Bakım', 'Lastik', 'Motor', 'Fren', 'Şanzıman', 'Elektrik', 'Kaporta', 'Diğer']);
        setPeriodicMaintenanceItems(isInaner ? [
            { id: '1', name: 'Motor Yağı', intervalKm: 40000, warningKm: 2000 },
            { id: '2', name: 'Şanzıman Yağı', intervalKm: 80000, warningKm: 5000 },
            { id: '3', name: 'Hava Filtresi', intervalKm: 20000, warningKm: 1000 }
        ] : []); // Other companies start fresh or with empty templates

        // Only show loading spinner on company change, not truck switch
        if (!activeTruckId) setIsDataLoading(true);

        const unsubs = [];
        const isAdminSession = currentSession?.role === 'super_admin' || currentSession?.role === 'company_admin' || currentSession?.role === 'admin';

        setDataError(null);

        // Helper function for sorting by date and createdAt
        const sortData = (data) => data.sort((a, b) => {
            const dateDiff = new Date(b.date) - new Date(a.date);
            if (dateDiff !== 0) return dateDiff;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        // 1. Trips config
        unsubs.push(onSnapshot(query(collection(db, 'trips'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId);
            setTrips(sortData(data));
        }));

        // 2. Fuel config
        unsubs.push(onSnapshot(query(collection(db, 'fuel'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId);
            setFuelRecords(sortData(data));
        }));

        // 3. Maintenance config
        unsubs.push(onSnapshot(query(collection(db, 'maintenance'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId);
            setMaintenanceRecords(sortData(data));
        }));

        // 4. Payments config
        unsubs.push(onSnapshot(query(collection(db, 'payments'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId);
            setPaymentRecords(sortData(data));
        }));

        // 5. Penalties config
        unsubs.push(onSnapshot(query(collection(db, 'penalties'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId);
            // penalties have 'date', sort them using helper
            setPenalties(sortData(data));
        }));

        // 6. Maintenance Folders config
        unsubs.push(onSnapshot(query(collection(db, 'maintenance_folders'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setMaintenanceFolders(data);
        }));

        // 7. AdminLogs config (Admin Only)
        if (isAdminSession) {
            unsubs.push(onSnapshot(query(
                collection(db, 'admin_logs'), 
                where('companyId', '==', activeCompanyId),
                orderBy('timestamp', 'desc'),
                limit(100)
            ), (snapshot) => {
                const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                setAdminLog(data);
            }));
        } else {
            setAdminLog([]);
        }

        // 8. Invoices config
        unsubs.push(onSnapshot(query(collection(db, 'invoices'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setInvoices(data);
        }));

        // 8.5 Payouts config
        unsubs.push(onSnapshot(query(collection(db, 'payouts'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setPayouts(data);
        }));

        // 9. Users config (Admin Only)
        if (isAdminSession) {
            unsubs.push(onSnapshot(query(collection(db, 'pending_users'), where('companyId', '==', activeCompanyId)), (snapshot) => {
                setPendingUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
            }));
        } else {
            setPendingUsers([]);
        }

        unsubs.push(onSnapshot(query(collection(db, 'approved_users'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            setApprovedUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        }));

        // 10. Spare Parts config
        unsubs.push(onSnapshot(query(collection(db, 'spare_parts'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setSpareParts(data);
        }));

        // 11. Mechanics config
        unsubs.push(onSnapshot(query(collection(db, 'mechanics'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            setMechanics(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        }));

        // 11.5 Shopping List config
        unsubs.push(onSnapshot(query(collection(db, 'shopping_list'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(d => !activeTruckId || d.truckId === activeTruckId)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            setShoppingItems(data);
        }));

        // 11.6 Geofences config
        unsubs.push(onSnapshot(query(collection(db, 'geofences'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setGeofences(data);
        }));

        // 11.7 Manual Splits config
        unsubs.push(onSnapshot(query(collection(db, 'manual_splits'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data().timestamp);
            setManualSplits(data);
        }));

        // 11.8 Manual Merges config
        unsubs.push(onSnapshot(query(collection(db, 'manual_merges'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data().timestamp);
            setManualMerges(data);
        }));

        // 11.9 Manual Deletes config
        unsubs.push(onSnapshot(query(collection(db, 'manual_deletes'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => doc.data().timestamp);
            setManualDeletes(data);
        }));

        // 11.8 Custom Route Names
        unsubs.push(onSnapshot(query(collection(db, 'custom_route_names'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const map = {};
            snapshot.docs.forEach(doc => {
                map[doc.data().timestamp] = doc.data().name;
            });
            setCustomRouteNames(map);
        }));

        // 11.9 Company Notifications config
        const targetNotifCompany = activeCompanyId || currentSession?.companyId || 'inaner_logistics';
        unsubs.push(onSnapshot(query(collection(db, 'company_notifications'), where('companyId', 'in', [targetNotifCompany, 'inaner_logistics', 'all'])), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            const seen = new Set();
            const unique = [];
            list.forEach(item => {
                if (!seen.has(item.id)) {
                    seen.add(item.id);
                    unique.push(item);
                }
            });
            unique.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            setCompanyNotifications(unique);
        }, (err) => {
            console.warn('company_notifications in-query subscription error:', err);
            unsubs.push(onSnapshot(collection(db, 'company_notifications'), (snap) => {
                const list = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }))
                    .filter(d => !d.companyId || d.companyId === targetNotifCompany || d.companyId === 'inaner_logistics' || d.companyId === 'all');
                list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                setCompanyNotifications(list);
            }, (e2) => console.warn('fallback company_notifications error:', e2)));
        }));

        // 12. Docs config
        if (activeCompanyId && activeTruckId) {
            unsubs.push(onSnapshot(doc(db, 'company_data', `${activeCompanyId}_${activeTruckId}_docs`), (docSnapshot) => {
                if (docSnapshot.exists()) {
                    setDocs(docSnapshot.data() || {});
                } else { setDocs({}); }
            }));
        } else {
            setDocs({});
        }

        // 13. System Info and Defaults config
        unsubs.push(onSnapshot(doc(db, 'company_data', activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                if (data.vehicleInfo) setVehicleInfo(prev => ({ ...prev, ...data.vehicleInfo }));

                if (data.drivers) setDrivers(data.drivers);
                else setDrivers([]);
 
                if (data.dailyNotes) setDailyNotes(data.dailyNotes);
                else setDailyNotes({});

                if (data.sparePartCategories && data.sparePartCategories.length > 0) {
                    setSparePartCategories(data.sparePartCategories);
                } else {
                    setSparePartCategories(['Yağ', 'Filtre', 'Kayış', 'Balata', 'Aydınlatma', 'Lastik', 'Genel']);
                }

                if (data.maintenanceTypes && data.maintenanceTypes.length > 0) {
                    setMaintenanceTypes(data.maintenanceTypes);
                } else {
                    setMaintenanceTypes(['Periyodik Bakım', 'Lastik', 'Motor', 'Fren', 'Şanzıman', 'Elektrik', 'Kaporta', 'Diğer']);
                }

                if (data.periodicMaintenanceItems !== undefined) {
                    setPeriodicMaintenanceItems(data.periodicMaintenanceItems);
                } else {
                    const isInaner = activeCompanyId === 'inaner_logistics';
                    setPeriodicMaintenanceItems(isInaner ? [
                        { id: '1', name: 'Motor Yağı', intervalKm: 40000, warningKm: 2000 },
                        { id: '2', name: 'Şanzıman Yağı', intervalKm: 80000, warningKm: 5000 },
                        { id: '3', name: 'Hava Filtresi', intervalKm: 20000, warningKm: 1000 }
                    ] : []);
                }

                if (data.premiums !== undefined) {
                    setPremiums(data.premiums);
                } else {
                    setPremiums([
                        { id: 'prim_kisa', name: 'Kısa Yol Primi', type: 'fixed', amount: 300 },
                        { id: 'prim_uzun', name: 'Uzun Yol Primi', type: 'fixed', amount: 600 }
                    ]);
                }

                if (data.routeHistory) {
                    setRouteHistory(data.routeHistory);
                } else {
                    setRouteHistory({});
                }
            } else {
                setRouteHistory({});
                const isInaner = activeCompanyId === 'inaner_logistics';
                setDrivers([]);
                setSparePartCategories(['Yağ', 'Filtre', 'Kayış', 'Balata', 'Aydınlatma', 'Lastik', 'Genel']);
                setMaintenanceTypes(['Periyodik Bakım', 'Lastik', 'Motor', 'Fren', 'Şanzıman', 'Elektrik', 'Kaporta', 'Diğer']);
                setPeriodicMaintenanceItems(isInaner ? [
                    { id: '1', name: 'Motor Yağı', intervalKm: 40000, warningKm: 2000 },
                    { id: '2', name: 'Şanzıman Yağı', intervalKm: 80000, warningKm: 5000 },
                    { id: '3', name: 'Hava Filtresi', intervalKm: 20000, warningKm: 1000 }
                ] : []);
                setPremiums([
                    { id: 'prim_kisa', name: 'Kısa Yol Primi', type: 'fixed', amount: 300 },
                    { id: 'prim_uzun', name: 'Uzun Yol Primi', type: 'fixed', amount: 600 }
                ]);
                setDraftInvoice(null);
            }
            setDataError(null);
            setIsDataLoading(false); // Finished loading essential config
        }, (error) => {
            console.error("Firebase Listener Error:", error);
            if (error.code === 'permission-denied') {
                setDataError("Veritabanı erişim izni reddedildi. Yetkiniz olmayan bir sayfaya erişmeye çalışıyor olabilirsiniz. Lütfen sistem yöneticinizle iletişime geçin.");
            } else {
                setDataError("Sunucu bağlantısında bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.");
            }
            setIsDataLoading(false);
        }));

        // 13.7 Truck-specific draft invoice
        if (activeCompanyId && activeTruckId) {
            unsubs.push(onSnapshot(doc(db, 'company_data', `${activeCompanyId}_${activeTruckId}_draft`), (docSnapshot) => {
                if (docSnapshot.exists() && docSnapshot.data().draftInvoice) {
                    setDraftInvoice(docSnapshot.data().draftInvoice);
                } else {
                    setDraftInvoice(null);
                }
            }));
        } else {
            setDraftInvoice(null);
        }

        // 13.5. Routes config (Truck-Specific)
        if (activeCompanyId && activeTruckId) {
            unsubs.push(onSnapshot(doc(db, 'company_data', `${activeCompanyId}_${activeTruckId}_routes`), (docSnapshot) => {
                if (docSnapshot.exists() && docSnapshot.data().routes) {
                    setRoutes(docSnapshot.data().routes);
                } else {
                    setRoutes([]);
                }
            }));
        } else {
            setRoutes([]);
        }

        // 13.6. Saved Tracking Routes (Company-Wide or Truck-Specific, let's make it Company-Wide like device mappings)
        if (activeCompanyId) {
            unsubs.push(onSnapshot(doc(db, 'company_data', `saved_tracking_routes_${activeCompanyId}`), (docSnapshot) => {
                if (docSnapshot.exists() && docSnapshot.data().routes) {
                    setSavedTrackingRoutes(docSnapshot.data().routes);
                } else {
                    setSavedTrackingRoutes([]);
                }
            }));
        } else {
            setSavedTrackingRoutes([]);
        }

        // 14. Presence config
        unsubs.push(onSnapshot(collection(db, 'presence'), (snapshot) => {
            const now = new Date();
            const active = snapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id }))
                .filter(u => {
                    const last = new Date(u.lastActive);
                    return (now - last) < 5 * 60 * 1000;
                });
            setOnlineUsers(active);
        }));

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [currentSession?.username, activeCompanyId, activeTruckId]);

    // Heartbeat Effect
    useEffect(() => {
        if (!currentSession?.username || !currentSession?.presenceId) return;

        const updatePresence = async () => {
            try {
                const presenceDoc = doc(db, 'presence', `${currentSession.username}_${currentSession.presenceId}`);
                await setDoc(presenceDoc, {
                    username: currentSession.username,
                    role: currentSession.role || 'user',
                    lastActive: new Date().toISOString(),
                    ip: currentSession.ip || 'Bilinmiyor',
                    device: currentSession.device || 'PC',
                    location: currentSession.location || 'Bilinmiyor',
                    rawDevice: currentSession.rawDevice || 'Bilinmiyor',
                    screen: currentSession.screen || 'Bilinmiyor',
                    cores: currentSession.cores || 'Bilinmiyor',
                    tz: currentSession.tz || 'Bilinmiyor',
                    lang: currentSession.lang || 'Bilinmiyor',
                    isKnownDevice: !!currentSession.isKnownDevice,
                    vpnRisk: !!currentSession.vpnRisk,
                    incognitoRisk: !!currentSession.incognitoRisk,
                    sessionStart: currentSession.sessionStart || new Date().toISOString()
                }, { merge: true });
            } catch { /* empty */ }
        };

        updatePresence();
        const timer = setInterval(updatePresence, 60000); // 1 dakikada bir güncelle

        const handleUnload = () => {
            // Tarayıcı kapanırken olabildiğince hızlı silmeye çalış
            if (currentSession?.username && currentSession?.presenceId) {
                const presenceDoc = doc(db, 'presence', `${currentSession.username}_${currentSession.presenceId}`);
                deleteDoc(presenceDoc).catch(() => {});
            }
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(timer);
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [currentSession]);

    // Firebase'e veri yazan Admin Log
    const addLog = async (action, detail, meta = null, overrideUser = null) => {
        const user = overrideUser || localStorage.getItem('tir_current_user') || 'kenan';
        const entry = { timestamp: new Date().toISOString(), action, detail, user, meta, companyId: activeCompanyId };
        try {
            await addDoc(collection(db, 'admin_logs'), entry);
        } catch { /* empty */ }
    };

    const addTrip = async (trip) => {
        await addDoc(collection(db, 'trips'), {
            ...trip,
            companyId: activeCompanyId,
            truckId: activeTruckId,
            deleted: false,
            createdAt: new Date().toISOString()
        });
        addLog('SEFER_EKLE', `${trip.from} → ${trip.to} | ${trip.tonnage}t`);
    };

    const deleteTrip = async (id) => {
        const trip = trips.find(t => t.id === id);
        if (trip) {
            await updateDoc(doc(db, 'trips', id), { deleted: true });
            addLog('SEFER_SİL', `${trip.from} → ${trip.to} | ${trip.date}`, { table: 'Trips', id });
        }
    };

    const editTrip = async (id, updates) => {
        await updateDoc(doc(db, 'trips', id), updates);
        addLog('SEFER_DUZENLE', `Sefer güncellendi`);
    };

    const addFuel = async (record) => {
        await addDoc(collection(db, 'fuel'), {
            ...record,
            companyId: activeCompanyId,
            truckId: activeTruckId,
            deleted: false,
            createdAt: new Date().toISOString()
        });
        addLog('MAZOT_EKLE', `${record.station} | ${record.liters}L`);
    };

    const deleteFuel = async (id) => {
        const rec = fuelRecords.find(r => r.id === id);
        if (rec) {
            await updateDoc(doc(db, 'fuel', id), { deleted: true });
            addLog('MAZOT_SİL', `${rec.station} | ${rec.date}`, { table: 'Fuel', id });
        }
    };

    const editFuel = async (id, updates) => {
        await updateDoc(doc(db, 'fuel', id), updates);
        addLog('MAZOT_DUZENLE', `Mazot fişi güncellendi`);
    };

    const addMaintenance = async (record) => {
        await addDoc(collection(db, 'maintenance'), {
            ...record,
            companyId: activeCompanyId,
            truckId: activeTruckId,
            deleted: false,
            createdAt: new Date().toISOString()
        });
        addLog('BAKIM_EKLE', `${record.type} | ₺${record.cost}`);
    };

    const deleteMaintenance = async (id) => {
        const rec = maintenanceRecords.find(r => r.id === id);
        if (rec) {
            await updateDoc(doc(db, 'maintenance', id), { deleted: true });
            addLog('BAKIM_SİL', `${rec.type} | ${rec.date}`, { table: 'Maintenance', id });
        }
    };

    const updateMaintenance = async (id, updatedFields) => {
        await updateDoc(doc(db, 'maintenance', id), updatedFields);
        addLog('BAKIM_GUNCELLE', updatedFields.description || 'Bakım');
    };

    const addPayment = async (record) => {
        await addDoc(collection(db, 'payments'), {
            ...record,
            companyId: activeCompanyId,
            truckId: activeTruckId,
            deleted: false,
            createdAt: new Date().toISOString()
        });
        addLog('ODEME_EKLE', `${record.type} | ₺${record.amount}`);
    };

    const deletePayment = async (id) => {
        const rec = paymentRecords.find(r => r.id === id);
        if (rec) {
            await updateDoc(doc(db, 'payments', id), { deleted: true });
            addLog('ODEME_SIL', `${rec.type} | ₺${rec.amount} | ${rec.date}`, { table: 'Payments', id });
        }
    };

    const updatePayment = async (id, updatedFields) => {
        await updateDoc(doc(db, 'payments', id), updatedFields);
        addLog('ODEME_GUNCELLE', updatedFields.description || 'Ödeme');
    };

    const updateVehicleInfo = async (newInfo) => {
        const nextInfo = { ...vehicleInfo, ...newInfo };
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { vehicleInfo: nextInfo }, { merge: true });
        addLog('ARAC_GUNCELLE', 'Araç bilgileri güncellendi');
    };

    const updateDrivers = async (newDrivers) => {
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { drivers: newDrivers }, { merge: true });
    };

    const updatePeriodicMaintenanceItems = async (newItems) => {
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { periodicMaintenanceItems: newItems }, { merge: true });
        addLog('SABLON_GUNCELLE', 'Periyodik bakım şablonları güncellendi');
    };

    const updateMaintenanceTypes = async (newTypes) => {
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { maintenanceTypes: newTypes }, { merge: true });
        addLog('BAKIM_TIPLERI_GUNCELLE', 'Bakım türleri güncellendi');
    };
 
    const updateDailyNote = async (dateStr, noteText) => {
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        
        if (noteText && noteText.trim()) {
            await setDoc(doc(db, 'company_data', docId), { dailyNotes: { [dateStr]: noteText.trim() } }, { merge: true });
        } else {
            await setDoc(doc(db, 'company_data', docId), { dailyNotes: { [dateStr]: deleteField() } }, { merge: true });
        }
        
        addLog('NOT_GUNCELLE', `${dateStr} tarihli operasyon notu güncellendi`);
    };

    const addSparePartCategory = async (newCategory) => {
        if (!sparePartCategories.includes(newCategory)) {
            const newCats = [...sparePartCategories, newCategory];
            const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
            await setDoc(doc(db, 'company_data', docId), { sparePartCategories: newCats }, { merge: true });
            addLog('KATEGORI_EKLE', 'Yeni stok kategorisi eklendi');
        }
    };

    const addSparePart = async (part) => {
        try {
            await addDoc(collection(db, 'spare_parts'), { ...part, companyId: activeCompanyId, createdAt: new Date().toISOString() });
            addLog('STOK_EKLE', `${part.name} stoğa eklendi`);
        } catch { /* empty */ }
    };

    const updateSparePart = async (id, part) => {
        try {
            await updateDoc(doc(db, 'spare_parts', id), part);
            addLog('STOK_GUNCELLE', `${part.name} stoğu güncellendi`);
        } catch { /* empty */ }
    };

    const deleteSparePart = async (id, partName) => {
        try {
            await deleteDoc(doc(db, 'spare_parts', id));
            addLog('STOK_SIL', `${partName} stoktan silindi`);
        } catch { /* empty */ }
    };

    const addMechanic = async (mechanic) => {
        await addDoc(collection(db, 'mechanics'), { ...mechanic, companyId: activeCompanyId, createdAt: new Date().toISOString() });
        addLog('TAMIRCI_EKLE', `${mechanic.name || mechanic.shopName}`);
    };

    const deleteMechanic = async (id, name) => {
        await deleteDoc(doc(db, 'mechanics', id));
        addLog('TAMIRCI_SIL', name || 'Tamirci');
    };

    const updateMechanic = async (id, updatedFields) => {
        await updateDoc(doc(db, 'mechanics', id), updatedFields);
        addLog('TAMIRCI_GUNCELLE', updatedFields.name || updatedFields.shopName || 'Tamirci');
    };

    const addMaintenanceFolder = async (folder) => {
        await addDoc(collection(db, 'maintenance_folders'), { ...folder, companyId: activeCompanyId, truckId: activeTruckId, createdAt: new Date().toISOString() });
        addLog('KLASOR_EKLE', `${folder.name} klasörü oluşturuldu`);
    };

    const updateMaintenanceFolder = async (id, data) => {
        await updateDoc(doc(db, 'maintenance_folders', id), data);
    };

    const deleteMaintenanceFolder = async (id, folderName) => {
        await deleteDoc(doc(db, 'maintenance_folders', id));
        addLog('KLASOR_SİL', `${folderName} klasörü silindi`);
    };

    const getRoutesDocId = () => `${activeCompanyId}_${activeTruckId}_routes`;

    const addRoute = async (route) => {
        const nextRoutes = [{ ...route, id: Date.now() }, ...routes];
        await setDoc(doc(db, 'company_data', getRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('ROTA_EKLE', `${route.from} → ${route.to}`);
    };

    const deleteRoute = async (id) => {
        const nextRoutes = routes.filter(r => r.id !== id);
        await setDoc(doc(db, 'company_data', getRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('ROTA_SIL', `Rota silindi`);
    };

    const updateRoute = async (id, updatedFields) => {
        const nextRoutes = routes.map(r => r.id === id ? { ...r, ...updatedFields } : r);
        await setDoc(doc(db, 'company_data', getRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('ROTA_GUNCELLE', `Rota güncellendi`);
    };

    const updateRoutePrice = async (routeId, price) => {
        const nextRoutes = routes.map(r => r.id === routeId ? { ...r, lastPrice: price } : r);
        await setDoc(doc(db, 'company_data', getRoutesDocId()), { routes: nextRoutes }, { merge: true });
    };

    const getSavedTrackingRoutesDocId = () => `saved_tracking_routes_${activeCompanyId}`;

    const addSavedTrackingRoute = async (route) => {
        const nextRoutes = [{ ...route, id: Date.now() }, ...savedTrackingRoutes];
        await setDoc(doc(db, 'company_data', getSavedTrackingRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('ROTA_KAYDET', `${route.name || 'İsimsiz Rota'}`);
    };

    const deleteSavedTrackingRoute = async (id) => {
        const nextRoutes = savedTrackingRoutes.filter(r => r.id !== id);
        await setDoc(doc(db, 'company_data', getSavedTrackingRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('KAYITLI_ROTA_SIL', `Rota silindi`);
    };

    const updateSavedTrackingRoute = async (id, updates) => {
        const nextRoutes = savedTrackingRoutes.map(r => r.id === id ? { ...r, ...updates } : r);
        await setDoc(doc(db, 'company_data', getSavedTrackingRoutesDocId()), { routes: nextRoutes }, { merge: true });
        addLog('KAYITLI_ROTA_GUNCELLE', `${updates.name || 'Rota guncellendi'}`);
    };

    const saveDraftInvoice = async (draft) => {
        if (!activeCompanyId || !activeTruckId) return;
        const docId = `${activeCompanyId}_${activeTruckId}_draft`;
        await setDoc(doc(db, 'company_data', docId), { draftInvoice: draft }, { merge: true });
    };

    const clearDraftInvoice = async () => {
        if (!activeCompanyId || !activeTruckId) return;
        const docId = `${activeCompanyId}_${activeTruckId}_draft`;
        await setDoc(doc(db, 'company_data', docId), { draftInvoice: null }, { merge: true });
    };

    // Rota Birim Fiyat Hafızasını Firebase'e Kaydetme
    const saveRouteHistory = async (newHistory) => {
        if (!activeCompanyId) return;
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { routeHistory: newHistory }, { merge: true });
        try {
            localStorage.setItem(`route_history_${activeCompanyId || 'default'}`, JSON.stringify(newHistory));
        } catch (e) { /* empty */ }
    };

    // Otomatik Geçiş: Mevcut PC'deki localStorage rota geçmişini tek seferde Firebase'e aktar
    useEffect(() => {
        if (!activeCompanyId) return;
        try {
            const stored = localStorage.getItem(`route_history_${activeCompanyId || 'default'}`);
            if (stored) {
                const localHistory = JSON.parse(stored);
                if (localHistory && typeof localHistory === 'object' && Object.keys(localHistory).length > 0) {
                    const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
                    const hasNewKeys = Object.keys(localHistory).some(k => !routeHistory || !routeHistory[k]);
                    if (hasNewKeys || !routeHistory || Object.keys(routeHistory).length === 0) {
                        const merged = { ...localHistory, ...(routeHistory || {}) };
                        setDoc(doc(db, 'company_data', docId), { routeHistory: merged }, { merge: true }).catch(console.error);
                    }
                }
            }
        } catch (e) {
            console.error("Rota geçmişi Firebase'e aktarılırken hata:", e);
        }
    }, [activeCompanyId, routeHistory]);

    const registerUser = async (userData) => {
        const entry = { ...userData, status: 'pending', requestedAt: new Date().toISOString(), companyId: activeCompanyId };
        await addDoc(collection(db, 'pending_users'), entry);
        return entry;
    };

    const callAdminApi = async (action, payload) => {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("İşlem yapmak için oturum açmış olmanız gerekmektedir.");
        const token = await currentUser.getIdToken(true);
        
        const response = await fetch('/api/admin-action', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action, payload })
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error("API geçersiz yanıt döndürdü (HTML/Text). Yerel geliştirme ortamında çalışırken lütfen 'npx vercel dev' komutu ile başlattığınızdan emin olun.");
        }

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Sunucu hatası: ${response.status}`);
        }
        return await response.json();
    };

    const approveUser = async (userId, role = 'şoför', assignedCompanyId = null) => {
        const finalCompanyId = assignedCompanyId || activeCompanyId;
        const user = pendingUsers.find(u => u.id === userId);
        try {
            await callAdminApi('approveUser', { uid: userId, role, assignedCompanyId: finalCompanyId });
            addLog('KULLANICI_ONAYLA', `${user?.username || 'Kullanıcı'} adlı kullanıcı '${role}' yetkisiyle onaylandı`);
        } catch (error) {
            console.warn("API ile onaylama başarısız oldu, doğrudan veritabanı üzerinden deneniyor...", error);
            try {
                const pendingDocRef = doc(db, 'pending_users', userId);
                const pendingSnap = await getDoc(pendingDocRef);
                if (!pendingSnap.exists) {
                    throw new Error("Onaylanacak bekleyen kullanıcı bulunamadı.");
                }
                const pendingData = pendingSnap.data();
                const email = `${pendingData.username}@inaner.com`;

                await setDoc(doc(db, 'approved_users', userId), {
                    username: pendingData.username,
                    firstName: pendingData.firstName || '',
                    lastName: pendingData.lastName || '',
                    fullName: pendingData.fullName || `${pendingData.firstName || ''} ${pendingData.lastName || ''}`.trim() || pendingData.username,
                    authEmail: email,
                    role,
                    companyId: finalCompanyId,
                    approvedAt: new Date().toISOString(),
                    status: 'approved'
                });

                await deleteDoc(pendingDocRef);
                addLog('KULLANICI_ONAYLA', `${user?.username || 'Kullanıcı'} adlı kullanıcı '${role}' yetkisiyle onaylandı (Yerel veritabanı üzerinden)`);
            } catch (fallbackError) {
                console.error("Doğrudan onaylama da başarısız oldu:", fallbackError);
                alert("Kullanıcı onaylanırken hata oluştu: " + error.message);
            }
        }
    };

    const addApprovedUser = async (userData) => {
        try {
            const finalCompanyId = userData.companyId || activeCompanyId;
            const result = await callAdminApi('createUser', {
                username: userData.username,
                password: userData.password,
                role: userData.role,
                companyId: finalCompanyId
            });
            addLog('KULLANICI_EKLE', `${userData.username} kullanıcısı manuel olarak '${userData.role}' yetkisiyle eklendi`);
            return { ...userData, id: result.uid, status: 'approved', companyId: finalCompanyId, approvedAt: new Date().toISOString() };
        } catch (error) {
            console.error("Kullanıcı eklenirken hata:", error);
            alert("Kullanıcı eklenirken hata oluştu: " + error.message);
            throw error;
        }
    };

    const editUser = async (userId, updates) => {
        try {
            if (updates.password) {
                await callAdminApi('updateUserPassword', { uid: userId, newPassword: updates.password });
            }
            
            const cleanUpdates = { ...updates };
            delete cleanUpdates.password;
            
            if (Object.keys(cleanUpdates).length > 0) {
                await updateDoc(doc(db, 'approved_users', userId), cleanUpdates);
            }
            addLog('KULLANICI_DUZENLE', `Kullanıcı güncellendi: ${updates.username || 'Kullanıcı'}`);
        } catch (error) {
            console.error("Kullanıcı güncellenirken hata:", error);
            alert("Kullanıcı güncellenirken hata oluştu: " + error.message);
        }
    };

    const rejectUser = async (userId) => {
        const user = pendingUsers.find(u => u.id === userId);
        try {
            await callAdminApi('deleteUser', { uid: userId });
            addLog('KULLANICI_RED', `${user?.username || 'Kullanıcı'} başvurusu reddedildi`);
        } catch (error) {
            console.warn("API ile reddetme başarısız oldu, doğrudan veritabanı üzerinden deneniyor...", error);
            try {
                await deleteDoc(doc(db, 'pending_users', userId));
                addLog('KULLANICI_RED', `${user?.username || 'Kullanıcı'} başvurusu reddedildi (Yerel veritabanı üzerinden)`);
            } catch (fallbackError) {
                console.error("Doğrudan reddetme da başarısız oldu:", fallbackError);
                alert("Kullanıcı reddedilirken hata oluştu: " + error.message);
            }
        }
    };

    const deleteUser = async (userId) => {
        try {
            await callAdminApi('deleteUser', { uid: userId });
            addLog('KULLANICI_SIL', `Kullanıcı silindi`, { table: 'approved_users', id: userId });
        } catch (error) {
            console.warn("API ile silme başarısız oldu, doğrudan veritabanı üzerinden deneniyor...", error);
            try {
                await deleteDoc(doc(db, 'approved_users', userId));
                addLog('KULLANICI_SIL', `Kullanıcı silindi (Yerel veritabanı üzerinden)`);
            } catch (fallbackError) {
                console.error("Doğrudan silme da başarısız oldu:", fallbackError);
                alert("Kullanıcı silinirken hata oluştu: " + error.message);
                throw fallbackError;
            }
        }
    };

    const updateDocs = async (newDocs) => {
        if (!activeCompanyId || !activeTruckId) return;
        const docId = `${activeCompanyId}_${activeTruckId}_docs`;
        await setDoc(doc(db, 'company_data', docId), newDocs, { merge: true });
        addLog('BELGE_GUNCELLE', 'Belgeler/Ceza Listesi güncellendi');
    };

    const deleteDocField = async (fieldKey) => {
        if (!activeCompanyId || !activeTruckId) return;
        const docId = `${activeCompanyId}_${activeTruckId}_docs`;
        await updateDoc(doc(db, 'company_data', docId), {
            [fieldKey]: deleteField()
        });
        addLog('BELGE_SIL', 'Belge kaydı silindi');
    };

    const addPenalty = async (penalty) => {
        await addDoc(collection(db, 'penalties'), { ...penalty, companyId: activeCompanyId, truckId: activeTruckId, deleted: false });
        addLog('CEZA_EKLE', `${penalty.type} | ₺${penalty.amount}`);
    };

    const deletePenalty = async (id) => {
        const p = penalties.find(r => r.id === id);
        if (p) {
            await deleteDoc(doc(db, 'penalties', id));
            addLog('CEZA_SİL', `${p.type} | ₺${p.amount}`);
        }
    };

    const togglePenaltyPaid = async (id, currentStatus) => {
        await updateDoc(doc(db, 'penalties', id), { paid: !currentStatus });
        addLog('CEZA_DURUM', `Ceza durumu güncellendi (Ödendi: ${!currentStatus})`);
    }

    // Invoices CRUD
    const addInvoice = async (invoice) => {
        await addDoc(collection(db, 'invoices'), { ...invoice, companyId: activeCompanyId, truckId: activeTruckId, deleted: false, createdAt: new Date().toISOString() });
        addLog('FATURA_OLUSTUR', `${invoice.startDate} - ${invoice.endDate} periyodu için Fatura oluşturuldu.`);
    };

    const updateInvoice = async (id, updatedFields) => {
        await updateDoc(doc(db, 'invoices', id), updatedFields);
        addLog('FATURA_GUNCELLE', `Fatura ID: ${id} güncellendi.`);
    };

    const deleteInvoice = async (id) => {
        await deleteDoc(doc(db, 'invoices', id));
        addLog('FATURA_SIL', `Fatura silindi`, { table: 'Invoices', id });
    };

    // Payouts CRUD
    const addPayout = async (payout) => {
        await addDoc(collection(db, 'payouts'), { ...payout, companyId: activeCompanyId, truckId: activeTruckId, deleted: false, createdAt: new Date().toISOString() });
        addLog('ODEME_PIRIM_ONAY', `${payout.startDate} - ${payout.endDate} periyodu için Prim Hak Edişi onaylandı. Şoför: ${payout.driverName}`);
    };

    const updatePayout = async (id, updatedFields) => {
        await updateDoc(doc(db, 'payouts', id), updatedFields);
        addLog('ODEME_PIRIM_GUNCELLE', `Prim hakediş kaydı güncellendi.`);
    };

    const deletePayout = async (id) => {
        await deleteDoc(doc(db, 'payouts', id));
        addLog('ODEME_PIRIM_SIL', `Prim hakediş kaydı silindi`, { table: 'Payouts', id });
    };

    // Premiums CRUD
    const updatePremiums = async (newPremiums) => {
        const docId = activeCompanyId === 'inaner_logistics' ? 'info' : `${activeCompanyId}_info`;
        await setDoc(doc(db, 'company_data', docId), { premiums: newPremiums }, { merge: true });
        addLog('PRIM_SABLON_GUNCELLE', 'Prim şablonları güncellendi');
    };

    const clearLog = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'admin_logs'));
            const batch = writeBatch(db);
            querySnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            addLog('LOG_TEMIZLE', 'Admin logları temizlendi');
        } catch { /* empty */ }
    };

    const restoreData = async (table, id) => {
        const collMap = { 'Trips': 'trips', 'Fuel': 'fuel', 'Maintenance': 'maintenance', 'Payments': 'payments' };
        if (collMap[table]) {
            await updateDoc(doc(db, collMap[table], id), { deleted: false });
            addLog('GERI_YUKLE', `${table} tablosundan bir veri geri yüklendi`);
        }
    };

    const updateTruckImage = async (truckId, imageUrl) => {
        if (!truckId) return;
        try {
            await updateDoc(doc(db, 'trucks', truckId), { imageUrl });
            addLog('ARAC_RESIM_GUNCELLE', 'Araç profil resmi güncellendi');
        } catch { /* empty */ }
    };

    // Shopping List CRUD
    const addShoppingItem = async (item) => {
        const order = shoppingItems.length > 0 ? Math.max(...shoppingItems.map(i => i.order || 0)) + 1 : 0;
        await addDoc(collection(db, 'shopping_list'), {
            ...item,
            order,
            companyId: activeCompanyId,
            truckId: activeTruckId,
            createdAt: new Date().toISOString()
        });
        addLog('ALINACAK_EKLE', `${item.name} listeye eklendi`);
    };

    const updateShoppingItem = async (id, updates) => {
        await updateDoc(doc(db, 'shopping_list', id), updates);
        addLog('ALINACAK_GUNCELLE', `${updates.name || 'Ürün'} güncellendi`);
    };

    const deleteShoppingItem = async (id, name) => {
        await deleteDoc(doc(db, 'shopping_list', id));
        addLog('ALINACAK_SIL', `${name} listeden silindi`);
    };

    const updateShoppingItemsOrder = async (newOrderItems) => {
        const batch = writeBatch(db);
        newOrderItems.forEach((item, index) => {
            const itemRef = doc(db, 'shopping_list', item.id);
            batch.update(itemRef, { order: index });
        });
        await batch.commit();
        setShoppingItems(newOrderItems); // Optimistic update
    };

    // Geofences
    const addGeofence = async (geofence) => {
        if (!activeCompanyId) return;
        await addDoc(collection(db, 'geofences'), {
            ...geofence,
            companyId: activeCompanyId,
            createdAt: new Date().toISOString()
        });
        addLog('ISLEM_EKLE', `${geofence.name} adlı özel bölge eklendi`);
    };

    const updateGeofence = async (id, updatedData) => {
        if (!id) return;
        await updateDoc(doc(db, 'geofences', id), {
            ...updatedData,
            updatedAt: new Date().toISOString()
        });
        addLog('ISLEM_GUNCELLE', `${updatedData.name || 'Özel bölge'} güncellendi`);
    };

    const deleteGeofence = async (id, name) => {
        await deleteDoc(doc(db, 'geofences', id));
        addLog('ISLEM_SIL', `${name} adlı özel bölge silindi`);
    };

    // Manual Splits
    const addManualSplit = async (timestamp, truckId) => {
        if (!activeCompanyId) return;
        await addDoc(collection(db, 'manual_splits'), {
            timestamp,
            truckId,
            companyId: activeCompanyId,
            createdAt: new Date().toISOString()
        });
        addLog('ISLEM_EKLE', 'Manuel rota bölme noktası eklendi');
    };

    // Manual Merges
    const addManualMerge = async (timestamp, truckId) => {
        if (!activeCompanyId) return;
        await addDoc(collection(db, 'manual_merges'), {
            timestamp,
            truckId,
            companyId: activeCompanyId,
            createdAt: new Date().toISOString()
        });
        addLog('ISLEM_EKLE', 'Manuel rota birleştirme noktası eklendi');
    };

    // Manual Deletes
    const addManualDelete = async (timestamp, truckId) => {
        if (!activeCompanyId) return;
        await addDoc(collection(db, 'manual_deletes'), {
            timestamp,
            truckId,
            companyId: activeCompanyId,
            createdAt: new Date().toISOString()
        });
        addLog('ISLEM_SİL', 'Manuel rota silme işlemi yapıldı');
    };

    // Custom Route Names
    const setCustomRouteName = async (timestamp, name) => {
        if (!activeCompanyId) return;
        const q = query(collection(db, 'custom_route_names'), where('timestamp', '==', timestamp), where('companyId', '==', activeCompanyId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await updateDoc(doc(db, 'custom_route_names', snap.docs[0].id), { name });
        } else {
            await addDoc(collection(db, 'custom_route_names'), {
                timestamp,
                name,
                companyId: activeCompanyId
            });
        }
    };

    const acknowledgeNotification = useCallback(async (notificationId, status, note = '') => {
        return callAdminApi('acknowledgeNotification', { notificationId, status, note });
    }, [callAdminApi]);

    const markNotificationAsRead = useCallback(async (notificationId) => {
        return callAdminApi('markNotificationRead', { notificationId });
    }, [callAdminApi]);

    const deleteCompanyNotification = useCallback(async (notificationId) => {
        try {
            await deleteDoc(doc(db, 'company_notifications', notificationId));
            return { success: true };
        } catch (e) {
            console.error('Error deleting company notification:', e);
            throw e;
        }
    }, []);

    const clearAllCompanyNotifications = useCallback(async (notificationIds = []) => {
        try {
            const batch = writeBatch(db);
            const idsToDelete = notificationIds.length > 0 ? notificationIds : (companyNotifications || []).map(n => n.id);
            idsToDelete.forEach(id => {
                if (id) batch.delete(doc(db, 'company_notifications', id));
            });
            await batch.commit();
            return { success: true };
        } catch (e) {
            console.error('Error clearing all company notifications:', e);
            throw e;
        }
    }, [companyNotifications]);

    const refreshUsers = useCallback(() => { }, []);

    // Unified drivers list: merge manual drivers + approved şöför users
    const allDrivers = useMemo(() => {
        const userDrivers = (approvedUsers || []).filter(u => u.role === 'şoför').map(u => ({ id: u.id, name: u.username, phone: '', isSystem: true }));
        const manualNames = userDrivers.map(u => u.name.toLowerCase());
        // eslint-disable-next-line react-hooks/purity
        const manualDrivers = (drivers || []).filter(d => !manualNames.includes((d.name || '').toLowerCase())).map(d => ({ ...d, id: d.id || `manual_${Math.random().toString(36).substr(2, 9)}`, isSystem: false }));
        return [...userDrivers, ...manualDrivers];
    }, [approvedUsers, drivers]);

    return (
        <DataContext.Provider value={{
            trips, addTrip, deleteTrip, editTrip,
            fuelRecords, addFuel, deleteFuel, editFuel,
            maintenanceRecords, addMaintenance, deleteMaintenance, updateMaintenance,
            paymentRecords, addPayment, deletePayment, updatePayment,
            vehicleInfo, updateVehicleInfo,
            mechanics, addMechanic, deleteMechanic, updateMechanic,
            maintenanceFolders, addMaintenanceFolder, updateMaintenanceFolder, deleteMaintenanceFolder,
            routes, addRoute, deleteRoute, updateRoutePrice,
            savedTrackingRoutes, addSavedTrackingRoute, deleteSavedTrackingRoute, updateSavedTrackingRoute,
            adminLog, addLog, clearLog, restoreData,
            currentSession, loginSession, logoutSession, callAdminApi,
            pendingUsers, approvedUsers, registerUser, approveUser, rejectUser, editUser, refreshUsers, addApprovedUser, deleteUser,
            drivers, allDrivers, updateDrivers,
            docs, updateDocs, deleteDocField,
            spareParts, addSparePart, updateSparePart, deleteSparePart,
            sparePartCategories, addSparePartCategory,
            periodicMaintenanceItems, updatePeriodicMaintenanceItems,
            maintenanceTypes, updateMaintenanceTypes,
            penalties, addPenalty, deletePenalty, togglePenaltyPaid,
            invoices, addInvoice, updateInvoice, deleteInvoice,
            updateRoute,
            payouts, addPayout, deletePayout, updatePayout,
            premiums, updatePremiums,
            draftInvoice, saveDraftInvoice, clearDraftInvoice,
            routeHistory, saveRouteHistory,
            onlineUsers,
            shoppingItems, addShoppingItem, updateShoppingItem, deleteShoppingItem, updateShoppingItemsOrder,
            updateTruckImage,
            isDataLoading, dataError,
            geofences, addGeofence, updateGeofence, deleteGeofence,
            dailyNotes, updateDailyNote,
            manualSplits, addManualSplit,
            manualMerges, addManualMerge,
            manualDeletes, addManualDelete,
            customRouteNames, setCustomRouteName,
            companyNotifications, acknowledgeNotification, markNotificationAsRead,
            deleteCompanyNotification, clearAllCompanyNotifications
        }}>
            {children}
        </DataContext.Provider>
    );
};
