/* =========================================================
   KALKULATOR-ZALICZEK — Moduł 01 (Dane wejściowe)

   Macierz wprowadzania danych:
     • wiersze (w dół)  = kolejne miesiące  (przyciski: miesiąc wcześniej / później)
     • kolumny (w bok)  = kolejne budynki   (przyciski: budynek z lewej / prawej)
     • nagłówek kolumny = nazwa budynku + powierzchnia [m²] (jedna na budynek)
     • komórka          = GJ na CO, GJ na CWU, m³ wody (per budynek/miesiąc)
     • pierwsza kolumna = etykieta miesiąca + cena ciepła [zł/GJ] i temperatura
                          zewnętrzna [°C] (jedna wartość na miesiąc, wspólna
                          dla wszystkich budynków)
   Przy nadmiarze kolumn/wierszy kontener przewija się (sticky nagłówek i 1. kolumna).
   Medium-agnostyczna: pokazuje wszystkie media naraz.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  // bezpieczne wstawienie wartości do atrybutu value (nazwy budynków bywają z cudzysłowem)
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const num = v => (v === '' || v == null || isNaN(v)) ? '' : v;

  P.renderM01 = function() {
    const el = document.getElementById('kz-m01-matrix');
    if (!el) return;

    const cols   = P.m01ColBuildings();   // budynki (kolumny)
    const months = P.m01Months();         // miesiące (wiersze)

    if (cols.length === 0) {
      el.innerHTML = `<div class="kz-empty">Brak budynków.
        <button class="addbtn inline" data-add-bld="right" title="Dodaj pierwszy budynek">+ Dodaj budynek</button></div>`;
      return;
    }

    // ---- NAGŁÓWEK: nazwa budynku + powierzchnia ----
    const head = cols.map(b => `
      <th>
        <div class="bld-name">
          <input class="bld-rename" type="text" data-rename-b="${esc(b)}" value="${esc(b)}" title="Kliknij, aby zmienić nazwę budynku">
          <button class="rm" data-rm-b="${esc(b)}" title="Usuń budynek i jego dane">✕</button>
        </div>
        <div class="bld-area">
          <label>Pow.</label>
          <input class="kz-input right" type="number" step="1" min="0"
                 data-area-b="${esc(b)}" value="${P.getArea(b) || ''}" placeholder="m²">
          <span class="u">m²</span>
        </div>
        <div class="kz-cell-head"><span>CO</span><span>CWU</span><span>woda</span></div>
      </th>`).join('');

    // ---- WIERSZE: miesiąc × budynki, komórka z trzema polami ----
    const body = months.map((w, i) => {
      const lbl = `${P.MONTHS[w.month - 1].abbr} ${w.year}`;
      // krzyżyk usuwa skrajny miesiąc; tylko w 1. i ostatnim wierszu, gdy jest >1 miesiąc
      let rmBtn = '';
      if (months.length > 1 && (i === 0 || i === months.length - 1)) {
        const which = i === 0 ? 'first' : 'last';
        rmBtn = `<button class="rm" data-rm-month="${which}" title="Usuń ten miesiąc i jego dane">✕</button>`;
      }
      const cells = cols.map(b => {
        const co  = P.getRecord(b, 'CO',  w.year, w.month);
        const cwu = P.getRecord(b, 'CWU', w.year, w.month);
        const gjCO  = co  ? num(co.gj)   : '';
        const gjCWU = cwu ? num(cwu.gj)  : '';
        const water = cwu ? num(cwu.qty) : '';
        return `<td>
          <div class="kz-cell-grid">
            <input type="number" step="1" min="0" data-cell="co"    data-b="${esc(b)}" data-y="${w.year}" data-m="${w.month}" value="${gjCO}"  title="GJ na CO"  placeholder="GJ">
            <input type="number" step="1" min="0" data-cell="cwu"   data-b="${esc(b)}" data-y="${w.year}" data-m="${w.month}" value="${gjCWU}" title="GJ na CWU" placeholder="GJ">
            <input type="number" step="1" min="0" data-cell="water" data-b="${esc(b)}" data-y="${w.year}" data-m="${w.month}" value="${water}" title="m³ wody"   placeholder="m³">
          </div>
        </td>`;
      }).join('');
      const explicitPrice = P.hasExplicitPrice(w.year, w.month);
      const price = explicitPrice ? num(P.prices[P.ymKey(w.year, w.month)]) : '';
      // dziura: placeholder pokazuje cenę odziedziczoną (carry-forward) zamiast „zł/GJ"
      const inherited = !explicitPrice ? P.getPrice(w.year, w.month) : 0;
      const pricePh = inherited > 0 ? `${num(inherited)} zł/GJ` : 'zł/GJ';
      // temperatura: pomiar bez dziedziczenia — brak wpisu = puste pole (0 i ujemne poprawne)
      const t = P.getTemp(w.year, w.month);
      const temp = t != null ? t : '';
      return `<tr><th class="mlabel">
        <div class="ml-month">${lbl}</div>
        <div class="ml-price"><input type="number" step="0.01" min="0" data-price-y="${w.year}" data-price-m="${w.month}" value="${price}" title="Cena ciepła [zł/GJ]" placeholder="${pricePh}"></div>
        <div class="ml-temp"><input type="number" step="0.1" data-temp-y="${w.year}" data-temp-m="${w.month}" value="${temp}" title="Średnia temperatura zewnętrzna [°C]" placeholder="°C"></div>
        ${rmBtn}
      </th><td class="addcol"></td>${cells}<td class="addcol"></td></tr>`;
    }).join('');

    // ---- plusiki rozszerzające zakres (skrajne kolumny / wiersze) ----
    const totalCols = cols.length + 3;   // mlabel + addLeft + budynki + addRight
    const addLeftTh  = `<th class="addcol"><button class="addbtn" data-add-bld="left"  title="Dodaj budynek z lewej">+</button></th>`;
    const addRightTh = `<th class="addcol"><button class="addbtn" data-add-bld="right" title="Dodaj budynek z prawej">+</button></th>`;
    const monthAddRow = (dir, title) =>
      `<tr class="addrow"><td colspan="${totalCols}"><button class="addbtn wide" data-add-month="${dir}" title="${title}">+</button></td></tr>`;

    el.innerHTML = `<div class="kz-matrix-wrap"><table class="kz-matrix">
      <thead><tr><th class="corner"></th>${addLeftTh}${head}${addRightTh}</tr></thead>
      <tbody>
        ${monthAddRow('earlier', 'Dodaj miesiąc wcześniej')}
        ${body}
        ${monthAddRow('later', 'Dodaj miesiąc później')}
      </tbody>
    </table></div>`;
  };

})(window.KZ);
