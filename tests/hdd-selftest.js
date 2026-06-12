/* =========================================================
   KALKULATOR-ZALICZEK — Samotest sygnatury energetycznej (HDD)

   Uruchomienie:  node tests/hdd-selftest.js   (offline, bez frameworka)

   Ładuje PRODUKCYJNE pliki aplikacji przez shim `window` i porównuje
   wyniki z wartościami kontrolnymi na sztywno:
     1. dopasowanie OLS sygnatury E = a + b·HDD + c·t (znane punkty),
     2. prognoza z dopasowanej sygnatury,
     3. kwantyl liniowo interpolowany (percentyl surowości zimy),
     4. sanity wygenerowanej klimatologii (js/kz.climate.js),
     5. ścieżka end-to-end: rekordy + temperatury → fitSignature →
        P.forecastGJ (jawna temperatura ma pierwszeństwo, lato → trend),
     6. P.tempForecast — temperatura zakładana przez sygnaturę (odwrócenie
        HDD; maj–wrz i metoda 'trend' → null),
     7. jednostka łączna (P.MERGED) — suma budynków w M04: getArea, monthCell
        (fakt i prognoza), simulate (kwoty ustalone + dobór zerujący saldo).

   Wynik: PASS/FAIL per test; exit code ≠ 0 przy jakiejkolwiek porażce.
   ========================================================= */
'use strict';

