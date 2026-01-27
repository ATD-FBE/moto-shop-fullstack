import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleAuthCheckRequest,
    handleAuthCheckoutPrefsRequest,
    handleAuthRegistrationRequest,
    handleAuthLoginRequest,
    handleAuthSessionRequest,
    handleAuthRefreshRequest,
    handleAuthLogoutRequest,
    handleAuthUserUpdateRequest,
    handleAuthCheckoutPrefsUpdateRequest
} from '../controllers/authController.js';

const router = express.Router();

router.get('/check', verifyAuth, handleAuthCheckRequest);
router.get('/checkout-preferences', verifyAuth, verifyUser, verifyRole('customer'), handleAuthCheckoutPrefsRequest);
router.post('/register', handleAuthRegistrationRequest);
router.post('/login', handleAuthLoginRequest);
router.post('/session', verifyAuth, verifyUser, handleAuthSessionRequest);
router.post('/refresh', handleAuthRefreshRequest);
router.post('/logout', handleAuthLogoutRequest);
router.patch('/user', verifyAuth, verifyUser, handleAuthUserUpdateRequest);
router.patch('/checkout-preferences', verifyAuth, verifyUser, verifyRole('customer'), handleAuthCheckoutPrefsUpdateRequest);

export default router;
