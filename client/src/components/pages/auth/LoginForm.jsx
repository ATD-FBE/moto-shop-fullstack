import React, { useMemo, useReducer, useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import cn from 'classnames';
import FormFooter from '@/components/common/FormFooter.jsx';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';
import { validationRules, fieldErrorMessages } from '@shared/fieldRules.js';
import { sendAuthLoginRequest } from '@/api/authRequests.js';
import { setIsNavigationBlocked } from '@/redux/slices/uiSlice.js';
import { login, resetSuppressAuthRedirect } from '@/redux/slices/authSlice.js';
import { prepareGuestCartPayload } from '@/services/guestCartService.js';
import { saveUserToLocalStorage, initCustomerSession } from '@/services/authService.js';
import { routeConfig } from '@/config/appRouting.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, FIELD_UI_STATUS, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = () => {
    const { DEFAULT, UNAUTH, BAD_REQUEST, INVALID, ERROR, NETWORK, SUCCESS } = FORM_STATUS;
    const base = BASE_SUBMIT_STATES;
    const actionLabel = 'Войти';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: actionLabel },
        [UNAUTH]: {
            ...base[UNAUTH],
            icon: '⚠️',
            mainMessage: 'Некорректные данные.',
            addMessage: 'Исправьте ошибки в форме.',
            submitBtnLabel: actionLabel,
            locked: false
        },
        [BAD_REQUEST]: { ...base[BAD_REQUEST], submitBtnLabel: actionLabel },
        [INVALID]: { ...base[INVALID], submitBtnLabel: actionLabel },
        [ERROR]: { ...base[ERROR], submitBtnLabel: actionLabel },
        [NETWORK]: { ...base[NETWORK], submitBtnLabel: actionLabel },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Вход выполнен успешно!',
            addMessage: 'Вы будете перенаправлены на главную страницу.',
            submitBtnLabel: 'Перенаправление...'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

const { submitStates, lockedStatuses } = getSubmitStates();

const fieldConfigs = [
    {
        name: 'name',
        label: 'Имя',
        elem: 'input',
        type: 'text',
        placeholder: 'Укажите имя пользователя',
        autoComplete: 'on',
        trim: true
    },
    {
        name: 'password',
        label: 'Пароль',
        elem: 'input',
        type: 'password',
        placeholder: 'Укажите пароль',
        autoComplete: 'on'
    }
];

const fieldConfigMap = fieldConfigs.reduce((acc, config) => {
    acc[config.name] = config;
    return acc;
}, {});
    
const initialFieldsState = fieldConfigs.reduce((acc, { name }) => {
    acc[name] = { value: '', uiStatus: '', error: '' };
    return acc;
}, {});

const fieldsStateReducer = (state, action) => {
    const { type, payload } = action;

    switch (type) {
        case 'UPDATE':
            const newState = { ...state };
            for (const name in payload) {
                newState[name] = { ...(state[name] ?? {}), ...payload[name] };
            }
            return newState;

        default:
            return state;
    }
};

