import { state } from './state.js';
import { $, log } from './utils.js';
import { calcularRota } from './route.js';

export function criarEstadoWaypoints() {
  return {
    userWaypoints: [],
    dragWaypoints: [],
    dragMarkers: []
  };
}

export function inicializarWaypointsState() {
  state.userWaypoints = [];
  state.dragWaypoints = [];
  state.dragMarkers = [];
}

export function getUserWaypointAddresses() {
  return state.userWaypoints
    .map(item => item?.value?.trim())
    .filter(Boolean);
}

export function getWaypointPayload() {
  return {
    userWaypoints: state.userWaypoints.map(item => item?.value?.trim()).filter(Boolean),
    dragWaypoints: state.dragWaypoints.map(item => ({ lat: item.lat, lng: item.lng }))
  };
}

export function aplicarWaypointPayload(payload = {}) {
  const userWaypoints = Array.isArray(payload.userWaypoints) ? payload.userWaypoints : [];
  const dragWaypoints = Array.isArray(payload.dragWaypoints) ? payload.dragWaypoints : [];
  state.userWaypoints = userWaypoints.map(value => ({ value }));
  state.dragWaypoints = dragWaypoints.map(item => ({ lat: item.lat, lng: item.lng }));
  renderizarParadas();
}

export function adicionarParada() {
  state.userWaypoints.push({ value: '' });
  renderizarParadas();
  configurarAutocompleteParadas();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.waypoint-input');
    const last = inputs[inputs.length - 1];
    if (last) last.focus();
  }, 0);
}

export function removerParada(index) {
  state.userWaypoints.splice(index, 1);
  renderizarParadas();
  calcularRota();
}

export function atualizarParada(index, value) {
  if (!state.userWaypoints[index]) return;
  state.userWaypoints[index].value = value;
}

export function limparWaypoints() {
  state.userWaypoints = [];
  state.dragWaypoints = [];
  limparMarcadoresDesvios();
  renderizarParadas();
}

export function renderizarParadas() {
  const container = $('paradasContainer');
  if (!container) return;
  container.innerHTML = '';

  state.userWaypoints.forEach((parada, index) => {
    const item = document.createElement('div');
    item.className = 'waypoint-item';
    item.innerHTML = `
      <div class="waypoint-handle" title="Arraste para reordenar">☰</div>
      <input class="waypoint-input" type="text" value="${(parada.value || '').replace(/"/g, '&quot;')}" placeholder="Parada ${index + 1}" data-index="${index}">
      <button class="waypoint-remove" data-index="${index}" title="Remover parada">🗑</button>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.waypoint-input').forEach(input => {
    input.addEventListener('input', event => {
      const index = Number(event.target.dataset.index);
      atualizarParada(index, event.target.value);
    });
    input.addEventListener('change', () => calcularRota());
  });

  container.querySelectorAll('.waypoint-remove').forEach(button => {
    button.addEventListener('click', () => removerParada(Number(button.dataset.index)));
  });

  container.querySelectorAll('.waypoint-item').forEach((item, index) => {
    item.draggable = true;
    item.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', String(index));
    });
    item.addEventListener('dragover', event => event.preventDefault());
    item.addEventListener('drop', event => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      const to = index;
      if (from === to) return;
      const [moved] = state.userWaypoints.splice(from, 1);
      state.userWaypoints.splice(to, 0, moved);
      renderizarParadas();
      calcularRota();
    });
  });

  configurarAutocompleteParadas();
}

export function configurarAutocompleteParadas() {
  const inputs = document.querySelectorAll('.waypoint-input');
  inputs.forEach(input => {
    if (input.dataset.autocompleteBound === 'true') return;
    const autocomplete = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: 'br' },
      fields: ['formatted_address', 'geometry'],
      types: ['geocode']
    });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const value = place.formatted_address || input.value;
      input.value = value;
      const index = Number(input.dataset.index);
      atualizarParada(index, value);
      calcularRota();
    });
    input.dataset.autocompleteBound = 'true';
  });
}

export function limparMarcadoresDesvios() {
  state.dragMarkers.forEach(marker => marker.setMap(null));
  state.dragMarkers = [];
}

export function adicionarMarcadorDesvio(latLng) {
  const marker = new google.maps.Marker({
    position: latLng,
    map: state.map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#1a73e8',
      fillOpacity: 0.95,
      strokeColor: '#ffffff',
      strokeWeight: 1,
      scale: 5
    },
    title: 'Clique para remover este desvio'
  });
  marker.addListener('click', () => removerDesvio(marker));
  state.dragMarkers.push(marker);
}

export function atualizarMarcadoresDesvios() {
  limparMarcadoresDesvios();
  state.dragWaypoints.forEach(item => adicionarMarcadorDesvio(new google.maps.LatLng(item.lat, item.lng)));
}

export function removerDesvio(marker) {
  const index = state.dragMarkers.indexOf(marker);
  if (index >= 0) {
    state.dragMarkers.splice(index, 1);
    state.dragWaypoints.splice(index, 1);
  }
  marker.setMap(null);
  atualizarMarcadoresDesvios();
  calcularRota();
}

export function registrarDesvio(latLng) {
  state.dragWaypoints.push({ lat: latLng.lat(), lng: latLng.lng() });
  atualizarMarcadoresDesvios();
}

export function sincronizarWaypointsComRota() {
  const addresses = getUserWaypointAddresses();
  if (!addresses.length) return;
  const path = state.rotaAtual?.routes?.[0]?.overview_path || [];
  if (!path.length) return;
  const sample = path[Math.min(20, path.length - 1)];
  if (sample) {
    state.dragWaypoints = state.dragWaypoints.filter(item => item && Number.isFinite(item.lat) && Number.isFinite(item.lng));
  }
}

export function prepararParadasNoDOM() {
  const container = $('paradasContainer');
  if (!container) return;
  renderizarParadas();
  configurarAutocompleteParadas();
}
