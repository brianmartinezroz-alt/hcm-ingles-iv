"""
Genera el audio de todas las frases de la app, una vez, en los servidores
gratuitos de GitHub (GitHub Actions). El resultado son archivos mp3 que se
guardan en el repositorio, en voz/<llave>.mp3, y la app los toca directo:
sin servidor de voz, sin facturación y sin internet una vez guardados.

Motores (los dos son de código abierto y gratuitos):
  chatterbox  Resemble AI · licencia MIT · la alternativa abierta a ElevenLabs
  kokoro      hexgrad · Apache-2.0 (kokoro-onnx) · la voz buena de lo grabado:
              varias voces en inglés y voz de maestro en español
  dialogos    Kokoro (kokoro-onnx) para los audios de dos o más personas: una
              voz por persona y pausa entre turnos (ver dialogo.py)
  azure       voces neuronales de Microsoft Azure (cuenta gratis F0: 500 mil
              caracteres al mes, no cobra). Llave en los secretos del repositorio
              AZURE_SPEECH_KEY y AZURE_SPEECH_REGION. Inglés con varias voces de
              EE. UU.; las instrucciones en español con voces de México.
              Guarda voz/<llave>-g.mp3 (la voz buena) y anota en voz/azure.json.
  gemini      la voz nueva de Google (Gemini TTS), capa GRATIS de Google AI
              Studio. Usa la llave GEMINI_API_KEY que Brian guarda como secreto
              del repositorio (nadie más la ve). La capa gratis da pocas frases
              al día: se corre a diario y cada día avanza donde se quedó.
              Guarda voz/<llave>-g.mp3 y deja los audios anteriores de respaldo.
  google      la voz buena de Google (Chirp 3 HD), pedida al mismo servidor de
              voz de la app (Apps Script). No usa llaves aquí: el servidor ya
              las tiene. Rehace TODAS las frases y reemplaza las anteriores.

Uso:  python generar.py <motor> <parte> <de_cuantas> <carpeta_salida>
"""
import json, os, subprocess, sys, time, traceback

motor, parte, total, salida = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
os.makedirs(salida, exist_ok=True)
aqui = os.path.dirname(os.path.abspath(__file__))
frases = json.load(open(os.path.join(aqui, 'frases.json'), encoding='utf-8'))
ya = set()
lista_vieja = os.path.join(aqui, '..', 'voz', 'lista.json')
if os.path.exists(lista_vieja):
    try: ya = set(json.load(open(lista_vieja)).get('h', []))
    except Exception: ya = set()

rehacer = motor == 'google' or os.environ.get('REHACER') == '1'
sys.path.insert(0, aqui)
from dialogo import turnos as _turnos
def es_dialogo(f): return (not f.get('es')) and bool(_turnos(f['t']))
if motor != 'dialogos':
    frases = [f for f in frases if not es_dialogo(f)]   # esos van con varias voces (motor dialogos)
if motor == 'kokoro':
    hechas_k = set()
    p_k = os.path.join(aqui, '..', 'voz', 'kokoro.json')
    if os.path.exists(p_k) and os.environ.get('REHACER') != '1':
        try: hechas_k = set(json.load(open(p_k)))
        except Exception: hechas_k = set()
    import re as _re
    _COM = _re.compile(r'["“”]([^"“”]{1,140})["“”]|(?<![A-Za-zÁÉÍÓÚáéíóúñ])\'([A-Za-z][^\'\n]{0,80}?)\'(?![A-Za-z])')
    def partes_mixtas(t):
        """Español con ejemplos en inglés entre comillas → [('es'|'en', texto)]."""
        out, i = [], 0
        for m in _COM.finditer(t):
            dentro = m.group(1) or m.group(2)
            if _re.search(r'[áéíóúñ¿¡ÁÉÍÓÚÑ]', dentro):
                continue                      # comillas, pero en español
            if m.start() > i: out.append(('es', t[i:m.start()]))
            out.append(('en', dentro)); i = m.end()
        if i < len(t): out.append(('es', t[i:]))
        return [(l, x.strip(' ,;:')) for l, x in out if _re.search(r'[A-Za-zÁÉÍÓÚáéíóúñ]', x)]
    def llave_k(f):
        return f['h'] + ('#m' if f.get('es') and any(l == 'en' for l, _ in partes_mixtas(f['t'])) else '')
    pend = [f for f in frases if llave_k(f) not in hechas_k]
    mias = [f for i, f in enumerate(pend) if i % total == parte]
