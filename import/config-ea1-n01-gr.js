'use strict';
/*
 * Config importu — SM Opole, węzeł EA1/N01 (grupa „G. Row." → budynki GR-04…GR-11).
 * Uruchom:  node import/build-import.js config-ea1-n01-gr.js              (build + walidacja)
 *           node import/build-import.js config-ea1-n01-gr.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (preflight wypisze dostępne id).
 * Nowa grupa/węzeł → osobny plik `config-<węzeł>-<grupa>.js` (np. config-ea3-n03-op.js).
 */
module.exports = {
  outFile: 'import-ea1-n01-gr.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01', // najwcześniejsze raporty na dysku: 2015-01 (można zejść niżej w razie potrzeby)
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea1-n01-gr.json', // regresja: nowy build vs wersja na dysku (budynki wspólne)
  sources: [
    {
      node: 'EA1/N01',
      buildings: [
        { name: 'GR-04', id: '4'  },
        { name: 'GR-05', id: '5'  },
        { name: 'GR-06', id: '6'  },
        { name: 'GR-07', id: '7'  },
        { name: 'GR-08', id: '8'  },
        { name: 'GR-09', id: '9'  },
        { name: 'GR-10', id: '10' },
        { name: 'GR-11', id: '11' },
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
