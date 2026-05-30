'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Loader2, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import type { VoiceFormType } from '@/lib/types';

interface VoiceFormDictationProps<T> {
  formType: VoiceFormType;
  onParsed: (data: T) => void;
  label?: string;
  className?: string;
}

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

export function VoiceFormDictation<T>({
  formType,
  onParsed,
  label = 'Dictate full form',
  className,
}: VoiceFormDictationProps<T>) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
    setError(null);
    setSuccess(null);
    setTranscript('');
    finalTextRef.current = '';
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev) => {
      let interim = '';
      let finalText = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) finalTextRef.current += finalText;
      setTranscript((finalTextRef.current + interim).trim());
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

  const submit = async () => {
    const text = transcript.trim();
    if (!text) {
      setError('No transcript to parse');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/parse-voice-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, formType }),
      });
      const json = (await res.json()) as
        | { ok: true; data: T }
        | { ok: false; error: string };
      if (!json.ok) {
        setError(json.error || 'Could not parse transcript');
        return;
      }
      onParsed(json.data);
      setSuccess('Form pre-filled — review and submit.');
      setTranscript('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={clsx('rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={listening ? stop : start}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition',
            listening
              ? 'bg-rose-50 text-rose-700 ring-rose-200 animate-pulse'
              : 'bg-white dark:bg-slate-900 text-brand-700 ring-brand-200 hover:bg-brand-50'
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          {listening ? 'Stop' : label}
        </button>
        {transcript ? (
          <button
            type="button"
            onClick={submit}
            disabled={busy || listening}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Fill form
          </button>
        ) : null}
        {transcript ? (
          <button
            type="button"
            onClick={() => {
              setTranscript('');
              finalTextRef.current = '';
            }}
            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200"
          >
            <X className="h-3 w-3" /> clear
          </button>
        ) : null}
      </div>
      {transcript ? (
        <div className="mt-2 rounded bg-white dark:bg-slate-900 p-2 text-xs text-slate-700 dark:text-slate-200 ring-1 ring-slate-100">
          {transcript}
        </div>
      ) : null}
      {error ? (
        <div className="mt-2 text-xs text-rose-600">{error}</div>
      ) : null}
      {success ? (
        <div className="mt-2 text-xs text-emerald-600">{success}</div>
      ) : null}
    </div>
  );
}
