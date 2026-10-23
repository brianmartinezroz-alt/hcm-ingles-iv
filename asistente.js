/* ═══════════════════════════════════════════════════════════════════
   ASISTENTE DE VOZ · English For All / HCM
   Una esfera tipo Siri que vive en todas las pantallas. Se toca UNA vez
   y desde ahí la lección se maneja hablando: "siguiente", "repite",
   "más despacio", "qué significa", "la dos", "mi turno"...

   Se carga en el <head>, ANTES que la app, porque necesita enterarse
   de cuándo la app usa el micrófono o está hablando, para no pisarla.

   Reglas:
   · No se toca la lógica de la app: la esfera "aprieta" los mismos
     botones que el alumno ve. Si un botón cambia de nombre, se agrega
     un sinónimo aquí y listo.
   · Mientras la voz está activa, los botones secundarios se esconden
     (pantalla limpia). Al apagarla, todo vuelve a aparecer.
   · Idioma por nivel: Pre-A1 y A1 en español y despacio; A2 y B1 en
     español con comandos en inglés; B2 en adelante todo en inglés.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if(window.__ASISTENTE__) return; window.__ASISTENTE__=true;

var W=window, DOC=document;
var SR_ORIG=W.SpeechRecognition||W.webkitSpeechRecognition||null;
var LOG=function(){ try{ if(W.ASISTENTE_DEBUG) console.log.apply(console,['[voz]'].concat([].slice.call(arguments))); }catch(e){} };

/* ───────── 1. Enterarse de lo que hace la app ───────── */
var appMic=0;          // micrófonos de la app abiertos
var appHabla=0;        // audios / voces de la app sonando
var ultimoRuido=0;     // última vez que la app hizo algo con audio

function avisa(){ ultimoRuido=Date.now(); if(A&&A.activo){ if(appMic||appHabla) A.pausarEscucha(); else A.reanudarPronto(); } }

if(SR_ORIG){
  var Envuelto=function(){
    var r=new SR_ORIG();
    var start=r.start.bind(r), stop=r.stop.bind(r), abort=r.abort.bind(r);
    var vivo=false;
    function fin(){ if(vivo){ vivo=false; appMic=Math.max(0,appMic-1); avisa(); } }
    r.addEventListener('end',fin); r.addEventListener('error',fin);
    r.start=function(){
      if(r.__esfera){ return start(); }
      vivo=true; appMic++;
      // si la esfera estaba escuchando, se calla primero y se le da chance al navegador
      if(A&&A.escuchando){ A.soltarMic(); setTimeout(function(){ try{start();}catch(e){ fin(); } },350); }
      else { try{start();}catch(e){ fin(); throw e; } }
      avisa();
    };
    r.stop=function(){ try{stop();}catch(e){} };
    r.abort=function(){ try{abort();}catch(e){} };
    return r;
  };
  try{ W.SpeechRecognition=Envuelto; W.webkitSpeechRecognition=Envuelto; }catch(e){}
}

// voces del navegador
try{
  var speakOrig=W.speechSynthesis&&W.speechSynthesis.speak.bind(W.speechSynthesis);
  if(speakOrig){
    W.speechSynthesis.speak=function(u){
      if(!u.__esfera){
        appHabla++; avisa();
        var listo=false, termina=function(){ if(!listo){ listo=true; appHabla=Math.max(0,appHabla-1); avisa(); } };
        u.addEventListener('end',termina); u.addEventListener('error',termina);
        setTimeout(termina,Math.min(30000,2500+String(u.text||'').length*110/(u.rate||1)));
      }
      return speakOrig(u);
    };
  }
}catch(e){}

// audios (voz de Google, grabaciones, videos)
var sonando=new Set();
DOC.addEventListener('play',function(e){ var m=e.target; if(m&&m.__esfera)return; sonando.add(m); appHabla=sonando.size; avisa(); },true);
['pause','ended','error','emptied'].forEach(function(ev){
  DOC.addEventListener(ev,function(e){ if(sonando.delete(e.target)){ appHabla=sonando.size; avisa(); } },true);
});

