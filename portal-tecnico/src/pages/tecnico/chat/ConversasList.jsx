// ConversasList — lista de conversas com abas (Conversas / Avisos) e botão novo.
import React, { useState } from 'react';
import { MessageCircle, Megaphone, Plus, Users } from 'lucide-react';
import { T, fmtH } from '../shared';
import { PresenceDot } from './PresenceDot';

const PREVIA = { foto: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', arquivo: '📎 Arquivo', os_ref: '🔧 OS' };

export function ConversasList({ conversas, meuId, ehAdmin, onAbrir, onNova, onNovoCanal }) {
  const [aba, setAba] = useState('conversas'); // conversas | avisos
  const canais = conversas.filter(c => c.tipo === 'canal');
  const diretas = conversas.filter(c => c.tipo !== 'canal');
  const lista = aba === 'avisos' ? canais : diretas;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: T.bg }}>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: `1px solid ${T.bord}`, background: T.bg1 }}>
        <Tab ativo={aba === 'conversas'} onClick={() => setAba('conversas')} icon={<MessageCircle size={15} />} label="Conversas" />
        <Tab ativo={aba === 'avisos'} onClick={() => setAba('avisos')} icon={<Megaphone size={15} />} label="Avisos"
          badge={canais.reduce((s, c) => s + (c.unread || 0), 0)} />
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {lista.length === 0 && (
          <div style={{ textAlign: 'center', color: T.muted, fontSize: '.85rem', padding: 40 }}>
            {aba === 'avisos' ? 'Nenhum canal de avisos ainda.' : 'Nenhuma conversa. Toque em + para começar.'}
          </div>
        )}
        {lista.map(c => (
          <button key={c.id} type="button" onClick={() => onAbrir(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
              padding: '11px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${T.bg2}`, cursor: 'pointer' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <AvatarMini c={c} />
              {c.tipo === 'dm' && <span style={{ position: 'absolute', bottom: 0, right: 0 }}><PresenceDot online={c.online} /></span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: T.text, fontSize: '.9rem', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo || 'Conversa'}</span>
                <span style={{ fontSize: '.7rem', color: T.muted, flexShrink: 0 }}>{c.ultima_mensagem_em ? fmtH(c.ultima_mensagem_em) : ''}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: '.8rem', color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {previaTexto(c, meuId)}
                </span>
                {c.unread > 0 && (
                  <span style={{ background: T.green, color: '#fff', fontSize: '.68rem', fontWeight: 800,
                    minWidth: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{c.unread}</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* FAB */}
      <div style={{ position: 'absolute', right: 18, bottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ehAdmin && aba === 'avisos' && (
          <button type="button" onClick={onNovoCanal} aria-label="Novo canal de avisos" style={fab(T.cyan)}>
            <Megaphone size={22} />
          </button>
        )}
        {aba === 'conversas' && (
          <button type="button" onClick={onNova} aria-label="Nova conversa" style={fab(T.green)}>
            <Plus size={26} />
          </button>
        )}
      </div>
    </div>
  );
}

function previaTexto(c, meuId) {
  if (!c.ultima_id) return c.tipo === 'canal' ? 'Canal de avisos' : 'Sem mensagens';
  const autor = c.ultima_autor_id === meuId ? 'Você: ' : (c.tipo !== 'dm' && c.ultima_autor_nome ? `${c.ultima_autor_nome.split(' ')[0]}: ` : '');
  const corpo = c.ultima_tipo === 'texto' ? (c.ultima_texto || '') : (PREVIA[c.ultima_tipo] || 'Mensagem');
  return autor + corpo;
}

function AvatarMini({ c }) {
  const letra = (c.titulo || '?').trim().charAt(0).toUpperCase();
  if (c.avatar_url) return <img src={c.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />;
  return (
    <div style={{ width: 46, height: 46, borderRadius: '50%', background: T.bg2, color: T.green,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.05rem' }}>
      {c.tipo === 'canal' ? <Megaphone size={20} /> : c.tipo === 'grupo' ? <Users size={20} /> : letra}
    </div>
  );
}

function Tab({ ativo, onClick, icon, label, badge }) {
  return (
    <button type="button" onClick={onClick}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px',
        borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem',
        background: ativo ? T.green : 'transparent', color: ativo ? '#fff' : T.muted }}>
      {icon}{label}
      {badge > 0 && (
        <span style={{ background: ativo ? '#fff' : T.green, color: ativo ? T.green : '#fff', fontSize: '.62rem',
          fontWeight: 800, minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '0 4px' }}>{badge}</span>
      )}
    </button>
  );
}

function fab(cor) {
  return {
    width: 54, height: 54, borderRadius: '50%', border: 'none', background: cor, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    boxShadow: `0 6px 18px ${cor}66`, touchAction: 'manipulation',
  };
}
