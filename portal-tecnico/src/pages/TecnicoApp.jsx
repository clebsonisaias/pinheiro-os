import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Ctx, useTec } from './tecnico/TecnicoContext';
// OndaOS não usa TicketsScreen do Maxxi — usa OSScreen própria
// import { TicketsScreen, DetalheTicket } from '../components/TecnicoTickets';
import {
  T, LS_TOKEN, LS_USER,
  api, apiJson, isHoje, atualizarBadge, solicitarPermissoes,
} from './tecnico/shared';
import { Toast } from './tecnico/SharedComponents';
import { Home, FileText, MessageCircle, Radio, Car, Bell, LogOut, WifiOff, Download, Smartphone, X, Zap, Wifi, Share2, Package, Wrench, Droplets } from 'lucide-react';
import { gsap } from 'gsap';
import { LoginScreen } from './tecnico/LoginScreen';
import { HomeScreen }   from './tecnico/HomeScreen';
import { HistoricoScreen } from './tecnico/HistoricoScreen';
import { OSScreen }     from './tecnico/OSScreen';
import { EstoqueScreen } from './tecnico/EstoqueScreen';
import { InstalacoesScreen } from './tecnico/InstalacoesScreen';
import { OCScreen }     from './tecnico/OCScreen';
// Chat interno — a implementar na fase 2 do OndaOS
// import Chat from './Chat';
import { DetalheOS }    from './tecnico/DetalheOS';
import { DetalheOC }    from './tecnico/DetalheOC';
import { FttxScreen }   from './tecnico/FttxScreen';
import { PerfilScreen } from './tecnico/PerfilScreen';
import { VeiculoModal, VeiculoSheet } from './tecnico/VeiculoModal';
import { AbastecimentoScreen } from './tecnico/AbastecimentoScreen';
import { startAutoDrain, drain as drainQueue, onQueueChange, countPending } from './tecnico/offlineQueue';
import { useTecnicoRealtime, tocarDingDong, vibrar, piscarTitle } from './tecnico/useTecnicoRealtime';

// ── PWA Install Prompt ───────────────────────────────────────────────────────
const INSTALL_KEY = 'pwa_install_dismissed_at';
const INSTALL_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 dias

function useInstallPrompt() {
  const [deferred, setDeferred]   = useState(null);
  const [visible,  setVisible]    = useState(false);
  const [installed, setInstalled] = useState(false);

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    !!window.navigator.standalone ||
    document.referrer.startsWith('android-app://');

  const isIOS  = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const canShow = () => {
    if (isStandalone() || installed) return false;
    const t = parseInt(localStorage.getItem(INSTALL_KEY) || '0');
    return Date.now() - t > INSTALL_COOLDOWN;
  };

  useEffect(() => {
    if (isStandalone()) return;

    // Chrome / Edge / Android
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      if (canShow()) setTimeout(() => setVisible(true), 18000);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS Safari — sem beforeinstallprompt, instrução manual
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari && canShow()) {
      setTimeout(() => setVisible(true), 18000);
    }

    const onInstalled = () => {
      setVisible(false);
      setInstalled(true);
      localStorage.setItem(INSTALL_KEY, String(Date.now() + INSTALL_COOLDOWN * 52));
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    if (outcome === 'accepted') {
      localStorage.setItem(INSTALL_KEY, String(Date.now() + INSTALL_COOLDOWN * 52));
    }
  };

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(INSTALL_KEY, String(Date.now()));
  };

  return { visible, install, dismiss, isIOS, hasPrompt: !!deferred };
}

