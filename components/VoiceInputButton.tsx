'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import clsx from 'clsx';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  mode?: 'append' | 'replace';
  language?: string;
  className?: string;
  title?: string;
}

// Minimal type surface for the Web Speech API which TS does not ship.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceInputButton({
  onTranscript,
  mode = 'append',
  language = 'en-IN',
  className,
  title,
}: VoiceInputButtonProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTextRef = useRef('');

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  if (!supported) return null;

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = language;
    rec.interimResults = true;
    rec.continuous = false;
    finalTextRef.current = '';
    rec.onresult = (ev) => {
      let interim = '';
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const text = r[0].transcript;
        if (r.isFinal) finalText += text;
        else interim += text;
      }
      if (finalText) {
        finalTextRef.current += finalText;
      }
      const combined = (finalTextRef.current + interim).trim();
      if (combined) {
        onTranscript(combined);
      }
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onerror = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const stop = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const toggle = () => {
    if (listening) stop();
    else start();
  };

  // mode prop is exposed for forms that want to control replace/append upstream;
  // when 'replace', forms should reset their field before passing onTranscript.
  void mode;

  return (
    <button
      type="button"
      onClick={toggle}
      title={title ?? (listening ? 'Stop listening' : 'Voice input')}
      aria-pressed={listening}
      className={clsx(
        'inline-flex items-center justify-center rounded-md p-1.5 ring-1 transition',
        listening
          ? 'bg-rose-50 text-rose-600 ring-rose-200 animate-pulse'
          : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
        className
      )}
    >
      {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}
