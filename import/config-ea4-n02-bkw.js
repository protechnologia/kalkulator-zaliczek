'use strict';
/*
 * Config importu — SM Opole, węzeł EA4/N02 (grupa „BKW").
 * Ulice: Bielska, Chełmska, Kielecka, Witosa.  Budynków: 11.
 * Uruchom:  node import/build-import.js config-ea4-n02-bkw.js              (build + walidacja)
 *           node import/build-import.js config-ea4-n02-bkw.js --check       (sam preflight)
 *
 * Każdy `id` to DOKŁADNA wartość z wiersza 13 raportu (wiersz 12 = ulica). Preflight wypisze dostępne id.
 * Lokale użytkowe (R12 = „Lok. uż.") są pomijane automatycznie.
 */
module.exports = {
  outFile: 'import-ea4-n02-bkw.json',
  root: 'C:/_GDrive/Dokumenty/eGIE/Wdrożenia/SM Opole/Dokumenty/Backup raportów miesiecznych',
  from: '2021-12', // EA4 — raporty dopiero od 2021.12 (krótsza historia)
  to:   '2026-05',
  carryAdvanceTo: '2026-06', // powiel ostatnią stawkę na trwający miesiąc bez raportu (odtwarzalność)
  validateAgainst: 'import-ea4-n02-bkw.json', // regresja: nowy build vs wersja na dysku (pomijane przy 1. buildzie)
  mergedAdvances: true, // węzeł rozliczany WSPÓLNĄ stawką → M04 domyślnie „Łącznie (wszystkie budynki)"
  sources: [
    {
      node: 'EA4/N02',
      buildings: [
        { name: 'BI-22', id: '22'    }, // Bielska 22
        { name: 'BI-30', id: '30'    }, // Bielska 30
        { name: 'BI-32', id: '32'    }, // Bielska 32
        { name: 'BI-40', id: '40'    }, // Bielska 40
        { name: 'BI-48', id: '48'    }, // Bielska 48
        { name: 'BI-53', id: '53'    }, // Bielska 53
        { name: 'BI-54', id: '54'    }, // Bielska 54
        { name: 'CH-24', id: '24'    }, // Chełmska 24
        { name: 'KI-1',  id: '1'     }, // Kielecka 1
        { name: 'KI-6',  id: '6'     }, // Kielecka 6
        { name: 'WI-18', id: '18'    }, // Witosa 18
      ],
    },
  ],
  // state: { periodStartCO: 1, periodStartCWU: 1 }, // opcjonalne nadpisania stanu UI
};
