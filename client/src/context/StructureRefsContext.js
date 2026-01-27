import React, { createContext, useContext, useRef } from 'react';

// Создание контекста и провайдера для рефов, которые нужно пробросить в любой дочерний компонент
const StructureRefsContext = createContext({});

export const StructureRefsProvider = ({ children }) => {
    const mainHeaderRef = useRef(null);
    const mainFooterRef = useRef(null);

    return (
        <StructureRefsContext.Provider value={{ mainHeaderRef, mainFooterRef }}>
            {children}
        </StructureRefsContext.Provider>
    );
};

export const useStructureRefs = () => useContext(StructureRefsContext);