function InstallBanner({ visible, install, dismiss, isIOS, hasPrompt }) {
  if (!visible) return null;

  const benefits = [
    { Icon: Zap,        text: 'Acesso instantâneo — abre sem esperar' },
    { Icon: Bell,       text: 'Notificações de novos tickets em tempo real' },
    { Icon: Wifi,       text: 'Funciona mesmo com sinal fraco' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div onClick={dismiss} style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:900,
        animation:'fadeIn .2s ease',
      }} />

      {/* Bottom sheet */}
      <div role="dialog" aria-modal="true" aria-label="Instalar aplicativo"
        style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:901,
          background:'#F6FAF6',
          borderTop:'1px solid rgba(0,200,150,.18)',
          borderRadius:'20px 20px 0 0',
          padding:`24px 22px calc(22px + env(safe-area-inset-bottom))`,
          boxShadow:'0 -8px 40px rgba(0,0,0,.6)',
          animation:'slideUp .28s cubic-bezier(.4,0,.2,1)',
        }}>

        {/* Handle */}
        <div style={{ width:40, height:4, background:'rgba(0,0,0,.12)', borderRadius:2, margin:'0 auto 20px' }} />

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
          <div style={{
            width:54, height:54, borderRadius:14,
            background:'linear-gradient(135deg,#16A34A,#15803D)',
            display:'flex', alignItems:'center', justifyContent:'center',
            flexShrink:0,
          }}>
            <Smartphone size={26} color="#fff" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:900, fontSize:'1.1rem', color:'#0D1F0D', lineHeight:1.2 }}>
              Pinheiro OS
            </div>
            <div style={{ fontSize:'.78rem', color:'#6B7280', marginTop:2 }}>
              Adicionar à tela de início
            </div>
          </div>
          <button onClick={dismiss} aria-label="Fechar"
            style={{ width:34, height:34, borderRadius:10, border:'1px solid #DDE8DD', background:'#F6FAF6', color:'#6B7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, touchAction:'manipulation' }}>
            <X size={16} />
          </button>
        </div>

        {/* Benefícios */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:22 }}>
          {benefits.map(({ Icon, text }, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'#DCFCE7', border:'1px solid #BBF7D0', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Icon size={15} color="#16A34A" />
              </div>
              <span style={{ fontSize:'.85rem', color:'#374151', lineHeight:1.3 }}>{text}</span>
            </div>
          ))}
        </div>

        {/* Ações */}
        {isIOS && !hasPrompt ? (
          // iOS Safari: instrução manual
          <div style={{
            background:'#F0FDF4', border:'1px solid #BBF7D0',
            borderRadius:12, padding:'14px 16px',
          }}>
            <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em' }}>
              Como instalar no iPhone / iPad
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:'.88rem', color:'#374151' }}>
              <Share2 size={18} color="#16A34A" style={{ flexShrink:0 }} />
              <span>Toque em <strong style={{ color:'#16A34A' }}>Compartilhar</strong> → <strong style={{ color:'#16A34A' }}>Adicionar à Tela de Início</strong></span>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={dismiss} style={{
              flex:'0 0 auto', padding:'13px 18px', borderRadius:12,
              border:'1px solid #DDE8DD', background:'#F6FAF6',
              color:'#6B7280', fontSize:'.88rem', fontWeight:600,
              cursor:'pointer', touchAction:'manipulation',
            }}>
              Agora não
            </button>
            <button onClick={install} style={{
              flex:1, padding:'13px 0', borderRadius:12, border:'none',
              background:'#16A34A', color:'#fff', fontSize:'.95rem', fontWeight:800,
              cursor:'pointer', touchAction:'manipulation',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              boxShadow:'0 4px 20px rgba(0,200,150,.35)',
            }}>
              <Download size={17} />
              Instalar app
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity:0; } to { transform: translateY(0); opacity:1; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}

