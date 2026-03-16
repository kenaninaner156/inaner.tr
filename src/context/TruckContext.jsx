/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { CompanyContext } from './CompanyContext';


export const TruckContext = createContext();

export const TruckProvider = ({ children }) => {
    const { activeCompanyId } = useContext(CompanyContext);

    // Default to the migrated main truck
    const [activeTruckId, setActiveTruckId] = useState('truck_06ftn692');
    const [trucks, setTrucks] = useState([]);

    // Fetch all trucks for the active company
    useEffect(() => {
        if (!activeCompanyId) return;
        const unsub = onSnapshot(query(collection(db, 'trucks'), where('companyId', '==', activeCompanyId)), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setTrucks(data);

            // If the active truck isn't in this company, reset it to the first found truck
            if (data.length > 0 && !data.find(t => t.id === activeTruckId)) {
                setActiveTruckId(data[0].id);
            } else if (data.length === 0) {
                setActiveTruckId('');
            }
        });
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCompanyId]);

    const activeTruckData = useMemo(() => trucks.find(t => t.id === activeTruckId) || null, [trucks, activeTruckId]);



    return (
        <TruckContext.Provider value={{ activeTruckId, setActiveTruckId, trucks, activeTruckData }}>
            {children}
        </TruckContext.Provider>
    );
};

export const useTruck = () => useContext(TruckContext);
