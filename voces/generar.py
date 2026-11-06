"""
Genera el audio de todas las frases de la app, una vez, en los servidores
gratuitos de GitHub (GitHub Actions). El resultado son archivos mp3 que se
guardan en el repositorio, en voz/<llave>.mp3, y la app los toca directo:
sin servidor de voz, sin facturación y sin internet una vez guardados.

Motores (los dos son de código abierto y gratuitos):
  chatterbox  Resemble AI · licencia MIT · la alternativa abierta a ElevenLabs
  kokoro      hexgrad · Apache-2.0 · más rápido; voces de hombre y de mujer
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
if motor == 'gemini':
    ya_g = set()
    if os.path.exists(lista_vieja):
        try: ya_g = set(json.load(open(lista_vieja)).get('g', []))
        except Exception: ya_g = set()
    # primero lo del estudio para el examen, luego las lecciones, luego lo demás
    def orden(f):
        p = f.get('por', '')
        return (0 if p.startswith('E') else 1 if p.startswith('L') else 2 if p.startswith('B') else 3, p)
    mias = sorted([f for f in frases if f['h'] not in ya_g], key=orden)
else:
    mias = [f for i, f in enumerate(frases) if i % total == parte and (rehacer or f['h'] not in ya)]
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
    import soundfile as sf
    from kokoro import KPipeline
    import numpy as np
    tubo = KPipeline(lang_code='a')
    voz = {'f': 'af_heart', 'm': 'am_michael'}
    for f in mias:
        try:
            trozos = [a for _, _, a in tubo(f['t'], voice=voz.get(f['s'], 'af_heart'), speed=0.95)]
            tmp = os.path.join(salida, f['h'] + '.wav')
            sf.write(tmp, np.concatenate(trozos), 24000)
            a_mp3(tmp, os.path.join(salida, f['h'] + '.mp3')); os.remove(tmp)
            hechas += 1
        except Exception:
            fallas += 1; traceback.print_exc()
        if (hechas + fallas) % 25 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s', flush=True)
elif motor == 'gemini':
    import base64, re, requests
    LLAVE = os.environ.get('GEMINI_API_KEY', '').strip()
    if not LLAVE:
        print('Falta el secreto GEMINI_API_KEY en el repositorio: no se genera nada.'); sys.exit(0)
    MODELOS = [m for m in os.environ.get('GEMINI_MODELOS',
               'gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',') if m]
    VOCES = {'m': ['Charon', 'Orus', 'Iapetus', 'Algieba'],
             'f': ['Kore', 'Aoede', 'Erinome', 'Despina']}
    PAUSA = float(os.environ.get('GEMINI_PAUSA', '7'))      # segundos entre peticiones
    TOPE_MIN = float(os.environ.get('GEMINI_MINUTOS', '110'))
    agotados, ultimo = set(), 0.0

    class Agotado(Exception): pass

    def voz_de(f):
        lista = VOCES.get(f['s'], VOCES['f'])
        return lista[int(f['h'], 16) % len(lista)]

    def audio_de(d):
        # generateContent: candidates[].content.parts[].inlineData
        for c in d.get('candidates', []) or []:
            for pz in (c.get('content') or {}).get('parts', []) or []:
                dato = pz.get('inlineData') or pz.get('inline_data')
                if dato and dato.get('data'):
                    return base64.b64decode(dato['data']), dato.get('mimeType', '')
        # interactions: steps[].content[] type audio
        for st in d.get('steps', []) or []:
            for c in st.get('content', []) or []:
                if c.get('type') == 'audio' and c.get('data'):
                    return base64.b64decode(c['data']), c.get('mime_type', 'audio/wav')
        return None, ''

    def pedir(modelo, f):
        global ultimo
        espera = PAUSA - (time.time() - ultimo)
        if espera > 0: time.sleep(espera)
        ultimo = time.time()
        cab = {'x-goog-api-key': LLAVE, 'Content-Type': 'application/json'}
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent'
        cuerpo = {'contents': [{'parts': [{'text': f['t']}]}],
                  'generationConfig': {'responseModalities': ['AUDIO'],
                      'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voz_de(f)}}}}}
        r = requests.post(url, json=cuerpo, headers=cab, timeout=120)
        if r.status_code == 404 or (r.status_code == 400 and 'interactions' in r.text.lower()):
            url = 'https://generativelanguage.googleapis.com/v1beta/interactions'
            cuerpo = {'model': modelo,
                      'input': [{'type': 'user_input', 'content': [{'type': 'text', 'text': f['t']}]}],
                      'response_format': {'type': 'audio'},
                      'generation_config': {'speech_config': [{'voice': voz_de(f)}]}}
            r = requests.post(url, json=cuerpo, headers=cab, timeout=120)
        return r

    def generar(f):
        for intento in range(6):
            vivos = [m for m in MODELOS if m not in agotados]
            if not vivos: raise Agotado()
            modelo = vivos[0]
            r = pedir(modelo, f)
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
                raise RuntimeError('Google no aceptó esta frase: ' + txt[:200])
            time.sleep(10 * (intento + 1))
        raise RuntimeError('no salió')

    usados = {}
    for f in mias:
        if time.time() - t0 > TOPE_MIN * 60:
            print('  se acabó el tiempo de hoy; mañana sigue', flush=True); break
        try:
            crudo, tipo, modelo = generar(f)
            base = os.path.join(salida, f['h'] + '-g')
            if crudo[:4] == b'RIFF':
                open(base + '.wav', 'wb').write(crudo); a_mp3(base + '.wav', base + '.mp3'); os.remove(base + '.wav')
            else:
                tasa = re.search(r'rate=(\d+)', tipo); tasa = tasa.group(1) if tasa else '24000'
                open(base + '.pcm', 'wb').write(crudo)
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', tasa, '-ac', '1',
                                '-i', base + '.pcm', base + '.wav'], check=True)
                os.remove(base + '.pcm'); a_mp3(base + '.wav', base + '.mp3'); os.remove(base + '.wav')
            usados[modelo] = usados.get(modelo, 0) + 1
            hechas += 1
        except Agotado:
            print('  todos los modelos gratis se acabaron por hoy; mañana sigue', flush=True); break
        except SystemExit:
            raise
        except Exception:
            fallas += 1; traceback.print_exc()
        if (hechas + fallas) % 10 == 0:
            print(f'  {hechas + fallas}/{len(mias)} · {time.time() - t0:.0f}s · {usados}', flush=True)
    print('modelos usados:', usados, '| faltan', len(mias) - hechas, flush=True)

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
