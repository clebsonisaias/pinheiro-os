// VozRelatorio.jsx — botão de gravação que transcreve fala via Whisper.
// Drop-in para qualquer textarea: chama `onTranscript(texto)` para o pai concatenar.
//
// Uso:
//   <textarea value={obs} onChange={e => setObs(e.target.value)} />
//   <VozRelatorio
//     contexto="Fechamento de OS de reparo FTTH. ONU, splitter, dBm."
//     onTranscript={(t) => setObs(prev => (prev ? prev + ' ' : '') + t)}
//   />

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle, Check } from 'lucide-react';
import { T } from '../shared';
import { transcrever } from './ia-api';

export function VozRelatorio({ onTranscript, contexto = null, label = 'Ditar', maxSegundos = 90 }) {
  const [estado, setEstado] = useState('idle'); // idle | gravando | enviando | ok | erro
  const [erro, setErro]     = useState('');
  const [tempo, setTempo]   = useState(0);

  const mediaRef  = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tmrRef    = useRef(null);

  // Cleanup robusto
  useEffect(() => () => {
    if (tmrRef.current) clearInterval(tmrRef.current);
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      try { mediaRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  }, []);

  // Auto-stop ao bater o limite (evita arquivo gigante)
  useEffect(() => {
    if (estado === 'gravando' && tempo >= maxSegundos) parar();
    // eslint-disable-next-line
  }, [tempo, estado]);

  const iniciar = async () => {
    setErro(''); setTempo(0); chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // codec opus é universalmente aceito pelo Whisper
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 1200) {
          setEstado('erro'); setErro('Áudio muito curto'); return;
        }

        setEstado('enviando');
        try {
          const texto = await transcrever(blob, contexto);
          if (texto && texto.trim()) {
            onTranscript?.(texto.trim());
            setEstado('ok');
            setTimeout(() => setEstado('idle'), 1800);
          } else {
            setEstado('erro'); setErro('Não consegui entender o áudio');
          }
        } catch (e) {
          setEstado('erro'); setErro(e.message || 'Falha ao transcrever');
        }
      };
      mr.start();
      mediaRef.current = mr;
      setEstado('gravando');
      tmrRef.current = setInterval(() => setTempo(t => t + 1), 1000);
    } catch (e) {
      setErro(e.name === 'NotAllowedError' ? 'Permissão de microfone negada' : 'Microfone indisponível');
      setEstado('erro');
    }
  };

  const parar = () => {
    if (tmrRef.current) { clearInterval(tmrRef.current); tmrRef.current = null; }
    if (mediaRef.current && mediaRef.current.state === 'recording') {
      try { mediaRef.current.stop(); } catch {}
    }
  };

  const click = () => {
    if (estado === 'gravando') parar();
    else if (estado !== 'enviando') iniciar();
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const gravando = estado === 'gravando';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={click}
        disabled={estado === 'enviando'}
        aria-label={gravando ? 'Parar gravação' : 'Iniciar gravação por voz'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '9px 14px', borderRadius: 999,
          background: gravando ? T.red : T.green,
          color: '#fff', border: 'none',
          fontWeight: 700, fontSize: '.82rem', fontFamily: 'inherit',
          cursor: estado === 'enviando' ? 'wait' : 'pointer',
          boxShadow: gravando ? 'none' : '0 2px 8px rgba(22,163,74,.3)',
          animation: gravando ? 'voz-pulse 1.4s ease-out infinite' : 'none',
          transition: 'transform .12s',
        }}
      >
        {gravando ? <Square size={13} fill="#fff"/> : <Mic size={14}/>}
        {gravando ? fmt(tempo) : label}
      </button>

      {estado === 'enviando' && (
        <span style={{ color: T.muted, fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Loader2 size={13} className="voz-spin"/> Transcrevendo…
        </span>
      )}
      {estado === 'ok' && (
        <span style={{ color: T.green, fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Check size={13}/> Transcrito
        </span>
      )}
      {estado === 'erro' && erro && (
        <span style={{ color: T.red, fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={13}/> {erro}
        </span>
      )}
      {gravando && tempo > maxSegundos - 15 && (
        <span style={{ color: T.amber, fontSize: '.72rem' }}>{maxSegundos - tempo}s restantes</span>
      )}

      <style>{`
        @keyframes voz-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(220,38,38,.55); }
          70%  { box-shadow: 0 0 0 14px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0   rgba(220,38,38,0); }
        }
        @keyframes voz-spin { to { transform: rotate(360deg); } }
        .voz-spin { animation: voz-spin .8s linear infinite; }
      `}</style>
    </div>
  );
}
