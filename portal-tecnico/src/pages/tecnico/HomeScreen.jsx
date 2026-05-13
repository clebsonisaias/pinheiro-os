import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gsap } from 'gsap';
import { useTec } from './TecnicoContext';
import { T, ST, saudacao, isHoje, fmtH, fmtDt, apiJson } from './shared';
import { OSCard } from './SharedComponents';
import { Flame, Target, BarChart2, Wrench, AlertTriangle, ClipboardList, CheckCircle2, RefreshCw, MapPin, Navigation, Phone, Star, Clock, TrendingUp, TrendingDown, Play, History, ChevronRight } from 'lucide-react';

const PRIO_COR = { urgente:'#f05f70', alta:'#f0b429', normal:'#00c896', baixa:'#5DCAA5' };

// ── Distância haversine simples (km) ─────────────────────────────────────────
function distKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI / 180;
  const dLon = (lon2-lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function fmtPrazoSla(prazoIso) {
  if (!prazoIso) return null;
  const ms = new Date(prazoIso).getTime() - Date.now();
  if (ms < 0) {
    const h = Math.abs(ms) / 3600000;
    return { txt: h < 1 ? `${Math.round(h*60)}min atraso` : `${Math.round(h)}h atraso`, urg: true };
  }
  const h = ms / 3600000;
  if (h < 1) return { txt: `${Math.round(h*60)}min`, urg: h < 0.5 };
  return { txt: `${Math.round(h)}h`, urg: false };
}

// ── Card "Foco Agora" ────────────────────────────────────────────────────────
function FocoAgoraCard({ foco, onAbrirTicket, onAbrirOS, navegar }) {
  if (!foco) return null;
  const ticket = foco.ticket;
  const os = foco.os;
  const isLivre = foco.tipo === 'livre';

  const corPrincipal = isLivre ? T.green
    : foco.tipo === 'em_andamento' ? T.blue
    : (ticket?.prazo_sla && new Date(ticket.prazo_sla) < new Date()) ? T.red
    : T.green;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${corPrincipal}22 0%, ${T.card} 60%)`,
      border: `1px solid ${corPrincipal}55`,
      borderRadius: 14, padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontSize:'.65rem', fontWeight:800, color:corPrincipal, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>
        {foco.rotulo}{foco.sub ? <span style={{ color:T.muted, fontWeight:600, marginLeft:6 }}>· {foco.sub}</span> : null}
      </div>

      {isLivre ? (
        <div style={{ padding:'12px 0', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:'1rem', color:T.text }}>Sem pendências urgentes</div>
        </div>
      ) : ticket ? (
        <div onClick={() => onAbrirTicket?.(ticket)} style={{ cursor:'pointer' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ padding:'2px 8px', borderRadius:6, background:`${PRIO_COR[ticket.prioridade]||T.green}22`, color:PRIO_COR[ticket.prioridade]||T.green, fontSize:'.7rem', fontWeight:700 }}>
              #{ticket.numero}
            </span>
            <span style={{ fontWeight:800, fontSize:'1rem', color:T.text, flex:1, lineHeight:1.2 }}>{ticket.titulo}</span>
          </div>
          {ticket.cliente_nome && <div style={{ fontSize:'.85rem', color:T.text, marginBottom:3 }}>{ticket.cliente_nome}</div>}
          {ticket.endereco && <div style={{ fontSize:'.78rem', color:T.muted, marginBottom:8, display:'flex', alignItems:'center', gap:3 }}><MapPin size={10} style={{ flexShrink:0 }} />{ticket.endereco}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={(e)=>{ e.stopPropagation(); onAbrirTicket?.(ticket); }} style={{
              flex:1, padding:'10px 0', border:'none', borderRadius:8,
              background: corPrincipal, color:'#001', fontWeight:800, fontSize:'.9rem', cursor:'pointer',
            }}>Abrir ticket →</button>
            {(ticket.lat && ticket.lng) && (
              <button onClick={(e)=>{ e.stopPropagation(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${ticket.lat},${ticket.lng}`); }} style={{
                padding:'10px 12px', border:`1px solid ${T.bord}`, borderRadius:8,
                background:'transparent', color:T.muted, cursor:'pointer', display:'flex', alignItems:'center',
              }}><Navigation size={16} /></button>
            )}
          </div>
        </div>
      ) : os ? (
        <div onClick={() => onAbrirOS?.(os)} style={{ cursor:'pointer' }}>
          <div style={{ fontWeight:800, fontSize:'1rem', color:T.text, marginBottom:6 }}>{os.titulo || `OS #${os.numero}`}</div>
          {os.cliente_nome && <div style={{ fontSize:'.85rem', color:T.text, marginBottom:3 }}>{os.cliente_nome}</div>}
          {os.endereco && <div style={{ fontSize:'.78rem', color:T.muted, display:'flex', alignItems:'center', gap:3 }}><MapPin size={10} style={{ flexShrink:0 }} />{os.endereco}</div>}
        </div>
      ) : null}
    </div>
  );
}

