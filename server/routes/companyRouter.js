import express from 'express';
import {
    handleCompanyDetailsPdfRequest
} from '../controllers/companyController.js';

const router = express.Router();

router.get('/details/pdf', handleCompanyDetailsPdfRequest);

export default router;
