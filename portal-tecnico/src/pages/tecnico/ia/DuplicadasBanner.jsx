// DuplicadasBanner.jsx — alerta de OS potencialmente duplicada entre SGP e Maxxi.
// Evita o cenário: 2 técnicos vão pro mesmo cliente no mesmo dia.
//
// Uso:
//   <DuplicadasBanner osId={os.id} onAbrir={(outroId) => navegarPara(outroId)} />

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ExternalLink, X, Copy } from 'lucide-react';
import { T, fmtDt } from '../shared';
import { buscarDuplicadas, marcarNaoDuplicada } from './ia-api';

export function DuplicadasBanner({ osId, onAbrir }) {
  const [matches, setMatches]     = useState([]);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    let alivo = true;
    buscarDuplicadas(osId)
      .then(d => { if (alivo) setMatches(d.matches || []); })
      .catch(() => {}); // feature secundária, falha silenciosa
    return () => { alivo = false; };
  }, [osId]);

  if (dispensado || !matches.length) return null;
  const top = matches[0];

  const naoEh = async () => {
    setDispensado(true); // otimista — UI some na hora
    try { await marcarNaoDuplicada(osId, top.os_id); } catch {}
  };

  // Cor por intensidade do match
  const intense = top.score >= 0.85;
  const palette = intense
    ? { bg: 'linear-gradient(135deg, #FEE2E2, #FECACA)', bord: '#DC2626', icone: '#991B1B', txt: '#7F1D1D', sub: '#991B1B' }
    : { bg: 'linear-gradient(135deg, #FEF3C7, #FDE68A)', bord: '#F59E0B', icone: '#B45309', txt: '#78350F', sub: '#92400E' };

  return (
    <div style={{
      background: palette.bg,
      border: `1px solid ${palette.bord}`,
      borderRadius: T.r14,
      padding: '12px 14px',
      marginBottom: 12,
      display: 'flex', gap: 10, alignItems: 'flex-start',
      boxShadow: intense ? '0 2px 12px rgba(220,38,38,.15)' : 'none',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: '#fff', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {intense
          ? <Copy size={16} style={{ color: palette.icone }}/>
          : <AlertTriangle size={16} style={{ color: palette.icone }}/>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '.88rem', color: palette.txt, marginBottom: 3 }}>
          {intense ? 'Provável duplicada' : 'Possível duplicada'}
          <span style={{
            marginLeft: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: '.74rem',
            padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,.6)',
          }}>{Math.round(top.score * 100)}%</span>
        </div>

        <div style={{ fontSize: '.78rem', color: palette.sub, lineHeight: 1.4 }}>
          <strong>{top.fonte}-{top.os_id}</strong>
          {top.criada_em && <> · aberta {fmtDt(top.criada_em)}</>}
          {top.agente_nome && <> · {top.agente_nome}</>}
        </div>
        {top.motivo && (
          <div style={{ fontSize: '.74rem', color: palette.sub, marginTop: 2, opacity: .85 }}>
            ↳ {top.motivo}
          </div>
        )}

        {matches.length > 1 && (
          <div style={{ fontSize: '.7rem', color: palette.sub, marginTop: 4, fontStyle: 'italic' }}>
            +{matches.length - 1} outra{matches.length > 2 ? 's' : ''} possível{matches.length > 2 ? 'is' : ''}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button type="button" onClick={() => onAbrir?.(top.os_id, top.fonte)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '7px 12px', borderRadius: 8,
              background: '#fff', color: palette.txt,
              border: `1px solid ${palette.bord}`, fontWeight: 700, fontSize: '.76rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <ExternalLink size={12}/> Ver duplicada
          </button>
          <button type="button" onClick={naoEh}
            style={{
              padding: '7px 10px', borderRadius: 8,
              background: 'transparent', color: palette.sub,
              border: '1px solid transparent', fontWeight: 600, fontSize: '.76rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            Não é
          </button>
        </div>
      </div>

      <button type="button" onClick={() => setDispensado(true)} aria-label="Dispensar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 4, color: palette.sub, flexShrink: 0,
        }}>
        <X size={14}/>
      </button>
    </div>
  );
}
