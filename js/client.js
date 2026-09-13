/* ============================================================
   client.js — logika Klienta (gracza na telefonie): łączenie
   z Hostem przez PeerJS, wyświetlanie ręki i stołu, wysyłanie akcji.
   ============================================================ */

const Client = {
  peer: null,
  conn: null,
  roomCode: null,
  nick: null,
  playerId: null,
  state: null,
  discardMode: false,
  selectedDiscards: new Set(),

  init(roomCode) {
    this.roomCode = roomCode.toUpperCase();
    document.getElementById('client-room-code').textContent = this.roomCode;
    pokazEkran('client-nick');
  },

  polacz(nick) {
    this.nick = przycinNick(nick);
    this.peer = new Peer(undefined, { debug: 1 });

    this.peer.on('open', () => {
      this.conn = this.peer.connect('wirus-' + this.roomCode, { reliable: true });
      this.conn.on('open', () => {
        const zapisanyId = localStorage.getItem('wirus_playerId_' + this.roomCode);
        if (zapisanyId) {
          this.conn.send({ type: 'reconnect', playerId: zapisanyId });
          this.playerId = zapisanyId;
        } else {
          this.conn.send({ type: 'join', nick: this.nick });
        }
      });
      this.conn.on('data', (msg) => this.handleMessage(msg));
      this.conn.on('close', () => this.handleClosed());
    });

    this.peer.on('error', (err) => {
      console.error('Peer error', err);
      pokazToast('Nie udało się połączyć: ' + err.type);
      pokazEkran('client-nick');
    });
  },

  handleMessage(msg) {
    if (msg.type === 'joined') {
      this.playerId = msg.playerId;
      localStorage.setItem('wirus_playerId_' + this.roomCode, this.playerId);
      pokazEkran('client-lobby');
    } else if (msg.type === 'lobby') {
      this.renderLobby(msg.players);
    } else if (msg.type === 'state') {
      this.state = msg.state;
      pokazEkran('client-game');
      this.render();
    } else if (msg.type === 'error') {
      pokazToast(msg.message);
    } else if (msg.type === 'kicked') {
      pokazToast('Zostałeś/aś wyrzucony(a) z pokoju.');
      pokazEkran('landing');
    }
  },

  handleClosed() {
    pokazToast('Utracono połączenie z Hostem.');
  },

  renderLobby(players) {
    const list = document.getElementById('client-lobby-players');
    list.innerHTML = players.map((p) => `<li>${escapeHtml(p.nick)}</li>`).join('');
  },

  send(action) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'action', action });
    }
  },

  mnie() {
    return this.state.players.find((p) => p.id === this.playerId);
  },

  render() {
    const s = this.state;
    const ja = this.mnie();
    const aktualny = s.players[s.turnIndex];
    const mojaTura = aktualny.id === this.playerId && !s.winnerId;

    document.getElementById('client-turn-indicator').textContent = s.winnerId
      ? '🏆 Gra zakończona!'
      : mojaTura ? 'Twoja tura!' : `Tura gracza: ${aktualny.nick}`;
    document.getElementById('client-turn-indicator').classList.toggle('my-turn', mojaTura);

    // stół — organy wszystkich graczy
    const board = document.getElementById('client-board');
    board.innerHTML = s.players.map((p) => `
      <div class="mini-board ${p.id === this.playerId ? 'me' : ''}">
        <div class="mini-board-name">${escapeHtml(p.nick)}${p.id === this.playerId ? ' (Ty)' : ''}</div>
        <div class="organ-row small">${renderOrgansHTML(p.organs)}</div>
      </div>
    `).join('');

   // ręka
    const hand = document.getElementById('client-hand');
    hand.innerHTML = '';
    (ja.hand || []).forEach((card) => {
      const el = document.createElement('div');
      el.className = 'hand-card';
      if (this.discardMode && this.selectedDiscards.has(card.id)) el.classList.add('selected');

      // Tęczowa obwódka dla kart 'wild' lub zwykły kolor dla pozostałych
      if (card.color === 'wild') {
        el.classList.add('is-wild');
      } else {
        el.style.setProperty('--card-color', kolorTla(card));
      }

      el.innerHTML = `
        <div class="hand-card-icon">${pobierzIkoneKarty(card)}</div>
        <div class="hand-card-name">${nazwaKarty(card)}</div>
      `;
      el.onclick = () => this.onCardClick(card, mojaTura);
      hand.appendChild(el);
    });

    document.getElementById('deck-count-client').textContent = s.deckCount;

    // log
    document.getElementById('client-log').innerHTML = s.log.slice(0, 6).map((l) => `<div class="log-line">${escapeHtml(l.msg)}</div>`).join('');

    // przycisk trybu odrzucania
    const discardBtn = document.getElementById('btn-discard-mode');
    discardBtn.classList.toggle('hidden', !mojaTura || s.turnPlayedCard);
    discardBtn.textContent = this.discardMode ? 'Anuluj odrzucanie' : 'Odrzuć karty zamiast grać';
    document.getElementById('btn-confirm-discard').classList.toggle('hidden', !this.discardMode);

    if (s.winnerId) {
      const zwyciezca = s.players.find((p) => p.id === s.winnerId);
      document.getElementById('client-winner-banner').classList.remove('hidden');
      document.getElementById('client-winner-name').textContent = zwyciezca.nick + (zwyciezca.id === this.playerId ? ' (Ty!)' : '');
    }
  },

  onCardClick(card, mojaTura) {
    if (!mojaTura) { pokazToast('Nie Twoja tura.'); return; }
    if (this.state.turnPlayedCard) { pokazToast('W tej turze zagrano już kartę.'); return; }

    if (this.discardMode) {
      if (this.selectedDiscards.has(card.id)) this.selectedDiscards.delete(card.id);
      else this.selectedDiscards.add(card.id);
      this.render();
      return;
    }

    this.rozpocznijWyborCelu(card);
  },

  toggleDiscardMode() {
    this.discardMode = !this.discardMode;
    this.selectedDiscards.clear();
    this.render();
  },

  confirmDiscard() {
    if (this.selectedDiscards.size === 0) { pokazToast('Zaznacz przynajmniej jedną kartę.'); return; }
    this.send({ type: 'discard', cardIds: [...this.selectedDiscards] });
    this.discardMode = false;
    this.selectedDiscards.clear();
  },

  rozpocznijWyborCelu(card) {
    const s = this.state, ja = this.mnie();
    const { KOLORY } = window.WirusCards;

    switch (card.type) {
      case 'organ':
        this.send({ type: 'organ', cardId: card.id });
        return;

      case 'wymiana_reki':
        pokazModalPotwierdzenia('Wymienić całą rękę na nową?', () => this.send({ type: 'wymiana_reki', cardId: card.id }));
        return;

      case 'wirus':
      case 'podwojny_wirus': {
        const opcje = [];
        s.players.forEach((p) => {
          if (p.id === this.playerId) return;
          [...KOLORY, 'wild', 'prosthetic'].forEach((k) => {
            const o = p.organs[k];
            if (!o) return;
            // Nie można atakować organu odpornego, w kwarantannie ani sztucznej ręki
            if (o.status === 'immune' || o.status === 'quarantine' || o.status === 'prosthetic') return;
            if (card.color === 'wild' || o.color === card.color || o.color === 'wild') {
              opcje.push({ etykieta: `${p.nick} — ${opisOrganu(o)}`, targetPlayerId: p.id, targetColor: k });
            }
          });
        });
        pokazModalWyboru('Wybierz organ do zaatakowania', opcje, (opt) =>
          this.send({ type: card.type, cardId: card.id, targetPlayerId: opt.targetPlayerId, targetColor: opt.targetColor }));
        return;
      }

      case 'lek':
      case 'podwojny_lek': {
        const opcje = [];
        [...KOLORY, 'wild'].forEach((k) => {
          const o = ja.organs[k];
          if (!o || o.status === 'immune' || o.status === 'quarantine') return;
          if (card.color === 'wild' || o.color === card.color || o.color === 'wild') {
            opcje.push({ etykieta: opisOrganu(o), targetColor: k });
          }
        });
        pokazModalWyboru('Wybierz własny organ do wyleczenia', opcje, (opt) =>
          this.send({ type: card.type, cardId: card.id, targetColor: opt.targetColor }));
        return;
      }

      case 'kwarantanna': {
        const opcje = [];
        [...KOLORY, 'wild', 'prosthetic'].forEach((k) => {
          const o = ja.organs[k];
          // Wyświetl tylko i wyłącznie czyste organy
          if (!o || o.status !== 'clean') return;
          opcje.push({ etykieta: opisOrganu(o), targetColor: k });
        });
        pokazModalWyboru('Wybierz organ do objęcia kwarantanną', opcje, (opt) =>
          this.send({ type: 'kwarantanna', cardId: card.id, targetColor: opt.targetColor }));
        return;
      }

      case 'zamiana': {
        const opcje = s.players.filter((p) => p.id !== this.playerId).map((p) => ({ etykieta: p.nick, targetPlayerId: p.id }));
        pokazModalWyboru('Z kim zamienić się ciałem?', opcje, (opt) =>
          this.send({ type: 'zamiana', cardId: card.id, targetPlayerId: opt.targetPlayerId }));
        return;
      }

      case 'kradziez': {
        const opcje = [];
        s.players.forEach((p) => {
          if (p.id === this.playerId) return;
          [...KOLORY, 'wild'].forEach((k) => {
            const o = p.organs[k];
            if (!o || o.status === 'immune') return;
            opcje.push({ etykieta: `${p.nick} — ${opisOrganu(o)}`, targetPlayerId: p.id, targetColor: k });
          });
        });
        pokazModalWyboru('Który organ ukraść?', opcje, (opt) =>
          this.send({ type: 'kradziez', cardId: card.id, targetPlayerId: opt.targetPlayerId, targetColor: opt.targetColor }));
        return;
      }

      case 'zarazenie': {
        const zrodla = [];
        [...KOLORY, 'wild'].forEach((k) => {
          const o = ja.organs[k];
          if (o && o.status === 'infected') zrodla.push({ etykieta: opisOrganu(o), sourceColor: k, sourceColorFull: o.color });
        });
        if (zrodla.length === 0) { pokazToast('Nie masz zarażonego organu do przeniesienia.'); return; }
        const wybierzZrodlo = (zrodlo) => {
          const opcje = [];
          s.players.forEach((p) => {
            if (p.id === this.playerId) return;
            [...KOLORY, 'wild'].forEach((k) => {
              const o = p.organs[k];
              if (!o) return;
              if (zrodlo.sourceColorFull === 'wild' || o.color === zrodlo.sourceColorFull || o.color === 'wild') {
                opcje.push({ etykieta: `${p.nick} — ${opisOrganu(o)}`, targetPlayerId: p.id, targetColor: k });
              }
            });
          });
          pokazModalWyboru('Na kogo przenieść wirusa?', opcje, (opt) =>
            this.send({ type: 'zarazenie', cardId: card.id, sourceColor: zrodlo.sourceColor, targetPlayerId: opt.targetPlayerId, targetColor: opt.targetColor }));
        };
        if (zrodla.length === 1) wybierzZrodlo(zrodla[0]);
        else pokazModalWyboru('Który Twój organ jest źródłem wirusa?', zrodla, wybierzZrodlo);
        return;
      }
    }
  }
};