function TecnicoProvider({ user, onLogout, children }) {
  const [osList,        setOsList]        = useState([]);
  const [ocList,        setOcList]        = useState([]);
  const [resumo,        setResumo]        = useState(null);
  const [ticketsCount,  setTicketsCount]  = useState(0);
  const [myPos,   setMyPos]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const toastT = useRef(null);

  // Heartbeat — manda visibilityState pra backend distinguir tempo ativo de
  // tempo em foco. Quando técnico fecha o app, sendBeacon avisa logout.
  // Importante: status `background` (sem heartbeat ≥15min mas com push sub
  // ativa) é definido pelo cron — push continua chegando mesmo sem heartbeat.
  useEffect(() => {
    if (!user?.id) return;
    const hb = () => api('/api/agentes/monitor/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ visible: !document.hidden }),
    }).catch(() => {});
    const onLogout = () => {
      const token = localStorage.getItem('pinheiro_token') || '';
      navigator.sendBeacon?.(
        window.location.origin + '/admin/api/agentes/monitor/logout-beacon?token=' + encodeURIComponent(token),
        ''
      );
    };
    const onVisibility = () => { if (!document.hidden) hb(); };
    hb();
    const t = setInterval(hb, 30000);
    window.addEventListener('beforeunload', onLogout);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', onLogout);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  const showToast = useCallback((msg, err=false) => {
    if (toastT.current) clearTimeout(toastT.current);
    setToast({ msg, err });
    toastT.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [osData, ocData, resData, tkData] = await Promise.all([
        apiJson(`/api/tecnico/os?tecnico_id=${user.id}`).catch(() => []),
        apiJson(`/api/ocorrencias?responsavel_id=${user.id}&status=aberta,em_andamento&limit=50`).catch(() => ({ rows:[] })),
        apiJson(`/api/tecnico/resumo?tecnico_id=${user.id}`).catch(() => ({})),
        apiJson(`/api/tecnico/tickets?todos=0`).catch(() => ({ tickets: [] })),
      ]);
      setOsList(Array.isArray(osData) ? osData : []);
      setOcList(Array.isArray(ocData) ? ocData : (ocData?.rows || []));
      setResumo(resData);
      setTicketsCount((tkData?.tickets || []).length);
    } catch {}
    setLoading(false);
  }, [user]);

  // GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMyPos({ lat, lng });
        api('/api/tecnico/posicao',{ method:'POST', body:JSON.stringify({ lat, lng }) }).catch(()=>{});
      },
      ()=>{}, { enableHighAccuracy:true, maximumAge:10000, timeout:15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => { if (user) solicitarPermissoes(user); }, [user]);

  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const osMap     = useMemo(() => new Map(osList.map(o=>[o.id,o])), [osList]);
  const osAtivas  = useMemo(() => osList.filter(o=>!['concluida','cancelada'].includes(o.status)), [osList]);
  const osHoje    = useMemo(() => osAtivas.filter(o=>isHoje(o.agendado_para)), [osAtivas]);
  const instalacoesPendentes = useMemo(
    () => osAtivas.filter(o => {
      if (o.tipo === 'instalacao') return true;
      const h = [o.oc_titulo, o.sgp_motivo, o.oc_tipo, o.ticket_categoria, o.ticket_tipo].filter(Boolean).join(' | ');
      return /instala[çc][ãa]o/i.test(h);
    }).length,
    [osAtivas]
  );
  const proximaOS = useMemo(() => [...osAtivas].sort((a,b)=>new Date(a.agendado_para||9e15)-new Date(b.agendado_para||9e15))[0]||null, [osAtivas]);

  useEffect(() => { atualizarBadge(osAtivas.length); }, [osAtivas.length]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [reload]);

  // Recarrega imediatamente quando SW avisa de novo ticket (push recebido)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (e) => { if (e.data?.type === 'SW_NOVO_TICKET') reload(); };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [reload]);

  const atualizar = useCallback(async (osId, status, extra={}) => {
    try {
      const body = { status, ...extra };
      if (myPos) { body.lat = myPos.lat; body.lng = myPos.lng; }
      const r = await api(`/api/tecnico/os/${osId}/status`, {
        method: 'PUT',
        body: JSON.stringify(body),
        offlineLabel: `OS #${osId} → ${status}`,
      });
      // 202 = enfileirado offline. Não tenta reload (vai dar erro), mostra
      // toast diferente avisando o tec que vai sincronizar depois.
      if (r.status === 202) {
        const msgsOffline = {
          deslocamento: '🟡 A caminho! (salvo offline — sincroniza quando voltar sinal)',
          execucao:     '🟡 Check-in registrado offline — sincroniza quando voltar sinal',
          concluida:    '🟡 OS encerrada offline — sincroniza quando voltar sinal',
          cancelada:    '🟡 Cancelamento salvo offline — sincroniza quando voltar sinal',
        };
        showToast(msgsOffline[status] || '🟡 Salvo offline');
        return true;
      }
      await reload();
      const msgs = { deslocamento:'🚗 A caminho!', execucao:'📍 Cheguei!', concluida:'✅ OS concluída!', cancelada:'✕ Cancelada' };
      showToast(msgs[status] || '✅ Feito!');
      return true;
    } catch(e) { showToast('Erro: '+e.message, true); return false; }
  }, [myPos, reload, showToast]);

  const navegar = useCallback((os, diagLoc) => {
    const loc  = diagLoc || null;
    const lat  = loc?.lat || os.lat || null;
    const lng  = loc?.lng || os.lng || null;
    const fonte = loc?.fonte || (os.lat ? 'os' : null);
    const dest = lat && lng
      ? `${lat},${lng}`
      : os.endereco ? encodeURIComponent(os.endereco) : null;
    if (!dest) return showToast('Endereço não disponível', true);
    if (fonte === 'instalacao') showToast('📍 Navegando para o ponto de instalação');
    else if (fonte === 'checkin') showToast('📍 Navegando para localização confirmada');
    const waze  = (lat && lng) ? `waze://?ll=${lat},${lng}&navigate=yes` : null;
    const gmaps = (lat && lng)
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
    if (waze) { const a=document.createElement('a'); a.href=waze; a.click(); }
    setTimeout(() => window.open(gmaps,'_blank'), waze ? 1500 : 0);
  }, [showToast]);

  return (
    <Ctx.Provider value={{ user, osList, ocList, osMap, osAtivas, osHoje, instalacoesPendentes, proximaOS, resumo, myPos, loading, showToast, reload, atualizar, navegar, onLogout, toast, offline, ticketsCount, setTicketsCount }}>
      {children}
    </Ctx.Provider>
  );
}

