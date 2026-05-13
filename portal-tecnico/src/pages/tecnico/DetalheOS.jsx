import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useStore } from '../../store';
import useConfirm from '../../hooks/useConfirm';
import { useTec } from './TecnicoContext';
import { T, ST, TP, CL_PADRAO, fmtH, fmtDt, tipoLabel, api, apiJson } from './shared';
import { StBadge } from './SharedComponents';
import { EquipamentosOS } from './EquipamentosOS';

function DetalheOS({ os: osInit, onBack }) {
  const { atualizar, navegar, showToast, myPos } = useTec();
  const [os, setOs] = useState(osInit);
  const [oc, setOc] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [tab, setTab] = useState('info');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmando,  setConfirmando]  = useState(false);
  const [obsConc,      setObsConc]      = useState('');
  const [fotoConclusao, setFotoConclusao] = useState(null);
  const [cancelModal,  setCancelModal]  = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [diag,         setDiag]         = useState(null);  // dados SGP
  const [diagLoad,     setDiagLoad]     = useState(false);
  const [pppoe,        setPppoe]        = useState(null);  // credenciais PPPoE
  const [pppoeLoad,    setPppoeLoad]    = useState(false);
  const [pppoeVisible, setPppoeVisible] = useState(false); // reveal por tap
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [enviandoTermo, setEnviandoTermo] = useState(false);

  useEffect(() => {
    const init = async () => {
      const ocData = await apiJson(`/api/tecnico/os/${osInit.id}/ocorrencia`).catch(()=>null);
      setOc(ocData);
      const saved = osInit.checklist;
      if (Array.isArray(saved) && saved.length) setChecklist(saved);
      else setChecklist((CL_PADRAO[osInit.tipo]||CL_PADRAO.outro).map(label=>({label,done:false})));
    };
    init();
  }, [osInit.id, osInit.tipo, osInit.checklist]);

  // Carrega diagnóstico SGP (lazy — só quando técnico abre aba Rede)
  const loadDiag = useCallback(async () => {
    if (diag) return;               // já carregou
    setDiagLoad(true);
    const osId = os.id;
    if (!osId) { setDiagLoad(false); return; }  // OS sem ID ainda
    const d = await apiJson(`/api/tecnico/os/${osId}/diagnostico`).catch(()=>null);
    setDiag(d || {});
    setDiagLoad(false);
  }, [os.id]); // só depende do ID — diagLoad e diag propositalmente excluídos

  // Carrega diagnóstico no mount (uma única vez)
  useEffect(() => {
    if (os.id) loadDiag();
  }, [os.id]); // re-executa se o ID mudar

  const trocarSenhaPPPoE = async () => {
    if (!novaSenha || novaSenha.length < 6) { showToast('Senha deve ter pelo menos 6 caracteres', true); return; }
    setSalvandoSenha(true);
    const contrato = os.contrato || diag?.contrato;
    const r = await api(`/api/tecnico/pppoe/senha`, {
      method: 'POST',
      body: JSON.stringify({ contrato, nova_senha: novaSenha })
    }).then(r=>r.json()).catch(()=>({ error: 'Falha ao conectar' }));
    setSalvandoSenha(false);
    if (r.ok) {
      showToast('✅ Senha PPPoE alterada!');
      setTrocandoSenha(false);
      setNovaSenha('');
      // Atualizar pppoe local
      if (pppoe) setPppoe({ ...pppoe, senha: novaSenha });
    } else {
      showToast(r.error || 'Erro ao alterar senha', true);
    }
  };

  const enviarTermo = async () => {
    const contrato = os.contrato || diag?.contrato;
    if (!contrato) { showToast('Contrato não identificado', true); return; }
    setEnviandoTermo(true);
    const r = await api(`/api/tecnico/termo/${contrato}/aceitar`, { method: 'POST' })
      .then(r => r.json()).catch(() => ({ error: 'Falha' }));
    setEnviandoTermo(false);
    if (r.ok) showToast('✅ Termo de aceite registrado no SGP!');
    else showToast(r.error || 'Erro ao registrar termo', true);
  };

  const revelarPppoe = async () => {
    if (pppoe) { setPppoeVisible(v=>!v); return; }
    setPppoeLoad(true);
    const d = await apiJson(`/api/tecnico/os/${os.id}/pppoe`).catch(()=>null);
    setPppoe(d);
    setPppoeLoad(false);
    setPppoeVisible(true);
  };

  const toggleCL = async idx => {
    const novo = checklist.map((it,i)=>i===idx?{...it,done:!it.done}:it);
    setChecklist(novo);
    try {
      await api(`/api/tecnico/os/${os.id}/checklist`,{method:'PUT',body:JSON.stringify({checklist:novo})});
    } catch(e) {
      setChecklist(checklist); // reverte
      showToast('Erro ao salvar checklist');
    }
  };

  const salvarNota = async () => {
    if (!nota.trim()) return;
    setSaving(true);
    await api(`/api/tecnico/os/${os.id}/nota`,{method:'POST',body:JSON.stringify({conteudo:nota})}).catch(()=>{});
    setNota(''); showToast('💬 Nota salva');
    setSaving(false);
  };

  const avancar = async status => {
    if (status==='concluida') { setConfirmando(true); return; }
    setSaving(true);

    // Check-in GPS: captura localização ao marcar "Cheguei" (execucao)
    let extra = {};
    if (status === 'execucao') {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, maximumAge: 30000 })
        );
        extra = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        showToast('📍 Check-in realizado! Localização salva.');
      } catch {
        // GPS não disponível — segue sem coordenada
      }
    }

    const ok = await atualizar(os.id, status, extra);
    if (ok) setOs(o=>({...o,status}));
    setSaving(false);
  };

  const confirmarCancelamento = async () => {
    setSaving(true);
    const ok = await atualizar(os.id, 'cancelada', { observacao: motivoCancel });
    if (ok) { setCancelModal(false); setMotivoCancel(''); onBack(); }
    setSaving(false);
  };

  // Captura a foto + sobrepõe watermark com data/hora, GPS e OS# pra servir
  // como prova de que o serviço foi executado naquele lugar e horário.
  // Watermark é desenhado num canvas antes do upload — uma vez salvo, vira
  // pixel da imagem (nada de metadata EXIF que pode ser removido).
  const capturarFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1100;          // resolução um pouco maior pro texto ficar legível
      const ratio = Math.min(max / img.width, max / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // ── Watermark ────────────────────────────────────────────────────────
      const W = canvas.width, H = canvas.height;
      const padding = Math.round(W * 0.024);
      const fontSize = Math.max(13, Math.round(W * 0.026));
      const lineGap = Math.round(fontSize * 0.5);

      const dt = new Date();
      const dtStr = dt.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const line1 = `CITmax  •  OS #${os.id || '—'}  •  ${dtStr}`;
      const line2 = myPos
        ? `📍 ${myPos.lat.toFixed(5)}, ${myPos.lng.toFixed(5)}`
        : '📍 GPS indisponível';
      const techLine = `Técnico: ${os.tecnico_nome || ''}`.trim();
      const lines = [line1, line2];
      if (techLine && techLine !== 'Técnico:') lines.push(techLine);

      const bandH = padding + (fontSize + lineGap) * lines.length + padding;

      // Faixa preta com gradient transparente em cima → opaca embaixo
      const grad = ctx.createLinearGradient(0, H - bandH, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.4, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - bandH, W, bandH);

      // Borda verde inferior (marca CITmax)
      ctx.fillStyle = '#00c896';
      ctx.fillRect(0, H - 3, W, 3);

      // Texto branco com sombra sutil pra contraste em qualquer fundo
      ctx.font = `700 ${fontSize}px 'Inter','Helvetica Neue',system-ui,sans-serif`;
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#ffffff';
      let y = H - bandH + padding;
      for (const ln of lines) {
        ctx.fillText(ln, padding, y);
        y += fontSize + lineGap;
      }
      // Reset sombra
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      setFotoConclusao(canvas.toDataURL('image/jpeg', 0.82));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const concluir = async () => {
    if (!fotoConclusao) { showToast('📷 Foto da conclusão é obrigatória', true); return; }
    setSaving(true);
    const ok = await atualizar(os.id, 'concluida', { observacao: obsConc, checklist, foto_conclusao: fotoConclusao });
    if (ok) { setConfirmando(false); setFotoConclusao(null); onBack(); }
    setSaving(false);
  };

  const st = ST[os.status]||ST.aguardando;
  const feito = checklist.filter(i=>i.done).length;
  const pct   = checklist.length ? Math.round(feito/checklist.length*100) : 0;


  // Helper sinal óptico
  const sinalCor = q => ({ otimo:'#00c896', bom:'#3ecfff', fraco:'#f5c518', critico:'#ff4757' }[q] || T.muted);
  const sinalBar = q => ({ otimo:5, bom:4, fraco:2, critico:1 }[q] || 0);
  const BTNS = {
    aguardando:   [{ label:'🚗 A caminho', status:'deslocamento', cor:T.yel, full:true }],
    confirmada:   [{ label:'🚗 A caminho', status:'deslocamento', cor:T.yel },{ label:'📍 Check-in', status:'execucao', cor:T.green }],
    deslocamento: [{ label:'📍 Check-in', status:'execucao', cor:T.green, full:true }],
    execucao:     [{ label:'✅ Encerrar', status:'concluida', cor:T.green, full:true }],
  };
  const btns = BTNS[os.status] || [];
  // Cancelar fica como link discreto separado (qualquer status ativo)
  const podeCancelar = ['aguardando','confirmada','deslocamento','execucao'].includes(os.status);

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:`1px solid ${T.bord}`, flexShrink:0, background:T.bg }}>
        <button type="button" onClick={onBack} aria-label="Voltar"
          style={{ width:40, height:40, borderRadius:10, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>←</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:'.95rem', color: os.tipo==='retirada'?'#ff4757':T.text, letterSpacing: os.tipo==='retirada'?'.02em':0 }}>
            {os.tipo==='retirada' ? '🚨' : (TP[os.tipo]||'📋')} {os.tipo==='retirada' ? 'RETIRADA' : tipoLabel(os.tipo)}{os.id ? <span style={{ color:T.muted, fontWeight:400 }}> #{os.id}</span> : null}
            {os.origem === 'sgp' && os.tipo!=='retirada' && <span style={{ marginLeft:6, fontSize:'.6rem', fontWeight:700, color:'#3ecfff', background:'rgba(62,207,255,.12)', padding:'1px 5px', borderRadius:4, verticalAlign:'middle' }}>SGP</span>}
          </div>
          <StBadge status={os.status} />
        </div>
        {(os.cliente_tel||diag?.telefone) && (
          <a href={`tel:${(os.cliente_tel||diag?.telefone||'').replace(/\D/g,'')}`}
            style={{ padding:'7px 12px', borderRadius:10, border:`1px solid rgba(0,200,150,.25)`, background:'rgba(0,200,150,.08)', color:T.green, fontWeight:700, fontSize:'.78rem', cursor:'pointer', textDecoration:'none', display:'flex', alignItems:'center' }}>
            📞
          </a>
        )}
        <button type="button" onClick={()=>navegar(os)} aria-label="Navegar"
          style={{ padding:'7px 12px', borderRadius:10, border:`1px solid rgba(62,207,255,.22)`, background:'rgba(62,207,255,.07)', color:T.cyan, fontWeight:700, fontSize:'.78rem', cursor:'pointer' }}>
          🗺️
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:`1px solid ${T.bord}`, background:T.bg, flexShrink:0 }}>
        {[['info','Info'],['checklist',`✅ ${feito}/${checklist.length}`],['equip','📦 Equip'],['notas','Notas'],['rede','Rede']].map(([id,l])=>(
          <button type="button" key={id} onClick={()=>setTab(id)} aria-label={l} aria-selected={tab===id}
            style={{ flex:1, padding:'13px 6px', border:'none', background:'none', cursor:'pointer', fontSize:'.82rem', fontWeight:600, fontFamily:'inherit', color:tab===id?T.green:T.muted, borderBottom:tab===id?`2px solid ${T.green}`:'2px solid transparent', marginBottom:-1, minHeight:44 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px 120px' }}>
        {/* INFO */}
        {tab==='info' && (
          <div>
            <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'14px 16px', marginBottom:14 }}>
              {/* Cliente — usa diag como fallback quando os.* está vazio */}
              {(os.cliente_nome||os.oc_titulo||diag?.cliente?.nome) && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>👤 Cliente</span>
                  <span style={{ fontSize:'.84rem', color:'rgba(255,255,255,.8)', textAlign:'right', fontWeight:600 }}>{os.cliente_nome||os.oc_titulo||diag?.cliente?.nome}</span>
                </div>
              )}
              {/* Contrato */}
              {(os.contrato||diag?.contrato) && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>📄 Contrato</span>
                  <span style={{ fontSize:'.84rem', color:'rgba(255,255,255,.8)', textAlign:'right' }}>#{os.contrato||diag?.contrato}</span>
                </div>
              )}
              {/* Telefone — clicável */}
              {(os.cliente_tel||diag?.telefone||diag?.cliente?.telefone) && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>📞 Telefone</span>
                  <a href={`tel:${(os.cliente_tel||diag?.telefone||diag?.cliente?.telefone||'').replace(/\D/g,'')}`}
                    style={{ fontSize:'.84rem', color:T.green, textAlign:'right', textDecoration:'none', fontWeight:700 }}>
                    {os.cliente_tel||diag?.telefone||diag?.cliente?.telefone} 📲
                  </a>
                </div>
              )}
              {/* Endereço — clicável → Google Maps */}
              {(os.endereco||diag?.cliente?.endereco) && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>📍 Endereço</span>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco||diag?.cliente?.endereco)}`}
                     target="_blank" rel="noreferrer"
                     style={{ fontSize:'.84rem', color:T.cyan, textAlign:'right', maxWidth:'65%', textDecoration:'underline', textDecorationColor:'rgba(62,207,255,.3)', textUnderlineOffset:'2px' }}>
                    {os.endereco||diag?.cliente?.endereco}
                  </a>
                </div>
              )}
              {/* Agendado */}
              {os.agendado_para && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>📅 Agendado</span>
                  <span style={{ fontSize:'.84rem', color:T.yel, textAlign:'right', fontWeight:700 }}>{fmtDt(os.agendado_para)}</span>
                </div>
              )}
              {/* Técnico */}
              {os.tecnico_nome && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>👷 Técnico</span>
                  <span style={{ fontSize:'.84rem', color:'rgba(255,255,255,.8)', textAlign:'right' }}>{os.tecnico_nome}</span>
                </div>
              )}
              {/* SLA */}
              {os.prazo_sla && (
                <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:10 }}>
                  <span style={{ fontSize:'.78rem', color:T.muted, flexShrink:0 }}>⏱ SLA</span>
                  <span style={{ fontSize:'.84rem', color:os.sla_vencido?T.red:T.green, textAlign:'right', fontWeight:700 }}>{fmtDt(os.prazo_sla)}{os.sla_vencido?' ⚠️ Vencido':''}</span>
                </div>
              )}
              {/* Sem dados — mostra loading enquanto busca diagnóstico */}
              {!os.cliente_nome && !os.oc_titulo && !os.contrato && !os.endereco && !diag?.cliente?.nome && !diag?.contrato && (
                diagLoad ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <div className="sk" style={{ height:28, borderRadius:8 }} />
                    <div className="sk" style={{ height:28, borderRadius:8 }} />
                    <div className="sk" style={{ height:28, borderRadius:8 }} />
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'20px 0', color:T.muted, fontSize:'.85rem' }}>
                    <div style={{ fontSize:24, marginBottom:6 }}>📋</div>
                    Sem dados cadastrados para esta OS
                  </div>
                )
              )}
              {/* Status conexão + sinal FTTH — resumo rápido na aba Info */}
              {(diag?.conexao || diag?.cpe) && (
                <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(0,0,0,.2)', border:`1px solid ${T.bord}`, borderRadius:10, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  {diag.conexao && (
                    <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:9, height:9, borderRadius:'50%', background: diag.conexao.online ? T.green : T.red, boxShadow: diag.conexao.online ? `0 0 6px ${T.green}` : 'none', flexShrink:0 }} />
                      <span style={{ fontWeight:800, fontSize:'.88rem', color: diag.conexao.online ? T.green : T.red }}>
                        {diag.conexao.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </span>
                  )}
                  {diag.conexao && diag.cpe && <span style={{ color:T.bord }}>·</span>}
                  {diag.cpe && !diag.cpe.erro && diag.cpe.sinal_rx != null && (
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontSize:'.78rem', color:T.muted }}>📶</span>
                      <span style={{ fontWeight:700, fontSize:'.88rem', color: sinalCor(diag.cpe.qualidade_sinal) }}>
                        {diag.cpe.sinal_rx} dBm
                      </span>
                      <span style={{ fontSize:'.72rem', color: sinalCor(diag.cpe.qualidade_sinal) }}>
                        {({ otimo:'Ótimo', bom:'Bom', fraco:'Fraco', critico:'Crítico' }[diag.cpe.qualidade_sinal]) || ''}
                      </span>
                    </span>
                  )}
                  {diag.conexao?.ip && (
                    <span style={{ fontSize:'.72rem', color:T.muted, fontFamily:'monospace', marginLeft:'auto' }}>
                      {diag.conexao.ip}
                    </span>
                  )}
                </div>
              )}

              {/* Alerta de inadimplência do diagnóstico */}
              {(diag?.inadimplente || diag?.cliente?.inadimplente) && (
                <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(255,71,87,.08)', border:'1px solid rgba(255,71,87,.25)', borderRadius:10, fontSize:'.82rem', color:T.red, fontWeight:600 }}>
                  ⚠️ Cliente com faturas em aberto — pode ser motivo da queda
                </div>
              )}
              {/* Localização */}
              {diag?.localizacao && (
                <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(0,200,150,.06)', border:'1px solid rgba(0,200,150,.15)', borderRadius:10, fontSize:'.82rem', color:T.green }}>
                  {diag.localizacao.fonte === 'checkin' && `📍 Localização salva por ${diag.localizacao.tecnico} em visita anterior ✓`}
                  {diag.localizacao.fonte === 'instalacao' && '📍 Coordenadas do ponto de instalação (SGP)'}
                  {diag.localizacao.fonte === 'sgp' && '📍 Localização do endereço cadastrado no SGP'}
                </div>
              )}

              {/* Histórico de status */}
              {diag?.historico_status?.length > 0 && (
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:'.7rem', color:T.muted, marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>📋 Últimas alterações de status</div>
                  <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:10, overflow:'hidden' }}>
                    {diag.historico_status.map((h, i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', borderBottom: i < diag.historico_status.length-1 ? `1px solid ${T.bord}` : 'none', fontSize:'.78rem' }}>
                        <span style={{ color:T.text }}>{h.status}</span>
                        <span style={{ color:T.muted, fontSize:'.72rem' }}>{h.data ? new Date(h.data).toLocaleDateString('pt-BR') : ''}{h.motivo ? ` · ${h.motivo}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {os.observacao && <div style={{ marginTop:8, padding:'9px 10px', background:T.overlay, borderRadius:8, fontSize:'.8rem', color:'rgba(255,255,255,.55)', lineHeight:1.5 }}>{os.observacao}</div>}
            </div>

            {oc && (
              <div style={{ background:'rgba(0,200,150,.05)', border:`1px solid rgba(0,200,150,.15)`, borderRadius:T.r14, padding:'14px 16px' }}>
                <div style={{ fontSize:'.65rem', fontWeight:800, color:'rgba(0,200,150,.7)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>📋 Ocorrência vinculada</div>
                <div style={{ fontWeight:700, fontSize:'.9rem', marginBottom:6 }}>{oc.titulo||oc.tipo||'—'}</div>
                {oc.descricao && <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.55)', lineHeight:1.55 }}>{oc.descricao}</div>}
                {Array.isArray(oc.notas) && oc.notas.slice(0,2).map((n,i)=>(
                  <div key={i} style={{ borderTop:`1px solid ${T.bord}`, paddingTop:8, marginTop:8 }}>
                    <div style={{ fontSize:'.65rem', color:T.muted, marginBottom:2 }}>{n.agente_nome} · {fmtDt(n.criado_em)}</div>
                    <div style={{ fontSize:'.79rem', color:'rgba(255,255,255,.6)' }}>{n.conteudo}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST */}
        {tab==='checklist' && (
          <div>
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:'.75rem', color:T.muted }}>Progresso</span>
                <span style={{ fontSize:'.75rem', fontWeight:700, color:pct===100?T.green:T.muted }}>{feito}/{checklist.length} ({pct}%)</span>
              </div>
              <div style={{ height:7, background:'rgba(255,255,255,.07)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:pct===100?T.green:`linear-gradient(90deg,${T.green},${T.yel})`, borderRadius:4, transition:'width .3s' }} />
              </div>
            </div>
            {checklist.map((item,idx)=>(
              <div key={idx} onClick={()=>toggleCL(idx)} role="checkbox" aria-checked={item.done} tabIndex={0} onKeyDown={e=>e.key===' '&&toggleCL(idx)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 14px', marginBottom:8, background:T.card, border:`1px solid ${item.done?'rgba(0,200,150,.2)':T.bord}`, borderRadius:T.r12, cursor:'pointer', userSelect:'none', transition:'border-color .15s' }}>
                <div style={{ width:24, height:24, borderRadius:7, border:`2px solid ${item.done?T.green:'rgba(255,255,255,.2)'}`, background:item.done?T.green:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
                  {item.done && <span style={{ color:'#030f0b', fontSize:14, fontWeight:900, lineHeight:1 }}>✓</span>}
                </div>
                <span style={{ fontSize:'.9rem', color:item.done?T.muted:T.text, textDecoration:item.done?'line-through':'none', flex:1 }}>{item.label}</span>
              </div>
            ))}
            {pct===100 && <div style={{ textAlign:'center', padding:'14px 0', color:T.green, fontWeight:800, fontSize:'.95rem' }}>✅ Tudo concluído!</div>}
          </div>
        )}

        {/* EQUIPAMENTOS */}
        {tab==='equip' && <EquipamentosOS osId={os.id} />}

        {/* NOTAS */}
        {tab==='notas' && (
          <div>
            <textarea value={nota} onChange={e=>setNota(e.target.value)} placeholder="Adicionar nota ou observação…" rows={4}
              style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.9rem', resize:'vertical', outline:'none', boxSizing:'border-box', marginBottom:10, fontFamily:'inherit', lineHeight:1.5 }} />
            <button type="button" onClick={salvarNota} disabled={saving||!nota.trim()} aria-label="Salvar nota na ocorrência"
              style={{ width:'100%', padding:'12px', borderRadius:T.r12, border:`1px solid rgba(0,200,150,.22)`, background:'rgba(0,200,150,.09)', color:T.green, fontWeight:700, cursor:'pointer', fontSize:'.88rem' }}>
              {saving?'Salvando…':'💬 Salvar nota'}
            </button>
          </div>
        )}

        {/* ─ REDE ─ */}
        {tab === 'rede' && (
          <div>
            {diagLoad ? (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div className="sk" style={{ height:80 }} />
                <div className="sk" style={{ height:120 }} />
                <div className="sk" style={{ height:60, opacity:.6 }} />
              </div>
            ) : !diag ? (
              <div style={{ textAlign:'center', padding:30, color:T.muted, fontSize:'.84rem' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📡</div>
                <div>Nenhum dado de conexão</div>
              </div>
            ) : diag.sem_contrato ? (
              <div style={{ textAlign:'center', padding:24, color:T.muted, fontSize:'.84rem' }}>
                OS sem contrato vinculado
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* ─ Status de conexão ─ */}
                {diag.conexao && (
                  <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:diag.conexao.online?T.green:T.red, flexShrink:0 }} />
                      <span style={{ fontWeight:800, fontSize:'.95rem', color:diag.conexao.online?T.green:T.red }}>
                        {diag.conexao.online ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      <span style={{ fontSize:'.75rem', color:T.muted, marginLeft:'auto' }}>
                        #{diag.contrato}
                      </span>
                    </div>
                    <div style={{ fontSize:'.78rem', color:T.muted }}>{diag.conexao.msg}</div>
                  </div>
                )}

                {/* ─ ONU / CPE ─ */}
                {diag.cpe && !diag.cpe.erro && (
                  <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'14px 16px' }}>
                    <div style={{ fontSize:'.65rem', fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>📟 ONU / CPE</div>

                    {/* Sinal óptico */}
                    {diag.cpe.sinal_rx != null && (
                      <div style={{ marginBottom:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                          <span style={{ fontSize:'.8rem', color:T.muted }}>Sinal Rx (fibra)</span>
                          <span style={{ fontWeight:800, fontSize:'.88rem', color:sinalCor(diag.cpe.qualidade_sinal) }}>
                            {diag.cpe.sinal_rx} dBm
                          </span>
                        </div>
                        {/* Barra de sinal */}
                        <div style={{ display:'flex', gap:3 }}>
                          {[1,2,3,4,5].map(i => (
                            <div key={i} style={{ flex:1, height:8, borderRadius:3,
                              background: i <= sinalBar(diag.cpe.qualidade_sinal)
                                ? sinalCor(diag.cpe.qualidade_sinal)
                                : 'rgba(255,255,255,.1)' }} />
                          ))}
                        </div>
                        <div style={{ fontSize:'.7rem', color:sinalCor(diag.cpe.qualidade_sinal), fontWeight:700, marginTop:4 }}>
                          {({ otimo:'✅ Ótimo', bom:'🟢 Bom', fraco:'⚠️ Fraco', critico:'🔴 Crítico' }[diag.cpe.qualidade_sinal]) || '—'}
                        </div>
                        {diag.cpe.sinal_tx != null && (
                          <div style={{ fontSize:'.72rem', color:T.muted, marginTop:4 }}>Sinal Tx: {diag.cpe.sinal_tx} dBm</div>
                        )}
                      </div>
                    )}

                    {/* Dados do dispositivo */}
                    {[
                      ['Modelo',   diag.cpe.modelo],
                      ['Serial',   diag.cpe.serial],
                      ['MAC',      diag.cpe.mac],
                      ['IP WAN',   diag.cpe.ip_wan],
                      ['Uptime',   diag.cpe.uptime_fmt],
                      ['Firmware', diag.cpe.firmware],
                    ].filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:6 }}>
                        <span style={{ fontSize:'.75rem', color:T.muted, flexShrink:0 }}>{k}</span>
                        <span style={{ fontSize:'.78rem', color:'rgba(255,255,255,.75)', textAlign:'right', fontFamily:k==='MAC'||k==='IP WAN'?'monospace':'inherit' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ─ PPPoE — reveal protegido ─ */}
                <div style={{ background:'rgba(245,197,24,.05)', border:`1px solid rgba(245,197,24,.15)`, borderRadius:T.r14, padding:'14px 16px' }}>
                  <div style={{ fontSize:'.65rem', fontWeight:800, color:'#f5c518', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>🔑 Credenciais PPPoE</div>
                  <div style={{ fontSize:'.78rem', color:T.muted, marginBottom:12 }}>
                    Necessário para configurar novo roteador. Acesso registrado em log.
                  </div>

                  {!pppoe ? (
                    <button type="button" onClick={revelarPppoe} disabled={pppoeLoad} aria-label="Revelar credenciais PPPoE"
                      style={{ width:'100%', padding:'12px', borderRadius:T.r12, border:`1px solid rgba(245,197,24,.3)`, background:'rgba(245,197,24,.1)', color:'#f5c518', fontWeight:800, cursor:'pointer', fontSize:'.88rem', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      {pppoeLoad
                        ? <><span style={{ width:16,height:16,border:'2px solid rgba(245,197,24,.3)',borderTopColor:'#f5c518',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite' }}/> Buscando…</>
                        : '🔓 Revelar login e senha'}
                    </button>
                  ) : !pppoe.encontrado ? (
                    <div style={{ fontSize:'.82rem', color:T.muted, textAlign:'center' }}>{pppoe.msg}</div>
                  ) : (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:'.65rem', color:T.muted, marginBottom:3 }}>Login PPPoE</div>
                          <div style={{ fontFamily:'monospace', fontSize:'.95rem', color:T.text, fontWeight:700 }}>{pppoe.login}</div>
                        </div>
                        <button type="button" onClick={()=>navigator.clipboard?.writeText(pppoe.login)} aria-label="Copiar login"
                          style={{ background:'rgba(255,255,255,.06)', border:`1px solid ${T.bord}`, borderRadius:8, color:T.muted, padding:'5px 10px', cursor:'pointer', fontSize:'.7rem' }}>
                          📋
                        </button>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:'.65rem', color:T.muted, marginBottom:3 }}>Senha PPPoE</div>
                          <div style={{ fontFamily:'monospace', fontSize:'.95rem', color:T.text, fontWeight:700, letterSpacing: pppoeVisible ? 0 : '.2em' }}>
                            {pppoeVisible ? pppoe.senha : '••••••••'}
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6 }}>
                          <button type="button" onClick={()=>setPppoeVisible(v=>!v)} aria-label={pppoeVisible?'Ocultar senha':'Mostrar senha'}
                            style={{ background:'rgba(255,255,255,.06)', border:`1px solid ${T.bord}`, borderRadius:8, color:T.muted, padding:'5px 10px', cursor:'pointer', fontSize:'.7rem' }}>
                            {pppoeVisible ? '🙈' : '👁️'}
                          </button>
                          {pppoeVisible && (
                            <button type="button" onClick={()=>navigator.clipboard?.writeText(pppoe.senha)} aria-label="Copiar senha"
                              style={{ background:'rgba(255,255,255,.06)', border:`1px solid ${T.bord}`, borderRadius:8, color:T.muted, padding:'5px 10px', cursor:'pointer', fontSize:'.7rem' }}>
                              📋
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize:'.65rem', color:'rgba(245,197,24,.4)', marginTop:10 }}>
                        ⚠️ Acesso registrado. Não compartilhe com clientes.
                      </div>
                      {/* Trocar senha PPPoE */}
                      {!trocandoSenha ? (
                        <button type="button" onClick={()=>setTrocandoSenha(true)}
                          style={{ marginTop:10, width:'100%', padding:'9px', borderRadius:10, border:`1px solid rgba(245,197,24,.25)`, background:'rgba(245,197,24,.06)', color:'#f5c518', fontWeight:700, fontSize:'.8rem', cursor:'pointer' }}>
                          🔑 Trocar senha PPPoE
                        </button>
                      ) : (
                        <div style={{ marginTop:10 }}>
                          <input value={novaSenha} onChange={e=>setNovaSenha(e.target.value)}
                            placeholder="Nova senha (mín. 6 caracteres)"
                            type="password" autoComplete="new-password"
                            style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:`1px solid rgba(245,197,24,.3)`, background:T.bg, color:T.text, fontSize:'.88rem', outline:'none', boxSizing:'border-box', marginBottom:8, fontFamily:'monospace' }} />
                          <div style={{ display:'flex', gap:8 }}>
                            <button type="button" onClick={()=>{ setTrocandoSenha(false); setNovaSenha(''); }}
                              style={{ flex:1, padding:'9px', borderRadius:10, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, fontSize:'.82rem', cursor:'pointer' }}>
                              Cancelar
                            </button>
                            <button type="button" onClick={trocarSenhaPPPoE} disabled={salvandoSenha || novaSenha.length < 6}
                              style={{ flex:2, padding:'9px', borderRadius:10, border:'none', background:novaSenha.length>=6?'#f5c518':'rgba(245,197,24,.3)', color:'#000', fontWeight:700, fontSize:'.82rem', cursor:novaSenha.length>=6?'pointer':'default' }}>
                              {salvandoSenha ? 'Salvando…' : '✓ Confirmar'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ─ Cliente SGP ─ */}
                {diag.cliente && (
                  <div style={{ background:T.card, border:`1px solid ${T.bord}`, borderRadius:T.r14, padding:'14px 16px' }}>
                    <div style={{ fontSize:'.65rem', fontWeight:800, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>👤 Cliente no SGP</div>
                    {[
                      ['Plano',     diag.cliente.plano],
                      ['Status',    diag.cliente.status],
                      ['Mensalidade', diag.cliente.valor ? `R$ ${Number(diag.cliente.valor).toFixed(2).replace('.',',')}` : null],
                      ['Endereço',  diag.cliente.endereco],
                      ['Telefone',  diag.cliente.telefone],
                    ].filter(([,v])=>v).map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, marginBottom:8 }}>
                        <span style={{ fontSize:'.75rem', color:T.muted, flexShrink:0 }}>{k}</span>
                        <span style={{ fontSize:'.8rem', color:'rgba(255,255,255,.8)', textAlign:'right' }}>{v}</span>
                      </div>
                    ))}
                    {diag.cliente.inadimplente && (
                      <div style={{ marginTop:8, padding:'8px 10px', background:'rgba(255,71,87,.1)', border:`1px solid rgba(255,71,87,.2)`, borderRadius:8, fontSize:'.78rem', color:T.red, fontWeight:700 }}>
                        ⚠️ Inadimplente — {diag.cliente.titulos_abertos} fatura(s) · R$ {Number(diag.cliente.valor_aberto).toFixed(2).replace('.',',')}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>{/* fim scroll area */}

      {/* Modal cancelamento — P0: substitui confirm() nativo */}
      {cancelModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'#1a0a0a', borderRadius:'20px 20px 0 0', padding:'22px 18px 32px', borderTop:`2px solid ${T.red}` }}>
            <div style={{ width:36, height:4, background:'rgba(255,255,255,.15)', borderRadius:2, margin:'0 auto 18px' }} />
            <div style={{ fontWeight:900, fontSize:'1.05rem', color:T.red, marginBottom:6 }}>✕ Cancelar OS #{os.id}?</div>
            <div style={{ fontSize:'.82rem', color:T.muted, marginBottom:18 }}>
              Esta ação não pode ser desfeita. A OS será marcada como cancelada.
            </div>
            <div style={{ fontSize:'.72rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Motivo (obrigatório)</div>
            <textarea value={motivoCancel} onChange={e=>setMotivoCancel(e.target.value)}
              placeholder="Ex: Cliente não estava em casa, problema resolvido remotamente…" rows={3}
              aria-label="Motivo do cancelamento"
              style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid rgba(255,71,87,.3)`, background:'rgba(255,71,87,.06)', color:T.text, fontSize:'.9rem', resize:'none', outline:'none', boxSizing:'border-box', marginBottom:14, fontFamily:'inherit' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button type="button" onClick={()=>{ setCancelModal(false); setMotivoCancel(''); }} aria-label="Voltar sem cancelar"
                style={{ padding:'13px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, fontWeight:600, cursor:'pointer', fontSize:'.88rem' }}>
                Voltar
              </button>
              <button type="button" onClick={confirmarCancelamento} disabled={saving || !motivoCancel.trim()} aria-label="Confirmar cancelamento da OS"
                style={{ padding:'13px', borderRadius:T.r12, border:'none', background:motivoCancel.trim()?T.red:'rgba(255,71,87,.3)', color:'#fff', fontWeight:900, cursor:motivoCancel.trim()?'pointer':'default', fontSize:'.9rem', transition:'background .15s' }}>
                {saving ? 'Cancelando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal conclusão */}
      {confirmando && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:200, display:'flex', alignItems:'flex-end' }}>
          <div style={{ width:'100%', background:'#0a1a14', borderRadius:'20px 20px 0 0', padding:'22px 18px 32px', maxHeight:'90dvh', overflowY:'auto', boxSizing:'border-box' }}>
            <div style={{ width:36, height:4, background:'rgba(255,255,255,.15)', borderRadius:2, margin:'0 auto 18px' }} />
            <div style={{ fontWeight:900, fontSize:'1.1rem', marginBottom:4 }}>✅ Encerrar OS #{os.id}</div>
            <div style={{ fontSize:'.82rem', color:T.muted, marginBottom:16 }}>{feito}/{checklist.length} itens do checklist</div>

            {/* Foto obrigatória */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:'.7rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>
                📷 Foto da conclusão <span style={{ color:T.red }}>*</span>
              </div>
              <label style={{ display:'block', cursor:'pointer' }}>
                {fotoConclusao ? (
                  <div style={{ position:'relative' }}>
                    <img src={fotoConclusao} alt="foto conclusão"
                      style={{ width:'100%', maxHeight:200, objectFit:'cover', borderRadius:T.r12, border:`2px solid ${T.green}` }} />
                    <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.6)', borderRadius:20, padding:'3px 10px', fontSize:'.7rem', color:T.green, fontWeight:700 }}>
                      ✓ OK — toque para trocar
                    </div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'28px 16px', borderRadius:T.r12, border:`2px dashed rgba(255,71,87,.4)`, background:'rgba(255,71,87,.04)' }}>
                    <span style={{ fontSize:36 }}>📷</span>
                    <span style={{ fontSize:'.85rem', color:'rgba(255,71,87,.85)', fontWeight:700 }}>Tirar foto obrigatória</span>
                    <span style={{ fontSize:'.72rem', color:T.muted }}>Comprova a conclusão do serviço</span>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" onChange={capturarFoto} style={{ display:'none' }} />
              </label>
            </div>

            <textarea value={obsConc} onChange={e=>setObsConc(e.target.value)} placeholder="Observação final (opcional)…" rows={2}
              style={{ width:'100%', padding:'12px 14px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.text, fontSize:'.85rem', resize:'none', outline:'none', boxSizing:'border-box', marginBottom:14, fontFamily:'inherit' }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
              <button type="button" onClick={()=>{ setConfirmando(false); setFotoConclusao(null); }} aria-label="Voltar sem concluir"
                style={{ padding:'13px', borderRadius:T.r12, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, fontWeight:600, cursor:'pointer', fontSize:'.88rem' }}>Voltar</button>
              <button type="button" onClick={concluir} disabled={saving || !fotoConclusao} aria-label="Confirmar conclusão da OS"
                style={{ padding:'13px', borderRadius:T.r12, border:'none',
                  background: fotoConclusao ? `linear-gradient(135deg,${T.green},#008b87)` : 'rgba(0,200,150,.2)',
                  color: fotoConclusao ? '#030f0b' : 'rgba(0,200,150,.4)',
                  fontWeight:900, cursor: fotoConclusao ? 'pointer' : 'default', fontSize:'.9rem' }}>
                {saving ? 'Salvando…' : '✅ Encerrar OS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de ações */}
      {['concluida','cancelada'].includes(os.status) && (
        <div style={{ padding:'16px 18px', borderTop:`1px solid ${T.bord}`, background:T.bg }}>
          <div style={{ textAlign:'center', color:os.status==='concluida'?T.green:T.red, fontWeight:700, fontSize:'.9rem' }}>
            {os.status==='concluida' ? '✅ OS concluída' : '✕ OS cancelada'}
          </div>
          {os.observacao_conclusao && <div style={{ marginTop:6, fontSize:'.8rem', color:T.muted, textAlign:'center' }}>{os.observacao_conclusao}</div>}
        </div>
      )}
      {btns.length > 0 && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'12px 16px', paddingBottom:'max(16px,env(safe-area-inset-bottom))', background:T.bg, backdropFilter:'blur(12px)', borderTop:`1px solid ${T.bord}` }}>
          {/* Termo de Aceite — instalação/relocação em execução */}
          {os.status === 'execucao' && (os.tipo === 'instalacao' || os.tipo === 'relocacao') && (
            <button type="button" onClick={enviarTermo} disabled={enviandoTermo}
              style={{ width:'100%', marginBottom:8, padding:'10px', borderRadius:T.r12, border:`1px solid rgba(100,200,255,.25)`, background:'rgba(100,200,255,.07)', color:'rgba(100,200,255,.9)', fontWeight:700, fontSize:'.82rem', cursor:'pointer' }}>
              {enviandoTermo ? '⏳ Registrando...' : '📝 Registrar Termo de Aceite'}
            </button>
          )}
          {/* Botões primários (avançar status / concluir) */}
          <div style={{ display:'grid', gridTemplateColumns: btns.length===1 || btns[0]?.full ? '1fr' : '1fr 1fr', gap:10 }}>
            {btns.map((b,i)=>(
              <button type="button" key={i} onClick={()=>avancar(b.status)} disabled={saving} aria-label={b.label}
                style={{ padding:'14px', borderRadius:T.r12, border:'none',
                         background:`linear-gradient(135deg,${b.cor},${b.cor}dd)`,
                         color:'#030f0b', fontWeight:900, cursor:'pointer', fontSize:'.95rem' }}>
                {b.label}
              </button>
            ))}
          </div>
          {/* Cancelar — discreto, separado, não pode ser tocado por engano */}
          {podeCancelar && (
            <button type="button" onClick={()=>setCancelModal(true)} disabled={saving}
              style={{ display:'block', margin:'10px auto 0', padding:'4px 8px', border:'none', background:'none', color:'rgba(255,255,255,.35)', fontSize:'.74rem', cursor:'pointer', textDecoration:'underline', textDecorationColor:'rgba(255,71,87,.3)', textUnderlineOffset:'3px' }}>
              ✕ Cancelar OS
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DETALHE DE OC (compacto, vindo da aba OC)
═══════════════════════════════════════════════════════════════════════════ */

export { DetalheOS };
