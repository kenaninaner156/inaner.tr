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

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'companies'), (snapshot) => {
            setCompanies(snapshot.docs.map(doc => ({ ...doc.data(), docRefId: doc.id })));
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!activeCompanyId) return;
        const unsub = onSnapshot(query(collection(db, 'companies'), where('id', '==', activeCompanyId)), (snapshot) => {
            if (!snapshot.empty) {
                setCompanyData(snapshot.docs[0].data());
            }
        });
        return () => unsub();
    }, [activeCompanyId]);

    return (
        <CompanyContext.Provider value={{ activeCompanyId, setActiveCompanyId, companyData, companies }}>
            {children}
        </CompanyContext.Provider>
    );
};

export const useCompany = () => useContext(CompanyContext);
