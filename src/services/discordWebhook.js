export const sendDiscordAlert = async (payload) => {
  try {
    const response = await fetch('/api/send-discord-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
