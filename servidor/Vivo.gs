/**
 * HCM — EN VIVO Y AVISOS
 * ======================
 * Va en el mismo proyecto que Codigo.gs y Acceso.gs de HCM-Datos.
 *
 * Version 2 — 25 de octubre de 2026
 *
 * QUE SE ARREGLO EN ESTA VERSION
 *   El aviso de Telegram llegaba repetido cada 20 segundos y la pestaña
 *   "En vivo" decia "Nadie adentro" aunque si hubiera gente. Las dos cosas
 *   eran el MISMO problema: la columna "Ultimo latido" no siempre regresa
 *   como fecha de verdad; si la hoja la guarda como texto, el codigo viejo
 *   preguntaba "instanceof Date", le daba false, y entonces:
 *     - creia que cada latido era una entrada nueva  -> avisaba otra vez
 *     - se saltaba el renglon al armar la lista      -> "nadie adentro"
 *   Ahora la fecha se lee venga como venga (fecha, texto o numero), la
 *   columna se formatea como fecha al crear la hoja, y ademas hay un
 *   candado aparte: por mucho que falle la hoja, no se manda mas de un
 *   aviso por cadete cada MINUTOS_NUEVA_HCM.
 *
 * QUE HAY QUE CONFIGURAR (Configuracion del proyecto -> Propiedades del script)
 *   TELEGRAM_TOKEN   el token que te da @BotFather
 *   TELEGRAM_CHAT    tu chat id, el que te dice @userinfobot
 */

var MINUTOS_VIVO_HCM   = 10;   // despues de esto ya no cuenta como "adentro"
var MINUTOS_NUEVA_HCM  = 20;   // si no se le oia hace mas de esto, es entrada nueva
var PANEL_URL_HCM      = 'https://brianmartinezroz-alt.github.io/hcm-ingles-iv/maestro.html';
var TZ_HCM             = 'America/Mexico_City';

var ENC_VIVO = ['Cadete','Grupo','Leccion','Titulo','En que va','Reactivo',
                'Ultimo latido','Entro a las','Minutos seguidos'];


/* ─────────────── leer una fecha venga como venga ───────────────
   Este es el arreglo de fondo. La hoja puede devolver la fecha de tres
   maneras y antes solo se aceptaba una.                                   */

function msDeFechaHCM_(v) {
  if (!v && v !== 0) return 0;
  if (v instanceof Date) return v.getTime();

  if (typeof v === 'number') {
    if (v > 1e11) return v;                      // milisegundos
    if (v > 1e9)  return v * 1000;               // segundos
    if (v > 20000 && v < 80000) {                // numero de serie de la hoja
      return Math.round((v - 25569) * 86400000);
    }
    return 0;
  }

  var s = String(v).trim();
  if (!s) return 0;

  // 25/10/2026 10:26:05  ·  25-10-2026 10:26
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();

  // 2026-10-25 10:26:05  ·  2026-10-25T10:26:05
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();

  var t = Date.parse(s);
  return isNaN(t) ? 0 : t;
}


/* ─────────────── la hoja de los que estan adentro ─────────────── */

function hojaVivoHCM_(ss) {
  var h = ss.getSheetByName('Vivo');
  if (!h) {
    h = ss.insertSheet('Vivo');
    h.appendRow(ENC_VIVO);
    h.getRange(1, 1, 1, ENC_VIVO.length).setFontWeight('bold');
    h.setFrozenRows(1);
  }
  // Las dos columnas de hora se formatean como fecha a proposito: si se
  // quedan en texto, el panel no reconoce a nadie.
  try {
    h.getRange(2, 7, Math.max(1, h.getMaxRows() - 1), 2)
     .setNumberFormat('dd/MM/yyyy HH:mm:ss');
  } catch (e) {}
  return h;
}


/* ─────────────── el candado de los avisos ───────────────
   Vive en las Propiedades del script, no en la hoja. Aunque la hoja falle,
   de aqui no pasa: un aviso por cadete cada MINUTOS_NUEVA_HCM.            */

function puedeAvisarHCM_(clave) {
  try {
    var props = PropertiesService.getScriptProperties();
    var k = 'aviso_' + clave.replace(/[^a-z0-9]/g, '').slice(0, 40);
    var ant = Number(props.getProperty(k) || 0);
    var ahora = Date.now();
    if (ant && (ahora - ant) < MINUTOS_NUEVA_HCM * 60000) return false;
    props.setProperty(k, String(ahora));
    return true;
  } catch (e) {
    return true;
  }
}


/* ─────────────── 1. el latido que manda la app del cadete ───────────────
   No pide pase: lo manda el cadete, no el maestro, y no devuelve datos de
   nadie. Solo escribe su propio renglon.                                   */

