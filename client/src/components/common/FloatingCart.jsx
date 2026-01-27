import React, { useState, useEffect } from 'react';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import CartBadge from '@/components/common/badges/CartBadge.jsx';
import { routeConfig } from '@/config/appRouting.js';
import { useStructureRefs } from '@/context/StructureRefsContext.js';

const MIN_BOTTOM_OFFSET = 20;

export default function FloatingCart() {
    const { mainFooterRef } = useStructureRefs();
    const [bottomOffset, setBottomOffset] = useState(MIN_BOTTOM_OFFSET);

    useEffect(() => {
        const observer = new IntersectionObserver(
            // Коллбэк
            ([entry]) => {
                const visibleFooterHeight = entry.intersectionRect.height;
                const offset = Math.max(MIN_BOTTOM_OFFSET, Math.ceil(visibleFooterHeight + 5));
                setBottomOffset(offset);
            },

            // Условие вызова колбэка - достижение порога видимости элемента в процентах (100 делений)
            {
                threshold: Array.from({ length: 101 }, (_, i) => i / 100) // [0, 0.01, 0.02, ..., 1]
            }
        );

        if (mainFooterRef.current) observer.observe(mainFooterRef.current);

        return () => observer.disconnect();
    }, []);

    return (
        <div className="floating-cart" style={{ bottom: `${bottomOffset}px` }}>
            <CartBadge />

            <BlockableLink className="cart-link" to={routeConfig.customerCart.paths[0]}>
                <span className="icon">🛒</span>
            </BlockableLink>
        </div>
    );
};
