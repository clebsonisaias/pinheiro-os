// DiagnosticoIA.jsx — card no topo da OS antes do técnico sair.
// Mostra: causa provável + tendência de sinal + peças sugeridas + histórico.
//
// Uso:
//   <DiagnosticoIA osId={os.id} />

import React, { useState, useEffect } from 'react';
import {
  Sparkles, Wrench, TrendingDown, TrendingUp, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Lightbulb,
} from 'lucide-react';
import { T } from '../shared';
import { diagnosticar } from './ia-api';

export function DiagnosticoIA({ osId }) {
  const [dado, setDado]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState('');
  const [aberto, setAberto]   = useState(true);

  useEffect(() => {
    let alivo = true;
    setLoading(true); setErro('');
    diagnosticar(osId)
      .then(d => { if (alivo) setDado(d); })
      .catch(e => { if (alivo) setErro(e.message || 'IA indisponível'); })
      .finally(() => { if (alivo) setLoading(false); });
    return () => { alivo = false; };
  }, [osId]);

  // Se a IA falhar, simplesmente não mostra nada (não atrapalha o fluxo do técnico)
  if (erro && !dado) return null;

  return (
    <div style={cardStyle}>
      <Header
        aberto={aberto}
        onClick={() => setAberto(v => !v)}
        confianca={dado?.confianca}
        loading={loading}
      />

      {aberto && (
        <div style={{ padding: '4px 14px 14px' }}>
          {loading ? (
            <SkeletonBody/>
          ) : (
            <>
              {/* Causa provável */}
              {dado.causa_provavel && (
                <Row icon={<AlertTriangle size={16} style={{ color: T.amber }}/>}
                     label="Causa provável">
                  <div style={{ fontSize: '.92rem', color: T.text, lineHeight: 1.4 }}>
                    {dado.causa_provavel}
                  </div>
                </Row>
              )}

              {/* Tendência de sinal */}
              {dado.sinal_serie?.length > 1 && (
                <SinalRow serie={dado.sinal_serie}/>
              )}

              {/* Equipamentos */}
              {dado.equipamentos?.length > 0 && (
                <Row icon={<Wrench size={16} style={{ color: T.green }}/>}
                     label="Leve no carro">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {dado.equipamentos.map((eq, i) => (
                      <span key={i} style={chipStyle}>
                        {eq.nome}
                        {eq.qtd > 1 && (
                          <strong style={{ color: T.green, marginLeft: 2 }}>×{eq.qtd}</strong>
                        )}
                      </span>
                    ))}
                  </div>
                </Row>
              )}

              {/* Resumo do histórico */}
              {dado.historico_resumo && (
                <div style={{
                  marginTop: 6, padding: 10, borderRadius: 10,
                  background: '#F6FAF6', border: `1px solid ${T.bord}`,
                }}>
                  <div style={labelMicroStyle}>
                    <Clock size={12} style={{ marginRight: 4, verticalAlign: '-1px' }}/>
                    Histórico do cliente
                  </div>
                  <div style={{ fontSize: '.82rem', color: T.text, lineHeight: 1.5 }}>
                    {dado.historico_resumo}
                  </div>
                </div>
              )}

              {/* Dica */}
              <div style={{
                marginTop: 10, padding: '8px 10px', borderRadius: 8,
                background: 'rgba(2,132,199,.06)', border: `1px solid rgba(2,132,199,.2)`,
                display: 'flex', alignItems: 'flex-start', gap: 6,
                fontSize: '.75rem', color: T.cyan, lineHeight: 1.4,
              }}>
                <Lightbulb size={13} style={{ flexShrink: 0, marginTop: 1 }}/>
                Sugestões da IA — sempre validar no local antes de executar.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Subcomponentes ──────────────────────────────────────────────────────── */
function Header({ aberto, onClick, confianca, loading }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: '100%', padding: '14px',
      background: 'linear-gradient(135deg, rgba(22,163,74,.06), rgba(22,163,74,.12))',
      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: aberto ? `1px solid ${T.bord}` : 'none',
    }}>
      <Sparkles size={18} style={{
        color: T.green, flexShrink: 0,
        animation: loading ? 'ia-pulse 1.4s ease-in-out infinite' : 'none',
      }}/>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontWeight: 800, color: T.text, fontSize: '.92rem' }}>
          Diagnóstico IA
        </div>
        {confianca > 0 ? (
          <div style={{ fontSize: '.7rem', color: T.muted, marginTop: 1 }}>
            Confiança {Math.round(confianca * 100)}% · SGP + histórico
          </div>
        ) : loading ? (
          <div style={{ fontSize: '.7rem', color: T.muted, marginTop: 1 }}>
            Analisando histórico e métricas…
          </div>
        ) : null}
      </div>
      {aberto
        ? <ChevronUp size={16} style={{ color: T.muted }}/>
        : <ChevronDown size={16} style={{ color: T.muted }}/>}
      <style>{`@keyframes ia-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:.6}}`}</style>
    </button>
  );
}

function Row({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10 }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelMicroStyle}>{label}</div>
        {children}
      </div>
    </div>
  );
}

function SinalRow({ serie }) {
  const delta = serie[serie.length - 1] - serie[0];
  const neg = delta < 0;
  return (
    <Row
      icon={neg
        ? <TrendingDown size={16} style={{ color: T.red }}/>
        : <TrendingUp size={16} style={{ color: T.green }}/>}
      label="Tendência de sinal · últimos 7 dias"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkline serie={serie} neg={neg}/>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: '.82rem', fontWeight: 700,
          color: neg ? T.red : T.green,
        }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} dBm
        </span>
      </div>
    </Row>
  );
}

function Sparkline({ serie, neg }) {
  if (!serie || serie.length < 2) return null;
  const w = 120, h = 22;
  const min = Math.min(...serie), max = Math.max(...serie);
  const range = max - min || 1;
  const pts = serie.map((v, i) => {
    const x = (i / (serie.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = neg ? T.red : T.green;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`spk-${neg ? 'r' : 'g'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".22"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={`url(#spk-${neg ? 'r' : 'g'})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SkeletonBody() {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={skLine(70)}/>
      <div style={skLine(100)}/>
      <div style={skLine(40)}/>
    </div>
  );
}

/* ── Estilos ─────────────────────────────────────────────────────────────── */
const cardStyle = {
  background: '#fff',
  border: `1px solid ${T.bord}`,
  borderRadius: T.r16,
  marginBottom: 12,
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(22,163,74,.06)',
};
const labelMicroStyle = {
  fontSize: '.7rem',
  fontWeight: 700,
  color: T.muted,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  marginBottom: 4,
};
const chipStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '4px 10px', borderRadius: 999,
  background: '#DCFCE7', color: T.text,
  fontSize: '.78rem', fontWeight: 600,
  border: `1px solid ${T.bord}`,
};
const skLine = (pct) => ({
  height: 10,
  width: `${pct}%`,
  background: 'linear-gradient(90deg,#EDF5ED,#F6FAF6,#EDF5ED)',
  backgroundSize: '200% 100%',
  borderRadius: 6,
  marginBottom: 8,
  animation: 'sk-shimmer 1.4s linear infinite',
});
