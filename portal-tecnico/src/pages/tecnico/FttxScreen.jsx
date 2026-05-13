import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTec } from './TecnicoContext';
import { T, api, apiJson } from './shared';
import { SkeletonCards } from './SharedComponents';

function FttxScreen() {
  const { user, showToast } = useTec();
  const [modo,    setModo]    = useState('unauth'); // unauth | auth
  const [olts,    setOlts]    = useState([]);
  const [oltId,   setOltId]   = useState('');
  const [pons,    setPons]    = useState([]);
  const [onus,    setOnus]    = useState([]);
  const [loadOlt, setLoadOlt] = useState(false);
  const [loadOnu, setLoadOnu] = useState(false);
  const [selected, setSelected] = useState(null); // ONU selecionada
  const [saving,   setSaving]   = useState(false);
  const [form,     setForm]     = useState({
    slot:'', pon:'', phy_addr:'', onutype:'', mode:'2',
    vlan:'', contrato:'', service:'', pppoe_login:'',
    pppoe_password:'', description:'', ident:'',
  });
  const [filtros,  setFiltros]  = useState({ cpfcnpj:'', contrato:'', login:'' });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Carrega OLTs ao montar
  useEffect(() => {
    setLoadOlt(true);
    apiJson('/api/fttx/olts').then(d => {
      setOlts(Array.isArray(d) ? d : []);
    }).catch(() => {}).finally(() => setLoadOlt(false));
  }, []);

  // Carrega ONUs quando OLT e modo mudam
  useEffect(() => {
    if (!oltId) return;
    setLoadOnu(true); setOnus([]); setSelected(null);
    const path = modo === 'unauth'
      ? `/api/fttx/olt/${oltId}/unauth`
      : `/api/fttx/olt/${oltId}/onus`;
    // Filtros opcionais para autorizadas
    const qs = new URLSearchParams();
    if (modo === 'auth') {
      if (filtros.cpfcnpj)  qs.set('cpfcnpj',  filtros.cpfcnpj.replace(/\D/g,''));
      if (filtros.contrato) qs.set('contrato',  filtros.contrato);
      if (filtros.login)    qs.set('login',     filtros.login);
    }
    const url = path + (qs.toString() ? '?' + qs : '');
    apiJson(url).then(d => setOnus(Array.isArray(d) ? d : []))
      .catch(() => {}).finally(() => setLoadOnu(false));
  }, [oltId, modo]);

  const selecionarOnu = (onu) => {
    setSelected(onu);
    // Pré-preenche o form com dados da ONU
    setForm(f => ({
      ...f,
      slot:        String(onu.slot || ''),
      pon:         String(onu.pon  || ''),
      phy_addr:    onu.phy_addr || '',
      onutype:     onu.type    || '',
      vlan:        String(onu.vlan || ''),
      mode:        onu.mode === 'Bridge' ? '1' : onu.mode === 'PPPoE' ? '2' : '2',
      service:     onu.service_login   || '',
      contrato:    String(onu.service_contrato || ''),
      description: onu.description || onu.service_cliente || '',
      ident:       onu.ident || '',
    }));
  };

  const autorizar = async () => {
    if (!form.slot || !form.pon || !form.phy_addr || !form.onutype || !form.mode) {
      return showToast('Preencha: Slot, PON, PHY Addr, Tipo e Modo', true);
    }
    setSaving(true);
    try {
      const r = await api(`/api/fttx/olt/${oltId}/autorizar`, {
        method: 'POST',
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (r.ok || r.onu_obj) {
        showToast('✅ ONU autorizada com sucesso!');
        setSelected(null);
        // Recarrega lista
        const d = await apiJson(`/api/fttx/olt/${oltId}/unauth`).catch(() => []);
        setOnus(Array.isArray(d) ? d : []);
      } else {
        showToast(r.error || r.msg || 'Erro ao autorizar', true);
      }
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const desautorizar = async (onu) => {
    setSaving(true);
    try {
      const r = await api(`/api/fttx/onu/${onu.id}/desautorizar`, {
        method: 'POST',
        body: JSON.stringify({}),
      }).then(r => r.json());
      if (r.ok || r.msg) {
        showToast('✅ ONU removida: ' + (r.msg || ''));
        const d = await apiJson(`/api/fttx/olt/${oltId}/onus`).catch(() => []);
        setOnus(Array.isArray(d) ? d : []);
      } else {
        showToast(r.error || 'Erro ao desautorizar', true);
      }
    } catch(e) { showToast('Erro: ' + e.message, true); }
    setSaving(false);
  };

  // ── Formulário de autorização ───────────────────────────────────
  if (selected && modo === 'unauth') return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:`1px solid ${T.bord}`, flexShrink:0 }}>
        <button type="button" onClick={() => setSelected(null)} aria-label="Voltar"
          style={{ width:40, height:40, borderRadius:10, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:'.9rem' }}>🔌 Autorizar ONU</div>
          <div style={{ fontSize:'.7rem', color:T.muted }}>{selected.phy_addr}</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {/* Info da ONU detectada */}
        <div style={{ background:'rgba(0,200,150,.06)', border:`1px solid rgba(0,200,150,.2)`, borderRadius:T.r12, padding:'10px 12px', marginBottom:16 }}>
          <div style={{ fontSize:'.65rem', color:T.green, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>📡 ONU Detectada na OLT</div>
          {[
            ['PHY Addr', selected.phy_addr],
            ['Tipo',     selected.type],
            ['Slot/PON', `${selected.slot}/${selected.pon}`],
            ['VLAN',     selected.vlan],
          ].filter(([,v])=>v).map(([k,v]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:'.72rem', color:T.muted }}>{k}</span>
              <span style={{ fontSize:'.78rem', color:T.text, fontFamily:'monospace' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Campos do formulário */}
        {[
          { key:'contrato',       label:'Nº Contrato',  type:'number', placeholder:'Ex: 4521' },
          { key:'service',        label:'Login PPPoE',   type:'text',   placeholder:'Ex: 5225' },
          { key:'pppoe_login',    label:'PPPoE Login',   type:'text',   placeholder:'Ex: 5225@citmax' },
          { key:'pppoe_password', label:'PPPoE Senha',   type:'text',   placeholder:'Senha do serviço' },
          { key:'vlan',           label:'VLAN',          type:'number', placeholder:'Ex: 1000' },
          { key:'onutype',        label:'Tipo ONU',      type:'text',   placeholder:'Ex: AN5506-02B' },
          { key:'description',    label:'Descrição',     type:'text',   placeholder:'Nome do cliente' },
          { key:'ident',          label:'Etiqueta',      type:'text',   placeholder:'Ex: CTO-01-P04' },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key} style={{ marginBottom:12 }}>
            <div style={{ fontSize:'.65rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:5 }}>{label}</div>
            <input type={type} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}
              placeholder={placeholder} aria-label={label}
              style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.9rem', outline:'none', boxSizing:'border-box' }} />
          </div>
        ))}

        {/* Modo */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:'.65rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:5 }}>Modo de Operação</div>
          <select value={form.mode} onChange={e => setForm(f => ({...f, mode: e.target.value}))} aria-label="Modo ONU"
            style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.9rem', outline:'none', boxSizing:'border-box' }}>
            <option value="1">Bridge</option>
            <option value="2">PPPoE</option>
            <option value="3">Bridge WAN</option>
            <option value="4">DHCP</option>
          </select>
        </div>

        <button type="button" onClick={autorizar} disabled={saving} aria-label="Confirmar autorização da ONU"
          style={{ width:'100%', padding:'15px', borderRadius:T.r14, border:'none', background:`linear-gradient(135deg,${T.green},#008b87)`, color:'#030f0b', fontWeight:900, fontSize:'1rem', cursor:'pointer', marginBottom:20 }}>
          {saving
            ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ width:18,height:18,border:'2px solid rgba(3,15,11,.3)',borderTopColor:'#030f0b',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite' }} />
                Autorizando…
              </span>
            : '✅ Autorizar ONU'}
        </button>
      </div>
    </div>
  );

  // ── Lista principal ─────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header com seletor de OLT */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${T.bord}`, flexShrink:0 }}>
        <select value={oltId} onChange={e => setOltId(e.target.value)} disabled={loadOlt} aria-label="Selecionar OLT"
          style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:oltId ? T.text : T.muted, fontSize:'.9rem', outline:'none', marginBottom:10 }}>
          <option value="">{loadOlt ? 'Carregando OLTs…' : '→ Selecione uma OLT'}</option>
          {olts.map(o => (
            <option key={o.id} value={o.id}>{o.name} ({o.olttype})</option>
          ))}
        </select>

        {/* Toggle Não Autorizadas / Autorizadas */}
        {oltId && (
          <div style={{ display:'flex', gap:6 }}>
            {[['unauth','🔴 Não autorizadas'],['auth','✅ Autorizadas']].map(([m,l]) => (
              <button type="button" key={m} onClick={() => { setModo(m); setMostrarFiltros(false); }} aria-pressed={modo===m}
                style={{ flex:1, padding:'10px 8px', borderRadius:T.r12, border:`1px solid ${modo===m ? T.green : T.bord}`, background:modo===m?'rgba(0,200,150,.1)':T.card, color:modo===m?T.green:T.muted, fontWeight:700, cursor:'pointer', fontSize:'.78rem' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {/* Filtros opcionais — só aparecem no modo autorizadas */}
        {oltId && modo === 'auth' && (
          <div style={{ marginTop:8 }}>
            <button type="button" onClick={() => setMostrarFiltros(v => !v)} aria-expanded={mostrarFiltros}
              style={{ width:'100%', padding:'9px', borderRadius:T.r12, border:`1px solid ${mostrarFiltros ? T.green : T.bord}`, background:mostrarFiltros?'rgba(0,200,150,.08)':T.card, color:mostrarFiltros?T.green:T.muted, fontWeight:700, cursor:'pointer', fontSize:'.78rem', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              🔍 {mostrarFiltros ? 'Ocultar filtros' : 'Filtrar por cliente'}
            </button>

            {mostrarFiltros && (
              <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { key:'cpfcnpj',  label:'CPF / CNPJ',   placeholder:'Somente números', type:'tel' },
                  { key:'contrato', label:'Nº Contrato',   placeholder:'Ex: 4521',        type:'number' },
                  { key:'login',    label:'Login PPPoE',   placeholder:'Ex: 5225',        type:'text' },
                ].map(({ key, label, placeholder, type }) => (
                  <div key={key}>
                    <div style={{ fontSize:'.62rem', color:T.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>{label}</div>
                    <input type={type} value={filtros[key]} onChange={e => setFiltros(f => ({...f, [key]: e.target.value}))}
                      placeholder={placeholder} aria-label={label}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.88rem', outline:'none', boxSizing:'border-box' }} />
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setLoadOnu(true); setOnus([]);
                  const qs = new URLSearchParams();
                  if (filtros.cpfcnpj)  qs.set('cpfcnpj',  filtros.cpfcnpj.replace(/\D/g,''));
                  if (filtros.contrato) qs.set('contrato',  filtros.contrato);
                  if (filtros.login)    qs.set('login',     filtros.login);
                  apiJson(`/api/fttx/olt/${oltId}/onus?${qs}`)
                    .then(d => setOnus(Array.isArray(d) ? d : []))
                    .catch(() => {}).finally(() => setLoadOnu(false));
                }} aria-label="Aplicar filtros"
                  style={{ padding:'11px', borderRadius:T.r12, border:'none', background:`linear-gradient(135deg,${T.green},#008b87)`, color:'#030f0b', fontWeight:900, cursor:'pointer', fontSize:'.88rem' }}>
                  🔍 Buscar
                </button>
                {(filtros.cpfcnpj || filtros.contrato || filtros.login) && (
                  <button type="button" onClick={() => { setFiltros({ cpfcnpj:'', contrato:'', login:'' }); }}
                    style={{ padding:'9px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:'none', color:T.muted, cursor:'pointer', fontSize:'.78rem' }}>
                    ✕ Limpar filtros
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de ONUs */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {!oltId && (
          <div style={{ textAlign:'center', padding:'40px 0', color:T.muted }}>
            <div style={{ fontSize:40, marginBottom:10 }}>📡</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>Selecione uma OLT</div>
            <div style={{ fontSize:'.82rem' }}>para ver as ONUs disponíveis</div>
          </div>
        )}

        {oltId && loadOnu && <SkeletonCards n={3} />}

        {oltId && !loadOnu && onus.length === 0 && (
          <div style={{ textAlign:'center', padding:'32px 0', color:T.muted }}>
            <div style={{ fontSize:36, marginBottom:10 }}>{modo==='unauth'?'✅':'📋'}</div>
            <div style={{ fontWeight:700 }}>{modo==='unauth' ? 'Nenhuma ONU não autorizada' : 'Nenhuma ONU autorizada'}</div>
          </div>
        )}

        {onus.map(onu => (
          <div key={onu.id} style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'13px 14px', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:8 }}>
              <div style={{ fontSize:22, flexShrink:0 }}>📟</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:'.9rem', fontFamily:'monospace', color:T.text }}>{onu.phy_addr || '—'}</div>
                <div style={{ fontSize:'.72rem', color:T.muted, marginTop:2 }}>
                  {onu.type || 'ONU'} · Slot {onu.slot} / PON {onu.pon} · VLAN {onu.vlan || '—'}
                </div>
                {onu.service_cliente && (
                  <div style={{ fontSize:'.75rem', color:T.green, marginTop:3, fontWeight:700 }}>👤 {onu.service_cliente}</div>
                )}
              </div>
              <div style={{ flexShrink:0 }}>
                {modo === 'unauth' ? (
                  <button type="button" onClick={() => selecionarOnu(onu)} aria-label="Autorizar esta ONU"
                    style={{ padding:'8px 14px', borderRadius:10, border:'none', background:`linear-gradient(135deg,${T.green},#008b87)`, color:'#030f0b', fontWeight:900, cursor:'pointer', fontSize:'.82rem' }}>
                    Autorizar
                  </button>
                ) : (
                  <button type="button" onClick={() => desautorizar(onu)} disabled={saving} aria-label="Desautorizar esta ONU"
                    style={{ padding:'8px 14px', borderRadius:10, border:`1px solid rgba(255,71,87,.3)`, background:'rgba(255,71,87,.08)', color:T.red, fontWeight:700, cursor:'pointer', fontSize:'.82rem' }}>
                    Remover
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════════════════
   ROOT — nav bottom + roteamento
═══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
   MODAL DE SELEÇÃO DE VEÍCULO DO DIA
═══════════════════════════════════════════════════════════════════════════ */

export { FttxScreen };
