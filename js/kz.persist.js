/* =========================================================
   KALKULATOR-ZALICZEK — Trwałość stanu

   Główny mechanizm: eksport/import pliku JSON (działa zawsze na file://).
   Workflow: po otrzymaniu arkusza za kolejny miesiąc wczytujesz stan,
   dopisujesz najnowsze dane, symulacja się aktualizuje, zapisujesz z powrotem.

   Dodatkowo: best-effort autosave w localStorage (jeśli przeglądarka
   pozwala na file://) — wczytywany przy starcie.
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  const LS_KEY = 'kalkulator-zaliczek/state';

  P.serialize = function() {
    return JSON.stringify({
      app: 'kalkulator-zaliczek', version: P.VERSION,
      savedAt: new Date().toISOString(),
      state: P.state, records: P.records, prices: P.prices, temps: P.temps, advances: P.advances, areas: P.areas
    }, null, 2);
  };

  P.deserialize = function(obj) {
    if (!obj || obj.app !== 'kalkulator-zaliczek') throw new Error('Nieprawidłowy plik stanu');
    if (obj.state)    Object.assign(P.state, obj.state);
    if (obj.records)  P.records  = obj.records;
    if (obj.prices)   P.prices   = obj.prices;
    if (obj.advances) P.advances = obj.advances;
    P.areas = obj.areas || {};
    P.temps = obj.temps || {};       // starsze pliki nie mają temperatur
    // układ macierzy: z pliku albo null → ponowny zasiew z danych (starsze pliki go nie mają)
    const s = obj.state || {};
    P.state.m01Cols = s.m01Cols || null;
    P.state.m01From = s.m01From || null;
    P.state.m01To   = s.m01To   || null;
    // odtworzenie licznika id, żeby nowe rekordy nie kolidowały
    let max = 0;
    P.records.forEach(r => { const n = parseInt(String(r.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    P._restoreSeq && P._restoreSeq(max + 1);
  };

  P.exportJSON = function() {
    const blob = new Blob([P.serialize()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const b = P.state.building ? P.state.building.replace(/\s+/g, '_') : 'wszystkie';
    const a = document.createElement('a');
    a.href = url;
    a.download = `zaliczki_${b}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  P.importJSON = function(file, done) {
    const fr = new FileReader();
    fr.onload = () => {
      try { P.deserialize(JSON.parse(fr.result)); done(null); }
      catch (e) { done(e); }
    };
    fr.onerror = () => done(new Error('Błąd odczytu pliku'));
    fr.readAsText(file);
  };

  P.autosave = function() {
    try { localStorage.setItem(LS_KEY, P.serialize()); } catch (e) { /* file:// może blokować */ }
  };
  P.autoload = function() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { P.deserialize(JSON.parse(raw)); return true; }
    } catch (e) { /* ignoruj */ }
    return false;
  };

})(window.KZ);
