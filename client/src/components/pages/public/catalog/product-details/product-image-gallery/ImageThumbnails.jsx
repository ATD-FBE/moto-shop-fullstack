import React from 'react';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import { DATA_LOAD_STATUS } from '@shared/constants.js';

const loadStatusMap = {
    [DATA_LOAD_STATUS.LOADING]: {
        icon: '⏳',
        iconClass: 'load',
        text: 'Загрузка данных товара...'
    },
    [DATA_LOAD_STATUS.ERROR]: {
        icon: '❌',
        iconClass: 'error',
        text: 'Ошибка сервера. Данные товара не доступны.',
        reloadBtn: true
    },
    [DATA_LOAD_STATUS.READY]: {
        icon: '✅',
        iconClass: 'ready',
        text: 'Данные товара загружены.'
    }
};

export default function ImageThumbnails({
    loadStatus,
    images,
    currentIdx,
    title,
    reloadData,
    onSelect
}) {
    const loadStatusData = loadStatusMap[loadStatus];

    if (loadStatus !== DATA_LOAD_STATUS.READY || !images.length) {
        return (
            <div className="thumbnails">
                <div className="product-details-load-status">
                    <p>
                        <span className={cn('icon', loadStatusData.iconClass)}>
                            {loadStatusData.icon}
                        </span>
                        {loadStatusData.text}
                    </p>

                    {loadStatusData.reloadBtn && (
                        <button className="reload-btn" onClick={reloadData} aria-label="Перезагрузить">
                            Повторить
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="thumbnails">
            {images.map((img, idx) => (
                <button
                    key={idx}
                    className={cn('image-thumb', { 'current': idx === currentIdx })}
                    onClick={() => onSelect(idx)}
                    aria-label={`${title}, выбрать привью изображения номер ${idx + 1}`}
                >
                    <TrackedImage
                        className="thumb-img"
                        src={img.original}
                        alt={`${title} (миниатюра ${idx + 1})`}
                    />
                </button>
            ))}
        </div>
    );
};
