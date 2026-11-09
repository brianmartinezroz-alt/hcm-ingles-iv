"""
Audios con dos o más personas (Kokoro, modelo abierto y gratis).

Una frase es diálogo cuando sus turnos van separados por " — " y cada turno
termina en . ? o !  (así "How do you speak English — slowly or quickly?" NO
cuenta como diálogo). Cada turno puede llevar quién habla: "Captain: ...".
La etiqueta se ve en el texto de la app, pero no se lee en voz alta.

Cada persona tiene su propia voz y entre turno y turno hay una pausa (Brian:
ritmo natural, con pausas entre hablantes; no bajar la velocidad).
"""
import os, re, subprocess

SEP = re.compile(r'(?<=[.?!])\s+[—–]\s+')
ETQ = re.compile(r"^([A-Z][A-Za-zÁÉÍÓÚáéíóúñ'. ]{0,24}):\s+")
MUJER = re.compile(r'\b(woman|ms|mrs|miss|teller|clerk|nurse|luna|ana|sofia|sofía|maria|maría|ortiz|soto|lisa|sarah|mary)\b', re.I)
VOCES = {'m': ['am_michael', 'am_fenrir', 'am_eric', 'am_liam'],
         'f': ['af_heart', 'af_bella', 'af_nicole', 'af_sarah']}
PAUSA = 0.7      # segundos entre una persona y otra


def turnos(texto):
    """[(etiqueta o None, lo que dice)] o [] si no es diálogo."""
    partes = SEP.split(texto.strip())
    if len(partes) < 2:
        return []
    out = []
    for p in partes:
        m = ETQ.match(p)
        out.append((m.group(1).strip(), p[m.end():].strip()) if m else (None, p.strip()))
    return out


def reparto(ts, sexo_frase='m'):
    """A cada persona, una voz distinta. Sin etiquetas: A, B, A, B…"""
    quien = []
    for i, (etq, _) in enumerate(ts):
        quien.append(etq if etq else ('A' if i % 2 == 0 else 'B'))
    orden = list(dict.fromkeys(quien))
    usadas, voz = {'m': 0, 'f': 0}, {}
    for k, q in enumerate(orden):
        if q in ('A', 'B'):
            s = sexo_frase if q == 'A' else ('f' if sexo_frase == 'm' else 'm')
        elif MUJER.search(q):
            s = 'f'
        elif q.lower() in ('man',):
            s = 'm'
        else:
            # sin pista: se alternan para que se distingan
            s = 'm' if k % 2 == 0 else 'f'
        voz[q] = VOCES[s][usadas[s] % len(VOCES[s])]
        usadas[s] += 1
    return [voz[q] for q in quien]


def generar(kokoro, texto, sexo, wav_salida, idioma='en-us'):
    """Arma el diálogo completo en un .wav. Devuelve las voces usadas."""
    import numpy as np, soundfile as sf
    ts = turnos(texto)
    voces = reparto(ts, sexo)
    sr, trozos = 24000, []
    for (etq, dice), v in zip(ts, voces):
        audio, sr = kokoro.create(dice, voice=v, speed=1.0, lang=idioma)
        if trozos:
            trozos.append(np.zeros(int(PAUSA * sr), dtype=np.float32))
        trozos.append(np.asarray(audio, dtype=np.float32))
    sf.write(wav_salida, np.concatenate(trozos), sr)
    return voces


if __name__ == '__main__':
    for t in ["Captain: Private, bring me the reports, please. — Private: Yes, sir. — Sergeant: What did the captain ask you to do? — Private: He asked me to bring the reports.",
              "I have a terrible headache. — You should take an aspirin and lie down.",
              "How do you speak English — slowly or quickly?",
              "Colonel: Please don't smoke near the trucks. — Cadet Díaz: What did the colonel say? — Cadet Luna: He asked us not to smoke near the trucks."]:
        ts = turnos(t)
        print(ts and list(zip([e for e, _ in ts], reparto(ts, 'm'))) or 'no es diálogo')
