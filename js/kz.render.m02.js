/* =========================================================
   KALKULATOR-ZALICZEK — Moduł 02 (Symulacja zużycia)

   Wskaźnik zużycia dla WYBRANEGO budynku (select w kontrolkach):
     • zakładka CO  → GJ/m²
     • zakładka CWU → GJ/m³
   Wykres kolumnowy: oś X = miesiące (zakres M01), jeden słupek na miesiąc.
   Miesiące prognozowane (pusty „ogon" po ostatnim miesiącu z danymi)
   rysowane są jaśniej i z przerywanym obrysem.

   Metoda prognozy: trend po analogicznych miesiącach (zob. estimate.js).
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const COLOR = '#f59e0b';   // jeden kolor serii — naraz widać tylko jeden budynek (akcent modułu)
  const TREND = '#b45309';   // linia prognozy (ciemniejszy amber) — widoczna na hover

  // Ustal aktywny budynek M02 (własny wybór); domyślnie pierwsza kolumna.
  function resolveBuilding() {
    const cols = P.m01ColBuildings();
    let b = P.state.m02Building;
    if (!b || !cols.includes(b)) b = cols.length ? cols[0] : null;
    P.state.m02Building = b;
    return b;
  }

  function fillBuildingSelect() {
    const sel = document.getElementById('kz-m02-building');
    if (!sel) return;
    const cols = P.m01ColBuildings();
    const cur = P.state.m02Building;
    sel.innerHTML = cols.length
      ? cols.map(b => `<option value="${esc(b)}" ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join('')
      : `<option value="">— brak —</option>`;
  }

  P.renderM02 = function() {
    const metric = P.m02Metric(P.state.m02Metric);
    const b = resolveBuilding();

    // select metryki + select budynku + kontekst
    const sel = document.getElementById('kz-m02-metric');
    if (sel && sel.value !== metric.id) sel.value = metric.id;
    fillBuildingSelect();

    // Baza prognozy to globalne ustawienie CWU (wpływa na koszt i dobór zaliczek
    // w M04, niezależnie od tego, co pokazuje wykres M02) — zawsze aktywne.
    // Dla CO i tak nic nie zmienia (driver = stała powierzchnia, trend GJ/m²×m² ≡ trend GJ).
    const basis = document.getElementById('kz-m02-basis');
    if (basis) basis.value = P.state.cwuBasis;

    const all = P.metricMatrix(metric);
    const series = all.series.find(s => s.building === b) || null;
    drawBars(all.months, series, metric);

    const ctx = document.getElementById('kz-m02-ctx');
    if (ctx) ctx.textContent = b ? `— ${b} · ${metric.label} [${metric.unit}]` : '— brak budynku';
  };

  function drawBars(months, series, metric) {
    const svg = document.getElementById('kz-m02-chart');
    if (!svg) return;
    const N = months.length;
    const peak = series ? series.cells.reduce((m, c) => Math.max(m, c.value), 0) : 0;

    if (!series || N === 0 || peak <= 0) {
      svg.innerHTML = `<text x="50" y="40">brak danych — uzupełnij zużycie w Module 01</text>`;
      return;
    }

    // wskaźniki intensywności (GJ/m², GJ/m³) są małe → 3 miejsca po przecinku; reszta 2
    const fmtV = metric.field === 'intensity' ? P.fmt.pl3 : P.fmt.pl2;

    const yMax = P._niceMax(peak, 1.12);
    const fr = P._frame(yMax, 5, { padL: 56, fmtY: fmtV, H: 270, padB: 40 });
    const slot = fr.cw / N;
    const gpad = Math.min(slot * 0.18, 10);
    const bw   = slot - 2 * gpad;
    const y0   = fr.y(0);
    const axisY = fr.padT + fr.ch;

    // pionowa linia „prognoza →" + lekkie tło na prawo (miesiące prognozowane „ogona")
    const fi = series.cells.findIndex(c => c.status === 'forecast');
    let shade = '', fmark = '';
    if (fi >= 0) {
      const mx = fr.padL + fi * slot;
      const w = fr.padL + fr.cw - mx;
      shade = `<rect x="${mx.toFixed(2)}" y="${fr.padT}" width="${w.toFixed(2)}" height="${fr.ch.toFixed(2)}" fill="var(--kz-text-3)" opacity="0.06"/>`;
      fmark = `<line x1="${mx.toFixed(2)}" y1="${fr.padT}" x2="${mx.toFixed(2)}" y2="${(fr.padT + fr.ch).toFixed(2)}" stroke="var(--kz-text-2)" stroke-width="1" stroke-dasharray="3,3"/>` +
              `<text x="${(mx + 4).toFixed(2)}" y="${(fr.padT + 11).toFixed(2)}" font-size="8.5" fill="var(--kz-text-2)">prognoza →</text>`;
    }

    let bars = '', mLabels = '', yLabels2 = '';

    // słupki + etykieta miesiąca pod KAŻDĄ kolumną; wartość nad słupkiem na hover
    months.forEach((w, i) => {
      const gx = fr.padL + i * slot;
      const cx = gx + slot / 2;
      mLabels += `<text x="${cx.toFixed(2)}" y="${(axisY + 12).toFixed(2)}" text-anchor="middle" font-size="8">${w.month}</text>`;

      const c = series.cells[i];
      if (c.status === 'none' || c.value <= 0) return;
      const bx = gx + gpad;
      const by = fr.y(c.value);
      const bh = Math.max(0.5, y0 - by);
      const fcast = c.status === 'forecast';
      const vy = Math.max(by - 5, fr.padT + 9);
      const title = `${P.MONTHS[w.month - 1].abbr} ${w.year} · ${fmtV(c.value)} ${metric.unit}${fcast ? ' (prognoza)' : ''}`;
      bars +=
        `<g class="kz-bar" data-month="${w.month}">` +
          `<rect x="${bx.toFixed(2)}" y="${by.toFixed(2)}" width="${Math.max(0.5, bw).toFixed(2)}" height="${bh.toFixed(2)}" ` +
            `fill="${COLOR}" opacity="${fcast ? 0.34 : 0.92}" ` +
            (fcast ? `stroke="${COLOR}" stroke-width="1" stroke-dasharray="2,1.5" ` : '') +
            `><title>${esc(title)}</title></rect>` +
          `<text class="kz-bar-val" data-month="${w.month}" x="${cx.toFixed(2)}" y="${vy.toFixed(2)}" text-anchor="middle" font-size="9" ` +
            `font-weight="600" fill="var(--kz-text-0)" stroke="var(--kz-bg-0)" stroke-width="3" paint-order="stroke">` +
            `${fmtV(c.value)}</text>` +
        `</g>`;
    });

    // linie prognozy per miesiąc kalendarzowy (trend po analogicznych miesiącach);
    // domyślnie ukryte, pokazywane po najechaniu na słupek tego miesiąca (zob. app.js)
    let trends = '';
    [...new Set(months.map(w => w.month))].forEach(M => {
      const pts = [];
      months.forEach((w, i) => {
        if (w.month !== M) return;
        const v = P.metricTrendValue(metric, series.building, M, w.year);
        if (v == null || v <= 0) return;
        pts.push({ x: fr.padL + i * slot + slot / 2, y: fr.y(v) });
      });
      if (pts.length < 2) return;
      const d = pts.map((p, k) => `${k ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
      const dots = pts.map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2.6" fill="${TREND}"/>`).join('');
      trends += `<g class="kz-trend" data-month="${M}" style="display:none">` +
        `<path d="${d}" fill="none" stroke="${TREND}" stroke-width="2" stroke-dasharray="4,3"/>${dots}</g>`;
    });

    // rok — jedna etykieta niżej, grupująca ciąg miesięcy tego samego roku
    let s = 0;
    while (s < N) {
      let e = s;
      while (e + 1 < N && months[e + 1].year === months[s].year) e++;
      const xL = fr.padL + s * slot + 3;
      const xR = fr.padL + (e + 1) * slot - 3;
      const cx = (xL + xR) / 2;
      yLabels2 +=
        `<line x1="${xL.toFixed(2)}" y1="${(axisY + 19).toFixed(2)}" x2="${xR.toFixed(2)}" y2="${(axisY + 19).toFixed(2)}" stroke="var(--kz-border)" stroke-width="1"/>` +
        `<text x="${cx.toFixed(2)}" y="${(axisY + 31).toFixed(2)}" text-anchor="middle" font-size="9.5" fill="var(--kz-text-1)">${months[s].year}</text>`;
      s = e + 1;
    }

    svg.innerHTML = `${shade}${fr.grid}${fr.axes}${fmark}${bars}${trends}${fr.yLabels}${mLabels}${yLabels2}` +
      `<text x="${fr.padL - 46}" y="${fr.padT - 10}" font-size="9.5" letter-spacing="1.2">[${metric.unit}]</text>`;
  }

})(window.KZ);
