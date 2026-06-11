/* =========================================================
   KALKULATOR-ZALICZEK — Klimatologia HDD (PLIK GENEROWANY)

   NIE EDYTOWAĆ RĘCZNIE — regeneruje go w całości tools/hdd-climate.js
   (źródło: Open-Meteo Archive API, średnie dobowe temperature_2m_mean).

   HDD liczone aproksymacją MIESIĘCZNĄ — tą samą co w kz.estimate.js:
   HDD_m = max(0, tBase − T_śr_mies) × liczba_dni. Używane wyłącznie do
   PROGNOZY przyszłych miesięcy (rok typowy + trend klimatu + percentyl);
   HDD historii liczy się z temperatur użytkownika (P.temps).
   ========================================================= */
window.KZ = window.KZ || {};
(function(P) {
  'use strict';

  P.CLIMATE = {
    opole: {
      name: 'Opole', lat: 50.675, lon: 17.931,
      tBase: 15,
      refRange: '2005/06–2025/26',          // kompletne sezony grzewcze (paź–kwi)
      firstSeason: 2005,                  // sezon o indeksie 0 na osi trendu
      // rok typowy: średnie HDD per miesiąc kalendarzowy (1=sty … 12=gru)
      monthlyHDD: { 1: 479.6, 2: 393.7, 3: 321, 4: 159, 10: 142.4, 11: 283.6, 12: 418.4 },
      // sumy sezonowe HDD, chronologicznie od firstSeason (percentyle surowości zimy)
      seasonSums: [2792.6, 1763.9, 2258.7, 2217.3, 2621.8, 2548.7, 2416.5, 2578.8, 1882.9, 2015.8, 2036.3, 2443.1, 2125.7, 1968.5, 1836, 2324.4, 2202.3, 2052.2, 1766.2, 2025.3, 2275.2],
      meanSeasonSum: 2197.7,
      trendPerSeason: -19.2,             // [HDD/sezon] — korekta klimatyczna
    },
  };

})(window.KZ);