// ── KPI Mini ─────────────────────────────────────────────────────────────────
function KpiMini({ label, valor, cor, Icon, alerta, onClick }) {
  const [displayed, setDisplayed] = useState(0);
  const objRef = useRef({ val: 0 });
  const tweenRef = useRef(null);

  useEffect(() => {
    const target = Number(valor) || 0;
    if (tweenRef.current) tweenRef.current.kill();
    tweenRef.current = gsap.to(objRef.current, {
      val: target, duration: 0.9, ease: 'power2.out',
      onUpdate() { setDisplayed(Math.round(objRef.current.val)); },
    });
    return () => tweenRef.current?.kill();
  }, [valor]);

  return (
    <div onClick={onClick} style={{
      flex:1, background:T.card, border:`1px solid ${alerta && valor > 0 ? cor : T.bord}`, borderRadius:10, padding:'8px 4px',
      textAlign:'center', cursor: onClick ? 'pointer' : 'default',
      ...(alerta && valor > 0 ? { boxShadow:`0 0 0 1px ${cor}44` } : {}),
    }}>
      {Icon && <div style={{ display:'flex', justifyContent:'center', marginBottom:3, color:cor, opacity:.8 }}><Icon size={14} /></div>}
      <div style={{ fontWeight:800, fontSize:'1.3rem', color:cor, lineHeight:1 }}>{displayed}</div>
      <div style={{ fontSize:'.55rem', color:T.muted, marginTop:3, textTransform:'uppercase', letterSpacing:'.05em', fontWeight:700 }}>{label}</div>
    </div>
  );
}

