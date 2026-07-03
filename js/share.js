import { state } from './state.js';
import { $, log, setStatus, decodeBase64Utf8, parseNumeroFlex } from './utils.js';
import { calcularRota, restaurarRota, restaurarPolylineFallback } from './route.js';
import { aplicarWaypointPayload } from './waypoints.js';

export function coletarPontosDeArraste() {
  const route = state.rotaAtual?.routes?.[0];
  if (!route?.legs) return [];

  const pontos = [];
  route.legs.forEach((leg, legIndex) => {
    (leg.via_waypoints || []).forEach(wp => {
      pontos.push({
        lat: typeof wp.lat === 'function' ? wp.lat() : wp.lat,
        lng: typeof wp.lng === 'function' ? wp.lng() : wp.lng,
        legIndex
      });
    });
  });
  return pontos;
}

export function indiceMaisProximoNoPath(path, lat, lng) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < path.length; index += 1) {
    const pLat = typeof path[index].lat === 'function' ? path[index].lat() : path[index].lat;
    const pLng = typeof path[index].lng === 'function' ? path[index].lng() : path[index].lng;
    const distance = Math.hypot(pLat - lat, pLng - lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function montarPontosParaCompartilhamento(route) {
  const fullPath = route.overview_path;
  const MAX_POINTS = 100;
  const arrastes = coletarPontosDeArraste();
  const arrastesMapeados = arrastes.map(item => ({
    lat: item.lat,
    lng: item.lng,
    pathIdx: indiceMaisProximoNoPath(fullPath, item.lat, item.lng)
  }));
  arrastesMapeados.sort((a, b) => a.pathIdx - b.pathIdx);

  const interior = fullPath.slice(1, fullPath.length - 1);
  const slotsLivres = Math.max(0, MAX_POINTS - arrastesMapeados.length);
  let amostrados = [];

  if (interior.length <= slotsLivres) {
    amostrados = interior.map(ponto => ({
      lat: typeof ponto.lat === 'function' ? ponto.lat() : ponto.lat,
      lng: typeof ponto.lng === 'function' ? ponto.lng() : ponto.lng,
      pathIdx: fullPath.indexOf(ponto)
    }));
  } else if (slotsLivres > 0) {
    const step = (interior.length - 1) / (slotsLivres - 1);
    for (let index = 0; index < slotsLivres; index += 1) {
      const itemIndex = Math.min(Math.round(index * step), interior.length - 1);
      const ponto = interior[itemIndex];
      amostrados.push({
        lat: typeof ponto.lat === 'function' ? ponto.lat() : ponto.lat,
        lng: typeof ponto.lng === 'function' ? ponto.lng() : ponto.lng,
        pathIdx: itemIndex + 1
      });
    }
  }

  const todos = [...arrastesMapeados, ...amostrados];
  todos.sort((a, b) => a.pathIdx - b.pathIdx);

  const deduplicados = [];
  const DEDUP_GRAUS = 0.00005;
  for (const ponto of todos) {
    const ultimo = deduplicados[deduplicados.length - 1];
    if (!ultimo || Math.abs(ponto.lat - ultimo.lat) > DEDUP_GRAUS || Math.abs(ponto.lng - ultimo.lng) > DEDUP_GRAUS) {
      deduplicados.push(ponto);
    }
  }

  let pontosFinal = deduplicados;
  if (pontosFinal.length > MAX_POINTS) {
    const setArrastes = new Set(arrastesMapeados.map(ponto => `${ponto.lat.toFixed(6)},${ponto.lng.toFixed(6)}`));
    const protegidos = pontosFinal.filter(ponto => setArrastes.has(`${ponto.lat.toFixed(6)},${ponto.lng.toFixed(6)}`));
    const livres = pontosFinal.filter(ponto => !setArrastes.has(`${ponto.lat.toFixed(6)},${ponto.lng.toFixed(6)}`));
    const slotsRestantes = MAX_POINTS - protegidos.length;

    let livresAmostrados = [];
    if (livres.length <= slotsRestantes) {
      livresAmostrados = livres;
    } else {
      const step = (livres.length - 1) / (slotsRestantes - 1);
      for (let index = 0; index < slotsRestantes; index += 1) {
        livresAmostrados.push(livres[Math.min(Math.round(index * step), livres.length - 1)]);
      }
    }

    pontosFinal = [...protegidos, ...livresAmostrados];
    pontosFinal.sort((a, b) => a.pathIdx - b.pathIdx);
  }

  return pontosFinal.map(ponto => [+ponto.lat.toFixed(6), +ponto.lng.toFixed(6)]);
}

export function compartilharRota() {
  const origem = $('origem').value.trim();
  const destino = $('destino').value.trim();
  const altura = $('alturaCaminhao').value.trim();
  const largura = $('larguraConjunto').value.trim();

  if (!origem || !destino) {
    alert('Preencha origem e destino antes de compartilhar.');
    return;
  }
  if (!state.rotaAtual?.routes?.[0]) {
    alert('Calcule a rota primeiro.');
    return;
  }

  const route = state.rotaAtual.routes[0];
  const pontos = montarPontosParaCompartilhamento(route);
  const pontosEnc = encodeDelta(pontos);
  const estado = { o: origem, d: destino, a: altura, l: largura, p: pontosEnc, w: state.userWaypoints.map(item => item.value).filter(Boolean) };

  comprimirEstado(estado).then(payload => {
    const base = window.location.href.split('?')[0];
    const url = `${base}?r=${encodeURIComponent(payload)}`;

    $('linkCompartilhado').innerText = url;
    $('linkCompartilhado').dataset.url = url;
    $('linkArea').style.display = 'block';

    log(`Link gerado: ${pontos.length} pts · ${url.length} chars`);
  }).catch(erro => {
    log(`ERRO ao gerar link: ${erro.message}`);
  });
}

export function encodeDelta(pontos) {
  if (!pontos.length) return '';
  let refLat = 0;
  let refLng = 0;
  const parts = [];

  for (const [lat, lng] of pontos) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    parts.push(`${iLat - refLat},${iLng - refLng}`);
    refLat = iLat;
    refLng = iLng;
  }

  return parts.join(';');
}

export function decodeDelta(str) {
  if (!str) return [];
  let refLat = 0;
  let refLng = 0;
  return str.split(';').map(part => {
    const [dLat, dLng] = part.split(',').map(Number);
    refLat += dLat;
    refLng += dLng;
    return [refLat / 1e5, refLng / 1e5];
  });
}

export async function comprimirEstado(estado) {
  const json = JSON.stringify(estado);
  const bytes = new TextEncoder().encode(json);

  if (typeof CompressionStream !== 'undefined') {
    const stream = new CompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const compressed = await new Response(stream.readable).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return `z2.${b64}`;
  }

  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `p2.${b64}`;
}

export async function descomprimirEstado(payload) {
  if (payload.startsWith('z2.')) {
    const b64 = payload.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, caractere => caractere.charCodeAt(0));
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    const objeto = JSON.parse(new TextDecoder().decode(buffer));
    return normalizarEstado(objeto);
  }

  if (payload.startsWith('p2.')) {
    const b64 = payload.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    const objeto = JSON.parse(decodeBase64Utf8(b64));
    return normalizarEstado(objeto);
  }

  if (payload.startsWith('z.')) {
    const b64 = payload.slice(2);
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, caractere => caractere.charCodeAt(0));
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buffer));
  }

  if (payload.startsWith('p.')) {
    return JSON.parse(decodeBase64Utf8(payload.slice(2)));
  }

  return JSON.parse(decodeBase64Utf8(payload));
}

