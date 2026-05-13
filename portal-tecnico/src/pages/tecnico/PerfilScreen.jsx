import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, User, Camera, Lock, Save, Eye, EyeOff,
  ShieldCheck, Phone, AtSign, FileText, Loader2, CheckCircle2, LogOut,
  Smile, Clock, Palette, MessageSquare, BarChart3, Plus, Trash2, X,
} from 'lucide-react';
import { T, LS_USER, api, apiJson, getTecToken } from './shared';

const ROLE_LABEL = { admin: 'Administrador', agente: 'Agente', supervisor: 'Supervisor', tecnico: 'Técnico' };

// Presets de status — toque rápido pro técnico em campo
const STATUS_PRESETS = [
  { emoji: '✅', texto: 'Disponível' },
  { emoji: '🍽️', texto: 'Almoço' },
  { emoji: '🔧', texto: 'Em campo' },
  { emoji: '🚗', texto: 'A caminho' },
  { emoji: '📞', texto: 'Reunião' },
  { emoji: '☕', texto: 'Pausa' },
  { emoji: '💤', texto: 'Indisponível' },
];

// Cores de destaque pré-definidas — paleta segura no contraste contra os
// fundos escuros do app. Usuário escolhe entre essas (em vez de color picker).
const CORES_DESTAQUE = [
  '#00c896', '#3ecfff', '#a78bfa', '#fb923c',
  '#facc15', '#f87171', '#22c55e', '#06b6d4',
];

const DIAS = [
  { id: 'dom', label: 'D' },
  { id: 'seg', label: 'S' },
  { id: 'ter', label: 'T' },
  { id: 'qua', label: 'Q' },
  { id: 'qui', label: 'Q' },
  { id: 'sex', label: 'S' },
  { id: 'sab', label: 'S' },
];

/* ── KPI compacto pro dashboard pessoal ───────────────────────────────────── */
function KpiCard({ label, value, hint, accent, warn }) {
  const cor = warn ? T.red : (accent || T.text);
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      background: 'rgba(0,0,0,.2)',
      border: `1px solid ${warn ? 'rgba(255,71,87,.25)' : 'rgba(255,255,255,.05)'}`,
    }}>
      <div style={{ fontSize:'.6rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
        {label}
      </div>
      <div style={{ fontSize:'1.4rem', fontWeight:800, color: cor, fontFamily:"'JetBrains Mono',monospace", lineHeight:1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize:'.65rem', color:T.muted, marginTop:3 }}>{hint}</div>}
    </div>
  );
}