/* ───────── 2. Nivel e idioma ───────── */
var NIVELES=['Pre-A1','A1','A2','B1','B2','C1','C2'];
function nivel(){
  try{ if(typeof W.nivelDelMapa==='function') return W.nivelDelMapa(); }catch(e){}
  try{ if(W.P&&W.P.nivel) return W.P.nivel; }catch(e){}
  try{ if(W.ASISTENTE_NIVEL) return W.ASISTENTE_NIVEL; }catch(e){}
  try{ var d=JSON.parse(localStorage.getItem('efa_tutor_v2')||'null'); if(d&&d.perfil&&d.perfil.nivel) return d.perfil.nivel; }catch(e){}
  return 'A1';
}
function nN(){ var i=NIVELES.indexOf(nivel()); return i<0?1:i; }
function modo(){            // cómo habla la esfera
  var n=nN();
  if(n<=1) return {lang:'es-MX', escucha:'es-MX', vel:0.9,  ingles:false};
  if(n<=3) return {lang:'es-MX', escucha:'es-MX', vel:1.0,  ingles:false};
  return        {lang:'en-US', escucha:'en-US', vel:1.0,  ingles:true};
}

/* ───────── 3. Comandos ─────────
   Cada comando: palabras que lo disparan (es + en) y qué botón aprieta.
   Los botones se buscan por su texto visible.                         */
