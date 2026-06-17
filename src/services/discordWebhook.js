export const sendDiscordAlert = async (payload) => {
  try {
    await fetch('/api/send-discord-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch {}
};
