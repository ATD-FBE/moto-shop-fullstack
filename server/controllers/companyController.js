import { generateCompanyDetailsPdf } from '../services/companyService.js';

export const handleCompanyDetailsPdfRequest = (req, res, next) => {
    try {
        const { pdfDoc, filename } = generateCompanyDetailsPdf();
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (err) {
        next(err);
    }
};
