// FotoGeoTag.jsx — captura foto com GPS + timestamp BURNADOS no pixel.
// Watermark in-pixel é à prova de strip/EXIF — sobrevive a qualquer
// reprocessamento da imagem. Audit trail anti-fraude.
//
// Uso:
//   <FotoGeoTag osId={os.id} onCaptured={(blob, meta) => upload(blob, meta)} />

import React, { useState, useRef } from 'react';
import { Camera, Loader2, AlertCircle, MapPin } from 'lucide-react';
import { T } from '../shared';

export function FotoGeoTag({ onCaptured, osId, label = 'Tirar foto', cor = T.green }) {
  const [estado, setEstado] = useState('idle'); // idle | gps | processando | erro
  const [erro, setErro]     = useState('');
  const inputRef = useRef(null);

  const obterGPS = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS indisponível'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        ts: pos.timestamp || Date.now(),
      }),
      () => reject(new Error('Ative o GPS para tirar foto')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 4000 }
    );
  });

  const carregarImg = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem inválida'));
    img.src = URL.createObjectURL(file);
  });

  const desenharWatermark = (img, meta) => new Promise(resolve => {
    const c = document.createElement('canvas');
    // Redimensiona para no máx 1600px no lado maior — economia de banda em campo
    const MAX = 1600;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (Math.max(w, h) > MAX) {
      const r = MAX / Math.max(w, h);
      w = Math.round(w * r); h = Math.round(h * r);
    }
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Faixa inferior com gradiente
    const faixaH = Math.max(72, Math.round(h * 0.085));
    const grd = ctx.createLinearGradient(0, h - faixaH, 0, h);
    grd.addColorStop(0,   'rgba(0,0,0,0)');
    grd.addColorStop(0.3, 'rgba(0,0,0,.6)');
    grd.addColorStop(1,   'rgba(0,0,0,.9)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, h - faixaH, w, faixaH);

    // Texto principal — coords + accuracy
    const linha1 = `📍 ${meta.lat.toFixed(6)}, ${meta.lng.toFixed(6)}  ±${Math.round(meta.accuracy)}m`;
    const data   = new Date(meta.ts);
    const linha2 = `${data.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })}  ·  OS ${osId || '—'}`;

    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = '#fff';
    ctx.textBaseline = 'top';

    const fontMono = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';
    ctx.font = `700 ${Math.round(faixaH * 0.28)}px ${fontMono}`;
    ctx.fillText(linha1, 18, h - faixaH + faixaH * 0.14);

    ctx.font = `500 ${Math.round(faixaH * 0.22)}px ${fontMono}`;
    ctx.fillText(linha2, 18, h - faixaH + faixaH * 0.55);

    // Brand canto inferior direito
    ctx.shadowBlur = 0;
    ctx.font = `900 ${Math.round(faixaH * 0.26)}px ui-sans-serif, -apple-system, "Outfit", system-ui`;
    const brand = 'PINHEIRO OS';
    const bw    = ctx.measureText(brand).width;
    ctx.fillStyle = '#16A34A';
    ctx.fillText(brand, w - bw - 18, h - faixaH + faixaH * 0.35);

    c.toBlob(b => resolve(b), 'image/jpeg', 0.86);
  });

  const onArquivo = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setErro('');
    setEstado('gps');
    try {
      const [meta, img] = await Promise.all([obterGPS(), carregarImg(file)]);
      setEstado('processando');
      const blob = await desenharWatermark(img, meta);
      onCaptured?.(blob, { ...meta, osId, originalName: file.name });
      setEstado('idle');
    } catch (e) {
      setErro(e.message || 'Falha ao processar foto');
      setEstado('erro');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={estado === 'gps' || estado === 'processando'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 18px', borderRadius: 14,
          background: cor, color: '#fff', border: 'none',
          fontWeight: 700, fontSize: '.92rem', fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: `0 4px 14px ${cor}55`,
          transition: 'transform .12s, opacity .15s',
          opacity: (estado === 'gps' || estado === 'processando') ? .8 : 1,
        }}
      >
        {estado === 'gps'         ? <><MapPin   size={16}/> Localizando…</> :
         estado === 'processando' ? <><Loader2  size={16} className="ft-spin"/> Carimbando GPS…</> :
                                    <><Camera   size={16}/> {label}</>}
      </button>

      {erro && (
        <div style={{
          color: T.red, fontSize: '.78rem',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <AlertCircle size={13}/> {erro}
        </div>
      )}

      <input
        ref={inputRef} type="file"
        accept="image/*" capture="environment"
        onChange={onArquivo} style={{ display: 'none' }}
      />

      <style>{`
        @keyframes ft-spin { to { transform: rotate(360deg); } }
        .ft-spin { animation: ft-spin .8s linear infinite; }
      `}</style>
    </div>
  );
}
