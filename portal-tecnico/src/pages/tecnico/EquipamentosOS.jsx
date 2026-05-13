// EquipamentosOS.jsx — Gestão de equipamentos vinculados a uma OS.
// Permite ao técnico: ver lista, adicionar (foto da etiqueta → OCR → match no
// estoque), confirmar tipo (instalação/troca/recolhimento), marcar defeituoso.
import React, { useState, useEffect, useCallback } from 'react';
import { T, api, apiJson } from './shared';

const TIPOS = {
  instalacao:     { label: 'Instalar',  emoji: '📥', cor: '#0ecb81', dir: 'saida'   },
  troca_saida:    { label: 'Troca: novo equipamento', emoji: '🔄', cor: '#0ecb81', dir: 'saida' },
  troca_entrada:  { label: 'Troca: equipamento antigo', emoji: '🔁', cor: '#fcd535', dir: 'entrada' },
  recolhimento:   { label: 'Recolher',  emoji: '📤', cor: '#fcd535', dir: 'entrada' },
};

export function EquipamentosOS({ osId, onClose }) {
  const [equipamentos, setEquipamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const dados = await apiJson(`/api/os/${osId}/equipamentos`).catch(() => []);
    setEquipamentos(Array.isArray(dados) ? dados : []);
    setLoading(false);
  }, [osId]);

  useEffect(() => { carregar(); }, [carregar]);

  const remover = async (vincId) => {
    if (!confirm('Remover esse equipamento da OS?')) return;
    await api(`/api/os/${osId}/equipamento/${vincId}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <div>
      <div style={{ background: T.card, border: `1px solid ${T.bord}`, borderRadius: T.r14, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: '.95rem', margin: 0, color: T.text }}>📦 Equipamentos</h3>
          <span style={{ fontSize: '.75rem', color: T.muted }}>{equipamentos.length}</span>
        </div>

        {loading ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: T.muted, fontSize: '.85rem' }}>Carregando…</div>
        ) : equipamentos.length === 0 ? (
          <div style={{ padding: '12px 0', color: T.muted, fontSize: '.82rem' }}>Nenhum equipamento vinculado a essa OS.</div>
        ) : (
          equipamentos.map((e) => (
            <div key={e.id} style={{
              border: `1px solid ${T.bord}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8,
              background: 'rgba(255,255,255,.02)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '.95rem' }}>{TIPOS[e.tipo]?.emoji || '📦'}</span>
                    <span style={{ fontSize: '.85rem', fontWeight: 600, color: TIPOS[e.tipo]?.cor || T.text }}>
                      {TIPOS[e.tipo]?.label || e.tipo}
                    </span>
                    {e.defeituoso && (
                      <span style={{ fontSize: '.7rem', padding: '1px 6px', borderRadius: 4, background: '#f6465d22', color: '#f6465d', fontWeight: 700 }}>
                        DEFEITUOSO
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '.78rem', color: T.muted, fontFamily: 'monospace' }}>
                    {e.item_nome ? <div style={{ color: T.text, fontFamily: 'inherit', marginBottom: 2 }}>{e.item_nome}</div> : null}
                    {e.numero_serie && <div>SN: {e.numero_serie}</div>}
                    {e.mac_address  && <div>MAC: {e.mac_address}</div>}
                    {e.psn          && <div>PSN: {e.psn}</div>}
                    {e.motivo_defeito && <div style={{ color: '#f6465d', fontFamily: 'inherit', marginTop: 4 }}>⚠️ {e.motivo_defeito}</div>}
                  </div>
                </div>
                <button onClick={() => remover(e.id)} aria-label="Remover" style={{
                  background: 'none', border: 'none', color: T.muted, cursor: 'pointer',
                  fontSize: '1.1rem', padding: 4,
                }}>✕</button>
              </div>
            </div>
          ))
        )}

        <button onClick={() => setAdicionando(true)} style={{
          width: '100%', marginTop: 10, padding: '12px', borderRadius: 10,
          border: 'none', background: T.green, color: '#0b0e11',
          fontSize: '.9rem', fontWeight: 700, cursor: 'pointer',
        }}>+ Adicionar Equipamento</button>
      </div>

      {adicionando && (
        <ModalAdicionarEquipamento
          osId={osId}
          onClose={() => setAdicionando(false)}
          onSaved={() => { setAdicionando(false); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalAdicionarEquipamento({ osId, onClose, onSaved }) {
  const [tipo, setTipo] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [fotoUrl, setFotoUrl] = useState(null); // caminho relativo retornado pelo upload
  const [processando, setProcessando] = useState(false);
  const [extraido, setExtraido] = useState(null); // { macs, psns, modelo, ... }
  const [matches, setMatches] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [sn, setSn] = useState('');
  const [mac, setMac] = useState('');
  const [psn, setPsn] = useState('');
  const [defeituoso, setDefeituoso] = useState(false);
  const [motivoDefeito, setMotivoDefeito] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const ehEntrada = tipo === 'recolhimento' || tipo === 'troca_entrada';

  const onFotoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoFile(f);
    setFotoPreview(URL.createObjectURL(f));
    setProcessando(true);
    setErro(null);
    try {
      // 1. Upload do arquivo
      const fd = new FormData();
      fd.append('arquivo', f);
      fd.append('tipo', 'etiqueta');
      const upResp = await fetch(window.location.origin + '/admin/api/estoque/upload-arquivo', {
        method: 'POST',
        headers: { 'x-admin-token': localStorage.getItem('maxxi_token') || '' },
        body: fd,
      });
      const upJson = await upResp.json();
      if (!upResp.ok) throw new Error(upJson.error || 'Falha no upload');
      setFotoUrl(upJson.caminho);

      // 2. OCR via Claude Vision
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
      });
      const ocr = await apiJson('/api/estoque/ocr-etiqueta', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: f.type, tipo: 'etiqueta' }),
      });
      setExtraido(ocr);
      const snExt  = ocr.psns?.find(p => /^[A-Z0-9]{8,}$/i.test(p)) || '';
      const macExt = (ocr.macs?.[0] || '').toUpperCase();
      const psnExt = ocr.psns?.[0] || '';
      setSn(snExt);
      setMac(macExt);
      setPsn(psnExt);

      // 3. Busca matches no estoque
      const busca = await apiJson('/api/estoque/buscar-serializado', {
        method: 'POST',
        body: JSON.stringify({ sn: snExt, mac: macExt, psn: psnExt }),
      });
      setMatches(busca.matches || []);
      if (busca.matches?.length === 1) setSelecionado(busca.matches[0]);
    } catch (err) {
      setErro(err.message);
    } finally {
      setProcessando(false);
    }
  };

  const confirmar = async () => {
    if (!tipo) { setErro('Selecione o tipo'); return; }
    if (!fotoUrl) { setErro('Tire uma foto da etiqueta'); return; }
    if (ehEntrada && defeituoso && !motivoDefeito.trim()) {
      setErro('Informe o motivo do defeito'); return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const body = {
        tipo,
        foto_etiqueta: fotoUrl,
        observacoes: obs || null,
        defeituoso: ehEntrada ? defeituoso : false,
        motivo_defeito: ehEntrada && defeituoso ? motivoDefeito : null,
      };
      if (selecionado) {
        body.serializado_id = selecionado.id;
      } else {
        body.sn = sn || null;
        body.mac = mac || null;
        body.psn = psn || null;
      }
      const resp = await apiJson(`/api/os/${osId}/equipamento`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      <div style={{
        position: 'sticky', top: 0, background: T.bg, borderBottom: `1px solid ${T.bord}`,
        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h2 style={{ margin: 0, fontSize: '1rem', color: T.text }}>Adicionar Equipamento</h2>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: T.muted, fontSize: '1.4rem', cursor: 'pointer',
        }}>✕</button>
      </div>

      <div style={{ padding: '16px', flex: 1 }}>
        {/* Tipo */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '.8rem', color: T.muted, marginBottom: 8, fontWeight: 600 }}>O QUE FAZER?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {Object.entries(TIPOS).map(([k, v]) => (
              <button key={k} onClick={() => setTipo(k)} style={{
                padding: '12px 8px', border: `1px solid ${tipo === k ? v.cor : T.bord}`,
                background: tipo === k ? `${v.cor}22` : T.card,
                borderRadius: 10, color: tipo === k ? v.cor : T.text,
                fontWeight: 600, fontSize: '.78rem', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: '1.4rem' }}>{v.emoji}</span>
                <span style={{ textAlign: 'center', lineHeight: 1.2 }}>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Foto */}
        {tipo && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.8rem', color: T.muted, marginBottom: 8, fontWeight: 600 }}>FOTO DA ETIQUETA</div>
            {fotoPreview ? (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={fotoPreview} alt="Etiqueta" style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.bord}` }} />
                <button onClick={() => { setFotoFile(null); setFotoPreview(null); setFotoUrl(null); setExtraido(null); setMatches([]); setSelecionado(null); }}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.7)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: '.75rem' }}>
                  Trocar
                </button>
              </div>
            ) : (
              <label style={{
                display: 'block', padding: '24px', textAlign: 'center', borderRadius: 10,
                border: `2px dashed ${T.bord}`, color: T.muted, cursor: 'pointer', fontSize: '.85rem',
              }}>
                📷 Tirar foto / Escolher arquivo
                <input type="file" accept="image/*" capture="environment" onChange={onFotoChange} style={{ display: 'none' }} />
              </label>
            )}
            {processando && (
              <div style={{ color: T.muted, fontSize: '.8rem', marginTop: 6 }}>🔍 Lendo etiqueta…</div>
            )}
          </div>
        )}

        {/* Dados extraídos */}
        {extraido && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.8rem', color: T.muted, marginBottom: 8, fontWeight: 600 }}>DADOS DA ETIQUETA</div>
            <div style={{ background: T.card, border: `1px solid ${T.bord}`, borderRadius: 10, padding: 12 }}>
              {extraido.modelo && <div style={{ fontSize: '.85rem', color: T.text, marginBottom: 8 }}>{extraido.modelo}</div>}
              <Input label="SN"  value={sn}  onChange={setSn} />
              <Input label="MAC" value={mac} onChange={setMac} mono />
              <Input label="PSN" value={psn} onChange={setPsn} mono />
            </div>
          </div>
        )}

        {/* Matches do estoque */}
        {extraido && matches.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.8rem', color: T.green, marginBottom: 8, fontWeight: 600 }}>
              ✓ ENCONTRADO NO ESTOQUE
            </div>
            {matches.map(m => (
              <button key={m.id} onClick={() => setSelecionado(m)} style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                border: `1px solid ${selecionado?.id === m.id ? T.green : T.bord}`,
                background: selecionado?.id === m.id ? `${T.green}11` : T.card,
                borderRadius: 8, marginBottom: 6, cursor: 'pointer', color: T.text, fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{m.item_nome || 'Equipamento'}</div>
                <div style={{ fontSize: '.75rem', color: T.muted, fontFamily: 'monospace', marginTop: 2 }}>
                  {m.numero_serie ? `SN ${m.numero_serie}` : ''}
                  {m.mac_address ? ` · MAC ${m.mac_address}` : ''}
                  {' · '}{m.status}
                </div>
              </button>
            ))}
          </div>
        )}

        {extraido && matches.length === 0 && (
          <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#fcd53511', border: '1px solid #fcd535', color: '#fcd535', fontSize: '.8rem' }}>
            ⚠️ Equipamento não encontrado no estoque. Vai ser cadastrado em campo (alerta para o admin revisar).
          </div>
        )}

        {/* Defeituoso (só pra entradas) */}
        {ehEntrada && extraido && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.text, fontSize: '.85rem', marginBottom: 8 }}>
              <input type="checkbox" checked={defeituoso} onChange={e => setDefeituoso(e.target.checked)} />
              Equipamento com defeito
            </label>
            {defeituoso && (
              <textarea value={motivoDefeito} onChange={e => setMotivoDefeito(e.target.value)} placeholder="Motivo do defeito (obrigatório)"
                rows={2} style={{
                  width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${T.bord}`,
                  background: T.card, color: T.text, fontSize: '.85rem', fontFamily: 'inherit', resize: 'vertical',
                }}/>
            )}
          </div>
        )}

        {extraido && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '.8rem', color: T.muted, marginBottom: 6, fontWeight: 600 }}>OBSERVAÇÕES (opcional)</div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Ex.: cliente recusou, posição do equipamento, etc"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${T.bord}`, background: T.card, color: T.text, fontSize: '.85rem', fontFamily: 'inherit', resize: 'vertical' }}/>
          </div>
        )}

        {erro && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f6465d22', color: '#f6465d', fontSize: '.82rem', marginBottom: 12 }}>
            {erro}
          </div>
        )}
      </div>

      {/* Footer com botão Confirmar */}
      <div style={{ position: 'sticky', bottom: 0, background: T.bg, borderTop: `1px solid ${T.bord}`, padding: 12 }}>
        <button onClick={confirmar} disabled={!extraido || salvando || processando} style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none',
          background: (!extraido || salvando) ? T.bord : T.green,
          color: (!extraido || salvando) ? T.muted : '#0b0e11',
          fontSize: '.95rem', fontWeight: 700, cursor: (!extraido || salvando) ? 'default' : 'pointer',
        }}>
          {salvando ? 'Salvando…' : 'Confirmar Vinculação'}
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, mono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: '.75rem', color: T.muted, minWidth: 36, fontWeight: 600 }}>{label}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} style={{
        flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.bord}`,
        background: T.bg, color: T.text, fontSize: '.85rem',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}/>
    </div>
  );
}
