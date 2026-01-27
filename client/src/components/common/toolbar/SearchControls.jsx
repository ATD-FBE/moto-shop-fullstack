import React, { useState } from 'react';

export default function SearchControls({ placeholder = '', uiBlocked, search, setSearch }) {
    const [currentSearch, setCurrentSearch] = useState(search);

    const handleSearch = () => {
        const normalizedSearch = currentSearch.trim();

        if (normalizedSearch !== search) {
            setSearch(normalizedSearch);
        }
    };

    return (
        <div className="search-controls">
            <label htmlFor="search">Поиск: </label>
            
            <input
                id="search"
                type="search"
                placeholder={placeholder}
                title={placeholder}
                value={currentSearch}
                autoComplete="off"
                onChange={(e) => setCurrentSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                disabled={uiBlocked}
            />

            <button
                className="search-btn"
                onClick={handleSearch}
                disabled={uiBlocked || currentSearch.trim() === search}
            >
                Найти
            </button>
        </div>
    );
};
