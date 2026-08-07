import { EInvoiceApi } from 'e-fatura';

async function test() {
    console.log('Testing GIB API login...');
    const api = new EInvoiceApi();
    api.setCredentials({ username: '47617923', password: 'wrongpassword' });
    try {
        await api.initAccessToken();
        console.log('Login SUCCESS?');
    } catch (err) {
        console.log('ERROR RECEIVED:');
        console.log('Message:', err.message);
        if (err.response && err.response.data) {
            console.log('Data:', JSON.stringify(err.response.data, null, 2));
        }
    }
}

test();
