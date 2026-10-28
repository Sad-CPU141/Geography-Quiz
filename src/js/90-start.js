/* ---- start ---- */
if (S.joinRoom) liveJoinScreen(S.joinRoom); else home();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* New versions: phones kept showing an old copy of the site. Check version.json when the app opens, when it comes
   back to the front and every 10 minutes; if there's a newer build, reload — straight away on the home screen,
   otherwise the next time you go home (never in the middle of a run). Once per version, so it can't loop. */
function reloadForUpdate(v) {
  try { if (sessionStorage.getItem('gs_reloaded') === v) return false; sessionStorage.setItem('gs_reloaded', v); } catch (e) { return false; }
  location.reload();
  return true;
}
function checkUpdate() {
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => r.json()).then((j) => {
    if (!j.version || j.version === APP_VERSION) return;
    S.updateReady = j.version;
    if (document.querySelector('[data-screen="home"]')) reloadForUpdate(j.version);
  }).catch(() => {});
}
checkUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
setInterval(checkUpdate, 600000);
// For the browser tests: the current session (read-only).
try { Object.defineProperty(window.GS, 'session', { get: () => S.session }); } catch (e) { /* already there */ }
