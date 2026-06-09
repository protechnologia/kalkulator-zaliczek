/* =========================================================
   KALKULATOR-ZALICZEK — Orkiestracja UI

   P.update()  — przelicza symulację i renderuje wszystkie moduły.
   init()      — jednorazowa inicjalizacja: hydracja kontrolek z P.state,
                 podpięcie listenerów (delegacja na stabilnych kontenerach),
                 trwałość stanu, TOC/sidebar/motyw.

   Ładowany jako OSTATNI plik JS.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  // ===== GŁÓWNY PRZEBIEG =====
  P.update = function() {
    // upewnij się, że wybrany budynek istnieje (kolumny macierzy = źródło listy budynków)
    const bs = P.m01ColBuildings();
    if ((!P.state.building || !bs.includes(P.state.building)) && bs.length) P.state.building = bs[0];
    if (!bs.length) P.state.building = null;

    P.renderM01();
    P.renderM02();
    P.renderM03();
    renderM04Both();

    P.autosave();
  };

  // M04 rysuje oba media (CO+CWU) — widok wybiera, co pokazać.
  function renderM04Both() {
    const b = P.m04Building();
    P.renderM04(P.simulate(b, 'CO'), P.simulate(b, 'CWU'));
  }

  let pending = false;
  P.requestUpdate = function() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; P.update(); });
  };

  // Lekkie odświeżenie po edycji komórki macierzy: przelicza symulację i
  // renderuje M02–M04, ale NIE przebudowuje macierzy M01 (zachowuje focus w polu).
  let pendingSim = false;
  function requestSimRefresh() {
    if (pendingSim) return;
    pendingSim = true;
    requestAnimationFrame(() => {
      pendingSim = false;
      P.renderM02();                 // wskaźnik/prognoza zależą od danych M01
      renderM04Both();               // M03 (stawki) nie zależy od edycji komórek M01 → nie przebudowujemy
      P.autosave();
    });
  }

  // ===== INICJALIZACJA =====
  function init() {
    P.autoload();

    // --- M04: budynek + okres rozliczeniowy (chipy informacyjne) + wybór treści wykresu (select) ---
    const m04Bld = document.getElementById('kz-m04-building');
    if (m04Bld) m04Bld.addEventListener('change', () => { P.state.m04Building = m04Bld.value; renderM04Both(); P.autosave(); });
    const m04View = document.getElementById('kz-m04-view');
    if (m04View) {
      m04View.value = P.state.m04View;
      m04View.addEventListener('change', () => { P.state.m04View = m04View.value; renderM04Both(); P.autosave(); });
    }

    // --- M02: budynek + wybór wielkości + metoda prognozy ---
    const m02Bld = document.getElementById('kz-m02-building');
    if (m02Bld) m02Bld.addEventListener('change', () => { P.state.m02Building = m02Bld.value; P.renderM02(); P.autosave(); });
    const m02Metric = document.getElementById('kz-m02-metric');
    if (m02Metric) {
      m02Metric.value = P.state.m02Metric;
      m02Metric.addEventListener('change', () => { P.state.m02Metric = m02Metric.value; P.renderM02(); P.autosave(); });
    }
    const m02Method = document.getElementById('kz-m02-method');
    if (m02Method) {
      m02Method.value = P.state.m02Method;
      m02Method.addEventListener('change', () => { P.state.m02Method = m02Method.value; P.renderM02(); P.autosave(); });
    }
    // Baza prognozy CWU — zmienia forecastGJ dla CWU, więc wpływa na koszt i dobór
    // zaliczek (M04). Pełny P.update(), nie tylko M02.
    const m02Basis = document.getElementById('kz-m02-basis');
    if (m02Basis) {
      m02Basis.value = P.state.cwuBasis;
      m02Basis.addEventListener('change', () => { P.state.cwuBasis = m02Basis.value; P.update(); P.autosave(); });
    }
    // M02: hover na słupku → pokaż wartości WSZYSTKICH analogicznych miesięcy
    // (ten sam miesiąc kalendarzowy) + linię trendu prognozy. Delegacja na stabilnym
    // <svg> (przeżywa przerysowania przez innerHTML).
    const m02Chart = document.getElementById('kz-m02-chart');
    if (m02Chart) {
      const clearHover = () => {
        m02Chart.querySelectorAll('.kz-bar-val').forEach(t => { t.style.opacity = ''; });
        m02Chart.querySelectorAll('.kz-trend').forEach(g => { g.style.display = 'none'; });
      };
      m02Chart.addEventListener('mouseover', e => {
        const bar = e.target.closest && e.target.closest('.kz-bar');
        if (!bar) return;
        const m = bar.getAttribute('data-month');
        m02Chart.querySelectorAll('.kz-bar-val').forEach(t => {
          t.style.opacity = (t.getAttribute('data-month') === m) ? '1' : '';
        });
        m02Chart.querySelectorAll('.kz-trend').forEach(g => {
          g.style.display = (g.getAttribute('data-month') === m) ? '' : 'none';
        });
      });
      m02Chart.addEventListener('mouseleave', clearHover);
    }

    // --- M01: macierz (budynki × miesiące) ---
    // Rozszerzanie zakresu obsługują plusiki w skrajnych wierszach/kolumnach (delegacja niżej).
    const m01 = document.getElementById('kz-m01-matrix');
    // edycja komórek + powierzchni (delegacja na stabilnym kontenerze)
    m01.addEventListener('input', e => {
      const d = e.target.dataset; if (!d) return;
      if (d.areaB != null) { P.setArea(d.areaB, e.target.value); requestSimRefresh(); return; }
      if (d.priceM != null) { P.setPrice(+d.priceY, +d.priceM, e.target.value === '' ? null : parseFloat(e.target.value)); requestSimRefresh(); return; }
      if (d.cell == null) return;
      const b = d.b, y = +d.y, m = +d.m, v = e.target.value;
      if (d.cell === 'co')         P.setCellCO(b, y, m, v);
      else if (d.cell === 'cwu')   P.setCellCWUgj(b, y, m, v);
      else if (d.cell === 'water') P.setCellWater(b, y, m, v);
      requestSimRefresh();
    });
    // zmiana nazwy budynku (na blur/Enter — nie przy każdym znaku, bo przepina klucze)
    m01.addEventListener('change', e => {
      const d = e.target.dataset; if (!d || d.renameB == null) return;
      const oldName = d.renameB, newName = e.target.value.trim();
      if (!newName) { e.target.value = oldName; return; }
      if (newName === oldName) return;
      if (!P.m01RenameBuilding(oldName, newName)) { alert('Budynek o tej nazwie już istnieje.'); e.target.value = oldName; return; }
      P.update();
    });
    // usunięcie kolumny budynku
    m01.addEventListener('click', e => {
      const d = e.target.dataset; if (!d) return;
      // dodanie miesiąca (plusik w skrajnym wierszu)
      if (d.addMonth) { P.m01AddMonth(d.addMonth); P.update(); return; }
      // dodanie budynku (plusik w skrajnej kolumnie)
      if (d.addBld) {
        const name = P.m01NextBuildingName();   // auto-nazwa; do zmiany w nagłówku kolumny
        P.m01AddBuilding(name, d.addBld);
        P.state.building = name;
        P.update(); return;
      }
      // usunięcie skrajnego miesiąca
      if (d.rmMonth) {
        if (!confirm('Usunąć ten miesiąc wraz z danymi wszystkich budynków (zużycie, cena, zaliczki)?')) return;
        P.m01RemoveMonth(d.rmMonth); P.update(); return;
      }
      // usunięcie kolumny budynku
      const b = d.rmB; if (!b) return;
      if (!confirm(`Usunąć budynek „${b}" wraz ze wszystkimi jego danymi (CO i CWU)?`)) return;
      P.m01RemoveBuilding(b); P.update();
    });

    // --- M03: macierz stawek zaliczek (budynki × miesiące), delegacja na stabilnym kontenerze ---
    // Edycja stawki NIE przebudowuje macierzy (zachowuje focus); odświeża tylko symulację M04.
    const m03 = document.getElementById('kz-m03-matrix');
    if (m03) m03.addEventListener('input', e => {
      const d = e.target.dataset; if (!d || d.advMed == null) return;
      P.setAdvance(d.advB, d.advMed, +d.advY, +d.advM,
                   e.target.value === '' ? null : parseFloat(e.target.value));
      renderM04Both();
      P.autosave();
    });

    // --- TRWAŁOŚĆ ---
    document.getElementById('kz-export').addEventListener('click', () => P.exportJSON());
    const fileIn = document.getElementById('kz-import-file');
    document.getElementById('kz-import').addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', () => {
      if (!fileIn.files[0]) return;
      P.importJSON(fileIn.files[0], err => {
        if (err) { alert('Błąd wczytywania: ' + err.message); return; }
        // odśwież kontrolki z wczytanego stanu
        if (m02Metric) m02Metric.value = P.state.m02Metric;
        if (m02Method) m02Method.value = P.state.m02Method;
        if (m04View)   m04View.value = P.state.m04View;
        P.update();
      });
      fileIn.value = '';
    });
    document.getElementById('kz-reset').addEventListener('click', () => {
      if (!confirm('Wyczyścić wszystkie dane kalkulatora?')) return;
      P.records = []; P.prices = {}; P.advances = {}; P.areas = {}; P.state.building = null;
      P.state.m01Cols = null; P.state.m01From = null; P.state.m01To = null;
      P.update();
    });

    // --- TOC ---
    const toc = document.getElementById('kz-toc'), tocT = document.getElementById('kz-toc-toggle');
    tocT.addEventListener('click', () => { const v = toc.classList.toggle('force-show'); tocT.setAttribute('aria-expanded', String(v)); });

    P.update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.KZ);