function OfflineBanner() {
  const { offline } = useTec();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => countPending().then(n => { if (alive) setPending(n); }).catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => { alive = false; off(); };
  }, []);
  if (!offline && pending === 0) return null;
  if (offline) {
    return (
      <div role="alert" aria-live="polite"
        style={{ background:'rgba(255,71,87,.92)', color:'#fff', textAlign:'center', padding:'9px 16px', fontSize:'.82rem', fontWeight:700, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <WifiOff size={14} /> Sem conexão — {pending > 0 ? `${pending} ação${pending>1?'ões':''} na fila` : 'dados podem estar desatualizados'}
      </div>
    );
  }
  // Online + pendente: mostra barra amarela (pode ser falha 4xx que não vai limpar — informar usuário)
  return (
    <div role="status" aria-live="polite"
      style={{ background:'rgba(245,197,24,.18)', color:'#f5c518', textAlign:'center', padding:'7px 16px', fontSize:'.78rem', fontWeight:700, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:8, borderBottom:'1px solid rgba(245,197,24,.25)' }}>
      📤 {pending} ação{pending>1?'ões':''} pendente{pending>1?'s':''} de sincronia
    </div>
  );
}

// Botão no header que mostra a contagem de ações na fila offline.
// Só aparece quando count > 0. Toque força um drain imediato.
function OfflineQueueButton() {
  const { showToast, offline } = useTec();
  const [pending, setPending] = useState(0);
  const [draining, setDraining] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => countPending().then(n => { if (alive) setPending(n); }).catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => { alive = false; off(); };
  }, []);
  if (pending === 0) return null;
  return (
    <button type="button" aria-label={`${pending} ações pendentes de sincronia — toque pra tentar agora`}
      onClick={async () => {
        if (offline) { showToast('Sem conexão — vai sincronizar quando voltar sinal', true); return; }
        if (draining) return;
        setDraining(true);
        try {
          const r = await drainQueue({ force: true });
          if (r?.success > 0) showToast(`✅ ${r.success} ação${r.success>1?'ões':''} sincronizada${r.success>1?'s':''}`);
          else if (r?.failed > 0) showToast(`⚠ ${r.failed} ação${r.failed>1?'ões':''} com erro — verá detalhes na próxima tentativa`, true);
          else showToast('Nada pra sincronizar agora');
        } catch(e) { showToast('Erro ao sincronizar: ' + e.message, true); }
        setDraining(false);
      }}
      style={{ position:'relative', width:34, height:34, borderRadius:8, border:`1px solid rgba(245,197,24,.3)`, background: draining ? 'rgba(245,197,24,.18)' : 'rgba(245,197,24,.08)', color:'#f5c518', cursor: draining ? 'wait' : 'pointer', marginRight:6, touchAction:'manipulation', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem' }}>
      {draining ? '↻' : '📤'}
      <span aria-hidden style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16, padding:'0 4px', background:'#f5c518', color:'#1a1500', borderRadius:99, fontSize:'.55rem', fontWeight:900, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, border:'2px solid #F6FAF6' }}>
        {pending > 9 ? '9+' : pending}
      </span>
    </button>
  );
}

