import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTec } from './TecnicoContext';
import { T, ST, isHoje } from './shared';
import { OSCard, SkeletonCards } from './SharedComponents';

function OSScreen({ onOpenOS }) {
  const { osList, navegar, loading } = useTec();
  const [filtro, setFiltro] = useState('ativas');

  const lista = useMemo(() => {
    if (filtro === 'ativas')   return osList.filter(o=>!['concluida','cancelada'].includes(o.status));
    if (filtro === 'hoje')     return osList.filter(o=>isHoje(o.agendado_para));
    if (filtro === 'concluida')return osList.filter(o=>o.status==='concluida');
    return osList;
  }, [osList, filtro]);

  // Agrupado por status
  const grupos = useMemo(() => {
    const ORDEM = ['execucao','deslocamento','confirmada','aguardando','concluida','cancelada'];
    const g = {};
    lista.forEach(o => { if (!g[o.status]) g[o.status]=[]; g[o.status].push(o); });
    return ORDEM.filter(s=>g[s]?.length).map(s=>({ status:s, items:g[s] }));
  }, [lista]);

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'16px 16px 0' }}>
      {/* Filtros pill */}
      <div style={{ display:'flex', gap:8, marginBottom:18, overflowX:'auto', paddingBottom:4 }}>
        {[['ativas','🔥 Ativas'],['hoje','📅 Hoje'],['concluida','✔ Concluídas'],['todas','Todas']].map(([k,l])=>(
          <button type="button" key={k} onClick={()=>setFiltro(k)} aria-label={`Filtrar: ${l}`} aria-pressed={filtro===k}
            style={{ padding:'11px 16px', borderRadius:99, border:`1px solid ${filtro===k?T.green:T.bord}`, background:filtro===k?`rgba(0,200,150,.12)`:T.card, color:filtro===k?T.green:T.muted, fontWeight:700, fontSize:'.80rem', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0, minHeight:44 }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <SkeletonCards /> : null}

      {!loading && grupos.length === 0 && (
        <div style={{ textAlign:'center', padding:40, color:T.muted }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🔧</div>
          <div>Nenhuma OS nesta categoria</div>
        </div>
      )}

      {grupos.map(({ status, items }) => {
        const s = ST[status];
        return (
          <div key={status} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontWeight:800, fontSize:'.82rem', color:s.c }}>{s.icon} {s.label}</span>
              <span style={{ fontSize:'.68rem', background:s.bg, color:s.c, padding:'2px 8px', borderRadius:99 }}>{items.length}</span>
              <div style={{ flex:1, height:1, background:T.bord }} />
            </div>
            {items.map(os => <OSCard key={os.id} os={os} onOpen={onOpenOS} onNav={navegar} compact />)}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OC — Ocorrências vinculadas
═══════════════════════════════════════════════════════════════════════════ */

export { OSScreen };
