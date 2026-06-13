/* =========================================================
   KALKULATOR-ZALICZEK — Raport XLSX

   P.exportXLSX() buduje skoroszyt i pobiera go tą samą ścieżką co eksport
   JSON (Blob + a[download]). Dwa arkusze: „Zaliczki CO" i „Zaliczki CWU".

   Układ arkusza (jeden per medium):
     • WIERSZE  = budynki (kolejne kolumny M01) — ZAWSZE osobny wiersz per
                  budynek, także w trybie łącznym.
     • KOLUMNY  = nazwa budynku + miesięczne STAWKI zaliczek (jednostkowe:
                  CO [zł/m²], CWU [zł/m³]).
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

  // Arkusz jednego medium.
  function sheetMedium(wb, med, allMonths) {
    const ws = wb.addWorksheet('Zaliczki ' + med);
    const buildings = P.m01ColBuildings();
    const win = reportWindow(med, allMonths);

    // nagłówek: „Budynek [jednostka stawki]" + kolejne miesiące
    const header = ['Budynek [' + RATE_UNIT[med] + ']'].concat(win.months.map(w => P.ymKey(w.year, w.month)));
    const hr = ws.addRow(header);
    hr.eachCell({ includeEmpty: true }, c => {
      c.font = { bold: true };
      c.fill = HEAD_FILL;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = { bottom: { style: 'thin' } };
    });
    hr.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

    // Tryb rozliczenia z M04: łączny (wszystkie budynki jako jedna jednostka)
    // → jeden wspólny dobór, więc TA SAMA stawka w każdym wierszu; w przeciwnym
    // razie każdy budynek bilansuje własny okres (osobna symulacja).
    const merged = P.state.m04Building === P.MERGED && buildings.length;
    const mergedSim = merged ? P.simulate(P.MERGED, med) : null;

    // Szerokości kolumn dopasowane do zawartości (ExcelJS nie ma auto-fit):
    // szukamy najdłuższego napisu w kolumnie (nagłówek + wartości). Dla liczb
    // bierzemy długość po sformatowaniu na 2 miejsca (przybliżenie wyświetlanego
    // tekstu — separator tysięcy pomijamy, mieści się w paddingu).
    const widths = header.map(h => String(h).length);

    // wiersze: budynek + stawki zaliczek (jednostkowe)
    buildings.forEach(b => {
      const sim = mergedSim || P.simulate(b, med);
      const row = [b].concat(win.idx.map(i => {
        const mo = sim.months[i];
        return (mo && mo.rate != null) ? mo.rate : null;
      }));
      const r = ws.addRow(row);
      for (let c = 2; c <= header.length; c++) {
        r.getCell(c).numFmt = RATE;
        // dobrana (nie ustalona w M03) stawka → lekko zielone tło
        const mo = sim.months[win.idx[c - 2]];
        if (mo && mo.rate != null && !mo.fixed) r.getCell(c).fill = FORECAST_FILL;
      }
      // aktualizacja maks. szerokości per kolumna
      row.forEach((v, ci) => {
        const txt = (v == null) ? '' : (typeof v === 'number' ? v.toFixed(2) : String(v));
        if (txt.length > widths[ci]) widths[ci] = txt.length;
      });
    });

    // +2 znaki paddingu; min 8 (czytelność), max 40 (nazwy budynków)
    widths.forEach((w, ci) => {
      ws.getColumn(ci + 1).width = Math.min(40, Math.max(8, w + 2));
    });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
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
