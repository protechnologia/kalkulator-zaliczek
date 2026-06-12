/* =========================================================
   KALKULATOR-ZALICZEK — Model danych

   Pięć magazynów (serializowalnych do JSON przez persist.js):
     P.records  — tablica rekordów zużycia miesięcznego
                  { id, building, medium, year, month, gj, qty }
                  qty = m² (CO, stałe dla budynku) lub m³ (CWU, zmienne)
     P.prices   — ceny ciepła ECO, klucz "RRRR-MM" → zł/GJ (wspólne)
     P.temps    — średnia temperatura zewnętrzna, klucz "RRRR-MM" → °C
                  (wspólna dla budynków; pomiar, więc BEZ carry-forward)
     P.advances — stawki jednostkowe zaliczek ustalonych (M03),
                  klucz "budynek|medium|RRRR-MM" → zł/m² (CO) lub zł/m³ (CWU)
     P.areas    — powierzchnia per budynek, klucz "budynek" → m² (CO)
                  Współdzielona przez wszystkie miesiące; synchronizowana z qty
                  rekordów CO (driver intensywności / przyszłej alokacji).

   Dane mogą wpływać w dowolnej kolejności (różne budynki, różne lata).
   Trend liczymy z tego, co jest — patrz estimate.js.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  P.records  = [];
  P.prices   = {};
  P.temps    = {};
  P.advances = {};
  P.areas    = {};

  let _seq = 1;
  P.nextId = () => 'r' + (_seq++);
  P._restoreSeq = n => { if (n > _seq) _seq = n; };

  const pad2 = n => String(n).padStart(2, '0');
  P.ymKey  = (y, m) => `${y}-${pad2(m)}`;
  P.advKey = (b, med, y, m) => `${b}|${med}|${P.ymKey(y, m)}`;
  P.absM   = (y, m) => y * 12 + (m - 1);          // miesiąc bezwzględny (do porównań/okresów)
  const absToYM = a => ({ year: Math.floor(a / 12), month: (a % 12) + 1 });

  // ===== BUDYNKI / LATA =====
  P.buildings = function() {
    const s = new Set(P.records.map(r => r.building));
    return [...s].sort((a, b) => a.localeCompare(b, 'pl'));
  };
  P.years = function() {
    const s = new Set(P.records.map(r => r.year));
    return [...s].sort((a, b) => a - b);
  };

  // ===== REKORDY =====
  P.getRecord = function(building, medium, year, month) {
    return P.records.find(r => r.building === building && r.medium === medium
                              && r.year === year && r.month === month) || null;
  };
  // Wstawia lub aktualizuje rekord (klucz: budynek+medium+rok+miesiąc).
  P.upsertRecord = function(rec) {
    const ex = P.getRecord(rec.building, rec.medium, rec.year, rec.month);
    if (ex) { ex.gj = rec.gj; ex.qty = rec.qty; return ex; }
    const r = { id: P.nextId(), building: rec.building, medium: rec.medium,
                year: rec.year, month: rec.month, gj: rec.gj, qty: rec.qty };
    P.records.push(r);
    return r;
  };
  P.deleteRecord = function(id) {
    const i = P.records.findIndex(r => r.id === id);
    if (i >= 0) P.records.splice(i, 1);
  };
  P.deleteRecordKey = function(building, medium, year, month) {
    const r = P.getRecord(building, medium, year, month);
    if (r) P.deleteRecord(r.id);
  };
  P.recordsFor = function(building, medium) {
    return P.records
      .filter(r => r.building === building && r.medium === medium)
      .sort((a, b) => P.absM(a.year, a.month) - P.absM(b.year, b.month));
  };
  // Próbki danego miesiąca kalendarzowego we wszystkich latach (do trendu)
  P.monthSamples = function(building, medium, monthId) {
    return P.records
      .filter(r => r.building === building && r.medium === medium && r.month === monthId)
      .map(r => ({ year: r.year, gj: r.gj, qty: r.qty }))
      .sort((a, b) => a.year - b.year);
  };

  // ===== CENY CIEPŁA =====
  P.setPrice = function(year, month, val) {
    const k = P.ymKey(year, month);
    if (val === null || val === '' || isNaN(val)) delete P.prices[k];
    else P.prices[k] = +val;
  };
  // Cena dla (rok,mies.) z regułą carry-forward: jeśli brak jawnego wpisu,
  // dziurę wypełnia najbliższa dostępna wartość WCZEŚNIEJSZA. Gdy nic wcześniej
  // nie ma — 0. (Jawny wpis sprawdza P.hasExplicitPrice.)
  P.getPrice = function(year, month) {
    const v = P.prices[P.ymKey(year, month)];
    if (v != null) return v;
    const target = P.absM(year, month);
    let best = null, bestAbs = -Infinity;
    for (const key in P.prices) {
      const [yy, mm] = key.split('-').map(Number);
      const a = P.absM(yy, mm);
      if (a <= target && a > bestAbs) { bestAbs = a; best = P.prices[key]; }
    }
    return best != null ? best : 0;
  };
  P.hasExplicitPrice = function(year, month) { return P.prices[P.ymKey(year, month)] != null; };

  // ===== TEMPERATURA ZEWNĘTRZNA =====
  // Średnia miesięczna [°C], wspólna dla budynków. Pomiar — brak wpisu = null
  // (bez carry-forward jak przy cenie). Wartości ujemne i 0 są poprawne.
  P.setTemp = function(year, month, val) {
    const k = P.ymKey(year, month);
    if (val === null || val === '' || isNaN(val)) delete P.temps[k];
    else P.temps[k] = +val;
  };
  P.getTemp = function(year, month) {
    const v = P.temps[P.ymKey(year, month)];
    return v != null ? v : null;
  };
  // Najbliższa znana cena (wg odległości miesięcy) — do kopiowania przy rozszerzaniu zakresu.
  P.nearestPrice = function(year, month) {
    const target = P.absM(year, month);
    let best = null, bestDist = Infinity;
    for (const key in P.prices) {
      const [yy, mm] = key.split('-').map(Number);
      const d = Math.abs(P.absM(yy, mm) - target);
      if (d < bestDist) { bestDist = d; best = P.prices[key]; }
    }
    return best;
  };

  // ===== ZALICZKI =====
  P.setAdvance = function(building, medium, year, month, val) {
    const k = P.advKey(building, medium, year, month);
    if (val === null || val === '' || isNaN(val)) delete P.advances[k];
    else P.advances[k] = +val;
  };
  P.getAdvance = function(building, medium, year, month) {
    const v = P.advances[P.advKey(building, medium, year, month)];
    return v != null ? v : null;
  };

  // ===== OKRESY ROZLICZENIOWE =====
  // Okno okresu zawierające (year,month); offset=+1 → następny pełny okres.
  P.periodWindow = function(medium, year, month, offset) {
    offset = offset || 0;
    const len = P.MEDIA[medium].periodLen;
    const start = medium === 'CO' ? P.state.periodStartCO : P.state.periodStartCWU;
    const abs = P.absM(year, month);
    const startOff = start - 1;
    const k = Math.floor((abs - startOff) / len);
    const base = startOff + (k + offset) * len;
    const out = [];
    for (let i = 0; i < len; i++) {
      const a = base + i;
      out.push({ year: Math.floor(a / 12), month: (a % 12) + 1 });
    }
    return out;
  };

  // Czy (year,month) to OSTATNI miesiąc swojego okresu rozliczeniowego danego medium?
  // (granica okresu — po nim zaczyna się nowy: CO co 12 mies., CWU co 6 mies.)
  P.isPeriodEnd = function(medium, year, month) {
    const len = P.MEDIA[medium].periodLen;
    const start = medium === 'CO' ? P.state.periodStartCO : P.state.periodStartCWU;
    const off = ((P.absM(year, month) - (start - 1)) % len + len) % len;
    return off === len - 1;
  };

  // Miesiące objęte bieżącym planowaniem (zależnie od horyzontu w state).
  P.planMonths = function() {
    const st = P.state;
    const off = st.horizon === 'next' ? 1 : 0;
    return P.periodWindow(st.medium, st.asOfYear, st.asOfMonth, off);
  };

  // Czy (year,month) już minął względem kursora "teraz" (asOf)?
  P.isPast = function(year, month) {
    return P.absM(year, month) < P.absM(P.state.asOfYear, P.state.asOfMonth);
  };

  // ===== POWIERZCHNIA (per budynek) =====
  // Jedna wartość m² na budynek; synchronizowana z qty rekordów CO tego budynku.
  // Jednostka łączna (P.MERGED) → suma powierzchni wszystkich kolumn M01.
  P.getArea = function(building) {
    if (building === P.MERGED)
      return P.m01ColBuildings().reduce((s, b) => s + (P.areas[b] != null ? P.areas[b] : 0), 0);
    return P.areas[building] != null ? P.areas[building] : 0;
  };
  P.setArea = function(building, val) {
    const v = (val === '' || val == null || isNaN(val)) ? 0 : +val;
    P.areas[building] = v;
    P.records.forEach(r => { if (r.building === building && r.medium === 'CO') r.qty = v; });
  };

  // ===== MACIERZ MODUŁU 01 (kolumny = budynki, wiersze = miesiące) =====
  // Leniwa inicjalizacja jawnego układu z istniejących danych (lub kursora "teraz").
  P.m01EnsureLayout = function() {
    const st = P.state;
    if (!st.m01Cols) st.m01Cols = P.buildings();          // seed z rekordów (posortowane)
    // uzupełnij brakujące powierzchnie z rekordów CO
    st.m01Cols.forEach(b => {
      if (P.areas[b] == null) {
        const co = P.records.find(r => r.building === b && r.medium === 'CO' && r.qty > 0);
        P.areas[b] = co ? co.qty : 0;
      }
    });
    if (!st.m01From || !st.m01To) {
      const ms = P.records.map(r => P.absM(r.year, r.month));
      if (ms.length) { st.m01From = absToYM(Math.min(...ms)); st.m01To = absToYM(Math.max(...ms)); }
      else { st.m01From = { year: st.asOfYear, month: st.asOfMonth };
             st.m01To   = { year: st.asOfYear, month: st.asOfMonth }; }
    }
  };
  P.m01ColBuildings = function() { P.m01EnsureLayout(); return P.state.m01Cols; };
  P.m01Months = function() {
    P.m01EnsureLayout();
    const lo = P.absM(P.state.m01From.year, P.state.m01From.month);
    const hi = P.absM(P.state.m01To.year,   P.state.m01To.month);
    const out = [];
    for (let a = lo; a <= hi; a++) out.push(absToYM(a));
    return out;
  };
  P.m01AddMonth = function(dir) {
    P.m01EnsureLayout();
    let nm;
    if (dir === 'earlier') { P.state.m01From = absToYM(P.absM(P.state.m01From.year, P.state.m01From.month) - 1); nm = P.state.m01From; }
    else                   { P.state.m01To   = absToYM(P.absM(P.state.m01To.year,   P.state.m01To.month)   + 1); nm = P.state.m01To; }
    // skopiuj najbliższą znaną cenę do nowego miesiąca (brak dziedziczenia w locie)
    if (!P.hasExplicitPrice(nm.year, nm.month)) {
      const np = P.nearestPrice(nm.year, nm.month);
      if (np != null) P.prices[P.ymKey(nm.year, nm.month)] = np;
    }
  };
  // Usunięcie skrajnego miesiąca (pierwszego lub ostatniego) wraz z jego danymi.
  // Nie pozwala zwinąć zakresu poniżej jednego wiersza.
  P.m01RemoveMonth = function(which) {
    P.m01EnsureLayout();
    const lo = P.absM(P.state.m01From.year, P.state.m01From.month);
    const hi = P.absM(P.state.m01To.year,   P.state.m01To.month);
    if (lo >= hi) return false;                 // został ostatni wiersz — nie usuwamy
    const rm = which === 'first' ? P.state.m01From : P.state.m01To;
    const ym = P.ymKey(rm.year, rm.month);
    // wyczyść dane usuwanego miesiąca
    P.records = P.records.filter(r => !(r.year === rm.year && r.month === rm.month));
    delete P.prices[ym];
    delete P.temps[ym];
    Object.keys(P.advances).forEach(k => { if (k.endsWith('|' + ym)) delete P.advances[k]; });
    // zwiń zakres
    if (which === 'first') P.state.m01From = absToYM(lo + 1);
    else                   P.state.m01To   = absToYM(hi - 1);
    return true;
  };
  P.m01AddBuilding = function(name, side) {
    name = (name || '').trim();
    if (!name || name === P.MERGED) return false;          // sentinel jednostki łącznej zarezerwowany
    P.m01EnsureLayout();
    if (P.state.m01Cols.includes(name)) return false;
    if (side === 'left') P.state.m01Cols.unshift(name); else P.state.m01Cols.push(name);
    if (P.areas[name] == null) P.areas[name] = 0;
    return true;
  };
  // Pierwsza wolna nazwa "Budynek N" (nazwę można potem zmienić w nagłówku kolumny).
  P.m01NextBuildingName = function() {
    P.m01EnsureLayout();
    let i = P.state.m01Cols.length + 1, name;
    do { name = 'Budynek ' + i; i++; } while (P.state.m01Cols.includes(name));
    return name;
  };
  // Zmiana nazwy budynku — przepina kolumnę, rekordy, powierzchnię i klucze zaliczek.
  P.m01RenameBuilding = function(oldName, newName) {
    oldName = (oldName || '').trim();
    newName = (newName || '').trim();
    if (!newName || newName === oldName || newName === P.MERGED) return false;
    P.m01EnsureLayout();
    if (P.state.m01Cols.includes(newName)) return false;   // kolizja nazw
    P.state.m01Cols = P.state.m01Cols.map(b => b === oldName ? newName : b);
    P.records.forEach(r => { if (r.building === oldName) r.building = newName; });
    if (P.areas[oldName] != null) { P.areas[newName] = P.areas[oldName]; delete P.areas[oldName]; }
    Object.keys(P.advances).forEach(k => {
      const [b, med, ym] = k.split('|');
      if (b === oldName) { P.advances[`${newName}|${med}|${ym}`] = P.advances[k]; delete P.advances[k]; }
    });
    if (P.state.building === oldName) P.state.building = newName;
    return true;
  };
  P.m01RemoveBuilding = function(name) {
    P.m01EnsureLayout();
    P.state.m01Cols = P.state.m01Cols.filter(b => b !== name);
    P.records = P.records.filter(r => r.building !== name);
    delete P.areas[name];
  };

  // Zapis pojedynczych pól komórki. Pusty wpis usuwa odpowiedni rekord
  // (CWU znika dopiero gdy i GJ, i woda są puste — driver kosztu to GJ).
  P.setCellCO = function(building, year, month, gj) {
    if (gj === '' || gj == null || isNaN(gj)) { P.deleteRecordKey(building, 'CO', year, month); return; }
    P.upsertRecord({ building, medium: 'CO', year, month, gj: +gj, qty: P.getArea(building) });
  };
  P.setCellCWUgj = function(building, year, month, gj) {
    const rec = P.getRecord(building, 'CWU', year, month);
    const water = rec ? rec.qty : 0;
    const g = (gj === '' || gj == null || isNaN(gj)) ? null : +gj;
    if (g == null && !(water > 0)) { P.deleteRecordKey(building, 'CWU', year, month); return; }
    P.upsertRecord({ building, medium: 'CWU', year, month, gj: g || 0, qty: water });
  };
  P.setCellWater = function(building, year, month, water) {
    const rec = P.getRecord(building, 'CWU', year, month);
    const gj = rec ? rec.gj : 0;
    const w = (water === '' || water == null || isNaN(water)) ? null : +water;
    if (w == null && !(gj > 0)) { P.deleteRecordKey(building, 'CWU', year, month); return; }
    P.upsertRecord({ building, medium: 'CWU', year, month, gj: gj, qty: w || 0 });
  };

})(window.KZ);
