/* eslint-env node */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Sadece POST istekleri kabul edilir.' });
    }

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
        return res.status(500).json({ error: 'Discord Webhook URL yapılandırılmamış.' });
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: `Discord Hatası: ${errText}` });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Discord webhook gönderilirken hata oluştu:", error);
        return res.status(500).json({ error: 'Sunucu hatası', details: error.message });
    }
}
