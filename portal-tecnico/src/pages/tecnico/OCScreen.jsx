import React, { useState, useMemo } from 'react';
import { useTec } from './TecnicoContext';
import { T } from './shared';
import { OcCard, SkeletonCards } from './SharedComponents';

function OCScreen({ onOpenOC }) {
  const { ocList, loading } = useTec();
  const [q, setQ] = useState('');

  const filtradas = useMemo(() => {
    if (!q) return ocList;
    const ql = q.toLowerCase();
    return ocList.filter(o =>
      (o.titulo||'').toLowerCase().includes(ql) ||
      (o.cliente_nome||'').toLowerCase().includes(ql) ||
      (o.tipo||'').toLowerCase().includes(ql) ||
      String(o.contrato||'').includes(q)
    );
  }, [ocList, q]);

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'16px 16px 0' }}>
      {/* Busca */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:T.muted, fontSize:14 }}>🔍</span>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar ocorrência…"
          aria-label="Buscar ocorrência"
          style={{ width:'100%', padding:'11px 12px 11px 36px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.88rem', outline:'none', boxSizing:'border-box' }} />
      </div>

      {loading ? <SkeletonCards /> : null}
      {!loading && filtradas.length === 0 && (
        <div style={{ textAlign:'center', padding:40, color:T.muted }}>
          <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
          <div>{q ? 'Nenhum resultado' : 'Nenhuma ocorrência atribuída'}</div>
        </div>
      )}
      {filtradas.map(oc => <OcCard key={oc.id} oc={oc} onOpen={onOpenOC} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT — Técnico inicia conversa com cliente
   Fluxo: técnico digita número → envia mensagem → vê thread
   Conversas encerradas somem; só abertas aparecem
═══════════════════════════════════════════════════════════════════════════ */

export { OCScreen };
