import React, { useState, useEffect, useRef } from 'react';
import {
  LogIn, KeyRound, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle2, Send, ShieldCheck,
} from 'lucide-react';
import { T, LS_TOKEN, LS_USER, api } from './shared';

/* ── Taglines rotativas — técnico em campo ────────────────────────────────── */
const TAGLINES = [
  '🔧 Ordens de serviço em campo',
  '📡 Sinal e diagnóstico FTTH',
  '🗺️ Rotas otimizadas e GPS',
  '📸 Fotos e check-in instantâneo',
  '⚡ Portal do Técnico · Pinheiro OS',
];

/* ── Tokens de auth — alinhado ao /admin e /corretora ─────────────────────── */
const AUTH_CARD = {
  background: '#ffffff',
  border: `1px solid ${T.bord}`,
  borderRadius: 20,
  padding: '28px 22px',
  boxShadow: '0 4px 24px rgba(0,0,0,.08),0 1px 4px rgba(0,0,0,.04)',
  textAlign: 'left',
};
const AUTH_LABEL = {
  display: 'block', fontSize: '.7rem', fontWeight: 700,
  color: T.green, textTransform: 'uppercase',
  letterSpacing: '.08em', marginBottom: 7,
};
const AUTH_INPUT = {
  width: '100%', padding: '13px 15px', fontSize: '.95rem', borderRadius: 12,
  background: 'rgba(22,163,74,.04)', border: `1px solid ${T.bord}`,
  color: T.text, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color .15s, background .15s', boxSizing: 'border-box',
};
const AUTH_BTN_PRIMARY = {
  width: '100%', padding: '14px', borderRadius: 12,
  background: `linear-gradient(135deg,${T.green},#15803d)`,
  color: '#ffffff', border: 'none',
  fontSize: '.95rem', fontWeight: 800, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontFamily: 'inherit', letterSpacing: '.02em',
  boxShadow: `0 4px 16px rgba(22,163,74,.3)`,
};
const AUTH_BTN_GHOST = {
  width: '100%', padding: '11px', borderRadius: 12,
  background: 'none', border: `1px solid ${T.bord}`,
  color: T.green, fontSize: '.82rem',
  cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  transition: 'all .2s',
};

/* ── Clock real-time ──────────────────────────────────────────────────────── */
function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.7rem',
      color: T.muted, letterSpacing: '.06em', marginBottom: 22 }}>
      {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}
      {' · '}
      {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}

/* ── AuthShell: logo + glow + taglines + clock ────────────────────────────── */
function AuthShell({ children }) {
  const [tagIdx, setTagIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTagIdx(i => (i + 1) % TAGLINES.length), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 'max(20px, env(safe-area-inset-top))',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
      paddingLeft: 14, paddingRight: 14,
      position: 'relative',
      background: `linear-gradient(170deg, #F6FAF6 0%, #EDF5ED 100%)`,
      fontFamily: "'DM Sans','Outfit',system-ui,sans-serif",
    }}>
      {/* Background orbs (fixed) */}
      <div aria-hidden style={{ position: 'fixed', top: '-15%', left: '-10%', width: 360, height: 360,
        background: 'radial-gradient(circle, rgba(22,163,74,.08) 0%, transparent 60%)',
        pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0 }}/>
      <div aria-hidden style={{ position: 'fixed', bottom: '-15%', right: '-10%', width: 420, height: 420,
        background: 'radial-gradient(circle, rgba(22,163,74,.05) 0%, transparent 60%)',
        pointerEvents: 'none', filter: 'blur(40px)', zIndex: 0 }}/>

      <div style={{
        width: '100%', maxWidth: 400, textAlign: 'center',
        animation: 'tec-fadeInUp .5s ease', position: 'relative', zIndex: 1,
        marginTop: 'auto', marginBottom: 'auto',
      }}>
        {/* Logo Pinheiro OS + glow */}
        <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
          <div aria-hidden style={{
            position: 'absolute', inset: -22,
            background: 'radial-gradient(ellipse,rgba(22,163,74,.15) 0%,transparent 70%)',
            animation: 'tec-glow 3s ease-in-out infinite',
            borderRadius: '50%', pointerEvents: 'none',
          }}/>
          <img src="/pinheiro-logo.svg" alt="Pinheiro OS"
            onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block'; }}
            style={{ width: '70%', maxWidth: 280, minWidth: 150,
              position: 'relative',
              filter: 'drop-shadow(0 4px 16px rgba(22,163,74,.25))' }}/>
          <div style={{ display: 'none', fontFamily: "'Outfit',system-ui", fontWeight: 900,
            fontSize: '2rem', color: T.green, letterSpacing: '-.02em' }}>
            PINHEIRO OS
          </div>
        </div>

        {/* Tagline rotativa */}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '.7rem',
          color: T.green, letterSpacing: '.1em', textTransform: 'uppercase',
          marginBottom: 6, minHeight: '1.2em' }}>
          {TAGLINES[tagIdx]}
        </div>

        <Clock />

        {children}

        <div style={{ marginTop: 14, fontSize: '.66rem', color: T.muted,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.06em' }}>
          Portal do Técnico · Pinheiro OS
        </div>
      </div>

      <style>{`
        @keyframes tec-glow{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.15);opacity:1}}
        @keyframes tec-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}
        @keyframes tec-fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
        @keyframes tec-spin{to{transform:rotate(360deg)}}
        .tec-spinner{width:14px;height:14px;border:2px solid rgba(22,163,74,.25);border-top-color:#16A34A;border-radius:50%;animation:tec-spin .6s linear infinite}
        .tec-input:focus{border-color:#16A34A!important;background:rgba(22,163,74,.08)!important}
        .tec-press{transition:transform .12s ease}
        .tec-press:active{transform:scale(.97)}
      `}</style>
    </div>
  );
}

