'use strict';
/*
 * build-import.js — generyczny importer raportów ZWM (ECO) → plik JSON kalkulatora.
 *
 * Użycie:
 *   node import/build-import.js <config> [--check]
 *     <config>   — ścieżka do configu, np. config-ea1-n01-gr.js (WYMAGANY; bez niego lista dostępnych)
 *     --check    — sam PREFLIGHT (mapowanie budynków + kotwice), bez zapisu pliku
 *   Konwencja nazw: config-<węzeł>-<grupa>.js (config-ea1-n01-gr.js, config-ea2-n01-br.js, …) — jeden plik per grupa/węzeł.
 *
 * Działa OFFLINE, bez zależności (własny mini-czytnik xlsx). Node tylko do tego skryptu;
 * aplikacja go nie referuje — wynik wczytuje się ręcznie w UI (Wczytaj).
 *
 * KLUCZOWE: identyfikator budynku (`id` w configu) to DOKŁADNA wartość z wiersza 13 raportu
 * (np. "4", "14a", "05") — różna per węzeł, alfanumeryczna, z lukami. Preflight wypisuje
 * wszystkie dostępne id i PRZERYWA, gdy któregoś z Twoich brak (ochrona przed literówką).
 */
const fs = require('fs'), zlib = require('zlib'), path = require('path');

/* ───────────────────────── mini-czytnik xlsx (store + deflate) ───────────────────────── */
function zipEntries(buf){let p=buf.length-22;while(p>=0&&buf.readUInt32LE(p)!==0x06054b50)p--;if(p<0)throw new Error('brak EOCD');const n=buf.readUInt16LE(p+10);let off=buf.readUInt32LE(p+16);const out={};for(let i=0;i<n;i++){if(buf.readUInt32LE(off)!==0x02014b50)throw new Error('zły wpis CD');const method=buf.readUInt16LE(off+10);const csize=buf.readUInt32LE(off+20);const nameLen=buf.readUInt16LE(off+28);const extraLen=buf.readUInt16LE(off+30);const cmtLen=buf.readUInt16LE(off+32);const lho=buf.readUInt32LE(off+42);const name=buf.toString('utf8',off+46,off+46+nameLen);const lnl=buf.readUInt16LE(lho+26),lel=buf.readUInt16LE(lho+28);const dStart=lho+30+lnl+lel;out[name]={method,raw:buf.slice(dStart,dStart+csize)};off+=46+nameLen+extraLen+cmtLen;}return out;}
const entryText=e=>(e.method===8?zlib.inflateRawSync(e.raw):e.raw).toString('utf8');
function parseShared(xml){const out=[];let m;const re=/<si>([\s\S]*?)<\/si>/g;while((m=re.exec(xml))){let t='',tm;const tr=/<t[^>]*>([\s\S]*?)<\/t>/g;while((tm=tr.exec(m[1])))t+=tm[1];out.push(t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));}return out;}
function parseCells(xml,shared){const cells={};let m;const re=/<c ([^>]*?)\/>|<c ([^>]*)>([\s\S]*?)<\/c>/g;while((m=re.exec(xml))){if(m[1]!==undefined)continue;const attrs=m[2],inner=m[3];const rm=attrs.match(/r="([A-Z]+\d+)"/);if(!rm)continue;const tm=attrs.match(/t="(\w+)"/);const vm=inner.match(/<v>([\s\S]*?)<\/v>/);if(!vm)continue;let v=vm[1];if(tm&&tm[1]==='s')v=shared[parseInt(v,10)];cells[rm[1]]=v;}return cells;}
function loadCells(file){const e=zipEntries(fs.readFileSync(file));const shared=parseShared(entryText(e['xl/sharedStrings.xml']));return parseCells(entryText(e['xl/worksheets/sheet1.xml']),shared);}

