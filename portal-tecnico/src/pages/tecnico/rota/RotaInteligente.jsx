// RotaInteligente.jsx — tela que mostra OS do dia ordenadas por rota ótima.
// Botão principal abre a rota completa no Google Maps (passo-a-passo nativo).
//
// Uso:
//   <RotaInteligente osDoDia={lista} onSelecionarOS={os => abrir(os)} />

import React, { useState, useEffect, useMemo } from 'react';
import {
  Map, Navigation, Clock, MapPin, Loader2,
  Route, RefreshCw, ChevronRight,
} from 'lucide-react';
import { T, TP, tipoLabel, fmtH } from '../shared';
import {
  ordenarPorRota, resumoRota,
  urlMapsRotaCompleta, urlMapsParaPonto,
} from './route-optimizer';

export function RotaInteligente({ osDoDia = [], onSelecionarOS }) {
  const [origem, setOrigem]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // GPS do técnico
  useEffect(() => {
    if (!navigator.geolocation) {
      setErro('GPS indisponível neste aparelho'); setLoading(false); return;
    }
    setLoading(true); setErro('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setOrigem({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoading(false);
      },
      () => { setErro('Ative o GPS para calcular a rota'); setLoading(false); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [refreshKey]);

  // Só OS com coordenadas válidas entram na rota
  const paradas = useMemo(() =>
    osDoDia
      .filter(os => Number.isFinite(+os.lat) && Number.isFinite(+os.lng))
      .map(os => ({ ...os, lat: +os.lat, lng: +os.lng })),
    [osDoDia]
  );
  const semCoords = osDoDia.length - paradas.length;

  const ordenadas = useMemo(
    () => origem ? ordenarPorRota(origem, paradas) : [],
    [origem, paradas]
  );
  const resumo = useMemo(
    () => origem ? resumoRota(origem, ordenadas) : null,
    [origem, ordenadas]
  );

  /* ── Estados especiais ────────────────────────────────────────────────── */
  if (loading) return <CenterMsg icon={<Loader2 size={28} className="rt-spin" style={{ color: T.green }}/>} titulo="Localizando você…"/>;

  if (erro) return (
    <CenterMsg
      icon={<MapPin size={28} style={{ color: T.amber }}/>}
      titulo={erro}
      sub="Toque para tentar novamente"
      onClick={() => setRefreshKey(k => k + 1)}
    />
  );

  if (!paradas.length) return (
    <CenterMsg
      icon={<Route size={28} style={{ color: T.muted }}/>}
      titulo="Sem OS com endereço geolocalizado"
      sub={semCoords > 0
        ? `${semCoords} OS sem coordenadas — peça pro despachador adicionar.`
        : 'A rota aparece aqui assim que houver OS atribuída.'}
    />
  );

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '0 16px 24px' }}>

      {/* Header com resumo da rota */}
      <div style={{
        background: 'linear-gradient(135deg, #16A34A 0%, #15803d 100%)',
        borderRadius: 18,
        padding: 16,
        color: '#fff',
        marginBottom: 16,
        boxShadow: '0 8px 24px rgba(22,163,74,.28)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decoração de fundo */}
        <div aria-hidden style={{
          position: 'absolute', top: -40, right: -40,
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,.18) 0%, transparent 70%)',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, position: 'relative' }}>
          <Route size={20}/>
          <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>
            Rota otimizada
          </div>
          <button onClick={() => setRefreshKey(k => k + 1)} aria-label="Recalcular"
            style={{
              marginLeft: 'auto', padding: 6, borderRadius: 8,
              background: 'rgba(255,255,255,.18)', color: '#fff',
              border: 'none', cursor: 'pointer', display: 'flex',
            }}>
            <RefreshCw size={14}/>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 18, fontSize: '.92rem', position: 'relative' }}>
          <Stat icon={<MapPin size={14}/>} valor={`${ordenadas.length}`} legenda="parada(s)"/>
          <Stat icon={<Navigation size={14}/>} valor={`${resumo.km}`} legenda="km"/>
          <Stat icon={<Clock size={14}/>} valor={`~${resumo.min}`} legenda="min"/>
        </div>

        <button
          onClick={() => window.open(urlMapsRotaCompleta(ordenadas), '_blank')}
          style={{
            marginTop: 14, width: '100%',
            padding: '11px', borderRadius: 12,
            background: 'rgba(255,255,255,.22)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,.4)',
            fontWeight: 800, fontSize: '.88rem',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            backdropFilter: 'blur(8px)',
            position: 'relative',
          }}>
          <Map size={15}/> Iniciar rota no Google Maps
        </button>

        {semCoords > 0 && (
          <div style={{
            marginTop: 10, fontSize: '.72rem', opacity: .85,
            position: 'relative',
          }}>
            ⚠ {semCoords} OS sem coordenadas ficaram fora da rota.
          </div>
        )}
      </div>

      {/* Lista de paradas */}
      <div style={{ position: 'relative' }}>
        {/* Linha conectora vertical */}
        <div aria-hidden style={{
          position: 'absolute',
          left: 19, top: 22, bottom: 22, width: 2,
          background: `linear-gradient(180deg, ${T.green} 0%, ${T.bord} 100%)`,
          borderRadius: 2,
        }}/>

        {ordenadas.map((p, i) => (
          <ParadaItem
            key={p.id || i}
            ordem={i + 1}
            parada={p}
            onClick={() => onSelecionarOS?.(p)}
            onNavegar={() => window.open(urlMapsParaPonto(p), '_blank')}
          />
        ))}
      </div>

      <style>{`
        @keyframes rt-spin { to { transform: rotate(360deg); } }
        .rt-spin { animation: rt-spin .9s linear infinite; }
      `}</style>
    </div>
  );
}

