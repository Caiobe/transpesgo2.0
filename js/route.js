import { state } from './state.js';
import { $, log, setStatus, parseNumeroFlex } from './utils.js';
import { verificarObstaculosNaRota } from './obstacles.js';
import { updateActionButtons } from './ui.js';
import { getUserWaypointAddresses, getWaypointPayload } from './waypoints.js';

export function requestRoute(options) {
  return new Promise((resolve, reject) => {
    state.directionsService.route(options, (response, status) => {
      if (status === 'OK' && response?.routes?.length) {
        resolve(response);
      } else {
        reject(new Error(status || 'Erro ao buscar rota'));
      }
    });
  });
}

export async function calcularRota() {
  const origemText = $('origem').value.trim();
  const destinoText = $('destino').value.trim();
  if (!origemText || !destinoText) {
    alert('Preencha origem e destino.');
    return;
  }

  setStatus('Calculando rota...', 'loading');
  state.carregamentoEmAndamento = true;
  updateActionButtons();
  if (state.directionsRenderer) state.directionsRenderer.setMap(state.map);
  state.userWaypoints = state.userWaypoints || [];

  try {
    const waypoints = getUserWaypointAddresses();
    const resposta = await requestRoute({
      origin: origemText,
      destination: destinoText,
      waypoints: waypoints.map(endereco => ({ location: endereco, stopover: true })),
      travelMode: 'DRIVING'
    });

    aplicarRotaNaInterface(resposta);
    log(`🛣️ Rota calculada (${state.rotaPathDenso.length} pontos densos)`);
    setStatus('Rota calculada', 'ok');

    if (parseNumeroFlex($('alturaCaminhao').value) > 0) {
      verificarObstaculosNaRota(true);
    }
  } catch (erro) {
    log(`ERRO — Rota não encontrada: ${String(erro?.message || erro)}`);
    setStatus('Erro ao calcular rota', 'error');
  } finally {
    state.carregamentoEmAndamento = false;
    updateActionButtons();
  }
}

export function aplicarRotaNaInterface(directionsResult) {
  state.ignorarProximoDesvio = true;
  state.directionsRenderer.setDirections(directionsResult);
  state.rotaAtual = directionsResult;
  state.rotaPathDenso = extrairPathDenso(directionsResult);

  if (state.rotaPolyline) state.rotaPolyline.setMap(null);
  state.rotaPolyline = new google.maps.Polyline({ path: directionsResult.routes[0].overview_path });
}

export async function restaurarRota(origem, destino, pontos) {
  if (!Array.isArray(pontos) || pontos.length === 0) return calcularRota();

  const batches = [];
  for (let index = 0; index < pontos.length; index += 8) {
    batches.push(pontos.slice(index, index + 8));
  }

  let currentOrigin = origem;
  let combinedPath = [];
  let lastDirections = null;
  let combinedDenso = [];

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const isLastBatch = index === batches.length - 1;
    const destination = isLastBatch
      ? destino
      : { lat: batch[batch.length - 1][0], lng: batch[batch.length - 1][1] };
    const waypoints = isLastBatch
      ? batch.map(([lat, lng]) => ({ location: { lat, lng }, stopover: false }))
      : batch.slice(0, -1).map(([lat, lng]) => ({ location: { lat, lng }, stopover: false }));

    const resposta = await requestRoute({
      origin: currentOrigin,
      destination,
      travelMode: 'DRIVING',
      waypoints,
      optimizeWaypoints: false
    });

    const path = resposta.routes[0].overview_path || [];
    if (combinedPath.length && path.length) {
      const ultimo = combinedPath[combinedPath.length - 1];
      if (ultimo.lat() === path[0].lat() && ultimo.lng() === path[0].lng()) path.shift();
    }

    combinedPath = combinedPath.concat(path);
    combinedDenso = combinedDenso.concat(extrairPathDenso(resposta));
    currentOrigin = destination;
    lastDirections = resposta;
  }

  if (!lastDirections) throw new Error('Não foi possível restaurar a rota');

  if (state.directionsRenderer) state.directionsRenderer.setMap(null);
  if (state.rotaPolyline) state.rotaPolyline.setMap(null);

  state.rotaPolyline = new google.maps.Polyline({
    path: combinedPath,
    map: state.map,
    strokeColor: '#1a73e8',
    strokeWeight: 4,
    strokeOpacity: 0.9
  });

  let encodedPolyline = '';
  if (google?.maps?.geometry?.encoding && combinedPath.length) {
    try {
      encodedPolyline = google.maps.geometry.encoding.encodePath(new google.maps.MVCArray(combinedPath));
    } catch {
      encodedPolyline = lastDirections.routes[0]?.overview_polyline?.points || '';
    }
  }

  state.rotaAtual = {
    routes: [{ overview_path: combinedPath, overview_polyline: { points: encodedPolyline } }]
  };
  state.rotaPathDenso = combinedDenso.length > 0
    ? combinedDenso
    : combinedPath.map(ponto => ({ lat: ponto.lat(), lng: ponto.lng() }));

  const bounds = new google.maps.LatLngBounds();
  combinedPath.forEach(ponto => bounds.extend(ponto));
  state.map.fitBounds(bounds);

  log(`🛣️ Rota restaurada a partir do link (${state.rotaPathDenso.length} pts)`);
  setStatus('Rota restaurada', 'ok');
  updateActionButtons();

  if (parseNumeroFlex($('alturaCaminhao').value) > 0) {
    verificarObstaculosNaRota(true);
  }
}

export function restaurarPolylineFallback(encodedPolyline) {
  if (!encodedPolyline || !google?.maps?.geometry?.encoding) {
    throw new Error('Não foi possível decodificar a rota de fallback');
  }

  const path = google.maps.geometry.encoding.decodePath(encodedPolyline);
  if (!path?.length) throw new Error('Polyline de fallback inválida');

  if (state.directionsRenderer) state.directionsRenderer.setMap(null);
  if (state.rotaPolyline) state.rotaPolyline.setMap(null);

  state.rotaPolyline = new google.maps.Polyline({
    path,
    strokeColor: '#1a73e8',
    strokeWeight: 4,
    strokeOpacity: 0.9,
    map: state.map
  });

  state.rotaAtual = {
    routes: [{ overview_path: path, overview_polyline: { points: encodedPolyline } }]
  };
  state.rotaPathDenso = path.map(ponto => ({ lat: ponto.lat(), lng: ponto.lng() }));

  const bounds = new google.maps.LatLngBounds();
  path.forEach(ponto => bounds.extend(ponto));
  state.map.fitBounds(bounds);

  log(`🛣️ Rota restaurada via fallback visual (${state.rotaPathDenso.length} pts)`);
  setStatus('Rota restaurada (fallback)', 'ok');
  updateActionButtons();

  if (parseNumeroFlex($('alturaCaminhao').value) > 0) {
    verificarObstaculosNaRota(true);
  }
}

function extrairPathDenso(directionsResult) {
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
