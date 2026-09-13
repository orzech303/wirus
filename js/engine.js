/* ============================================================
   engine.js — logika gry, uruchamiana WYŁĄCZNIE u Hosta.
   Host jest jedynym źródłem prawdy o stanie gry.
   ============================================================ */

function stworzStanGry(players) {
  const deck = shuffle(buildDeck());
  const state = {
    players: players.map((p) => ({
      id: p.id,
      nick: p.nick,
      hand: [],
      organs: {},   // klucz koloru -> { color, status }  status: clean|vaccine|immune|quarantine
      connected: true
    })),
    deck,
    discard: [],
    turnIndex: 0,
    turnPlayedCard: false, // czy w tej turze już zagrano/odrzucono kartę
    log: [],
    winnerId: null,
    started: true
  };
  state.players.forEach((p) => {
    p.hand = dobierzKarty(state, 3);
  });
  dodajLog(state, 'Gra się rozpoczęła! Powodzenia.');
  return state;
}

function dodajLog(state, msg) {
  state.log.unshift({ msg, t: Date.now() });
  if (state.log.length > 60) state.log.pop();
}

function dobierzKarty(state, n) {
  const wynik = [];
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      state.deck = shuffle(state.discard);
      state.discard = [];
    }
    wynik.push(state.deck.pop());
  }
  return wynik;
}

function znajdzGracza(state, id) {
  return state.players.find((p) => p.id === id);
}

function aktualnyGracz(state) {
  return state.players[state.turnIndex];
}

function policzOrgany(player) {
  return Object.keys(player.organs).length;
}

function sprawdzWygrana(player) {
  const kolory = Object.keys(player.organs);
  if (kolory.length < 4) return false;
  return kolory.every((k) => {
  const st = player.organs[k].status;
  return st === 'clean' || st === 'vaccine' || st === 'immune' || st === 'quarantine' || st === 'prosthetic';
  });
}

function usunKarteZReki(player, cardId) {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) return null;
  return player.hand.splice(idx, 1)[0];
}

function zakonczTure(state) {
  const player = aktualnyGracz(state);
  const brakujace = 3 - player.hand.length;
  if (brakujace > 0) {
    player.hand.push(...dobierzKarty(state, brakujace));
  }
  state.turnPlayedCard = false;
  // następny podłączony gracz
  let next = state.turnIndex;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (state.players[next].connected) break;
  }
  state.turnIndex = next;
}

/* -------------------- Główna funkcja obsługi akcji -------------------- */
// action.type: 'organ' | 'wirus' | 'lek' | 'zarazenie' | 'zamiana' | 'kradziez'
//              | 'podwojny_lek' | 'podwojny_wirus' | 'wymiana_reki' | 'kwarantanna'
//              | 'discard'
function wykonajAkcje(state, playerId, action) {
  const player = znajdzGracza(state, playerId);
  if (!player) return { ok: false, blad: 'Nie znaleziono gracza.' };
  if (state.winnerId) return { ok: false, blad: 'Gra już się zakończyła.' };
  if (aktualnyGracz(state).id !== playerId) return { ok: false, blad: 'To nie Twoja tura.' };

  if (action.type === 'discard') {
    return obslugaOdrzucenia(state, player, action);
  }

  if (state.turnPlayedCard) {
    return { ok: false, blad: 'W tej turze możesz zagrać tylko jedną kartę.' };
  }

  const card = usunKarteZReki(player, action.cardId);
  if (!card) return { ok: false, blad: 'Nie masz tej karty w ręce.' };

  let wynik;
  try {
    switch (card.type) {
      case 'organ': wynik = obslugaOrganu(state, player, card, action); break;
      case 'wirus': wynik = obslugaWirusa(state, player, card, action, 1); break;
      case 'podwojny_wirus': wynik = obslugaWirusa(state, player, card, action, 2); break;
      case 'lek': wynik = obslugaLeku(state, player, card, action, 1); break;
      case 'podwojny_lek': wynik = obslugaLeku(state, player, card, action, 2); break;
      case 'zarazenie': wynik = obslugaZarazenia(state, player, card, action); break;
      case 'zamiana': wynik = obslugaZamiany(state, player, card, action); break;
      case 'kradziez': wynik = obslugaKradziezy(state, player, card, action); break;
      case 'kwarantanna': wynik = obslugaKwarantanny(state, player, card, action); break;
      case 'wymiana_reki': wynik = obslugaWymianyReki(state, player, card, action); break;
      default: wynik = { ok: false, blad: 'Nieznany typ karty.' };
    }
  } catch (e) {
    wynik = { ok: false, blad: 'Błąd wykonania akcji: ' + e.message };
  }

  if (!wynik.ok) {
    // zwróć kartę do ręki, akcja nieudana
    player.hand.push(card);
    return wynik;
  }

  state.discard.push(card);
  state.turnPlayedCard = true;

  if (sprawdzWygrana(player)) {
    state.winnerId = player.id;
    dodajLog(state, `🏆 ${player.nick} skompletował(a) 4 zdrowe organy i WYGRYWA GRĘ!`);
    return { ok: true, koniecTury: false };
  }

  // W turze można zagrać dokładnie jedną kartę — po jej zagraniu tura się kończy.
  zakonczTure(state);
  return { ok: true, koniecTury: true };
}

