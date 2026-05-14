import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTec } from './TecnicoContext';
import { T, ST, fmtDt, api, apiJson } from './shared';
import { StBadge } from './SharedComponents';

function DetalheOC({ oc, onBack }) {
  const [notas, setNotas] = useState([]);
  const [osList, setOsList] = useState([]);
  const [novaNota, setNovaNota] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useTec();

  useEffect(() => {
    Promise.all([
      apiJson(`/api/ocorrencias/${oc.id}`).catch(()=>null),
      apiJson(`/api/os?ocorrencia_id=${oc.id}&limit=10`).catch(()=>[]),
    ]).then(([full, os]) => {
      if (full) setNotas(full.notas || []);
      setOsList(Array.isArray(os)?os:(os?.rows||[]));
    });
  }, [oc.id]);

  const addNota = async () => {
    if (!novaNota.trim()) return;
    setSaving(true);
    await api(`/api/ocorrencias/${oc.id}/nota`,{method:'POST',body:JSON.stringify({conteudo:novaNota})}).catch(()=>{});
    setNovaNota(''); showToast('💬 Nota adicionada'); setSaving(false);
  };

  const s = ST[oc.status]||ST.aberta;
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:`1px solid ${T.bord}`, flexShrink:0 }}>
        <button type="button" onClick={onBack} aria-label="Voltar"
          style={{ width:40,height:40,borderRadius:10,border:`1px solid ${T.bord}`,background:T.card,color:T.muted,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center' }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:'.92rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{oc.titulo||oc.tipo||`OC #${oc.id}`}</div>
          <StBadge status={oc.status} />
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {/* Dados */}
        <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'13px 15px', marginBottom:14 }}>
          {[['Cliente',oc.cliente_nome],['Contrato',oc.contrato?`#${oc.contrato}`:null],['Tipo',oc.tipo],['Prioridade',oc.prioridade]].filter(([,v])=>v).map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:'.78rem', color:T.muted }}>{k}</span>
              <span style={{ fontSize:'.82rem', color:'rgba(255,255,255,.8)', textAlign:'right' }}>{v}</span>
            </div>
          ))}
          {oc.descricao && <div style={{ marginTop:8, padding:'8px 10px', background:T.overlay, borderRadius:8, fontSize:'.8rem', color:'rgba(255,255,255,.55)', lineHeight:1.5 }}>{oc.descricao}</div>}
        </div>
        {/* OS vinculadas */}
        {osList.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:'.68rem', fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>🔧 OS vinculadas ({osList.length})</div>
            {osList.map(os => {
              const st = ST[os.status]||ST.aguardando;
              return (
                <div key={os.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', marginBottom:6, background:T.card, border:`1px solid ${T.bord}`, borderLeft:`3px solid ${st.c}`, borderRadius:T.r12 }}>
                  <span style={{ fontWeight:700, fontSize:'.82rem' }}>OS #{os.id}</span>
                  <span style={{ flex:1, fontSize:'.75rem', color:T.muted }}>{os.tipo} {os.tecnico_nome?`· ${os.tecnico_nome}`:''}</span>
                  <StBadge status={os.status} />
                </div>
              );
            })}
          </div>
        )}
        {/* Notas */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:'.68rem', fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>💬 Notas</div>
          {notas.length===0&&<div style={{ fontSize:'.8rem', color:T.muted, textAlign:'center', padding:'12px 0' }}>Nenhuma nota</div>}
          {notas.map((n,i)=>(
            <div key={i} style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r12, padding:'9px 11px', marginBottom:7 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <span style={{ fontSize:'.7rem', fontWeight:600, color:'rgba(255,255,255,.5)' }}>{n.agente_nome||'Sistema'}</span>
                <span style={{ fontSize:'.65rem', color:T.nano, fontFamily:'monospace' }}>{fmtDt(n.criado_em)}</span>
              </div>
              <div style={{ fontSize:'.82rem', color:'rgba(255,255,255,.65)', lineHeight:1.5 }}>{n.conteudo}</div>
            </div>
          ))}
        </div>
        <textarea value={novaNota} onChange={e=>setNovaNota(e.target.value)} placeholder="Nova nota…" rows={3}
          style={{ width:'100%', padding:'11px 13px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.88rem', resize:'vertical', outline:'none', boxSizing:'border-box', marginBottom:10, fontFamily:'inherit' }} />
        <button type="button" onClick={addNota} disabled={saving||!novaNota.trim()} aria-label="Adicionar nota à ocorrência"
          style={{ width:'100%', padding:'11px', borderRadius:T.r12, border:`1px solid rgba(0,200,150,.22)`, background:'rgba(0,200,150,.09)', color:T.green, fontWeight:700, cursor:'pointer', fontSize:'.86rem' }}>
          {saving?'Salvando…':'💬 Adicionar nota'}
        </button>
      </div>
    </div>
  );
}



/* ── Banner offline (P2 — audit) ── */

export { DetalheOC };
