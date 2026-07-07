// MessageBubble — uma mensagem no thread. Própria à direita (verde), demais
// à esquerda. Renderiza texto, foto, áudio e vídeo. ✓/✓✓ de leitura.
import React from 'react';
import { Check, CheckCheck, FileText, MapPin } from 'lucide-react';
import { T, fmtH } from '../shared';

const PREVIA_TIPO = { foto: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', arquivo: '📎 Arquivo' };

export function MessageBubble({ msg, mine, mostrarAutor, lido, onVerRecibos }) {
  const anexo = msg.anexos?.[0];
  const bg   = mine ? T.green : T.card;
  const cor  = mine ? '#fff' : T.text;
  const brd  = mine ? T.green : T.bord;

  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', padding: '2px 10px' }}>
      <div style={{ maxWidth: '78%', minWidth: 60 }}>
        {mostrarAutor && !mine && (
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: T.green, margin: '2px 8px 1px' }}>
            {msg.autor_nome || '—'}
          </div>
        )}
        <div style={{
          background: bg, color: cor, border: `1px solid ${brd}`,
          borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4,
          padding: anexo && anexo.tipo === 'foto' ? 4 : '8px 11px',
          boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden',
        }}>
          {/* Mídia */}
          {anexo?.tipo === 'foto' && (
            <a href={anexo.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              <img src={anexo.url} alt="foto" loading="lazy"
                style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 11, display: 'block' }} />
            </a>
          )}
          {anexo?.tipo === 'audio' && (
            <audio controls preload="none" src={anexo.url} style={{ width: 230, maxWidth: '70vw', display: 'block' }} />
          )}
          {anexo?.tipo === 'video' && (
            <video controls preload="metadata" src={anexo.url}
              style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 11, display: 'block' }} />
          )}
          {anexo?.tipo === 'arquivo' && (
            <a href={anexo.url} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: cor, textDecoration: 'none', padding: '4px 2px' }}>
              <FileText size={20} /> <span style={{ fontSize: '.85rem' }}>{anexo.nome_original || 'arquivo'}</span>
            </a>
          )}

          {/* Legenda / texto */}
          {msg.texto && (
            <div style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '.9rem', lineHeight: 1.35,
              padding: anexo ? '6px 4px 0' : 0,
            }}>{msg.texto}</div>
          )}
          {!msg.texto && anexo && anexo.tipo !== 'foto' && !PREVIA_TIPO[anexo.tipo] && (
            <div style={{ fontSize: '.85rem' }}>{anexo.nome_original}</div>
          )}
          {anexo?.lat != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '.68rem', opacity: .8, marginTop: 4 }}>
              <MapPin size={11} /> {anexo.lat.toFixed(5)}, {anexo.lng?.toFixed(5)}
            </div>
          )}

          {/* Rodapé: hora + status de leitura */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
            fontSize: '.66rem', marginTop: 3, opacity: .85,
            color: mine ? 'rgba(255,255,255,.9)' : T.muted,
          }}>
            <span>{fmtH(msg.criado_em)}</span>
            {mine && (lido
              ? <CheckCheck size={14} style={{ color: mine ? '#bff0d0' : T.cyan }} />
              : <Check size={13} />)}
          </div>
        </div>

        {onVerRecibos && (
          <button type="button" onClick={() => onVerRecibos(msg)}
            style={{ background: 'none', border: 'none', color: T.cyan, fontSize: '.7rem', cursor: 'pointer', padding: '2px 8px' }}>
            Quem leu
          </button>
        )}
      </div>
    </div>
  );
}