function obslugaOdrzucenia(state, player, action) {
  const ids = action.cardIds || [];
  if (ids.length === 0) return { ok: false, blad: 'Wybierz co najmniej jedną kartę do odrzucenia.' };
  const odrzucone = [];
  for (const id of ids) {
    const c = usunKarteZReki(player, id);
    if (c) odrzucone.push(c);
  }
  state.discard.push(...odrzucone);
  dodajLog(state, `${player.nick} odrzucił(a) ${odrzucone.length} kart(y) i dobiera nowe.`);
  zakonczTure(state);
  return { ok: true, koniecTury: true };
}

/* -------------------- Organ -------------------- */
function obslugaOrganu(state, player, card, action) {
  const kolor = card.color;
  if (policzOrgany(player) >= 4) return { ok: false, blad: 'Masz już komplet 4 organów.' };
  
  if (player.organs[kolor]) return { ok: false, blad: 'Masz już ten organ na stole.' };

  if (kolor === 'prosthetic') {
    player.organs[kolor] = { color: 'prosthetic', status: 'prosthetic' };
  } else {
    player.organs[kolor] = { color: kolor, status: 'clean' };
  }

  dodajLog(state, `${player.nick} wyłożył(a) ${nazwaKarty(card)}.`);
  return { ok: true };
}

/* -------------------- Wirus (siła 1 lub 2) -------------------- */
function obslugaWirusa(state, player, card, action, sila) {
  const target = znajdzGracza(state, action.targetPlayerId);
  if (!target) return { ok: false, blad: 'Nie znaleziono celu.' };
  const organ = target.organs[action.targetColor];
  if (!organ) return { ok: false, blad: 'Wybrany gracz nie ma tego organu.' };
  if (card.color !== 'wild' && organ.color !== card.color && organ.color !== 'wild') {
    return { ok: false, blad: 'Kolory się nie zgadzają.' };
  }
  if (organ.status === 'immune' && sila < 2) {
    return { ok: false, blad: 'Ten organ jest uodporniony — zwykły wirus na niego nie działa.' };
  }

  return { ok: true, ...zaatakujOrgan(state, player, target, organ, sila) };
}

