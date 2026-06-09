/* =========================================================
   KALKULATOR-ZALICZEK — Moduł 04 (Dobór zaliczek)

   Sześć widoków (przełącznik „Na wykresie", state.m04View) — każdy dla JEDNEGO medium:
     • 'adv_co'  / 'adv_cwu'  — ZEBRANE zaliczki: wysokość MIESIĘCZNYCH kwot [zł];
                                część ustalona linią ciągłą, dobrany „ogon" przerywaną.
     • 'rate_co' / 'rate_cwu' — STAWKI zaliczek: jednostkowe stawki CO [zł/m²] / CWU [zł/m³];
                                ten sam podział ustalone/dobrane co w 'adv'.
     • 'co'      / 'cwu'      — skumulowany koszt (fakt + prognoza) vs skumulowane zaliczki.

   Linie kańciaste (łamane) + małe czarne kropki w punktach danych
   (po najechaniu pokazują wartość). Oś X jak w Module 02.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const COST = '#f59e0b';   // koszt (amber)
  const ADV  = '#a78bfa';   // zaliczki skumulowane (fiolet)
  const COL_CO  = '#2dd4bf'; // seria CO w widoku „wysokość zaliczek" (turkus)
  const COL_CWU = '#a78bfa'; // seria CWU (fiolet)

  function fillBuildingSelect() {
    const sel = document.getElementById('kz-m04-building');
    if (!sel) return;
    const cols = P.m01ColBuildings();
    const cur = P.state.m04Building;
    sel.innerHTML = cols.length
      ? cols.map(b => `<option value="${esc(b)}" ${b === cur ? 'selected' : ''}>${esc(b)}</option>`).join('')
      : `<option value="">— brak —</option>`;
  }

  P.renderM04 = function(simCO, simCWU) {
    const b = P.m04Building();
    simCO  = simCO  || P.simulate(b, 'CO');
    simCWU = simCWU || P.simulate(b, 'CWU');
    fillBuildingSelect();

    const view = P.state.m04View || 'co';
    const viewSel = document.getElementById('kz-m04-view');
    if (viewSel && viewSel.value !== view) viewSel.value = view;

    const sim = (view === 'cwu' || view === 'adv_cwu' || view === 'rate_cwu') ? simCWU : simCO;
    if (view === 'adv_co' || view === 'adv_cwu')        drawAdv(sim);
    else if (view === 'rate_co' || view === 'rate_cwu') drawRate(sim);
    else                                                drawCum(sim);

    updateMeta(view, simCO, simCWU, b);
  };

  // ===== META: tytuł, kontekst, legenda, statystyki =====
  function updateMeta(view, simCO, simCWU, b) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const signed = v => (v >= 0 ? '+' : '') + P.fmt.pl0(v);
    const title = document.getElementById('kz-m04-title');
    const legend = document.getElementById('kz-m04-legend');
    const ctx = document.getElementById('kz-m04-ctx');

    // każdy widok dotyczy JEDNEGO medium; rozpoznajemy rodzaj i medium z wartości selecta
    const kind = (view === 'adv_co' || view === 'adv_cwu') ? 'adv'
               : (view === 'rate_co' || view === 'rate_cwu') ? 'rate'
               : 'cum';
    const sim = (view === 'cwu' || view === 'adv_cwu' || view === 'rate_cwu') ? simCWU : simCO;
    const mediaLbl = P.MEDIA[sim.medium].label;
    const unit = sim.medium === 'CO' ? 'zł/m²' : 'zł/m³';
    const seriesCol = sim.medium === 'CO' ? COL_CO : COL_CWU;
    let stat = sim, ctxTxt = b ? `— ${b} · ${P.MEDIA[sim.medium].full}` : '— brak budynku';

    // przy widokach zależnych od stawek dopisz dobrane stawki do kontekstu
    if (b && (kind === 'rate' || kind === 'cum')) {
      const rates = sim.flatRates && sim.flatRates.length ? sim.flatRates : (sim.flatRate != null ? [sim.flatRate] : []);
      if (rates.length) {
        const lbl = rates.length > 1 ? 'dobrane stawki' : 'dobrana stawka';
        ctxTxt += ` · ${lbl} ${rates.map(r => P.fmt.pl2(r)).join(' / ')} ${unit}`;
      }
    }

    if (kind === 'adv') {
      if (title) title.textContent = `Zebrane zaliczki — ${mediaLbl}`;
      if (legend) legend.innerHTML =
        `<span><i style="background:${seriesCol}"></i> zaliczki ${mediaLbl} (ciągła = ustalone, przerywana = dobrane)</span>`;
    } else if (kind === 'rate') {
      if (title) title.textContent = `Stawki zaliczek — ${mediaLbl} [${unit}]`;
      if (legend) legend.innerHTML =
        `<span><i style="background:${seriesCol}"></i> stawka ${mediaLbl} (ciągła = ustalone, przerywana = dobrane)</span>`;
    } else {
      if (title) title.textContent = `Narastająco: koszt vs zaliczki — ${mediaLbl}`;
      if (legend) legend.innerHTML =
        `<span><i style="background:${COST}"></i> skumulowany koszt (fakt + prognoza)</span>` +
        `<span><i style="background:${ADV}"></i> skumulowane zaliczki (ustalone + dobrane)</span>`;
    }
    if (ctx) ctx.textContent = ctxTxt;

    set('kz-m04-cost', P.fmt.pl0(stat.totalCost));
    set('kz-m04-adv', P.fmt.pl0(stat.totalAdv));
    set('kz-m04-overshoot', signed(stat.overshoot));
  }

  // ===== WSPÓLNE HELPERY RYSOWANIA =====
  const poly = pts => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

  // Etykiety osi X jak w Module 02: miesiąc pod każdą kolumną + linia/rok pod spodem.
  function xAxis(fr, months, slot, x) {
    const N = months.length, axisY = fr.padT + fr.ch;
    let out = '';
    months.forEach((w, i) => {
      out += `<text x="${x(i).toFixed(2)}" y="${(axisY + 12).toFixed(2)}" text-anchor="middle" font-size="8">${w.month}</text>`;
    });
    let s = 0;
    while (s < N) {
      let e = s;
      while (e + 1 < N && months[e + 1].year === months[s].year) e++;
      const xL = fr.padL + s * slot + 3, xR = fr.padL + (e + 1) * slot - 3, cx = (xL + xR) / 2;
      out += `<line x1="${xL.toFixed(2)}" y1="${(axisY + 19).toFixed(2)}" x2="${xR.toFixed(2)}" y2="${(axisY + 19).toFixed(2)}" stroke="var(--kz-border)" stroke-width="1"/>` +
             `<text x="${cx.toFixed(2)}" y="${(axisY + 31).toFixed(2)}" text-anchor="middle" font-size="9.5" fill="var(--kz-text-1)">${months[s].year}</text>`;
      s = e + 1;
    }
    return out;
  }

  // pionowy znacznik początku DOBORU („dobór →"). fi = indeks początku, slot, fr.
  // textY pozwala rozsunąć etykiety, gdy CO i CWU dobierają w różnych miesiącach.
  function doborMark(fr, slot, fi, label, textY) {
    if (!(fi > 0)) return '';
    const mx = fr.padL + fi * slot;
    const ty = textY != null ? textY : fr.padT + 11;
    return `<line x1="${mx.toFixed(2)}" y1="${fr.padT}" x2="${mx.toFixed(2)}" y2="${(fr.padT + fr.ch).toFixed(2)}" stroke="var(--kz-text-2)" stroke-width="1" stroke-dasharray="3,3"/>` +
           `<text x="${(mx + 4).toFixed(2)}" y="${ty.toFixed(2)}" font-size="8.5" fill="var(--kz-text-2)">${esc(label)}</text>`;
  }

  // lekkie tło na prawo od linii DOBORU (obszar dobieranego „ogona").
  // fi = indeks początku doboru; fi===0 → cały zakres jest dobierany.
  function doborShade(fr, slot, fi) {
    if (!(fi >= 0)) return '';
    const mx = fr.padL + fi * slot;
    const w = fr.padL + fr.cw - mx;
    if (w <= 0) return '';
    return `<rect x="${mx.toFixed(2)}" y="${fr.padT}" width="${w.toFixed(2)}" height="${fr.ch.toFixed(2)}" fill="var(--kz-text-3)" opacity="0.06"/>`;
  }

  // pionowe kreski na KOŃCU okresu rozliczeniowego (granica okresu danego medium).
  // Rysowane na prawej krawędzi kolumny miesiąca kończącego okres; etykieta przy osi.
  function periodMarks(fr, months, slot, medium, labelDy) {
    let out = '';
    const ty = fr.padT + fr.ch - 5 - (labelDy || 0);
    months.forEach((w, i) => {
      if (!P.isPeriodEnd(medium, w.year, w.month)) return;
      const mx = fr.padL + (i + 1) * slot;
      out += `<line x1="${mx.toFixed(2)}" y1="${fr.padT}" x2="${mx.toFixed(2)}" y2="${(fr.padT + fr.ch).toFixed(2)}" stroke="var(--kz-text-3)" stroke-width="1.4" stroke-dasharray="1,3"/>` +
             `<text x="${(mx - 3).toFixed(2)}" y="${ty.toFixed(2)}" text-anchor="end" font-size="8" fill="var(--kz-text-3)">koniec ${medium}</text>`;
    });
    return out;
  }

  // małe czarne kropki + ukryta wartość (hover); name+label do tooltipa.
  // fmtVal — formater etykiety przy kropce (domyślnie pl0); fmtTip — wartość w tooltipie (domyślnie zł).
  function dots(pts, name, labels, fmtVal, fmtTip) {
    const fv = fmtVal || P.fmt.pl0;
    const ft = fmtTip || P.fmt.zl;
    return pts.map((p, i) =>
      `<g class="kz-dot">` +
        `<text class="kz-dot-val" x="${p.x.toFixed(2)}" y="${(p.y - 7).toFixed(2)}" text-anchor="middle" ` +
          `font-size="9" font-weight="600" fill="var(--kz-text-0)" stroke="var(--kz-bg-0)" stroke-width="3" paint-order="stroke">` +
          `${fv(p.v)}</text>` +
        `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.6" fill="var(--kz-text-0)"/>` +
        `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="7" fill="transparent">` +
          `<title>${esc(name)} · ${labels[i]}: ${ft(p.v)}</title></circle>` +
      `</g>`).join('');
  }

  // ===== WIDOK 'co' / 'cwu' — narastająco koszt vs zaliczki =====
  function drawCum(sim) {
    const svg = document.getElementById('kz-m04-chart');
    if (!svg) return;
    const N = sim.cum.cost.length;
    if (N === 0) { svg.innerHTML = `<text x="50" y="40">brak danych — dodaj rekordy w Module 01 i stawki w Module 03</text>`; return; }

    const top = Math.max(sim.cum.adv[N - 1], sim.cum.cost[N - 1], 1);
    const yMax = P._niceMax(top, 1.12);
    const fr = P._frame(yMax, 5, { padL: 64, padB: 44 });
    const slot = fr.cw / N;
    const x = i => fr.padL + i * slot + slot / 2;

    const ptsCost = sim.cum.cost.map((v, i) => ({ x: x(i), y: fr.y(v), v }));
    const ptsAdv  = sim.cum.adv.map((v, i) => ({ x: x(i), y: fr.y(v), v }));

    // „ząbki": linie i wypełnienie rozbite na segmenty per okres rozliczeniowy
    // (reset skumulowania = osobna łamana, bez ukośnej linii łączącej spadek).
    const per = sim.cum.period || sim.cum.cost.map(() => 0);
    const segs = [];
    for (let s = 0, i = 1; i <= N; i++) {
      if (i === N || per[i] !== per[s]) { segs.push([s, i - 1]); s = i; }
    }
    const lineOf = pts => segs.map(([a, b]) => poly(pts.slice(a, b + 1))).join(' ');
    const advLine  = lineOf(ptsAdv);
    const costLine = lineOf(ptsCost);

    // wypełnienie pod linią zaliczek — osobny domknięty kształt na każdy okres
    const y0 = fr.y(0);
    const advArea = segs.map(([a, b]) => {
      const seg = ptsAdv.slice(a, b + 1);
      return poly(seg) + ` L ${seg[seg.length - 1].x.toFixed(2)} ${y0.toFixed(2)} L ${seg[0].x.toFixed(2)} ${y0.toFixed(2)} Z`;
    }).join(' ');

    // pionowy znacznik początku DOBORU + granice okresu rozliczeniowego
    const nowMark = doborMark(fr, slot, sim.firstComputed, 'dobór →');
    const periodM = periodMarks(fr, sim.months, slot, sim.medium);

    svg.innerHTML = `
      <defs>
        <linearGradient id="kz-adv-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${ADV}" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="${ADV}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${doborShade(fr, slot, sim.firstComputed)}${fr.grid}${fr.axes}${periodM}${nowMark}
      <path d="${advArea}" fill="url(#kz-adv-grad)"/>
      <path d="${advLine}" fill="none" stroke="${ADV}" stroke-width="2.4"/>
      <path d="${costLine}" fill="none" stroke="${COST}" stroke-width="2.4"/>
      ${dots(ptsCost, 'koszt', sim.cum.labels)}${dots(ptsAdv, 'zaliczki', sim.cum.labels)}
      ${fr.yLabels}${xAxis(fr, sim.months, slot, x)}
      <text x="${fr.padL - 50}" y="${fr.padT - 10}" font-size="9.5" letter-spacing="1.2">[zł]</text>`;
  }

  // ===== WIDOK 'adv' — wysokość miesięcznych zaliczek jednego medium =====
  function drawAdv(sim) {
    const svg = document.getElementById('kz-m04-chart');
    if (!svg) return;
    const months = sim.months;
    const N = months.length;
    if (N === 0) { svg.innerHTML = `<text x="50" y="40">brak danych — dodaj rekordy w Module 01 i stawki w Module 03</text>`; return; }
    const labels = sim.cum.labels;
    const color = sim.medium === 'CO' ? COL_CO : COL_CWU;

    let peak = 1;
    months.forEach(m => { if ((m.advTotal || 0) > peak) peak = m.advTotal; });
    const yMax = P._niceMax(peak, 1.12);
    const fr = P._frame(yMax, 5, { padL: 64, padB: 44 });
    const slot = fr.cw / N;
    const x = i => fr.padL + i * slot + slot / 2;

    // linia serii: część ustalona ciągła + dobrana przerywana (łączą się na granicy)
    const pts = months.map((m, i) => ({ x: x(i), y: fr.y(m.advTotal || 0), v: m.advTotal || 0 }));
    const fc = sim.firstComputed;                 // indeks początku doboru (−1 = brak doboru)
    let solid, dash;
    if (fc < 0)       { solid = pts; dash = []; }
    else if (fc === 0){ solid = []; dash = pts; }
    else              { solid = pts.slice(0, fc); dash = pts.slice(fc - 1); }  // wspólny punkt łączy
    let series = '';
    if (solid.length >= 2) series += `<path d="${poly(solid)}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    else if (solid.length === 1) series += `<circle cx="${solid[0].x.toFixed(2)}" cy="${solid[0].y.toFixed(2)}" r="2.4" fill="${color}"/>`;
    if (dash.length >= 2) series += `<path d="${poly(dash)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="6,4"/>`;
    series += dots(pts, sim.medium === 'CO' ? 'zaliczki CO' : 'zaliczki CWU', labels);

    const marks = doborMark(fr, slot, sim.firstComputed, 'dobór →');
    const periodM = periodMarks(fr, months, slot, sim.medium);

    svg.innerHTML = `
      ${doborShade(fr, slot, sim.firstComputed)}${fr.grid}${fr.axes}${periodM}${marks}
      ${series}
      ${fr.yLabels}${xAxis(fr, months, slot, x)}
      <text x="${fr.padL - 50}" y="${fr.padT - 10}" font-size="9.5" letter-spacing="1.2">[zł/mies.]</text>`;
  }

  // ===== WIDOK 'rate' — jednostkowe stawki zaliczek jednego medium =====
  // CO → zł/m², CWU → zł/m³ (osobny wykres per medium).
  function drawRate(sim) {
    const svg = document.getElementById('kz-m04-chart');
    if (!svg) return;
    const months = sim.months;
    const N = months.length;
    if (N === 0) { svg.innerHTML = `<text x="50" y="40">brak danych — dodaj rekordy w Module 01 i stawki w Module 03</text>`; return; }
    const labels = sim.cum.labels;
    const color = sim.medium === 'CO' ? COL_CO : COL_CWU;
    const unit = sim.medium === 'CO' ? 'zł/m²' : 'zł/m³';
    const tip = v => P.fmt.pl2(v) + ' ' + unit;

    let peak = 0.1;
    months.forEach(m => { if ((m.rate || 0) > peak) peak = m.rate; });
    const yMax = P._niceMax(peak, 1.12);
    const fr = P._frame(yMax, 5, { padL: 64, padB: 44, fmtY: P.fmt.pl1 });
    const slot = fr.cw / N;
    const x = i => fr.padL + i * slot + slot / 2;

    // linia serii stawek: ustalona ciągła + dobrana przerywana (wspólny punkt łączy)
    const pts = months.map((m, i) => ({ x: x(i), y: fr.y(m.rate || 0), v: m.rate || 0 }));
    const fc = sim.firstComputed;
    let solid, dash;
    if (fc < 0)        { solid = pts; dash = []; }
    else if (fc === 0) { solid = []; dash = pts; }
    else               { solid = pts.slice(0, fc); dash = pts.slice(fc - 1); }
    let series = '';
    if (solid.length >= 2) series += `<path d="${poly(solid)}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    else if (solid.length === 1) series += `<circle cx="${solid[0].x.toFixed(2)}" cy="${solid[0].y.toFixed(2)}" r="2.4" fill="${color}"/>`;
    if (dash.length >= 2) series += `<path d="${poly(dash)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-dasharray="6,4"/>`;
    series += dots(pts, sim.medium === 'CO' ? 'stawka CO' : 'stawka CWU', labels, P.fmt.pl2, tip);

    const marks = doborMark(fr, slot, sim.firstComputed, 'dobór →');
    const periodM = periodMarks(fr, months, slot, sim.medium);

    svg.innerHTML = `
      ${doborShade(fr, slot, sim.firstComputed)}${fr.grid}${fr.axes}${periodM}${marks}
      ${series}
      ${fr.yLabels}${xAxis(fr, months, slot, x)}
      <text x="${fr.padL - 50}" y="${fr.padT - 10}" font-size="9.5" letter-spacing="1.2">[${unit}]</text>`;
  }

})(window.KZ);