/* ── Field reutilizável ───────────────────────────────────────────────────── */
function Field({ label, value, onChange, readOnly, type = 'text', placeholder, hint, rows, icon }) {
  const Tag = rows ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: '.7rem', fontWeight: 700,
        color: 'rgba(0,200,150,.72)',
        letterSpacing: '.07em', textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        {icon}{label}
      </label>
      <Tag
        type={type}
        value={value || ''}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder || ''}
        rows={rows}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: rows ? '12px 14px' : '13px 14px',
          fontSize: '.95rem', borderRadius: 12,
          background: readOnly ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.3)',
          border: `1px solid ${readOnly ? 'rgba(255,255,255,.06)' : 'rgba(0,200,150,.18)'}`,
          color: T.text,
          outline: 'none', fontFamily: 'inherit',
          opacity: readOnly ? .65 : 1,
          cursor: readOnly ? 'not-allowed' : 'text',
          resize: rows ? 'vertical' : 'none',
          minHeight: rows ? 80 : undefined,
          transition: 'border-color .15s, background .15s',
        }}
        onFocus={e => { if (!readOnly) e.target.style.borderColor = 'rgba(0,200,150,.5)'; }}
        onBlur={e => { if (!readOnly) e.target.style.borderColor = 'rgba(0,200,150,.18)'; }}
      />
      {hint && (
        <div style={{ fontSize: '.65rem', color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
function PerfilScreen({ onBack, showToast, onLogout }) {
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [form, setForm] = useState({
    nome_exibicao: '', bio: '', tel_contato: '',
    status_texto: '', status_emoji: '',
    assinatura_chat: '',
    cor_destaque: '',
    quiet_horas: { ativo: false, inicio: '22:00', fim: '07:00', dias: ['dom','seg','ter','qua','qui','sex','sab'] },
  });

  const [showSenhaPanel, setShowSenhaPanel] = useState(false);
  const [senhaForm, setSenhaForm] = useState({ nova: '', nova2: '' });
  const [showPwd, setShowPwd] = useState(false);

  // Templates pessoais
  const [templates, setTemplates] = useState([]);
  const [novoTpl, setNovoTpl] = useState({ atalho: '', conteudo: '' });
  const [salvandoTpl, setSalvandoTpl] = useState(false);

  // Dashboard
  const [metricas, setMetricas] = useState(null);

  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await apiJson('/api/agente/perfil');
      setPerfil(p);
      setForm({
        nome_exibicao: p.nome_exibicao || '',
        bio: p.bio || '',
        tel_contato: p.tel_contato || '',
        status_texto: p.status_texto || '',
        status_emoji: p.status_emoji || '',
        assinatura_chat: p.assinatura_chat || '',
        cor_destaque: p.cor_destaque || '',
        quiet_horas: p.quiet_horas && typeof p.quiet_horas === 'object'
          ? { ativo: !!p.quiet_horas.ativo, inicio: p.quiet_horas.inicio || '22:00', fim: p.quiet_horas.fim || '07:00', dias: Array.isArray(p.quiet_horas.dias) ? p.quiet_horas.dias : ['dom','seg','ter','qua','qui','sex','sab'] }
          : { ativo: false, inicio: '22:00', fim: '07:00', dias: ['dom','seg','ter','qua','qui','sex','sab'] },
      });
    } catch (e) { showToast?.('Erro ao carregar perfil', true); }
    setLoading(false);
  }, [showToast]);

  // Templates pessoais — load
  const loadTemplates = useCallback(async () => {
    try {
      const tpls = await apiJson('/api/agente/respostas-rapidas');
      setTemplates(Array.isArray(tpls) ? tpls : []);
    } catch {}
  }, []);

  // Métricas — load (silencioso, não bloqueia)
  const loadMetricas = useCallback(async () => {
    try { setMetricas(await apiJson('/api/agente/metricas')); } catch {}
  }, []);

  useEffect(() => { load(); loadTemplates(); loadMetricas(); }, [load, loadTemplates, loadMetricas]);

  /* ── upload de foto ── */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast?.('Selecione uma imagem', true); return; }
    if (file.size > 8 * 1024 * 1024) { showToast?.('Imagem muito grande (máx 8 MB)', true); return; }

    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);

    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const token = getTecToken();
      // Endpoint mountado em /admin/api/agente/perfil/avatar — usa x-admin-token igual ao api()
      const res = await fetch(window.location.origin + '/admin/api/agente/perfil/avatar', {
        method: 'POST',
        headers: token ? { 'x-admin-token': token } : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        showToast?.('Erro: ' + (data.error || 'falha no upload'), true);
        setPhotoPreview(null);
      } else {
        setPerfil(p => ({ ...p, avatar_url: data.url }));
        // Atualiza tb o user no LS pra refletir avatar nas próximas telas
        // e dispara evento global pra Home/Header pegarem a nova foto agora
        try {
          const u = JSON.parse(localStorage.getItem(LS_USER) || '{}');
          u.avatar_url = data.url;
          localStorage.setItem(LS_USER, JSON.stringify(u));
          window.dispatchEvent(new CustomEvent('tecnico-user-updated'));
        } catch {}
        showToast?.('✅ Foto atualizada!');
      }
    } catch (err) {
      showToast?.('Erro no upload: ' + err.message, true);
      setPhotoPreview(null);
    }
    setUploadingPhoto(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── salvar info ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await api('/api/agente/perfil', { method: 'PUT', body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) showToast?.('Erro: ' + (data.error || 'falha'), true);
      else {
        showToast?.('✅ Perfil salvo!');
        setPerfil(p => ({ ...p, ...form }));
      }
    } catch (e) { showToast?.('Erro: ' + e.message, true); }
    setSaving(false);
  };

  /* ── status: aplica preset + salva direto (sem precisar tocar "Salvar") ── */
  const aplicarStatus = async (emoji, texto) => {
    setForm(f => ({ ...f, status_emoji: emoji, status_texto: texto }));
    try {
      await api('/api/agente/perfil', {
        method: 'PUT',
        body: JSON.stringify({ status_emoji: emoji || null, status_texto: texto || null }),
      });
      setPerfil(p => ({ ...p, status_emoji: emoji, status_texto: texto }));
      showToast?.(texto ? `Status: ${emoji} ${texto}` : 'Status limpo');
    } catch (e) { showToast?.('Erro ao salvar status', true); }
  };

  /* ── templates pessoais: criar/atualizar/excluir ── */
  const criarTemplate = async () => {
    if (!novoTpl.atalho.trim() || !novoTpl.conteudo.trim()) {
      return showToast?.('Atalho e conteúdo obrigatórios', true);
    }
    setSalvandoTpl(true);
    try {
      const r = await api('/api/agente/respostas-rapidas', { method: 'POST', body: JSON.stringify(novoTpl) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha');
      setTemplates(t => [...t, data]);
      setNovoTpl({ atalho: '', conteudo: '' });
      showToast?.('✅ Template criado');
    } catch (e) { showToast?.('Erro: ' + e.message, true); }
    setSalvandoTpl(false);
  };

  const removerTemplate = async (id) => {
    try {
      await api(`/api/agente/respostas-rapidas/${id}`, { method: 'DELETE' });
      setTemplates(t => t.filter(x => x.id !== id));
      showToast?.('Removido');
    } catch (e) { showToast?.('Erro: ' + e.message, true); }
  };

  /* ── trocar senha ── */
  const handleSenha = async () => {
    if (!senhaForm.nova) return showToast?.('Digite a nova senha', true);
    if (senhaForm.nova.length < 4) return showToast?.('Senha mínimo 4 caracteres', true);
    if (senhaForm.nova !== senhaForm.nova2) return showToast?.('Senhas não conferem', true);
    setSaving(true);
    try {
      const r = await api('/api/agente/perfil', { method: 'PUT', body: JSON.stringify({ senha: senhaForm.nova }) });
      const data = await r.json();
      if (!r.ok) showToast?.('Erro: ' + (data.error || 'falha'), true);
      else {
        showToast?.('✅ Senha alterada!');
        setSenhaForm({ nova: '', nova2: '' });
        setShowSenhaPanel(false);
      }
    } catch (e) { showToast?.('Erro: ' + e.message, true); }
    setSaving(false);
  };

  const photoSrc = photoPreview || perfil?.avatar_url || null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
      background: T.bg, color: T.text,
      fontFamily: "'Inter',system-ui,sans-serif",
    }}>
      {/* Header com back */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        borderBottom: `1px solid ${T.bord}`,
        background: T.bg1, flexShrink: 0,
      }}>
        <button type="button" onClick={onBack} aria-label="Voltar"
          style={{
            width: 38, height: 38, borderRadius: 10,
            border: `1px solid ${T.bord}`, background: T.card,
            color: T.text, cursor: 'pointer', touchAction: 'manipulation',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <ArrowLeft size={18}/>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.95rem', fontWeight: 700, color: T.text }}>Meu perfil</div>
          <div style={{ fontSize: '.7rem', color: T.muted, marginTop: 2 }}>
            Personalize sua presença no sistema
          </div>
        </div>
      </div>

      {/* Conteúdo scrollável */}
      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        padding: '16px 14px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: T.muted }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }}/>
            Carregando…
          </div>
        ) : (
          <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Card foto + identidade ── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 22,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              animation: 'fadeIn .4s ease',
            }}>
              {/* Avatar com overlay de câmera */}
              <div onClick={() => !uploadingPhoto && fileRef.current?.click()}
                role="button" tabIndex={0} aria-label="Trocar foto"
                style={{ position: 'relative', cursor: uploadingPhoto ? 'wait' : 'pointer', touchAction: 'manipulation' }}>
                <div style={{
                  width: 120, height: 120, borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg,rgba(0,200,150,.18),rgba(0,200,150,.05))',
                  border: '3px solid rgba(0,200,150,.35)',
                  boxShadow: '0 6px 22px rgba(0,200,150,.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {photoSrc ? (
                    <img src={photoSrc} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  ) : (
                    <span style={{ fontSize: '3rem' }}>{perfil?.avatar || '👤'}</span>
                  )}
                  {uploadingPhoto && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,.55)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%',
                    }}>
                      <Loader2 size={26} color="#fff" style={{ animation: 'spin 1s linear infinite' }}/>
                    </div>
                  )}
                </div>
                {/* Botão câmera */}
                <div aria-hidden style={{
                  position: 'absolute', bottom: 4, right: 4,
                  width: 36, height: 36, borderRadius: '50%',
                  background: T.green, color: '#022a35',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 3px 10px rgba(0,0,0,.4)',
                  border: '2px solid ' + T.bg,
                }}>
                  <Camera size={16} strokeWidth={2.4}/>
                </div>
              </div>

              {/* Sem `capture` o iOS/Android mostram o seletor padrão com
                  opções "Tirar foto" + "Biblioteca de fotos" + "Arquivos". */}
              <input ref={fileRef} type="file" accept="image/*"
                style={{ display: 'none' }} onChange={handleFileChange}/>

              {/* Identidade */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: T.text }}>
                  {perfil?.nome_exibicao || perfil?.nome || '—'}
                </div>
                <div style={{
                  fontSize: '.78rem', color: T.muted, marginTop: 2,
                  fontFamily: "'JetBrains Mono',monospace",
                }}>@{perfil?.login}</div>
                <div style={{ display:'flex', justifyContent:'center', flexWrap:'wrap', gap:6, marginTop: 8 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 99,
                    fontSize: '.7rem', fontWeight: 700,
                    background: 'rgba(0,200,150,.12)',
                    border: '1px solid rgba(0,200,150,.3)',
                    color: T.green,
                  }}>
                    <ShieldCheck size={11}/>
                    {ROLE_LABEL[perfil?.role] || perfil?.role || 'Técnico'}
                  </div>
                  {(perfil?.status_emoji || perfil?.status_texto) && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '4px 12px', borderRadius: 99,
                      fontSize: '.7rem', fontWeight: 700,
                      background: 'rgba(245,197,24,.1)',
                      border: '1px solid rgba(245,197,24,.3)',
                      color: '#facc15',
                    }}>
                      {perfil.status_emoji} {perfil.status_texto}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ fontSize: '.7rem', color: T.muted, textAlign: 'center', lineHeight: 1.5 }}>
                Toque na foto pra trocar.<br/>
                Será recortada em 200×200px.
              </div>
            </div>

            {/* ── Card edição ── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .05s ease both',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '.85rem', fontWeight: 700, color: T.text,
                marginBottom: 14, paddingBottom: 10,
                borderBottom: '1px solid rgba(255,255,255,.06)',
              }}>
                <User size={15} color={T.green}/> Informações editáveis
              </div>

              <Field
                label="Nome de exibição"
                value={form.nome_exibicao}
                onChange={v => setForm(f => ({ ...f, nome_exibicao: v }))}
                placeholder={perfil?.nome || 'Como aparece nos chats e tickets'}
                hint="Como você aparece nos chats e tarefas. Vazio = usa o nome cadastrado."
              />

              <Field
                label="Telefone / Ramal"
                icon={<Phone size={11}/>}
                value={form.tel_contato}
                onChange={v => setForm(f => ({ ...f, tel_contato: v }))}
                placeholder="(84) 9 9999-9999"
                type="tel"
              />

              <Field
                label="Bio / Especialidade"
                icon={<FileText size={11}/>}
                value={form.bio}
                onChange={v => setForm(f => ({ ...f, bio: v }))}
                placeholder="Especialidade, turno, setor…"
                rows={3}
              />

              <button type="button" onClick={handleSave} disabled={saving}
                style={{
                  width: '100%', padding: 13, borderRadius: 12,
                  background: `linear-gradient(135deg,${T.green},#008b87)`,
                  color: '#022a35', border: 'none',
                  fontSize: '.92rem', fontWeight: 800,
                  cursor: saving ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 14px rgba(0,200,150,.25)',
                  opacity: saving ? .65 : 1, marginTop: 4,
                  touchAction: 'manipulation',
                }}>
                {saving
                  ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }}/> Salvando…</>
                  : <><Save size={15}/> Salvar alterações</>}
              </button>
            </div>

            {/* ── Card senha ── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .1s ease both',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '.85rem', fontWeight: 700, color: T.text,
                marginBottom: showSenhaPanel ? 14 : 0,
                paddingBottom: showSenhaPanel ? 10 : 0,
                borderBottom: showSenhaPanel ? '1px solid rgba(255,255,255,.06)' : 'none',
                transition: 'border-color .2s, padding .2s, margin .2s',
              }}>
                <Lock size={15} color={T.green}/> Segurança
              </div>

              {!showSenhaPanel ? (
                <button type="button" onClick={() => setShowSenhaPanel(true)}
                  style={{
                    width: '100%', padding: 13, borderRadius: 12,
                    background: 'rgba(0,200,150,.08)',
                    border: '1px solid rgba(0,200,150,.25)',
                    color: T.green,
                    fontSize: '.9rem', fontWeight: 700,
                    cursor: 'pointer', marginTop: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    touchAction: 'manipulation',
                  }}>
                  <Lock size={14}/> Alterar minha senha
                </button>
              ) : (
                <>
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="Nova senha (mín. 4 caracteres)"
                      value={senhaForm.nova}
                      onChange={e => setSenhaForm(f => ({ ...f, nova: e.target.value }))}
                      autoComplete="new-password"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '13px 48px 13px 14px',
                        fontSize: '.95rem', borderRadius: 12,
                        background: 'rgba(0,0,0,.3)',
                        border: '1px solid rgba(0,200,150,.18)',
                        color: T.text, outline: 'none', fontFamily: 'inherit',
                      }}/>
                    <button type="button" onClick={() => setShowPwd(s => !s)}
                      aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                      style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none', border: 'none',
                        color: 'rgba(0,200,150,.55)',
                        cursor: 'pointer', padding: 6, display: 'flex',
                      }}>
                      {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>

                  <input
                    type="password"
                    placeholder="Confirmar nova senha"
                    value={senhaForm.nova2}
                    onChange={e => setSenhaForm(f => ({ ...f, nova2: e.target.value }))}
                    autoComplete="new-password"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '13px 14px',
                      fontSize: '.95rem', borderRadius: 12,
                      background: 'rgba(0,0,0,.3)',
                      border: '1px solid rgba(0,200,150,.18)',
                      color: T.text, outline: 'none', fontFamily: 'inherit',
                      marginBottom: 12,
                    }}/>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button"
                      onClick={() => { setShowSenhaPanel(false); setSenhaForm({ nova: '', nova2: '' }); }}
                      style={{
                        flex: 1, padding: 12, borderRadius: 12,
                        background: 'none',
                        border: '1px solid rgba(255,255,255,.12)',
                        color: T.muted,
                        fontSize: '.9rem', fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                        touchAction: 'manipulation',
                      }}>
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSenha} disabled={saving}
                      style={{
                        flex: 2, padding: 12, borderRadius: 12,
                        background: `linear-gradient(135deg,${T.green},#008b87)`,
                        color: '#022a35', border: 'none',
                        fontSize: '.9rem', fontWeight: 800,
                        cursor: saving ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: saving ? .65 : 1,
                        touchAction: 'manipulation',
                      }}>
                      {saving
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }}/> Salvando…</>
                        : <><CheckCircle2 size={14}/> Salvar senha</>}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ── Card STATUS custom ───────────────────────────────────── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .12s ease both',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:700, color:T.text, marginBottom:14, paddingBottom:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                <Smile size={15} color={T.green}/> Status
                <span style={{ marginLeft:'auto', fontSize:'.66rem', color:T.muted, fontWeight:500 }}>
                  Aparece pra equipe nos chats
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
                {STATUS_PRESETS.map(p => {
                  const ativo = form.status_emoji === p.emoji && form.status_texto === p.texto;
                  return (
                    <button key={p.texto} type="button" onClick={() => aplicarStatus(p.emoji, p.texto)}
                      style={{
                        padding:'8px 12px', borderRadius:99,
                        background: ativo ? 'rgba(0,200,150,.18)' : 'rgba(255,255,255,.04)',
                        border: ativo ? '1px solid rgba(0,200,150,.5)' : '1px solid rgba(255,255,255,.08)',
                        color: ativo ? T.green : T.text,
                        fontSize:'.82rem', fontWeight:600, cursor:'pointer',
                        fontFamily:'inherit', display:'flex', alignItems:'center', gap:6,
                        touchAction:'manipulation',
                      }}>
                      <span style={{ fontSize:'1rem' }}>{p.emoji}</span> {p.texto}
                    </button>
                  );
                })}
                {(form.status_texto || form.status_emoji) && (
                  <button type="button" onClick={() => aplicarStatus(null, null)}
                    style={{
                      padding:'8px 12px', borderRadius:99,
                      background:'rgba(255,71,87,.08)',
                      border:'1px solid rgba(255,71,87,.2)',
                      color: T.red, fontSize:'.82rem', fontWeight:600, cursor:'pointer',
                      fontFamily:'inherit', display:'flex', alignItems:'center', gap:5,
                    }}>
                    <X size={12}/> Limpar
                  </button>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  type="text" placeholder="✏️"
                  value={form.status_emoji}
                  onChange={e => setForm(f => ({ ...f, status_emoji: e.target.value.slice(0, 4) }))}
                  style={{
                    width: 54, padding:'10px', textAlign:'center',
                    fontSize:'1.1rem', borderRadius:10,
                    background:'rgba(0,0,0,.3)',
                    border:'1px solid rgba(0,200,150,.18)',
                    color:T.text, outline:'none', fontFamily:'inherit',
                  }}/>
                <input
                  type="text" placeholder="Status custom (ex: Em treinamento)"
                  value={form.status_texto}
                  onChange={e => setForm(f => ({ ...f, status_texto: e.target.value.slice(0, 60) }))}
                  onBlur={() => aplicarStatus(form.status_emoji, form.status_texto)}
                  style={{
                    flex:1, padding:'10px 12px', fontSize:'.9rem', borderRadius:10,
                    background:'rgba(0,0,0,.3)',
                    border:'1px solid rgba(0,200,150,.18)',
                    color:T.text, outline:'none', fontFamily:'inherit',
                  }}/>
              </div>
            </div>

            {/* ── Card QUIET HOURS ─────────────────────────────────────── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .14s ease both',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:700, color:T.text, marginBottom:6 }}>
                <Clock size={15} color={T.green}/> Modo silencioso
              </div>
              <div style={{ fontSize:'.72rem', color:T.muted, marginBottom:14, lineHeight:1.4 }}>
                Não recebe push neste intervalo. SLA crítico ainda toca.
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom: form.quiet_horas?.ativo ? 14 : 0 }}>
                <div style={{
                  width:42, height:24, borderRadius:99, padding:2,
                  background: form.quiet_horas?.ativo ? T.green : 'rgba(255,255,255,.1)',
                  transition:'background .2s', flexShrink:0, position:'relative',
                }}>
                  <div style={{
                    width:20, height:20, borderRadius:'50%', background:'#fff',
                    transform: form.quiet_horas?.ativo ? 'translateX(18px)' : 'translateX(0)',
                    transition:'transform .2s',
                  }}/>
                </div>
                <input type="checkbox" checked={!!form.quiet_horas?.ativo}
                  onChange={e => setForm(f => ({ ...f, quiet_horas: { ...f.quiet_horas, ativo: e.target.checked } }))}
                  style={{ display:'none' }}/>
                <span style={{ fontSize:'.88rem', color:T.text }}>
                  {form.quiet_horas?.ativo ? 'Ativado' : 'Desativado'}
                </span>
              </label>
              {form.quiet_horas?.ativo && (
                <>
                  <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                    <div style={{ flex:1 }}>
                      <label style={{ display:'block', fontSize:'.62rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                        Início
                      </label>
                      <input type="time" value={form.quiet_horas.inicio || '22:00'}
                        onChange={e => setForm(f => ({ ...f, quiet_horas: { ...f.quiet_horas, inicio: e.target.value } }))}
                        style={{
                          width:'100%', padding:'10px 12px', fontSize:'.95rem',
                          borderRadius:10, background:'rgba(0,0,0,.3)',
                          border:'1px solid rgba(0,200,150,.18)',
                          color:T.text, outline:'none', fontFamily:'inherit',
                        }}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <label style={{ display:'block', fontSize:'.62rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>
                        Fim
                      </label>
                      <input type="time" value={form.quiet_horas.fim || '07:00'}
                        onChange={e => setForm(f => ({ ...f, quiet_horas: { ...f.quiet_horas, fim: e.target.value } }))}
                        style={{
                          width:'100%', padding:'10px 12px', fontSize:'.95rem',
                          borderRadius:10, background:'rgba(0,0,0,.3)',
                          border:'1px solid rgba(0,200,150,.18)',
                          color:T.text, outline:'none', fontFamily:'inherit',
                        }}/>
                    </div>
                  </div>
                  <label style={{ display:'block', fontSize:'.62rem', fontWeight:700, color:T.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>
                    Aplica nos dias
                  </label>
                  <div style={{ display:'flex', gap:6 }}>
                    {DIAS.map(d => {
                      const ativo = (form.quiet_horas.dias || []).includes(d.id);
                      return (
                        <button key={d.id} type="button"
                          onClick={() => {
                            setForm(f => {
                              const dias = new Set(f.quiet_horas.dias || []);
                              if (dias.has(d.id)) dias.delete(d.id); else dias.add(d.id);
                              return { ...f, quiet_horas: { ...f.quiet_horas, dias: Array.from(dias) } };
                            });
                          }}
                          style={{
                            flex:1, height:36, borderRadius:8,
                            background: ativo ? T.green : 'rgba(255,255,255,.04)',
                            border: ativo ? '1px solid rgba(0,200,150,.6)' : '1px solid rgba(255,255,255,.08)',
                            color: ativo ? '#022a35' : T.muted,
                            fontSize:'.8rem', fontWeight:800, cursor:'pointer',
                            fontFamily:'inherit', touchAction:'manipulation',
                          }}>
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <button type="button" onClick={handleSave} disabled={saving}
                style={{
                  width:'100%', padding:11, marginTop:14, borderRadius:10,
                  background:'rgba(0,200,150,.1)',
                  border:'1px solid rgba(0,200,150,.3)',
                  color: T.green, fontSize:'.85rem', fontWeight:700,
                  cursor: saving ? 'wait' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  fontFamily:'inherit', touchAction:'manipulation', opacity: saving ? .65 : 1,
                }}>
                {saving ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Save size={13}/>}
                {saving ? 'Salvando…' : 'Salvar preferências'}
              </button>
            </div>

            {/* ── Card ASSINATURA + COR ────────────────────────────────── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .16s ease both',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:700, color:T.text, marginBottom:14, paddingBottom:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                <MessageSquare size={15} color={T.green}/> Identidade no chat
              </div>
              <Field
                label="Assinatura nas mensagens"
                value={form.assinatura_chat}
                onChange={v => setForm(f => ({ ...f, assinatura_chat: v.slice(0, 200) }))}
                placeholder="— João · Suporte CITmax 📡"
                hint="Anexada no fim de cada mensagem que você envia ao cliente. Máx 200 caracteres."
                rows={2}
              />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.7rem', fontWeight:700, color:'rgba(0,200,150,.72)', letterSpacing:'.07em', textTransform:'uppercase', marginBottom:6 }}>
                  <Palette size={11}/> Cor de destaque
                </label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {CORES_DESTAQUE.map(c => {
                    const ativo = form.cor_destaque === c;
                    return (
                      <button key={c} type="button"
                        onClick={() => setForm(f => ({ ...f, cor_destaque: ativo ? '' : c }))}
                        aria-label={`Cor ${c}`}
                        style={{
                          width: 36, height: 36, borderRadius:'50%',
                          background: c,
                          border: ativo ? '3px solid #fff' : '3px solid transparent',
                          boxShadow: ativo ? `0 0 0 2px ${c}, 0 0 12px ${c}80` : 'none',
                          cursor:'pointer', padding:0, touchAction:'manipulation',
                          transition: 'all .15s',
                        }}/>
                    );
                  })}
                  {form.cor_destaque && (
                    <button type="button" onClick={() => setForm(f => ({ ...f, cor_destaque: '' }))}
                      title="Remover cor"
                      style={{
                        width: 36, height: 36, borderRadius:'50%',
                        background:'rgba(255,255,255,.04)',
                        border:'1px dashed rgba(255,255,255,.2)',
                        color: T.muted, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>
                      <X size={14}/>
                    </button>
                  )}
                </div>
                <div style={{ fontSize:'.65rem', color:T.muted, marginTop:6 }}>
                  Aparece no balão das suas mensagens.
                </div>
              </div>
              <button type="button" onClick={handleSave} disabled={saving}
                style={{
                  width:'100%', padding:11, borderRadius:10,
                  background:'rgba(0,200,150,.1)',
                  border:'1px solid rgba(0,200,150,.3)',
                  color: T.green, fontSize:'.85rem', fontWeight:700,
                  cursor: saving ? 'wait' : 'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  fontFamily:'inherit', touchAction:'manipulation', opacity: saving ? .65 : 1,
                }}>
                {saving ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Save size={13}/>}
                {saving ? 'Salvando…' : 'Salvar identidade'}
              </button>
            </div>

            {/* ── Card TEMPLATES PESSOAIS ──────────────────────────────── */}
            <div style={{
              background: 'rgba(8,30,22,.6)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .18s ease both',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:700, color:T.text, marginBottom:6 }}>
                <FileText size={15} color={T.green}/> Minhas respostas rápidas
              </div>
              <div style={{ fontSize:'.72rem', color:T.muted, marginBottom:14, lineHeight:1.4 }}>
                Atalhos privados — só você usa. Ex: <code style={{ background:'rgba(255,255,255,.06)', padding:'1px 5px', borderRadius:4 }}>/oi</code> abre a saudação.
              </div>

              {templates.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
                  {templates.map(t => (
                    <div key={t.id} style={{
                      padding: 10, borderRadius: 10,
                      background:'rgba(0,0,0,.2)',
                      border:'1px solid rgba(255,255,255,.05)',
                      display:'flex', alignItems:'flex-start', gap:8,
                    }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <code style={{
                          fontSize:'.74rem', fontWeight:700,
                          color: T.green, fontFamily:"'JetBrains Mono',monospace",
                        }}>{t.atalho}</code>
                        <div style={{ fontSize:'.78rem', color:T.text, marginTop:4, lineHeight:1.4, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                          {t.conteudo}
                        </div>
                      </div>
                      <button type="button" onClick={() => removerTemplate(t.id)}
                        aria-label="Remover"
                        style={{
                          width:30, height:30, borderRadius:8,
                          background:'rgba(255,71,87,.08)',
                          border:'1px solid rgba(255,71,87,.18)',
                          color: T.red, cursor:'pointer', flexShrink:0,
                          display:'flex', alignItems:'center', justifyContent:'center',
                        }}>
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form criar */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <input
                  type="text" placeholder="/atalho"
                  value={novoTpl.atalho}
                  onChange={e => setNovoTpl(t => ({ ...t, atalho: e.target.value }))}
                  style={{
                    padding:'10px 12px', fontSize:'.88rem', borderRadius:10,
                    background:'rgba(0,0,0,.3)',
                    border:'1px solid rgba(0,200,150,.18)',
                    color:T.text, outline:'none',
                    fontFamily:"'JetBrains Mono',monospace",
                  }}/>
                <textarea
                  placeholder="Texto que vai aparecer ao usar o atalho…"
                  value={novoTpl.conteudo}
                  onChange={e => setNovoTpl(t => ({ ...t, conteudo: e.target.value }))}
                  rows={3}
                  style={{
                    padding:'10px 12px', fontSize:'.88rem', borderRadius:10,
                    background:'rgba(0,0,0,.3)',
                    border:'1px solid rgba(0,200,150,.18)',
                    color:T.text, outline:'none', fontFamily:'inherit',
                    resize:'vertical', minHeight:70,
                  }}/>
                <button type="button" onClick={criarTemplate} disabled={salvandoTpl || !novoTpl.atalho || !novoTpl.conteudo}
                  style={{
                    padding:11, borderRadius:10,
                    background:'rgba(0,200,150,.12)',
                    border:'1px solid rgba(0,200,150,.3)',
                    color: T.green, fontSize:'.85rem', fontWeight:700,
                    cursor: salvandoTpl ? 'wait' : 'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                    fontFamily:'inherit', touchAction:'manipulation',
                    opacity: (salvandoTpl || !novoTpl.atalho || !novoTpl.conteudo) ? .55 : 1,
                  }}>
                  {salvandoTpl ? <Loader2 size={13} style={{ animation:'spin 1s linear infinite' }}/> : <Plus size={13}/>}
                  Adicionar template
                </button>
              </div>
            </div>

            {/* ── Card MEU DASHBOARD ───────────────────────────────────── */}
            {metricas && (
              <div style={{
                background: 'rgba(8,30,22,.6)',
                border: `1px solid ${T.bord}`,
                borderRadius: 16, padding: 18,
                animation: 'fadeIn .4s .2s ease both',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:700, color:T.text, marginBottom:14, paddingBottom:10, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                  <BarChart3 size={15} color={T.green}/> Como ando
                  <span style={{ marginLeft:'auto', fontSize:'.66rem', color:T.muted, fontWeight:500 }}>
                    Suas métricas
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
                  <KpiCard label="OS hoje" value={metricas.os?.os_hoje ?? 0} hint="concluídas"/>
                  <KpiCard label="OS 7 dias" value={metricas.os?.os_7d ?? 0} hint="concluídas"/>
                  <KpiCard label="Em aberto" value={metricas.os?.os_em_aberto ?? 0} hint="ativas agora" warn={metricas.os?.os_em_aberto > 5}/>
                  <KpiCard label="Tickets 7d" value={metricas.tickets?.tickets_7d ?? 0} hint="resolvidos"/>
                  <KpiCard label="Conversas 7d" value={metricas.conversas?.conv_7d ?? 0} hint="atendidas"/>
                  <KpiCard
                    label="NPS médio"
                    value={metricas.nps?.nps_medio ? Number(metricas.nps.nps_medio).toFixed(1) : '—'}
                    hint={`${metricas.nps?.nps_total || 0} avaliações`}
                    accent={metricas.nps?.nps_medio >= 8 ? T.green : metricas.nps?.nps_medio >= 5 ? '#facc15' : null}
                  />
                </div>
              </div>
            )}

            {/* ── Card dados do sistema (read-only) ── */}
            <div style={{
              background: 'rgba(8,30,22,.4)',
              border: `1px solid ${T.bord}`,
              borderRadius: 16, padding: 18,
              animation: 'fadeIn .4s .15s ease both',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '.85rem', fontWeight: 700, color: T.text,
                marginBottom: 6,
              }}>
                <ShieldCheck size={15} color={T.muted}/> Dados do sistema
              </div>
              <div style={{ fontSize: '.72rem', color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
                Só o admin pode alterar.
              </div>

              <Field
                label="Login"
                icon={<AtSign size={10}/>}
                value={perfil?.login || ''}
                readOnly
                hint="Identifica você no sistema."
              />
              <Field
                label="Nome completo"
                value={perfil?.nome || ''}
                readOnly
              />
              <Field
                label="WhatsApp cadastrado"
                value={perfil?.whatsapp || '—'}
                readOnly
                hint="Usado pra envio de OTP de recuperação de senha."
              />
            </div>

            {/* Botão sair (último, separado, vermelho) */}
            {onLogout && (
              <button type="button" onClick={onLogout}
                style={{
                  width: '100%', padding: 14, borderRadius: 12,
                  background: 'rgba(255,71,87,.08)',
                  border: '1px solid rgba(255,71,87,.25)',
                  color: T.red, fontSize: '.9rem', fontWeight: 700,
                  cursor: 'pointer', marginTop: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: 'inherit',
                  touchAction: 'manipulation',
                }}>
                <LogOut size={15}/> Sair da conta
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { PerfilScreen };
