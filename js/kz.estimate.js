/* =========================================================
   KALKULATOR-ZALICZEK — Estymacja i symulacja

   Prognoza zużycia (Moduł 02/03/04):
   Dla każdego miesiąca pozostałego okresu prognozujemy zużycie GJ / wody
   na podstawie tego samego miesiąca kalendarzowego z poprzednich lat:
     • 0 próbek  → miesiąc pomijany (nie symulujemy)
     • 1 próbka  → trend płaski = ta wartość
     • ≥2 próbki → regresja liniowa względem ROKU, ekstrapolacja
   Koszt miesiąca = prognoza_GJ × cena_GJ(rok,mies.).

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

  // Prognoza GJ. Dla CO (oraz CWU przy bazie 'gj') — trend wprost na GJ.
  // Dla CWU przy bazie 'intensity' — GJ = prognoza(GJ/m³) × prognoza(m³): rozdziela
  // część fizyczną (wskaźnik) od zachowania (zużycie wody), co stabilizuje ekstrapolację.
  P.forecastGJ = function(b, med, monthId, year) {
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
  //   • DOBIERANE — pusty „ogon" po ostatniej wpisanej stawce: jedna STAŁA stawka
  //     trzymana do końca zakresu (= do końca okresu rozliczeniowego: CO rok,
  //     CWU półrocze), dobrana tak, by zminimalizować różnicę Σzaliczek − Σkosztów
  //     (saldo końcowe → 0).
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
  // metric = { medium:'CO'|'CWU', field:'intensity'|'gj'|'qty' }:
  //   'intensity' → GJ / dzielnik (powierzchnia dla CO, woda dla CWU)
  //   'gj'        → samo zużycie GJ
  //   'qty'       → zużycie wody [m³] (sensowne dla CWU)
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
