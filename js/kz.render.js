/* =========================================================
   KALKULATOR-ZALICZEK — Wspólne helpery renderowania

   P.fmt         — formatery liczb pl-PL
   P._smoothPath — interpolacja Catmull-Rom (gładkie krzywe SVG)
   P._niceMax    — "lepki" zakres osi Y z {1,2,5}×10ⁿ
   P._svgChart   — wspólny szkielet wykresu (osie, siatka, etykiety)

   Funkcje per-moduł żyją w render.mXX.js.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  P.fmt = {
    pl0: n => Math.round(n || 0).toLocaleString('pl-PL'),
    pl1: n => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pl2: n => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pl3: n => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
    zl:  n => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł',
  };

  P._smoothPath = function(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  };

  P._niceMax = function(peak, headroom) {
    const t = (peak || 0) * (headroom || 1) + 1e-9;
    const exp = Math.floor(Math.log10(t));
    const base = Math.pow(10, exp);
    const m = t / base;
    const mNice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return mNice * base;
  };

  // Szkielet wykresu: zwraca {W,H,padL..,cw,ch,x,y,gridY,axes} dla osi
  // kategorialnej X (słupki/linie wg etykiet) i liniowej Y [yMin..yMax]
  // (opts.yMin, domyślnie 0 — ujemny zakres potrzebuje np. temperatura).
  P._frame = function(yMax, nTicks, opts) {
    opts = opts || {};
    const W = opts.W || 780, H = opts.H || 300;
    const padL = opts.padL || 54, padR = opts.padR || 18, padT = opts.padT || 22, padB = opts.padB || 38;
    const cw = W - padL - padR, ch = H - padT - padB;
    const fmtY = opts.fmtY || P.fmt.pl0;          // formater etykiet osi Y (np. pl2 dla małych wskaźników)
    const yMin = opts.yMin || 0;
    const y = v => padT + ch - ((v - yMin) / (yMax - yMin)) * ch;
    let grid = '', yLabels = '';
    for (let i = 0; i <= nTicks; i++) {
      const v = yMin + (yMax - yMin) * i / nTicks, yy = y(v);
      grid += `<line x1="${padL}" y1="${yy.toFixed(2)}" x2="${(W - padR).toFixed(2)}" y2="${yy.toFixed(2)}"
                     stroke="var(--kz-border)" stroke-width="1" ${i === 0 ? '' : 'stroke-dasharray="2,3"'}/>`;
      yLabels += `<text x="${padL - 8}" y="${(yy + 3.5).toFixed(2)}" text-anchor="end">${fmtY(v)}</text>`;
    }
    const axes = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + ch).toFixed(2)}" stroke="var(--kz-border-strong)" stroke-width="1"/>
      <line x1="${padL}" y1="${(padT + ch).toFixed(2)}" x2="${(W - padR).toFixed(2)}" y2="${(padT + ch).toFixed(2)}" stroke="var(--kz-border-strong)" stroke-width="1"/>`;
    return { W, H, padL, padR, padT, padB, cw, ch, y, grid, yLabels, axes };
  };

})(window.KZ);
