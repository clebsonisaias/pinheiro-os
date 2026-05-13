/**
 * AbastecimentoScreen — Tela de checklist pré-saída + registro de abastecimento
 * para o Portal do Técnico. Mobile-first, dark theme, touch targets ≥44px.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, apiJson, T } from './shared';
import { useTec } from './TecnicoContext';

const CHECKLIST_ITEMS = [
  { key: 'pneus',    emoji: '🛞', label: 'Pneus',       desc: 'Calibragem e estado' },
  { key: 'oleo',     emoji: '🛢️', label: 'Óleo',        desc: 'Nível do motor' },
  { key: 'agua',     emoji: '💧', label: 'Água',         desc: 'Radiador e limpador' },
  { key: 'freios',   emoji: '🛑', label: 'Freios',       desc: 'Funcionamento' },
  { key: 'docs',     emoji: '📄', label: 'Documentos',   desc: 'CNH, CRLV, seguro' },
  { key: 'luzes',    emoji: '💡', label: 'Iluminação',   desc: 'Faróis e lanternas' },
  { key: 'extintor', emoji: '🧯', label: 'Extintor',     desc: 'Prazo de validade' },
];

const COMBUSTIVEIS = [
  { key: 'gasolina', label: 'Gasolina', color: '#f5c518' },
  { key: 'etanol',   label: 'Etanol',   color: '#00c896' },
  { key: 'diesel',   label: 'Diesel',   color: '#3ecfff' },
  { key: 'gnv',      label: 'GNV',      color: '#8b5cf6' },
  { key: 'flex',     label: 'Flex',     color: '#ff9f0a' },
];

const EMPTY_FUEL = {
  litros: '', valor_total: '', km_atual: '', posto: '',
  tipo_comb: 'gasolina', data: new Date().toISOString().slice(0, 10),
};

const INIT_CHECK = Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.key, true]));

/* ── Input helper ────────────────────────────────────────────────────────────── */
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: '.7rem', color: T.muted, fontWeight: 700, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const INP = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1px solid ${T.bord}`, background: T.card, color: T.text,
  fontSize: '.92rem', boxSizing: 'border-box',
};

/* ── Main screen ─────────────────────────────────────────────────────────────── */
export function AbastecimentoScreen({ veiculoSelecionado, initialTab }) {
  const { user, showToast } = useTec();
  const [subTab, setSubTab] = useState(initialTab || 'checklist');

  // — checklist state —
  const [checklist, setChecklist] = useState(INIT_CHECK);
  const [checkObs,   setCheckObs]   = useState('');
  const [checkKm,    setCheckKm]    = useState('');
  const [checkTipo,  setCheckTipo]  = useState('saida');
  const [checkSaving, setCheckSaving] = useState(false);
  const [checkSent,   setCheckSent]   = useState(false);

  // — fuel state —
  const [fuel,       setFuel]       = useState(EMPTY_FUEL);
  const [fuelSaving, setFuelSaving] = useState(false);
  const [fuelSent,   setFuelSent]   = useState(false);

  // — OCR cupom —
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrFields,  setOcrFields]  = useState(null); // campos extraídos
  const ocrInputRef = useRef(null);

  // — histórico —
  const [historico,   setHistorico]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const veicId    = veiculoSelecionado?.id;
  const veicPlaca = veiculoSelecionado?.placa || '—';
  const veicModelo = veiculoSelecionado?.modelo || veiculoSelecionado?.model || '';

  const loadHistorico = useCallback(async () => {
    if (!veicId) return;
    setHistLoading(true);
    try {
      const r = await apiJson(`/api/frota/fuel?vid=${veicId}`);
      setHistorico(Array.isArray(r) ? r.slice(0, 15) : []);
    } catch {}
    setHistLoading(false);
  }, [veicId]);

  useEffect(() => {
    if (subTab === 'historico') loadHistorico();
  }, [subTab, loadHistorico]);

  /* ── checklist submit ── */
  const submitChecklist = async () => {
    if (!veicId) return showToast('Selecione um veículo primeiro', true);
    setCheckSaving(true);
    try {
      const aprovado = Object.values(checklist).every(Boolean);
      await api('/api/frota/checklist', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: veicId,
          motorista: user?.nome || '',
          tipo: checkTipo,
          itens: checklist,
          km_atual: checkKm ? parseInt(checkKm) : null,
          obs: checkObs || null,
          aprovado,
        }),
      });
      setCheckSent(true);
      showToast(aprovado ? '✅ Checklist OK registrado!' : '⚠️ Checklist com pendências registrado');
      setTimeout(() => { setCheckSent(false); setChecklist(INIT_CHECK); setCheckObs(''); setCheckKm(''); }, 3000);
    } catch {
      showToast('Erro ao salvar checklist', true);
    }
    setCheckSaving(false);
  };

  /* ── fuel submit ── */
  const submitFuel = async () => {
    if (!veicId) return showToast('Selecione um veículo primeiro', true);
    if (!fuel.litros || !fuel.valor_total) return showToast('Informe litros e valor total', true);
    setFuelSaving(true);
    try {
      await api('/api/frota/fuel', {
        method: 'POST',
        body: JSON.stringify({
          ...fuel,
          vehicle_id: veicId,
          motorista: user?.nome || '',
          litros: parseFloat(fuel.litros),
          valor_total: parseFloat(fuel.valor_total),
          km_atual: fuel.km_atual ? parseInt(fuel.km_atual) : null,
        }),
      });
      setFuel(EMPTY_FUEL);
      setFuelSent(true);
      showToast('⛽ Abastecimento registrado!');
      setTimeout(() => setFuelSent(false), 3500);
    } catch {
      showToast('Erro ao registrar abastecimento', true);
    }
    setFuelSaving(false);
  };

  const f = (k, v) => setFuel(p => ({ ...p, [k]: v }));

  const handleOcr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setOcrLoading(true);
    setOcrFields(null);
    try {
      // Converte para base64 data URI
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api('/api/frota/fuel/ocr', {
        method: 'POST',
        body: JSON.stringify({ image: dataUri }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erro OCR');
      const d = json.dados || {};
      // Preenche form com campos extraídos
      setFuel(p => ({
        ...p,
        litros:      d.litros      != null ? String(d.litros)      : p.litros,
        valor_total: d.valor_total != null ? String(d.valor_total) : p.valor_total,
        tipo_comb:   d.tipo_comb   || p.tipo_comb,
        posto:       d.posto       || p.posto,
        data:        d.data        || p.data,
        km_atual:    d.km_atual    != null ? String(d.km_atual)    : p.km_atual,
      }));
      setOcrFields(d);
      showToast('📷 Dados extraídos do cupom!');
    } catch(err) {
      showToast('Não foi possível ler o cupom', true);
    }
    setOcrLoading(false);
  };

  const precoPorLitro = fuel.litros && fuel.valor_total
    ? (parseFloat(fuel.valor_total) / parseFloat(fuel.litros)).toFixed(3)
    : null;

  /* ── todos os itens OK? ── */
  const todosOK = Object.values(checklist).every(Boolean);
  const nokCount = CHECKLIST_ITEMS.filter(i => !checklist[i.key]).length;

  const TABS = [
    { id: 'checklist',    label: '✅ Checklist'  },
    { id: 'abastecimento', label: '⛽ Abastecer'  },
    { id: 'historico',    label: '📋 Histórico'  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>

      {/* ── Banner do veículo ── */}
      <div style={{ padding: '10px 16px 10px', background: T.bg1, borderBottom: `1px solid ${T.bord}`, flexShrink: 0 }}>
        {veicId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,200,150,.12)', border: '1px solid rgba(0,200,150,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
              🚗
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.95rem', fontWeight: 800, color: T.green, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.06em' }}>
                {veicPlaca}
              </div>
              {veicModelo && (
                <div style={{ fontSize: '.72rem', color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {veicModelo}
                </div>
              )}
            </div>
            <div style={{ fontSize: '.65rem', color: T.green, background: 'rgba(0,200,150,.1)', border: '1px solid rgba(0,200,150,.2)', padding: '3px 8px', borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>
              Veículo do dia
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span style={{ fontSize: '.8rem', color: '#f5c518' }}>Nenhum veículo selecionado — toque na placa no cabeçalho</span>
          </div>
        )}
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.bord}`, background: T.bg1, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setSubTab(t.id)}
            style={{
              flex: 1, padding: '12px 4px', border: 'none', background: 'none',
              cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, touchAction: 'manipulation',
              color: subTab === t.id ? T.green : T.muted,
              borderBottom: `2px solid ${subTab === t.id ? T.green : 'transparent'}`,
              transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Conteúdo das abas ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'max(16px,env(safe-area-inset-bottom))' }}>

        {/* ════════════ CHECKLIST ════════════ */}
        {subTab === 'checklist' && (
          <div style={{ padding: '16px 16px 0' }}>

            {/* Tipo: saída / chegada */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[['saida', '🟢 Saída'], ['chegada', '🔴 Chegada']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setCheckTipo(k)}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
                    fontWeight: 700, fontSize: '.82rem', touchAction: 'manipulation',
                    border: `1.5px solid ${checkTipo === k ? T.green : T.bord}`,
                    background: checkTipo === k ? 'rgba(0,200,150,.1)' : T.card,
                    color: checkTipo === k ? T.green : T.muted,
                    transition: 'all .15s',
                  }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Status pill */}
            {nokCount > 0 ? (
              <div style={{ background: 'rgba(255,71,87,.08)', border: '1px solid rgba(255,71,87,.25)', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: '.78rem', color: '#ff4757', fontWeight: 600 }}>
                ⚠️ {nokCount} item{nokCount > 1 ? 's' : ''} com pendência
              </div>
            ) : (
              <div style={{ background: 'rgba(0,200,150,.06)', border: '1px solid rgba(0,200,150,.2)', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: '.78rem', color: T.green, fontWeight: 600 }}>
                ✅ Todos os itens OK
              </div>
            )}

            {/* Itens do checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {CHECKLIST_ITEMS.map(item => {
                const ok = checklist[item.key];
                return (
                  <button key={item.key} type="button"
                    onClick={() => setChecklist(p => ({ ...p, [item.key]: !p[item.key] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12, width: '100%',
                      textAlign: 'left', cursor: 'pointer', touchAction: 'manipulation',
                      minHeight: 58, border: `1.5px solid ${ok ? 'rgba(0,200,150,.25)' : 'rgba(255,71,87,.3)'}`,
                      background: ok ? 'rgba(0,200,150,.05)' : 'rgba(255,71,87,.06)',
                      transition: 'all .18s',
                    }}>
                    <span style={{ fontSize: '1.25rem', flexShrink: 0, width: 28, textAlign: 'center' }}>{item.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '.88rem', color: T.text }}>{item.label}</div>
                      <div style={{ fontSize: '.7rem', color: T.muted, marginTop: 1 }}>{item.desc}</div>
                    </div>
                    {/* Toggle indicator */}
                    <div style={{
                      width: 36, height: 22, borderRadius: 11, flexShrink: 0,
                      background: ok ? T.green : '#ff4757',
                      position: 'relative', transition: 'background .18s',
                    }}>
                      <div style={{
                        position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                        background: '#fff', transition: 'left .18s',
                        left: ok ? 17 : 3,
                      }} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* KM */}
            <Field label="KM atual">
              <input type="number" value={checkKm} onChange={e => setCheckKm(e.target.value)}
                placeholder="Ex: 45.230"
                style={{ ...INP, fontFamily: "'JetBrains Mono',monospace" }} />
            </Field>

            {/* Obs */}
            <Field label="Observações">
              <textarea value={checkObs} onChange={e => setCheckObs(e.target.value)}
                placeholder="Alguma irregularidade, dano ou observação..." rows={3}
                style={{ ...INP, resize: 'none', lineHeight: 1.5 }} />
            </Field>

            {/* Submit */}
            <button type="button" onClick={submitChecklist} disabled={checkSaving || checkSent}
              style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                fontWeight: 800, fontSize: '.92rem', cursor: checkSaving || checkSent ? 'default' : 'pointer',
                touchAction: 'manipulation', transition: 'all .2s', minHeight: 54, marginBottom: 16,
                background: checkSent ? 'rgba(0,200,150,.15)' : T.green,
                color: checkSent ? T.green : '#021a28',
              }}>
              {checkSaving ? '⏳ Salvando...' : checkSent ? '✅ Checklist Enviado!' : `Enviar Checklist de ${checkTipo === 'saida' ? 'Saída' : 'Chegada'}`}
            </button>
          </div>
        )}

        {/* ════════════ ABASTECIMENTO ════════════ */}
        {subTab === 'abastecimento' && (
          <div style={{ padding: '16px 16px 0' }}>

            {/* ── Botão OCR cupom ── */}
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleOcr}
            />
            <button
              type="button"
              onClick={() => ocrInputRef.current?.click()}
              disabled={ocrLoading}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 12, marginBottom: 16,
                border: `1.5px dashed ${ocrLoading ? T.bord : 'rgba(62,207,255,.45)'}`,
                background: ocrLoading ? T.card : 'rgba(62,207,255,.06)',
                color: ocrLoading ? T.muted : '#3ecfff',
                fontWeight: 700, fontSize: '.88rem', cursor: ocrLoading ? 'default' : 'pointer',
                touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .15s',
              }}>
              {ocrLoading
                ? <><span style={{ fontSize: '1rem' }}>⏳</span> Lendo cupom...</>
                : <><span style={{ fontSize: '1rem' }}>📷</span> Escanear cupom fiscal</>
              }
            </button>

            {/* Resumo do que foi extraído */}
            {ocrFields && !ocrLoading && (
              <div style={{
                marginBottom: 14, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(0,200,150,.07)', border: '1px solid rgba(0,200,150,.25)',
                fontSize: '.75rem', color: T.muted, display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
              }}>
                <span style={{ color: T.green, fontWeight: 700, width: '100%', marginBottom: 2 }}>✅ Cupom lido — revise os campos abaixo</span>
                {ocrFields.posto    && <span>🏪 {ocrFields.posto}</span>}
                {ocrFields.data     && <span>📅 {new Date(ocrFields.data + 'T12:00').toLocaleDateString('pt-BR')}</span>}
                {ocrFields.tipo_comb && <span style={{ textTransform: 'capitalize' }}>⛽ {ocrFields.tipo_comb}</span>}
              </div>
            )}

            {/* Tipo de combustível */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.7rem', color: T.muted, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Combustível
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {COMBUSTIVEIS.map(c => (
                  <button key={c.key} type="button" onClick={() => f('tipo_comb', c.key)}
                    style={{
                      padding: '11px 4px', borderRadius: 10, cursor: 'pointer',
                      fontWeight: 700, fontSize: '.78rem', touchAction: 'manipulation',
                      minHeight: 44, transition: 'all .15s',
                      border: `1.5px solid ${fuel.tipo_comb === c.key ? c.color : T.bord}`,
                      background: fuel.tipo_comb === c.key ? c.color + '18' : T.card,
                      color: fuel.tipo_comb === c.key ? c.color : T.muted,
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Litros + Valor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
              <Field label="Litros *">
                <input type="number" step="0.01" value={fuel.litros} onChange={e => f('litros', e.target.value)}
                  placeholder="0,00" inputMode="decimal"
                  style={{ ...INP, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '1rem' }} />
              </Field>
              <Field label="Valor total R$ *">
                <input type="number" step="0.01" value={fuel.valor_total} onChange={e => f('valor_total', e.target.value)}
                  placeholder="0,00" inputMode="decimal"
                  style={{ ...INP, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '1rem' }} />
              </Field>
            </div>

            {/* Preço por litro calculado */}
            {precoPorLitro && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: 'rgba(0,200,150,.07)', border: '1px solid rgba(0,200,150,.18)',
              }}>
                <span style={{ fontSize: '.78rem', color: T.muted }}>Preço por litro</span>
                <span style={{ fontSize: '.95rem', fontWeight: 800, color: T.green, fontFamily: "'JetBrains Mono',monospace" }}>
                  R$ {precoPorLitro}
                </span>
              </div>
            )}

            {/* KM */}
            <Field label="KM atual">
              <input type="number" value={fuel.km_atual} onChange={e => f('km_atual', e.target.value)}
                placeholder="Ex: 45.230" inputMode="numeric"
                style={{ ...INP, fontFamily: "'JetBrains Mono',monospace" }} />
            </Field>

            {/* Posto */}
            <Field label="Posto (opcional)">
              <input value={fuel.posto} onChange={e => f('posto', e.target.value)}
                placeholder="Nome do posto" style={INP} />
            </Field>

            {/* Data */}
            <Field label="Data">
              <input type="date" value={fuel.data} onChange={e => f('data', e.target.value)}
                style={{ ...INP, fontFamily: "'JetBrains Mono',monospace" }} />
            </Field>

            {/* Submit */}
            <button type="button" onClick={submitFuel} disabled={fuelSaving || fuelSent}
              style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                fontWeight: 800, fontSize: '.92rem', cursor: fuelSaving || fuelSent ? 'default' : 'pointer',
                touchAction: 'manipulation', transition: 'all .2s', minHeight: 54, marginBottom: 16,
                background: fuelSent ? 'rgba(0,200,150,.15)' : T.green,
                color: fuelSent ? T.green : '#021a28',
              }}>
              {fuelSaving ? '⏳ Salvando...' : fuelSent ? '✅ Abastecimento Registrado!' : '⛽ Registrar Abastecimento'}
            </button>
          </div>
        )}

        {/* ════════════ HISTÓRICO ════════════ */}
        {subTab === 'historico' && (
          <div style={{ padding: 16 }}>
            {!veicId ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '2.5rem', opacity: .25, marginBottom: 10 }}>⛽</div>
                <div style={{ color: T.muted, fontSize: '.88rem' }}>Selecione um veículo para ver o histórico</div>
              </div>
            ) : histLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: T.muted, fontSize: '.88rem' }}>Carregando...</div>
            ) : historico.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '2.5rem', opacity: .25, marginBottom: 10 }}>⛽</div>
                <div style={{ color: T.muted, fontSize: '.88rem' }}>Nenhum abastecimento registrado ainda</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historico.map((r, i) => {
                  const precoPorL = r.litros && r.valor_total
                    ? (parseFloat(r.valor_total) / parseFloat(r.litros)).toFixed(2)
                    : null;
                  return (
                    <div key={r.id} style={{
                      padding: '13px 14px', borderRadius: 12,
                      background: i === 0 ? 'rgba(0,200,150,.06)' : T.card,
                      border: `1px solid ${i === 0 ? 'rgba(0,200,150,.2)' : T.bord}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: '.82rem', fontWeight: 700, color: T.text }}>
                            {new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          {i === 0 && (
                            <span style={{ marginLeft: 8, fontSize: '.65rem', color: T.green, background: 'rgba(0,200,150,.1)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                              ÚLTIMO
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '.9rem', fontWeight: 800, color: '#f5c518', fontFamily: "'JetBrains Mono',monospace" }}>
                          R$ {parseFloat(r.valor_total || 0).toFixed(2)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '.75rem', color: T.muted }}>⛽ {parseFloat(r.litros || 0).toFixed(1)} L</span>
                        <span style={{ fontSize: '.75rem', color: T.muted, textTransform: 'capitalize' }}>🏷️ {r.tipo_comb}</span>
                        {r.km_atual && <span style={{ fontSize: '.75rem', color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>📍 {r.km_atual.toLocaleString()} km</span>}
                        {precoPorL && <span style={{ fontSize: '.75rem', color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>R$ {precoPorL}/L</span>}
                        {r.posto && <span style={{ fontSize: '.75rem', color: T.dim }}>🏪 {r.posto}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