function opisOrganu(o) {
  const { KOLOR_META } = window.WirusCards;
  return `${KOLOR_META[o.color].nazwa} (${statusEtykieta(o.status)})`;
}

function kolorTla(card) {
  const { KOLOR_META } = window.WirusCards;
  if (card.color && KOLOR_META[card.color]) {
    // border-color nie obsługuje gradientów — dla karty tęczowej używamy stałego akcentu
    return card.color === 'wild' ? '#fd03e4' : KOLOR_META[card.color].hex;
  }
  return 'var(--brand)';
}

/* ---------- Modale wyboru celu ---------- */
function pokazModalWyboru(tytul, opcje, onWybor) {
  const modal = document.getElementById('target-modal');
  document.getElementById('target-modal-title').textContent = tytul;
  const body = document.getElementById('target-modal-body');
  if (opcje.length === 0) {
    body.innerHTML = '<p class="modal-empty">Brak dostępnych celów dla tej karty.</p>';
  } else {
    body.innerHTML = '';
    opcje.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'target-option';
      btn.textContent = opt.etykieta;
      btn.onclick = () => { ukryjModal(); onWybor(opt); };
      body.appendChild(btn);
    });
  }
  modal.classList.remove('hidden');
}

function pokazModalPotwierdzenia(tekst, onPotwierdz) {
  const modal = document.getElementById('target-modal');
  document.getElementById('target-modal-title').textContent = tekst;
  const body = document.getElementById('target-modal-body');
  body.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'target-option';
  btn.textContent = 'Tak, potwierdzam';
  btn.onclick = () => { ukryjModal(); onPotwierdz(); };
  body.appendChild(btn);
  modal.classList.remove('hidden');
}

function ukryjModal() {
  document.getElementById('target-modal').classList.add('hidden');
}