function latidoHCM(body) {
  var ss = SpreadsheetApp.openById(getIdHoja());
  var h  = hojaVivoHCM_(ss);
  var clave = normNombreHCM_(body.nombre);
  if (!clave) return { ok: false, error: 'sin_nombre' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) { return { ok: true, saltado: true }; }

  try {
    var datos = h.getDataRange().getValues();
    var fila = -1;
    for (var i = 1; i < datos.length; i++) {
      if (normNombreHCM_(datos[i][0]) === clave) { fila = i + 1; break; }
    }

    var ahora = new Date();
    var esNueva = true;
    var entro = ahora;

    if (fila > 0) {
      var ultimo     = msDeFechaHCM_(datos[fila - 1][6]);
      var entroAntes = msDeFechaHCM_(datos[fila - 1][7]);
      if (ultimo) {
        var mins = (ahora.getTime() - ultimo) / 60000;
        if (mins < MINUTOS_NUEVA_HCM) {
          esNueva = false;
          if (entroAntes) entro = new Date(entroAntes);
        }
      }
    }

    var seguidos = Math.max(0, Math.round((ahora.getTime() - entro.getTime()) / 60000));
    var renglon = [
      body.nombre || '', String(body.grupo || ''), body.leccion || '',
      String(body.titulo || ''), String(body.paso || ''),
      String(body.reactivo || '').slice(0, 220),
      ahora, entro, seguidos
    ];

    if (fila > 0) {
      h.getRange(fila, 1, 1, renglon.length).setValues([renglon]);
    } else {
      h.appendRow(renglon);
      fila = h.getLastRow();
    }
    // por si la hoja traia esas celdas en texto
    try { h.getRange(fila, 7, 1, 2).setNumberFormat('dd/MM/yyyy HH:mm:ss'); } catch (e) {}

    // Dos candados: el de la hoja (esNueva) y el de las propiedades.
    // Tienen que abrir los dos para que salga el aviso.
    if (esNueva && puedeAvisarHCM_(clave)) avisarEntradaHCM_(body);
    return { ok: true, nueva: esNueva };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


/* ─────────────── 2. el aviso por Telegram ─────────────── */

function tokenTelegramHCM_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_TOKEN') || '';
}
function chatTelegramHCM_() {
  return PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT') || '';
}

function mandarTelegramHCM_(texto, botones) {
  var token = tokenTelegramHCM_(), chat = chatTelegramHCM_();
  if (!token || !chat) return false;
  var carga = {
    chat_id: chat,
    text: texto,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (botones) carga.reply_markup = JSON.stringify({ inline_keyboard: botones });
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post',
      payload: carga,
      muteHttpExceptions: true
    });
    return true;
  } catch (e) {
    return false;
  }
}

function avisarEntradaHCM_(body) {
  var nom = body.nombre || 'Un cadete';
  var gru = body.grupo ? (' · grupo ' + body.grupo) : '';
  var lec = body.leccion ? ('Lección ' + body.leccion) : 'la app';
  var tit = body.titulo ? ('\n<i>' + String(body.titulo) + '</i>') : '';
  var hora = Utilities.formatDate(new Date(), TZ_HCM, 'HH:mm');

  var liga = PANEL_URL_HCM + '#vivo=' + encodeURIComponent(nom);
  mandarTelegramHCM_(
    '🎖️ <b>' + nom + '</b>' + gru + '\nEntró a ' + lec + ' · ' + hora + tit,
    [[{ text: 'Ver qué está haciendo ↗', url: liga }]]
  );
}


/* ─────────────── 3. lo que pregunta el panel ───────────────
   Si pide pase: aqui si salen nombres de cadetes.                          */

function vivoHCM(body) {
  if (!puedeVerElPanelHCM_(body.pase)) {
    return { ok: false, error: accesoListoHCM_() ? 'sin_permiso' : 'sin_configurar' };
  }
  var ss = SpreadsheetApp.openById(getIdHoja());
  var h  = ss.getSheetByName('Vivo');
  if (!h) return { ok: true, dentro: [], ahora: Date.now() };

  var datos = h.getDataRange().getValues();
  var ahora = Date.now(), dentro = [];
  for (var i = 1; i < datos.length; i++) {
    var r = datos[i];
    if (!r[0]) continue;
    var ms = msDeFechaHCM_(r[6]);
    if (!ms) continue;
    var seg = Math.round((ahora - ms) / 1000);
    if (seg > MINUTOS_VIVO_HCM * 60) continue;
    var msEntro = msDeFechaHCM_(r[7]);
    dentro.push({
      nombre: r[0], grupo: String(r[1] || ''), leccion: r[2], titulo: r[3] || '',
      paso: r[4] || '', reactivo: r[5] || '',
      hace: seg,
      desde: msEntro ? Utilities.formatDate(new Date(msEntro), TZ_HCM, 'HH:mm') : '',
      seguidos: Number(r[8]) || 0
    });
  }
  dentro.sort(function (a, b) { return a.hace - b.hace; });
  return { ok: true, dentro: dentro, ahora: ahora, ventana: MINUTOS_VIVO_HCM };
}


