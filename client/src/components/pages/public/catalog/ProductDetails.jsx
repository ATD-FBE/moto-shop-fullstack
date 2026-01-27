import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ProductImageGallery from './product-details/ProductImageGallery.jsx';
import ProductInfo from './product-details/ProductInfo.jsx';
import { sendProductRequest } from '@/api/productRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { parseRouteParams } from '@/helpers/routeHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { formatProductTitle } from '@/helpers/textHelpers.js';
import generateSlug from '@/helpers/generateSlug.js';
import { reconcileCartWithProducts } from '@/services/cartService.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { DATA_LOAD_STATUS, REQUEST_STATUS, NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function ProductDetails() {
    const isTouchDevice = useSelector(state => state.ui.isTouchDevice);

    const { isAuthenticated, user } = useSelector(state => state.auth);
    const userRole = user?.role ?? 'guest';

    const [productLoading, setProductLoading] = useState(true);
    const [productLoadError, setProductLoadError] = useState(false);
    const [product, setProduct] = useState(null);

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const { sku, productId } = parseRouteParams({
        routeKey: 'productDetails',
        params: useParams(),
        routeConfig
    });

    const productLoadStatus =
        productLoading
            ? DATA_LOAD_STATUS.LOADING
            : productLoadError
                ? DATA_LOAD_STATUS.ERROR
                : DATA_LOAD_STATUS.READY;
       
    const {
        images, mainImageIndex, name, brand, description, available,
        isBrandNew, isRestocked, unit, price, discount: productDiscount, isActive
    } = product ?? {};

    const title = formatProductTitle(name, brand);

    const loadProduct = async () => {
        setProductLoadError(false);
        setProductLoading(true);

        const responseData = await dispatch(sendProductRequest(isAuthenticated, productId));
        if (isUnmountedRef.current) return;

        const { status, message, product } = responseData;
        logRequestStatus({ context: 'PRODUCT: LOAD SINGLE', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setProductLoadError(true);
        } else {
            setProduct(product);
            dispatch(reconcileCartWithProducts([product]));

            const { id, sku, name, brand } = product;
            const title = formatProductTitle(name, brand);
            const slug = generateSlug(title);
            const updatedUrl = routeConfig.productDetails.generatePath({ slug, sku, productId: id });

            if (location.pathname !== updatedUrl) {
                navigate(updatedUrl, { replace: true });
            }
        }

        setProductLoading(false);
    };

    // Стартовая загрузка товара и очистка при размонтировании
    useEffect(() => {
        loadProduct();

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <div className="product-details-page">
            <header className="product-details-header">
                <h2>
                    {product
                        ? <>{title}{isBrandNew && <span className="brand-new">Новинка!</span>}</>
                        : NO_VALUE_LABEL}
                </h2>
            </header>

            <div className="product-details-main">
                <ProductImageGallery
                    loadStatus={productLoadStatus}
                    images={images ?? []}
                    mainImageIndex={mainImageIndex ?? 0}
                    title={title}
                    reloadData={loadProduct}
                />

                <ProductInfo
                    id={productId}
                    sku={sku ?? NO_VALUE_LABEL}
                    name={name ?? NO_VALUE_LABEL}
                    brand={brand ?? NO_VALUE_LABEL}
                    description={description ?? NO_VALUE_LABEL}
                    available={available ?? 0}
                    unit={unit ?? NO_VALUE_LABEL}
                    price={price ?? 0}
                    productDiscount={productDiscount ?? 0}
                    customerDiscount={user?.discount ?? 0}
                    isRestocked={isRestocked ?? false}
                    isActive={isActive ?? false}
                    isTouchDevice={isTouchDevice}
                    isAuthenticated={isAuthenticated}
                    userRole={userRole}
                    uiBlocked={productLoadStatus !== DATA_LOAD_STATUS.READY}
                />
            </div>
        </div>
    );
};