export function normalizarEstado(objeto) {
  if (objeto.o !== undefined) {
    return {
      origem: objeto.o || '',
      destino: objeto.d || '',
      altura: objeto.a || '',
      largura: objeto.l || '',
      waypoints: Array.isArray(objeto.w) ? objeto.w : [],
      polyline: '',
      pontos: typeof objeto.p === 'string' ? decodeDelta(objeto.p) : (objeto.p || [])
    };
  }
  return objeto;
}

export function copiarLink() {
  const url = $('linkCompartilhado').dataset.url || $('linkCompartilhado').innerText;
  navigator.clipboard.writeText(url).then(() => {
    const button = document.querySelector('.copy-btn');
    button.innerText = 'Copiado!';
    setTimeout(() => { button.innerText = '📋 Copiar link'; }, 2000);
  }).catch(() => {
    prompt('Copie o link abaixo:', url);
  });
}

export async function restaurarRotaDaURL() {
  const payload = new URLSearchParams(window.location.search).get('r');
  if (!payload) return;

  try {
    const estado = await descomprimirEstado(payload);
    if (!estado) throw new Error('Link inválido');
    const { origem, destino, altura, largura = '', waypoints = [], polyline = '', pontos = [] } = estado;

    $('origem').value = origem || '';
    $('destino').value = destino || '';
    $('alturaCaminhao').value = altura || '';
    $('larguraConjunto').value = largura || '';
    if (Array.isArray(waypoints) && waypoints.length) {
      state.userWaypoints = waypoints.map(value => ({ value }));
      aplicarWaypointPayload({ userWaypoints: waypoints, dragWaypoints: [] });
    }

    if (!origem || !destino) return;

    setStatus('Restaurando rota do link...', 'loading');
    state.carregamentoEmAndamento = true;
    log('🔍 Restaurando rota do link via DirectionsService...');

    try {
      await restaurarRota(origem, destino, pontos);
    } catch (erroApi) {
      log('⚠️ DirectionsService falhou — tentando fallback visual...');
      if (polyline) {
        restaurarPolylineFallback(polyline);
      } else {
        throw erroApi;
      }
    }
  } catch (erro) {
    log(`ERRO — Erro ao restaurar rota da URL: ${erro.message}`);
    setStatus('Erro ao restaurar rota', 'error');
  } finally {
    state.carregamentoEmAndamento = false;
  }
}
