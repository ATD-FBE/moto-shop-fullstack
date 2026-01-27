import React  from 'react';
import CheckboxCollapsible from '@/components/common/CheckboxCollapsible.jsx';
import InternalNoteForm from './internal-note-panel/InternalNoteForm.jsx';

export default function InternalNotePanel({ orderId, internalNote }) {
    return (
        <div className="internal-note-panel">
            <div className="internal-note-panel-title">
                <h4>Внутренняя заметка</h4>
            </div>

            <div className="internal-note-panel-container">
                <CheckboxCollapsible
                    checkboxLabel="Редактировать заметку"
                    contentClass="internal-note-form"
                >
                    <InternalNoteForm
                        orderId={orderId}
                        internalNote={internalNote}
                    />
                </CheckboxCollapsible>
            </div>
        </div>
    );
};
