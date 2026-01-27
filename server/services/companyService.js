import PdfPrinter from 'pdfmake';
import { join } from 'path';
import { COMPANY_DETAILS } from '../../shared/constants.js';
import { SERVER_ROOT } from '../config/paths.js';

export const generateCompanyDetailsPdf = () => {
    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [50, 70, 50, 70],
        defaultStyle: { font: 'Roboto', fontSize: 10 },
        styles: {
            mainHeader: {
                fontSize: 16,
                bold: true,
                margin: [0, 0, 0, 10]
            },
            blockHeader: {
                fontSize: 11,
                bold: true,
                margin: [0, 10, 0, 4]
            },
            medium: {
                font: 'RobotoMedium',
                fontSize: 10
            },
            small: {
                fontSize: 9
            }
        },
        content: [
            // Header
            { text: 'Реквизиты организации', style: 'mainHeader' },
            { text: `«${COMPANY_DETAILS.shopName}»`, style: { fontSize: 12, bold: true } },
            { text: '\n' },

            // Company Info
            { text: 'Общие сведения', style: 'blockHeader' },
            { text: `Наименование: ${COMPANY_DETAILS.companyName}` },
            { text: `ИНН: ${COMPANY_DETAILS.inn}` },
            { text: `ОГРН: ${COMPANY_DETAILS.ogrn}` },
            { text: `Юридический адрес: ${COMPANY_DETAILS.legalAddress}` },
            { text: `Фактический адрес: ${COMPANY_DETAILS.displayAddress}` },
            { text: '\n' },

            // Contacts
            { text: 'Контактная информация', style: 'blockHeader' },
            { text: `Телефон: ${COMPANY_DETAILS.phone}` },
            { text: `Email: ${COMPANY_DETAILS.emails.info}` },
            { text: '\n' },

            // Bank Details
            { text: 'Банковские реквизиты', style: 'blockHeader' },
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: `Получатель: ${COMPANY_DETAILS.companyName}` },
                            { text: `ИНН: ${COMPANY_DETAILS.inn}` },
                            { text: `ОГРН: ${COMPANY_DETAILS.ogrn}` },
                            { text: `Юр. адрес: ${COMPANY_DETAILS.legalAddress}` }
                        ]
                    },
                    {
                        width: '40%',
                        stack: [
                            { text: `Банк: ${COMPANY_DETAILS.bank.name}`, alignment: 'right' },
                            { text: `БИК: ${COMPANY_DETAILS.bank.bik}`, alignment: 'right' },
                            { text: `Р/с: ${COMPANY_DETAILS.bank.rs}`, alignment: 'right' },
                            { text: `К/с: ${COMPANY_DETAILS.bank.ks}`, alignment: 'right' }
                        ]
                    }
                ]
            },

            { text: '\n\n\n' },
            {
                text: 'Документ сформирован автоматически и предназначен для информационных целей',
                style: 'small',
                italics: true
            }
        ]
    };

    const fonts = {
        Roboto: {
            normal: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Regular.ttf'),
            bold: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Bold.ttf'),
            italics: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Italic.ttf')
        },
        RobotoMedium: {
            normal: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Medium.ttf')
        }
    };

    const printer = new PdfPrinter(fonts);
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const filename = 'company_details.pdf';

    return { pdfDoc, filename };
};
