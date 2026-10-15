import React, { createContext, useState, useEffect, useContext, useMemo, useRef } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { CompanyContext } from './CompanyContext';


export const TruckContext = createContext();

export const TruckProvider = ({ children }) => {
    const { activeCompanyId } = useContext(CompanyContext);

    // Aktif çekici kimliğini localStorage ile senkronize et
    const [activeTruckId, setActiveTruckIdState] = useState(() => {
        return localStorage.getItem('tir_active_truck_id') || 'truck_06ftn692';
    });
    const lastSwitchTimeRef = useRef(0);

    const setActiveTruckId = (id) => {
        setActiveTruckIdState(id);
        if (id) {
            localStorage.setItem('tir_active_truck_id', id);
        }
    };

    const [trucks, setTrucks] = useState([]);

    // Fetch all trucks for the active company
    useEffect(() => {
        // Çevrimdışı / USB Disk Modu Denetimi
        if (typeof window !== 'undefined' && (window.__INANER_OFFLINE_DB__ || window.location.port === '3456')) {
            const allTrucks = window.__INANER_OFFLINE_DB__?.trucks || [];
            const companyTrucks = allTrucks.filter(t => (!activeCompanyId || t.companyId === activeCompanyId) && !t.deleted);
            setTrucks(companyTrucks);

            const savedId = localStorage.getItem('tir_active_truck_id');
            if (companyTrucks.length > 0) {
                if (savedId && companyTrucks.some(t => t.id === savedId)) {
                    setActiveTruckIdState(savedId);
                } else {
                    setActiveTruckIdState(companyTrucks[0].id);
                }
            } else {
                setActiveTruckIdState('');
            }
            return;
        }

        const hasSession = !!localStorage.getItem('tir_auth_kenan_v1');
        if (!hasSession || !activeCompanyId) return;

        const unsub = onSnapshot(query(collection(db, 'trucks'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setTrucks(data);

            const savedId = localStorage.getItem('tir_active_truck_id');
            // Eğer kayıtlı tır bu şirkette mevcutsa koru, değilse listenin ilk tırına geç
            if (data.length > 0) {
                if (savedId && data.some(t => t.id === savedId)) {
                    setActiveTruckIdState(savedId);
                } else if (!data.some(t => t.id === activeTruckId)) {
                    setActiveTruckId(data[0].id);
                }
            } else if (data.length === 0) {
                setActiveTruckId('');
            }
        });
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCompanyId]);

    const activeTruckData = useMemo(() => trucks.find(t => t.id === activeTruckId) || null, [trucks, activeTruckId]);

    const switchNextTruck = () => {
        const now = Date.now();
        if (now - lastSwitchTimeRef.current < 450) {
            return null;
        }
        lastSwitchTimeRef.current = now;

        if (!trucks || trucks.length <= 1) return null;
        const currentIndex = trucks.findIndex(t => t.id === activeTruckId);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % trucks.length;
        const nextTruck = trucks[nextIndex];
        if (nextTruck) {
            setActiveTruckId(nextTruck.id);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate(35); } catch { /* ignore */ }
            }
            return nextTruck;
        }
        return null;
    };

    return (
        <TruckContext.Provider value={{ activeTruckId, setActiveTruckId, trucks, activeTruckData, switchNextTruck }}>
            {children}
        </TruckContext.Provider>
    );
};

export const useTruck = () => useContext(TruckContext);
