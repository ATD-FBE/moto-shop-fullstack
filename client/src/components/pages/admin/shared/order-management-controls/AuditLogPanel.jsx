import React, { useState, useEffect }  from 'react';
import CheckboxCollapsible from '@/components/common/CheckboxCollapsible.jsx';
import { formatAuditLogs } from '@/services/orderService.js';

export default function AuditLogPanel({ auditLog }) {
    const [logs, setLogs] = useState('');

    useEffect(() => {
        setLogs(formatAuditLogs(auditLog));
    }, [auditLog]);

    return (
        <div className="audit-logs-panel">
            <div className="audit-logs-panel-title">
                <h4>Изменения в заказе</h4>
            </div>

            <div className="audit-logs-panel-container">
                <CheckboxCollapsible
                    checkboxLabel="История правок"
                    contentClass="logs"
                >
                    <textarea
                        className="logs"
                        value={logs}
                        readOnly
                        spellCheck={false}
                    >
                    </textarea>
                </CheckboxCollapsible>
            </div>
        </div>
    );
};
