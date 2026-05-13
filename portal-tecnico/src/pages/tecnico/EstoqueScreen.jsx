// EstoqueScreen.jsx — Tela de Estoque do técnico no TecnicoApp.
// Duas abas: Devolução avulsa (sem OS) e Inventário do veículo.
import React, { useState, useEffect, useCallback } from 'react';
import { T, api, apiJson } from './shared';

export function EstoqueScreen() {
  const [tab, setTab] = useState('devolver'); // 'devolver' | 'inventario'

  return (
    <div style={{ overflowY:'auto', flex:1, padding:'14px 16px 80px' }}>
      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16, padding:3, background:'rgba(255,255,255,.04)', borderRadius:10 }}>
        {[
          { id:'devolver',   label:'📤 Devolver',   icon:'📤' },
          { id:'inventario', label:'✅ Inventário', icon:'✅' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'10px 8px', borderRadius:8, border:'none',
            background: tab===t.id ? T.green : 'transparent',
            color: tab===t.id ? '#0b0e11' : T.muted,
            fontFamily:'inherit', fontSize:'.84rem', fontWeight:700, cursor:'pointer',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'devolver'   && <DevolucaoAvulsa />}
      {tab === 'inventario' && <InventarioVeiculo />}
    </div>
  );
}

/* ─── Devolução Avulsa ──────────────────────────────────────────────────── */
function DevolucaoAvulsa() {
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [extraido, setExtraido] = useState(null);
  const [sn, setSn] = useState('');
  const [mac, setMac] = useState('');
  const [psn, setPsn] = useState('');
  const [defeituoso, setDefeituoso] = useState(false);
  const [motivoDefeito, setMotivoDefeito] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const onFoto = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFoto(f);
    setFotoPreview(URL.createObjectURL(f));
    setProcessando(true);
    setErro(null);
    try {
      // 1. Upload do arquivo
      const fd = new FormData();
      fd.append('arquivo', f);
      fd.append('tipo', 'etiqueta');
      const up = await api('/api/estoque/upload-arquivo', { method:'POST', body: fd }).then(r => r.json());
      if (!up.ok) throw new Error(up.error || 'Upload falhou');
      setFotoUrl(up.caminho);

      // 2. OCR via Vision
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
      });
      const ocr = await apiJson('/api/estoque/ocr-etiqueta', {
        method:'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: f.type, tipo:'etiqueta' }),
      });
      setExtraido(ocr);
      const snExt  = ocr.psns?.find(p => /^[A-Z0-9]{8,}$/i.test(p)) || '';
      const macExt = (ocr.macs?.[0] || '').toUpperCase();
      const psnExt = ocr.psns?.[0] || '';
      setSn(snExt);
      setMac(macExt);
      setPsn(psnExt);
    } catch (e) {
      setErro(e.message);
    } finally {
      setProcessando(false);
    }
  };

  const devolver = async () => {
    if (!sn && !mac && !psn) { setErro('Tira foto da etiqueta ou digita SN/MAC/PSN'); return; }
    if (defeituoso && !motivoDefeito.trim()) { setErro('Informe o motivo do defeito'); return; }
    setSalvando(true);
    setErro(null);
    try {
      const r = await apiJson('/api/tecnico/estoque/devolver', {
        method:'POST',
        body: JSON.stringify({
          sn: sn || null, mac: mac || null, psn: psn || null,
          defeituoso, motivo_defeito: defeituoso ? motivoDefeito : null,
          observacoes: obs || null,
          foto_etiqueta: fotoUrl,
        }),
      });
      setOk(r);
      // Limpa
      setFoto(null); setFotoPreview(null); setFotoUrl(null);
      setExtraido(null); setSn(''); setMac(''); setPsn('');
      setDefeituoso(false); setMotivoDefeito(''); setObs('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize:'.85rem', color:T.muted, marginBottom:12 }}>
        Use quando precisar devolver um equipamento ao depósito <strong style={{color:T.text}}>fora de uma OS</strong>.
      </div>

      {ok && (
        <div style={{ padding:'12px 14px', background:'rgba(0,200,150,.1)', border:'1px solid rgba(0,200,150,.3)', borderRadius:10, marginBottom:12, color:T.green }}>
          ✅ <strong>{ok.item_nome || 'Equipamento'}</strong> devolvido — status: {ok.novo_status}
          <button onClick={() => setOk(null)} style={{ float:'right', background:'none', border:'none', color:T.green, cursor:'pointer', fontSize:'1.1rem' }}>✕</button>
        </div>
      )}

      {/* Foto */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:'.78rem', color:T.muted, fontWeight:600, marginBottom:8 }}>📷 FOTO DA ETIQUETA (opcional)</div>
        {fotoPreview ? (
          <div style={{ position:'relative' }}>
            <img src={fotoPreview} alt="Etiqueta" style={{ width:'100%', borderRadius:10, border:`1px solid ${T.bord}` }} />
            <button onClick={() => { setFoto(null); setFotoPreview(null); setFotoUrl(null); setExtraido(null); }}
              style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.7)', color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:'.75rem' }}>
              Trocar
            </button>
          </div>
        ) : (
          <label style={{
            display:'block', padding:'20px', textAlign:'center', borderRadius:10,
            border:`2px dashed ${T.bord}`, color:T.muted, cursor:'pointer', fontSize:'.85rem',
          }}>
            📷 Tirar foto / Escolher
            <input type="file" accept="image/*" capture="environment" onChange={onFoto} style={{ display:'none' }} />
          </label>
        )}
        {processando && <div style={{ marginTop:6, color:T.muted, fontSize:'.78rem' }}>🔍 Lendo etiqueta…</div>}
      </div>

      {/* Identificadores */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:'.78rem', color:T.muted, fontWeight:600, marginBottom:8 }}>IDENTIFICADORES</div>
        <Input label="SN"  value={sn}  onChange={setSn} placeholder="número de série" />
        <Input label="MAC" value={mac} onChange={(v) => setMac(v.toUpperCase())} placeholder="AA:BB:CC:DD:EE:FF" mono />
        <Input label="PSN" value={psn} onChange={setPsn} placeholder="PON Serial Number" mono />
      </div>

      {/* Defeito */}
      <div style={{ marginBottom:14 }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, color:T.text, fontSize:'.85rem', marginBottom:8, cursor:'pointer' }}>
          <input type="checkbox" checked={defeituoso} onChange={e => setDefeituoso(e.target.checked)} />
          ⚠️ Equipamento com defeito
        </label>
        {defeituoso && (
          <textarea value={motivoDefeito} onChange={e => setMotivoDefeito(e.target.value)}
            placeholder="Motivo do defeito (obrigatório)" rows={2}
            style={{ width:'100%', padding:10, borderRadius:8, border:`1px solid ${T.bord}`,
                     background:T.card, color:T.text, fontSize:'.85rem', fontFamily:'inherit', resize:'vertical' }} />
        )}
      </div>

      {/* Obs */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:'.78rem', color:T.muted, fontWeight:600, marginBottom:6 }}>OBSERVAÇÕES (opcional)</div>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
          placeholder="Ex.: cliente cancelou, sobrou de instalação, etc"
          style={{ width:'100%', padding:10, borderRadius:8, border:`1px solid ${T.bord}`,
                   background:T.card, color:T.text, fontSize:'.85rem', fontFamily:'inherit', resize:'vertical' }} />
      </div>

      {erro && (
        <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(246,70,93,.13)', color:'#f6465d', fontSize:'.82rem', marginBottom:12 }}>
          {erro}
        </div>
      )}

      <button onClick={devolver} disabled={salvando || processando} style={{
        width:'100%', padding:14, borderRadius:10, border:'none',
        background: salvando ? T.bord : T.green,
        color: salvando ? T.muted : '#0b0e11',
        fontSize:'.95rem', fontWeight:700, cursor: salvando ? 'default' : 'pointer',
      }}>
        {salvando ? 'Devolvendo…' : '📤 Confirmar Devolução'}
      </button>
    </div>
  );
}

