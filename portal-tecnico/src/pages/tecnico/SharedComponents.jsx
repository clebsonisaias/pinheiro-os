import { memo } from 'react';
import { createPortal } from 'react-dom';
import { useTec } from './TecnicoContext';
import { T, ST, TP, slaInfo, isHoje, tipoLabel, fmtH, fmtDt } from './shared';

export const Toast = memo(function Toast() {
  const { toast } = useTec();
  if (!toast) return null;
  return createPortal(
    <div style={{ position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', zIndex:500,
      background:toast.err?T.red:'rgba(0,200,150,.95)', color:toast.err?'#fff':'#030f0b',
      fontWeight:700, fontSize:'.9rem', padding:'10px 22px', borderRadius:T.r14,
      boxShadow:'0 6px 24px rgba(0,0,0,.4)', whiteSpace:'nowrap', animation:'slideDown .2s ease' }}>
      {toast.msg}
    </div>,
    document.body
  );
});

export function SkeletonCards({ n = 3 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10, padding:'4px 0' }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="sk" style={{ height: 88, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

export const StBadge = memo(function StBadge({ status, size = 'sm' }) {
  const s = ST[status] || ST.aguardando;
  const p  = size === 'sm' ? '2px 8px'   : '4px 12px';
  const fs = size === 'sm' ? '.62rem' : '.72rem';
  return (
    <span style={{ fontSize:fs, fontWeight:700, padding:p, borderRadius:99, background:s.bg, color:s.c }}>
      {s.icon} {s.label}
    </span>
  );
});

export const OSCard = memo(function OSCard({ os, onOpen, onNav, compact = false }) {
  const s    = ST[os.status] || ST.aguardando;
  const sla  = slaInfo(os.prazo_sla);
  const hoje = isHoje(os.agendado_para);
  const isRet = os.tipo === 'retirada' || /retirada/i.test(os.oc_titulo || os.sgp_motivo || '');
  // Detecta instalação por múltiplos campos:
  //  • os.tipo canônico
  //  • título/motivo da ocorrência
  //  • categoria/tipo do ticket interno (ex: "🔧 Instalação", "🔧 Instalação Nova")
  //  • oc_tipo (tipo da ocorrência)
  const _haystack = [
    os.oc_titulo, os.sgp_motivo, os.oc_tipo,
    os.ticket_categoria, os.ticket_tipo
  ].filter(Boolean).join(' | ');
  const isInst = !isRet && (os.tipo === 'instalacao' || /instala[çc][ãa]o/i.test(_haystack));
  const bg     = isRet ? 'rgba(255,71,87,.05)' : isInst ? 'rgba(0,200,150,.07)' : T.card;
  const border = isRet ? 'rgba(255,71,87,.35)' : isInst ? 'rgba(0,200,150,.45)' : T.bord;
  const bLeft  = isRet ? '#ff4757' : isInst ? '#00c896' : s.c;
  return (
    <div style={{ background: bg,
                  border:`1px solid ${border}`,
                  borderLeft:`${(isRet || isInst) ? 4 : 3}px solid ${bLeft}`,
                  borderRadius:T.r14, padding: compact?'12px 14px':'15px 16px', marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:compact?6:10 }}>
        <div style={{ fontSize:compact?18:22, marginTop:2, flexShrink:0 }}>{isRet?'🚨':isInst?'🔧':(TP[os.tipo]||'📋')}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
            <span style={{ fontWeight:800, fontSize:compact?'.88rem':'.95rem',
                           color: isRet?'#ff4757': isInst?'#00c896' :T.text,
                           letterSpacing: (isRet||isInst)?'.02em':0 }}>
              {isRet ? 'RETIRADA' : isInst ? 'INSTALAÇÃO' : tipoLabel(os.tipo)}{' '}
              <span style={{ color:T.muted, fontWeight:400 }}>#{os.id}</span>
            </span>
            <StBadge status={os.status} />
            {sla && <span style={{ fontSize:'.6rem', fontWeight:700, color:sla.c }}>⚠️ {sla.text}</span>}
          </div>
          <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {os.cliente_nome || os.oc_titulo || '—'}
          </div>
          {os.endereco && !compact && (
            <div style={{ fontSize:'.75rem', color:T.muted, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              📍 {os.endereco}
            </div>
          )}
        </div>
        {os.agendado_para && (
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontWeight:700, fontSize:'.82rem', color: hoje?T.yel:T.muted }}>{fmtH(os.agendado_para)}</div>
            {hoje && <div style={{ fontSize:'.58rem', color:T.yel, fontWeight:700 }}>HOJE</div>}
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {onNav && (
          <button type="button" onClick={() => onNav(os)} aria-label="Navegar até o cliente"
            style={{ flex:1, padding:'10px', borderRadius:T.r12, border:`1px solid rgba(62,207,255,.2)`,
              background:'rgba(62,207,255,.06)', color:T.cyan, fontWeight:700, fontSize:'.8rem', cursor:'pointer' }}>
            🗺️ Navegar
          </button>
        )}
        {onOpen && (
          <button type="button" onClick={() => onOpen(os)} aria-label="Abrir OS"
            style={{ flex:2, padding:'10px', borderRadius:T.r12, border:`1px solid rgba(0,200,150,.22)`,
              background:'rgba(0,200,150,.08)', color:T.green, fontWeight:800, fontSize:'.84rem', cursor:'pointer' }}>
            → Abrir OS
          </button>
        )}
      </div>
    </div>
  );
});

export const OcCard = memo(function OcCard({ oc, onOpen }) {
  const s = ST[oc.status] || ST.aberta;
  return (
    <div onClick={() => onOpen && onOpen(oc)} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen && onOpen(oc)}
      style={{ background:T.card, border:`1px solid ${T.bord}`, borderLeft:`3px solid ${s.c}`,
        borderRadius:T.r14, padding:'13px 14px', marginBottom:10, cursor:onOpen?'pointer':'default' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'.88rem', color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {oc.titulo || oc.tipo || `OC #${oc.id}`}
          </div>
          <div style={{ fontSize:'.75rem', color:T.muted, marginTop:2 }}>
            {oc.cliente_nome && <span>👤 {oc.cliente_nome}</span>}
            {oc.contrato && <span style={{ marginLeft:8 }}>#{oc.contrato}</span>}
          </div>
        </div>
        <StBadge status={oc.status} />
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontSize:'.68rem', color:T.muted }}>🏷️ {oc.tipo || '—'}</span>
        {oc.total_os > 0 && <span style={{ fontSize:'.68rem', color:T.yel }}>🔧 {oc.total_os} OS</span>}
        <span style={{ marginLeft:'auto', fontSize:'.65rem', color:T.nano, fontFamily:'monospace' }}>{fmtDt(oc.criado_em)}</span>
      </div>
    </div>
  );
});
