/* ═══ LISTA DE NOVEDADES · Inglés IV HCM ═══
   La más nueva va hasta arriba. donde: 'app' = la app (index.html),
   'clase' = la clase por voz (clase.html). Cada id se ve una sola vez. */
var NOVEDADES=[
  {id:'2026-10-29-microfono', fecha:'29 oct', donde:['clase'], titulo:'Micrófono nuevo',
   puntos:[['🎙️','EFA te deja terminar de hablar. Puedes hacer pausas para pensar.'],
           ['⏹️','Toca <b>Ya terminé</b> cuando acabes, o toca la burbuja.'],
           ['⚙️','Arriba a la izquierda eliges: micrófono <b>automático</b> o <b>con botón</b>.'],
           ['✍️','Tus errores se marcan al final, sin interrumpirte.']]}
];
/* ═══════════════ Novedades ═══════════════
   Cada vez que se publica algo nuevo se agrega una entrada arriba de la
   lista. A cada alumno le aparece UNA vez, en una ventana flotante con X.
   Se cierra con la X, con "Entendido", tocando afuera, con Esc, o por voz
   ("cerrar", "entendido": la esfera ya sabe apretar esos botones).
   Cada página dice quién es con data-donde en su <script>.
   Si alguien entra por primera vez en su vida no le sale nada: no hay
   "novedades" para quien apenas llega. */
(function(){
  var S=document.currentScript, DONDE=(S&&S.getAttribute('data-donde'))||'app';
  var LISTA=(window.NOVEDADES||[]).filter(function(n){ return !n.donde||n.donde.indexOf(DONDE)>=0; });
  var KEY='novedades_vistas_'+DONDE;
  function leer(){ try{ var x=localStorage.getItem(KEY); return x===null?null:JSON.parse(x); }catch(e){ return []; } }
  function guardar(ids){ try{ localStorage.setItem(KEY,JSON.stringify(ids)); }catch(e){} }
  var vistas=leer();
  if(vistas===null){
    var nuevo=true; try{ nuevo=localStorage.length===0; }catch(e){}
    if(nuevo){ guardar(LISTA.map(function(n){ return n.id; })); return; }   // primera vez: nada que avisar
    vistas=[];
  }
  var pend=LISTA.filter(function(n){ return vistas.indexOf(n.id)<0; }).slice(0,3);
  window.NOVEDADES_ABRIR=function(){ mostrar(LISTA.slice(0,1)); };
  if(!pend.length) return;

  var css='.nov-velo{position:fixed;inset:0;z-index:2147483000;background:rgba(20,14,8,.32);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .35s}'+
  '.nov-velo.on{opacity:1}'+
  '.nov-caja{position:fixed;z-index:2147483001;left:50%;top:calc(64px + env(safe-area-inset-top,0px));width:min(370px,calc(100% - 32px));max-height:calc(100% - 120px);overflow:auto;'+
    'transform:translate(-50%,14px) scale(.97);opacity:0;transition:opacity .4s,transform .5s cubic-bezier(.2,.9,.3,1.2);'+
    'background:linear-gradient(180deg,rgba(255,253,248,.97),rgba(251,243,222,.96));color:#2B1E14;border:1px solid rgba(176,122,18,.28);border-radius:24px;'+
    'box-shadow:0 24px 60px rgba(40,25,10,.35),inset 0 1px 0 #fff;padding:20px 20px 18px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:left}'+
  '.nov-caja.on{opacity:1;transform:translate(-50%,0) scale(1)}'+
  '.nov-x{position:absolute;top:10px;right:10px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(43,30,20,.07);color:#2B1E14;font:400 22px/38px system-ui;cursor:pointer;padding:0}'+
  '.nov-et{font:600 11px Inter,system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#A8700F;margin:2px 44px 6px 0}'+
  '.nov-t{font-size:21px;font-weight:600;letter-spacing:-.02em;line-height:1.2;margin:0 40px 12px 0}'+
  '.nov-t + .nov-l{margin-top:0}.nov-sep{height:1px;background:rgba(176,122,18,.18);margin:14px 0}'+
  '.nov-l{list-style:none;margin:0;padding:0;display:grid;gap:9px}'+
  '.nov-l li{display:flex;gap:10px;font-size:15px;line-height:1.4;opacity:0;transform:translateY(6px);transition:opacity .4s,transform .4s}'+
  '.nov-caja.on .nov-l li{opacity:1;transform:none}'+
  '.nov-l .nov-ic{flex:none;width:24px;text-align:center;font-style:normal}.nov-l b{font-weight:600}'+
  '.nov-ok{display:block;margin:16px 0 0 auto;border:0;border-radius:999px;background:#F2C14E;color:#2a1a08;font:600 15px Inter,system-ui,sans-serif;padding:11px 22px;cursor:pointer;box-shadow:0 8px 20px rgba(232,178,58,.35)}';

  function mostrar(items){
    if(!items.length||document.querySelector('.nov-caja')) return;
    if(!document.getElementById('nov-css')){ var st=document.createElement('style'); st.id='nov-css'; st.textContent=css; document.head.appendChild(st); }
    var velo=document.createElement('div'); velo.className='nov-velo';
    var caja=document.createElement('div'); caja.className='nov-caja'; caja.setAttribute('role','dialog'); caja.setAttribute('aria-label','Novedades');
    var h='<button class="nov-x" type="button" aria-label="Cerrar">×</button>';
    items.forEach(function(n,k){
      if(k) h+='<div class="nov-sep"></div>';
      h+='<div class="nov-et">Novedades · '+n.fecha+'</div><div class="nov-t">'+n.titulo+'</div><ul class="nov-l">'+
        n.puntos.map(function(p,i){ return '<li style="transition-delay:'+(.15+i*.08)+'s"><i class="nov-ic">'+p[0]+'</i><span>'+p[1]+'</span></li>'; }).join('')+'</ul>';
    });
    h+='<button class="nov-ok" type="button">Entendido</button>';
    caja.innerHTML=h;
    document.body.appendChild(velo); document.body.appendChild(caja);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ velo.classList.add('on'); caja.classList.add('on'); }); });
    function cerrar(){
      var v=leer()||[]; items.forEach(function(n){ if(v.indexOf(n.id)<0) v.push(n.id); }); guardar(v);
      velo.classList.remove('on'); caja.classList.remove('on'); document.removeEventListener('keydown',tecla);
      setTimeout(function(){ velo.remove(); caja.remove(); },450);
    }
    function tecla(e){ if(e.key==='Escape') cerrar(); }
    caja.querySelector('.nov-x').onclick=cerrar; caja.querySelector('.nov-ok').onclick=cerrar; velo.onclick=cerrar;
    document.addEventListener('keydown',tecla);
  }
  function arrancar(){ setTimeout(function(){ mostrar(pend); },1200); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',arrancar); else arrancar();
})();
