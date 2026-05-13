// HistoricoScreen — tela cheia mostrando OS/tickets encerrados pelo técnico
// Inclui: detalhes, descrição da resolução, fotos anexadas, GPS de check-in,
// foto + GPS de cliente ausente, NPS recebido.

import React, { useState, useEffect, useCallback } from 'react';
import { T, fmtDt, apiJson } from './shared';
import { ChevronLeft, MapPin, Camera, Star, CheckCircle2, Monitor, User, Clock, AlertCircle, Navigation, RefreshCw } from 'lucide-react';

const RESOLUCAO_LABELS = {
  presencial: { label: 'Presencial', cor: '#00c896', Icon: User },
  remoto:     { label: 'Remoto',     cor: '#a855f7', Icon: Monitor },
};

function calcDuracao(ini, fim) {
  if (!ini || !fim) return null;
  const ms = new Date(fim).getTime() - new Date(ini).getTime();
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

function NotaNPS({ nota }) {
  if (nota == null) return null;
  const cor = nota >= 3 ? T.green : nota === 2 ? T.yel : T.red;
  const label = nota >= 3 ? 'Ótimo' : nota === 2 ? 'Bom' : 'Ruim';
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 8px', borderRadius:99,
      background:`${cor}18`, color:cor, fontSize:'.7rem', fontWeight:800,
    }}>
      <Star size={11} fill={cor} /> {label}
    </div>
  );
}

function BadgeResolucao({ tipo }) {
  const meta = RESOLUCAO_LABELS[tipo] || { label: tipo || '—', cor: T.muted, Icon: CheckCircle2 };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'3px 8px', borderRadius:6,
      background:`${meta.cor}18`, color:meta.cor, fontSize:'.7rem', fontWeight:800,
    }}>
      <meta.Icon size={11} /> {meta.label}
    </span>
  );
}

