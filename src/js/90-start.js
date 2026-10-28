/* ---- start ---- */
if (S.joinRoom) liveJoinScreen(S.joinRoom); else home();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
