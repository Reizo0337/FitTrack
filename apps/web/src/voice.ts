import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API: reconocimiento y síntesis de voz del navegador. Los tipos no vienen en lib.dom de forma fiable.
type RecResult = { isFinal: boolean; 0: { transcript: string } };
type RecEvent = { resultIndex: number; results: ArrayLike<RecResult> };
type Rec = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: RecEvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};
const recognitionCtor = (): (new () => Rec) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const dictationSupported = () => typeof window !== 'undefined' && !!recognitionCtor();
export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Quita el Markdown para que la voz no lea «asterisco asterisco» ni símbolos. */
export function plainSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ', ')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/([:;,])\.\s?/g, '$1 ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const dictationError = (code: string) => (
  code === 'not-allowed' || code === 'service-not-allowed' ? 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador.'
    : code === 'no-speech' ? 'No te he oído. Inténtalo de nuevo.'
      : code === 'audio-capture' ? 'No se detecta ningún micrófono.'
        : code === 'network' ? 'El servicio de voz del navegador no responde (¿sin conexión?).'
          : code === 'aborted' ? '' : 'No se pudo usar el micrófono.'
);

/** Dictado en español. `onInterim` recibe el texto provisional; `onFinal` el definitivo cuando dejas de hablar. */
export function useDictation(onInterim: (text: string) => void, onFinal: (text: string) => void) {
  const supported = dictationSupported();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef<Rec | null>(null);
  const cb = useRef({ onInterim, onFinal });
  cb.current = { onInterim, onFinal };

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const C = recognitionCtor();
    if (!C) return;
    rec.current?.abort();
    const r = new C();
    r.lang = 'es-ES'; r.interimResults = true; r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
      }
      cb.current.onInterim((finalText + interim).trim());
    };
    r.onerror = (e) => setError(dictationError(e.error));
    r.onend = () => { setListening(false); rec.current = null; if (finalText.trim()) cb.current.onFinal(finalText.trim()); };
    setError('');
    try { r.start(); setListening(true); rec.current = r; } catch { setError('No se pudo iniciar el micrófono.'); }
  }, []);
  useEffect(() => () => { rec.current?.abort(); }, []);
  return { supported, listening, error, start, stop };
}

/** Lectura en voz alta (es-ES). */
export function useSpeaker() {
  const supported = speechSupported();
  const [speaking, setSpeaking] = useState(false);
  const stop = useCallback(() => { if (supported) { speechSynthesis.cancel(); setSpeaking(false); } }, [supported]);
  /** iOS solo deja hablar tras un gesto del usuario: se llama desde un clic para «desbloquear» la voz. */
  const unlock = useCallback(() => { if (supported) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } }, [supported]);
  const speak = useCallback((text: string) => {
    if (!supported || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith('es'));
    if (v) u.voice = v;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
  }, [supported]);
  useEffect(() => () => { if (supported) speechSynthesis.cancel(); }, [supported]);
  return { supported, speaking, speak, stop, unlock };
}
