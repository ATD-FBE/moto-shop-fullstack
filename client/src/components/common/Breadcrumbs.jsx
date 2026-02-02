import React from 'react';
import { useSelector } from 'react-redux';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { breadcrumbMap } from '@/config/appRouting.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { SCREEN_SIZE } = CLIENT_CONSTANTS;

export default function Breadcrumbs({ path }) {
    const { screenSize } = useSelector(state => state.ui);

    const normalizedPath = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;

    // Поиск шаблона в карте хлебных крошек, подходящий под текущий path
    const matchedRoutePattern = Object.keys(breadcrumbMap)
        .sort(pattern => (pattern === '*' ? 1 : -1))
        .find(pattern => {
            if (pattern === '*') return true; // Выход из тестирования, если паттерн для notFound

            const regexPattern =
                pattern
                    .replace(/[\/.*+?^${}|\[\]()\\]/g, '\\$&') // Экранирование символов
                    .replace(/:[^\/]+/g, '[^/]+'); // Замена динамических путей
            const regex = new RegExp('^' + regexPattern + '$');
            return regex.test(normalizedPath);
        });

    // Функция для извлечения параметров из адресной строки
    const extractParams = (pattern, path, paramSchema = {}) => {
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');
    
        const params = {};
    
        patternParts.forEach((part, idx) => {
            if (!part.startsWith(':')) return;
    
            const key = part.slice(1);
            const rawValue = pathParts[idx];
    
            const schema = paramSchema[key];
    
            if (!schema) {
                params[key] = rawValue;
                return;
            }
    
            const chunks = rawValue.split(schema.split);
    
            schema.map.forEach((name, idx) => {
                params[name] = chunks[idx];
            });
        });
    
        return params;
    };

    // Построение цепочки "хлебных крошек" для динамических и обычных маршрутов
    const buildBreadcrumbTrail = (fullPattern) => {
        const trail = [];
        let currentPattern = fullPattern;

        while (currentPattern && breadcrumbMap[currentPattern]) {
            const node = breadcrumbMap[currentPattern];
            const params = extractParams(currentPattern, normalizedPath, node.paramSchema);
            
            const nodeLabel = typeof node.label === 'function' ? node.label(params) : node.label;
            const nodePath = node.generatePath ? node.generatePath(params) : currentPattern;

            trail.unshift({ label: nodeLabel, path: nodePath });
            currentPattern = node.parentPath;
        }

        return trail;
    };

    const trail = matchedRoutePattern ? buildBreadcrumbTrail(matchedRoutePattern) : [];

    if (trail.length <= 1) return null;

    return (
        <nav className="breadcrumbs-nav">
            {screenSize === SCREEN_SIZE.XS ? (
                <BlockableLink to={trail.at(-2).path} className="prev-link-crumb">
                    <span className="icon">❮</span>
                    <span className="label">{trail.at(-2).label}</span>
                </BlockableLink>
            ) : (
                <ul>
                    {trail.map((crumb, idx) => {
                        const isFirst = idx === 0;
                        const isLast = idx === trail.length - 1;
    
                        return (
                            <li key={`${crumb.path}-${idx}`}>
                                {!isFirst && <span className="breadcrumb-separator">›</span>}
    
                                {isLast ? (
                                    <span className="last-crumb">{crumb.label}</span>
                                ) : (
                                    <BlockableLink to={crumb.path} className="link-crumb">
                                        {crumb.label}
                                    </BlockableLink>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </nav>
    );
};
