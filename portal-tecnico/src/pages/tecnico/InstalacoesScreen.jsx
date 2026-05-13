// InstalacoesScreen.jsx — aba dedicada para OS de instalação no TecnicoApp.
// Reusa OSCard mas com filtro pré-aplicado em tipo='instalacao' + visual
// reforçado: header destacado, contadores próprios, empty-state focado.
import React, { useState, useMemo } from 'react';
import { useTec } from './TecnicoContext';
import { T, ST, isHoje } from './shared';
import { OSCard, SkeletonCards } from './SharedComponents';

const isInst = (os) => {
  if (os.tipo === 'instalacao') return true;
  const haystack = [os.oc_titulo, os.sgp_motivo, os.oc_tipo, os.ticket_categoria, os.ticket_tipo]
    .filter(Boolean).join(' | ');
  return /instala[çc][ãa]o/i.test(haystack);
};

export function InstalacoesScreen({ onOpenOS }) {
  const { osList, navegar, loading } = useTec();
  const [filtro, setFiltro] = useState('pendentes');

  const todas = useMemo(() => osList.filter(isInst), [osList]);
  const lista = useMemo(() => {
    if (filtro === 'pendentes') return todas.filter(o => !['concluida','cancelada'].includes(o.status));
    if (filtro === 'hoje')      return todas.filter(o => isHoje(o.agendado_para));
    if (filtro === 'concluida') return todas.filter(o => o.status === 'concluida');
    return todas;
  }, [todas, filtro]);

  const grupos = useMemo(() => {
    const ORDEM = ['execucao','deslocamento','confirmada','aguardando','concluida','cancelada'];
    const g = {};
    lista.forEach(o => { if (!g[o.status]) g[o.status]=[]; g[o.status].push(o); });
    return ORDEM.filter(s => g[s]?.length).map(s => ({ status: s, items: g[s] }));
  }, [lista]);

  const totalPendentes = todas.filter(o => !['concluida','cancelada'].includes(o.status)).length;
  const totalHoje = todas.filter(o => isHoje(o.agendado_para)).length;

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'14px 16px 80px' }}>
      {/* Header verde destacado — comunica imediato que está em modo Instalações */}
      <div style={{
        background:'linear-gradient(135deg, rgba(0,200,150,.18) 0%, rgba(0,200,150,.06) 100%)',
        border:`1px solid rgba(0,200,150,.35)`,
        borderRadius:14, padding:'14px 16px', marginBottom:14,
        display:'flex', alignItems:'center', gap:12,
      }}>
        <div style={{ fontSize:30, lineHeight:1 }}>🔧</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:900, fontSize:'1.05rem', color:T.green, letterSpacing:'.02em' }}>
            INSTALAÇÕES
          </div>
          <div style={{ fontSize:'.78rem', color:'rgba(0,200,150,.85)', marginTop:2 }}>
            {totalPendentes > 0
              ? `${totalPendentes} pendente${totalPendentes>1?'s':''}${totalHoje?` · ${totalHoje} pra hoje`:''}`
              : 'Nada pendente agora 🎉'}
          </div>
        </div>
      </div>

      {/* Filtros pill */}
      <div style={{ display:'flex', gap:8, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
        {[
          ['pendentes', `🔥 Pendentes${totalPendentes?` (${totalPendentes})`:''}`],
          ['hoje',      `📅 Hoje${totalHoje?` (${totalHoje})`:''}`],
          ['concluida', '✔ Concluídas'],
          ['todas',     'Todas'],
        ].map(([k, l]) => (
          <button type="button" key={k} onClick={() => setFiltro(k)}
            aria-pressed={filtro === k}
            style={{
              padding:'11px 14px', borderRadius:99,
              border:`1px solid ${filtro===k ? T.green : T.bord}`,
              background: filtro===k ? 'rgba(0,200,150,.14)' : T.card,
              color: filtro===k ? T.green : T.muted,
              fontWeight:700, fontSize:'.78rem', cursor:'pointer',
              whiteSpace:'nowrap', flexShrink:0, minHeight:44,
            }}>
            {l}
          </button>
        ))}
      </div>

      {loading && <SkeletonCards />}

      {!loading && grupos.length === 0 && (
        <div style={{
          textAlign:'center', padding:'40px 20px', color:T.muted,
          background:T.card, borderRadius:14, border:`1px dashed ${T.bord}`,
        }}>
          <div style={{ fontSize:42, marginBottom:10, opacity:.5 }}>🔧</div>
          <div style={{ fontSize:'.95rem', fontWeight:600, color:T.text, marginBottom:6 }}>
            {filtro === 'pendentes' ? 'Sem instalações pendentes' : 'Nada nessa categoria'}
          </div>
          <div style={{ fontSize:'.8rem' }}>
            {filtro === 'pendentes'
              ? 'Quando o SGP gerar uma OS de instalação, ela aparece aqui.'
              : 'Tenta outro filtro.'}
          </div>
        </div>
      )}

      {grupos.map(({ status, items }) => {
        const s = ST[status];
        return (
          <div key={status} style={{ marginBottom:18 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontWeight:800, fontSize:'.82rem', color:s.c }}>{s.icon} {s.label}</span>
              <span style={{ fontSize:'.68rem', background:s.bg, color:s.c, padding:'2px 8px', borderRadius:99 }}>
                {items.length}
              </span>
              <div style={{ flex:1, height:1, background:T.bord }} />
            </div>
            {items.map(os => <OSCard key={os.id} os={os} onOpen={onOpenOS} onNav={navegar} compact />)}
          </div>
        );
      })}
    </div>
  );
}
