import { state } from './state.js';
import { $, log, setStatus, onEnter, parseNumeroFlex } from './utils.js';
import { calcularRota } from './route.js';
import { verificarObstaculosNaRota } from './obstacles.js';
import { updateActionButtons } from './ui.js';
import { registrarDesvio, atualizarMarcadoresDesvios } from './waypoints.js';

export function initMap() {
  state.map = new google.maps.Map($('map'), {
    center: { lat: -19.5, lng: -44.0 },
    zoom: 6,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true
  });

  state.directionsService = new google.maps.DirectionsService();
  state.directionsRenderer = new google.maps.DirectionsRenderer({
    draggable: true,
    polylineOptions: { strokeColor: '#1a73e8', strokeWeight: 4, strokeOpacity: 0.9 }
  });
  state.directionsRenderer.setMap(state.map);

  state.directionsRenderer.addListener('directions_changed', () => {
    if (state.ignorarProximoDesvio) {
      state.ignorarProximoDesvio = false;
      return;
    }

    const directions = state.directionsRenderer.getDirections();
    if (!directions?.routes?.length) return;
    const legs = directions.routes[0].legs || [];
    if (legs.length > 1) {
      const lastLeg = legs[legs.length - 1];
      if (lastLeg?.end_location) {
        const points = directions.routes[0].overview_path || [];
        if (points.length > 2) {
          const lastPoint = points[points.length - 1];
          const previousPoint = points[points.length - 2];
          if (lastPoint && previousPoint) {
            registrarDesvio(lastPoint);
          }
        }
      }
    }
    if (!directions?.routes?.length) return;

    state.rotaAtual = directions;
    state.rotaPathDenso = extrairPathDenso(directions);

    if (state.rotaPolyline) state.rotaPolyline.setMap(null);
    atualizarMarcadoresDesvios();
    state.rotaPolyline = new google.maps.Polyline({ path: directions.routes[0].overview_path });

    log(`>> Rota alterada — recalculando obstáculos (${state.rotaPathDenso.length} pts)`);
    if (parseNumeroFlex($('alturaCaminhao').value) > 0) {
      verificarObstaculosNaRota(true);
    } else {
      updateActionButtons();
    }
  });

  const options = {
    componentRestrictions: { country: 'br' },
    fields: ['formatted_address', 'geometry'],
    types: ['geocode']
  };

  new google.maps.places.Autocomplete($('origem'), options);
  new google.maps.places.Autocomplete($('destino'), options);

  $('origem').addEventListener('keydown', onEnter(calcularRota));
  $('destino').addEventListener('keydown', onEnter(calcularRota));
  $('alturaCaminhao').addEventListener('keydown', onEnter(verificarObstaculosNaRota));

  updateActionButtons();
  log('Mapa inicializado');
  iniciarGeolocalizacao();
}

export function iniciarGeolocalizacao() {
  if (!navigator.geolocation) {
    log('Geolocalização não suportada pelo navegador');
    return;
  }

  const options = {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000
  };

  navigator.geolocation.getCurrentPosition(atualizarPosicao, erroGeolocalizacao, options);
  state.watchIdGeo = navigator.geolocation.watchPosition(atualizarPosicao, erroGeolocalizacao, options);
}

export function atualizarPosicao(posicao) {
  const lat = posicao.coords.latitude;
  const lng = posicao.coords.longitude;
  const precisao = posicao.coords.accuracy;
  const latLng = new google.maps.LatLng(lat, lng);

  if (!state.marcadorPosicao) {
    state.marcadorPosicao = new google.maps.Marker({
      position: latLng,
      map: state.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#4285F4',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 8
      },
      title: 'Você está aqui',
      zIndex: 999
    });

    state.circuloPrecisao = new google.maps.Circle({
      map: state.map,
      center: latLng,
      radius: precisao,
      fillColor: '#4285F4',
      fillOpacity: 0.08,
      strokeColor: '#4285F4',
      strokeOpacity: 0.25,
      strokeWeight: 1
    });

    log('📍 Posição detectada — marcador ativo');
  } else {
    state.marcadorPosicao.setPosition(latLng);
    state.circuloPrecisao.setCenter(latLng);
    state.circuloPrecisao.setRadius(precisao);
  }
}

export function erroGeolocalizacao(err) {
  const mensagens = {
    1: 'Permissão de localização negada',
    2: 'Posição não disponível',
    3: 'Tempo esgotado ao obter localização'
  };
  log(`⚠️ Geo: ${mensagens[err.code] || err.message}`);
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