// ── Mini bar chart 7 dias ────────────────────────────────────────────────────
function SemanaChart({ dados }) {
  if (!dados?.length) return null;
  const max = Math.max(...dados.map(d => d.qtd), 1);
  return (
    <div style={{
      background:T.card, border:`1px solid ${T.bord}`, borderRadius:10, padding:'12px 14px', marginBottom:14,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:'.7rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.07em', display:'flex', alignItems:'center', gap:5 }}><BarChart2 size={13} /> Últimos 7 dias</div>
        <div style={{ fontSize:'.75rem', color:T.green, fontWeight:700 }}>
          {dados.reduce((a,d)=>a+d.qtd,0)} concluídos
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:48 }}>
        {dados.map((d, i) => {
          const h = (d.qtd / max) * 44;
          return (
            <div key={i} title={`${d.dia}: ${d.qtd}`} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
              <div style={{
                width:'100%', height: Math.max(h, 2), minHeight:2,
                background: d.qtd > 0 ? T.green : `${T.muted}33`, borderRadius:'2px 2px 0 0',
              }}/>
              <span style={{ fontSize:9, color:T.muted }}>{d.dia.slice(0,2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FtthBadge({ s }) {
  if (!s || s.sem_login) return null;
  const cor = s.online ? T.green : T.red;
  const dbmCor = s.rx_dbm == null ? null : s.rx_dbm >= -24 ? T.green : s.rx_dbm >= -27 ? T.amber : T.red;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
      {s.online !== null && (
        <span style={{ display:'flex', alignItems:'center', gap:3 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:cor, boxShadow:s.online?`0 0 4px ${cor}`:'none' }} />
          <span style={{ fontSize:'.62rem', color:cor, fontWeight:700 }}>{s.online ? 'Online' : 'Offline'}</span>
        </span>
      )}
      {s.rx_dbm != null && (
        <span style={{ fontSize:'.62rem', padding:'1px 5px', borderRadius:3, background:`${dbmCor}18`, color:dbmCor, fontFamily:'monospace', fontWeight:700 }}>
          {s.rx_dbm.toFixed(1)} dBm
        </span>
      )}
    </div>
  );
}

// ── Lista compacta de tickets com SLA crítico ────────────────────────────────
function SlaVencendoCard({ tickets, onAbrirTicket, statusMap }) {
  if (!tickets?.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:'.7rem', fontWeight:800, color:T.red, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
        <AlertTriangle size={13} /> SLA crítico ({tickets.length})
      </div>
      {tickets.map(t => {
        const sla = fmtPrazoSla(t.prazo_sla);
        return (
          <div key={t.id} onClick={() => onAbrirTicket?.(t)} style={{
            background:T.card, border:`1px solid ${sla?.urg ? T.red+'55' : T.amber+'33'}`,
            borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:2 }}>
                  <span style={{ fontSize:'.7rem', color:PRIO_COR[t.prioridade]||T.green, fontWeight:800 }}>#{t.numero}</span>
                  <span style={{ fontSize:'.85rem', color:T.text, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.titulo}</span>
                </div>
                {t.cliente_nome && <div style={{ fontSize:'.72rem', color:T.muted }}>{t.cliente_nome}</div>}
                <FtthBadge s={statusMap?.[t.cliente_id]} />
              </div>
              <div style={{
                padding:'4px 10px', borderRadius:6, fontSize:'.7rem', fontWeight:800,
                background: sla?.urg ? T.red : T.amber, color:'#001', flexShrink:0,
              }}>{sla?.txt}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Lista completa de tickets ativos (não em SLA crítico) ────────────────────
function TicketsAtivosCard({ tickets, onAbrirTicket, myPos, statusMap }) {
  if (!tickets?.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:'.7rem', fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
        <ClipboardList size={13} /> Meus tickets ({tickets.length})
      </div>
      {tickets.map(t => {
        const sla = fmtPrazoSla(t.prazo_sla);
        const dist = (myPos && t.lat && t.lng) ? distKm(myPos.lat, myPos.lng, t.lat, t.lng) : null;
        return (
          <div key={t.id} onClick={() => onAbrirTicket?.(t)} style={{
            background:T.card, border:`1px solid ${T.bord}`, borderRadius:10,
            padding:'10px 12px', marginBottom:6, cursor:'pointer',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ padding:'1px 6px', borderRadius:4, background:`${PRIO_COR[t.prioridade]||T.green}22`, color:PRIO_COR[t.prioridade]||T.green, fontSize:'.65rem', fontWeight:800 }}>#{t.numero}</span>
              <span style={{ fontSize:'.85rem', color:T.text, fontWeight:600, flex:1, lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.titulo}</span>
              {sla && <span style={{ fontSize:'.65rem', color: sla.urg ? T.red : T.muted, fontWeight:700 }}>⏱ {sla.txt}</span>}
            </div>
            <div style={{ fontSize:'.72rem', color:T.muted, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {t.cliente_nome && <span>{t.cliente_nome}</span>}
              {dist != null && <span style={{ display:'flex', alignItems:'center', gap:2 }}><MapPin size={10} />{dist < 1 ? Math.round(dist*1000)+'m' : dist.toFixed(1)+'km'}</span>}
              <span style={{ marginLeft:'auto', color: ST[t.status]?.cor||T.muted }}>● {ST[t.status]?.label || t.status}</span>
            </div>
            <FtthBadge s={statusMap?.[t.cliente_id]} />
          </div>
        );
      })}
    </div>
  );
}

// ── Alertas operacionais ─────────────────────────────────────────────────────
function AlertasCard({ manutencoes }) {
  if (!manutencoes?.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:'.7rem', fontWeight:800, color:T.amber, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
        <AlertTriangle size={13} /> Alertas operacionais
      </div>
      {manutencoes.map(m => (
        <div key={m.id} style={{
          background:`${T.amber}11`, border:`1px solid ${T.amber}44`,
          borderRadius:10, padding:'8px 12px', marginBottom:6, fontSize:'.78rem', color:T.text,
        }}>
          {m.descricao}
          {m.area && <span style={{ color:T.muted }}> · {m.area}</span>}
          {m.inicio_previsto && (
            <div style={{ fontSize:'.7rem', color:T.muted, marginTop:2 }}>
              {fmtH(m.inicio_previsto)}{m.fim_previsto ? ` - ${fmtH(m.fim_previsto)}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Hero card: avatar grande + saudação + 4 KPIs pessoais ─────────────────
function HeroCard({ user, kpis, dataHora, onRefresh, loading }) {
  const k = kpis || {};
  const concluidos = (k.resolvidos_hoje || 0) + (k.concluidas_hoje || 0);
  const emoji = (() => {
    const h = new Date().getHours();
    if (h < 6 || h >= 20) return '🌙';
    if (h < 12) return '🌅';
    if (h < 18) return '☀️';
    return '🌆';
  })();
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(0,200,150,.18) 0%, ${T.bg2} 60%)`,
      border: `1px solid rgba(0,200,150,.25)`,
      borderRadius: 16, padding: '14px 16px', marginBottom: 14,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
        <div style={{
          width:60, height:60, borderRadius:'50%',
          background: user?.avatar_url ? T.bg2 : `linear-gradient(135deg,${T.green},#008b87)`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:24, fontWeight:900, color:'#011820', flexShrink:0,
          boxShadow:`0 0 0 3px rgba(0,200,150,.15)`,
          overflow:'hidden',
        }}>
          {user?.avatar_url
            ? <img src={user.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            : (user?.nome?.charAt(0).toUpperCase() || '?')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'.7rem', color:T.muted, lineHeight:1 }}>{saudacao()}, {emoji}</div>
          <div style={{ fontWeight:900, fontSize:'1.15rem', color:T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2 }}>
            {user?.nome || '—'}
          </div>
          <div style={{ fontSize:'.68rem', color:T.muted, marginTop:2 }}>{dataHora}</div>
        </div>
        <button onClick={onRefresh} disabled={loading} aria-label="Atualizar"
          style={{ width:36, height:36, borderRadius:10, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <RefreshCw size={15} style={{ animation: loading?'spin .7s linear infinite':'none' }} />
        </button>
      </div>

      {/* 4 KPIs pessoais do dia */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
        <KpiPessoal
          icon={<CheckCircle2 size={14} />}
          valor={concluidos}
          label="Concluídos"
          delta={k.delta_concluidos}
          cor={T.green}
        />
        <KpiPessoal
          icon={<Clock size={14} />}
          valor={`${k.horas_campo_hoje || 0}h${k.minutos_campo_hoje ? ' ' + k.minutos_campo_hoje + 'm' : ''}`}
          label="Em campo"
          cor={T.cyan}
          isText
        />
        <KpiPessoal
          icon={<Star size={14} />}
          valor={k.nps_medio != null ? `${k.nps_medio}` : '—'}
          label={k.nps_count > 0 ? `NPS (${k.nps_count})` : 'NPS'}
          cor={T.yel}
          isText
        />
        <KpiPessoal
          icon={<Flame size={14} />}
          valor={k.streak_dias || 0}
          label={(k.streak_dias || 0) === 1 ? 'Dia 🔥' : 'Dias 🔥'}
          cor={'#f97316'}
        />
      </div>
    </div>
  );
}

function KpiPessoal({ icon, valor, label, delta, cor, isText }) {
  return (
    <div style={{
      background:'rgba(255,255,255,.04)', border:`1px solid ${T.bord}`,
      borderRadius:10, padding:'8px 4px', textAlign:'center',
    }}>
      <div style={{ display:'flex', justifyContent:'center', color:cor, marginBottom:3, opacity:.85 }}>{icon}</div>
      <div style={{ fontWeight:900, fontSize: isText ? '.95rem' : '1.25rem', color:cor, lineHeight:1 }}>{valor}</div>
      <div style={{ fontSize:'.55rem', color:T.muted, marginTop:3, textTransform:'uppercase', letterSpacing:'.05em', fontWeight:700 }}>{label}</div>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <div style={{ fontSize:'.6rem', marginTop:2, color: delta > 0 ? T.green : T.red, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:1 }}>
          {delta > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {delta > 0 ? '+' : ''}{delta}
        </div>
      )}
    </div>
  );
}

// ── Card "Iniciar próximo" — atalho 1-tap ─────────────────────────────────
function IniciarProximoCard({ ticket, myPos, onAbrir }) {
  if (!ticket) return null;
  const dist = (myPos && ticket.lat && ticket.lng) ? distKm(myPos.lat, myPos.lng, ticket.lat, ticket.lng) : null;
  const sla = fmtPrazoSla(ticket.prazo_sla);
  return (
    <button onClick={() => onAbrir?.(ticket)} style={{
      width:'100%', display:'flex', alignItems:'center', gap:12,
      background:`linear-gradient(135deg, ${T.green}, #008b87)`,
      border:'none', borderRadius:14, padding:'12px 14px', marginBottom:14,
      cursor:'pointer', color:'#011820', textAlign:'left', minHeight:60,
      boxShadow:`0 4px 14px rgba(0,200,150,.25)`,
    }}>
      <div style={{ width:42, height:42, borderRadius:12, background:'rgba(1,24,32,.18)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Play size={20} fill="#011820" />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:900, fontSize:'.7rem', textTransform:'uppercase', letterSpacing:'.08em', opacity:.7 }}>Iniciar próximo</div>
        <div style={{ fontWeight:800, fontSize:'.95rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {ticket.cliente_nome || ticket.titulo}
        </div>
        <div style={{ fontSize:'.72rem', opacity:.75, marginTop:1, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span>#{ticket.numero}</span>
          {dist != null && <span>· {dist < 1 ? Math.round(dist*1000)+'m' : dist.toFixed(1)+'km'}</span>}
          {sla && <span style={{ fontWeight:800 }}>· ⏱ {sla.txt}</span>}
        </div>
      </div>
      <ChevronRight size={22} style={{ flexShrink:0 }} />
    </button>
  );
}

// ── Botão pra abrir Histórico ─────────────────────────────────────────────
function BotaoHistorico({ onOpen }) {
  return (
    <button onClick={onOpen} style={{
      width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
      background:'rgba(168,85,247,.08)', border:`1px solid rgba(168,85,247,.25)`,
      borderRadius:10, color:'#c084fc', cursor:'pointer', marginBottom:14,
      textAlign:'left', minHeight:48,
    }}>
      <History size={16} />
      <div style={{ flex:1, fontSize:'.86rem', fontWeight:700 }}>Histórico de OS encerradas</div>
      <ChevronRight size={18} />
    </button>
  );
}

// ── HomeScreen principal ────────────────────────────────────────────────────
function HomeScreen({ onOpenOS, onOpenTicket, onOpenHistorico }) {
  const { user, loading, reload, navegar, myPos } = useTec();
  const [dash, setDash] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [statusMap, setStatusMap] = useState({});
  const [now, setNow] = useState(new Date());

  const carregarDash = useCallback(async () => {
    try {
      const d = await apiJson('/api/tecnico/dashboard');
      setDash(d);
      const todos = [...(d?.sla_vencendo || []), ...(d?.tickets_ativos || [])];
      const ids = [...new Set(todos.map(t => t.cliente_id).filter(Boolean))];
      if (ids.length) {
        apiJson(`/api/clientes/status-batch?ids=${ids.join(',')}`)
          .then(m => setStatusMap(m || {}))
          .catch(() => {});
      }
    } catch(e) { console.warn('dashboard:', e.message); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => {
    carregarDash();
    const t = setInterval(carregarDash, 60000);
    const tNow = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(t); clearInterval(tNow); };
  }, [carregarDash]);

  const abrirTicket = (t) => onOpenTicket?.(t);
  const k = dash?.kpis || {};
  const dataHora = now.toLocaleString('pt-BR', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).replace('.', '');

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'12px 14px 0' }}>
      {/* Hero card com saudação + KPIs pessoais */}
      <HeroCard
        user={user} kpis={k} dataHora={dataHora}
        onRefresh={() => { reload(); carregarDash(); }}
        loading={loading || carregando}
      />

      {/* Iniciar próximo (atalho de 1 toque) */}
      {!carregando && dash?.proximo_ticket && (
        <IniciarProximoCard
          ticket={dash.proximo_ticket}
          myPos={myPos}
          onAbrir={abrirTicket}
        />
      )}

      {/* Foco agora — só se for "em_andamento" (continuar de onde parou) */}
      {!carregando && dash?.foco_agora?.tipo === 'em_andamento' && (
        <FocoAgoraCard foco={dash.foco_agora} onAbrirTicket={abrirTicket} onAbrirOS={onOpenOS} navegar={navegar} />
      )}

      {/* SLA crítico */}
      <SlaVencendoCard tickets={dash?.sla_vencendo} onAbrirTicket={abrirTicket} statusMap={statusMap} />

      {/* Tickets ativos (filtra os que já estão em SLA crítico) */}
      <TicketsAtivosCard
        tickets={(dash?.tickets_ativos || []).filter(t => !(dash?.sla_vencendo || []).find(s => s.id === t.id))}
        onAbrirTicket={abrirTicket}
        myPos={myPos}
        statusMap={statusMap}
      />

      {/* Histórico — botão pra abrir tela cheia */}
      <BotaoHistorico onOpen={onOpenHistorico} />

      {/* Alertas operacionais */}
      <AlertasCard manutencoes={dash?.alertas?.manutencoes} />

      {/* Performance semanal */}
      <SemanaChart dados={dash?.semana} />

      {/* Empty state */}
      {!carregando && !dash?.tickets_ativos?.length && !dash?.agenda_dia?.length && !dash?.proximo_ticket && (
        <div style={{ textAlign:'center', padding:'40px 0', color:T.muted }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:12, color:T.green, opacity:.6 }}><CheckCircle2 size={44} /></div>
          <div style={{ fontWeight:700, fontSize:'.95rem', marginBottom:6 }}>Tudo em dia! 👏</div>
          <div style={{ fontSize:'.82rem' }}>Nenhum ticket pendente — bom trabalho!</div>
        </div>
      )}

      <div style={{ height:24 }} />
    </div>
  );
}

export { HomeScreen };