/* ───────────────────────── helpery ───────────────────────── */
const rowNum=ref=>+ref.match(/\d+$/)[0];
const colLetter=ref=>ref.match(/^[A-Z]+/)[0];
const num=v=>{if(v===undefined||v===null)return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const round2=x=>Math.round(x*100)/100;
const round1=x=>Math.round(x*10)/10;
function findRowByLabel(cells,cols,test){for(const ref in cells){if(!cols.includes(colLetter(ref)))continue;if(test(String(cells[ref])))return rowNum(ref);}return null;}
// mapa id(R13)->kolumna; pomija "Razem"
function r13Map(cells){const out={};for(const ref in cells){if(rowNum(ref)!==13)continue;const v=String(cells[ref]).trim();if(!v||/^razem$/i.test(v))continue;out[v]=colLetter(ref);}return out;}
// "Różnica" licznika: wiersz+2 (Różnica), fallback końcowy-początkowy (legalizacja → tekst w +0/+1)
function meterDiff(cells,anchorRow,col){const v2=num(cells[col+(anchorRow+2)]);if(v2!==null)return v2;const v0=num(cells[col+anchorRow]),v1=num(cells[col+(anchorRow+1)]);if(v0!==null&&v1!==null)return v1-v0;return null;}

// kotwice wspólne dla wszystkich węzłów ZWM/ECO (zweryfikowane: EA1/N01, EA2/N01, EA3/N03, EA4/N06)
function anchors(cells){
  return {
    pow:  findRowByLabel(cells,['C'], s=>s.includes('Powierzchnia budynku')),
    cwu:  findRowByLabel(cells,['B'], s=>s.includes('(LC2)')),       // +2 = Różnica CWU [GJ]
    co:   findRowByLabel(cells,['B'], s=>s.includes('(LC1-LC2)')),   // +2 = Różnica CO  [GJ]
    // wodomierz zimnej wody: GR(EA1/N01) ma "(LC3)", pozostałe węzły "(W2)" — kotwiczymy po
    // wspólnym "wody zimn" (NIE łapie "Wodomierz uzupełnienia zładu CO"). +2 = Różnica woda [m3]
    woda: findRowByLabel(cells,['B'], s=>s.includes('wody zimn')),
    temp: findRowByLabel(cells,['C'], s=>s.includes('Średnia temperatura zewnętrzna')),
    advCO:findRowByLabel(cells,['C'], s=>s.includes('Stawka za zmienny składnik CO')),
    advCWU:findRowByLabel(cells,['C'], s=>s.includes('Stawka za zmienny składnik CWU')),
    cena: findRowByLabel(cells,['I','J','K','A','B','C'], s=>s.includes('Cena ciepła zmienna')),
  };
}
// Kotwice OPCJONALNE: stawki zaliczek pojawiły się w raportach dopiero od 2020-07
// (wcześniejsze raporty to czyste zużycie/koszty). Ich brak NIE jest błędem — wtedy
// po prostu nie emitujemy advances dla danego miesiąca. Reszta kotwic jest wymagana.
const OPTIONAL_ANCHORS=new Set(['advCO','advCWU']);

/* ───────────────────────── ścieżki/iteracja ───────────────────────── */
function parseYM(s){const m=String(s).match(/^(\d{4})-(\d{1,2})$/);if(!m)throw new Error('zła data: '+s);return{y:+m[1],m:+m[2]};}
function monthsBetween(from,to){const a=parseYM(from),b=parseYM(to);const out=[];let y=a.y,m=a.m;while(y<b.y||(y===b.y&&m<=b.m)){out.push({y,m,key:`${y}-${String(m).padStart(2,'0')}`});m++;if(m>12){m=1;y++;}}return out;}
// node "EA1/N01" → { ea:"EA1", prefix:"raport_pracy_ea1_n01" }
function nodeParts(node){const ea=node.split('/')[0];const prefix='raport_pracy_'+node.toLowerCase().replace(/\//g,'_');return{ea,prefix};}
function reportDir(root,node,y,m){const{ea}=nodeParts(node);const mm=String(m).padStart(2,'0');return `${root}/Raporty za ${y}.${mm}/ZWM/${ea}`;}
// Nazwa pliku zmieniała się w czasie: ≥2023 „raport_pracy_ea1_n01_RRRR_MM.xlsx";
// ≤2022 „Raport pracy węzłów - EA1-N01-GR - RRRR.MM.xlsx" (+ narastające „… RRRR.01-MM.xlsx" — POMIJAĆ).
// Rozwiązujemy po LISTINGU folderu: bierzemy plik kończący się na RRRR_MM.xlsx lub RRRR.MM.xlsx
// (oba jednoznacznie wskazują pojedynczy miesiąc; zakres „01-07" kończy się inaczej, więc odpada),
// z pominięciem _ytd. Zwraca pełną ścieżkę albo null (brak pliku).
function reportPath(root,node,y,m){
  const dir=reportDir(root,node,y,m);
  if(!fs.existsSync(dir))return null;
  const mm=String(m).padStart(2,'0');
  const sufNew=`_${y}_${mm}.xlsx`, sufOld=`${y}.${mm}.xlsx`;
  // Katalog ZWM/EA<x> zawiera pliki WIELU węzłów (n01..n04) na ten sam miesiąc —
  // filtruj po konkretnym węźle: nowy format „..._ea2_n02_...", stary „...-EA2-N02-...".
  const tokNew=node.toLowerCase().replace(/\//g,'_'); // ea2_n02
  const tokOld=node.toLowerCase().replace(/\//g,'-'); // ea2-n02
  const files=fs.readdirSync(dir).filter(f=>{
    const lf=f.toLowerCase();
    if(!lf.endsWith('.xlsx')||lf.includes('ytd'))return false;
    if(!(f.endsWith(sufNew)||f.endsWith(sufOld)))return false;
    return lf.includes(tokNew)||lf.includes(tokOld);
  });
  return files.length?dir+'/'+files[0]:null;
}

/* ───────────────────────── PREFLIGHT ───────────────────────── */
// Sprawdza na próbce miesięcy: czy każdy żądany `id` jest w R13, czy kotwice istnieją.
// Wypisuje WSZYSTKIE dostępne id (żebyś zobaczył literówkę/brak). Zwraca liczbę błędów twardych.
function preflight(cfg){
  const months=monthsBetween(cfg.from,cfg.to);
  const sample=[months[0],months[months.length-1]].filter((v,i,a)=>a.indexOf(v)===i);
  let hard=0;
  console.log('═══ PREFLIGHT ═══');
  console.log('Zakres:',cfg.from,'…',cfg.to,'  ('+months.length+' mies.)   Plik wynikowy:',cfg.outFile);
  // globalna unikalność nazw
  const names=cfg.sources.flatMap(s=>s.buildings.map(b=>b.name));
  const dup=names.filter((n,i)=>names.indexOf(n)!==i);
  if(dup.length){console.log('  ✗ Zduplikowane nazwy budynków:',[...new Set(dup)].join(', '));hard++;}
  for(const n of names){
    if(n.includes('|')){console.log('  ✗ Nazwa zawiera "|" (kolizja z kluczem advances):',n);hard++;}
    if(n==='__laczne__'){console.log('  ✗ Nazwa koliduje z sentinelem jednostki łącznej:',n);hard++;}
  }
  for(const src of cfg.sources){
    console.log('\n— źródło: węzeł '+src.node+' —');
    for(const sm of sample){
      const f=reportPath(cfg.root,src.node,sm.y,sm.m);
      if(!f){console.log('  ['+sm.key+'] ✗ BRAK PLIKU w: '+reportDir(cfg.root,src.node,sm.y,sm.m));hard++;continue;}
      const cells=loadCells(f);
      const map=r13Map(cells);
      const a=anchors(cells);
      const missReq=Object.entries(a).filter(([k,v])=>v==null&&!OPTIONAL_ANCHORS.has(k)).map(([k])=>k);
      const missOpt=Object.entries(a).filter(([k,v])=>v==null&&OPTIONAL_ANCHORS.has(k)).map(([k])=>k);
      console.log('  ['+sm.key+'] dostępne id w R13: '+Object.keys(map).map(id=>id+'→'+map[id]).join('  '));
      if(missReq.length){console.log('           ✗ brak kotwic wymaganych: '+missReq.join(', '));hard++;}
      if(missOpt.length){console.log('           ⚠ brak kotwic opcjonalnych (stawki — pominę te miesiące): '+missOpt.join(', '));}
      for(const b of src.buildings){
        const col=map[String(b.id)];
        console.log('           '+(col?'✓':'✗')+' '+b.name+'  id="'+b.id+'"  → '+(col||'BRAK W RAPORCIE!'));
        if(!col)hard++;
      }
    }
  }
  console.log('\nPREFLIGHT:',hard?('✗ '+hard+' błąd(ów) twardych — przerwij i popraw config'):'✓ OK');
  return hard;
}

/* ───────────────────────── BUILD ───────────────────────── */
function build(cfg){
  const months=monthsBetween(cfg.from,cfg.to);
  const records=[], prices={}, temps={}, advances={}, areas={};
  const issues=[];
  const order=[]; // kolejność budynków (źródło-major) do sortowania i m01Cols
  for(const src of cfg.sources) for(const b of src.buildings) order.push(b.name);

  for(const mo of months){
    const tCollect=[]; // temperatury wszystkich żądanych budynków (do wspólnej średniej)
    let priceSet=false;
    for(const src of cfg.sources){
      const f=reportPath(cfg.root,src.node,mo.y,mo.m);
      if(!f){issues.push(`${mo.key} [${src.node}]: BRAK PLIKU`);continue;}
      const cells=loadCells(f);
      const map=r13Map(cells);
      const a=anchors(cells);
      const missReq=Object.entries(a).filter(([k,v])=>v==null&&!OPTIONAL_ANCHORS.has(k)).map(([k])=>k);
      if(missReq.length) issues.push(`${mo.key} [${src.node}]: brak wymaganych kotwic: ${missReq.join(', ')}`);

      // cena (wspólna na miesiąc) — z pierwszego źródła, które ją ma
      if(!priceSet && a.cena!=null){
        let cv=null;for(const c of ['L','K','J','M','N','G','H','I']){const x=num(cells[c+a.cena]);if(x!==null){cv=x;break;}}
        if(cv!==null){prices[mo.key]=round2(cv);priceSet=true;}
      }
      for(const b of src.buildings){
        const col=map[String(b.id)];
        if(!col){issues.push(`${mo.key} [${src.node}]: brak kolumny dla ${b.name} (id="${b.id}")`);continue;}
        if(a.temp!=null){const t=num(cells[col+a.temp]);if(t!==null)tCollect.push(t);}
        const area = a.pow!=null?num(cells[col+a.pow]):null;
        const coGj = a.co!=null?meterDiff(cells,a.co,col):null;
        const cwuGj= a.cwu!=null?meterDiff(cells,a.cwu,col):null;
        const woda = a.woda!=null?meterDiff(cells,a.woda,col):null;
        const advCO = a.advCO!=null?num(cells[col+a.advCO]):null;
        const advCWU= a.advCWU!=null?num(cells[col+a.advCWU]):null;
        if(area!==null)areas[b.name]=round2(area); // ostatni miesiąc nadpisze → wartość bieżąca
        if(coGj!==null||area!==null) records.push({building:b.name,medium:'CO', year:mo.y,month:mo.m,gj:round2(Math.max(0,coGj??0)), qty:area!==null?round2(area):0});
        if(cwuGj!==null||woda!==null) records.push({building:b.name,medium:'CWU',year:mo.y,month:mo.m,gj:round2(Math.max(0,cwuGj??0)),qty:woda!==null?round2(woda):0});
        if(advCO!==null) advances[`${b.name}|CO|${mo.key}`]=round2(advCO);
        if(advCWU!==null)advances[`${b.name}|CWU|${mo.key}`]=round2(advCWU);
      }
    }
    if(tCollect.length) temps[mo.key]=round1(tCollect.reduce((p,c)=>p+c,0)/tCollect.length);
  }

  // Przeniesienie ostatniej stawki na miesiące PO `to` (np. trwający miesiąc bez raportu).
  // Spółdzielnia nie zmienia stawki w trwającym miesiącu, a raportu jeszcze nie ma → kopiujemy
  // ostatnią dostępną stawkę per budynek|medium. Dotyczy TYLKO advances (brak rekordów/cen/temp
  // dla tych miesięcy). Czyni build w pełni odtwarzalnym (koniec ręcznego dopisywania 2026-06).
  if(cfg.carryAdvanceTo){
    const extra=monthsBetween(cfg.to,cfg.carryAdvanceTo).slice(1); // miesiące ściśle po `to`
    for(const b of order) for(const med of ['CO','CWU']){
      let last=null;
      for(const mo of months){const k=`${b}|${med}|${mo.key}`;if(k in advances)last=advances[k];}
      if(last===null)continue; // brak jakiejkolwiek stawki (np. stare miesiące) → nie wymyślamy
      for(const mo of extra){const k=`${b}|${med}|${mo.key}`;if(!(k in advances))advances[k]=last;}
    }
  }

  // sort: źródło/budynek-major, miesiąc rosnąco, CO przed CWU; przenumerowanie id
  const medOrd={CO:0,CWU:1};
  records.sort((x,y)=>{
    if(x.building!==y.building)return order.indexOf(x.building)-order.indexOf(y.building);
    const xm=x.year*12+x.month, ym=y.year*12+y.month;
    if(xm!==ym)return xm-ym;
    return medOrd[x.medium]-medOrd[y.medium];
  });
  const recordsOut=records.map((r,i)=>({id:'r'+(i+1),building:r.building,medium:r.medium,year:r.year,month:r.month,gj:r.gj,qty:r.qty}));
  const sortObj=o=>Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]]));

  const lastY=parseYM(cfg.to).y;
  // Jednostka łączna w M04: węzły rozliczane WSPÓLNĄ stawką (kalkulator → Budynek = „Łącznie").
  // `mergedAdvances:true` w configu ustawia domyślny wybór M04 na sentinel P.MERGED ('__laczne__').
  // cfg.state.m04Building (jeśli podane) i tak ma pierwszeństwo (Object.assign niżej).
  const MERGED='__laczne__';
  const m04Default=cfg.mergedAdvances?MERGED:order[0];
  const out={
    app:'kalkulator-zaliczek', version:'1.0.0', savedAt:new Date().toISOString(),
    state:Object.assign({
      medium:'CO', building:order[0], asOfYear:lastY, asOfMonth:parseYM(cfg.to).m, horizon:'current',
      periodStartCO:1, periodStartCWU:1,
      m01Cols:order.slice(),
      m01From:{year:parseYM(cfg.from).y,month:parseYM(cfg.from).m},
      m01To:{year:lastY+1,month:12},
      m02Metric:'co_gj', m02Building:order[0], m02Method:'hdd', hddCity:'opole', m02HddP:80, cwuBasis:'intensity',
      m04Building:m04Default, m04View:'co'
    }, cfg.state||{}),
    records:recordsOut, prices:sortObj(prices), temps:sortObj(temps), advances:sortObj(advances),
    areas:Object.fromEntries(order.filter(b=>b in areas).map(b=>[b,areas[b]]))
  };
  return {out,issues,order};
}

/* ───────────────────────── WALIDACJA (regresja względem istniejącego JSON) ───────────────────────── */
function validate(out,old,oldLabel){
  if(!old){console.log('Walidacja pominięta (brak referencji '+oldLabel+')');return;}
  let diffs=0;const cmp=(l,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b)){if(diffs<40)console.log('  DIFF',l,'old=',a,'new=',b);diffs++;}};
  const common=Object.keys(out.areas).filter(b=>old.areas&&b in old.areas);
  for(const b of common)cmp('areas.'+b,old.areas[b],out.areas[b]);
  for(const k of Object.keys(old.prices||{}))cmp('price '+k,old.prices[k],out.prices[k]);
  for(const k of Object.keys(old.temps||{}))cmp('temp '+k,old.temps[k],out.temps[k]);
  for(const k of Object.keys(old.advances||{})){const b=k.split('|')[0];if(common.includes(b))cmp('adv '+k,old.advances[k],out.advances[k]);}
  const idx=m=>{const o={};for(const r of m)o[`${r.building}|${r.medium}|${r.year}|${r.month}`]=r;return o;};
  const ni=idx(out.records);
  for(const r of (old.records||[])){if(!common.includes(r.building))continue;const k=`${r.building}|${r.medium}|${r.year}|${r.month}`;const n=ni[k];if(!n){cmp('rec MISSING '+k,r,undefined);continue;}cmp('rec gj '+k,r.gj,n.gj);cmp('rec qty '+k,r.qty,n.qty);}
  console.log('Walidacja vs '+oldLabel+' (budynki: '+(common.join(', ')||'—')+'):',diffs===0?'✓ identyczne':('✗ '+diffs+' różnic'));
}

