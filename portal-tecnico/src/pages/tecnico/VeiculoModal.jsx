import React, { useState, useEffect, useRef } from 'react';
import { T, api, apiJson } from './shared';

function VeiculoModal({ onConfirm }) {
  const [veiculos, setVeiculos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [semVeiculo, setSemVeiculo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const lista = await apiJson('/api/tecnico/veiculos').catch(() => []);
        setVeiculos(Array.isArray(lista) ? lista : []);
      } finally { setLoading(false); }
    }
    carregar();
  }, []);

  const confirmar = async () => {
    if (!selecionado && !semVeiculo) return;
    if (selecionado) {
      await api('/api/tecnico/veiculo-do-dia', {
        method: 'POST',
        body: JSON.stringify({ veiculo_id: selecionado.id, placa: selecionado.placa, modelo: selecionado.modelo }),
      }).catch(() => {});
    }
    onConfirm(selecionado || null);
  };

  const iconeVeiculo = tipo => {
    if (!tipo) return '🚗';
    const t = tipo.toLowerCase();
    if (t.includes('moto')) return '🏍️';
    if (t.includes('van') || t.includes('sprinter')) return '🚐';
    if (t.includes('caminhao') || t.includes('caminhão')) return '🚛';
    return '🚗';
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:480, background:T.bg1, borderRadius:'20px 20px 0 0', padding:'24px 20px', paddingBottom:'max(24px,env(safe-area-inset-bottom))' }}>
        <div style={{ width:40, height:4, background:T.bord, borderRadius:2, margin:'0 auto 20px' }} />
        <div style={{ fontSize:'1.1rem', fontWeight:900, color:T.text, marginBottom:4 }}>🚗 Veículo do dia</div>
        <div style={{ fontSize:'.8rem', color:T.muted, marginBottom:20 }}>Selecione o veículo que você está usando hoje</div>

        {loading ? (
          <div style={{ textAlign:'center', padding:30, color:T.muted }}>Carregando...</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:300, overflowY:'auto', marginBottom:16 }}>
            {veiculos.map(v => (
              <div key={v.id} onClick={() => { setSelecionado(v); setSemVeiculo(false); }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:12,
                  border:`1.5px solid ${selecionado?.id === v.id ? T.green : T.bord}`,
                  background: selecionado?.id === v.id ? 'rgba(0,200,150,.08)' : T.card,
                  cursor:'pointer', transition:'all .15s' }}>
                <span style={{ fontSize:24 }}>{iconeVeiculo(v.tipo)}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:'.92rem', color:T.text }}>{v.modelo || 'Veículo'}</div>
                  <div style={{ fontSize:'.75rem', color:T.muted, marginTop:2 }}>🪪 {v.placa}{v.cor ? ` · ${v.cor}` : ''}{v.ano ? ` · ${v.ano}` : ''}</div>
                </div>
                {selecionado?.id === v.id && <span style={{ color:T.green, fontSize:18 }}>✓</span>}
              </div>
            ))}
            {veiculos.length === 0 && (
              <div style={{ textAlign:'center', color:T.muted, padding:20, fontSize:'.85rem' }}>
                Nenhum veículo cadastrado na frota
              </div>
            )}
          </div>
        )}

        <div onClick={() => { setSemVeiculo(true); setSelecionado(null); }}
          style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:12,
            border:`1.5px solid ${semVeiculo ? T.yel : T.bord}`,
            background: semVeiculo ? 'rgba(255,214,0,.06)' : 'transparent',
            cursor:'pointer', marginBottom:16 }}>
          <span style={{ fontSize:20 }}>🚶</span>
          <span style={{ fontSize:'.88rem', color: semVeiculo ? T.yel : T.muted, fontWeight: semVeiculo ? 700 : 400 }}>
            Sem veículo hoje / a pé
          </span>
          {semVeiculo && <span style={{ color:T.yel, fontSize:18, marginLeft:'auto' }}>✓</span>}
        </div>

        <button type="button" onClick={confirmar} disabled={!selecionado && !semVeiculo}
          style={{ width:'100%', padding:'15px', borderRadius:14, border:'none',
            background: (selecionado || semVeiculo) ? T.green : T.bord,
            color: (selecionado || semVeiculo) ? '#000' : T.muted,
            fontWeight:800, fontSize:'1rem', cursor: (selecionado || semVeiculo) ? 'pointer' : 'default',
            transition:'all .2s' }}>
          Confirmar e entrar
        </button>
      </div>
    </div>
  );
}



export { VeiculoModal };

/* ══════════════════════════════════════════════════════════════════════════════
   VeiculoSheet — bottom sheet contextual exibido ao clicar na placa no header.
   Mostra info do veículo + ações rápidas (Abastecer, Checklist).
   ══════════════════════════════════════════════════════════════════════════════ */