/* ─────────────── para probar y para reparar, desde el editor ─────────── */

// 1) Corre esto UNA VEZ despues de pegar esta version.
//    Arregla la hoja que ya existe: le pone formato de fecha a las dos
//    columnas de hora y convierte a fecha de verdad lo que haya quedado
//    como texto. Ademas limpia los candados de aviso.
function arreglarVivo() {
  var ss = SpreadsheetApp.openById(getIdHoja());
  var h  = ss.getSheetByName('Vivo');
  if (!h) { Logger.log('Todavia no hay hoja Vivo. Nada que arreglar.'); return; }

  var n = h.getLastRow() - 1;
  if (n > 0) {
    var rango = h.getRange(2, 7, n, 2);
    var v = rango.getValues(), cambiadas = 0;
    for (var i = 0; i < v.length; i++) {
      for (var j = 0; j < 2; j++) {
        if (v[i][j] instanceof Date) continue;
        var ms = msDeFechaHCM_(v[i][j]);
        if (ms) { v[i][j] = new Date(ms); cambiadas++; }
      }
    }
    rango.setNumberFormat('dd/MM/yyyy HH:mm:ss');
    rango.setValues(v);
    Logger.log('Celdas de hora convertidas a fecha: ' + cambiadas + ' (de ' + (n * 2) + ')');
  } else {
    Logger.log('La hoja Vivo esta vacia.');
  }

  try {
    var props = PropertiesService.getScriptProperties(), todas = props.getProperties(), fuera = 0;
    for (var k in todas) if (k.indexOf('aviso_') === 0) { props.deleteProperty(k); fuera++; }
    Logger.log('Candados de aviso borrados: ' + fuera);
  } catch (e) {}
  Logger.log('Listo. Entra a la app con un cadete y revisa la pestaña En vivo.');
}

// 2) Corre esto y te debe llegar UN mensaje al Telegram.
function probarTelegram() {
  if (!tokenTelegramHCM_()) { Logger.log('FALTA la propiedad TELEGRAM_TOKEN.'); return; }
  if (!chatTelegramHCM_())  { Logger.log('FALTA la propiedad TELEGRAM_CHAT.');  return; }
  var ok = mandarTelegramHCM_(
    '✅ <b>Prueba del panel HCM</b>\nSi estás leyendo esto, los avisos ya quedaron.',
    [[{ text: 'Abrir el panel ↗', url: PANEL_URL_HCM }]]
  );
  Logger.log(ok ? 'Mandado. Revisa tu Telegram.' : 'No se pudo mandar. Revisa el token.');
}

// 3) Mete un cadete de mentiras y simula cuatro latidos seguidos.
//    Debe avisar UNA sola vez y debe aparecer en la pestaña En vivo.
function probarLatido() {
  var cuerpo = {
    nombre: 'PRUEBA Claude', grupo: '301', leccion: 3,
    titulo: 'He was talking when he hit the car',
    paso: 'Repetir', reactivo: 'He was talking on the phone when he hit the car.'
  };
  for (var i = 0; i < 4; i++) {
    var r = latidoHCM(cuerpo);
    Logger.log('latido ' + (i + 1) + ': ' + JSON.stringify(r));
  }
  Logger.log('Si solo el primero dice "nueva":true, el arreglo quedo.');
  Logger.log('Ahora abre el panel, pestaña En vivo: debe aparecer PRUEBA Claude.');
}

// 4) Quita de la hoja al cadete de prueba.
function quitarPrueba() {
  var ss = SpreadsheetApp.openById(getIdHoja());
  var h  = ss.getSheetByName('Vivo');
  if (!h) return;
  var d = h.getDataRange().getValues();
  for (var i = d.length - 1; i >= 1; i--) {
    if (String(d[i][0]).indexOf('PRUEBA') === 0) h.deleteRow(i + 1);
  }
  Logger.log('Listo.');
}

// Borra los renglones viejos de la hoja Vivo. Opcional.
function limpiarVivo() {
  var ss = SpreadsheetApp.openById(getIdHoja());
  var h  = ss.getSheetByName('Vivo');
  if (!h) { Logger.log('No hay hoja Vivo todavia.'); return; }
  var datos = h.getDataRange().getValues(), corte = Date.now() - 7 * 86400000, fuera = 0;
  for (var i = datos.length - 1; i >= 1; i--) {
    var ms = msDeFechaHCM_(datos[i][6]);
    if (!ms || ms < corte) { h.deleteRow(i + 1); fuera++; }
  }
  Logger.log('Renglones viejos quitados: ' + fuera);
}
