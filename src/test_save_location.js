async function testSaveLocation() {
    const API_URL = 'https://www.inaner.tr/api/save-location?token=inaner123';
    console.log(`Sending mock coordinate to ${API_URL}...`);
    
    const payload = {
        lat: "39.9334",
        lon: "32.8597",
        speed: "50",
        timestamp: new Date().toISOString(),
        device_id: 'Mert'
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        console.log(`HTTP Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`Response Body: ${text}`);
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testSaveLocation();