function VeiculoSheet({ veiculo, onAbastecer, onChecklist, onTrocarVeiculo, onClose }) {
  const [lastFuel, setLastFuel] = useState(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!veiculo?.id) return;
    apiJson(`/api/frota/fuel?vid=${veiculo.id}&limit=1`)
      .then(rows => { if (rows?.[0]) setLastFuel(rows[0]); })
      .catch(() => {});
  }, [veiculo?.id]);

  // Slide-up animation
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = 'translateY(100%)';
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 280ms cubic-bezier(0.32,0.72,0,1)';
        el.style.transform = 'translateY(0)';
      });
    });
  }, []);

  const close = () => {
    const el = sheetRef.current;
    if (el) {
      el.style.transition = 'transform 180ms cubic-bezier(0.4,0,1,1)';
      el.style.transform = 'translateY(100%)';
      setTimeout(onClose, 175);
    } else { onClose(); }
  };

  const placa = veiculo?.placa || '—';
  const modelo = veiculo?.modelo || veiculo?.model || '';
  const km = veiculo?.km_atual ? Number(veiculo.km_atual).toLocaleString('pt-BR') + ' km' : null;

  // Formata última data de abastecimento como relativo
  const fmtRelativo = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 86400000);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'ontem';
    if (diff < 7) return `há ${diff} dias`;
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
  };

  const preco = lastFuel && parseFloat(lastFuel.litros) > 0
    ? (parseFloat(lastFuel.valor_total) / parseFloat(lastFuel.litros)).toFixed(2)
    : null;

  return (
    <div
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:9998, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && close()}
    >
      <div ref={sheetRef} style={{ width:'100%', maxWidth:480, background:T.bg1, borderRadius:'20px 20px 0 0', paddingBottom:'max(20px,env(safe-area-inset-bottom))', willChange:'transform' }}>

        {/* Drag handle */}
        <div style={{ padding:'12px 20px 0', display:'flex', justifyContent:'center' }}>
          <div style={{ width:40, height:4, background:T.bord, borderRadius:2 }} />
        </div>

        {/* Placa hero — estilo Mercosul */}
        <div style={{ margin:'16px 20px 0', display:'flex', alignItems:'center', gap:14 }}>
          <div style={{
            background:'#fff', borderRadius:8, border:'3px solid #003399',
            padding:'6px 14px 6px 10px', display:'inline-flex', flexDirection:'column',
            alignItems:'center', gap:1, flexShrink:0, minWidth:110,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:1 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#003399' }} />
              <span style={{ fontSize:'.55rem', fontWeight:900, color:'#003399', letterSpacing:'.12em', textTransform:'uppercase' }}>Brasil</span>
            </div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:'1.3rem', color:'#111', letterSpacing:'.08em', lineHeight:1 }}>
              {placa}
            </div>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            {modelo && <div style={{ fontWeight:800, fontSize:'.95rem', color:T.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{modelo}</div>}
            {km && <div style={{ fontSize:'.75rem', color:T.muted, marginTop:3 }}>📍 {km}</div>}
            {!modelo && !km && <div style={{ fontSize:'.8rem', color:T.muted }}>Veículo do dia</div>}
          </div>
        </div>

        {/* Ações rápidas */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, margin:'16px 20px 0' }}>
          <button type="button" onClick={() => { close(); setTimeout(onAbastecer, 190); }}
            style={{ padding:'14px 12px', borderRadius:14, border:`1.5px solid rgba(0,200,150,.35)`,
              background:'rgba(0,200,150,.08)', cursor:'pointer', textAlign:'left', touchAction:'manipulation' }}>
            <div style={{ fontSize:'1.4rem', marginBottom:6 }}>⛽</div>
            <div style={{ fontWeight:800, fontSize:'.88rem', color:T.green }}>Abastecer</div>
            <div style={{ fontSize:'.7rem', color:T.muted, marginTop:2 }}>Registrar abastecimento</div>
          </button>
          <button type="button" onClick={() => { close(); setTimeout(onChecklist, 190); }}
            style={{ padding:'14px 12px', borderRadius:14, border:`1.5px solid rgba(62,207,255,.3)`,
              background:'rgba(62,207,255,.07)', cursor:'pointer', textAlign:'left', touchAction:'manipulation' }}>
            <div style={{ fontSize:'1.4rem', marginBottom:6 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:'.88rem', color:'#3ecfff' }}>Checklist</div>
            <div style={{ fontSize:'.7rem', color:T.muted, marginTop:2 }}>Vistoria pré-saída</div>
          </button>
        </div>

        {/* Último abastecimento */}
        {lastFuel && (
          <div style={{ margin:'12px 20px 0', padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,.04)', border:`1px solid ${T.bord}`, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:'1rem' }}>⛽</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'.75rem', color:T.muted }}>Último abastecimento</div>
              <div style={{ fontSize:'.8rem', color:T.text, fontWeight:600, marginTop:1 }}>
                {fmtRelativo(lastFuel.data)} · {parseFloat(lastFuel.litros||0).toFixed(1)} L
                {preco && <span style={{ color:'#f5c518', marginLeft:6 }}>R$ {preco}/L</span>}
              </div>
            </div>
          </div>
        )}

        {/* Trocar veículo */}
        <div style={{ margin:'14px 20px 0' }}>
          <button type="button" onClick={() => { close(); setTimeout(onTrocarVeiculo, 190); }}
            style={{ width:'100%', padding:'13px', borderRadius:12, border:`1px solid ${T.bord}`,
              background:'transparent', color:T.muted, fontWeight:600, fontSize:'.85rem', cursor:'pointer', touchAction:'manipulation' }}>
            🔄 Trocar veículo
          </button>
        </div>
      </div>
    </div>
  );
}

export { VeiculoSheet };
