'use strict';
/*
 * Config importu — SM Opole, węzeł EA1/N01 (grupa „G. Row." → budynki GR-04…GR-11).
 * Uruchom:  node import/build-import.js config-gr.js              (build + walidacja)
 *           node import/build-import.js config-gr.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (preflight wypisze dostępne id).
 * Nowa grupa/węzeł → osobny plik `config-<grupa>.js` (np. config-op.js z id "1","2","7",…).
 */
module.exports = {
  outFile: 'import_gr4_gr11.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2023-01',
  to:   '2026-05',
  validateAgainst: 'import_gr4_gr11.json', // regresja: nowy build vs wersja na dysku (budynki wspólne)
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