export default function LoginForm() {
    const guestCart = useMemo(() => prepareGuestCartPayload(), []);

    const [fieldsState, dispatchFieldsState] = useReducer(fieldsStateReducer, initialFieldsState);
    const [rememberMe, setRememberMe] = useState(localStorage.getItem('rememberMe') === 'true');
    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.DEFAULT);

    const isUnmountedRef = useRef(false);
    
    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const isFormLocked = lockedStatuses.has(submitStatus);

    const handleRememberMe = (e) => {
        setRememberMe(e.target.checked);
        localStorage.setItem('rememberMe', e.target.checked);
    };

    const handleFieldChange = (e) => {
        const { name, value } = e.target;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value, uiStatus: '', error: '' } }
        });
    };

    const handleTrimmedFieldBlur = (e) => {
        const { name, value } = e.target;
        const normalizedValue = value.trim();
        if (normalizedValue === value) return;

        dispatchFieldsState({
            type: 'UPDATE',
            payload: { [name]: { value: normalizedValue } }
        });
    };

    const processFormFields = () => {
        const result = Object.entries(fieldsState).reduce(
            (acc, [name, { value }]) => {
                const validation = validationRules.auth[name];
                if (!validation) {
                    console.error(`Отсутствует правило валидации для поля: ${name}`);
                    return acc;
                }

                const normalizedValue = fieldConfigMap[name]?.trim ? value.trim() : value;
                const isValid = validation.test(normalizedValue);

                acc.fieldStateUpdates[name] = {
                    value: normalizedValue,
                    uiStatus: isValid ? FIELD_UI_STATUS.VALID : FIELD_UI_STATUS.INVALID,
                    error: isValid
                        ? ''
                        : fieldErrorMessages.auth[name].default || fieldErrorMessages.DEFAULT
                };
        
                if (isValid) {
                    acc.formFields[name] = normalizedValue;
                } else {
                    acc.allValid = false;
                }

                return acc;
            },
            { allValid: true, fieldStateUpdates: {}, formFields: {} }
        );
    
        if (result.allValid) result.formFields.rememberMe = rememberMe;
        
        return result;
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        const { allValid, fieldStateUpdates, formFields } = processFormFields();
        
        dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

        if (!allValid) {
            return setSubmitStatus(FORM_STATUS.INVALID);
        }

        setSubmitStatus(FORM_STATUS.SENDING);
        dispatch(setIsNavigationBlocked(true));

        const responseData = await dispatch(sendAuthLoginRequest(formFields, guestCart));
        if (isUnmountedRef.current) return;

        const {
            status, message, fieldErrors, user, accessTokenExp, refreshTokenExp,
            purchaseProductList, cartItemList, cartWasMerged, orderDraftId
        } = responseData;
        const LOG_CTX = 'AUTH: LOGIN';

        switch (status) {
            case FORM_STATUS.BAD_REQUEST:
            case FORM_STATUS.ERROR:
            case FORM_STATUS.NETWORK:
                logRequestStatus({ context: LOG_CTX, status, message });
                setSubmitStatus(status);
                dispatch(setIsNavigationBlocked(false));
                break;
                
            case FORM_STATUS.UNAUTH:
            case FORM_STATUS.INVALID: {
                logRequestStatus({ context: LOG_CTX, status, message, details: fieldErrors });

                const fieldStateUpdates = {};
                Object.entries(fieldErrors).forEach(([name, error]) => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.INVALID, error };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });

                setSubmitStatus(status);
                dispatch(setIsNavigationBlocked(false));
                break;
            }

            case FORM_STATUS.SUCCESS: {
                logRequestStatus({ context: LOG_CTX, status, message });
                saveUserToLocalStorage(user);

                const fieldStateUpdates = {};
                fieldConfigs.forEach(({ name }) => {
                    fieldStateUpdates[name] = { uiStatus: FIELD_UI_STATUS.CHANGED };
                });
                dispatchFieldsState({ type: 'UPDATE', payload: fieldStateUpdates });
        
                setSubmitStatus(status);
        
                setTimeout(async () => {
                    if (isUnmountedRef.current) return;

                    dispatch(login({
                        suppressAuthRedirect: true,
                        user,
                        accessTokenExp,
                        refreshTokenExp
                    }));

                    const locationFrom = location.state?.from;
                    const fromPath = locationFrom
                        ? locationFrom.pathname + (locationFrom.search || '')
                        : null;
                    let targetPath = fromPath || routeConfig.home.paths[0];

                    if (user.role === 'customer') {
                        const { redirectTo } = await dispatch(initCustomerSession({
                            purchaseProductList,
                            cartItemList,
                            customerDiscount: user.discount,
                            orderDraftId,
                            cartWasMerged
                        }));
                        if (redirectTo) targetPath = redirectTo;
                    }

                    navigate(targetPath, { replace: true });
                }, SUCCESS_DELAY);

                break;
            }
        
            default:
                logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                setSubmitStatus(FORM_STATUS.UNKNOWN);
                dispatch(setIsNavigationBlocked(false));
                break;
        }
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
            dispatch(resetSuppressAuthRedirect());
        };
    }, [dispatch]);

    // Сброс статуса формы при отсутствии ошибок полей
    useEffect(() => {
        if (submitStatus !== FORM_STATUS.INVALID) return;

        const isErrorField = Object.values(fieldsState).some(val => Boolean(val.error));
        if (!isErrorField) setSubmitStatus(FORM_STATUS.DEFAULT);
    }, [submitStatus, fieldsState]);

    return (
        <div className="auth-page">
            <form className="auth-form" data-type="login" onSubmit={handleFormSubmit} noValidate>
                <header className="form-header">
                    <h2>Форма авторизации</h2>
                </header>

                <div className="form-body">
                    {fieldConfigs.map(({ name, label, type, placeholder, autoComplete, trim }) => (
                        <p key={`login-${name}`} className="form-entry">
                            <label htmlFor={`login-${name}`} className="form-entry-label">{label}:</label>
                            
                            <span className={cn('form-entry-field', fieldsState[name]?.uiStatus)}>
                                <input
                                    id={`login-${name}`}
                                    name={name}
                                    type={type}
                                    placeholder={placeholder}
                                    value={fieldsState[name]?.value}
                                    autoComplete={autoComplete}
                                    onChange={handleFieldChange}
                                    onBlur={trim ? handleTrimmedFieldBlur : undefined}
                                    disabled={isFormLocked}
                                />
                                
                                {fieldsState[name]?.error && (
                                    <span className="invalid-message">
                                        *{fieldsState[name].error}
                                    </span>
                                )}
                            </span>
                        </p>
                    ))}

                    <p className="form-entry">
                        <DesignedCheckbox
                            name="remember-me"
                            label="Запомнить меня"
                            checked={rememberMe}
                            onChange={handleRememberMe}
                            disabled={isFormLocked}
                        />
                    </p>
                </div>

                <FormFooter
                    submitStates={submitStates}
                    submitStatus={submitStatus}
                    uiBlocked={isFormLocked}
                />
            </form>
        </div>
    );
};