// Wspólna logika działania wirusa na organie; zwraca info do logu.
function zaatakujOrgan(state, atakujacy, wlasciciel, organ, sila) {
  if (organ.status === 'prosthetic') {
  dodajLog(state, `${atakujacy.nick} próbował(a) zaatakować sztuczną rękę gracza ${wlasciciel.nick} — wirusy nie działają na bioniczne organy!`);
  return {};
  }
  if (organ.status === 'immune') {
    if (sila >= 2) {
      organ.status = 'clean';
      dodajLog(state, `💥 ${atakujacy.nick} zbił(a) odporność organu (${organ.color}) gracza ${wlasciciel.nick} podwójnym wirusem!`);
    } else {
      dodajLog(state, `${atakujacy.nick} próbował(a) zaatakować odporny organ gracza ${wlasciciel.nick} — bez efektu.`);
    }
    return {};
  }
  if (organ.status === 'quarantine') {
    dodajLog(state, `${atakujacy.nick} próbował(a) zaatakować organ w kwarantannie gracza ${wlasciciel.nick} — bez efektu.`);
    return {};
  }
  if (organ.status === 'clean') {
    if (sila >= 2) {
      zniszczOrgan(state, wlasciciel, organ.color);
      dodajLog(state, `☠️ ${atakujacy.nick} zniszczył(a) organ (${organ.color}) gracza ${wlasciciel.nick} podwójnym wirusem!`);
    } else {
      organ.status = 'infected';
      dodajLog(state, `🦠 ${atakujacy.nick} zaraził(a) organ (${organ.color}) gracza ${wlasciciel.nick}.`);
    }
    return {};
  }
  if (organ.status === 'vaccine') {
    if (sila >= 2) {
      zniszczOrgan(state, wlasciciel, organ.color);
      dodajLog(state, `☠️ ${atakujacy.nick} zniszczył(a) zaszczepiony organ gracza ${wlasciciel.nick} podwójnym wirusem!`);
    } else {
      organ.status = 'clean';
      dodajLog(state, `${atakujacy.nick} zniósł(a) szczepionkę na organie gracza ${wlasciciel.nick} (wirus i lek się zniosły).`);
    }
    return {};
  }
  if (organ.status === 'infected') {
    zniszczOrgan(state, wlasciciel, organ.color);
    dodajLog(state, `☠️ ${atakujacy.nick} dobił(a) organ gracza ${wlasciciel.nick} — organ zniszczony!`);
    return {};
  }
  return {};
}

function zniszczOrgan(state, wlasciciel, kolor) {
  delete wlasciciel.organs[kolor];
}

/* -------------------- Lek (siła 1 lub 2) — tylko własne organy -------------------- */
function obslugaLeku(state, player, card, action, sila) {
  const organ = player.organs[action.targetColor];
  if (!organ) return { ok: false, blad: 'Nie masz tego organu.' };
  if (organ.status === 'prosthetic') return { ok: false, blad: 'Sztuczna ręka jest mechaniczna, nie potrzebuje leków.' };
  if (card.color !== 'wild' && organ.color !== card.color && organ.color !== 'wild') {
    return { ok: false, blad: 'Kolory się nie zgadzają.' };
  }
  if (organ.status === 'immune') return { ok: false, blad: 'Ten organ jest już odporny.' };

  if (sila >= 2) {
    if (organ.status === 'infected') {
      organ.status = 'vaccine';
      dodajLog(state, `${player.nick} użył(a) podwójnego leczenia — wyleczył(a) i zaszczepił(a) organ (${organ.color}).`);
    } else {
      organ.status = 'immune';
      dodajLog(state, `${player.nick} użył(a) podwójnego leczenia — organ (${organ.color}) jest teraz ODPORNY.`);
    }
    return { ok: true };
  }

  if (organ.status === 'infected') {
    organ.status = 'clean';
    dodajLog(state, `${player.nick} wyleczył(a) organ (${organ.color}).`);
  } else if (organ.status === 'clean') {
    organ.status = 'vaccine';
    dodajLog(state, `${player.nick} zaszczepił(a) organ (${organ.color}).`);
  } else if (organ.status === 'quarantine') {
    return { ok: false, blad: 'Organ jest w kwarantannie, lek nie jest tu potrzebny.' };
  } else if (organ.status === 'vaccine') {
    organ.status = 'immune';
    dodajLog(state, `${player.nick} podał(a) drugą dawkę — organ (${organ.color}) jest teraz ODPORNY.`);
  }
  return { ok: true };
}

/* -------------------- Zarażenie: przenieś wirusa na innego gracza -------------------- */
function obslugaZarazenia(state, player, card, action) {
  const wlasny = player.organs[action.sourceColor];
  if (!wlasny || wlasny.status !== 'infected') {
    return { ok: false, blad: 'Musisz wskazać własny zarażony organ.' };
  }
  const target = znajdzGracza(state, action.targetPlayerId);
  if (!target) return { ok: false, blad: 'Nie znaleziono celu.' };
  const docelowy = target.organs[action.targetColor];
  if (!docelowy) return { ok: false, blad: 'Cel nie ma organu w tym kolorze.' };
  if (docelowy.color !== wlasny.color && docelowy.color !== 'wild' && wlasny.color !== 'wild') {
    return { ok: false, blad: 'Kolory organów muszą się zgadzać.' };
  }
  wlasny.status = 'clean';
  zaatakujOrgan(state, player, target, docelowy, 1);
  dodajLog(state, `☣️ ${player.nick} przeniósł(a) wirusa na gracza ${target.nick}.`);
  return { ok: true };
}