function norm(t){ return String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9ñ\s']/g,' ').replace(/\s+/g,' ').trim(); }

var CMD=[
  {id:'siguiente', voz:/\b(siguiente|sigue|continua|continuar|adelante|listo|ya|empezar|empieza|vamos|next|continue|go on|ready|start|done|ok next)\b/,
     btn:/^(siguiente|continuar|empezar|comenzar|revisar|listo|seguir|abrir|entrar|vamos|next|continue|start)/},
  {id:'repite', voz:/\b(repite|repitelo|otra vez|de nuevo|escuchar|escucha|oir|oirla|repeat|again|listen|say it again|one more time)\b/,
     btn:/(escuchar|oirla|oir en ingles|repetir|^oir)/},
  {id:'lento', voz:/\b(mas (despacio|lento)|despacio|lento|slower|slow down|more slowly)\b/, accion:'lento'},
  {id:'normal', voz:/\b(velocidad normal|mas rapido|normal speed|faster)\b/, accion:'normal'},
  {id:'significa', voz:/\b(que significa|significado|en espanol|traduce|traduccion|que quiere decir|what does it mean|in spanish|translate)\b/,
     btn:/(que significa|oir en espanol|traduc)/},
  {id:'pista', voz:/\b(pista|no se|ayudame con esta|dame una pista|hint|i don'?t know|give me a hint)\b/, btn:/(pista|no se)/},
  {id:'saltar', voz:/\b(saltar|salta|saltala|paso|skip|pass|next one)\b/, btn:/^saltar/},
  {id:'turno', voz:/\b(mi turno|lo digo|quiero decirlo|voy|grabar|contestar|my turn|let me (say|try)|record)\b/,
     btn:/(decirlo en voz alta|tocar y decirlo|tocar y contestar|grabar|decirlo)/},
  {id:'otravez', voz:/\b(intentar otra vez|otra oportunidad|intentar de nuevo|try again)\b/, btn:/intentar otra vez/},
  {id:'mapa', voz:/\b(mapa|volver al mapa|regresar|volver|atras|back|go back|map)\b/, btn:/(volver al (camino|mapa)|^mapa|atras|volver)/},
  {id:'cerrar', voz:/\b(cerrar|cierra|close)\b/, btn:/^cerrar/},
  {id:'explica', voz:/\b(explicame|explicacion|ver el video|video|explain|explanation)\b/, accion:'video'},
  {id:'acento', voz:/\b(acento|accent)\b.*\b(britanico|ingles de inglaterra|inglaterra|british|uk|australiano|australia|australian|indio|india|indian|americano|estados unidos|american|us)\b/, accion:'acento'},
  {id:'botones', voz:/\b(muestra(me)? los botones|botones|show (the )?buttons)\b/, accion:'botones'},
  {id:'ayuda', voz:/\b(ayuda|que puedo decir|opciones|comandos|help|what can i say)\b/, accion:'ayuda'},
  {id:'pausa', voz:/\b(pausa|para|alto|silencio|callate|deja de escuchar|stop|pause|be quiet)\b/, accion:'pausa'}
];
var ORD={primera:1,primero:1,uno:1,una:1,'1':1,a:1,first:1,one:1,
         segunda:2,segundo:2,dos:2,'2':2,b:2,second:2,two:2,
         tercera:3,tercero:3,tres:3,'3':3,c:3,third:3,three:3,
         cuarta:4,cuarto:4,cuatro:4,'4':4,d:4,fourth:4,four:4};

/* ───────── 3b. Cerebro (Claude) para entender lo que sea ─────────
   Si la frase no es un comando corto, se le manda a Claude con lo que hay en
   pantalla, y él decide qué botón tocar o qué contestar. Si el servidor no
   tiene la acción "voz" todavía, simplemente no pasa nada raro.             */
var IA_URL=(function(){ try{ if(W.IA_ENDPOINT) return W.IA_ENDPOINT; }catch(e){}
  return 'https://script.google.com/macros/s/AKfycbxlAGlMVpdjqLZ_yh-Oh3934akKkfHojlGonjHKnUE3ZncdQRsT2bMzv0Elc0Ng4DK1Hw/exec'; })();
function textoPantalla(){
  var app=DOC.getElementById('app')||DOC.body;
  var t=(app.innerText||'').replace(/\s+\n/g,'\n').replace(/\n{2,}/g,'\n').trim();
  return t.slice(0,1500);
}
var PLATICA=[];   // lo último que se dijeron, para que entienda "¿y eso?" o "la otra"
function recuerda(dijo,r){
  var hizo=r.tipo==='responder'?('contestó: '+(r.decir||'')):(r.tipo+(r.indice!=null?' '+r.indice:'')+(r.cmd?' '+r.cmd:''));
  PLATICA.push('Alumno: "'+dijo+'" -> '+hizo); if(PLATICA.length>4) PLATICA.shift();
}
function preguntarCerebro(alts,cb){
  if(typeof alts==='string') alts=[alts];
  var ops=opciones(), bs=botones(true).filter(function(b){ return ops.indexOf(b)<0; });
  var dijo=alts[0]; var otras=alts.slice(1).filter(function(x){ return x&&x!==dijo; });
  if(otras.length) dijo+='"  (el celular también entendió: "'+otras.join('" / "')+'")';
  var pant=textoPantalla();
  if(PLATICA.length) pant='Lo último que platicaron:\n'+PLATICA.join('\n')+'\n\nEn pantalla:\n'+pant;
  var datos={dijo:dijo, nivel:nivel(), pantalla:pant.slice(0,1500),
    botones:bs.map(function(b){ return (b.innerText||b.getAttribute('aria-label')||'').trim().slice(0,60); }),
    opciones:ops.map(function(b){ return (b.innerText||'').trim().slice(0,80); }),
    leccion:tituloLeccion()};
  var listo=false, t=setTimeout(function(){ if(!listo){ listo=true; cb(null); } },12000);
  fetch(IA_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({accion:'voz',datos:datos})})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(j){ if(listo)return; listo=true; clearTimeout(t); cb(j&&j.ok?j.resultado:null, bs, ops); })
    .catch(function(){ if(listo)return; listo=true; clearTimeout(t); cb(null); });
}

/* ───────── 4. Botones visibles ───────── */
function visible(el){
  if(!el||el.disabled)return false;
  if(el.closest('#esfera-voz'))return false;
  var r=el.getBoundingClientRect();
  if(r.width<4||r.height<4)return false;
  var cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none')return false;
  return true;
}
/* tarjetas que se tocan aunque no sean botones (lecciones del mapa, paradas) */
var TARJ='a[href],[class*=parada],[class*=lecc],[class*=tarjeta],[class*=card]';
function tarjetas(){
  return [].slice.call(DOC.querySelectorAll(TARJ)).filter(function(e){
    if(e.closest('#esfera-voz')||e.closest('button')||e.querySelector('button')) return false;
    try{ if(getComputedStyle(e).cursor!=='pointer') return false; }catch(x){ return false; }
    var pa=e.parentElement&&e.parentElement.closest(TARJ);
    if(pa){ try{ if(getComputedStyle(pa).cursor==='pointer') return false; }catch(x){} }
    return visible(e);
  });
}
function botones(incluirOcultos){
  return [].slice.call(DOC.querySelectorAll('button,[role=button],a.btn')).concat(tarjetas()).filter(function(b,i,arr){
    if(arr.indexOf(b)!==i) return false;
    if(b.closest('#esfera-voz'))return false;
    if(incluirOcultos&&b.getAttribute('data-vz')==='sec'){ var r=b.parentElement&&b.parentElement.getBoundingClientRect(); return !!(r&&r.width); }
    return visible(b);
  });
}
function textoBtn(b){ return norm(b.getAttribute('aria-label')||b.innerText||b.textContent||''); }
function buscar(re){ var bs=botones(true); for(var i=0;i<bs.length;i++){ if(re.test(textoBtn(bs[i]))) return bs[i]; } return null; }
function opciones(){
  var o=[].slice.call(DOC.querySelectorAll('.opts .opt, .opts button, .opcs button, [data-opcion]')).filter(visible);
  return o;
}
function apretar(b){
  if(!b)return false;
  var oculto=b.getAttribute('data-vz')==='sec';
  if(oculto) b.removeAttribute('data-vz');
  try{ b.focus({preventScroll:true}); }catch(e){}
  b.classList.add('vz-tocado'); setTimeout(function(){ b.classList.remove('vz-tocado'); },500);
  b.click();
  if(oculto) setTimeout(function(){ marcarSecundarios(); },50);
  return true;
}

/* ───────── 5. Pantalla limpia ───────── */
var SECUNDARIOS=/(mas lento|que significa|saltar esta|no se . dame la pista|oir en espanol|^escuchar$|^oirla$)/;
function marcarSecundarios(){
  if(!A||!A.activo||A.mostrarTodo) return;
  botones(false).forEach(function(b){ if(SECUNDARIOS.test(textoBtn(b))) b.setAttribute('data-vz','sec'); });
}
function desmarcar(){ [].slice.call(DOC.querySelectorAll('[data-vz=sec]')).forEach(function(b){ b.removeAttribute('data-vz'); }); }

/* ───────── 6. La esfera ───────── */
var A={
  activo:false, escuchando:false, pausada:false, mostrarTodo:false,
  rec:null, ultimoTexto:'', silencioDesde:0, timer:null,

  encender:function(){
    if(!SR_ORIG){ this.decir(modo().ingles?'Voice control does not work in this browser. Try Chrome or Safari.':'En este navegador no funciona la voz. Prueba con Chrome o Safari.'); return; }
    this.activo=true; this.pausada=false; this.silencioDesde=Date.now();
    DOC.body.classList.add('voz-on'); pintar('escuchando');
    marcarSecundarios();
    var m=modo();
    var hola=m.ingles?'I\'m listening. Say "next", "repeat", "slower" or "help".'
      : (nN()<=1?'Te escucho. Di "siguiente", "repite", "más despacio" o "ayuda".'
               :'Te escucho. Puedes decir "siguiente", "repite", "qué significa" o "ayuda".');
    this.decir(hola,function(){ A.escuchar(); });
  },
  apagar:function(silencioso){
    this.activo=false; this.soltarMic(); desmarcar();
    DOC.body.classList.remove('voz-on'); pintar('apagada');
    if(!silencioso) this.decir(modo().ingles?'Voice off.':'Listo, apago la voz.');
  },
  soltarMic:function(){ this.escuchando=false; clearTimeout(this.timer); if(this.rec){ try{this.rec.__muerto=true; this.rec.abort();}catch(e){} this.rec=null; } },
  pausarEscucha:function(){ if(this.escuchando) this.soltarMic(); if(!this.hablandoYo) pintar('esperando'); },
  reanudarPronto:function(){
    clearTimeout(this.timer);
    this.timer=setTimeout(function(){ if(A.activo&&!appMic&&!appHabla&&!A.hablandoYo) A.escuchar(); },700);
  },
  escuchar:function(){
    if(!this.activo||this.escuchando||appMic||appHabla||this.hablandoYo) return;
    // 3 minutos sin decir nada: se apaga sola para no gastar batería
    if(Date.now()-this.silencioDesde>180000){ this.apagar(); return; }
    var r=new SR_ORIG(); r.__esfera=true;
    r.lang=modo().escucha; r.continuous=true; r.interimResults=false; r.maxAlternatives=3;
    r.onresult=function(ev){
      for(var i=ev.resultIndex;i<ev.results.length;i++){
        if(!ev.results[i].isFinal) continue;
        var alts=[]; for(var j=0;j<ev.results[i].length;j++) alts.push(ev.results[i][j].transcript);
        A.silencioDesde=Date.now();
        A.entender(alts);
      }
    };
    r.onerror=function(ev){ LOG('error',ev.error); if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){ A.apagar(true); A.decir(modo().ingles?'I need microphone permission.':'Necesito permiso para usar el micrófono.'); } };
    r.onend=function(){ if(r.__muerto) return; A.escuchando=false; A.rec=null; if(A.activo) A.reanudarPronto(); };
    try{ r.start(); this.rec=r; this.escuchando=true; pintar('escuchando'); }catch(e){ LOG('start',e); this.reanudarPronto(); }
  },

  /* habla la esfera (voz corta, aparte de la de la app) */
  decir:function(t,cb){
    var m=modo(); this.soltarMic(); this.hablandoYo=true; pintar('hablando'); mostrarBurbuja(t);
    var hecho=false;
    var fin=function(){ if(hecho)return; hecho=true; A.hablandoYo=false; pintar(A.activo?'esperando':'apagada'); cb&&cb(); if(A.activo&&!cb) A.reanudarPronto(); };
    try{
      speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(t); u.__esfera=true; u.lang=m.lang; u.rate=m.vel;
      var vs=speechSynthesis.getVoices().filter(function(v){ return v.lang&&v.lang.toLowerCase().indexOf(m.lang.slice(0,2))===0; });
      var pref=vs.find(function(v){ return /es-MX|es-US/i.test(v.lang); })||vs.find(function(v){ return /Google|Paulina|Samantha|Monica/i.test(v.name); })||vs[0];
      if(pref) u.voice=pref;
      u.onend=fin; u.onerror=fin; speechSynthesis.speak(u);
      setTimeout(function(){ if(A.hablandoYo) fin(); }, 1500+t.length*90);
    }catch(e){ fin(); }
  },

  /* qué quiso decir: TODO va a Claude, salvo lo instantáneo */
  entender:function(alts){
    var t=norm(alts[0]); LOG('oí',alts);
    if(!t) return;
    mostrarBurbuja('“'+alts[0]+'”', true);
    if(this.rapido(alts)) return;           // "siguiente", "pausa", "la dos", o la opción tal cual
    this.pensar(alts);
  },
  /* respuestas al instante, sin esperar al cerebro */
  rapido:function(alts){
    var t=norm(alts[0]), n=t.split(' ').length, ops=opciones();
    if(ops.length){
      var m=t.match(/^(?:la|el|opcion|option|number|numero|letra)?\s*(primera|primero|segunda|segundo|tercera|tercero|cuarta|cuarto|uno|una|dos|tres|cuatro|first|second|third|fourth|one|two|three|four|[1-4]|[abcd])$/);
      if(m&&ORD[m[1]]&&ops[ORD[m[1]]-1]){ apretar(ops[ORD[m[1]]-1]); return true; }
      for(var a=0;a<alts.length;a++){
        var ta=norm(alts[a]);
        for(var k=0;k<ops.length;k++){ if(parecido(ta,textoBtn(ops[k]))>=0.9){ apretar(ops[k]); return true; } }
      }
    }
    // solo si la frase ES el comando ("siguiente", "más despacio"); "para qué" o "ya no" van al cerebro
    if(n<=3&&/^(siguiente|sigue|la que sigue|next|continua|continuar|listo|repite|repitelo|otra vez|escuchar|repeat|again|mas despacio|mas lento|despacio|slower|velocidad normal|que significa|en espanol|pausa|alto|stop|pause|ayuda|help|saltar|salta|saltala|skip|mi turno|my turn|dame una pista|pista|volver al mapa|mapa|cerrar)$/.test(t)){
      for(var i=0;i<CMD.length;i++){ if(CMD[i].voz.test(t)) return this.comando(CMD[i],t); }
    }
    return false;
  },
  comando:function(c,t){
    if(c.accion){ this.hacer(c.accion,t); return true; }
    var b=buscar(c.btn);
    if(b){ apretar(b); return true; }
    if(c.id==='turno'){ this.decir(modo().ingles?'Tap the microphone to answer.':'Toca el micrófono para contestar.'); return true; }
    this.decir(modo().ingles?'That is not on this screen.':'Eso no está en esta pantalla. Di "ayuda" para ver qué puedes hacer.');
    return true;
  },
  /* respaldo con palabras clave, solo si el cerebro no contesta */
  respaldo:function(alts){
    var t=norm(alts[0]), ops=opciones();
    for(var a=0;a<alts.length&&ops.length;a++){
      var ta=norm(alts[a]), mejor=null, pm=0;
      ops.forEach(function(o){ var p=parecido(ta,textoBtn(o)); if(p>pm){pm=p;mejor=o;} });
      if(mejor&&pm>=0.72){ apretar(mejor); return true; }
    }
    if(t.split(' ').length<=10){ for(var i=0;i<CMD.length;i++){ if(CMD[i].voz.test(t)) return this.comando(CMD[i],t); } }
    return false;
  },
  pensar:function(alts){
    var ing=modo().ingles, dijo=alts[0]; pintar('pensando');
    preguntarCerebro(alts,function(r,bs,ops){
      if(!A.activo) return;
      if(!r){ if(A.respaldo(alts)) return; return A.decir(ing?'Sorry, I didn\'t get that. Can you say it again?':'Perdón, no te entendí. ¿Me lo repites?'); }
      recuerda(dijo, r);
      if(r.tipo==='opcion'&&ops&&ops[r.indice]){
        // solo si de verdad dijo esa opción: la esfera nunca contesta por el alumno
        if(!alts.some(function(x){ return dijoLaOpcion(x,textoBtn(ops[r.indice])); })){
          if(/\b(sigue|siguiente|pasale|pasa|pasar|ya me la se|ya la se|next|continua|adelante|otra)\b/.test(norm(dijo))){ var sb=buscar(CMD[0].btn); if(sb){ apretar(sb); return; } }
          return A.decir(ing?'Which answer do you choose? Say it, or say "number two".':'¿Cuál respuesta escoges? Dímela, o di "la uno", "la dos".');
        }
        apretar(ops[r.indice]); if(r.decir) A.decir(r.decir); return;
      }
      if(r.tipo==='boton'&&bs&&bs[r.indice]){ if(r.decir) A.decir(r.decir,function(){ apretar(bs[r.indice]); A.reanudarPronto(); }); else apretar(bs[r.indice]); return; }
      if(r.tipo==='comando'&&r.cmd){ var c=String(r.cmd); if(/^acento/.test(c)) return A.hacer('acento',c.replace('acento:','acento ')); return A.hacer(c, c); }
      if(r.decir) return A.decir(r.decir);
      A.reanudarPronto();
    });
  },

  hacer:function(acc,t){
    var ing=modo().ingles;
    if(acc==='pausa'){ return this.apagar(); }
    if(acc==='ayuda'){
      var bs=botones(true).map(textoBtn).filter(Boolean);
      var hay=[];
      if(bs.some(function(x){return CMD[0].btn.test(x);})) hay.push(ing?'"next"':'"siguiente"');
      if(bs.some(function(x){return CMD[1].btn.test(x);})) hay.push(ing?'"repeat"':'"repite"');
      if(bs.some(function(x){return /mas lento/.test(x);})) hay.push(ing?'"slower"':'"más despacio"');
      if(bs.some(function(x){return CMD[4].btn.test(x);})) hay.push(ing?'"in Spanish"':'"qué significa"');
      if(bs.some(function(x){return CMD[7].btn.test(x);})) hay.push(ing?'"my turn"':'"mi turno"');
      if(opciones().length) hay.push(ing?'the answer, or "number two"':'la respuesta, o "la dos"');
      hay.push(ing?'"pause"':'"pausa"');
      return this.decir((ing?'You can say: ':'Aquí puedes decir: ')+hay.join(', ')+'.');
    }
    if(acc==='lento'){
      try{ W.VEL_AUDIO=0.85; }catch(e){}
      var b=buscar(/mas lento/); if(b) return apretar(b);
      return this.decir(ing?'OK, slower from now on.':'Va, de aquí en adelante más despacio.');
    }
    if(acc==='normal'){ try{ W.VEL_AUDIO=1; }catch(e){} return this.decir(ing?'Normal speed.':'Velocidad normal.'); }
    if(acc==='botones'){ this.mostrarTodo=!this.mostrarTodo; if(this.mostrarTodo) desmarcar(); else marcarSecundarios(); return this.decir(this.mostrarTodo?(ing?'Showing all buttons.':'Te muestro todos los botones.'):(ing?'Clean screen.':'Pantalla limpia.')); }
    if(acc==='acento'){
      var id=/brit|inglat|\buk\b/.test(t)?'uk':/austral|\bau\b/.test(t)?'au':/indi|\bin\b/.test(t)?'in':'us';
      var nom={us:'Estados Unidos',uk:'Inglaterra',au:'Australia',in:'India'}[id];
      try{ if('PAQUETE_ACTIVO' in W){ W.PAQUETE_ACTIVO='audio-'+id; if(typeof W.armarRutas==='function') W.armarRutas(); } }catch(e){}
      try{ if(typeof W.ASISTENTE_ACENTO==='function') W.ASISTENTE_ACENTO(id); }catch(e){}
      return this.decir(ing?'Accent changed: '+nom+'.':'Listo, acento de '+nom+'.');
    }
    if(acc==='video'){
      var v=videoDeAqui();
      if(v) return abrirVideo(v);
      return this.decir(ing?'There is no video for this lesson yet.':'Esta lección todavía no tiene video.');
    }
  }
};
W.ASISTENTE=A;

