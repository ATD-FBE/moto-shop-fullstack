import React from 'react';
import Collapsible from '@/components/common/Collapsible.jsx';
import SectionForm from './section-form-collapsible/SectionForm.jsx';

export default function SectionFormCollapsible({ isExpanded, ...props }) {
    return (
        <Collapsible
            isExpanded={isExpanded}
            className="order-details-section-form-collapsible"
            showContextIndicator={false}
        >
            <SectionForm {...props} />
        </Collapsible>
    );
};