/* ─── Inventário do Veículo ─────────────────────────────────────────────── */
function InventarioVeiculo() {
  const [local, setLocal] = useState(null);
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conferidos, setConferidos] = useState(new Set());
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setOk(null);
    try {
      const r = await apiJson('/api/tecnico/meu-estoque');
      setLocal(r.local);
      setEquipamentos(r.equipamentos || []);
      setConferidos(new Set());
    } catch (e) {
      setEquipamentos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const toggle = (id) => {
    setConferidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const marcarTodos = () => setConferidos(new Set(equipamentos.map(e => e.id)));
  const limparTodos = () => setConferidos(new Set());

  const finalizar = async () => {
    setSalvando(true);
    try {
      const presentes = [...conferidos];
      const faltando = equipamentos.filter(e => !conferidos.has(e.id)).map(e => e.id);
      const r = await apiJson('/api/tecnico/inventario/conferir', {
        method:'POST',
        body: JSON.stringify({ presentes, faltando, observacoes: obs || null }),
      });
      setOk(r);
    } catch (e) {
      alert('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return <div style={{ padding:20, textAlign:'center', color:T.muted }}>Carregando…</div>;
  }

  if (!local) {
    return (
      <div style={{ padding:'20px 16px', textAlign:'center', color:T.muted, fontSize:'.85rem', background:T.card, borderRadius:10 }}>
        Você ainda não tem um <strong style={{color:T.text}}>local de estoque</strong> configurado (veículo).<br/>
        Peça pro admin cadastrar em <strong style={{color:T.text}}>/admin/estoque → Configurações → Locais</strong>.
      </div>
    );
  }

  if (ok) {
    return (
      <div style={{ padding:20, textAlign:'center', background:'rgba(0,200,150,.08)', borderRadius:10, border:'1px solid rgba(0,200,150,.3)' }}>
        <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
        <div style={{ fontSize:'1rem', fontWeight:800, color:T.green, marginBottom:6 }}>Inventário registrado!</div>
        <div style={{ fontSize:'.85rem', color:T.text }}>
          ✅ {ok.presentes} presentes<br/>
          {ok.faltando > 0 && <span style={{ color:'#f6465d' }}>⚠️ {ok.faltando} faltando</span>}
        </div>
        <button onClick={carregar} style={{
          marginTop:14, padding:'10px 20px', borderRadius:8, border:`1px solid ${T.bord}`,
          background:'transparent', color:T.text, cursor:'pointer', fontWeight:600,
        }}>Atualizar lista</button>
      </div>
    );
  }

  const total = equipamentos.length;
  const marcados = conferidos.size;
  const pct = total ? Math.round(marcados / total * 100) : 0;

  return (
    <div>
      <div style={{ fontSize:'.85rem', color:T.muted, marginBottom:8 }}>
        📍 <strong style={{color:T.text}}>{local.nome}</strong> — {total} equipamento(s)
      </div>

      {total > 0 && (
        <div style={{ marginBottom:14, padding:'10px 14px', background:T.card, borderRadius:10, border:`1px solid ${T.bord}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.8rem', marginBottom:8 }}>
            <span style={{ color:T.muted }}>Conferidos</span>
            <strong style={{ color: pct === 100 ? T.green : T.text }}>{marcados}/{total}</strong>
          </div>
          <div style={{ height:6, background:'rgba(255,255,255,.05)', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, background:T.green, transition:'width .2s' }} />
          </div>
          <div style={{ display:'flex', gap:6, marginTop:10 }}>
            <button onClick={marcarTodos} style={{ flex:1, padding:'7px', fontSize:'.75rem', borderRadius:7, border:`1px solid ${T.bord}`, background:'transparent', color:T.text, cursor:'pointer' }}>✓ Todos</button>
            <button onClick={limparTodos} style={{ flex:1, padding:'7px', fontSize:'.75rem', borderRadius:7, border:`1px solid ${T.bord}`, background:'transparent', color:T.muted, cursor:'pointer' }}>Limpar</button>
          </div>
        </div>
      )}

      {total === 0 ? (
        <div style={{ padding:20, textAlign:'center', color:T.muted, fontSize:'.85rem' }}>
          Nenhum equipamento atribuído ao seu veículo.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:14 }}>
          {equipamentos.map(eq => {
            const checked = conferidos.has(eq.id);
            return (
              <label key={eq.id} style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                background: checked ? 'rgba(0,200,150,.07)' : T.card,
                border: `1px solid ${checked ? T.green : T.bord}`,
                borderRadius:10, cursor:'pointer', transition:'background .15s, border-color .15s',
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(eq.id)}
                  style={{ width:20, height:20, accentColor:T.green, cursor:'pointer', flexShrink:0 }} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'.88rem', fontWeight:600, color:T.text, marginBottom:2 }}>
                    {eq.item_nome || 'Equipamento'}
                  </div>
                  <div style={{ fontSize:'.72rem', color:T.muted, fontFamily:'monospace' }}>
                    {eq.numero_serie && `SN ${eq.numero_serie}`}
                    {eq.mac_address && ` · ${eq.mac_address}`}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
        placeholder="Observação geral (opcional)"
        style={{ width:'100%', padding:10, borderRadius:8, border:`1px solid ${T.bord}`,
                 background:T.card, color:T.text, fontSize:'.85rem', fontFamily:'inherit', resize:'vertical', marginBottom:12 }} />

      <button onClick={finalizar} disabled={salvando || total === 0} style={{
        width:'100%', padding:14, borderRadius:10, border:'none',
        background: (salvando || total === 0) ? T.bord : T.green,
        color: (salvando || total === 0) ? T.muted : '#0b0e11',
        fontSize:'.95rem', fontWeight:700, cursor: (salvando || total === 0) ? 'default' : 'pointer',
      }}>
        {salvando ? 'Salvando…' : `✅ Finalizar Inventário (${marcados}/${total})`}
      </button>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, mono }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
      <span style={{ fontSize:'.72rem', color:T.muted, minWidth:36, fontWeight:600 }}>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          flex:1, padding:'8px 12px', borderRadius:8, border:`1px solid ${T.bord}`,
          background:T.card, color:T.text, fontSize:'.88rem',
          fontFamily: mono ? 'monospace' : 'inherit', outline:'none',
        }} />
    </div>
  );
}