/* ── LOGIN ────────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [shake, setShake] = useState(false);
  const [recuperar, setRecuperar] = useState(false);
  const senhaRef = useRef(null);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  const submit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !senha.trim()) {
      setErro('Preencha login e senha.'); triggerShake(); return;
    }
    setErro(''); setLoading(true);
    try {
      const r = await api('/api/agentes/login', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim(), senha: senha.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login inválido');
      localStorage.setItem(LS_TOKEN, d.token);
      localStorage.setItem(LS_USER, JSON.stringify({
        id: d.id, nome: d.nome, avatar: d.avatar, avatar_url: d.avatar_url || null, role: d.role,
      }));
      localStorage.setItem('pinheiro_id',   d.id   || '');
      localStorage.setItem('pinheiro_nome', d.nome || '');
      localStorage.setItem('pinheiro_role', d.role || 'tecnico');
      onLogin(d);
    } catch (e) {
      setErro(e.message); triggerShake();
    }
    setLoading(false);
  };

  if (recuperar) return <Recuperar onVoltar={() => setRecuperar(false)} loginInicial={login} />;

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate
        style={{ ...AUTH_CARD, animation: shake ? 'tec-shake .4s ease' : 'none' }}>
        <div style={{ marginBottom: 14 }}>
          <label style={AUTH_LABEL}>Login</label>
          <input className="tec-input" type="text" placeholder="seu.login"
            value={login} onChange={e => setLogin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && senhaRef.current?.focus()}
            autoComplete="username" autoCapitalize="none" autoCorrect="off"
            aria-label="Login do técnico" style={AUTH_INPUT}/>
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={AUTH_LABEL}>Senha</label>
          <div style={{ position: 'relative' }}>
            <input ref={senhaRef} className="tec-input"
              type={showPwd ? 'text' : 'password'} placeholder="••••••••"
              value={senha} onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
              aria-label="Senha"
              style={{ ...AUTH_INPUT, paddingRight: 48 }}/>
            <button type="button" onClick={() => setShowPwd(s => !s)}
              aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.green, padding: 6, display: 'flex' }}>
              {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className="tec-press"
          style={{ ...AUTH_BTN_PRIMARY, opacity: loading ? .65 : 1 }}>
          {loading
            ? <><span className="tec-spinner"/> Entrando…</>
            : <><LogIn size={16}/> Entrar</>}
        </button>

        {erro && (
          <p role="alert" style={{ marginTop: 12, fontSize: '.82rem', color: T.red,
            fontFamily: "'JetBrains Mono',monospace", display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚠ {erro}
          </p>
        )}

        <button type="button" onClick={() => setRecuperar(true)} className="tec-press"
          style={{ ...AUTH_BTN_GHOST, marginTop: 14 }}>
          <KeyRound size={14}/> Esqueci minha senha
        </button>
      </form>
    </AuthShell>
  );
}

/* ── RECUPERAR SENHA — OTP via WhatsApp ───────────────────────────────────── */
function Recuperar({ onVoltar, loginInicial = '' }) {
  const [passo, setPasso] = useState(1); // 1=login, 2=otp+senha, 3=sucesso
  const [login, setLogin] = useState(loginInicial);
  const [otp, setOtp] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [novaSenha2, setNovaSenha2] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const apiBase = window.location.origin;

  const solicitar = async (e) => {
    e.preventDefault();
    if (!login.trim()) return setMsg({ texto: 'Digite seu login.', isErro: true });
    setMsg(null); setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/recovery/request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao solicitar');
      setMsg({ texto: d.msg || 'Se o usuário existir, um código será enviado via WhatsApp.', isErro: false });
      setPasso(2);
    } catch (e) { setMsg({ texto: e.message, isErro: true }); }
    setLoading(false);
  };

  const resetar = async (e) => {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) return setMsg({ texto: 'Código de 6 dígitos.', isErro: true });
    if (novaSenha !== novaSenha2) return setMsg({ texto: 'As senhas não conferem.', isErro: true });
    if (novaSenha.length < 8) return setMsg({ texto: 'Senha mínima 8 caracteres.', isErro: true });
    if (!/[A-Za-z]/.test(novaSenha) || !/[0-9]/.test(novaSenha))
      return setMsg({ texto: 'A senha deve conter letras e números.', isErro: true });
    setMsg(null); setLoading(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/recovery/reset`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), otp: otp.trim(), novaSenha }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Falha ao redefinir');
      setPasso(3);
      setTimeout(onVoltar, 2500);
    } catch (e) { setMsg({ texto: e.message, isErro: true }); }
    setLoading(false);
  };

  // STEP 3 — sucesso
  if (passo === 3) {
    return (
      <AuthShell>
        <div style={{ ...AUTH_CARD, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: '50%',
            background: '#DCFCE7', border: `1px solid ${T.green}`,
            alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            color: T.green, animation: 'tec-fadeInUp .5s ease' }}>
            <CheckCircle2 size={32}/>
          </div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8, color: T.green }}>
            Senha atualizada!
          </div>
          <p style={{ color: T.text, fontSize: '.85rem', lineHeight: 1.6, margin: 0 }}>
            Pronto, sua senha foi redefinida. Voltando para o login…
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div style={AUTH_CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ display: 'inline-flex', width: 38, height: 38, borderRadius: 10,
            background: '#DCFCE7', border: `1px solid ${T.bord}`,
            alignItems: 'center', justifyContent: 'center', color: T.green }}>
            <ShieldCheck size={18}/>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: T.text }}>Recuperar senha</div>
            <div style={{ fontSize: '.72rem', color: T.muted, marginTop: 2 }}>
              Você receberá o código por WhatsApp
            </div>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[1, 2].map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 2,
              background: passo >= n ? T.green : T.bord,
              transition: 'background .3s' }}/>
          ))}
        </div>

        {passo === 1 && (
          <form onSubmit={solicitar}>
            <div style={{ marginBottom: 14 }}>
              <label style={AUTH_LABEL}>Seu login</label>
              <input className="tec-input" type="text" placeholder="seu.login"
                value={login} onChange={e => setLogin(e.target.value)}
                autoComplete="username" autoCapitalize="none" autoCorrect="off"
                style={AUTH_INPUT} autoFocus/>
            </div>

            <button type="submit" disabled={loading || !login.trim()} className="tec-press"
              style={{ ...AUTH_BTN_PRIMARY, opacity: (loading || !login.trim()) ? .65 : 1 }}>
              {loading
                ? <><span className="tec-spinner"/> Enviando…</>
                : <><Send size={15}/> Receber código no WhatsApp</>}
            </button>

            {msg && (
              <p role="alert" style={{ marginTop: 12, fontSize: '.82rem',
                color: msg.isErro ? T.red : T.green,
                fontFamily: "'JetBrains Mono',monospace" }}>
                {msg.isErro ? '⚠ ' : 'ℹ '} {msg.texto}
              </p>
            )}

            <button type="button" onClick={onVoltar} className="tec-press"
              style={{ ...AUTH_BTN_GHOST, marginTop: 12 }}>
              <ArrowLeft size={14}/> Voltar para o login
            </button>
          </form>
        )}

        {passo === 2 && (
          <form onSubmit={resetar}>
            <div style={{ marginBottom: 14 }}>
              <label style={AUTH_LABEL}>Código (6 dígitos)</label>
              <input className="tec-input" inputMode="numeric" pattern="[0-9]*"
                placeholder="000000" maxLength={6}
                value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...AUTH_INPUT, letterSpacing: '.3em', fontSize: '1.4rem',
                  textAlign: 'center', fontFamily: "'JetBrains Mono',monospace" }}
                autoFocus/>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={AUTH_LABEL}>Nova senha (mín. 8 c/ letras e números)</label>
              <div style={{ position: 'relative' }}>
                <input className="tec-input" type={showNova ? 'text' : 'password'}
                  placeholder="••••••••" value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  autoComplete="new-password"
                  style={{ ...AUTH_INPUT, paddingRight: 48 }}/>
                <button type="button" onClick={() => setShowNova(s => !s)}
                  aria-label={showNova ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: T.green, padding: 6, display: 'flex' }}>
                  {showNova ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={AUTH_LABEL}>Confirmar senha</label>
              <input className="tec-input" type="password" placeholder="••••••••"
                value={novaSenha2} onChange={e => setNovaSenha2(e.target.value)}
                autoComplete="new-password" style={AUTH_INPUT}/>
            </div>

            {msg && (
              <p role="alert" style={{ marginTop: 0, marginBottom: 12, fontSize: '.82rem',
                color: msg.isErro ? T.red : T.green,
                fontFamily: "'JetBrains Mono',monospace" }}>
                {msg.isErro ? '⚠ ' : '✓ '} {msg.texto}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setPasso(1); setMsg(null); setOtp(''); }}
                className="tec-press"
                style={{ ...AUTH_BTN_GHOST, flex: 1, padding: 13 }}>
                <ArrowLeft size={14}/> Voltar
              </button>
              <button type="submit" disabled={loading || otp.length !== 6} className="tec-press"
                style={{ ...AUTH_BTN_PRIMARY, flex: 2, opacity: (loading || otp.length !== 6) ? .65 : 1 }}>
                {loading
                  ? <><span className="tec-spinner"/> Salvando…</>
                  : <><CheckCircle2 size={15}/> Redefinir senha</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export { LoginScreen };