elif motor == 'dialogos':
    ya_g = set()
    if os.path.exists(lista_vieja) and os.environ.get('REHACER') != '1':
        try: ya_g = set(json.load(open(lista_vieja)).get('g', []))
        except Exception: ya_g = set()
    mias = [f for f in frases if es_dialogo(f) and f['h'] not in ya_g]
elif motor == 'azure':
    hechas_az = set()
    p_az = os.path.join(aqui, '..', 'voz', 'azure.json')
    if os.path.exists(p_az) and os.environ.get('REHACER') != '1':
        try: hechas_az = set(json.load(open(p_az)))
        except Exception: hechas_az = set()
    def orden_az(f):
        p = f.get('por', '')
        return (0 if p.startswith('E') else 1 if f.get('es') else 2, p)
    mias = sorted([f for f in frases if f['h'] not in hechas_az], key=orden_az)
elif motor == 'gemini':
    ya_g = set()
    if os.path.exists(lista_vieja):
        try: ya_g = set(json.load(open(lista_vieja)).get('g', []))
        except Exception: ya_g = set()
    # Brian: español en las instrucciones, inglés en los ejercicios. Orden:
    # estudio del examen (inglés) → instrucciones en español → lecciones → banco → lo demás
    def orden(f):
        p = f.get('por', '')
        if p.startswith('E'): g = 0
        elif f.get('es'): g = 1
        elif p.startswith('L') or p.startswith('boca'): g = 2
        elif p.startswith('B') or p.startswith('P'): g = 3
        else: g = 4
        return (g, p)
    mias = sorted([f for f in frases if f['h'] not in ya_g], key=orden)
else:
    # Chatterbox y Kokoro no hablan español: esas frases solo las hace la voz de Google
    mias = [f for i, f in enumerate(frases) if i % total == parte and not f.get('es') and (rehacer or f['h'] not in ya)]
print(f'parte {parte}/{total}: {len(mias)} frases nuevas ({len(frases)} en total)', flush=True)

def a_mp3(wav_path, mp3_path):
    # mono, 24 kHz, 40 kbps: claro en el teléfono y ligero para datos móviles
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path,
                    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                           'silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
                           'apad=pad_dur=0.15',
                    '-ac', '1', '-ar', '24000', '-b:a', '40k', mp3_path], check=True)

hechas, fallas, t0 = 0, 0, time.time()

if motor == 'chatterbox':
    import torch, torchaudio as ta
    from chatterbox.tts import ChatterboxTTS
    torch.set_num_threads(os.cpu_count() or 4)
    modelo = ChatterboxTTS.from_pretrained(device='cpu')
    ref = {s: os.path.join(aqui, f'ref_{s}.wav') for s in ('m', 'f')}
    for f in mias:
        try:
            r = ref.get(f['s'])
            kw = {'audio_prompt_path': r} if r and os.path.exists(r) else {}
            wav = modelo.generate(f['t'], exaggeration=0.4, cfg_weight=0.5, **kw)
            tmp = os.path.join(salida, f['h'] + '.wav')
            ta.save(tmp, wav, modelo.sr)
            a_mp3(tmp, os.path.join(salida, f['h'] + '.mp3')); os.remove(tmp)
            hechas += 1
        except Exception:
            fallas += 1; traceback.print_exc()
        if (hechas + fallas) % 10 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s', flush=True)

