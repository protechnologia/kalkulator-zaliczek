/* =========================================================
   KALKULATOR-ZALICZEK — Raport XLSX

   P.exportXLSX() buduje skoroszyt i pobiera go tą samą ścieżką co eksport
   JSON (Blob + a[download]). Dwa arkusze: „Zaliczki CO" i „Zaliczki CWU".

   Układ arkusza (jeden per medium):
     • WIERSZE  = budynki (kolejne kolumny M01) — ZAWSZE osobny wiersz per
                  budynek, także w trybie łącznym.
     • KOLUMNY  = nazwa budynku + STAWKI zaliczek (jednostkowe: CO [zł/m²],
                  CWU [zł/m³]) POGRUPOWANE w przedziały miesięcy o stałej stawce.
                  Kolejne miesiące o tej samej stawce (i statusie stała/wyliczona)
                  dla WSZYSTKICH budynków scalają się w jedną kolumnę z nagłówkiem
                  „RRRR.MM" (jeden miesiąc) lub „RRRR.MM - RRRR.MM" (zakres). Nowa
                  kolumna zaczyna się, gdy którykolwiek budynek zmienia stawkę/status
                  lub na granicy okresu rozliczeniowego (kolumna nie przekracza okresu).
                  Przy metodzie prognozy CO 'hdd' kolumny z WYLICZONĄ stawką (zależną
                  od percentyla surowości zimy) rozbijają się na DWIE — P50 i P80
                  (osobna symulacja na każdym percentylu) — z DWUWIERSZOWYM nagłówkiem:
                  górny wiersz to data (scalona poziomo nad parą P50/P80), dolny to
                  „P50"/„P80". Kolumny pojedyncze mają datę scaloną pionowo przez oba
                  wiersze. Dwuwierszowy nagłówek pojawia się tylko gdy faktycznie
                  zachodzi rozbicie — dotyczy wyłącznie arkusza CO (HDD jest metodą
                  tylko dla CO); kolumny ustalone i całe CWU zostają pojedyncze
                  z jednowierszowym nagłówkiem. Poszczególne zakresy dat rozdziela
                  pionowa cienka czarna linia (na prawej krawędzi każdego zakresu;
                  para P50/P80 to jeden zakres — linia tylko za P80).
     • OKNO     = od początku OBECNIE TRWAJĄCEGO okresu rozliczeniowego (okresu
                  zawierającego DZIŚ — realna bieżąca data) do ostatniego miesiąca
                  M01 włącznie. Koniec wspólny dla CO/CWU, początek różny (CO okres
                  12 mies., CWU 6 mies.). Początek przycięty do zakresu M01.

   Wartość komórki = miesięczna STAWKA zaliczki (rate; CO [zł/m²], CWU [zł/m³])
   z P.simulate() (część ustalona z M03 + dobrany „ogon"). DOBRANE (oszacowane)
   stawki „ogona" mają lekko zielone tło; stawki USTALONE w M03 zostają bez tła.
   Raport ŚLEDZI tryb
   rozliczenia z M04 (P.state.m04Building):
     • tryb łączny (sentinel P.MERGED) → jeden wspólny dobór na sumie budynków,
       więc TA SAMA stawka wpisywana jest w każdym wierszu;
     • tryb per budynek → każdy budynek bilansuje własny okres (osobna symulacja),
       stawki w wierszach mogą się różnić.

   JEDYNE miejsce aplikacji korzystające z biblioteki zewnętrznej:
   vendor/exceljs.min.js (ExcelJS 4.4.0, Apache-2.0) — lokalna kopia bundle'a
   UMD ładowana zwykłym <script> (wystawia global window.ExcelJS), więc działa
   offline z file:// i nie łamie zakazu CDN/fetch ani ES modules.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  const RATE = '#,##0.00';
  const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  // lekko zielone tło dla DOBRANYCH (oszacowanych) stawek „ogona"; stałe (M03) bez tła
  const FORECAST_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } };
  // jednostka stawki per medium (do nagłówka kolumny „Budynek")
  const RATE_UNIT = { CO: 'zł/m²', CWU: 'zł/m³' };

  // Indeksy miesięcy M01 wchodzących do raportu danego medium: od początku
  // OBECNIE TRWAJĄCEGO okresu rozliczeniowego (okresu zawierającego DZIŚ) do
  // ostatniego miesiąca M01 włącznie. Kotwicą jest realna bieżąca data
  // (new Date()), nie ostatni miesiąc M01 — inaczej dane planu sięgające
  // następnego okresu przesuwałyby start do przyszłości. Początek jest przycięty
  // do zakresu M01: nie przed pierwszym miesiącem i nie po ostatnim.
  // Zwraca { idx:[..], months:[{year,month}] }.
  function reportWindow(med, allMonths) {
    const now = new Date();
    const periodFirst = P.periodWindow(med, now.getFullYear(), now.getMonth() + 1, 0)[0];
    const firstAbs = P.absM(allMonths[0].year, allMonths[0].month);
    const lastAbs  = P.absM(allMonths[allMonths.length - 1].year, allMonths[allMonths.length - 1].month);
    let startAbs = P.absM(periodFirst.year, periodFirst.month);
    startAbs = Math.min(Math.max(startAbs, firstAbs), lastAbs);  // przytnij do zakresu M01
    const idx = [];
    allMonths.forEach((w, i) => { if (P.absM(w.year, w.month) >= startAbs) idx.push(i); });
    return { idx, months: idx.map(i => allMonths[i]) };
  }

  // „Sygnatura" komórki miesiąca: rozróżnia stawki przy grupowaniu kolumn.
  // null (brak) ≠ stała ≠ wyliczona, a w obrębie statusu rozróżnia wartość.
  const cellSig = c => (c == null || c.rate == null) ? '∅'
                       : (c.fixed ? 'F' : 'C') + ':' + c.rate;

  // Grupuje miesiące okna w przedziały o STAŁEJ stawce. Nowa kolumna zaczyna się
  // gdy: (a) którykolwiek budynek zmienia stawkę lub status (stała↔wyliczona) względem
  // poprzedniego miesiąca, albo (b) poprzedni miesiąc kończył okres rozliczeniowy
  // (kolumna nigdy nie przekracza granicy okresu). Dzięki temu w każdym przedziale
  // stawka KAŻDEGO budynku jest stała. cells: [budynek][j] = komórka {rate,fixed}|null.
  function groupColumns(med, months, cells) {
    const groups = [];
    for (let j = 0; j < months.length; j++) {
      const prev = months[j - 1];
      const periodBreak = prev && P.isPeriodEnd(med, prev.year, prev.month);
      const rateBreak = j > 0 && cells.some(rr => cellSig(rr[j]) !== cellSig(rr[j - 1]));
      if (j === 0 || periodBreak || rateBreak) groups.push({ start: j, end: j });
      else groups[groups.length - 1].end = j;
    }
    return groups;
  }

  // Etykieta przedziału miesięcy: pojedynczy „RRRR.MM" albo zakres „RRRR.MM - RRRR.MM".
  const ymDot = w => w.year + '.' + String(w.month).padStart(2, '0');
  function groupLabel(months, g) {
    const a = ymDot(months[g.start]);
    if (g.start === g.end) return a;
    return a + ' - ' + ymDot(months[g.end]);
  }

  // Macierz stawek per budynek, dosunięta do okna raportu: cells[b][j] = {rate,fixed}|null.
  // Tryb rozliczenia z M04: łączny (wszystkie budynki jako jedna jednostka) → jeden
  // wspólny dobór, więc TA SAMA stawka w każdym wierszu; w przeciwnym razie każdy
  // budynek bilansuje własny okres (osobna symulacja).
  function collectCells(med, buildings, win) {
    const merged = P.state.m04Building === P.MERGED && buildings.length;
    const mergedSim = merged ? P.simulate(P.MERGED, med) : null;
    return buildings.map(b => {
      const sim = mergedSim || P.simulate(b, med);
      return win.idx.map(i => {
        const mo = sim.months[i];
        return (mo && mo.rate != null) ? { rate: mo.rate, fixed: mo.fixed } : null;
      });
    });
  }

  // Czy przedział ma wyliczoną stawkę dla któregokolwiek budynku (zależną od percentyla
  // HDD → kandydat do rozbicia na P50/P80). Status w obrębie grupy jest stały per budynek.
  const groupHasComputed = (buildings, cells, g) =>
    buildings.some((b, bi) => { const c = cells[bi][g.start]; return c && !c.fixed; });

  // Arkusz jednego medium.
  function sheetMedium(wb, med, allMonths) {
    const ws = wb.addWorksheet('Zaliczki ' + med);
    const buildings = P.m01ColBuildings();
    const win = reportWindow(med, allMonths);

    // Przy metodzie CO 'hdd' wyliczony „ogon" zależy od percentyla surowości zimy —
    // rozbijamy wyliczone kolumny na P50 i P80 (osobna symulacja na każdym percentylu).
    // Dotyczy WYŁĄCZNIE CO (HDD jest metodą tylko dla CO); CWU zawsze jedna kolumna.
    const hddSplit = med === 'CO' && P.state.m02Method === 'hdd';
    let cells, cells50, cells80;
    if (hddSplit) {
      const savedP = P.state.m02HddP;
      P.state.m02HddP = 50; cells50 = collectCells(med, buildings, win);
      P.state.m02HddP = 80; cells80 = collectCells(med, buildings, win);
      P.state.m02HddP = savedP;
      cells = cells80;   // baza struktury (granice stała/wyliczona są niezależne od percentyla)
    } else {
      cells = collectCells(med, buildings, win);
    }

    // pogrupuj miesiące w przedziały o stałej stawce (kolumny raportu)
    const groups = groupColumns(med, win.months, cells);

    // rozwiń grupy na kolumny: zwykła grupa = 1 kolumna (sub=null); grupa z wyliczoną
    // stawką przy HDD = 2 kolumny (sub 'P50'/'P80', z różnych symulacji). label = sama data.
    // last = ostatnia kolumna swojej grupy (tu kładziemy pionowy separator zakresów dat)
    const cols = [];
    groups.forEach(g => {
      const label = groupLabel(win.months, g);
      if (hddSplit && groupHasComputed(buildings, cells, g)) {
        cols.push({ g, src: cells50, label, sub: 'P50', last: false });
        cols.push({ g, src: cells80, label, sub: 'P80', last: true });
      } else {
        cols.push({ g, src: cells, label, sub: null, last: true });
      }
    });
    // dwuwierszowy nagłówek tylko gdy są rozbite kolumny (data nad scalonym P50/P80)
    const twoRow = cols.some(c => c.sub);
    const headRows = twoRow ? 2 : 1;
    const colName = 'Budynek [' + RATE_UNIT[med] + ']';
    const headFmt = c => {
      c.font = { bold: true };
      c.fill = HEAD_FILL;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = { bottom: { style: 'thin' } };
    };

    if (twoRow) {
      // wiersz 1: daty (dla P80 puste — komórka scalona z P50); wiersz 2: P50/P80 lub puste
      const row1 = [colName].concat(cols.map(c => c.sub === 'P80' ? '' : c.label));
      const row2 = [''].concat(cols.map(c => c.sub || ''));
      const r1 = ws.addRow(row1);
      const r2 = ws.addRow(row2);
      [r1, r2].forEach(r => r.eachCell({ includeEmpty: true }, headFmt));
      r1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      // scal: nazwa budynku pionowo; data split-pary poziomo (nad P50+P80), pojedyncza pionowo
      ws.mergeCells(1, 1, 2, 1);
      cols.forEach((c, i) => {
        const col = i + 2;
        if (c.sub === 'P50') ws.mergeCells(1, col, 1, col + 1);   // data nad P50|P80
        else if (!c.sub)      ws.mergeCells(1, col, 2, col);       // data przez oba wiersze
      });
    } else {
      const hr = ws.addRow([colName].concat(cols.map(c => c.label)));
      hr.eachCell({ includeEmpty: true }, headFmt);
      hr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    }

    // Szerokości kolumn dopasowane do zawartości (ExcelJS nie ma auto-fit): najdłuższy
    // napis w kolumnie (nagłówek + wartości). Dla liczb długość po sformatowaniu na 2
    // miejsca. Dla kolumny rozbitej nagłówkiem jest „P50/P80" (data jest scalona poziomo
    // i przelewa się przez obie kolumny, więc nie wymusza pełnej szerokości na każdej).
    const widths = [colName.length].concat(cols.map(c => (c.sub ? c.sub.length : c.label.length)));

    // wiersze: budynek + stawka per kolumna (stała w obrębie przedziału → bierzemy z g.start;
    // wartość z właściwej symulacji src — P50/P80 dla rozbitych kolumn wyliczonych)
    buildings.forEach((b, bi) => {
      const row = [b].concat(cols.map(col => {
        const c = col.src[bi][col.g.start];
        return c ? c.rate : null;
      }));
      const r = ws.addRow(row);
      cols.forEach((col, ci) => {
        const cell = r.getCell(ci + 2);
        cell.numFmt = RATE;
        // dobrana (nie ustalona w M03) stawka → lekko zielone tło
        const c = col.src[bi][col.g.start];
        if (c && !c.fixed) cell.fill = FORECAST_FILL;
      });
      // aktualizacja maks. szerokości per kolumna
      row.forEach((v, ci) => {
        const txt = (v == null) ? '' : (typeof v === 'number' ? v.toFixed(2) : String(v));
        if (txt.length > widths[ci]) widths[ci] = txt.length;
      });
    });

    // +2 znaki paddingu; min 8 (czytelność), max 40 (nazwy budynków / zakresy)
    widths.forEach((w, ci) => {
      ws.getColumn(ci + 1).width = Math.min(40, Math.max(8, w + 2));
    });

    // Pionowy separator (cienka czarna linia) na prawej krawędzi każdego zakresu dat
    // oraz za kolumną „Budynek". Para P50/P80 to jeden zakres → linia tylko za P80,
    // nie między P50 a P80. Dla scalonych komórek nagłówka border kładziemy na komórce
    // głównej (master) — ExcelJS renderuje go na zewnętrznej krawędzi scalenia.
    const addRight = cell => {
      cell.border = Object.assign({}, cell.border, { right: { style: 'thin', color: { argb: 'FF000000' } } });
    };
    const totalRows = headRows + buildings.length;
    const sepCols = [1].concat(cols.map((c, i) => c.last ? i + 2 : null).filter(c => c));
    sepCols.forEach(cc => {
      for (let r = 1; r <= totalRows; r++) {
        const cell = ws.getCell(r, cc);
        addRight(cell);
        if (cell.master && cell.master !== cell) addRight(cell.master);
      }
    });

    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: headRows }];
  }

  // Budowa skoroszytu (bez pobierania) — wydzielona, by dało się ją wywołać
  // także pod Node (samotest) bez DOM-u.
  P.buildXLSX = function() {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Kalkulator zaliczek v' + P.VERSION;
    wb.created = new Date();
    const allMonths = P.m01Months();
    ['CO', 'CWU'].forEach(med => {
      if (allMonths.length) sheetMedium(wb, med, allMonths);
      else wb.addWorksheet('Zaliczki ' + med).addRow(['Brak danych w Module 01.']);
    });
    return wb;
  };

  P.exportXLSX = function() {
    if (typeof ExcelJS === 'undefined') {
      alert('Brak biblioteki ExcelJS — sprawdź, czy plik vendor/exceljs.min.js leży obok pliku HTML.');
      return;
    }
    return P.buildXLSX().xlsx.writeBuffer().then(buf => {
      const blob = new Blob([buf],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_zaliczki_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(e => alert('Błąd eksportu XLSX: ' + e.message));
  };

})(window.KZ);
