export const buildNavigationMap = (routeConfig) => {
    const navigationMap = {};

    // Создание элемента меню навигации
    const buildNavItem = (route) => {
        const { label, paths, nav } = route;
        const navItem = { label, paths };
    
        if (nav === undefined) return navItem;
    
        const { order, type, featured, badge } = nav;
    
        if (order !== undefined) navItem.order = order;
        if (type !== undefined) navItem.type = type;
        if (featured !== undefined) navItem.featured = featured;
        if (badge !== undefined) navItem.badge = badge;
    
        return navItem;
    };

    // Рекурсивная функция для сборки потомков без мутаций
    const buildNavChildren = (routeConfig, childKeys) =>
        childKeys
            .map(key => {
                const childRoute = routeConfig[key];
                if (!childRoute) {
                    console.warn(`Route "${key}" not found in route config`);
                    return null;
                }

                const childNavItem = buildNavItem(childRoute);
                const children = childRoute.nav?.children;

                if (children) {
                    childNavItem.children = buildNavChildren(routeConfig, children);
                }

                return childNavItem;
            })
            .filter(Boolean);

    // Основная функция сборки navigationMap
    const populateNavigationMap = (routeConfig, navigationMap) => {
        Object.values(routeConfig).forEach(route => {
            const { nav } = route;
            if (nav === undefined) return;
    
            const { map, order, children } = nav;
            if (map === undefined || order === undefined) return;
    
            const topNavItem = buildNavItem(route);
    
            if (children) {
                topNavItem.children = buildNavChildren(routeConfig, children);
            }
    
            navigationMap[map] ??= [];
            navigationMap[map].push(topNavItem);
        });
    };

    // Сортировка пунктов каждого меню по order
    const sortNavigationItems = (navigationMap) => {
        Object.values(navigationMap).forEach(items => {
            items.sort((a, b) => a.order - b.order);
        });
    };

    // Функция расширения карт меню авторизации
    const buildAuthNavSections = (routeConfig, navigationMap) => {
        const USER_ROLES = ['guest', 'admin', 'customer'];

        USER_ROLES.forEach(userRole => {
            if (userRole === 'guest') {
                navigationMap[`${userRole}Auth`] = navigationMap[`${userRole}Auth`] || [];
            } else {
                navigationMap[`${userRole}Auth`] = [
                    {
                        type: 'userLabel',
                        label: 'Вы вошли как',
                        paths: routeConfig[`${userRole}Profile`].paths
                    },
                    {
                        type: 'logout',
                        label: 'Выйти'
                    }
                ];
            }
        });
    };
           
    // Сборка и финализация карты навигации
    populateNavigationMap(routeConfig, navigationMap);
    sortNavigationItems(navigationMap);
    buildAuthNavSections(routeConfig, navigationMap);

    return navigationMap;
};

export const buildBreadcrumbMap = (routeConfig) => {
    return Object.values(routeConfig).reduce((acc, route) => {
        route.paths.forEach(path => {
            acc[path] = {
                label: route.label,
                parentPath: route.parent ? routeConfig[route.parent].paths[0] : null,
                ...(route.generatePath && { generatePath: route.generatePath }),
                ...(route.paramSchema && { paramSchema: route.paramSchema })
            };
        });

        return acc;
    }, {});
};

export function parseRouteParams({ routeKey, params, routeConfig }) {
    const route = routeConfig[routeKey];
    if (!route?.paramSchema) return {};

    const result = {};

    for (const [paramName, schema] of Object.entries(route.paramSchema)) {
        const rawValue = params[paramName];
        if (rawValue == null) continue;

        // Простой параметр без схемы
        if (!schema.split || !schema.map) {
            result[paramName] = rawValue;
            continue;
        }

        // Сбор значений параметров по схеме
        const parts = rawValue.split(schema.split);

        schema.map.forEach((key, idx) => {
            result[key] = parts[idx] || null;
        });
    }

    return result;
};
