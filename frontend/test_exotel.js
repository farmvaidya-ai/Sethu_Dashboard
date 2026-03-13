import axios from 'axios';
import 'dotenv/config';

const apiKey = process.env.EXOTEL_API_KEY;
const apiToken = process.env.EXOTEL_API_TOKEN;
const accountSid = process.env.EXOTEL_ACCOUNT_SID;

const callSid = '2a8882b103cde3f5c9076ba032031a3d'; // One of the reporting SIDs
const subdomains = ['api.exotel.com', 'api.exotel.in'];

async function testExotel() {
    const auth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
    
    for (const subdomain of subdomains) {
        const url = `https://${subdomain}/v1/Accounts/${accountSid}/Calls/${callSid}.json`;
        console.log(`Testing ${subdomain}...`);
        try {
            const response = await axios.get(url, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            console.log(`✅ Success on ${subdomain}!`);
            console.log(JSON.stringify(response.data, null, 2));
            return;
        } catch (error) {
            console.log(`❌ Failed on ${subdomain}: ${error.response?.status} ${error.response?.statusText}`);
            if (error.response?.data) {
                console.log('Error Data:', JSON.stringify(error.response.data));
            }
        }
    }
}

testExotel();