function NotifButton() {
  const { showToast, user } = useTec();
  return (
    <button type="button" title="Ativar notificações / Testar push"
      style={{ width:34, height:34, borderRadius:8, border:`1px solid rgba(0,200,150,.2)`, background:'rgba(0,200,150,.08)', color:'#16A34A', cursor:'pointer', marginRight:6, touchAction:'manipulation', display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={async () => {
        try {
          await solicitarPermissoes(user);
          const r = await fetch('/api/tecnico/push/testar', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ agente_id: user.id, agente_nome: user.nome }),
          });
          const d = await r.json();
          const diag = await fetch('/api/tecnico/push/diagnostico').then(r=>r.json()).catch(()=>({}));
          showToast(d.ok
            ? `Push enviado! Dispositivos: ${d.subs_total} · Banco: ${diag.banco || 0}`
            : `Erro: ${d.erro} · Permissão: ${Notification.permission}`
          , true);
        } catch(e) { showToast('Erro: ' + e.message, true); }
      }}>
      <Bell size={15} />
    </button>
  );
}

const VEICULO_KEY = 'pinheiro_veiculo_dia';

function TecnicoApp() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; } });

  // Sincroniza chaves auxiliares (maxxi_id, maxxi_nome) que o useStore (zustand)
  // e o ChatProvider dependem. Técnicos antigos podem ter localStorage sem
  // essas chaves — populamos no boot pra não quebrar o chat.
  useEffect(() => {
    if (user?.id && !localStorage.getItem('pinheiro_id')) {
      localStorage.setItem('pinheiro_id', user.id);
      localStorage.setItem('pinheiro_nome', user.nome || '');
    }
  }, [user?.id]);

  // PerfilScreen dispara `tecnico-user-updated` quando troca a foto/dados.
  // Releitura do localStorage atualiza Header e HomeScreen com a nova foto.
  useEffect(() => {
    const handler = () => {
      try { setUser(JSON.parse(localStorage.getItem(LS_USER) || 'null')); } catch {}
    };
    window.addEventListener('tecnico-user-updated', handler);
    return () => window.removeEventListener('tecnico-user-updated', handler);
  }, []);

  const logout = () => {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem('pinheiro_role');
    localStorage.removeItem('pinheiro_id');
    localStorage.removeItem('pinheiro_nome');
    localStorage.removeItem(VEICULO_KEY);
    setUser(null);
  };

  if (!user) return <LoginScreen onLogin={d => setUser(d)} />;

  return (
    <TecnicoProvider user={user} onLogout={logout}>
      <TecnicoShell logout={logout} />
    </TecnicoProvider>
  );
}

