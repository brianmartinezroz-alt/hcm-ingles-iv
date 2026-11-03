/**
 * EFA — Pronunciación (lado de la app)
 * ------------------------------------
 * Graba al alumno en WAV 16 kHz mono (lo que pide Azure; funciona igual en
 * iPhone y Android), lo manda al PRON_ENDPOINT y regresa el resultado.
 *
 * Mientras graba NO hay reconocimiento de voz del navegador: los dos
 * peleaban por el micrófono. Azure regresa también lo que oyó.
 *
 *   EFAPron.configurar({ endpoint: 'https://script.google.com/macros/s/XXX/exec' });
 *   var g = EFAPron.grabar({ auto:true, onNivel:fn, alTerminar:fn(audio|null) });
 *   g.iniciar();  ...  g.detener();      // detener = "ya terminé"
 *   EFAPron.evaluar({ audio, texto, nivel, acento, alumno, ejercicio, intento, app })
 *
 * Modo auto: termina solo después de ~1.6 s de silencio DESPUÉS de hablar
 * (nunca antes de que empiece a hablar), o a los maxSegundos.
 */
(function (global) {
  'use strict';

  var cfg = {
    endpoint: '',
    maxSegundos: 20,       // corte automático
    minSegundos: 0.6,      // menos que esto = no grabó nada
    silencioFin: 1600,     // ms de silencio después de hablar para terminar (modo auto)
    umbralVoz: 0.018       // nivel (RMS) que cuenta como voz
  };
  try { var ls = global.localStorage.getItem('efa_pron_endpoint'); if (ls) cfg.endpoint = ls; } catch (e) {}

  /* ---------- Grabadora WAV ---------- */
  function GrabadoraWav(op) { this.op = op || {}; }
  GrabadoraWav.prototype.iniciar = function () {
    var self = this, op = this.op;
    return navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function (stream) {
      self.stream = stream;
      var AC = global.AudioContext || global.webkitAudioContext;
      self.ctx = new AC();
      return (self.ctx.state === 'suspended' ? self.ctx.resume() : Promise.resolve()).then(function () {
        self.fuente = self.ctx.createMediaStreamSource(stream);
        self.proc = self.ctx.createScriptProcessor(4096, 1, 1);
        self.trozos = []; self.largo = 0; self.hablo = false; self.ultimaVoz = 0; self.t0 = Date.now(); self.cerrado = false;
        self.proc.onaudioprocess = function (e) {
          if (self.cerrado) return;
          var d = e.inputBuffer.getChannelData(0), s = 0;
          for (var i = 0; i < d.length; i++) s += d[i] * d[i];
          var rms = Math.sqrt(s / d.length), ahora = Date.now();
          self.trozos.push(new Float32Array(d)); self.largo += d.length;
          if (op.onNivel) try { op.onNivel(rms); } catch (x) {}
          if (rms > cfg.umbralVoz) { self.hablo = true; self.ultimaVoz = ahora; }
          if (op.auto && self.hablo && ahora - self.ultimaVoz > cfg.silencioFin) self._fin();
          if (ahora - self.t0 > cfg.maxSegundos * 1000) self._fin();
        };
        self.fuente.connect(self.proc);
        self.proc.connect(self.ctx.destination);
      });
    });
  };
  GrabadoraWav.prototype._fin = function () {
    if (this.cerrado) return; this.cerrado = true;
    var self = this;
    setTimeout(function () {
      self.terminar().then(function (a) { if (self.op.alTerminar) self.op.alTerminar(a); });
    }, 0);
  };
  GrabadoraWav.prototype.detener = function () { this._fin(); };
  GrabadoraWav.prototype.cancelar = function () { this.cerrado = true; this.op.alTerminar = null; this.terminar(); };
  GrabadoraWav.prototype.terminar = function () {
    var self = this;
    try { this.proc.disconnect(); this.fuente.disconnect(); } catch (e) {}
    try { this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    var tasa = this.ctx ? this.ctx.sampleRate : 48000;
    return Promise.resolve(this.ctx && this.ctx.close ? this.ctx.close().catch(function () {}) : null).then(function () {
      var todo = new Float32Array(self.largo || 0), o = 0;
      (self.trozos || []).forEach(function (t) { todo.set(t, o); o += t.length; });
      var pcm = bajarTasa(recortarSilencio(todo, tasa), tasa, 16000);
      var seg = pcm.length / 16000;
      if (seg < cfg.minSegundos || !self.hablo) return null;
      return { base64: aBase64(aWav(pcm, 16000)), segundos: seg };
    });
  };

  function recortarSilencio(datos, tasa) {
    var umbral = 0.01, margen = Math.floor(tasa * 0.25), i = 0, f = datos.length - 1;
    while (i < datos.length && Math.abs(datos[i]) < umbral) i++;
    while (f > i && Math.abs(datos[f]) < umbral) f--;
    if (f <= i) return new Float32Array(0);
    return datos.subarray(Math.max(0, i - margen), Math.min(datos.length, f + margen));
  }
  function bajarTasa(datos, de, a) {
    if (a >= de) return datos;
    var r = de / a, n = Math.floor(datos.length / r), out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var ini = Math.floor(i * r), fin = Math.min(datos.length, Math.floor((i + 1) * r)), s = 0;
      for (var j = ini; j < fin; j++) s += datos[j];
      out[i] = s / Math.max(1, fin - ini);
    }
    return out;
  }
  function aWav(pcm, tasa) {
    var buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
    var txt = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); txt(8, 'WAVE');
    txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, tasa, true); v.setUint32(28, tasa * 2, true); v.setUint16(32, 2, true);
    v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (var i = 0; i < pcm.length; i++) {
      var s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }
  function aBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ---------- Envío ---------- */
  function evaluar(datos) {
    if (!cfg.endpoint) return Promise.reject(new Error('Falta configurar el endpoint de pronunciación'));
    var ctrl = global.AbortController ? new AbortController() : null;
    var corte = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // evita bloqueo CORS con Apps Script
      body: JSON.stringify(Object.assign({ accion: 'pronunciacion' }, datos)),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(corte);
      if (!j.ok) throw new Error(j.error || 'Error del servidor');
      return j;
    }, function (e) { clearTimeout(corte); throw e; });
  }

  /* ---------- Pintar la frase con colores por palabra ---------- */
  function escapar(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clase(p) {
    return p.error === 'Omission' || p.puntos === null ? 'pron-falta'
      : p.error === 'Insertion' ? 'pron-extra'
      : p.puntos >= 80 ? 'pron-bien' : p.puntos >= 60 ? 'pron-medio' : 'pron-mal';
  }
  function fraseHTML(resumen) {
    return (resumen.palabras || []).map(function (p) { return '<span class="pron-palabra ' + clase(p) + '">' + escapar(p.palabra) + '</span>'; }).join(' ');
  }
  function consejosHTML(feedback) {
    return (feedback.palabras || []).filter(function (x) { return x.consejo; }).map(function (x) {
      return '<li><b>' + escapar(x.palabra) + '</b> — ' + escapar(x.consejo) + '</li>';
    }).join('');
  }

  global.EFAPron = {
    configurar: function (o) { for (var k in o) cfg[k] = o[k]; },
    listo: function () { return !!(cfg.endpoint && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (global.AudioContext || global.webkitAudioContext)); },
    grabar: function (op) { return new GrabadoraWav(op); },
    evaluar: evaluar,
    fraseHTML: fraseHTML,
    consejosHTML: consejosHTML,
    cfg: cfg
  };
})(window);
