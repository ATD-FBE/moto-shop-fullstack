import React from 'react';

export default function BackgroundImage() {
    return (
        <div className="background-wrapper">
            <picture>
                <source srcSet="/images/body_background.webp" type="image/webp" />
                <source srcSet="/images/body_background.jpg" type="image/jpeg" />
                <img
                    src="/images/body_background.jpg"
                    alt=""
                    className="bg-img"
                    role="presentation"
                    aria-hidden="true"
                />
            </picture>
            <div className="overlay"></div>
        </div>
    );
};
