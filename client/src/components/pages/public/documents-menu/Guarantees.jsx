import React from 'react';
 
export default function Guarantees() {
    return (
        <div className="guarantees-page">
            <header className="guarantees-header">
                <h2>Гарантийные обязательства</h2>
            </header>

            <div className="guarantees-main">
                <p>
                    Информация о гарантийных обязательствах магазина и условиях их применения.<br />
                    Описаны случаи действия гарантии и предусмотренные ограничения.
                </p>
                <p>
                    <a
                        href="docs/guarantees.pdf"
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="doc-link"
                    >
                        <span className="icon">📄</span>
                        Документ в формате PDF
                    </a>
                </p>
            </div>
        </div>
    );
};
