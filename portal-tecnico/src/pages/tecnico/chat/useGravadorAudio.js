// useGravadorAudio — hook de gravação de áudio (MediaRecorder/webm-opus).
// Mesmo padrão do VozRelatorio, mas devolve o Blob para envio como anexo
// (em vez de transcrever). Auto-para no limite de tempo.

import { useState, useRef, useEffect, useCallback } from 'react';

export function useGravadorAudio({ maxSegundos = 300, onPronto } = {}) {
  const [estado, setEstado] = useState('idle'); // idle | gravando | erro
  const [erro, setErro]     = useState('');
  const [tempo, setTempo]   = useState(0);

  const mediaRef  = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tmrRef    = useRef(null);

  useEffect(() => () => {
    if (tmrRef.current) clearInterval(tmrRef.current);
    // Ao desmontar durante a gravação: cancela (não dispara onstop/envio).
    if (mediaRef.current) mediaRef.current.onstop = null;
    if (mediaRef.current?.state === 'recording') { try { mediaRef.current.stop(); } catch {} }
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const parar = useCallback(() => {
    if (tmrRef.current) { clearInterval(tmrRef.current); tmrRef.current = null; }
    if (mediaRef.current?.state === 'recording') { try { mediaRef.current.stop(); } catch {} }
  }, []);

  const iniciar = useCallback(async () => {
    setErro(''); setTempo(0); chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const dur = tempoRef.current;
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setEstado('idle');
        if (blob.size < 1200) { setErro('Áudio muito curto'); return; }
        onPronto?.(blob, dur);
      };
      mr.start();
      mediaRef.current = mr;
      setEstado('gravando');
      tmrRef.current = setInterval(() => setTempo(t => t + 1), 1000);
    } catch (e) {
      setErro(e.name === 'NotAllowedError' ? 'Permissão de microfone negada' : 'Microfone indisponível');
      setEstado('erro');
    }
  }, [onPronto]);

  const cancelar = useCallback(() => {
    chunksRef.current = [];
    if (tmrRef.current) { clearInterval(tmrRef.current); tmrRef.current = null; }
    if (mediaRef.current) mediaRef.current.onstop = null;
    if (mediaRef.current?.state === 'recording') { try { mediaRef.current.stop(); } catch {} }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setEstado('idle'); setTempo(0);
  }, []);

  // Mantém o tempo atual acessível dentro do onstop
  const tempoRef = useRef(0);
  useEffect(() => { tempoRef.current = tempo; }, [tempo]);
  useEffect(() => { if (estado === 'gravando' && tempo >= maxSegundos) parar(); }, [tempo, estado, maxSegundos, parar]);

  return { estado, erro, tempo, gravando: estado === 'gravando', iniciar, parar, cancelar };
}
