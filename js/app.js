/* ============================================================
   app.js — punkt wejścia: routing widoków, QR, powiadomienia
   ============================================================ */

function pokazEkran(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  const el = document.getElementById('view-' + id);
  if (el) el.classList.remove('hidden');
}

let toastTimeout = null;
function pokazToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
}

function wygenerujQR(elId, text) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  // eslint-disable-next-line no-undef
  new QRCode(el, { text, width: 200, height: 200, colorDark: '#1F2937', colorLight: '#ffffff' });
}

function kopiujDoSchowka(elId) {
  const input = document.getElementById(elId);
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value).then(() => {
    pokazToast('Link skopiowany do schowka!');
  }).catch(() => {
    document.execCommand('copy');
    pokazToast('Link skopiowany do schowka!');
  });
}

/* ---------- Inicjalizacja ---------- */
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-create-room').onclick = () => {
    pokazEkran('host-lobby-loading');
    Host.init();
  };

  document.getElementById('btn-join-room').onclick = () => {
    const code = document.getElementById('manual-room-code').value.trim();
    if (!code) { pokazToast('Wpisz kod pokoju.'); return; }
    Client.init(code);
  };

  document.getElementById('btn-client-connect').onclick = () => {
    const nick = document.getElementById('client-nick-input').value.trim();
    if (!nick) { pokazToast('Podaj swój nick.'); return; }
    pokazEkran('client-connecting');
    Client.polacz(nick);
  };

  document.getElementById('btn-copy-link').onclick = () => kopiujDoSchowka('room-link');
  document.getElementById('btn-start-game').onclick = () => Host.startGame();
  document.getElementById('btn-discard-mode').onclick = () => Client.toggleDiscardMode();
  document.getElementById('btn-confirm-discard').onclick = () => Client.confirmDiscard();
  document.getElementById('target-modal-close').onclick = () => ukryjModal();
  document.querySelectorAll('.btn-restart-game').forEach((b) => {
    b.onclick = () => {
      if (Host.started) {
        Host.restartGame();
      } else {
        Client.send({ type: 'restart' });
      }
    };
  });

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    Client.init(room);
  } else {
    pokazEkran('landing');
  }
});
