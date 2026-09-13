/* ============================================================
   host.js — logika Hosta (stołu): tworzenie pokoju PeerJS,
   lobby, uruchomienie silnika gry, synchronizacja stanu.
   ============================================================ */

const Host = {
  peer: null,
  roomCode: null,
  conns: {},            // playerId -> DataConnection
  players: [],          // {id, nick} — lista w lobby, zanim ruszy silnik
  state: null,           // stan gry (WirusEngine)
  started: false,

  init() {
    const code = generujKodPokoju();
    this.roomCode = code;
    this.peer = new Peer('wirus-' + code, { debug: 1 });

    this.peer.on('open', () => {
      pokazEkran('host-lobby');
      document.getElementById('room-code').textContent = code;
      const link = zbudujLinkDolaczenia(code);
      document.getElementById('room-link').value = link;
      wygenerujQR('qr-code', link);
      this.renderLobby();
    });

    this.peer.on('connection', (conn) => this.handleConnection(conn));

    this.peer.on('error', (err) => {
      console.error('Peer error', err);
      if (err.type === 'unavailable-id') {
        // kod zajęty — spróbuj ponownie z nowym kodem
        this.peer.destroy();
        this.init();
      } else {
        pokazToast('Błąd połączenia: ' + err.type);
      }
    });
  },

  handleConnection(conn) {
    conn.on('open', () => {
      conn.on('data', (msg) => this.handleMessage(conn, msg));
      conn.on('close', () => this.handleDisconnect(conn));
    });
  },

  handleMessage(conn, msg) {
    if (msg.type === 'join') {
      this.handleJoin(conn, msg.nick);
    } else if (msg.type === 'action') {
      this.handleAction(conn, msg.action);
    } else if (msg.type === 'reconnect') {
      this.handleReconnect(conn, msg.playerId);
    }
  },

  handleJoin(conn, nick) {
    if (this.started) {
      conn.send({ type: 'error', message: 'Gra już się rozpoczęła.' });
      return;
    }
    if (this.players.length >= 5) {
      conn.send({ type: 'error', message: 'Pokój jest pełny (max 5 graczy).' });
      return;
    }
    const id = conn.peer;
    this.players.push({ id, nick: przycinNick(nick) });
    this.conns[id] = conn;
    conn.send({ type: 'joined', playerId: id, roomCode: this.roomCode });
    this.renderLobby();
    this.broadcastLobby();
    pokazToast(`${nick} dołączył(a) do gry.`);
  },

  handleReconnect(conn, playerId) {
    // podmień połączenie gracza, jeśli nadal jest częścią gry
    if (this.state && this.state.players.some((p) => p.id === playerId)) {
      this.conns[playerId] = conn;
      const p = this.state.players.find((x) => x.id === playerId);
      p.connected = true;
      WirusEngine.dodajLog(this.state, `${p.nick} wrócił(a) do gry.`);
      this.broadcastState();
      this.renderTable();
    } else {
      conn.send({ type: 'error', message: 'Nie można dołączyć ponownie — gra nieznana.' });
    }
  },

  handleDisconnect(conn) {
    const id = conn.peer;
    if (!this.started) {
      this.players = this.players.filter((p) => p.id !== id);
      delete this.conns[id];
      this.renderLobby();
      this.broadcastLobby();
    } else if (this.state) {
      const p = this.state.players.find((x) => x.id === id);
      if (p) {
        p.connected = false;
        WirusEngine.dodajLog(this.state, `${p.nick} rozłączył(a) się.`);
        if (WirusEngine.aktualnyGracz(this.state).id === id) {
          WirusEngine.zakonczTure(this.state);
        }
        this.broadcastState();
        this.renderTable();
      }
    }
  },

  kickPlayer(id) {
    const conn = this.conns[id];
    if (conn) {
      conn.send({ type: 'kicked' });
      conn.close();
    }
    this.players = this.players.filter((p) => p.id !== id);
    delete this.conns[id];
    this.renderLobby();
    this.broadcastLobby();
  },

  broadcastLobby() {
    const payload = { type: 'lobby', players: this.players.map((p) => ({ nick: p.nick })) };
    Object.values(this.conns).forEach((c) => c.send(payload));
  },

  renderLobby() {
    const list = document.getElementById('lobby-players');
    list.innerHTML = '';
    this.players.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'lobby-player';
      li.innerHTML = `<span>${escapeHtml(p.nick)}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn-icon';
      btn.textContent = '✕';
      btn.title = 'Wyrzuć gracza';
      btn.onclick = () => this.kickPlayer(p.id);
      li.appendChild(btn);
      list.appendChild(li);
    });
    document.getElementById('lobby-count').textContent = `${this.players.length} / 5`;
    document.getElementById('btn-start-game').disabled = this.players.length < 2;
  },

  startGame() {
    if (this.players.length < 2) return;
    this.started = true;
    this.state = WirusEngine.stworzStanGry(this.players);
    pokazEkran('host-game');
    this.broadcastState();
    this.renderTable();
  },

  restartGame() {
    if (!this.state) return;
    WirusEngine.zresetujStanGry(this.state);
    document.getElementById('winner-banner').classList.add('hidden');
    this.broadcastState();
    this.renderTable();
  }, 

  handleAction(conn, action) {
    if (!this.state) return;
    if (action.type === 'restart') {
      this.restartGame();
      return;
    }

    const playerId = conn.peer;
    const wynik = WirusEngine.wykonajAkcje(this.state, playerId, action);
    if (!wynik.ok) {
      conn.send({ type: 'error', message: wynik.blad });
      return;
    }
    this.broadcastState();
    this.renderTable();
  },

  broadcastState() {
    this.state.players.forEach((p) => {
      const conn = this.conns[p.id];
      if (conn && conn.open) {
        conn.send({ type: 'state', state: WirusEngine.widokDlaGracza(this.state, p.id) });
      }
    });
  },

  renderTable() {
    const s = this.state;
    document.getElementById('deck-count').textContent = s.deck.length;
    document.getElementById('discard-count').textContent = s.discard.length;

    const aktualny = WirusEngine.aktualnyGracz(s);
    document.getElementById('turn-indicator').textContent = s.winnerId
      ? '🏆 Gra zakończona'
      : `Tura gracza: ${aktualny.nick}`;

    const board = document.getElementById('host-board');
    board.innerHTML = '';
    s.players.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'player-board' + (p.id === aktualny.id && !s.winnerId ? ' active' : '') + (p.connected ? '' : ' disconnected');
      card.innerHTML = `
        <div class="player-board-head">
          <span class="player-name">${escapeHtml(p.nick)}</span>
          <span class="player-hand-count">🂠 ${p.hand.length}</span>
        </div>
        <div class="organ-row">${renderOrgansHTML(p.organs)}</div>
      `;
      board.appendChild(card);
    });

    const log = document.getElementById('event-log');
    log.innerHTML = s.log.map((l) => `<div class="log-line">${escapeHtml(l.msg)}</div>`).join('');

    if (s.winnerId) {
      const zwyciezca = WirusEngine.znajdzGracza(s, s.winnerId);
      document.getElementById('winner-banner').classList.remove('hidden');
      document.getElementById('winner-name').textContent = zwyciezca.nick;
    }
  },

  reset() {
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.roomCode = null;
    this.conns = {};
    this.players = [];
    this.state = null;
    this.started = false;
  }
};

function renderOrgansHTML(organs) {
  const { KOLORY, KOLOR_META } = window.WirusCards;
  const kolory = [...KOLORY, 'wild', 'prosthetic'];
  return kolory
    .filter((k) => organs[k])
    .map((k) => {
      const o = organs[k];
      const meta = KOLOR_META[o.color];
      const statusIkona = { clean: '', vaccine: '💊', immune: '🧪🧪', infected: '🦠', quarantine: '🛡️', prosthetic: '🔒' }[o.status] || '';      const bg = o.color === 'wild' ? 'var(--wild-gradient)' : meta.hex;
      const organIkona = meta.ikona || '🫀';
      return `<div class="organ-chip" style="background:${bg}" title="${meta.organ} - ${statusEtykieta(o.status)}">${organIkona}<span class="organ-status">${statusIkona}</span></div>`;    })
    .join('') || '<span class="organ-empty">— brak organów —</span>';
}

function statusEtykieta(status) {
  return { clean: 'Zdrowy', vaccine: 'Zaszczepiony', immune: 'Odporny', infected: 'Zarażony', quarantine: 'Kwarantanna', prosthetic: 'Bioniczny (niewrażliwy)' }[status] || status;
}

function generujKodPokoju() {
  const znaki = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let kod = '';
  for (let i = 0; i < 5; i++) kod += znaki[Math.floor(Math.random() * znaki.length)];
  return kod;
}

function zbudujLinkDolaczenia(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

function przycinNick(nick) {
  return (nick || 'Gracz').trim().slice(0, 16) || 'Gracz';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
