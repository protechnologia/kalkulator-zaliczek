'use strict';
/*
 * Config importu — SM Opole, węzeł EA3/N02 (grupa „BZ").
 * Ulice: Bat. Zośki, Szarych Szeregów.  Budynków: 8.
 * Uruchom:  node import/build-import.js config-ea3-n02-bz.js              (build + walidacja)
 *           node import/build-import.js config-ea3-n02-bz.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea3-n02-bz.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2020-01',
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea3-n02-bz.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  sources: [
    {
      node: 'EA3/N02',
      buildings: [
        { name: 'BZ-1',  id: '1'     }, // Bat. Zośki 1
        { name: 'BZ-2',  id: '2'     }, // Bat. Zośki 2
        { name: 'BZ-4',  id: '4'     }, // Bat. Zośki 4
        { name: 'BZ-5',  id: '5'     }, // Bat. Zośki 5
        { name: 'BZ-6',  id: '6'     }, // Bat. Zośki 6
        { name: 'SS-3',  id: '3'     }, // Szarych Szeregów 3
        { name: 'SS-13', id: '13'    }, // Szarych Szeregów 13
        { name: 'SS-15', id: '15'    }, // Szarych Szeregów 15
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
