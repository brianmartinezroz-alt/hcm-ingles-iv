"""
Genera el audio de todas las frases de la app, una vez, en los servidores
gratuitos de GitHub (GitHub Actions). El resultado son archivos mp3 que se
guardan en el repositorio, en voz/<llave>.mp3, y la app los toca directo:
sin servidor de voz, sin facturación y sin internet una vez guardados.

Motores (los dos son de código abierto y gratuitos):
  chatterbox  Resemble AI · licencia MIT · la alternativa abierta a ElevenLabs
  kokoro      hexgrad · Apache-2.0 · más rápido; voces de hombre y de mujer

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

mias = [f for i, f in enumerate(frases) if i % total == parte and f['h'] not in ya]
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
else:
    sys.exit('motor desconocido: ' + motor)

print(f'listo: {hechas} hechas, {fallas} fallaron, {time.time() - t0:.0f}s', flush=True)