/* -------------------- Zamiana ciał -------------------- */
function obslugaZamiany(state, player, card, action) {
  const target = znajdzGracza(state, action.targetPlayerId);
  if (!target || target.id === player.id) return { ok: false, blad: 'Wybierz innego gracza.' };
  const tmp = player.organs;
  player.organs = target.organs;
  target.organs = tmp;
  dodajLog(state, `🔄 ${player.nick} zamienił(a) się całym ciałem z graczem ${target.nick}!`);
  return { ok: true };
}

/* -------------------- Kradzież organu -------------------- */
function obslugaKradziezy(state, player, card, action) {
  const target = znajdzGracza(state, action.targetPlayerId);
  if (!target || target.id === player.id) return { ok: false, blad: 'Wybierz innego gracza.' };
  const organ = target.organs[action.targetColor];
  if (!organ) return { ok: false, blad: 'Ten gracz nie ma takiego organu.' };
  if (organ.status === 'immune') return { ok: false, blad: 'Nie można ukraść odpornego organu.' };
  if (policzOrgany(player) >= 4) return { ok: false, blad: 'Masz już komplet 4 organów.' };
  if (player.organs[organ.color]) return { ok: false, blad: 'Masz już organ tego koloru.' };
  delete target.organs[action.targetColor];
  player.organs[organ.color] = organ;
  dodajLog(state, `🖐️ ${player.nick} ukradł(a) organ (${organ.color}) graczowi ${target.nick}!`);
  return { ok: true };
}

/* -------------------- Kwarantanna -------------------- */
function obslugaKwarantanny(state, player, card, action) {
  const organ = player.organs[action.targetColor];
  if (!organ) return { ok: false, blad: 'Nie masz tego organu.' };
  if (organ.status !== 'clean') {
    return { ok: false, blad: 'Kwarantannę można nałożyć tylko na czysty, zdrowy organ.' };
  }

  organ.status = 'quarantine';
  dodajLog(state, `🛡️ ${player.nick} objął(ęła) kwarantanną organ (${organ.color}).`);
  return { ok: true };
}

/* -------------------- Wymiana ręki -------------------- */
function obslugaWymianyReki(state, player, card, action) {
  const staraReka = player.hand.splice(0, player.hand.length);
  state.discard.push(...staraReka);
  player.hand = dobierzKarty(state, 3);
  dodajLog(state, `🔁 ${player.nick} wymienił(a) całą rękę.`);
  return { ok: true };
}

/* -------------------- Widok stanu wysyłany do konkretnego gracza -------------------- */
function widokDlaGracza(state, playerId) {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      nick: p.nick,
      organs: p.organs,
      connected: p.connected,
      handCount: p.hand.length,
      hand: p.id === playerId ? p.hand : undefined
    })),
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    turnIndex: state.turnIndex,
    turnPlayedCard: state.turnPlayedCard,
    log: state.log.slice(0, 20),
    winnerId: state.winnerId,
    started: state.started
  };
}

function zresetujStanGry(state) {
  state.deck = shuffle(buildDeck());
  state.discard = [];
  state.turnIndex = 0;
  state.turnPlayedCard = false;
  state.winnerId = null;
  state.log = [];

  state.players.forEach((p) => {
    p.hand = [];
    p.organs = {};
  });

  state.players.forEach((p) => {
    p.hand = dobierzKarty(state, 3);
  });

  dodajLog(state, 'Nowa runda rozpoczęta! Powodzenia.');
  return state;
}

if (typeof window !== 'undefined') {
  window.WirusEngine = {
    stworzStanGry,
    zresetujStanGry,
    wykonajAkcje,
    widokDlaGracza,
    aktualnyGracz,
    znajdzGracza,
    zakonczTure,
    dodajLog
  };
}
