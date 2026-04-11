const fetch = require('node-fetch');

const webhookUrl = 'https://discord.com/api/webhooks/1492634222538784878/4uKZqKLBW4Yu_86VIdKdUdNBpgGxbSfM3xp7MiqW4W59JIMcFA2RfRavXqTLIIFMYV8x';

async function testWebhooks() {
    console.log("Starting tests...");
    
    // Simulate KULLANICI_GIRIS
    const meta = { ip: '127.0.0.1', isKnownDevice: true, device: 'PC', screen: '1920x1080', tz: 'Europe/Istanbul' };
    const embed = {
        title: '✅ Yeni Kullanıcı Girişi',
        description: '**kenan sisteme giriş yaptı**',
        color: 5763719,
        fields: [
            { name: '👤 Kullanıcı', value: '`kenan`', inline: true }
        ],
        footer: { text: 'İnaner Lojistik - Güvenlik Sistemi', icon_url: 'https://cdn-icons-png.flaticon.com/512/2042/2042183.png' },
        timestamp: new Date().toISOString()
    };
    
    embed.fields.push({ name: '🔑 Cihaz Durumu', value: '✅ Güvenilir (Tanınan) Cihaz', inline: true });
    embed.fields.push({ name: '🌐 IP Adresi', value: '`127.0.0.1`', inline: true });
    
    const payload = { 
        username: 'Tır Muhasebe Kalkanı',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2042/2042183.png',
        embeds: [embed] 
    };

    console.log("Sending payload...");
    const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    console.log('Result:', res.status, await res.text());
}

testWebhooks().catch(console.error);