function CardItem({ item, expanded, onToggle }) {
  const dur = calcDuracao(item.iniciado_em || item.atribuido_em, item.resolvido_em);

  return (
    <div style={{
      background: T.card, border: `1px solid ${T.bord}`, borderRadius: 12,
      marginBottom: 10, overflow: 'hidden',
      transition: 'border-color .15s',
    }}>
      <div onClick={onToggle} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
          <span style={{ fontSize:'.7rem', color:T.green, fontWeight:800, letterSpacing:'.04em' }}>#{item.numero}</span>
          <BadgeResolucao tipo={item.resolucao_tipo} />
          {item.nps_nota != null && <NotaNPS nota={item.nps_nota} />}
          <span style={{ marginLeft:'auto', fontSize:'.7rem', color:T.muted, fontFamily:'monospace' }}>
            {fmtDt(item.resolvido_em)}
          </span>
        </div>
        <div style={{ fontSize:'.92rem', fontWeight:700, color:T.text, marginBottom:4, lineHeight:1.3 }}>
          {item.titulo}
        </div>
        {item.cliente_nome && (
          <div style={{ fontSize:'.78rem', color:T.muted }}>
            {item.cliente_nome}
          </div>
        )}
        <div style={{ display:'flex', gap:8, marginTop:6, fontSize:'.7rem', color:T.muted }}>
          {dur && <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><Clock size={10} /> {dur}</span>}
          {item.attachments?.length > 0 && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
              <Camera size={10} /> {item.attachments.length} foto{item.attachments.length>1?'s':''}
            </span>
          )}
          {(item.checkin_lat || item.cliente_ausente_lat) && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
              <MapPin size={10} /> GPS
            </span>
          )}
          {item.cliente_ausente_em && (
            <span style={{ display:'inline-flex', alignItems:'center', gap:3, color:T.yel }}>
              <AlertCircle size={10} /> Cliente ausente
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${T.bord}`, padding: '12px 14px', background: 'rgba(255,255,255,.02)' }}>
          {/* Descrição da resolução */}
          {item.resolucao_descricao && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:'.66rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>O que foi feito</div>
              <div style={{ fontSize:'.82rem', color:T.text, lineHeight:1.5, whiteSpace:'pre-wrap' }}>
                {item.resolucao_descricao}
              </div>
            </div>
          )}

          {/* Cliente ausente — destaque */}
          {item.cliente_ausente_em && (
            <div style={{ marginBottom:14, padding:'10px 12px', background:'rgba(245,197,24,.08)', border:`1px solid rgba(245,197,24,.25)`, borderRadius:10 }}>
              <div style={{ fontSize:'.7rem', color:T.yel, fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:5 }}>
                <AlertCircle size={12} /> Cliente ausente · {fmtDt(item.cliente_ausente_em)}
              </div>
              {item.cliente_ausente_obs && <div style={{ fontSize:'.78rem', color:T.text, marginBottom:6 }}>{item.cliente_ausente_obs}</div>}
              {item.cliente_ausente_foto_id && (
                <img
                  src={`/api/ticket-attachments/${item.cliente_ausente_foto_id}`}
                  alt="Evidência cliente ausente"
                  loading="lazy"
                  style={{ width:'100%', maxHeight:200, objectFit:'cover', borderRadius:8 }}
                />
              )}
              {(item.cliente_ausente_lat && item.cliente_ausente_lng) && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${item.cliente_ausente_lat},${item.cliente_ausente_lng}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:8, fontSize:'.72rem', color:T.cyan, textDecoration:'none' }}>
                  <Navigation size={12} /> Ver localização no mapa
                </a>
              )}
            </div>
          )}

          {/* Check-in GPS */}
          {item.checkin_em && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:'.66rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>📍 Check-in no local</div>
              <div style={{ fontSize:'.78rem', color:T.text, marginBottom:3 }}>{fmtDt(item.checkin_em)}</div>
              {item.checkin_endereco && <div style={{ fontSize:'.74rem', color:T.muted, marginBottom:6 }}>{item.checkin_endereco}</div>}
              {(item.checkin_lat && item.checkin_lng) && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${item.checkin_lat},${item.checkin_lng}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:'.72rem', color:T.cyan, textDecoration:'none' }}>
                  <Navigation size={12} /> {item.checkin_lat.toFixed(5)}, {item.checkin_lng.toFixed(5)}
                </a>
              )}
            </div>
          )}

          {/* Fotos anexadas */}
          {item.attachments?.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:'.66rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>📷 Fotos ({item.attachments.length})</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:6 }}>
                {item.attachments.map(a => (
                  <a key={a.id} href={`/api/ticket-attachments/${a.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ position:'relative', display:'block', borderRadius:8, overflow:'hidden', aspectRatio:'1/1' }}>
                    <img src={`/api/ticket-attachments/${a.id}`} alt={a.legenda || 'Foto'} loading="lazy"
                      style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                    {a.momento && (
                      <span style={{ position:'absolute', top:4, left:4, padding:'2px 6px', borderRadius:5, background:'rgba(0,0,0,.7)', color:'#fff', fontSize:'.6rem', fontWeight:700 }}>
                        {a.momento}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <div style={{ fontSize:'.66rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:5 }}>Timeline</div>
            <div style={{ fontSize:'.74rem', color:T.muted, lineHeight:1.6, fontFamily:'monospace' }}>
              {item.criado_em && <div>• Aberto: {fmtDt(item.criado_em)}</div>}
              {item.atribuido_em && <div>• Atribuído: {fmtDt(item.atribuido_em)}</div>}
              {item.iniciado_em && <div>• Iniciado: {fmtDt(item.iniciado_em)}</div>}
              {item.resolvido_em && <div style={{ color:T.green }}>✓ Resolvido: {fmtDt(item.resolvido_em)}</div>}
              {item.fechado_em && <div>• Fechado: {fmtDt(item.fechado_em)}</div>}
            </div>
          </div>

          {/* Telefone */}
          {item.cliente_tel && (
            <a href={`tel:${item.cliente_tel}`}
              style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:12, fontSize:'.78rem', color:T.green, textDecoration:'none', fontWeight:700 }}>
              📞 {item.cliente_tel}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function HistoricoScreen({ onBack }) {
  const [data, setData] = useState({ historico: [], stats: {} });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiJson('/api/tecnico/historico-encerrados?limit=50');
      setData(r);
    } catch (e) { console.warn('historico: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = (data.historico || []).filter(item => {
    if (filtro === 'presencial') return item.resolucao_tipo === 'presencial';
    if (filtro === 'remoto') return item.resolucao_tipo === 'remoto';
    if (filtro === 'ausente') return !!item.cliente_ausente_em;
    return true;
  });

  const FILTROS = [
    ['todos',     'Todos'],
    ['presencial','Presencial'],
    ['remoto',    'Remoto'],
    ['ausente',   'Ausente'],
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'12px 14px',
        background: T.bg1, borderBottom:`1px solid ${T.bord}`, flexShrink:0,
      }}>
        <button onClick={onBack} aria-label="Voltar" style={{
          width:38, height:38, borderRadius:10, border:`1px solid ${T.bord}`, background:T.card,
          color:T.muted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:'.95rem', color:T.text }}>📚 Histórico de OS</div>
          <div style={{ fontSize:'.7rem', color:T.muted, marginTop:1 }}>
            {data.stats?.total || 0} encerradas · {data.stats?.ultimos_30d || 0} nos últimos 30 dias
            {data.stats?.nps_medio && ` · NPS médio ${data.stats.nps_medio}`}
          </div>
        </div>
        <button onClick={carregar} disabled={loading} aria-label="Atualizar" style={{
          width:38, height:38, borderRadius:10, border:`1px solid ${T.bord}`, background:T.card,
          color:T.muted, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
        }}>
          <RefreshCw size={15} style={{ animation: loading?'spin .7s linear infinite':'none' }} />
        </button>
      </div>

      {/* Stats sumário */}
      {data.stats?.total > 0 && (
        <div style={{ display:'flex', gap:8, padding:'10px 14px', flexShrink:0, background:T.bg }}>
          <StatChip label="Presencial" valor={data.stats.presencial} cor={T.green} />
          <StatChip label="Remoto" valor={data.stats.remoto} cor={'#a855f7'} />
          <StatChip label="30 dias" valor={data.stats.ultimos_30d} cor={T.cyan} />
        </div>
      )}

      {/* Pills de filtro */}
      <div style={{ display:'flex', gap:6, padding:'4px 14px 10px', overflowX:'auto', flexShrink:0 }}>
        {FILTROS.map(([k, lbl]) => (
          <button key={k} onClick={() => setFiltro(k)} style={{
            padding:'6px 12px', borderRadius:99, border:`1px solid ${filtro===k ? T.green : T.bord}`,
            background:filtro===k ? 'rgba(0,200,150,.12)' : T.card,
            color:filtro===k ? T.green : T.muted, fontWeight:700, fontSize:'.74rem', cursor:'pointer',
            whiteSpace:'nowrap', flexShrink:0, minHeight:36,
          }}>{lbl}</button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ flex:1, overflowY:'auto', padding:'4px 14px 24px', minHeight:0, WebkitOverflowScrolling:'touch' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:T.muted }}>Carregando…</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:T.muted }}>
            <CheckCircle2 size={40} style={{ opacity:.4, marginBottom:8 }} />
            <div style={{ fontWeight:700, marginBottom:4 }}>Nenhum encerrado ainda</div>
            <div style={{ fontSize:'.78rem' }}>OS resolvidas aparecerão aqui</div>
          </div>
        ) : (
          lista.map(item => (
            <CardItem
              key={item.id}
              item={item}
              expanded={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatChip({ label, valor, cor }) {
  return (
    <div style={{
      flex:1, padding:'6px 10px', borderRadius:8,
      background:`${cor}10`, border:`1px solid ${cor}30`, textAlign:'center',
    }}>
      <div style={{ fontSize:'1.1rem', fontWeight:900, color:cor, lineHeight:1 }}>{valor || 0}</div>
      <div style={{ fontSize:'.6rem', color:T.muted, marginTop:2, textTransform:'uppercase', letterSpacing:'.05em', fontWeight:700 }}>{label}</div>
    </div>
  );
}
