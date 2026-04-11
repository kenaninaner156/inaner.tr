export const sendDiscordAlert = async ({ action, detail, user, meta }) => {
    // Discord Webhook URL'si (Güvenlik Önlemli Direkt Kullanım)
    const webhookUrl = 'https://discord.com/api/webhooks/1492634222538784878/4uKZqKLBW4Yu_86VIdKdUdNBpgGxbSfM3xp7MiqW4W59JIMcFA2RfRavXqTLIIFMYV8x';
    if (!webhookUrl) return;

    let color = 3447003; // Default Blue
    let iconUrl = '';
    let title = action;

    if (action === 'KULLANICI_GIRIS') {
        color = 5763719; // Green
        title = '✅ Yeni Kullanıcı Girişi';
    } else if (action === 'KULLANICI_CIKIS') {
        color = 9807270; // Gray
        title = '👋 Kullanıcı Çıkış Yaptı';
    } else if (action === 'HATALI_GIRIS') {
        color = 15548997; // Red
        title = '🚨 Başarısız Giriş Denemesi!';
    } else if (action === 'ZIYARETCI_GIRIS') {
        color = 3447003; // Blue
        title = '👀 Ziyaretçi Tespit Edildi';
    }
    
    // Güvenlik riski varsa her durumu "KRİTİK" kırmızıya çek
    if (meta?.vpnRisk || meta?.incognitoRisk) {
        color = 15548997; 
    }

    const embed = {
        title: title,
        description: `**${detail}**`,
        color: color,
        fields: [
            { name: '👤 Kullanıcı', value: `\`${user || 'Bilinmiyor'}\``, inline: true }
        ],
        footer: {
            text: 'İnaner Lojistik - Güvenlik Sistemi',
            icon_url: 'https://cdn-icons-png.flaticon.com/512/2042/2042183.png'
        },
        timestamp: new Date().toISOString()
    };

    if (meta) {
        // Cihaz Güvenlik ve Tanıma
        if (action === 'HATALI_GIRIS' || action === 'ZIYARETCI_GIRIS' || action === 'KULLANICI_GIRIS') {
            const trustMsg = meta.isKnownDevice ? '✅ Güvenilir (Tanınan) Cihaz' : '⚠️ Yabancı (Bilinmeyen) Cihaz';
            embed.fields.push({ name: '🔑 Cihaz Durumu', value: trustMsg, inline: true });
        }

        // Temel Bilgiler
        if (meta.ip) embed.fields.push({ name: '🌐 IP Adresi', value: `\`${meta.ip}\``, inline: true });
        if (meta.location) embed.fields.push({ name: '📍 Konum', value: meta.location, inline: true });
        
        // Teknik Donanım (Satır atlayarak)
        const techInfo = [];
        if (meta.device) techInfo.push(`📱 **Platform:** ${meta.device}`);
        if (meta.screen) techInfo.push(`🖥️ **Ekran:** ${meta.screen}`);
        if (meta.cores) techInfo.push(`⚙️ **CPU:** ${meta.cores}`);
        if (meta.tz) techInfo.push(`🕰️ **Zaman/Dil:** ${meta.tz} (${(meta.lang || '').toUpperCase()})`);
        
        if (techInfo.length > 0) {
            embed.fields.push({ name: '💻 Teknik Detaylar', value: techInfo.join('\n'), inline: false });
        }

        // Risk Faktörleri (Eğer varsa göze batması için ayrı bir field)
        const risks = [];
        if (meta.vpnRisk) risks.push('🔴 **VPN VEYA PROXY TESPİT EDİLDİ!**');
        if (meta.incognitoRisk) risks.push('🟣 **GİZLİ SEKME (Incognito) / Sıkı Güvenlik Algılandı!**');
        
        if (risks.length > 0) {
            embed.fields.push({ name: '🛡️ Güvenlik Uyarıları', value: risks.join('\n'), inline: false });
        }
    }

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: "Tır Muhasebe Kalkanı",
                avatar_url: "https://cdn-icons-png.flaticon.com/512/2042/2042183.png",
                embeds: [embed] 
            })
        });
    } catch { } // Uygulamayı çökertmemek için hatayı yut
};