elif motor == 'kokoro':
    # Kokoro (kokoro-onnx, Apache-2.0): la voz buena de todo lo grabado.
    # Inglés con varias voces de EE. UU.; las instrucciones en español con voz
    # de maestro. Guarda voz/<llave>-g.mp3 y anota en voz/kokoro.json.
    import soundfile as sf
    from kokoro_onnx import Kokoro
    k = Kokoro(os.environ.get('KOKORO_MODELO', 'kokoro-v1.0.int8.onnx'),
               os.environ.get('KOKORO_VOCES', 'voices-v1.0.bin'))
    VOCES = {'m': ['am_michael', 'am_fenrir', 'am_eric', 'am_liam'],
             'f': ['af_heart', 'af_bella', 'af_nicole', 'af_sarah'],
             'es': ['em_alex']}
    hechos_k = []
    p_out = os.path.join(salida, f'kokoro_nuevas_{parte}.json')
    for f in mias:
        try:
            g = 'es' if f.get('es') else (f['s'] if f['s'] in ('m', 'f') else 'f')
            voz = VOCES[g][int(f['h'], 16) % len(VOCES[g])]
            import numpy as np
            trozos, sr = [], 24000
            segs = partes_mixtas(f['t']) if g == 'es' else [('en', f['t'])]
            if g == 'es' and not any(l == 'en' for l, _ in segs): segs = [('es', f['t'])]
            for l, x in segs:
                # en las explicaciones en español, los ejemplos en inglés van con voz en inglés
                a, sr = k.create(x, voice=(voz if l == g or (g != 'es') else 'am_michael'),
                                 speed=1.0, lang='es' if l == 'es' else 'en-us')
                if trozos: trozos.append(np.zeros(int(0.12 * sr), dtype=np.float32))
                trozos.append(np.asarray(a, dtype=np.float32))
            tmp = os.path.join(salida, f['h'] + '.k.wav')
            sf.write(tmp, np.concatenate(trozos), sr)
            a_mp3(tmp, os.path.join(salida, f['h'] + '-g.mp3')); os.remove(tmp)
            hechas += 1; hechos_k.append(llave_k(f))
        except Exception:
            fallas += 1; traceback.print_exc()
        if (hechas + fallas) % 25 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s', flush=True)
            json.dump(hechos_k, open(p_out, 'w'))
    json.dump(hechos_k, open(p_out, 'w'))
elif motor == 'dialogos':
    # audios con dos o más personas: una voz por persona y pausa entre turnos
    import dialogo
    from kokoro_onnx import Kokoro
    k = Kokoro(os.environ.get('KOKORO_MODELO', 'kokoro-v1.0.int8.onnx'),
               os.environ.get('KOKORO_VOCES', 'voices-v1.0.bin'))
    for f in mias:
        try:
            tmp = os.path.join(salida, f['h'] + '.dlg.wav')
            voces = dialogo.generar(k, f['t'], f['s'], tmp)
            a_mp3(tmp, os.path.join(salida, f['h'] + '.mp3'))
            a_mp3(tmp, os.path.join(salida, f['h'] + '-g.mp3'))   # también como la voz buena
            os.remove(tmp); hechas += 1
            print(f'  {f["h"]} {voces} {f["t"][:60]}', flush=True)
        except Exception:
            fallas += 1; traceback.print_exc()