function TecnicoShell({ logout }) {
  const { showToast, user, ticketsCount, setTicketsCount, reload, instalacoesPendentes = 0 } = useTec();
  const [tela, setTela] = useState('home');

  // Inicia o sistema de fila offline assim que a shell monta. Drena a fila
  // quando voltar online e periodicamente. Quando uma op é removida com
  // sucesso (queue change), recarrega os dados pra refletir o estado novo.
  useEffect(() => {
    startAutoDrain();
    let lastCount = -1;
    const off = onQueueChange(async () => {
      const n = await countPending();
      // Se a contagem caiu (op processada com sucesso), recarrega lista de OS
      if (lastCount >= 0 && n < lastCount) {
        reload?.();
      }
      lastCount = n;
    });
    return off;
  }, [reload]);
  const installPrompt = useInstallPrompt();
  const screenRef = useRef(null);
  const [ticketRefresh, setTicketRefresh] = useState(0); // força reload da TicketsScreen quando incrementa

  // ── Notificação global de NOVO TICKET destinado a este técnico ────────────
  // Hook conecta SSE singleton; ChatScreen também usa o mesmo (não duplica).
  // Quando o backend faz broadcastTo(tecnicoId, 'novo_ticket', ...) → cai aqui.
  useTecnicoRealtime({
    userId: user?.id,
    onNovoTicket: (data) => {
      const titulo = data?.titulo || 'Novo ticket atribuído';
      const cliente = data?.cliente_nome ? ` · ${data.cliente_nome}` : '';
      const numero  = data?.numero ? `#${data.numero}` : '';
      const ehAtividade = data?.tipo === 'atividade';
      const prefix = ehAtividade ? '🔧' : '🎫';
      // Som mais marcante + vibração mais longa pra ticket (vs msg de chat)
      tocarDingDong();
      vibrar([300, 120, 300, 120, 500]);
      showToast(`${prefix} ${numero} ${titulo}${cliente}`);
      piscarTitle(1, `${prefix} ${numero || 'Novo ticket!'}`);
      // Força reload da TicketsScreen quando montada
      setTicketRefresh(n => n + 1);
      // Incrementa badge na navbar mesmo se técnico estiver em outra tela.
      // Quando ele abrir Tickets, a tela recarrega e ajusta a contagem real.
      if (!ehAtividade) setTicketsCount(c => (c || 0) + 1);
    },
  });

  useEffect(() => {
    if (!screenRef.current) return;
    gsap.fromTo(screenRef.current,
      { opacity: 0, y: 10 },
      // clearProps:'all' removia TUDO incluindo o min-height:0, flex, overflow do
      // style inline → quebrava o scroll da lista (div vazava do pai). Limpamos
      // apenas o que a GSAP animou (opacity + transform).
      { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'opacity,transform' }
    );
  }, [tela]);

  const [detalheOS, setDetalheOS] = useState(null);
  const [detalheOC, setDetalheOC] = useState(null);
  const [detalheTicket, setDetalheTicket] = useState(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const [verPerfil, setVerPerfil] = useState(false);
  const [chatConvId, setChatConvId] = useState(null);

  const [veiculoSelecionado, setVeiculoSelecionado] = useState(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(VEICULO_KEY) || 'null');
      if (salvo?.data === new Date().toISOString().slice(0,10)) return salvo;
      return null;
    } catch { return null; }
  });
  const [mostrarModalVeiculo, setMostrarModalVeiculo]   = useState(false);
  const [mostrarVeiculoSheet, setMostrarVeiculoSheet]   = useState(false);
  const [abastecimentoInitialTab, setAbastecimentoInitialTab] = useState(null);

  useEffect(() => {
    if (!veiculoSelecionado) setMostrarModalVeiculo(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmarVeiculo = (v) => {
    const registro = { ...(v || { modelo: 'Sem veículo', placa: null }), data: new Date().toISOString().slice(0,10) };
    localStorage.setItem(VEICULO_KEY, JSON.stringify(registro));
    setVeiculoSelecionado(registro);
    setMostrarModalVeiculo(false);
  };

  const abrirOS     = os => { setDetalheOS(os);   setDetalheOC(null);    setDetalheTicket(null); setVerHistorico(false); setVerPerfil(false); };
  const abrirOC     = oc => { setDetalheOC(oc);   setDetalheOS(null);    setDetalheTicket(null); setVerHistorico(false); setVerPerfil(false); };
  const abrirTicket = t  => { setDetalheTicket(t); setDetalheOS(null);   setDetalheOC(null); setVerHistorico(false); setVerPerfil(false); };
  const abrirHistorico = () => { setVerHistorico(true); setDetalheOS(null); setDetalheOC(null); setDetalheTicket(null); setVerPerfil(false); };
  const abrirPerfil = () => { setVerPerfil(true); setDetalheOS(null); setDetalheOC(null); setDetalheTicket(null); setVerHistorico(false); };
  const fecharDetalhe = () => { setDetalheOS(null); setDetalheOC(null);  setDetalheTicket(null); setVerHistorico(false); setVerPerfil(false); };

  const onIniciarChat = convId => {
    fecharDetalhe();
    setChatConvId(convId);
    setTela('chat');
  };

  const NAV = [
    { id:'home',        Icon: Home,          label:'Home'    },
    { id:'tickets',     Icon: FileText,      label:'Tickets' },
    { id:'instalacoes', Icon: Wrench,        label:'Instala' },
    { id:'chat',        Icon: MessageCircle, label:'Chat'    },
    { id:'estoque',     Icon: Package,       label:'Estoque' },
    { id:'fttx',        Icon: Radio,         label:'FTTX'    },
  ];

  const mostrarDetalhe = detalheOS || detalheOC || detalheTicket || verHistorico || verPerfil;

  return (
    <>
      <Toast />
      <div style={{ display:'flex', flexDirection:'column', height:'100svh', background:T.bg, fontFamily:"'DM Sans','Outfit',system-ui,sans-serif", color:T.text, overflow:'hidden' }}>
        {!mostrarDetalhe && (
          <div style={{ display:'flex', alignItems:'center', padding:'10px 16px', paddingTop:'max(10px,env(safe-area-inset-top))', borderBottom:`1px solid ${T.bord}`, flexShrink:0, background:T.bg1 }}>
            <img src="/pinheiro-logo.svg" alt="Pinheiro OS" style={{ height:28, width:'auto', display:'block' }} onError={(e)=>{ e.currentTarget.style.display='none'; const fb=e.currentTarget.nextElementSibling; if(fb) fb.style.display='block'; }} />
            <div style={{ fontWeight:900, fontSize:'.95rem', color:T.green, letterSpacing:'.02em', display:'none' }}>PINHEIRO OS</div>
            <div style={{ flex:1 }} />
            <button type="button" onClick={() => veiculoSelecionado?.placa ? setMostrarVeiculoSheet(true) : setMostrarModalVeiculo(true)} title={veiculoSelecionado?.placa || 'Selecionar veículo'}
              style={{ padding:'4px 9px', borderRadius:8, border:`1px solid ${T.bord}`, background:T.card, color:T.muted, fontSize:'.7rem', fontWeight:600, cursor:'pointer', marginRight:6, maxWidth:110, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', touchAction:'manipulation', display:'flex', alignItems:'center', gap:5 }}>
              <Car size={13} style={{ flexShrink:0 }} />{veiculoSelecionado?.placa || '—'}
            </button>
            <OfflineQueueButton />
            <NotifButton />
            <button type="button" onClick={abrirPerfil} aria-label="Meu perfil"
              title={user?.nome ? `${user.nome} — perfil` : 'Meu perfil'}
              style={{ width:34, height:34, borderRadius:'50%', border:`1px solid rgba(0,200,150,.35)`, background:'linear-gradient(135deg,rgba(0,200,150,.18),rgba(0,200,150,.05))', cursor:'pointer', touchAction:'manipulation', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
              {user?.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                : <span style={{ fontSize:'.85rem', fontWeight:800, color:T.green, lineHeight:1 }}>
                    {(user?.nome || '?').trim().charAt(0).toUpperCase()}
                  </span>}
            </button>
          </div>
        )}

        <OfflineBanner />

        {/* minHeight:0 obrigatório em flex column items que contém scroll interno —
            sem isso o flex item assume min-height:auto (default) e estoura o pai */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minHeight:0 }}>
          {mostrarDetalhe ? (
            verPerfil      ? <PerfilScreen onBack={fecharDetalhe} showToast={showToast} onLogout={logout} />
          : verHistorico   ? <HistoricoScreen onBack={fecharDetalhe} />
          : detalheOS      ? <DetalheOS  os={detalheOS}  onBack={fecharDetalhe} />
          : detalheOC      ? <DetalheOC  oc={detalheOC}  onBack={fecharDetalhe} />
          : detalheTicket  ? <DetalheTicket ticket={detalheTicket} onBack={fecharDetalhe} showToast={showToast} onIniciarChat={onIniciarChat} />
          : null
          ) : (
            <div ref={screenRef} style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', minHeight:0 }}>
              {tela==='home'    && <HomeScreen onOpenOS={abrirOS} onOpenTicket={abrirTicket} onOpenHistorico={abrirHistorico} />}
              {tela==='tickets' && <TicketsScreen onOpen={abrirTicket} showToast={showToast} onCountChange={setTicketsCount} refreshKey={ticketRefresh} />}
              {tela==='os'      && <OSScreen   onOpenOS={abrirOS} />}
              {tela==='instalacoes' && <InstalacoesScreen onOpenOS={abrirOS} />}
              {tela==='oc'      && <OCScreen   onOpenOC={abrirOC} />}
              {tela==='chat'    && <Chat tecnicoMode={true} initialConvId={chatConvId} />}
              {tela==='estoque'     && <EstoqueScreen />}
              {tela==='fttx'        && <FttxScreen />}
              {tela==='combustivel' && <AbastecimentoScreen veiculoSelecionado={veiculoSelecionado} initialTab={abastecimentoInitialTab} />}
            </div>
          )}
        </div>

        {!mostrarDetalhe && (
          <nav style={{ display:'flex', borderTop:`1px solid ${T.bord}`, background:T.bg1, flexShrink:0, paddingBottom:'env(safe-area-inset-bottom)' }} aria-label="Navegação principal">
            {NAV.map(n => {
              const active = tela === n.id;
              const badge = n.id === 'tickets' && ticketsCount > 0 ? (ticketsCount > 9 ? '9+' : String(ticketsCount))
                          : n.id === 'instalacoes' && instalacoesPendentes > 0 ? (instalacoesPendentes > 9 ? '9+' : String(instalacoesPendentes))
                          : null;
              return (
                <button type="button" key={n.id} onClick={()=>{ setTela(n.id); if (n.id !== 'chat') setChatConvId(null); }} aria-label={n.label} aria-current={active?'page':undefined}
                  style={{ flex:1, padding:'10px 6px 8px', border:'none', background: active ? 'rgba(0,200,150,.06)' : 'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3, borderTop:`2px solid ${active?T.green:'transparent'}`, transition:'border-color .15s, background .15s', minHeight:56, touchAction:'manipulation', position:'relative' }}>
                  <span style={{ position:'relative', color: active ? T.green : T.muted, display:'flex', transition:'color .15s' }}>
                    <n.Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                    {badge && (
                      <span style={{ position:'absolute', top:-4, right:-10, minWidth:16, height:16, padding:'0 4px', background: n.id === 'instalacoes' ? T.green : T.red, borderRadius:99, fontSize:'.5rem', fontWeight:900, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>
                        {badge}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize:'.6rem', fontWeight:700, color:active?T.green:T.muted, textTransform:'uppercase', letterSpacing:'.06em', transition:'color .15s' }}>{n.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
      {mostrarModalVeiculo && <VeiculoModal onConfirm={confirmarVeiculo} />}
      {mostrarVeiculoSheet && (
        <VeiculoSheet
          veiculo={veiculoSelecionado}
          onClose={() => setMostrarVeiculoSheet(false)}
          onAbastecer={() => {
            setAbastecimentoInitialTab('abastecimento');
            setTela('combustivel');
          }}
          onChecklist={() => {
            setAbastecimentoInitialTab('checklist');
            setTela('combustivel');
          }}
          onTrocarVeiculo={() => setMostrarModalVeiculo(true)}
        />
      )}
      <InstallBanner {...installPrompt} />
      <style>{`
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.sk {
  background: linear-gradient(90deg, #EDF5ED 25%, #F6FAF6 50%, #EDF5ED 75%);
  background-size: 800px 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 10px;
}
* { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
html, body { height: 100%; height: 100dvh; overflow: hidden; overscroll-behavior: none; }
body { -webkit-user-select: none; user-select: auto; }
input, textarea { -webkit-user-select: auto; user-select: auto; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slideDown { from{opacity:0;transform:translate(-50%,-10px)} to{opacity:1;transform:translate(-50%,0)} }
@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; }
button:active { opacity: 0.75; }
      `}</style>
    </>
  );
}

export default TecnicoApp;
