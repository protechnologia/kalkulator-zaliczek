/* =========================================================
   KALKULATOR-ZALICZEK — Moduł 03 (Zaliczki ustalone)

   Macierz stawek zaliczki — układ jak Moduł 01:
     • wiersze (w dół)  = miesiące  (zakres ustawiany w M01)
     • kolumny (w bok)  = budynki   (te same co w M01)
     • komórka          = stawka CO [zł/m²] + stawka CWU [zł/m³]
   Wpis jest stawką JEDNOSTKOWĄ; miesięczna zaliczka = stawka × driver
   (powierzchnia dla CO, zużycie wody dla CWU) — liczone w simulate().
   Porównanie sumy zaliczek z prognozą kosztu jest w Module 04.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const num = v => (v === '' || v == null || isNaN(v)) ? '' : v;

  P.renderM03 = function() {
    const el = document.getElementById('kz-m03-matrix');
    if (!el) return;

    const cols   = P.m01ColBuildings();   // budynki (kolumny) — wspólne z M01
    const months = P.m01Months();         // miesiące (wiersze) — wspólne z M01

    if (cols.length === 0 || months.length === 0) {
      el.innerHTML = `<div class="kz-empty">Dodaj budynki i miesiące w Module 01.</div>`;
      return;
    }

    // ---- NAGŁÓWEK: nazwa budynku (statyczna) + etykiety stawek ----
    const head = cols.map(b => `
      <th>
        <div class="bld-name"><span class="bld-static">${esc(b)}</span></div>
        <div class="kz-cell-head"><span>CO<br>zł/m²</span><span>CWU<br>zł/m³</span></div>
      </th>`).join('');

    // ---- WIERSZE: miesiąc × budynki, komórka z dwiema stawkami ----
    const body = months.map(w => {
      const lbl = `${P.MONTHS[w.month - 1].abbr} ${w.year}`;
      const cells = cols.map(b => {
        const co  = P.getAdvance(b, 'CO',  w.year, w.month);
        const cwu = P.getAdvance(b, 'CWU', w.year, w.month);
        return `<td>
          <div class="kz-cell-grid">
            <input type="number" step="0.01" min="0" data-adv-med="CO"  data-adv-b="${esc(b)}" data-adv-y="${w.year}" data-adv-m="${w.month}" value="${num(co)}"  title="Zaliczka CO [zł/m²]"  placeholder="zł/m²">
            <input type="number" step="0.01" min="0" data-adv-med="CWU" data-adv-b="${esc(b)}" data-adv-y="${w.year}" data-adv-m="${w.month}" value="${num(cwu)}" title="Zaliczka CWU [zł/m³]" placeholder="zł/m³">
          </div>
        </td>`;
      }).join('');
      return `<tr><th class="mlabel"><div class="ml-month">${lbl}</div></th>${cells}</tr>`;
    }).join('');

    el.innerHTML = `<div class="kz-matrix-wrap"><table class="kz-matrix">
      <thead><tr><th class="corner"></th>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  };

})(window.KZ);
