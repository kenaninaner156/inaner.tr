const COLORS = {
  danger: 0xFF3B3B,   // Kırmızı — kritik
  warning: 0xFFB800,  // Sarı — uyarı
  info: 0x3B82F6,     // Mavi — bilgi
  success: 0x22C55E,  // Yeşil — başarı
  admin: 0xA855F7,    // Mor — admin
};

/**
 * Discord'a Embed (renkli kart) formatında mesaj gönderir.
 * @param {object} options
 * @param {'danger'|'warning'|'info'|'success'|'admin'} options.type - Renk türü
 * @param {string} options.title - Başlık (emoji + kısa başlık)
 * @param {string} options.description - Açıklama metni
 * @param {Array<{name:string, value:string, inline?:boolean}>} [options.fields] - Ek alanlar
 */
export const sendDiscordAlert = async ({ type = 'info', title, description, fields = [] }) => {
  try {
    const payload = {
      embeds: [{
        color: COLORS[type] ?? COLORS.info,
        title,
        description,
        fields,
        footer: { text: 'inaner.tr · ' + new Date().toLocaleString('tr-TR') },
      }]
    };

    const response = await fetch('/api/send-discord-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[Discord] Bildirim gönderilemedi:', err);
    }
  } catch (error) {
    console.error('[Discord] Bağlantı hatası:', error);
  }
};