/* ── Subcomponentes ──────────────────────────────────────────────────────── */
function Stat({ icon, valor, legenda }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ opacity: .85, display: 'flex' }}>{icon}</span>
      <span><strong>{valor}</strong> <span style={{ opacity: .8, fontSize: '.78rem' }}>{legenda}</span></span>
    </div>
  );
}

function ParadaItem({ ordem, parada, onClick, onNavegar }) {
  const tp = parada.tipo || 'outro';
  return (
    <div style={{ position: 'relative', display: 'flex', gap: 12, padding: '8px 0' }}>
      {/* Marcador numerado */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: T.green, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 900, fontSize: '.95rem',
        flexShrink: 0, zIndex: 1,
        border: '3px solid #fff',
        boxShadow: '0 2px 8px rgba(22,163,74,.35)',
      }}>{ordem}</div>

      {/* Card */}
      <div onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
        style={{
          flex: 1, padding: 12, borderRadius: T.r14,
          background: '#fff', border: `1px solid ${T.bord}`,
          cursor: onClick ? 'pointer' : 'default',
          transition: 'border-color .15s, transform .12s',
          minWidth: 0,
        }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', marginBottom: 3 }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: '.92rem', lineHeight: 1.3 }}>
            <span style={{ marginRight: 4 }}>{TP[tp] || '📋'}</span>
            {tipoLabel(tp)}
          </div>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: '.7rem', fontWeight: 700,
            color: T.green, background: '#DCFCE7',
            padding: '2px 8px', borderRadius: 6,
            flexShrink: 0,
          }}>
            {parada.dist_km.toFixed(1)} km
          </span>
        </div>

        {(parada.cliente || parada.nome) && (
          <div style={{ fontSize: '.82rem', color: T.muted, marginBottom: 4 }}>
            {parada.cliente || parada.nome}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          fontSize: '.78rem', color: T.text, lineHeight: 1.4,
          marginBottom: 4,
        }}>
          <MapPin size={12} style={{ color: T.muted, flexShrink: 0, marginTop: 2 }}/>
          <span style={{ flex: 1, minWidth: 0 }}>{parada.endereco || '—'}</span>
        </div>

        {parada.sla && (
          <div style={{
            fontSize: '.72rem', color: T.amber, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginBottom: 6,
          }}>
            <Clock size={11}/> SLA {fmtH(parada.sla)}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); onNavegar(); }}
            style={{
              flex: 1, padding: '8px', borderRadius: 8,
              background: T.green, color: '#fff',
              border: 'none', fontWeight: 700, fontSize: '.78rem',
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
            <Navigation size={12}/> Navegar
          </button>
          {onClick && (
            <button onClick={(e) => { e.stopPropagation(); onClick(); }}
              style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'transparent', color: T.green,
                border: `1px solid ${T.bord}`, fontWeight: 700, fontSize: '.78rem',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              Abrir OS <ChevronRight size={12}/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CenterMsg({ icon, titulo, sub, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        padding: 40, textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div style={{ display: 'inline-block' }}>{icon}</div>
      <div style={{ marginTop: 12, color: T.text, fontWeight: 700, fontSize: '.92rem' }}>{titulo}</div>
      {sub && <div style={{ marginTop: 4, color: T.muted, fontSize: '.82rem' }}>{sub}</div>}
    </div>
  );
}
