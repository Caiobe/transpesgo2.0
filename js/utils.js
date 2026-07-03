import { state } from './state.js';
import { OBSTACLE_DISTANCE_METERS } from './config.js';

export function $(id) {
  return document.getElementById(id);
}

export function formatTime() {
  return new Date().toLocaleTimeString('pt-BR', { hour12: false });
}

export function log(msg) {
  const logArea = $('log');
  logArea.innerHTML += `[${formatTime()}] ${msg}<br>`;
  logArea.scrollTop = logArea.scrollHeight;
}

export function setStatus(msg, tipo = 'ok') {
  $('status').innerText = msg;
  const dot = $('statusDot');
  dot.className = 'status-dot ' + tipo;
}

export function onEnter(action) {
  return event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      action();
    }
  };
}

export function decodeBase64Utf8(value) {
  try {
    const text = atob(value);
    return decodeURIComponent(Array.from(text, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

export function normalizarTexto(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseNumeroFlex(valor) {
  if (valor === null || valor === undefined) return NaN;
  const texto = String(valor).trim();
  if (!texto) return NaN;
  if (texto.includes(',') && texto.includes('.')) {
    return Number(texto.replace(/\./g, '').replace(',', '.'));
  }
  if (texto.includes(',') && !texto.includes('.')) {
    return Number(texto.replace(',', '.'));
  }
  return Number(texto);
}

export function coordenadasValidas(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function corrigirCoordenadasBrasil(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat, lng };
  return { lat: lat > 0 ? -lat : lat, lng: lng > 0 ? -lng : lng };
}

export function distanciaSegmentoMetros(pLat, pLng, aLat, aLng, bLat, bLng) {
  const cosLat = Math.cos(aLat * Math.PI / 180);
  const metrosPorGrau = 111319.5;
  const ax = 0;
  const ay = 0;
  const bx = (bLng - aLng) * metrosPorGrau * cosLat;
  const by = (bLat - aLat) * metrosPorGrau;
  const px = (pLng - aLng) * metrosPorGrau * cosLat;
  const py = (pLat - aLat) * metrosPorGrau;
  const ab2 = bx * bx + by * by;

  if (ab2 === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / ab2));
  const closestX = ax + t * bx;
  const closestY = ay + t * by;
  return Math.hypot(px - closestX, py - closestY);
}

export function estaPertoDaRota(lat, lng) {
  const path = state.rotaPathDenso.length > 0
    ? state.rotaPathDenso
    : (state.rotaPolyline?.getPath ? state.rotaPolyline.getPath().getArray() : []);

  if (path.length < 2) return false;

  const getLat = ponto => (typeof ponto.lat === 'function' ? ponto.lat() : ponto.lat);
  const getLng = ponto => (typeof ponto.lng === 'function' ? ponto.lng() : ponto.lng);

  for (let i = 0; i < path.length - 1; i += 1) {
    const aLat = getLat(path[i]);
    const aLng = getLng(path[i]);
    const bLat = getLat(path[i + 1]);
    const bLng = getLng(path[i + 1]);
    const distancia = distanciaSegmentoMetros(lat, lng, aLat, aLng, bLat, bLng);
    if (distancia <= OBSTACLE_DISTANCE_METERS) return true;
  }
  return false;
}

export function extrairPathDenso(directionsResult) {
  const pontos = [];
  try {
    const legs = directionsResult?.routes?.[0]?.legs || [];
    for (const leg of legs) {
      for (const step of leg.steps || []) {
        const stepPath = step.path || step.lat_lngs || [];
        for (const ponto of stepPath) {
          pontos.push({ lat: ponto.lat(), lng: ponto.lng() });
        }
      }
    }
  } catch {
    // fallback silencioso
  }

  if (pontos.length === 0 && directionsResult?.routes?.[0]?.overview_path) {
    for (const ponto of directionsResult.routes[0].overview_path) {
      pontos.push({ lat: ponto.lat(), lng: ponto.lng() });
    }
  }
  return pontos;
}

export function obterConfiguracoesVeiculo() {
  const altura = parseNumeroFlex($("alturaCaminhao").value);
  const largura = parseNumeroFlex($("larguraConjunto").value);
  return {
    altura: Number.isFinite(altura) ? altura : null,
    largura: Number.isFinite(largura) ? largura : null,
    peso: null,
    comprimento: null,
    raioMinimo: null
  };
}
