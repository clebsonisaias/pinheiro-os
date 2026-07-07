// ChatThread — cabeçalho + lista de mensagens + composer de uma conversa.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Megaphone, Users, ChevronDown } from 'lucide-react';
import { T, fmtDt } from '../shared';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { PresenceDot, ultimoVistoLabel } from './PresenceDot';
import { recibosAviso } from './chat-api';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const diaLabel = ts => {
  const d = new Date(ts), hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  const ont = new Date(hoje); ont.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ont.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
};

export function ChatThread({
  conversa, mensagens, meuId, minLidaOutros, temMais, carregando,
  onBack, onCarregarMais, onMarcarLido, onEnviado, showToast,
}) {
  const scrollRef = useRef(null);
  const fimRef    = useRef(null);
  const pertoFim  = useRef(true);   // usuário está perto do fim do thread?
  const [recibos, setRecibos] = useState(null); // { msg, lidos, pendentes } | null
  const ehCanal = conversa?.tipo === 'canal';
  const ehGrupo = conversa?.tipo === 'grupo';
  const podePostar = !conversa?.somente_admin_posta || conversa?.meu_papel === 'admin';
  const souAdminCanal = ehCanal && conversa?.meu_papel === 'admin';

  const scrollToBottom = useCallback((smooth = false) => {
    fimRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Rola pro fim e marca lido só quando o usuário já está no fim (não interrompe
  // quem está lendo o histórico rolado pra cima) e a aba está visível.
  const ultimaId = mensagens.length ? mensagens[mensagens.length - 1].id : null;
  const minhaUltima = mensagens.length ? mensagens[mensagens.length - 1].autor_id === meuId : false;
  useEffect(() => {
    if (pertoFim.current || minhaUltima) {
      scrollToBottom();
      if (ultimaId && document.visibilityState !== 'hidden') onMarcarLido?.(ultimaId);
    }
  }, [ultimaId, minhaUltima, scrollToBottom, onMarcarLido]);

  const onScroll = (e) => {
    const el = e.target;
    pertoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 40 && temMais && !carregando) onCarregarMais?.();
  };

  const verRecibos = async (msg) => {
    try {
      const r = await recibosAviso(conversa.id, msg.id);
      setRecibos({ msg, ...r });
    } catch (e) { showToast?.('Erro ao carregar leitura: ' + e.message); }
  };

  const subtitulo = ehCanal
    ? 'Canal de avisos · todos os funcionários'
    : ehGrupo
      ? `${conversa.participantes?.length || 0} participantes`
      : ultimoVistoLabel(conversa?.online, conversa?.ultimo_visto);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: T.bg }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderBottom: `1px solid ${T.bord}`, background: T.bg1, flexShrink: 0 }}>
        <button type="button" onClick={onBack} aria-label="Voltar"
          style={{ background: 'none', border: 'none', color: T.text, cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} />
        </button>
        <Avatar conversa={conversa} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '.95rem', color: T.text, display: 'flex', alignItems: 'center', gap: 6,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ehCanal && <Megaphone size={15} color={T.green} />}
            {ehGrupo && <Users size={15} color={T.green} />}
            {conversa?.titulo || 'Conversa'}
          </div>
          <div style={{ fontSize: '.72rem', color: T.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
            {conversa?.tipo === 'dm' && <PresenceDot online={conversa?.online} size={7} />}
            {subtitulo}
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
        {carregando && <div style={{ textAlign: 'center', color: T.muted, fontSize: '.75rem', padding: 6 }}>carregando…</div>}
        {mensagens.length === 0 && !carregando && (
          <div style={{ margin: 'auto', textAlign: 'center', color: T.muted, fontSize: '.85rem', padding: 24 }}>
            {ehCanal ? 'Nenhum aviso ainda.' : 'Nenhuma mensagem. Diga olá 👋'}
          </div>
        )}
        {mensagens.map((m, i) => {
          const prev = mensagens[i - 1];
          const novoDia = !prev || !sameDay(prev.criado_em, m.criado_em);
          const mine = m.autor_id === meuId;
          const mostrarAutor = (ehGrupo || ehCanal) && (!prev || prev.autor_id !== m.autor_id);
          return (
            <React.Fragment key={m.id}>
              {novoDia && (
                <div style={{ alignSelf: 'center', margin: '8px 0', fontSize: '.68rem', color: T.muted,
                  background: T.bg2, borderRadius: 10, padding: '3px 10px' }}>{diaLabel(m.criado_em)}</div>
              )}
              <MessageBubble
                msg={m} mine={mine} mostrarAutor={mostrarAutor}
                lido={Number(m.id) <= Number(minLidaOutros)}
                onVerRecibos={souAdminCanal && mine ? verRecibos : null}
              />
            </React.Fragment>
          );
        })}
        <div ref={fimRef} />
      </div>

      <Composer convId={conversa.id} podePostar={podePostar} onEnviado={onEnviado} showToast={showToast} />

      {recibos && <RecibosModal data={recibos} onClose={() => setRecibos(null)} />}
    </div>
  );
}

function Avatar({ conversa }) {
  const letra = (conversa?.titulo || '?').trim().charAt(0).toUpperCase();
  if (conversa?.avatar_url) {
    return <img src={conversa.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />;
  }
  return (
    <div style={{ width: 38, height: 38, borderRadius: '50%', background: T.bg2, color: T.green,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>
      {conversa?.tipo === 'canal' ? '📣' : letra}
    </div>
  );
}

function RecibosModal({ data, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.card, borderRadius: '16px 16px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '70vh', overflowY: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ color: T.text }}>Confirmação de leitura</strong>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ChevronDown size={22} color={T.muted} />
          </button>
        </div>
        <Secao titulo={`✓ Leram (${data.lidos.length})`} lista={data.lidos} sufixo={p => p.lido_em ? fmtDt(p.lido_em) : ''} />
        <Secao titulo={`⏳ Pendentes (${data.pendentes.length})`} lista={data.pendentes} />
      </div>
    </div>
  );
}
function Secao({ titulo, lista, sufixo }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: '.75rem', fontWeight: 700, color: T.muted, margin: '6px 0' }}>{titulo}</div>
      {lista.length === 0 && <div style={{ color: T.nano, fontSize: '.8rem' }}>—</div>}
      {lista.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 2px' }}>
          <span style={{ color: T.text, fontSize: '.86rem' }}>{p.nome}</span>
          {sufixo && <span style={{ color: T.muted, fontSize: '.72rem' }}>{sufixo(p)}</span>}
        </div>
      ))}
    </div>
  );
}