elif motor == 'azure':
    import requests, html
    KEY = os.environ.get('AZURE_SPEECH_KEY', '').strip()
    REGION = os.environ.get('AZURE_SPEECH_REGION', '').strip()
    if not KEY or not REGION:
        print('Faltan los secretos AZURE_SPEECH_KEY y AZURE_SPEECH_REGION: no se genera nada.'); sys.exit(0)
    VOCES = {'m': ['en-US-AndrewNeural', 'en-US-BrianNeural', 'en-US-GuyNeural'],
             'f': ['en-US-AvaNeural', 'en-US-EmmaNeural', 'en-US-JennyNeural'],
             'es': ['es-MX-JorgeNeural']}
    URL = f'https://{REGION}.tts.speech.microsoft.com/cognitiveservices/v1'
    PAUSA = float(os.environ.get('AZURE_PAUSA', '3.3'))     # F0: 20 peticiones por minuto
    hechos_az = []
    p_az = os.path.join(salida, 'azure_nuevas.json')
    ultimo = 0.0
    for f in mias:
        g = 'es' if f.get('es') else (f['s'] if f['s'] in ('m', 'f') else 'f')
        voz = VOCES[g][int(f['h'], 16) % len(VOCES[g])]
        lang = '-'.join(voz.split('-')[:2])
        ssml = (f"<speak version='1.0' xml:lang='{lang}'><voice name='{voz}'>"
                f"{html.escape(f['t'], quote=True)}</voice></speak>")
        ok = False
        for intento in range(5):
            espera = PAUSA - (time.time() - ultimo)
            if espera > 0: time.sleep(espera)
            ultimo = time.time()
            try:
                r = requests.post(URL, data=ssml.encode('utf-8'), timeout=60, headers={
                    'Ocp-Apim-Subscription-Key': KEY, 'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'hcm-voces'})
            except Exception as e:
                print('  red:', repr(e)[:120], flush=True); time.sleep(5); continue
            if r.status_code == 200 and len(r.content) > 800:
                crudo = os.path.join(salida, f['h'] + '.az.mp3')
                open(crudo, 'wb').write(r.content)
                a_mp3(crudo, os.path.join(salida, f['h'] + '-g.mp3')); os.remove(crudo)
                ok = True; break
            if r.status_code in (401, 403):
                sys.exit('La llave de Azure no sirve (' + str(r.status_code) + '): ' + r.text[:200])
            if r.status_code == 429:
                print('  429: espero', flush=True); time.sleep(20 * (intento + 1)); continue
            print(f'  {r.status_code}: {r.text[:160]}', flush=True); time.sleep(5)
        if ok:
            hechas += 1; hechos_az.append(f['h'])
        else:
            fallas += 1
        if (hechas + fallas) % 25 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s', flush=True)
            json.dump(hechos_az, open(p_az, 'w'))
    json.dump(hechos_az, open(p_az, 'w'))

elif motor == 'gemini':
    # Lo gratis de Google da ~10 peticiones al día por modelo. Para rendirlas,
    # cada petición lleva VARIAS frases seguidas (una por renglón) y luego se
    # cortan: un reconocedor de voz (faster-whisper) marca dónde empieza y
    # acaba cada frase. La que no se reconoce bien no se guarda.
    import base64, re, difflib, requests
    LLAVE = os.environ.get('GEMINI_API_KEY', '').strip()
    if not LLAVE:
        print('Falta el secreto GEMINI_API_KEY en el repositorio: no se genera nada.'); sys.exit(0)
    MODELOS = [m for m in os.environ.get('GEMINI_MODELOS',
               'gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',') if m]
    VOCES = {'m': ['Charon', 'Orus', 'Iapetus', 'Algieba'],
             'f': ['Kore', 'Aoede', 'Erinome', 'Despina'],
             'es': ['Charon']}                     # una sola voz de maestro para las instrucciones
    POR_TANDA = int(os.environ.get('GEMINI_POR_TANDA', '20'))
    CHARS_TANDA = int(os.environ.get('GEMINI_CHARS_TANDA', '1000'))
    PAUSA = float(os.environ.get('GEMINI_PAUSA', '25'))
    TOPE_MIN = float(os.environ.get('GEMINI_MINUTOS', '110'))
    agotados, ultimo = set(), 0.0
    from faster_whisper import WhisperModel
    oido = WhisperModel(os.environ.get('WHISPER', 'base'), device='cpu', compute_type='int8')

    class Agotado(Exception): pass

    def grupo(f): return 'es' if f.get('es') else (f['s'] if f['s'] in ('m', 'f') else 'f')
    # tandas: frases seguidas del mismo grupo de voz, respetando el orden de prioridad
    # dentro de cada prioridad se juntan las de la misma voz (hombre / mujer / español)
    # para que cada petición lleve muchas frases
    pri = {f['h']: k for k, f in enumerate(mias)}
    def gprio(f):
        p = f.get('por', '')
        return 0 if p.startswith('E') else 1 if f.get('es') else 2 if (p.startswith('L') or p.startswith('boca')) else 3 if (p.startswith('B') or p.startswith('P')) else 4
    mias = sorted(mias, key=lambda f: (gprio(f), grupo(f), pri[f['h']]))
    tandas, actual = [], []
    for f in mias:
        if actual and (grupo(f) != grupo(actual[0]) or len(actual) >= POR_TANDA or
                       sum(len(x['t']) for x in actual) + len(f['t']) > CHARS_TANDA):
            tandas.append(actual); actual = []
        actual.append(f)
    if actual: tandas.append(actual)
    print(f'{len(tandas)} tandas', flush=True)

    def audio_de(d):
        for c in d.get('candidates', []) or []:
            for pz in (c.get('content') or {}).get('parts', []) or []:
                dato = pz.get('inlineData') or pz.get('inline_data')
                if dato and dato.get('data'):
                    return base64.b64decode(dato['data']), dato.get('mimeType', '')
        for st in d.get('steps', []) or []:
            for c in st.get('content', []) or []:
                if c.get('type') == 'audio' and c.get('data'):
                    return base64.b64decode(c['data']), c.get('mime_type', 'audio/wav')
        return None, ''

    def pedir(modelo, texto, voz):
        global ultimo
        espera = PAUSA - (time.time() - ultimo)
        if espera > 0: time.sleep(espera)
        ultimo = time.time()
        cab = {'x-goog-api-key': LLAVE, 'Content-Type': 'application/json'}
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent'
        cuerpo = {'contents': [{'parts': [{'text': texto}]}],
                  'generationConfig': {'responseModalities': ['AUDIO'],
                      'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voz}}}}}
        return requests.post(url, json=cuerpo, headers=cab, timeout=300)

    PRUEBA = os.environ.get('GEMINI_PRUEBA') == '1'
    if PRUEBA:
        tandas = [t for t in tandas if grupo(t[0]) == 'es'][:1] + [t for t in tandas if grupo(t[0]) != 'es'][:2]
        print('PRUEBA: voz de espeak en lugar de Google, sin gastar lo gratis', flush=True)

    def generar(texto, voz):
        if PRUEBA:
            es = any(ch in texto for ch in 'áéíóúñ¿¡')
            tmp = os.path.join(salida, 'prueba.wav')
            subprocess.run(['espeak-ng', '-v', 'es-419' if es else 'en-us', '-s', '150', '-g', '8', '-w', tmp, texto], check=True)
            b = open(tmp, 'rb').read(); os.remove(tmp)
            return b, 'audio/wav', 'prueba'
        for intento in range(6):
            vivos = [m for m in MODELOS if m not in agotados]
            if not vivos: raise Agotado()
            modelo = vivos[0]
            r = pedir(modelo, texto, voz)
            if r.status_code == 200:
                crudo, tipo = audio_de(r.json())
                if crudo: return crudo, tipo, modelo
                print('  respuesta sin audio:', r.text[:200], flush=True); continue
            txt = r.text[:600]
            if r.status_code == 429:
                if re.search(r'PerDay|per day|daily', txt, re.I):
                    print(f'  {modelo}: se acabó lo gratis de hoy', flush=True)
                    agotados.add(modelo); continue
                m = re.search(r'"retryDelay":\s*"(\d+)', txt)
                time.sleep(int(m.group(1)) + 2 if m else 30); continue
            if r.status_code in (400, 403, 404):
                print(f'  {modelo}: {r.status_code} {txt[:240]}', flush=True)
                if r.status_code == 403 or 'API key' in txt or 'API_KEY' in txt:
                    sys.exit('La llave GEMINI_API_KEY no sirve: ' + txt[:200])
                if r.status_code == 404: agotados.add(modelo); continue
                raise RuntimeError('Google no aceptó esta tanda: ' + txt[:200])
            time.sleep(10 * (intento + 1))
        raise RuntimeError('no salió')

    def palabras(t):
        return re.findall(r"[a-záéíóúüñ0-9']+", t.lower())

    def cortar(wav, tanda, idioma):
        """Devuelve [(frase, inicio, fin)] para las frases que se reconocieron bien."""
        segs, _ = oido.transcribe(wav, language=idioma, word_timestamps=True, beam_size=1,
                                  vad_filter=False, condition_on_previous_text=False)
        oidas = [(w.word, w.start, w.end) for s_ in segs for w in (s_.words or [])]
        o_pal = [re.sub(r"[^a-záéíóúüñ0-9']", '', w.lower()) for w, _, _ in oidas]
        meta, de = [], []
        for k, f in enumerate(tanda):
            for p_ in palabras(f['t']): meta.append(p_); de.append(k)
        sm = difflib.SequenceMatcher(None, meta, o_pal, autojunk=False)
        mapa = {}
        for a, b, n in sm.get_matching_blocks():
            for q in range(n): mapa[a + q] = b + q
        res = []
        for k, f in enumerate(tanda):
            idx = [i for i, d in enumerate(de) if d == k]
            hechos = [mapa[i] for i in idx if i in mapa]
            if not idx or len(hechos) < max(1, 0.6 * len(idx)): res.append((f, None, None)); continue
            res.append((f, oidas[min(hechos)][1], oidas[max(hechos)][2]))
        # bordes: a medio camino entre una frase y la siguiente
        buenos = [(k, a, b) for k, (f, a, b) in enumerate(res) if a is not None]
        cortes = []
        for n_, (k, a, b) in enumerate(buenos):
            ini = a - 0.25 if n_ == 0 else (buenos[n_ - 1][2] + a) / 2
            fin = b + 0.35 if n_ == len(buenos) - 1 else (b + buenos[n_ + 1][1]) / 2
            # si la frase de al lado no se reconoció, no se corta hacia ella
            if n_ > 0 and buenos[n_ - 1][0] != k - 1: ini = a - 0.25
            if n_ < len(buenos) - 1 and buenos[n_ + 1][0] != k + 1: fin = b + 0.35
            cortes.append((res[k][0], max(0, ini), fin))
        return cortes

    usados = {}
    for nt, tanda in enumerate(tandas):
        if time.time() - t0 > TOPE_MIN * 60:
            print('  se acabó el tiempo de hoy; mañana sigue', flush=True); break
        g = grupo(tanda[0]); lista_v = VOCES[g]; voz = lista_v[nt % len(lista_v)]
        texto = '\n\n'.join(f['t'] for f in tanda)
        try:
            crudo, tipo, modelo = generar(texto, voz)
        except Agotado:
            print('  todos los modelos gratis se acabaron por hoy; mañana sigue', flush=True); break
        except SystemExit:
            raise
        except Exception:
            fallas += len(tanda); traceback.print_exc(); continue
        usados[modelo] = usados.get(modelo, 0) + 1
        base = os.path.join(salida, f'tanda{nt}')
        try:
            if crudo[:4] == b'RIFF':
                open(base + '.wav', 'wb').write(crudo)
            else:
                tasa = re.search(r'rate=(\d+)', tipo); tasa = tasa.group(1) if tasa else '24000'
                open(base + '.pcm', 'wb').write(crudo)
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', tasa, '-ac', '1',
                                '-i', base + '.pcm', base + '.wav'], check=True)
                os.remove(base + '.pcm')
            cortes = cortar(base + '.wav', tanda, 'es' if g == 'es' else 'en')
            for f, a, b in cortes:
                pza = os.path.join(salida, f['h'] + '-g.cut.wav')
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', base + '.wav',
                                '-ss', f'{a:.2f}', '-to', f'{b:.2f}', pza], check=True)
                a_mp3(pza, os.path.join(salida, f['h'] + '-g.mp3')); os.remove(pza)
                if PRUEBA: print(f'     {b - a:5.2f}s  {f["t"][:70]}', flush=True)
                hechas += 1
            fallas += len(tanda) - len(cortes)
            os.remove(base + '.wav')
            print(f'  tanda {nt + 1}/{len(tandas)} ({g}, {voz}, {modelo}): {len(cortes)}/{len(tanda)} frases', flush=True)
        except Exception:
            fallas += len(tanda); traceback.print_exc()
    print('peticiones por modelo:', usados, '| frases que faltan', len(mias) - hechas, flush=True)

elif motor == 'google':
    import base64, requests
    URL = os.environ.get('VOZ_ENDPOINT') or open(os.path.join(aqui, 'endpoint.txt')).read().strip()
    def pedir(f):
        cuerpo = json.dumps({'texto': f['t'], 'idioma': 'es' if f.get('es') else 'en',
                             'paquete': 'audio-us', 'sexo': f['s']})
        for intento in range(4):
            try:
                r = requests.post(URL, data=cuerpo.encode('utf-8'), timeout=60,
                                  headers={'Content-Type': 'text/plain;charset=utf-8'})
                d = r.json()
                if d.get('ok') and d.get('audio'):
                    return base64.b64decode(d['audio'])
                err = str(d)[:200]
                if 'BILLING' in err or '403' in err:
                    sys.exit('El servidor de voz de Google sigue sin facturación: ' + err)
            except SystemExit:
                raise
            except Exception as e:
                err = repr(e)[:200]
            time.sleep(3 * (intento + 1))
        raise RuntimeError(err)
    for f in mias:
        try:
            crudo = os.path.join(salida, f['h'] + '.g.mp3')
            open(crudo, 'wb').write(pedir(f))
            a_mp3(crudo, os.path.join(salida, f['h'] + '.mp3')); os.remove(crudo)
            hechas += 1
        except SystemExit:
            raise
        except Exception:
            fallas += 1; traceback.print_exc()
        if (hechas + fallas) % 10 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s', flush=True)
else:
    sys.exit('motor desconocido: ' + motor)

print(f'listo: {hechas} hechas, {fallas} fallaron, {time.time() - t0:.0f}s', flush=True)
