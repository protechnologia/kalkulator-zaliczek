/* =========================================================
   KALKULATOR-ZALICZEK — Generator klimatologii HDD (narzędzie)

   Uruchomienie:  node tools/hdd-climate.js     (WYMAGA internetu)
   Wynik:         js/kz.climate.js              (plik commitowany do repo)

   Pobiera z Open-Meteo Archive API średnie dobowe temperatury dla
   wszystkich miast z tabeli CITIES, agreguje je do średnich
   miesięcznych i liczy HDD tą samą aproksymacją MIESIĘCZNĄ, której
   używa aplikacja (kz.estimate.js):

       HDD_m = max(0, T_BAZ − T_śr_mies) × liczba_dni_miesiąca

   Spójność aproksymacji jest celowa: błąd miesięcznego przybliżenia
   (zaniżanie HDD w miesiącach przejściowych) znosi się między
   uczeniem sygnatury a prognozą. NIE liczyć tu HDD z dób!

   Sezon grzewczy = paź–kwi, identyfikowany rokiem października
   (styczeń 2024 → sezon 2023/24). Generator bierze tylko KOMPLETNE
   sezony (wszystkie 7 miesięcy) i wymaga ich ciągłości — sumy
   sezonowe służą potem do percentyli surowości zimy i do trendu
   klimatycznego, więc dziura w szeregu psułaby oba.

   Dodanie miasta: dopisz wiersz do CITIES (id = klucz w P.CLIMATE,
   małe litery bez polskich znaków), uruchom skrypt, sprawdź sanity
   (suma sezonowa dla Polski ~1800–2600 HDD) i zacommituj
   wygenerowany js/kz.climate.js. Szczegóły w CLAUDE.md.

   Cache: surowa odpowiedź API ląduje w tools/cache/<id>_<od>_<do>.json
   i przy kolejnych uruchomieniach jest używana zamiast pobierania.
   Gdy Node nie ufa lokalnemu certyfikatowi (proxy/antywirus z inspekcją
   TLS — błąd UNABLE_TO_VERIFY_LEAF_SIGNATURE), pobierz plik ręcznie
   pod tą samą nazwą, np. PowerShellem:
     Invoke-WebRequest -UseBasicParsing "<url z komunikatu skryptu>" `
       -OutFile tools/cache/<id>_<od>_<do>.json
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const T_BASE = 15;                 // baza HDD [°C] — jak w aplikacji
const FIRST_SEASON = 2005;         // pierwszy sezon: 2005/06 (≥20 sezonów historii)

// Sezon grzewczy paź–kwi. Ta lista ogranicza TYLKO zakres modelu HDD —
// zużycie CO poza nią (maj–wrz: dogrzewanie, straty, cyrkulacja) nadal jest
// prognozowane trendem per miesiąc i wchodzi do kosztów oraz zaliczek (M04).
// Zmiana zakresu wymaga równoczesnej zmiany seasonOf() w js/kz.estimate.js,
// przegenerowania js/kz.climate.js i poprawki asercji „7 miesięcy" w samoteście.
const HEATING_MONTHS = [10, 11, 12, 1, 2, 3, 4];

const CITIES = [
  { id: 'opole', name: 'Opole', lat: 50.675, lon: 17.931 },
];

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// Sezon grzewczy miesiąca (rok października) lub null poza sezonem.
function seasonOf(y, m) {
  if (m >= 10) return y;
  if (m <= 4) return y - 1;
  return null;
}

// Ostatni KOMPLETNY sezon: 2025/26 kończy się 30 kwietnia 2026,
// więc od maja 2026 można go pobrać w całości.
function lastCompleteSeason(now) {
  const y = now.getFullYear(), m = now.getMonth() + 1;
  return m >= 5 ? y - 1 : y - 2;
}

async function fetchDailyMeans(city, startDate, endDate) {
  const url = 'https://archive-api.open-meteo.com/v1/archive' +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    '&daily=temperature_2m_mean&timezone=Europe%2FWarsaw';
  const cacheDir = path.join(__dirname, 'cache');
  const cacheFile = path.join(cacheDir, `${city.id}_${startDate}_${endDate}.json`);

  let data;
  if (fs.existsSync(cacheFile)) {
    console.log(`  cache: ${path.relative(process.cwd(), cacheFile)}`);
    data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } else {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error(`Pobieranie nie powiodło się (${e.cause ? e.cause.code : e.message}).\n` +
        `Pobierz ręcznie do cache i uruchom ponownie:\n` +
        `  Invoke-WebRequest -UseBasicParsing "${url}" -OutFile "${cacheFile}"`);
    }
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status} dla ${city.name}: ${await res.text()}`);
    data = await res.json();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
  }
  if (!data.daily || !data.daily.time) throw new Error(`Open-Meteo: brak danych daily dla ${city.name}`);
  return data.daily; // { time: ['RRRR-MM-DD',...], temperature_2m_mean: [...] }
}

// Dobowe → średnie miesięczne; miesiąc z >2 brakami dobowymi odrzucamy.
function monthlyMeans(daily) {
  const acc = {}; // 'RRRR-MM' → { sum, n, days }
  daily.time.forEach((d, i) => {
    const t = daily.temperature_2m_mean[i];
    const ym = d.slice(0, 7);
    if (!acc[ym]) {
      acc[ym] = { sum: 0, n: 0, days: daysInMonth(+d.slice(0, 4), +d.slice(5, 7)) };
    }
    if (t != null && isFinite(t)) { acc[ym].sum += t; acc[ym].n++; }
  });
  const out = {};
  for (const ym of Object.keys(acc)) {
    const a = acc[ym];
    if (a.n >= a.days - 2) out[ym] = a.sum / a.n;
  }
  return out;
}

// Klimatologia miasta: HDD per miesiąc grzewczy, sumy KOMPLETNYCH sezonów,
// profil roku typowego (średnia per miesiąc kalendarzowy), trend liniowy sum.
function buildClimate(city, means, lastSeason) {
  const seasons = [];        // chronologicznie: { season, sum, byMonth }
  for (let s = FIRST_SEASON; s <= lastSeason; s++) {
    const byMonth = {};
    let complete = true;
    for (const m of HEATING_MONTHS) {
      const y = m >= 10 ? s : s + 1;
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      const t = means[ym];
      if (t == null) { complete = false; break; }
      byMonth[m] = Math.max(0, T_BASE - t) * daysInMonth(y, m);
    }
    if (!complete) throw new Error(`${city.name}: niekompletny sezon ${s}/${(s + 1) % 100} — przerwij i sprawdź dane`);
    seasons.push({ season: s, sum: HEATING_MONTHS.reduce((q, m) => q + byMonth[m], 0), byMonth });
  }
  if (seasons.length < 10) throw new Error(`${city.name}: za mało sezonów (${seasons.length})`);

  const monthlyHDD = {};
  for (const m of HEATING_MONTHS) {
    monthlyHDD[m] = round1(seasons.reduce((q, s) => q + s.byMonth[m], 0) / seasons.length);
  }
  const sums = seasons.map(s => round1(s.sum));
  const mean = sums.reduce((q, v) => q + v, 0) / sums.length;

  // trend liniowy sum sezonowych (OLS po indeksie sezonu)
  const n = sums.length;
  const mi = (n - 1) / 2;
  let sxx = 0, sxy = 0;
  sums.forEach((v, i) => { sxx += (i - mi) ** 2; sxy += (i - mi) * (v - mean); });
  const trend = sxy / sxx;

  return {
    name: city.name, lat: city.lat, lon: city.lon,
    tBase: T_BASE,
    refRange: `${FIRST_SEASON}/${String((FIRST_SEASON + 1) % 100).padStart(2, '0')}–${lastSeason}/${String((lastSeason + 1) % 100).padStart(2, '0')}`,
    firstSeason: FIRST_SEASON,
    monthlyHDD,
    seasonSums: sums,
    meanSeasonSum: round1(mean),
    trendPerSeason: round1(trend),
  };
}

const round1 = v => Math.round(v * 10) / 10;

function emitFile(climates) {
  const body = Object.entries(climates).map(([id, c]) => {
    const mh = HEATING_MONTHS.slice().sort((a, b) => a - b)
      .map(m => `${m}: ${c.monthlyHDD[m]}`).join(', ');
    return `    ${id}: {
      name: '${c.name}', lat: ${c.lat}, lon: ${c.lon},
      tBase: ${c.tBase},
      refRange: '${c.refRange}',          // kompletne sezony grzewcze (paź–kwi)
      firstSeason: ${c.firstSeason},                  // sezon o indeksie 0 na osi trendu
      // rok typowy: średnie HDD per miesiąc kalendarzowy (1=sty … 12=gru)
      monthlyHDD: { ${mh} },
      // sumy sezonowe HDD, chronologicznie od firstSeason (percentyle surowości zimy)
      seasonSums: [${c.seasonSums.join(', ')}],
      meanSeasonSum: ${c.meanSeasonSum},
      trendPerSeason: ${c.trendPerSeason},             // [HDD/sezon] — korekta klimatyczna
    },`;
  }).join('\n');

  return `/* =========================================================
   KALKULATOR-ZALICZEK — Klimatologia HDD (PLIK GENEROWANY)

   NIE EDYTOWAĆ RĘCZNIE — regeneruje go w całości tools/hdd-climate.js
   (źródło: Open-Meteo Archive API, średnie dobowe temperature_2m_mean).

   HDD liczone aproksymacją MIESIĘCZNĄ — tą samą co w kz.estimate.js:
   HDD_m = max(0, tBase − T_śr_mies) × liczba_dni. Używane wyłącznie do
   PROGNOZY przyszłych miesięcy (rok typowy + trend klimatu + percentyl);
   HDD historii liczy się z temperatur użytkownika (P.temps).
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  P.CLIMATE = {
${body}
  };

})(window.KZ);
`;
}

(async function main() {
  const lastSeason = lastCompleteSeason(new Date());
  const startDate = `${FIRST_SEASON}-10-01`;
  const endDate = `${lastSeason + 1}-04-30`;
  console.log(`Zakres: ${startDate} … ${endDate} (sezony ${FIRST_SEASON}/${(FIRST_SEASON + 1) % 100} – ${lastSeason}/${(lastSeason + 1) % 100})`);

  const climates = {};
  for (const city of CITIES) {
    console.log(`Pobieram ${city.name} (${city.lat}, ${city.lon})…`);
    const daily = await fetchDailyMeans(city, startDate, endDate);
    const climate = buildClimate(city, monthlyMeans(daily), lastSeason);
    climates[city.id] = climate;
    console.log(`  sezonów: ${climate.seasonSums.length}, średnia suma: ${climate.meanSeasonSum} HDD, trend: ${climate.trendPerSeason} HDD/sezon`);
    console.log(`  rok typowy: ${HEATING_MONTHS.map(m => `${m}→${climate.monthlyHDD[m]}`).join('  ')}`);
  }

  const out = path.join(__dirname, '..', 'js', 'kz.climate.js');
  fs.writeFileSync(out, emitFile(climates), 'utf8');
  console.log(`Zapisano ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
