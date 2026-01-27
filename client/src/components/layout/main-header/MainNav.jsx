import React, { useState, useRef } from 'react';
import cn from 'classnames';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import DropdownNav from './DropdownNav.jsx';

export default function MainNav({
    navigationMap,
    setActiveClass,
    setFeaturedClass,
    burgerMenuRef
}) {
    const [activeDropdownIdx, setActiveDropdownIdx] = useState(null);
    const mainNavItems = navigationMap.main;

    const getActivePaths = (navItem) => // Возвращает массив путей
        navItem.children 
            ? [...navItem.paths, ...navItem.children.flatMap(childNavItem => childNavItem.paths)]
            : navItem.paths;

    return (
        <nav className="main-nav">
            <ul>
                {mainNavItems.map((navItem, idx) => {
                    if ('children' in navItem) {
                        const navItemRef = useRef(null);

                        return (
                            <li
                                key={navItem.paths[0]}
                                ref={navItemRef}
                                className={cn('has-dropdown', setActiveClass(getActivePaths(navItem)))}
                                onMouseEnter={() => setActiveDropdownIdx(idx)}
                                onMouseLeave={() => setActiveDropdownIdx(null)}
                            >
                                <BlockableLink to={navItem.paths[0]}>{navItem.label}</BlockableLink>

                                <DropdownNav
                                    anchorRef={navItemRef}
                                    burgerMenuRef={burgerMenuRef}
                                    show={activeDropdownIdx === idx}
                                >
                                    <ul>
                                        {navItem.children.map(childNavItem => (
                                            <li
                                                key={childNavItem.paths[0]}
                                                className={setActiveClass(childNavItem.paths)}
                                            >
                                                <BlockableLink to={childNavItem.paths[0]}>
                                                    {childNavItem.label}
                                                    {childNavItem.countBadge && (
                                                        <span className="new-count"></span>
                                                    )}
                                                </BlockableLink>
                                            </li>
                                        ))}
                                    </ul>
                                </DropdownNav>
                            </li>
                        );
                    } else {
                        return (
                            <li
                                key={navItem.paths[0]}
                                className={cn(setFeaturedClass(navItem), setActiveClass(navItem.paths))}
                            >
                                <BlockableLink to={navItem.paths[0]}>{navItem.label}</BlockableLink>
                            </li>
                        );
                    }
                })}
            </ul>
        </nav>
    );
};
