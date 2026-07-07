// Composer — barra de digitação do chat: texto, foto (câmera/galeria/GPS),
// vídeo e gravação de áudio. Reusa FotoGeoTag e useGravadorAudio.
import React, { useState, useRef } from 'react';
import { Send, Plus, Camera, Image as ImageIcon, MapPin, Mic, Square, X, Trash2 } from 'lucide-react';
import { T } from '../shared';
import { FotoGeoTag } from '../camera/FotoGeoTag';
import { useGravadorAudio } from './useGravadorAudio';
import { enviarTexto, enviarAnexo } from './chat-api';

const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function Composer({ convId, podePostar = true, onEnviado, showToast }) {
  const [texto, setTexto]     = useState('');
  const [menu, setMenu]       = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fotoRef  = useRef(null);
  const galRef   = useRef(null);

  const grav = useGravadorAudio({
    onPronto: async (blob, dur) => {
      try {
        setEnviando(true);
        const msg = await enviarAnexo(convId, blob, { tipo: 'audio', duracao_s: dur, nome: 'audio.webm' });
        onEnviado?.(msg);
      } catch (e) { showToast?.('Falha ao enviar áudio: ' + e.message); }
      finally { setEnviando(false); }
    },
  });

  if (!podePostar) {
    return (
      <div style={{ padding: '12px 16px', textAlign: 'center', color: T.muted, fontSize: '.82rem',
        borderTop: `1px solid ${T.bord}`, background: T.bg1 }}>
        🔒 Apenas administradores podem postar neste canal.
      </div>
    );
  }

  const submitTexto = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto('');
    try {
      const msg = await enviarTexto(convId, t);
      if (!msg?.queued) onEnviado?.(msg);
    } catch (e) { showToast?.('Falha ao enviar: ' + e.message); setTexto(t); }
  };

  const enviarArquivo = async (file, tipo, meta = {}) => {
    if (!file) return;
    try {
      setEnviando(true); setMenu(false);
      const msg = await enviarAnexo(convId, file, { tipo, nome: file.name, ...meta });
      onEnviado?.(msg);
    } catch (e) { showToast?.('Falha ao enviar: ' + e.message); }
    finally { setEnviando(false); }
  };

  const onGaleria = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const tipo = f.type.startsWith('video') ? 'video' : 'foto';
    enviarArquivo(f, tipo);
    e.target.value = '';
  };
  const onCamera = (e) => {
    const f = e.target.files?.[0]; if (f) enviarArquivo(f, 'foto');
    e.target.value = '';
  };

  // Gravando áudio: UI dedicada
  if (grav.gravando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderTop: `1px solid ${T.bord}`, background: T.bg1 }}>
        <button type="button" onClick={grav.cancelar} aria-label="Cancelar"
          style={btnIcon(T.red)}><Trash2 size={18} /></button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: T.red, fontWeight: 700 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.red, animation: 'cmp-pulse 1.2s infinite' }} />
          Gravando… {fmtT(grav.tempo)}
        </div>
        <button type="button" onClick={grav.parar} aria-label="Enviar áudio"
          style={btnIcon(T.green)}><Send size={18} /></button>
        <style>{`@keyframes cmp-pulse{0%{opacity:1}50%{opacity:.3}100%{opacity:1}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${T.bord}`, background: T.bg1 }}>
      {menu && (
        <div style={{ display: 'flex', gap: 10, padding: '10px 16px', flexWrap: 'wrap', borderBottom: `1px solid ${T.bord}` }}>
          <AnexoBtn icon={<Camera size={18} />} label="Câmera" onClick={() => fotoRef.current?.click()} />
          <AnexoBtn icon={<ImageIcon size={18} />} label="Galeria" onClick={() => galRef.current?.click()} />
          <div>
            <FotoGeoTag label="Foto GPS"
              onCaptured={(blob, meta) => enviarArquivo(new File([blob], 'foto.jpg', { type: 'image/jpeg' }), 'foto', { lat: meta.lat, lng: meta.lng })} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 12px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => setMenu(m => !m)} aria-label="Anexar"
          style={btnIcon(menu ? T.red : T.green)}>
          {menu ? <X size={20} /> : <Plus size={20} />}
        </button>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTexto(); } }}
          placeholder={enviando ? 'Enviando…' : 'Mensagem'}
          rows={1}
          style={{
            flex: 1, resize: 'none', maxHeight: 120, minHeight: 40, padding: '10px 12px',
            borderRadius: 20, border: `1px solid ${T.bord}`, background: T.card, color: T.text,
            fontFamily: 'inherit', fontSize: '.9rem', lineHeight: 1.3, outline: 'none',
          }}
        />
        {texto.trim()
          ? <button type="button" onClick={submitTexto} aria-label="Enviar" style={btnIcon(T.green)}><Send size={20} /></button>
          : <button type="button" onClick={grav.iniciar} aria-label="Gravar áudio" style={btnIcon(T.green)}><Mic size={20} /></button>}
      </div>

      <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={onCamera} style={{ display: 'none' }} />
      <input ref={galRef} type="file" accept="image/*,video/*" onChange={onGaleria} style={{ display: 'none' }} />
    </div>
  );
}

function AnexoBtn({ icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none',
        border: `1px solid ${T.bord}`, borderRadius: 12, padding: '10px 14px', cursor: 'pointer', color: T.text }}>
      <span style={{ color: T.green }}>{icon}</span>
      <span style={{ fontSize: '.72rem' }}>{label}</span>
    </button>
  );
}

function btnIcon(cor) {
  return {
    width: 42, height: 42, minWidth: 42, borderRadius: '50%', border: 'none', background: cor, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', touchAction: 'manipulation',
  };
}