global.window = global;            // pliki aplikacji rozszerzają window.KZ
require('../js/kz.config.js');
require('../js/kz.climate.js');
require('../js/kz.data.js');
require('../js/kz.estimate.js');
const P = window.KZ;

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`);
  if (!ok) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// ---------- 1. Dopasowanie OLS sygnatury ----------
// Punkty z dwóch sezonów: { hdd, t, e } — wartości kontrolne policzone niezależnie.
const PTS = [
  { hdd: 520, t: 1, e: 142 },
  { hdd: 430, t: 1, e: 121 },
  { hdd: 300, t: 1, e: 89 },
  { hdd: 480, t: 2, e: 124 },
  { hdd: 450, t: 2, e: 117 },
  { hdd: 280, t: 2, e: 76 },
];
const fit = P._signatureFit(PTS, true);
check('fit: istnieje', !!fit);
if (fit) {
  check('fit: a ≈ 25,43 GJ', near(fit.a, 25.43, 0.05), `a=${fit.a}`);
  check('fit: b ≈ 0,2409 GJ/°D', near(fit.b, 0.2409, 0.001), `b=${fit.b}`);
  check('fit: c ≈ −8,455 GJ/sezon', near(fit.c, -8.455, 0.05), `c=${fit.c}`);
  check('fit: R² > 0,99', fit.r2 > 0.99, `r2=${fit.r2}`);
  const maxRes = Math.max(...PTS.map(p => Math.abs(p.e - (fit.a + fit.b * p.hdd + fit.c * p.t))));
  check('fit: reszty < 0,5 GJ', maxRes < 0.5, `max=${maxRes}`);

  // ---------- 2. Prognoza z sygnatury ----------
  const pred = fit.a + fit.b * 470 + fit.c * 3;
  check('prognoza: HDD=470, t=3 → ≈113,3 GJ', near(pred, 113.3, 0.2), `pred=${pred}`);
}

// model bez trendu (mało sezonów) — c musi być 0, a i b skończone i sensowne
const fit2 = P._signatureFit(PTS, false);
check('fit 2-par: c = 0, a i b skończone', !!fit2 && fit2.c === 0 && isFinite(fit2.a) && isFinite(fit2.b) && fit2.b > 0,
      fit2 ? `a=${fit2.a}, b=${fit2.b}` : 'null');

// ---------- 3. Kwantyl (percentyl surowości zimy) ----------
const SUMS = [1800, 2000, 2200, 2400, 2600];
check('kwantyl: P50 = mediana', P._quantile(SUMS, 50) === 2200);
check('kwantyl: P80 = 2440 (interpolacja)', P._quantile(SUMS, 80) === 2440, `q=${P._quantile(SUMS, 80)}`);
check('kwantyl: P0 = min, P100 = max', P._quantile(SUMS, 0) === 1800 && P._quantile(SUMS, 100) === 2600);

// ---------- 4. Sanity klimatologii (plik generowany) ----------
const city = P.CLIMATE && P.CLIMATE.opole;
check('klimat: jest P.CLIMATE.opole', !!city);
if (city) {
  check('klimat: ≥10 kompletnych sezonów', city.seasonSums.length >= 10, `n=${city.seasonSums.length}`);
  check('klimat: średnia suma sezonowa 1700–2700 HDD', city.meanSeasonSum > 1700 && city.meanSeasonSum < 2700, `mean=${city.meanSeasonSum}`);
  // rok typowy = średnie per miesiąc po tych samych sezonach → suma profilu = średnia sum
  const profileSum = Object.values(city.monthlyHDD).reduce((q, v) => q + v, 0);
  check('klimat: Σ roku typowego = średnia sum sezonowych', near(profileSum, city.meanSeasonSum, 2), `Σ=${profileSum} vs ${city.meanSeasonSum}`);
  check('klimat: tylko miesiące grzewcze (7)', Object.keys(city.monthlyHDD).length === 7);
}

// ---------- 5. End-to-end: rekordy + temperatury → forecastGJ ----------
// Budynek syntetyczny o DOKŁADNIE liniowej charakterystyce E = 20 + 0,25·HDD
// (bez trendu rocznego) na 3 sezonach grzewczych → fit musi ją odtworzyć,
// a prognoza z jawną temperaturą trafić w wartość analityczną.
P.state.hddCity = 'opole';
P.state.m02Method = 'hdd';
P.state.m02HddP = 80;
const BASE_T = { 10: 8, 11: 4, 12: 0, 1: -3, 2: -1, 3: 3, 4: 7 };  // profil temperatur
[2022, 2023, 2024].forEach((season, si) => {
  for (const m of [10, 11, 12, 1, 2, 3, 4]) {
    const y = m >= 10 ? season : season + 1;
    const T = BASE_T[m] + si * 0.5;                 // lekka zmienność między sezonami
    const hdd = Math.max(0, 15 - T) * daysInMonth(y, m);
    P.temps[P.ymKey(y, m)] = T;
    P.records.push({ id: `TEST|CO|${y}|${m}`, building: 'TEST', medium: 'CO',
                     year: y, month: m, gj: 20 + 0.25 * hdd, qty: 1000 });
  }
});

const e2e = P.fitSignature('TEST');
check('e2e: fitSignature istnieje', !!e2e);
if (e2e) {
  check('e2e: pełny model (3 sezony)', e2e.nSeasons === 3 && e2e.n === 21, `sez=${e2e.nSeasons}, n=${e2e.n}`);
  check('e2e: a ≈ 20, b ≈ 0,25, c ≈ 0', near(e2e.a, 20, 0.01) && near(e2e.b, 0.25, 0.0001) && near(e2e.c, 0, 0.01),
        `a=${e2e.a}, b=${e2e.b}, c=${e2e.c}`);
}

// jawna temperatura użytkownika ma pierwszeństwo (bez percentyla):
// styczeń 2026, T=−2 °C → HDD = 17×31 = 527 → E = 20 + 0,25·527 = 151,75 GJ
P.temps[P.ymKey(2026, 1)] = -2;
const fjan = P.forecastGJ('TEST', 'CO', 1, 2026);
check('e2e: prognoza ze stycznia (jawna temp.) = 151,75 GJ',
      !!fjan && near(fjan.value, 151.75, 0.05) && fjan.method.includes('sygnatura'),
      fjan ? `v=${fjan.value}, ${fjan.method}` : 'null');

// bez jawnej temperatury → klimatologia (rok typowy × trend klimatu × percentyl)
const ffeb = P.forecastGJ('TEST', 'CO', 2, 2026);
check('e2e: prognoza z lutego (klimatologia) > 0 sygnaturą',
      !!ffeb && ffeb.value > 0 && ffeb.method.includes('sygnatura'),
      ffeb ? `v=${ffeb.value}, ${ffeb.method}` : 'null');

// lato poza sezonem grzewczym → fallback na trend per miesiąc (brak próbek lipca → null)
check('e2e: lipiec → fallback (brak próbek → null)', P.forecastGJ('TEST', 'CO', 7, 2026) === null);

// ---------- 6. Prognoza temperatury (odwrócenie HDD) ----------
// jawna temperatura → odwrócenie musi ją odtworzyć co do wartości
const tjan = P.tempForecast(2026, 1);
check('temp: styczeń (jawna −2 °C) → −2', tjan != null && near(tjan, -2, 0.001), `t=${tjan}`);
// klimatologia P80 → zima chłodniejsza niż typowa, ale w fizycznym zakresie
const tfeb = P.tempForecast(2026, 2);
check('temp: luty (klimatologia P80) w zakresie −25…10 °C', tfeb != null && tfeb > -25 && tfeb < 10, `t=${tfeb}`);
// percentyl surowszy → temperatura niższa (monotoniczność względem P)
P.state.m02HddP = 50;
const tfeb50 = P.tempForecast(2026, 2);
P.state.m02HddP = 80;
check('temp: P80 chłodniej niż P50', tfeb50 != null && tfeb < tfeb50, `P80=${tfeb}, P50=${tfeb50}`);
// maj–wrz: poza klimatologią → null (fallback trendem nie zakłada temperatury)
check('temp: lipiec → null (poza sezonem)', P.tempForecast(2026, 7) === null);

// przełączenie na 'trend' → sygnatura nieaktywna
P.state.m02Method = 'trend';
const ftr = P.forecastGJ('TEST', 'CO', 1, 2026);
check('e2e: metoda trend → bez sygnatury', !!ftr && !ftr.method.includes('sygnatura'), ftr && ftr.method);
check('temp: metoda trend → null', P.tempForecast(2026, 2) === null);

// ---------- 7. Jednostka łączna (P.MERGED) — suma budynków w M04 ----------
// Drugi budynek o DOKŁADNIE liniowej charakterystyce E = 10 + 0,10·HDD na tych
// samych temperaturach → fit obu budynków jest dokładny, więc suma prognoz
// jednostki łącznej też ma wartość analityczną.
P.state.m02Method = 'hdd';
[2022, 2023, 2024].forEach((season, si) => {
  for (const m of [10, 11, 12, 1, 2, 3, 4]) {
    const y = m >= 10 ? season : season + 1;
    const T = BASE_T[m] + si * 0.5;
    const hdd = Math.max(0, 15 - T) * daysInMonth(y, m);
    P.records.push({ id: `TEST2|CO|${y}|${m}`, building: 'TEST2', medium: 'CO',
                     year: y, month: m, gj: 10 + 0.10 * hdd, qty: 500 });
  }
});
P.areas.TEST = 1000;
P.areas.TEST2 = 500;
P.state.m01Cols = null; P.state.m01From = null; P.state.m01To = null;   // re-seed układu z rekordów

check('merged: getArea(P.MERGED) = Σ powierzchni (1500)', P.getArea(P.MERGED) === 1500, `a=${P.getArea(P.MERGED)}`);

// komórka faktu = suma rekordów obu budynków
const mc = P.monthCell(P.MERGED, 'CO', 2023, 1);
const sum23 = P.getRecord('TEST', 'CO', 2023, 1).gj + P.getRecord('TEST2', 'CO', 2023, 1).gj;
check('merged: monthCell fakt = suma GJ obu budynków', mc.status === 'actual' && near(mc.gj, sum23, 1e-9),
      `gj=${mc.gj} vs ${sum23}`);

// komórka prognozy: styczeń 2026 z jawną temp. −2 °C → HDD = 527
//   TEST: 20 + 0,25·527 = 151,75; TEST2: 10 + 0,10·527 = 62,70 → suma 214,45
const mf = P.monthCell(P.MERGED, 'CO', 2026, 1);
check('merged: monthCell prognoza = suma prognoz (214,45 GJ)',
      mf.status === 'forecast' && near(mf.gj, 214.45, 0.1), `status=${mf.status}, gj=${mf.gj}`);

// sentinel nie może stać się nazwą budynku
check('merged: guard nazwy w m01AddBuilding/m01RenameBuilding',
      P.m01AddBuilding(P.MERGED) === false && P.m01RenameBuilding('TEST2', P.MERGED) === false);

// m04Building zachowuje wybór sentinela (nie nadpisuje stanu pierwszą kolumną)
P.state.m04Building = P.MERGED;
check('merged: m04Building() zwraca P.MERGED', P.m04Building() === P.MERGED && P.state.m04Building === P.MERGED);

// simulate(P.MERGED): stawka wpisana w JEDNYM budynku → kwota ustalona liczona
// z JEGO driverem; dobór „ogona" zeruje saldo każdego okresu rozliczeniowego.
P.prices[P.ymKey(2022, 10)] = 100;                       // cena carry-forward na cały zakres
P.setAdvance('TEST', 'CO', 2022, 10, 2.0);               // 2 zł/m² tylko w TEST (1000 m²)
const simM = P.simulate(P.MERGED, 'CO');
const m0 = simM.months[0];
check('merged: zaliczka ustalona = stawka × powierzchnia budynku (2000 zł)',
      !!m0 && m0.fixed === true && near(m0.advTotal, 2000, 1e-9), m0 && `adv=${m0.advTotal}`);
check('merged: stawka implikowana = kwota / Σdriver (1,333 zł/m²)',
      !!m0 && near(m0.rate, 2000 / 1500, 1e-9), m0 && `r=${m0.rate}`);
check('merged: dobór zeruje saldo (overshoot ≈ 0)', near(simM.overshoot, 0, 1e-6), `o=${simM.overshoot}`);
check('merged: jest dobrany ogon', simM.firstComputed === 1 && simM.flatRates.length > 0,
      `first=${simM.firstComputed}`);

// ---------- wynik ----------
console.log(failed ? `\n${failed} TEST(ÓW) NIE PRZESZŁO` : '\nWSZYSTKIE TESTY PRZESZŁY');
process.exit(failed ? 1 : 0);