/* ───────────────────────── main ───────────────────────── */
function main(){
  const args=process.argv.slice(2);
  const checkOnly=args.includes('--check');
  const cfgArg=args.find(a=>!a.startsWith('--'));
  if(!cfgArg){
    const avail=fs.readdirSync(__dirname).filter(f=>/^config-.*\.js$/.test(f));
    console.log('⛔ Podaj config, np.:  node import/build-import.js config-ea1-n01-gr.js [--check]');
    console.log('Dostępne configi:'+(avail.length?'\n  '+avail.join('\n  '):' (brak — utwórz config-<węzeł>-<grupa>.js)'));
    process.exit(1);
  }
  // config szukany najpierw w import/ (sama nazwa), potem jako podana ścieżka
  const local=path.join(__dirname,cfgArg);
  const cfgPath=fs.existsSync(local)?local:path.resolve(cfgArg);
  const cfg=require(cfgPath);

  const hard=preflight(cfg);
  if(hard>0){console.log('\n⛔ Przerwano — popraw config i uruchom ponownie.');process.exit(1);}
  if(checkOnly){console.log('\n(--check) Preflight OK, plik NIE zapisany.');return;}

  // referencja do walidacji wczytana PRZED nadpisaniem (może wskazywać outFile → regresja vs poprzedni build)
  let refSnap=null, refLabel=null;
  if(cfg.validateAgainst){
    refLabel=path.basename(cfg.validateAgainst);
    const refPath=path.isAbsolute(cfg.validateAgainst)?cfg.validateAgainst:path.join(__dirname,cfg.validateAgainst);
    try{refSnap=JSON.parse(fs.readFileSync(refPath,'utf8'));}catch(e){refLabel+=' (brak/nieczytelny)';}
  }

  const {out,issues,order}=build(cfg);
  const outFile=path.isAbsolute(cfg.outFile)?cfg.outFile:path.join(__dirname,cfg.outFile);
  fs.writeFileSync(outFile,JSON.stringify(out,null,2),'utf8');

  console.log('\n═══ BUILD ═══');
  console.log('Zapisano:',outFile);
  console.log('budynki:',order.length,' records:',out.records.length,' prices:',Object.keys(out.prices).length,' temps:',Object.keys(out.temps).length,' advances:',Object.keys(out.advances).length);
  console.log('areas:',JSON.stringify(out.areas));
  const cov={};for(const r of out.records)(cov[r.building]=cov[r.building]||new Set()).add(r.year+'-'+r.month);
  for(const b of order)console.log('   ',b,'mies.:',cov[b]?cov[b].size:0);
  if(issues.length){console.log('\nPROBLEMY ('+issues.length+'):');issues.slice(0,30).forEach(s=>console.log('  -',s));if(issues.length>30)console.log('  … +'+(issues.length-30));}else console.log('\nBrak problemów.');
  if(cfg.validateAgainst){console.log();validate(out,refSnap,refLabel);}
}
if(require.main===module)main();
else module.exports={loadCells,anchors,r13Map,colLetter,findRowByLabel,reportPath,reportDir,monthsBetween};
