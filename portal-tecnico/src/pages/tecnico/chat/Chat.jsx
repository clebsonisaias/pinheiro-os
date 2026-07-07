// Chat.jsx — orquestrador do chat interno (default export usado por TecnicoApp).
// Views: lista | thread | nova | canal. Tempo real via useTecnicoRealtime
// (singleton SSE compartilhado — não abre segunda conexão).
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { T } from '../shared';
import { useTec } from '../TecnicoContext';
import { useTecnicoRealtime, tocarBeep, vibrar } from '../useTecnicoRealtime';
import { ConversasList } from './ConversasList';
import { ChatThread } from './ChatThread';
import { NovaConversa } from './NovaConversa';
import {
  listarConversas, detalheConversa, listarMensagens, marcarLido as apiMarcarLido,
} from './chat-api';

export default function Chat({ initialConvId = null, resetSignal = 0 }) {
  const { user, showToast } = useTec();
  const meuId = user?.id;
  const ehAdmin = (user?.role || localStorage.getItem('pinheiro_role')) === 'admin';

  const [view, setView]           = useState('lista'); // lista | thread | nova | canal
  const [conversas, setConversas] = useState([]);
  const [conversa, setConversa]   = useState(null);     // detalhe da conversa aberta
  const [mensagens, setMensagens] = useState([]);
  const [minLida, setMinLida]     = useState(0);
  const [temMais, setTemMais]     = useState(false);
  const [carregando, setCarregando] = useState(false);

  const convAbertaRef = useRef(null);
  useEffect(() => { convAbertaRef.current = conversa?.id ?? null; }, [conversa]);

  /* ── Carregamentos ─────────────────────────────────────────────────────── */
  const carregarConversas = useCallback(async () => {
    try { const r = await listarConversas(); setConversas(r.items || []); }
    catch (e) { console.warn('[chat] conversas:', e.message); }
  }, []);

  const abrirConversa = useCallback(async (conv) => {
    setView('thread');
    setCarregando(true);
    setMensagens([]); setMinLida(0); setTemMais(false);
    try {
      const [det, msgs] = await Promise.all([
        detalheConversa(conv.id),
        listarMensagens(conv.id, { limit: 40 }),
      ]);
      setConversa(det);
      setMensagens(msgs.items || []);
      setMinLida(Number(msgs.min_lida_outros || 0));
      setTemMais(!!msgs.tem_mais);
    } catch (e) { showToast?.('Erro ao abrir conversa: ' + e.message); setView('lista'); }
    finally { setCarregando(false); }
  }, [showToast]);

  const carregarMais = useCallback(async () => {
    if (!conversa || !mensagens.length) return;
    setCarregando(true);
    try {
      const r = await listarMensagens(conversa.id, { before: mensagens[0].id, limit: 40 });
      setMensagens(prev => [...(r.items || []), ...prev]);
      setTemMais(!!r.tem_mais);
    } catch (e) { console.warn('[chat] mais:', e.message); }
    finally { setCarregando(false); }
  }, [conversa, mensagens]);

  const marcarLido = useCallback(async (ateMsgId) => {
    if (!conversa) return;
    try { await apiMarcarLido(conversa.id, ateMsgId); } catch {}
    setConversas(prev => prev.map(c => c.id === conversa.id ? { ...c, unread: 0 } : c));
  }, [conversa]);

  const appendMsg = useCallback((msg) => {
    setMensagens(prev => prev.some(m => String(m.id) === String(msg.id)) ? prev : [...prev, msg]);
  }, []);

  /* ── Boot + conversa inicial ───────────────────────────────────────────── */
  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  // Tocar "Chat" na barra de navegação (estando dentro de uma conversa) volta à lista.
  const primeiroReset = useRef(true);
  useEffect(() => {
    if (primeiroReset.current) { primeiroReset.current = false; return; }
    setView('lista'); setConversa(null); setMensagens([]); carregarConversas();
  }, [resetSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initialConvId) abrirConversa({ id: initialConvId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConvId]);

  /* ── Tempo real ────────────────────────────────────────────────────────── */
  useTecnicoRealtime({
    userId: meuId,
    onNovaMensagem: (data) => {
      const abertaId = convAbertaRef.current;
      if (data.conversa_id && String(data.conversa_id) === String(abertaId)) {
        appendMsg(data.mensagem);
        if (data.mensagem?.autor_id !== meuId) marcarLido(data.mensagem.id);
      } else if (data.mensagem?.autor_id !== meuId) {
        tocarBeep(); vibrar([120]);
      }
      carregarConversas();
    },
    onStatusMensagem: (data) => {
      if (String(data.conversa_id) === String(convAbertaRef.current)) {
        setMinLida(prev => Math.max(prev, Number(data.ate_msg_id || 0)));
      }
    },
    onPoll: () => {
      carregarConversas();
      // atualiza presença/detalhe da conversa aberta
      if (convAbertaRef.current) detalheConversa(convAbertaRef.current).then(setConversa).catch(() => {});
    },
  });

  const voltar = () => { setView('lista'); setConversa(null); setMensagens([]); carregarConversas(); };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: T.bg }}>
      {view === 'lista' && (
        <ConversasList
          conversas={conversas} meuId={meuId} ehAdmin={ehAdmin}
          onAbrir={abrirConversa}
          onNova={() => setView('nova')}
          onNovoCanal={() => setView('canal')}
        />
      )}
      {view === 'thread' && conversa && (
        <ChatThread
          conversa={conversa} mensagens={mensagens} meuId={meuId}
          minLidaOutros={minLida} temMais={temMais} carregando={carregando}
          onBack={voltar} onCarregarMais={carregarMais} onMarcarLido={marcarLido}
          onEnviado={appendMsg} showToast={showToast}
        />
      )}
      {view === 'nova' && (
        <NovaConversa modo="conversa" onBack={() => setView('lista')} showToast={showToast}
          onCriada={(id) => abrirConversa({ id })} />
      )}
      {view === 'canal' && (
        <NovaConversa modo="canal" onBack={() => setView('lista')} showToast={showToast}
          onCriada={(id) => abrirConversa({ id })} />
      )}
    </div>
  );
}
