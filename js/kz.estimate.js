/* =========================================================
   KALKULATOR-ZALICZEK — Estymacja i symulacja

   Prognoza zużycia (Moduł 02/03/04):
   Dla każdego miesiąca pozostałego okresu prognozujemy zużycie GJ / wody
   na podstawie tego samego miesiąca kalendarzowego z poprzednich lat:
     • 0 próbek  → miesiąc pomijany (nie symulujemy)
     • 1 próbka  → trend płaski = ta wartość
     • ≥2 próbki → regresja liniowa względem ROKU, ekstrapolacja
   Koszt miesiąca = prognoza_GJ × cena_GJ(rok,mies.).

   Dla CO dostępny jest też drugi sposób (state.m02Method === 'hdd'):
   SYGNATURA ENERGETYCZNA budynku z korektą pogodową —
     E_m = a + b·HDD_m + c·t
   (a = składnik stały [GJ], b = czułość na chłód [GJ/stopniodzień],
   c = trend roczny [GJ/sezon], t = numer sezonu grzewczego). Jedna
   wspólna regresja OLS na wszystkich miesiącach grzewczych historii;
   HDD przyszłości z klimatologii miasta (P.CLIMATE, kz.climate.js)
   z korektą trendu klimatu i percentylem surowości zimy. Przy braku
   warunków (mało danych, miesiąc poza sezonem, brak temperatur)
   metoda spada na trend per miesiąc.

   Zaliczki (Moduł 03) wpisuje się RĘCZNIE jako stawki jednostkowe:
     CO  → zł/m² (mnożone przez powierzchnię budynku)
     CWU → zł/m³ (mnożone przez zużycie wody danego miesiąca)
   simulate() (Moduł 04) dobiera „ogon" zaliczek i zwraca saldo (overshoot).
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  // Regresja liniowa y = a·x + b metodą najmniejszych kwadratów.
  // Zwraca funkcję ekstrapolującą; przy zerowej wariancji x → średnia.
  function linearTrend(pts) {
    const n = pts.length;
    if (n === 1) { const v = pts[0].y; return { f: () => v, slope: 0, kind: 'flat1' }; }
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let num = 0, den = 0;
    for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
    if (den === 0) { return { f: () => my, slope: 0, kind: 'mean' }; }
    const a = num / den, b = my - a * mx;
    return { f: x => a * x + b, slope: a, kind: 'linear' };
  }

  // Prognoza wielkości (GJ lub qty) dla miesiąca/roku z danych historycznych.
  // field = 'gj' | 'qty'. Zwraca { value, method, n } lub null gdy brak danych.
  function forecastField(building, medium, monthId, targetYear, field) {
    const samples = P.monthSamples(building, medium, monthId);
    if (samples.length === 0) return null;
    const pts = samples.map(s => ({ x: s.year, y: s[field] }));
    const t = linearTrend(pts);
    const v = Math.max(0, t.f(targetYear));
    const method = samples.length === 1 ? 'płaski (1 próbka)'
                 : t.kind === 'linear' ? `trend (${samples.length} lat)` : `średnia (${samples.length})`;
    return { value: v, method, n: samples.length };
  }

  // Prognoza WSKAŹNIKA CWU (GJ/m³) — trend energii na 1 m³ wody. Wielkość fizycznie
  // stabilna (energia podgrzania m³), więc ekstrapoluje się łagodniej niż samo GJ.
  // Próbki z qty<=0 pomijane (brak sensownego wskaźnika). Zwraca { value, n } lub null.
  function forecastIntensity(building, medium, monthId, targetYear) {
    const pts = P.monthSamples(building, medium, monthId)
      .filter(s => s.qty > 0)
      .map(s => ({ x: s.year, y: s.gj / s.qty }));
    if (pts.length === 0) return null;
    const t = linearTrend(pts);
    return { value: Math.max(0, t.f(targetYear)), n: pts.length };
  }

  // ===== SYGNATURA ENERGETYCZNA CO (sposób prognozy 'hdd') =====
  //
  // Wszystko liczone PO MIESIĄCACH (nie po dobach) — tą samą aproksymacją,
  // którą wygenerowano klimatologię w kz.climate.js, więc błąd przybliżenia
  // znosi się między uczeniem a prognozą.

  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

  // Sezon grzewczy = paź–kwi, identyfikowany rokiem października
  // (styczeń 2024 → sezon 2023). Maj–wrzesień → null (poza sezonem).
  // Null NIE wyklucza miesiąca z prognozy ani zaliczek: zużycie CO poza
  // sezonem (dogrzewanie w maju/wrześniu, letnie straty i cyrkulacja —
  // w danych realnie 1–30 GJ) prognozuje fallback trendem per miesiąc,
  // a jego koszt normalnie wchodzi do simulate() i doboru stawek (M04).
  // Z UCZENIA sygnatury te miesiące są wykluczone celowo: ich zużycie nie
  // zależy od pogody (HDD≈0), więc psułoby regresję E = a + b·HDD.
  // Ten sam zakres paź–kwi: HEATING_MONTHS w tools/hdd-climate.js.
  function seasonOf(y, m) {
    if (m >= 10) return y;
    if (m <= 4) return y - 1;
    return null;
  }

  // Klimatologia aktywnego miasta (state.hddCity) albo null, gdy brak danych.
  function activeCity() {
    const c = P.CLIMATE || {};
    return c[P.state.hddCity] || null;
  }

  // HDD miesiąca z JAWNEJ temperatury użytkownika (P.temps, bez carry-forward);
  // null gdy brak wpisu — punktu nie wolno imputować zerem.
  function hddFromTemp(y, m, tBase) {
    const t = P.getTemp(y, m);
    if (t == null) return null;
    return Math.max(0, tBase - t) * daysInMonth(y, m);
  }

  // Rozwiązanie układu k×k (eliminacja Gaussa z częściowym wyborem elementu);
  // null gdy układ osobliwy (np. wszystkie HDD identyczne).
  function solveLinear(A, v) {
    const k = v.length;
    const M = A.map((row, i) => row.concat(v[i]));
    for (let col = 0; col < k; col++) {
      let piv = col;
      for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-9) return null;
      const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
      for (let r = 0; r < k; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => row[k] / row[i]);
  }

  // OLS sygnatury E = a + b·hdd (+ c·t przy withTrend) z równań normalnych.
  // points = [{ hdd, t, e }]. Zwraca { a, b, c, n, r2 } lub null.
  P._signatureFit = function(points, withTrend) {
    const n = points.length;
    if (!n) return null;
    const k = withTrend ? 3 : 2;
    const reg = p => withTrend ? [1, p.hdd, p.t] : [1, p.hdd];
    const A = [];
    for (let i = 0; i < k; i++) A.push(new Array(k).fill(0));
    const v = new Array(k).fill(0);
    for (const p of points) {
      const x = reg(p);
      for (let i = 0; i < k; i++) {
        v[i] += x[i] * p.e;
        for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j];
      }
    }
    const s = solveLinear(A, v);
    if (!s) return null;
    const a = s[0], b = s[1], c = withTrend ? s[2] : 0;
    const meanE = points.reduce((q, p) => q + p.e, 0) / n;
    let ssRes = 0, ssTot = 0;
    for (const p of points) {
      const d = p.e - (a + b * p.hdd + c * p.t);
      ssRes += d * d;
      ssTot += (p.e - meanE) ** 2;
    }
    return { a, b, c, n, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
  };

  // Dopasowanie sygnatury budynku na CAŁEJ historii CO (miesiące grzewcze
  // z rekordem ORAZ jawną temperaturą — inne punkty wykluczone, bez imputacji).
  // Liczona od nowa przy każdym wywołaniu — danych mało, fit jest tani,
  // a cache groziłby przestarzałą sygnaturą. Degradacja przy małej historii:
  // ≥3 sezony → pełny model (a,b,c); mniej → c=0; <5 punktów → null (fallback).
  // Zwraca { a, b, c, n, nSeasons, r2, t0 } (t0 = sezon o numerze t=1) lub null.
  P.fitSignature = function(building) {
    const city = activeCity();
    if (!city) return null;
    const pts = [];
    const seasons = new Set();
    P.records.forEach(r => {
      if (r.building !== building || r.medium !== 'CO') return;
      const s = seasonOf(r.year, r.month);
      if (s == null) return;
      const hdd = hddFromTemp(r.year, r.month, city.tBase);
      if (hdd == null) return;
      pts.push({ hdd, season: s, e: r.gj });
      seasons.add(s);
    });
    if (pts.length < 5) return null;
    const t0 = Math.min.apply(null, [...seasons]);
    pts.forEach(p => { p.t = p.season - t0 + 1; });
    const fit = P._signatureFit(pts, seasons.size >= 3);
    if (!fit) return null;
    fit.nSeasons = seasons.size;
    fit.t0 = t0;
    return fit;
  };

  // Kwantyl p∈[0,100] z próby (interpolacja liniowa) — percentyl surowości zimy.
  P._quantile = function(values, p) {
    const v = values.slice().sort((a, b) => a - b);
    if (!v.length) return null;
    const pos = (v.length - 1) * p / 100;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  };

  // HDD prognozowanego miesiąca. Jawna temperatura użytkownika ma pierwszeństwo
  // (scenariusz „wiem lepiej" — bez skalowania percentylem); inaczej rok typowy
  // × korekta trendu klimatu (ekstrapolacja sum sezonowych na sezon prognozy)
  // × percentyl surowości zimy (state.m02HddP, liczony na SUMACH SEZONOWYCH —
  // sumowanie percentyli miesięcznych zawyżałoby wynik). Null poza sezonem.
  function hddForecast(y, m, city) {
    const explicit = hddFromTemp(y, m, city.tBase);
    if (explicit != null) return explicit;
    const typ = city.monthlyHDD[m];
    if (typ == null) return null;
    const sums = city.seasonSums, mean = city.meanSeasonSum;
    // prosta trendu przechodzi przez środek próby → wartość dla sezonu prognozy
    const i = seasonOf(y, m) - city.firstSeason;
    const kClimate = Math.max(0, (mean + city.trendPerSeason * (i - (sums.length - 1) / 2)) / mean);
    const ratio = P._quantile(sums, P.state.m02HddP) / mean;
    return typ * kClimate * ratio;
  }

  // Prognoza CO sygnaturą dla (budynek, miesiąc, rok); null → wołający spada
  // na trend per miesiąc (poza sezonem grzewczym, brak klimatologii/danych).
  function forecastSignature(b, monthId, year) {
    if (seasonOf(year, monthId) == null) return null;
    const city = activeCity();
    if (!city) return null;
    const fit = P.fitSignature(b);
    if (!fit) return null;
    const hdd = hddForecast(year, monthId, city);
    if (hdd == null) return null;
    const t = seasonOf(year, monthId) - fit.t0 + 1;
    const value = Math.max(0, fit.a + fit.b * hdd + fit.c * t);
    return { value, method: `sygnatura HDD (${fit.n} mies.)`, n: fit.n };
  }

  // Temperatura zakładana przez prognozę HDD [°C] — odwrócenie tej samej
  // aproksymacji miesięcznej: T = tBase − HDD/liczba_dni. Pokazuje na wykresie
  // M02 (metryka 'temp') założenie pogodowe stojące za sygnaturą (klimatologia
  // × trend klimatu × percentyl surowości zimy). Null gdy metoda CO ≠ 'hdd',
  // bez klimatologii albo poza sezonem grzewczym (maj–wrz zostaje puste
  // CELOWO: fallback trendem per miesiąc nie zakłada żadnej temperatury,
  // więc słupek sugerowałby zależność, której nie ma).
  P.tempForecast = function(y, m) {
    if (P.state.m02Method !== 'hdd') return null;
    const city = activeCity();
    if (!city) return null;
    const hdd = hddForecast(y, m, city);
    if (hdd == null) return null;
    return city.tBase - hdd / daysInMonth(y, m);
  };

  // Prognoza GJ. Dla CO — trend wprost na GJ albo sygnatura energetyczna
  // (state.m02Method === 'hdd'; miesiące letnie i przypadki bez danych
  // spadają na trend). Dla CWU przy bazie 'gj' — trend wprost na GJ;
  // przy bazie 'intensity' — GJ = prognoza(GJ/m³) × prognoza(m³): rozdziela
  // część fizyczną (wskaźnik) od zachowania (zużycie wody), co stabilizuje ekstrapolację.
  P.forecastGJ = function(b, med, monthId, year) {
    if (med === 'CO' && P.state.m02Method === 'hdd') {
      const fs = forecastSignature(b, monthId, year);
      if (fs) return fs;                       // brak warunków → fallback na trend
    }
    if (med === 'CWU' && P.state.cwuBasis === 'intensity') {
      const fi = forecastIntensity(b, med, monthId, year);
      const fq = forecastField(b, med, monthId, year, 'qty');
      if (!fi || !fq) return null;
      return { value: Math.max(0, fi.value * fq.value), method: `wskaźnik×woda (${fi.n})`, n: fi.n };
    }
    return forecastField(b, med, monthId, year, 'gj');
  };
  P.forecastQty = (b, med, monthId, year) => forecastField(b, med, monthId, year, 'qty');

  // Pojedyncza komórka miesiąca: fakt (jest rekord) albo prognoza albo brak.
  P.monthCell = function(building, medium, year, month) {
    const rec = P.getRecord(building, medium, year, month);
    const price = P.getPrice(year, month);
    if (rec) {
      return { year, month, status: 'actual', gj: rec.gj, qty: rec.qty,
               price, cost: rec.gj * price, method: 'fakt' };
    }
    const fg = P.forecastGJ(building, medium, month, year);
    if (fg) {
      const fq = P.forecastQty(building, medium, month, year);
      return { year, month, status: 'forecast', gj: fg.value, qty: fq ? fq.value : 0,
               price, cost: fg.value * price, method: fg.method };
    }
    return { year, month, status: 'none', gj: 0, qty: 0, price, cost: 0, method: '—' };
  };

  // DOBÓR ZALICZEK (Moduł 04) dla wybranego budynku/medium.
  //
  // Zakres = miesiące z Modułu 01 (P.m01Months()). Dla każdego miesiąca:
  //   koszt   = monthCell (fakt lub prognoza „ogona")
  //   driver  = powierzchnia budynku (CO) lub zużycie wody (CWU, fakt/prognoza)
  //   zaliczka miesięczna = stawka jednostkowa × driver
  //
  // Stawki rozwiązywane są tak:
  //   • USTALONE — wpisane w M03 są nienaruszalne. Bierzemy ostatnią wpisaną
  //     i traktujemy wszystko do niej włącznie jako ustalone.
  //     Dziura między wpisanymi → uzupełniana stawką WCZEŚNIEJSZĄ (carry-forward).
  //   • DOBIERANE — pusty „ogon" po ostatniej wpisanej stawce: stawka STAŁA
  //     dobierana OSOBNO dla każdego okresu rozliczeniowego (CO rok, CWU półrocze),
  //     tak by saldo Σzaliczek − Σkosztów → 0 na końcu KAŻDEGO okresu.
  //     Ograniczona do ≥ 0 — nadwyżka z okresów historycznych nie jest odrabiana.
  // Budynek pokazywany w Module 04 (własny wybór; domyślnie pierwsza kolumna).
  P.m04Building = function() {
    const cols = P.m01ColBuildings();
    let b = P.state.m04Building;
    if (!b || !cols.includes(b)) b = cols.length ? cols[0] : null;
    P.state.m04Building = b;
    return b;
  };

  P.simulate = function(building, medium) {
    const st = P.state;
    const b = building !== undefined ? building : P.m04Building();
    const med = medium || st.medium, isCO = med === 'CO';
    const out = {
      months: [], totalCost: 0, totalAdv: 0, overshoot: 0,
      nFixed: 0, nComputed: 0, firstComputed: -1,
      flatRate: null, periodLen: P.MEDIA[med].periodLen,
      building: b, medium: med,
      cum: { cost: [], adv: [], labels: [] }
    };
    if (!b) return out;

    const win = P.m01Months();                 // ZAKRES Z MODUŁU 01
    const N = win.length;
    if (N === 0) return out;

    const cells    = win.map(w => P.monthCell(b, med, w.year, w.month));
    const driverOf = c => isCO ? P.getArea(b) : c.qty;       // m² (stałe) lub m³ wody

    // 1) Stawki wpisane w M03 + indeks OSTATNIEJ wpisanej.
    const entered = win.map(w => P.getAdvance(b, med, w.year, w.month));   // null = brak
    let lastEntered = -1;
    for (let i = 0; i < N; i++) if (entered[i] != null) lastEntered = i;

    // 2) Stawki ustalone: do ostatniej wpisanej włącznie; dziury = poprzednia (carry-forward).
    const rate  = new Array(N).fill(null);
    const fixed = new Array(N).fill(false);
    let carry = null;
    for (let i = 0; i <= lastEntered; i++) {
      if (entered[i] != null) carry = entered[i];
      rate[i]  = carry;       // null tylko gdy dziura przed pierwszą wpisaną
      fixed[i] = true;
    }

    // 3) Dobór stawki dla „ogona" — OSOBNO dla każdego OKRESU ROZLICZENIOWEGO.
    //    Cel: saldo (zaliczki − koszt) = 0 na KOŃCU KAŻDEGO okresu, nie tylko na końcu
    //    całego zakresu. Każdy okres może dostać inną stałą stawkę:
    //      flat_okres × Σdriver_ogon_okresu = Σkoszt_okresu − Σzaliczki_ustalone_okresu.
    const len = P.MEDIA[med].periodLen;
    const start = isCO ? st.periodStartCO : st.periodStartCWU;
    const periodKey = w => Math.floor((P.absM(w.year, w.month) - (start - 1)) / len);

    if (lastEntered < N - 1) {                  // jest ogon do dobrania
      out.firstComputed = lastEntered + 1;
      out.flatRates = [];
      // agregaty per okres (tylko miesiące z zakresu): koszt, zaliczki ustalone, driver ogona
      const acc = new Map();   // key → { cost, advFixed, driverTail }
      for (let i = 0; i < N; i++) {
        const k = periodKey(win[i]);
        let a = acc.get(k);
        if (!a) { a = { cost: 0, advFixed: 0, driverTail: 0 }; acc.set(k, a); }
        a.cost += cells[i].cost;
        if (i <= lastEntered) a.advFixed += (rate[i] != null ? rate[i] : 0) * driverOf(cells[i]);
        else                  a.driverTail += driverOf(cells[i]);
      }
      // stawka per okres + przypisanie do miesięcy ogona
      const flatFor = new Map();
      acc.forEach((a, k) => {
        flatFor.set(k, a.driverTail > 0 ? Math.max(0, (a.cost - a.advFixed) / a.driverTail) : 0);
      });
      let lastFlat = null;
      for (let i = lastEntered + 1; i < N; i++) {
        const f = flatFor.get(periodKey(win[i]));
        rate[i] = f; fixed[i] = false;
        if (f !== lastFlat) { out.flatRates.push(f); lastFlat = f; }
      }
      out.flatRate = out.flatRates.length ? out.flatRates[0] : null;   // zgodność wstecz
    }

    // 4) Złożenie wyniku + serie narastające.
    //    Skumulowane koszt/zaliczki RESETUJĄ się na początku KAŻDEGO okresu
    //    rozliczeniowego (CO co rok, CWU co półrocze) → wykres ma kształt „ząbków":
    //    w obrębie okresu rosną, na granicy spadają do zera i liczą od nowa.
    //    out.cum.period[i] = indeks okresu (do rozdzielenia łamanych w renderze).
    //    Sumy globalne (totalCost/totalAdv/overshoot) liczone osobno.
    out.cum.period = [];
    const multiYear = win[0].year !== win[N - 1].year;
    let totCost = 0, totAdv = 0;               // sumy globalne (statystyki/nagłówek)
    let cumCost = 0, cumAdv = 0, prevK = null;
    cells.forEach((c, i) => {
      const driver   = driverOf(c);
      const advTotal = (rate[i] != null) ? rate[i] * driver : 0;
      const k = periodKey(win[i]);
      if (prevK !== null && k !== prevK) { cumCost = 0; cumAdv = 0; }   // nowy okres → reset
      prevK = k;
      cumCost += c.cost;
      cumAdv  += advTotal;
      totCost += c.cost;
      totAdv  += advTotal;
      out.months.push({ ...c, past: P.isPast(c.year, c.month),
                        rate: rate[i], driver, advTotal, fixed: fixed[i] });
      out.cum.cost.push(cumCost);
      out.cum.adv.push(cumAdv);
      out.cum.period.push(k);
      out.cum.labels.push(P.MONTHS[c.month - 1].abbr + (multiYear ? ' ' + String(c.year).slice(2) : ''));
    });

    out.totalCost = totCost;
    out.totalAdv  = totAdv;
    out.overshoot = totAdv - totCost;          // saldo globalne: nadwyżka (>0) lub niedobór (<0)
    out.nFixed    = fixed.filter(Boolean).length;
    out.nComputed = N - out.nFixed;
    return out;
  };

  // ===== MODUŁ 02 — WIELKOŚCI ZUŻYCIA (wskaźnik GJ/dzielnik, GJ, woda) =====

  // Czy budynek ma JAKIEKOLWIEK dane w danym miesiącu (CO lub CWU)?
  // „Pusty" miesiąc = brak GJ-CO, GJ-CWU i wody; cena energii NIE jest kryterium.
  function monthHasAnyData(building, year, month) {
    return !!P.getRecord(building, 'CO', year, month) || !!P.getRecord(building, 'CWU', year, month);
  }
  // Ostatni miesiąc (bezwzględny) z jakimikolwiek danymi dla budynku, albo null.
  function lastDataAbs(building) {
    let mx = null;
    P.records.forEach(r => {
      if (r.building !== building) return;
      const a = P.absM(r.year, r.month);
      if (mx == null || a > mx) mx = a;
    });
    return mx;
  }

  // Macierz WIELKOŚCI dla WSZYSTKICH budynków po widocznym zakresie miesięcy M01.
  // metric = { medium:'CO'|'CWU', field:'intensity'|'gj'|'qty'|'cost'|'price'|'temp' }:
  //   'intensity' → GJ / dzielnik (powierzchnia dla CO, woda dla CWU)
  //   'gj'        → samo zużycie GJ
  //   'qty'       → zużycie wody [m³] (sensowne dla CWU)
  //   'cost'      → koszt [zł] = GJ × cena ciepła
  //   'price'     → cena ciepła [zł/GJ] — globalna z P.prices, niezależna od budynku
  //   'temp'      → temperatura zewn. [°C] — globalna z P.temps; może być ≤ 0; prognoza
  //                 „ogona" tylko przy metodzie 'hdd' (paź–kwi, zob. P.tempForecast)
  // Dla każdej komórki: 'actual' (jest rekord), 'forecast' (pusty „ogon" po ostatnim
  // miesiącu z danymi, o ile da się policzyć trend) albo 'none' (brak / luka w środku).
  // Zwraca { months, buildings, series:[{ building, color, cells:[{year,month,status,value,gj,qty}] }], peak }.
  P.metricMatrix = function(metric) {
    const medium = metric.medium, field = metric.field, isCO = medium === 'CO';
    const buildings = P.m01ColBuildings();
    const months    = P.m01Months();
    let peak = 0;

    // wylicz wartość metryki z surowych GJ/qty + powierzchni + ceny
    const valueOf = (gj, qty, area, price) => {
      if (field === 'gj')   return gj;
      if (field === 'qty')  return qty;
      if (field === 'cost') return gj * price;       // koszt [zł] = GJ × cena
      const div = isCO ? area : qty;        // 'intensity'
      return div > 0 ? gj / div : 0;
    };

    const series = buildings.map((b, gi) => {
      const lastAbs = lastDataAbs(b);               // granica historia | prognoza (po wszystkich mediach)
      const area = P.getArea(b);
      const cells = months.map(w => {
        const price = P.getPrice(w.year, w.month);
        // Cena ciepła jest globalna (niezależna od budynku/zużycia) — pokaż dla każdego
        // miesiąca z ustaloną ceną.
        if (field === 'price') {
          if (price > 0) { if (price > peak) peak = price; return { year: w.year, month: w.month, status: 'actual', value: price, gj: 0, qty: 0 }; }
          return { year: w.year, month: w.month, status: 'none', value: 0, gj: 0, qty: 0 };
        }
        // Temperatura zewnętrzna też jest globalna; w odróżnieniu od ceny
        // 0 i wartości ujemne są poprawnymi pomiarami (brak wpisu = null).
        // W „ogonie" przy metodzie 'hdd' pokazujemy temperaturę zakładaną
        // przez sygnaturę (paź–kwi; maj–wrz i luki w historii zostają puste).
        if (field === 'temp') {
          const t = P.getTemp(w.year, w.month);
          if (t != null) { if (t > peak) peak = t; return { year: w.year, month: w.month, status: 'actual', value: t, gj: 0, qty: 0 }; }
          if (lastAbs != null && P.absM(w.year, w.month) > lastAbs) {
            const tf = P.tempForecast(w.year, w.month);
            if (tf != null) { if (tf > peak) peak = tf; return { year: w.year, month: w.month, status: 'forecast', value: tf, gj: 0, qty: 0 }; }
          }
          return { year: w.year, month: w.month, status: 'none', value: 0, gj: 0, qty: 0 };
        }
        const rec = P.getRecord(b, medium, w.year, w.month);
        if (rec) {                                   // FAKT
          const value = valueOf(rec.gj, rec.qty, area, price);
          if (value > 0) {
            if (value > peak) peak = value;
            return { year: w.year, month: w.month, status: 'actual', value, gj: rec.gj, qty: rec.qty };
          }
        }
        // pusty „ogon": miesiąc po ostatnim z danymi → próbujemy prognozy
        const abs = P.absM(w.year, w.month);
        if (lastAbs != null && abs > lastAbs && !monthHasAnyData(b, w.year, w.month)) {
          const fg = P.forecastGJ(b, medium, w.month, w.year);
          const fq = P.forecastQty(b, medium, w.month, w.year);
          const gj = fg ? fg.value : 0, qty = fq ? fq.value : 0;
          const have = field === 'qty' ? !!fq : !!fg;
          if (have) {
            const value = valueOf(gj, qty, area, price);
            if (value > 0) {
              if (value > peak) peak = value;
              return { year: w.year, month: w.month, status: 'forecast', value, gj, qty };
            }
          }
        }
        return { year: w.year, month: w.month, status: 'none', value: 0, gj: 0, qty: 0 };
      });
      return { building: b, color: P.SERIES_COLORS[gi % P.SERIES_COLORS.length], cells };
    });

    return { months, buildings, series, peak };
  };

  // Wartość metryki wg TRENDU (wybrana metoda prognozy) dla (budynek, miesiąc, rok) —
  // niezależnie od tego, czy istnieje rekord. Służy do narysowania linii prognozy
  // przechodzącej przez analogiczne miesiące. Zwraca liczbę lub null (brak próbek).
  P.metricTrendValue = function(metric, building, monthId, year) {
    if (metric.field === 'price') { const p = P.getPrice(year, monthId); return p > 0 ? p : null; }
    if (metric.field === 'temp')  { const t = P.getTemp(year, monthId); return t != null ? t : P.tempForecast(year, monthId); }
    const isCO = metric.medium === 'CO';
    const fg = P.forecastGJ(building, metric.medium, monthId, year);
    const fq = P.forecastQty(building, metric.medium, monthId, year);
    if (metric.field === 'qty') return fq ? fq.value : null;
    if (metric.field === 'gj')  return fg ? fg.value : null;
    if (metric.field === 'cost') return fg ? fg.value * P.getPrice(year, monthId) : null;
    // intensity = GJ / dzielnik (powierzchnia dla CO, prognoza wody dla CWU)
    if (!fg) return null;
    const div = isCO ? P.getArea(building) : (fq ? fq.value : 0);
    return div > 0 ? fg.value / div : null;
  };

})(window.KZ);