/* ¿el alumno dijo esa opción (sus palabras, o "la dos", "la B")? */
function dijoLaOpcion(dijo,op){
  var d=norm(dijo);
  if(/\b(primera|primero|segunda|segundo|tercera|tercero|cuarta|cuarto|first|second|third|fourth|medio|enmedio|ultima|ultimo|arriba|abajo|middle|last|top|bottom)\b/.test(d)) return true;
  if(/\b(la|el|opcion|option|number|numero|letra)\s+(uno|una|dos|tres|cuatro|one|two|three|four|[1-4]|[abcd])\b/.test(d)) return true;
  var ws=norm(op).split(' ').filter(function(w){ return w.length>2; });
  if(!ws.length) return parecido(d,norm(op))>=0.6;
  var hay=ws.filter(function(w){ return (' '+d+' ').indexOf(' '+w+' ')>=0; }).length;
  return hay/ws.length>=0.6;
}
/* parecido entre lo que dijo y una opción (0 a 1) */
function parecido(a,b){
  if(!a||!b)return 0; if(a===b)return 1;
  if(b.length>3&&a.indexOf(b)>=0)return 0.95;
  var A1=a.split(' '),B1=b.split(' ');
  var comunes=B1.filter(function(w){return A1.indexOf(w)>=0;}).length;
  var porPalabras=comunes/Math.max(B1.length,1);
  var d=lev(a,b), porLetras=1-d/Math.max(a.length,b.length);
  return Math.max(porPalabras*0.9,porLetras);
}
function lev(a,b){ var m=a.length,n=b.length; if(!m)return n; if(!n)return m; var p=[],i,j; for(j=0;j<=n;j++)p[j]=j; for(i=1;i<=m;i++){ var prev=p[0]; p[0]=i; for(j=1;j<=n;j++){ var t=p[j]; p[j]=Math.min(p[j]+1,p[j-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=t; } } return p[n]; }

/* ───────── 7. Videos de explicación ─────────
   Se buscan en videos/indice.json: { "Título de la lección": "videos/archivo.mp4", ... }
   La app también puede dar su propio buscador: window.ASISTENTE_VIDEO = function(){ return url }  */
var INDICE=null;
fetch('videos/indice.json',{cache:'no-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(j){INDICE=j;}).catch(function(){});
function tituloLeccion(){
  try{ var S=W.MAT&&W.MAT[W.sIdx]; if(S&&S.t) return S.t; }catch(e){}
  try{ if(typeof W.ASISTENTE_LECCION==='function') return W.ASISTENTE_LECCION(); }catch(e){}
  return '';
}
function videoDeAqui(){
  try{ if(typeof W.ASISTENTE_VIDEO==='function'){ var u=W.ASISTENTE_VIDEO(); if(u) return u; } }catch(e){}
  var t=tituloLeccion(); if(!t||!INDICE) return null;
  var k=nivel()+' · '+t;
  return INDICE[k]||INDICE[t]||null;
}
W.ASISTENTE_ABRIR_VIDEO=function(u){ abrirVideo(u); };
function abrirVideo(url){
  var caja=DOC.getElementById('vz-video'); if(caja) caja.remove();
  caja=DOC.createElement('div'); caja.id='vz-video';
  caja.innerHTML='<video playsinline controls preload="auto"></video><button class="vz-x" aria-label="Cerrar video">✕</button>';
  DOC.body.appendChild(caja);
  var v=caja.querySelector('video'); v.src=url;
  caja.querySelector('.vz-x').onclick=function(){ v.pause(); caja.remove(); };
  v.play().catch(function(){});
  // mientras el video está abierto, los comandos lo controlan
  VIDEO=v;
}
var VIDEO=null;
var CMD_VIDEO=[
  {voz:/\b(pausa|para|alto|stop|pause)\b/, f:function(v){ v.pause(); }},
  {voz:/\b(sigue|continua|play|reanuda|dale|go on|resume)\b/, f:function(v){ v.play(); }},
  {voz:/\b(repite|otra vez|atras|regresa|again|back|rewind)\b/, f:function(v){ v.currentTime=Math.max(0,v.currentTime-10); v.play(); }},
  {voz:/\b(mas despacio|despacio|lento|slower)\b/, f:function(v){ v.playbackRate=0.8; v.play(); }},
  {voz:/\b(normal|mas rapido|faster)\b/, f:function(v){ v.playbackRate=1; v.play(); }},
  {voz:/\b(cerrar|cierra|ya entendi|listo|siguiente|close|got it|next)\b/, f:function(v){ v.pause(); var c=DOC.getElementById('vz-video'); if(c)c.remove(); VIDEO=null; }}
];
var entenderBase=A.entender.bind(A);
A.entender=function(alts){
  if(VIDEO&&DOC.getElementById('vz-video')){
    var t=norm(alts[0]);
    for(var i=0;i<CMD_VIDEO.length;i++){ if(CMD_VIDEO[i].voz.test(t)){ CMD_VIDEO[i].f(VIDEO); return; } }
  }
  entenderBase(alts);
};

/* ───────── 8. Dibujo ───────── */
var CSS=''+
'#esfera-voz{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;font-family:inherit}'+
'#esfera-voz .vz-bola{pointer-events:auto;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;position:relative;'+
  'background:radial-gradient(circle at 35% 30%,#fff7d6 0,#E8C063 28%,#C9A24B 55%,#6b4f17 100%);box-shadow:0 8px 24px rgba(0,0,0,.35),inset 0 -6px 14px rgba(0,0,0,.25);transition:transform .2s}'+
'#esfera-voz .vz-bola:active{transform:scale(.94)}'+
'#esfera-voz .vz-bola::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(232,192,99,.0);transition:border-color .3s}'+
'#esfera-voz[data-e=escuchando] .vz-bola::after{border-color:rgba(232,192,99,.8);animation:vzPulso 1.6s ease-out infinite}'+
'#esfera-voz[data-e=hablando] .vz-bola{animation:vzHabla .5s ease-in-out infinite alternate}'+
'#esfera-voz[data-e=esperando] .vz-bola{filter:saturate(.6) brightness(.9)}'+
'#esfera-voz[data-e=pensando] .vz-bola{animation:vzPiensa 1s linear infinite}'+
'@keyframes vzPiensa{0%{filter:hue-rotate(0)}50%{filter:brightness(1.25)}100%{filter:hue-rotate(0)}}'+
'#esfera-voz[data-e=apagada] .vz-bola{filter:grayscale(.35) brightness(.95)}'+
'#esfera-voz .vz-ico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#15140F}'+
'#esfera-voz .vz-burb{pointer-events:none;max-width:min(78vw,340px);background:rgba(21,20,15,.92);color:#F4EEDF;border-radius:16px;padding:10px 14px;font-size:15px;line-height:1.35;'+
  'box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s}'+
'#esfera-voz .vz-burb.ver{opacity:1;transform:none}'+
'#esfera-voz .vz-burb.oido{background:rgba(232,192,99,.95);color:#15140F;font-style:italic}'+
'@keyframes vzPulso{0%{transform:scale(1);opacity:1}100%{transform:scale(1.5);opacity:0}}'+
'@keyframes vzHabla{from{transform:scale(1)}to{transform:scale(1.08)}}'+
'body.voz-on [data-vz=sec]{display:none!important}'+
'.vz-tocado{outline:3px solid #E8C063!important;outline-offset:2px}'+
'#vz-video{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center}'+
'#vz-video video{max-width:100%;max-height:100%;width:auto;height:100%;aspect-ratio:9/16;background:#000}'+
'#vz-video .vz-x{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));right:14px;width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font-size:20px}'+
'@media (prefers-reduced-motion:reduce){#esfera-voz .vz-bola,#esfera-voz .vz-bola::after{animation:none!important}}';

var CAJA=null, BURB=null, tBurb=null;
function pintar(estado){ if(CAJA) CAJA.setAttribute('data-e',estado); }
function mostrarBurbuja(t,oido){
  if(!BURB) return;
  BURB.textContent=t; BURB.classList.toggle('oido',!!oido); BURB.classList.add('ver');
  clearTimeout(tBurb); tBurb=setTimeout(function(){ BURB.classList.remove('ver'); }, oido?1800:4200);
}
var MIC='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
function montar(){
  if(DOC.getElementById('esfera-voz')) return;
  var st=DOC.createElement('style'); st.textContent=CSS; DOC.head.appendChild(st);
  CAJA=DOC.createElement('div'); CAJA.id='esfera-voz'; CAJA.setAttribute('data-e','apagada');
  CAJA.innerHTML='<div class="vz-burb" role="status" aria-live="polite"></div><button class="vz-bola" aria-label="Controlar con la voz"><span class="vz-ico">'+MIC+'</span></button>';
  DOC.body.appendChild(CAJA);
  BURB=CAJA.querySelector('.vz-burb');
  CAJA.querySelector('.vz-bola').addEventListener('click',function(){ if(A.activo) A.apagar(); else A.encender(); });
  // cada vez que la app cambia de pantalla, se limpia de nuevo
  var obs=new MutationObserver(function(){ if(A.activo){ clearTimeout(obs.t); obs.t=setTimeout(marcarSecundarios,60); } });
  obs.observe(DOC.body,{childList:true,subtree:true});
  try{ speechSynthesis.getVoices(); }catch(e){}
}
if(DOC.readyState==='loading') DOC.addEventListener('DOMContentLoaded',montar); else montar();
})();
