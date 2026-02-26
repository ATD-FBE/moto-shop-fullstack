import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import { handleErrorLogsRequest } from '../controllers/logController.js';

const router = express.Router();

router.get('/errors', verifyAuth, verifyUser, verifyRole('admin'), handleErrorLogsRequest);

export default router; 
