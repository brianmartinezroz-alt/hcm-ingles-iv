/* Saca de la app todas las frases en inglés que la app puede decir en voz
   alta, con la misma llave que usa la app para buscar su audio. */
const fs=require('fs');
const s=fs.readFileSync('/home/claude/hcm/clave/index.html','utf8');
function clave(t){ return String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function fnv(t){ let h=0x811c9dc5; t=String(t); for(let i=0;i<t.length;i++){ h^=t.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return ('0000000'+h.toString(16)).slice(-8); }
function bloque(ini, fin, desde){ const i=s.indexOf(ini, desde||0); if(i<0) throw new Error('no hallé '+ini); const j=s.indexOf(fin,i); return s.slice(i,j+fin.length); }
const NOM_F=('sarah maria maría ana laura karen lucia lucía sofia sofía elena julia rosa carmen diana patricia claudia veronica verónica alejandra gabriela mariana andrea paola daniela fernanda emily emma olivia sophia isabella mia charlotte amelia harper evelyn abigail lisa mary jennifer linda susan jessica karla brenda mónica monica silvia norma leticia guadalupe alma').split(' ');
const NOM_M=('carlos juan jose josé luis miguel jorge pedro antonio manuel francisco javier ricardo roberto fernando alberto raul raúl sergio hector héctor arturo eduardo martin martín pablo james john robert michael william david richard joseph thomas charles daniel matthew mark paul steven andrew kevin brian george edward samuel oscar óscar rafael victor víctor').split(' ');
function sexo(t){
  const x=' '+String(t).toLowerCase().replace(/[^a-záéíóúñ ]/g,' ')+' ';
  if(/ (she|her|hers|ms|mrs|miss|ella|señora|señorita|sra) /.test(x)) return 'f';
  if(/ (he|him|his|mr|sir|el señor|señor|sr) /.test(x)) return 'm';
  for(const n of NOM_F) if(x.indexOf(' '+n+' ')>=0) return 'f';
  for(const n of NOM_M) if(x.indexOf(' '+n+' ')>=0) return 'm';
  let n=0; for(let k=0;k<x.length;k++) n+=x.charCodeAt(k); return n%2===0?'f':'m';
}
const out=new Map();
function mete(t, por){
  if(t===undefined||t===null) return;
  t=String(t).replace(/\s+/g,' ').trim();
  if(t.length<2 || t.length>700) return;
  if(!/[a-zA-Z]{2}/.test(t)) return;
  if(/[áéíóúñ¿¡]/i.test(t)) return;                 // español: lo dice el teléfono
  if(/[<>{}=;]|function|var |___|\$\{/.test(t)) return;
  const k=clave(t); if(!k) return;
  const h=fnv(k);
  if(!out.has(h)) out.set(h,{h:h,t:t,s:sexo(t),por:por});
}
function meteEs(t, por){
  if(t===undefined||t===null) return;
  t=String(t).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(t.length<3 || t.length>600) return;
  if(!/^X/.test(por) && /[<>{}=;]|function|var |\$\{/.test(t)) return;   // los del estudio sí llevan ';'
  if(!/[a-záéíóúñ]{3}/i.test(t)) return;
  const k=clave(t); if(!k) return;
  const h=fnv(k);
  if(!out.has(h)) out.set(h,{h:h,t:t,s:'m',es:1,por:por});
}
/* 1 · el material del curso, evaluado tal cual */
const lec=bloque('var LECCIONES_HCM=[null,','\n];');
const mi=s.indexOf('var MATERIAL_HCM = {'), mj=s.indexOf('\n};',mi);
const mat=s.slice(mi,mj+3);
const banco=bloque('  var BANCO={','\n  };');
const prod=bloque('  var PROD_PPP={','\n  };');
const exi=s.indexOf('  var EX = {'), exj=s.indexOf('  EX[19] = {', exi);
const ex=s.slice(exi,exj);
const helpers="function H(antes,despues,es,ops,bien){return {k:'hueco',antes:antes,despues:despues,es:es,ops:ops,bien:bien};}"+
 "function O(q,es,ops,bien){return {k:'opcion',q:q,es:es,ops:ops,bien:bien};}"+
 "function C(frase,mala,buena,es){return {k:'cazar',frase:frase,mala:mala,buena:buena,es:es};}"+
 "function R(piezas,es){return {k:'ordenar',piezas:piezas,es:es};}";
const D=(new Function(lec+'\n'+mat+'\n'+helpers+'\n'+banco+'\n'+prod+'\n'+ex+'\nreturn {L:LECCIONES_HCM,M:MATERIAL_HCM,B:BANCO,P:PROD_PPP,EX:EX};'))();
function item(x, por){
  if(!x) return;
  ['en','audio','q','origen','meta','frase','texto'].forEach(f=>mete(x[f],por+'.'+f));
  if(x.k==='regla'){ mete(x.bien,por+'.bien'); mete(x.mal,por+'.mal'); }
  if(x.k==='hueco' && x.bien!==undefined){
    const b = (typeof x.bien==='string') ? x.bien : (x.ops||[])[x.correcta||0];
    mete((x.antes||'')+' '+b+' '+(x.despues||''), por+'.hueco');
    mete((x.antes||'')+b+(x.despues||''), por+'.hueco2');
  }
  if(x.k==='hueco' && typeof x.correcta==='number'){
    const b=(x.ops||[])[x.correcta]; mete((x.antes||'')+' '+b+' '+(x.despues||''), por+'.hueco');
  }
  if(x.k==='opcion') mete(x.bien, por+'.bien');
  if(x.k==='ordenar') mete((x.piezas||[]).join(' '), por+'.ordenar');
  if(x.k==='dosc'){ mete(x.a,por+'.a'); mete(x.b,por+'.b'); }
  if(x.k==='idea'||x.k==='detalle') mete(x.audio,por+'.audio');
}
Object.keys(D.M).forEach(n=>D.M[n].forEach((x,i)=>item(x,'L'+n+'.'+i)));
Object.keys(D.B).forEach(n=>D.B[n].forEach((x,i)=>item(x,'B'+n+'.'+i)));
Object.keys(D.P).forEach(n=>mete(D.P[n].q,'P'+n));
mete("Good morning. What would you like to do today?",'P');
mete("Tell me about your work and your week. Three or four sentences.",'Pex');
Object.keys(D.EX).forEach(n=>['A','B','C'].forEach(v=>(D.EX[n][v]||[]).forEach((x,i)=>{
  const por='E'+n+v+i;
  if(x.t==='lectura'){ mete(x.texto,por+'.texto'); x.preg.forEach((p,k)=>mete(p.ops[p.bien],por+'.r'+k)); }
  else { mete(x.audio,por+'.audio'); if(x.t!=='oir') mete(x.ops[x.bien],por+'.bien'); }
})));
/* 2 · barrido general: lo demás que la app tiene en inglés (calentamientos,
       frases de otras secciones) */
const campos=/\b(en|audio|q|origen|meta|frase|texto)\s*:\s*(["'])((?:\\.|(?!\2).){2,600}?)\2/g;
let m; while((m=campos.exec(s))){ let v=m[3].replace(/\\'/g,"'").replace(/\\"/g,'"'); if(/ /.test(v)) mete(v,'barrido'); }
/* 3 · ejercicios de boca (agregarBoca): lectura de corrido = las primeras
       frases modelo unidas; ritmo = una frase modelo; trabalenguas = TRABAS */
const tb=bloque('var TRABAS=[','\n];');
const TRABAS=(new Function(tb+'\nreturn TRABAS;'))();
TRABAS.forEach((t,i)=>mete(t,'traba'+i));
Object.keys(D.M).forEach(n=>{
  const mods=D.M[n].filter(x=>x&&x.k==='model'&&x.en).map(x=>String(x.en));
  for(let i=0;i<mods.length;i++){
    mete(mods[i],'boca'+n+'.1');
    if(i+1<mods.length) mete(mods.slice(i,i+2).join(' '),'boca'+n+'.2');
    if(i+2<mods.length) mete(mods.slice(i,i+3).join(' '),'boca'+n+'.3');
  }
});
/* 4 · las instrucciones en español que la app dice en voz alta (solo las
       genera la voz de Google; Chatterbox no habla español) */
function itemEs(x, por){
  if(!x) return;
  if(x.es) meteEs(x.es, por+'.es');
  if(x.ctx) meteEs(x.ctx, por+'.ctx');
  if(x.sig) meteEs(x.sig, por+'.sig');
  if(x.k==='regla') meteEs((x.regla||'')+' '+(x.porque||''), por+'.regla');
}
Object.keys(D.M).forEach(n=>D.M[n].forEach((x,i)=>itemEs(x,'S'+n+'.'+i)));
Object.keys(D.B).forEach(n=>D.B[n].forEach((x,i)=>itemEs(x,'S'+n+'.b'+i)));
/* 5 · el "¿por qué?" y la pista de cada pregunta del estudio (se oyen al
       contestar, al instante, sin gastar la voz en vivo) */
Object.keys(D.EX).forEach(n=>['A','B','C'].forEach(v=>(D.EX[n][v]||[]).forEach((x,i)=>{
  const por='X'+n+v+i;
  if(x.t==='lectura') x.preg.forEach((p,k)=>{ meteEs(p.porque,por+'.p'+k+'.porque'); meteEs(p.pista,por+'.p'+k+'.pista'); });
  else { meteEs(x.porque,por+'.porque'); meteEs(x.pista,por+'.pista'); }
})));
const lit=/say\('((?:\\'|[^'])+)',\s*'es-MX'\)/g;
let mm; while((mm=lit.exec(s))){ meteEs(mm[1].replace(/\\'/g,"'"),'Slit'); }
['Muy bien.','Casi. Escúchala otra vez y repítela sin prisa.','Bien.','Está bien, lo anoto.','Pasaste. Buen trabajo.','Todavía no, pero ya casi. Lo repasamos.'].forEach(t=>meteEs(t,'Slit'));
const lista=[...out.values()];
fs.writeFileSync('/home/claude/hcm/voces/frases.json', JSON.stringify(lista));
const chars=lista.reduce((a,x)=>a+x.t.length,0);
console.log('frases:',lista.length,'| en español:',lista.filter(x=>x.es).length,lista.filter(x=>x.es).reduce((a,x)=>a+x.t.length,0),'chars','| caracteres:',chars,'| m/f:',lista.filter(x=>x.s==='m').length+'/'+lista.filter(x=>x.s==='f').length);
console.log('ejemplos:'); lista.slice(0,4).concat(lista.slice(-3)).forEach(x=>console.log('  ',x.h,x.s,x.t.slice(0,70)));
