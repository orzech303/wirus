/* ============================================================
   cards.js — definicje kart, budowa talii, metadane wyświetlania
   ============================================================ */

const KOLORY = ['red', 'yellow', 'green', 'blue'];

const KOLOR_META = {
  red:    { nazwa: 'Czerwony',  organ: 'Serce',    ikona: '🫀', hex: '#ED1C09' },
  yellow: { nazwa: 'Żółty',     organ: 'Kość',     ikona: '🦴', hex: '#EDED09' },
  green:  { nazwa: 'Zielony',   organ: 'Płuca',    ikona: '🫁', hex: '#09ED15' },
  blue:   { nazwa: 'Niebieski', organ: 'Mózg',     ikona: '🧠', hex: '#09C3ED' },
  prosthetic: { nazwa: 'Szary', organ: 'Sztuczna ręka', ikona: '🦾', hex: '#777777' },
  wild:   { nazwa: 'Tęczowy',   organ: 'Wielonarząd', ikona: '👤', hex: 'wild' }
};

// Metadane typów kart: ikona, nazwa, krótki opis (do tooltipów / instrukcji w grze)
const TYP_META = {
  organ: {
    nazwa: 'Organ',
    ikona: '👤',
    opis: 'Wyłóż na stół, aby zacząć budować zdrowe ciało.'
  },
  wirus: {
    nazwa: 'Wirus',
    ikona: '🦠',
    opis: 'Zaraź organ przeciwnika w tym samym kolorze.'
  },
  lek: {
    nazwa: 'Leczenie',
    ikona: '💊',
    opis: 'Wylecz lub zaszczep własny organ w tym samym kolorze.'
  },
  zarazenie: {
    nazwa: 'Zarażenie',
    ikona: '☣️',
    opis: 'Przenieś wirusa z własnego organu na organ przeciwnika (ten sam kolor).'
  },
  zamiana: {
    nazwa: 'Zamiana ciał',
    ikona: '👥🔄',
    opis: 'Zamień się całym ciałem (wszystkimi organami) z wybranym graczem.'
  },
  kradziez: {
    nazwa: 'Kradzież organu',
    ikona: '🖤🖐',
    opis: 'Zabierz dowolny organ innego gracza (nie może być odporny).'
  },
  podwojny_lek: {
    nazwa: 'Podwójne leczenie',
    ikona: '🧪🧪',
    opis: 'Działa jak dwa lekarstwa naraz — od razu daje odporność albo leczy i szczepi.'
  },
  podwojny_wirus: {
    nazwa: 'Podwójny wirus',
    ikona: '👾👾',
    opis: 'Działa jak dwa wirusy naraz — od razu niszczy zdrowy organ.'
  },
  wymiana_reki: {
    nazwa: 'Wymiana ręki',
    ikona: '🔁',
    opis: 'Odrzuć swoje karty i dobierz nową rękę. Kończy turę.'
  },
  kwarantanna: {
    nazwa: 'Kwarantanna',
    ikona: '🛡️',
    opis: 'Chroni Twój organ przed wirusami (ale wciąż można go ukraść).'
  }
};

function nazwaKarty(card) {
  const meta = TYP_META[card.type];
  const kolorInfo = KOLOR_META[card.color];

  if (card.type === 'organ' && kolorInfo) {
    return `${kolorInfo.organ} (${kolorInfo.nazwa})`;
  }

  if (['wirus', 'lek'].includes(card.type)) {
    const kolor = kolorInfo ? kolorInfo.nazwa : '';
    return `${meta.nazwa} ${kolor}`;
  }

  return meta.nazwa;
}

function buildDeck() {
  const deck = [];
  let id = 0;

  // 4 podstawowe kolory
  KOLORY.forEach((c) => {
    for (let i = 0; i < 5; i++) deck.push({ id: id++, type: 'organ', color: c });
    for (let i = 0; i < 4; i++) deck.push({ id: id++, type: 'wirus', color: c });
    for (let i = 0; i < 4; i++) deck.push({ id: id++, type: 'lek', color: c });
    
    // Podwójne karty w 4 kolorach
    deck.push({ id: id++, type: 'podwojny_wirus', color: c });
    deck.push({ id: id++, type: 'podwojny_lek', color: c });
  });

  // Warianty tęczowe (jokery) — w tym podwójne
  deck.push({ id: id++, type: 'organ', color: 'wild' });
  deck.push({ id: id++, type: 'wirus', color: 'wild' });
  deck.push({ id: id++, type: 'lek', color: 'wild' });
  deck.push({ id: id++, type: 'podwojny_wirus', color: 'wild' });
  deck.push({ id: id++, type: 'podwojny_lek', color: 'wild' });

  // Organ bioniczny
  deck.push({ id: id++, type: 'organ', color: 'prosthetic' });

  // Karty akcji specjalnych
  const specialne = [
    ['zarazenie', 3],
    ['zamiana', 1],
    ['kradziez', 3],
    ['wymiana_reki', 3],
    ['kwarantanna', 3]
  ];
  specialne.forEach(([type, count]) => {
    for (let i = 0; i < count; i++) deck.push({ id: id++, type, color: null });
  });

  return deck;
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pobierzIkoneKarty(card) {
  if (card.color === 'wild') {
    if (card.type === 'podwojny_wirus') return '🌈👾';
    if (card.type === 'podwojny_lek') return '🌈🧪';
    if (card.type === 'organ') return '🌈👤';
    if (card.type === 'wirus') return '🌈🦠';
    if (card.type === 'lek') return '🌈💊';
  }
  if (card.type === 'organ' && KOLOR_META[card.color]) {
    return KOLOR_META[card.color].ikona;
  }
  return TYP_META[card.type] ? TYP_META[card.type].ikona : '🃏';
}

if (typeof window !== 'undefined') {
  window.WirusCards = { KOLORY, KOLOR_META, TYP_META, nazwaKarty, buildDeck, shuffle };
}
