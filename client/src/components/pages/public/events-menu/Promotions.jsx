import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import PromoTimer from './promotions/PromoTimer.jsx';
import { openConfirmModal } from '@/services/modalConfirmService.js';
import { sendPromoListRequest, sendPromoDeleteRequest } from '@/api/promoRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { DATA_LOAD_STATUS, REQUEST_STATUS } from '@shared/constants.js';
 
export default function Promotions() {
    const { isAuthenticated, user } = useSelector(state => state.auth);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [promoList, setPromoList] = useState([]);

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    const userRole = user?.role ?? 'guest';
    const isPrivilegedUser = isAuthenticated && ['admin'].includes(userRole);

    const loadStatus =
        loading
            ? DATA_LOAD_STATUS.LOADING
            : loadError
                ? DATA_LOAD_STATUS.ERROR
                : !promoList.length
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const loadPromos = async () => {
        setLoadError(false);
        setLoading(true);

        const requestArgs = [isAuthenticated];

        if (!isPrivilegedUser) {
            const timestamp = new Date().getTime();
            const timeZoneOffset = new Date().getTimezoneOffset();
            const params = new URLSearchParams({ timestamp, timeZoneOffset });
            const urlParams = params.toString();

            requestArgs.push(urlParams);

            if (location.search !== `?${urlParams}`) {
                const newUrl = `${location.pathname}?${urlParams}`;
                navigate(newUrl, { replace: true });
            }
        }

        const { status, message, promoList } = await dispatch(sendPromoListRequest(...requestArgs));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'PROMO: LOAD LIST', status, message });
        
        if (status !== REQUEST_STATUS.SUCCESS) {
            setLoadError(true);
        } else {
            setPromoList(promoList);
        }

        setLoading(false);
    }

    const reloadPromos = async () => {
        await loadPromos();
    };

    const editPromo = (promoId) => {
        navigate(routeConfig.adminEvents.paths[0], { state: { promoId } });
    };

    const confirmPromoDeletion = (promo) => {
        if (!promo) return;

        const processPromoDeletion = async (promoId) => {
            const { status, message } = await dispatch(sendPromoDeleteRequest(promoId));
            if (isUnmountedRef.current) return;
    
            logRequestStatus({ context: 'PROMO: DELETE', status, message });
    
            const isAllowed = [REQUEST_STATUS.SUCCESS, REQUEST_STATUS.NOT_FOUND].includes(status);
            if (!isAllowed) throw new Error(message);
        };
    
        const finalizePromoDeletion = (promoId) => {
            setPromoList(prev => prev.filter(promo => promo.id !== promoId));
        }

        openConfirmModal({
            prompt: `Удалить акцию «${promo.title}»?`,
            onConfirm: () => processPromoDeletion(promo.id),
            onFinalize: () => finalizePromoDeletion(promo.id)
        });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Стартовая загрузка акций, при разлогинивании акции также перезагружаются
    useEffect(() => {
        loadPromos();
    }, [isPrivilegedUser]);

    return (
        <div className="promos-page">
            <header className="promos-header">
                <h2>Акции магазина</h2>
            </header>

            <PromotionsMain
                isPrivilegedUser={isPrivilegedUser}
                loadStatus={loadStatus}
                reloadPromos={reloadPromos}
                promoList={promoList}
                editPromo={editPromo}
                confirmPromoDeletion={confirmPromoDeletion}
            />
        </div>
    );
}

function PromotionsMain({
    isPrivilegedUser,
    loadStatus,
    reloadPromos,
    promoList,
    editPromo,
    confirmPromoDeletion
}) {
    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div className="promos-main">
                <div className="promos-load-status">
                    <p>
                        <span className="icon load">⏳</span>
                        Загрузка акций...
                    </p>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div className="promos-main">
                <div className="promos-load-status">
                    <p>
                        <span className="icon error">❌</span>
                        Ошибка сервера. Акции не доступны.
                    </p>
                    <button className="reload-btn" onClick={reloadPromos}>Повторить</button>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div className="promos-main">
                <div className="promos-load-status">
                    <p>
                        <span className="icon not-found">🔎</span>
                        На данный момент акции отсутствуют.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="promos-main">
            <ul className="promo-list">
                {promoList.map(promo => (
                    <li key={promo.id} className="promo-item">
                        <PromoCard
                            promo={promo}
                            isPrivilegedUser={isPrivilegedUser}
                            editPromo={editPromo}
                            confirmPromoDeletion={confirmPromoDeletion}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function PromoCard({ promo, isPrivilegedUser, editPromo, confirmPromoDeletion }) {
    const {
        id, title, image, description, startDate, endDate, createdBy, createdAt, updateHistory
    } = promo;

    const startDateNoTZ = startDate.slice(0, -1);
    const endDateNoTZ = endDate.slice(0, -1);
    const now = new Date();
    const start = new Date(startDateNoTZ);
    const end = new Date(endDateNoTZ);

    const promoActivity = now < start ? 'not-started' : now > end ? 'ended' : 'active';

    const dayTimestamp = 24 * 60 * 60 * 1000;
    const isOneDayAction = end.getTime() - start.getTime() <= dayTimestamp;
    
    const promoDatesFormatOpts = { day: '2-digit', month: '2-digit', year: 'numeric' };

    const formatLocalDate = (date, format = {}) => new Date(date)?.toLocaleString(undefined, format);

    return (
        <article data-id={id} className={cn('promo-card', promoActivity)}>
            <h2 className="promo-title">{title}</h2>

            {image && (
                <TrackedImage src={image} className="promo-image" alt={title} />
            )}

            <div className="promo-description">
                {description.split(/\r?\n/).map((paragraph, idx) =>
                    paragraph
                        ? <p key={`${id}-${idx}`}>{paragraph}</p>
                        : <br key={`${id}-${idx}`} />
                )}
            </div>

            <p className="promo-dates">
                Акция действует:
                <span className="dates-display">
                    {isOneDayAction
                        ? formatLocalDate(startDateNoTZ, promoDatesFormatOpts)
                        : `с ${formatLocalDate(startDateNoTZ, promoDatesFormatOpts)}
                           по ${formatLocalDate(endDateNoTZ, promoDatesFormatOpts)}`
                    }
                </span>
            </p>

            <PromoTimer startDate={startDateNoTZ} endDate={endDateNoTZ} />

            {isPrivilegedUser && (
                <>
                    <div className="promo-meta">
                        <p>Автор: {createdBy} ({formatLocalDate(createdAt)})</p>
                        {updateHistory.length > 0 && (
                            <p>
                                Редактор(ы): {' '}
                                {updateHistory
                                    .map(upd => `${upd.updatedBy} (${formatLocalDate(upd.updatedAt)})`)
                                    .join(', ')}
                            </p>
                        )}
                    </div>

                    <div className="promo-controls">
                        <button
                            className="edit-promo-btn"
                            onClick={() => editPromo(id)}
                        >
                            <span className="icon">🖊</span>
                            Редактировать
                        </button>

                        <button
                            className="delete-promo-btn"
                            onClick={() => confirmPromoDeletion({ id, title })}
                        >
                            <span className="icon">❌</span>
                            Удалить
                        </button>
                    </div>
                </>
            )}
        </article>
    );
}
