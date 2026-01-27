import React, { useState, useRef } from 'react';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';

export default function ImageUploader({
    images,
    onZoom,
    onMainSelect,
    onDeleteToggle,
    fileInputRef,
    onFilesDropped,
    uiBlocked
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = (e) => {
        e.preventDefault();
        dragCounterRef.current += 1;
        setIsDragOver(true);
    };
    
    const handleDragLeave = (e) => {
        e.preventDefault();
        dragCounterRef.current -= 1;
        if (!dragCounterRef.current) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (uiBlocked) return;

        dragCounterRef.current = 0;
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length) {
            onFilesDropped(files);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            className={cn('image-uploader-grid', { 'drag-active': isDragOver && !uiBlocked })}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            disabled={uiBlocked}
        >
            {/* Показ миниатюр */}
            {images.map((img, idx) => (
                <div
                    key={idx}
                    className={cn(
                        'image-thumb',
                        { 'new': img.type === 'new' },
                        { 'main': img.main },
                        { 'faded': img.markedForDeletion },
                        { 'invalid': img.invalid }
                    )}
                >
                    <TrackedImage
                        className="thumb-img"
                        src={img.previewUrl}
                        alt={`${img.title} (миниатюра ${idx + 1})`}
                        onClick={() => onZoom(idx)}
                        aria-label="Просмотр изображения в масштабе"
                    />
            
                    <div className="checkbox-wrapper select-main">
                        <DesignedCheckbox
                            checked={img.main}
                            onChange={() => !img.main && onMainSelect(idx)}
                            disabled={uiBlocked || img.markedForDeletion || img.invalid}
                        />
                    </div>
            
                    <div className="checkbox-wrapper delete">
                        <DesignedCheckbox
                            checkIcon="❌"
                            checkIconColor="red"
                            checked={img.markedForDeletion}
                            onChange={() => onDeleteToggle(idx)}
                            disabled={uiBlocked}
                        />
                    </div>
                </div>
            ))}
        
            {/* Кнопка для добавления новых картинок */}
            <button
                type="button"
                className={cn('add-thumb-btn', { 'drag-active': isDragOver && !uiBlocked })}
                aria-label="Добавить фото товара"
                onClick={() => fileInputRef.current?.click()}
                disabled={uiBlocked}
            >
                <span className="icon">➕</span>
            </button>
        </div>
    );
};
