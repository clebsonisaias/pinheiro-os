// NovaConversa — inicia DM (1 selecionado), grupo (N selecionados) ou canal.
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Check, Users } from 'lucide-react';
import { T } from '../shared';
import { PresenceDot } from './PresenceDot';
import { listarAgentes, abrirDM, criarGrupo, criarCanal } from './chat-api';

export function NovaConversa({ modo = 'conversa', onBack, onCriada, showToast }) {
  const canal = modo === 'canal';
  const [agentes, setAgentes] = useState([]);
  const [busca, setBusca]     = useState('');
  const [sel, setSel]         = useState(new Set());
  const [titulo, setTitulo]   = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando]   = useState(false);

  useEffect(() => {
    if (canal) return; // canal inclui todos automaticamente
    listarAgentes().then(r => setAgentes(r.items || [])).catch(e => showToast?.('Erro: ' + e.message));
  }, [canal, showToast]);

  const filtrados = agentes.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()));
  const grupo = sel.size > 1;

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const criar = async () => {
    try {
      setSalvando(true);
      if (canal) {
        if (!titulo.trim()) return showToast?.('Dê um título ao canal');
        const c = await criarCanal(titulo.trim(), descricao.trim() || null);
        onCriada?.(c.id);
      } else if (grupo) {
        if (!titulo.trim()) return showToast?.('Dê um nome ao grupo');
        const c = await criarGrupo(titulo.trim(), [...sel]);
        onCriada?.(c.id);
      } else {
        const id = [...sel][0];
        const c = await abrirDM(id);
        onCriada?.(c.id);
      }
    } catch (e) { showToast?.('Erro ao criar: ' + e.message); }
    finally { setSalvando(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: T.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderBottom: `1px solid ${T.bord}`, background: T.bg1 }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text }}>
          <ArrowLeft size={22} />
        </button>
        <strong style={{ color: T.text }}>{canal ? '📣 Novo canal de avisos' : grupo ? 'Novo grupo' : 'Nova conversa'}</strong>
      </div>

      {(canal || grupo) && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bg2}` }}>
          <input value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder={canal ? 'Título do canal (ex: Avisos da Empresa)' : 'Nome do grupo'}
            style={inp()} />
          {canal && (
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição (opcional)"
              style={{ ...inp(), marginTop: 8 }} />
          )}
          {canal && <div style={{ fontSize: '.74rem', color: T.muted, marginTop: 8 }}>
            Todos os funcionários entram automaticamente. Só admins postam.</div>}
        </div>
      )}

      {!canal && (
        <>
          <div style={{ padding: '8px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.card, border: `1px solid ${T.bord}`,
              borderRadius: 12, padding: '8px 12px' }}>
              <Search size={16} color={T.muted} />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colega…"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontSize: '.9rem' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtrados.map(a => {
              const on = sel.has(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggle(a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    padding: '10px 14px', background: on ? T.bg2 : 'none', border: 'none',
                    borderBottom: `1px solid ${T.bg2}`, cursor: 'pointer' }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: T.bg2, color: T.green,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                      {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : a.nome.charAt(0).toUpperCase()}
                    </div>
                    <span style={{ position: 'absolute', bottom: 0, right: 0 }}><PresenceDot online={a.online} /></span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: T.text, fontSize: '.9rem' }}>{a.nome}</div>
                    <div style={{ fontSize: '.72rem', color: T.muted }}>{a.role}{a.online ? ' · online' : ''}</div>
                  </div>
                  {on && <Check size={20} color={T.green} />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {(canal || sel.size > 0) && (
        <div style={{ padding: 14, borderTop: `1px solid ${T.bord}`, background: T.bg1 }}>
          <button type="button" onClick={criar} disabled={salvando}
            style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: T.green, color: '#fff',
              fontWeight: 800, fontSize: '.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8 }}>
            {grupo && <Users size={18} />}
            {salvando ? 'Criando…' : canal ? 'Criar canal' : grupo ? `Criar grupo (${sel.size})` : 'Abrir conversa'}
          </button>
        </div>
      )}
    </div>
  );
}

function inp() {
  return { width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${T.bord}`,
    background: T.card, color: T.text, fontSize: '.9rem', outline: 'none', boxSizing: 'border-box' };
}
