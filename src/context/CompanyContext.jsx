/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { db } from '../services/firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';


export const CompanyContext = createContext();

export const CompanyProvider = ({ children }) => {
    // Session bazlı dinamik başlangıç firması
    const [activeCompanyId, setActiveCompanyId] = useState(() => {
        return localStorage.getItem('tir_current_company') || 'inaner_logistics';
    });
    const [companyData, setCompanyData] = useState(null);
    const [companies, setCompanies] = useState([]);

    // 1. Sirketler Listesini Dinle (Tek dinleyici, sirket degisiminde tekrar sorgu atmaz)
    useEffect(() => {
        // Cevrimdisi / USB Disk Modu Denetimi
        if (typeof window !== 'undefined' && (window.__INANER_OFFLINE_DB__ || window.location.port === '3456')) {
            const defaultCompany = { id: 'inaner_logistics', name: 'Inaner Logistics', personnelEnabled: true, mapEnabled: true, earsivEnabled: true };
            const offCompanies = window.__INANER_OFFLINE_DB__?.companies || [
                defaultCompany
            ];
            setCompanies(offCompanies);
            const currentComp = offCompanies.find(c => c.id === activeCompanyId) || defaultCompany;
            setCompanyData(currentComp);
            return;
        }

        // Only establish onSnapshot listeners if the user is authenticated
        const hasSession = !!localStorage.getItem('tir_auth_kenan_v1');
        if (!hasSession) return;

        const unsub = onSnapshot(collection(db, 'companies'), (snapshot) => {
            const list = snapshot.docs.map(doc => ({ ...doc.data(), docRefId: doc.id }));
            setCompanies(list);
        });
        return () => unsub();
    }, []);

    // 2. Aktif Sirket Verisini Yerel Bellekten Esle (Firestore'a ek sorgu atilmaz)
    useEffect(() => {
        if (!activeCompanyId) return;
        const current = companies.find(c => c.id === activeCompanyId);
        if (current) {
            setCompanyData(current);
        }
    }, [activeCompanyId, companies]);

    return (
        <CompanyContext.Provider value={{ activeCompanyId, setActiveCompanyId, companyData, companies }}>
            {children}
        </CompanyContext.Provider>
    );
};

export const useCompany = () => useContext(CompanyContext);
