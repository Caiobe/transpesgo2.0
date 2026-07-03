import { state } from './state.js';
import { $, log, setStatus, parseNumeroFlex, estaPertoDaRota, obterConfiguracoesVeiculo } from './utils.js';
import { updateActionButtons } from './ui.js';

export function limparMarcadores() {
  state.obstacleMarkers.forEach(marcador => marcador.setMap(null));
  state.obstacleMarkers = [];
}

export function resetarEstadoObstaculos() {
  limparMarcadores();
  $('resultadoContainer').innerHTML = '';
  state.obstaculosNaRota = [];
  state.filtroCriticosAtivo = false;

  const cardCritico = $('cardCritico');
  if (cardCritico) cardCritico.classList.remove('ativo');

  const hint = $('filtroHint');
  if (hint) hint.style.display = 'none';
}

export function criarMarcadorObstaculo(obstaculo, alturaVeiculo) {
  const position = new google.maps.LatLng(obstaculo.lat, obstaculo.lng);
  const marker = new google.maps.Marker({
    map: state.map,
    position,
    icon: obstaculo.critico
      ? 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
      : 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
    title: `${obstaculo.via || 'Via'} | ${obstaculo.critico ? 'CRÍTICO' : 'OK'}`
  });

  const infoWindow = new google.maps.InfoWindow({
    content: criarConteudoInfoObstaculo(obstaculo, alturaVeiculo)
  });

  marker.addListener('mouseover', () => infoWindow.open(state.map, marker));
  marker.addListener('mouseout', () => infoWindow.close());
  state.obstacleMarkers.push(marker);
}

function obterValoresAltura(obstaculo) {
  const altura = obstaculo?.restricoes?.altura;
  if (!altura) return [];
  return [altura.esquerda, altura.centro, altura.direita].filter(valor => Number.isFinite(valor));
}

function obterValoresLargura(obstaculo) {
  const largura = obstaculo?.restricoes?.largura;
  if (!largura) return [];
  return [largura.esquerda, largura.centro, largura.direita].filter(valor => Number.isFinite(valor));
}

function obterAlturaMinima(obstaculo) {
  const altura = obstaculo?.restricoes?.altura;
  if (Number.isFinite(altura?.minima)) return altura.minima;
  const valores = obterValoresAltura(obstaculo);
  return valores.length ? Math.min(...valores) : NaN;
}

function obterLarguraMinima(obstaculo) {
  const largura = obstaculo?.restricoes?.largura;
  if (Number.isFinite(largura?.minima)) return largura.minima;
  const valores = obterValoresLargura(obstaculo);
  return valores.length ? Math.min(...valores) : NaN;
}

export function criarConteudoInfoObstaculo(obstaculo, alturaVeiculo, larguraVeiculo) {
  const alturas = obterValoresAltura(obstaculo);
  const larguras = obterValoresLargura(obstaculo);
  const alturaMinima = obterAlturaMinima(obstaculo);
  const larguraMinima = obterLarguraMinima(obstaculo);

  return `
    <div style="font-size:12px;line-height:1.5;min-width:210px">
      <strong>${obstaculo.via || 'Via não informada'}</strong><br>
      <span style="color:#666">${obstaculo.origemBase}</span><br>
      ${obstaculo.uf ? `UF: <b>${obstaculo.uf}</b><br>` : ''}
      ${obstaculo.km ? `KM: <b>${obstaculo.km}</b><br>` : ''}
      ${obstaculo.descricao ? `Descrição: ${obstaculo.descricao}<br>` : ''}
      ${obstaculo.data ? `Data: ${obstaculo.data}<br>` : ''}
      ${obstaculo.obs ? `Obs.: ${obstaculo.obs}<br>` : ''}
      ${obstaculo.fonte ? `Fonte: <b>${obstaculo.fonte}</b><br>` : ''}
      Coordenada: <b>${obstaculo.lat.toFixed(5)}, ${obstaculo.lng.toFixed(5)}</b><br>
      <br>
      ${alturas.map((altura, indice) => `Altura ${['Esquerda', 'Central', 'Direita'][indice] ?? indice + 1}: ${altura.toFixed(2)} m`).join('<br>')}<br>
      ${larguras.length ? `${larguras.map((largura, indice) => `Largura ${['Esquerda', 'Central', 'Direita'][indice] ?? indice + 1}: ${largura.toFixed(2)} m`).join('<br>')}<br>` : ''}
      Altura do conjunto: <b>${alturaVeiculo.toFixed(2)} m</b><br>
      ${Number.isFinite(larguraVeiculo) ? `Largura do conjunto: <b>${larguraVeiculo.toFixed(2)} m</b><br>` : ''}
      Mín. registrada: <b>${alturaMinima.toFixed(2)} m</b><br>
      ${Number.isFinite(larguraMinima) ? `Largura mínima: <b>${larguraMinima.toFixed(2)} m</b><br>` : ''}
      <b style="color:${obstaculo.critico ? 'red' : 'green'}">${obstaculo.critico ? 'BLOQUEANTE' : 'OK'}</b>
    </div>`;
}

export function verificarObstaculosNaRota(skipAlert = false) {
  if (state.carregamentoEmAndamento) {
    if (!skipAlert) alert('Aguarde o carregamento das bases.');
    return;
  }
  if (!state.basesCarregadas) {
    if (!skipAlert) alert('Bases não carregadas.');
    return;
  }
  if (state.rotaPathDenso.length === 0 && !state.rotaPolyline) {
    if (!skipAlert) alert('Calcule a rota primeiro.');
    return;
  }

  const configuracoesVeiculo = obterConfiguracoesVeiculo();
  if (configuracoesVeiculo.altura === null) {
    if (!skipAlert) alert('Informe a altura do conjunto.');
    return;
  }

  resetarEstadoObstaculos();

  state.obstacles.forEach(obstaculo => {
    if (!estaPertoDaRota(obstaculo.lat, obstaculo.lng)) return;
    const alturaMinima = obterAlturaMinima(obstaculo);
    const larguraMinima = obterLarguraMinima(obstaculo);
    const criticoAltura = Number.isFinite(alturaMinima) && alturaMinima < configuracoesVeiculo.altura;
    const criticoLargura = Number.isFinite(configuracoesVeiculo.largura)
      && Number.isFinite(larguraMinima)
      && larguraMinima < configuracoesVeiculo.largura;

    state.obstaculosNaRota.push({
      ...obstaculo,
      criticoAltura,
      criticoLargura,
      critico: criticoAltura || criticoLargura
    });
  });

  const criticos = state.obstaculosNaRota.filter(obstaculo => obstaculo.critico).length;
  $('numTotal').innerText = state.obstaculosNaRota.length;
  $('numCritico').innerText = criticos;
  $('secaoResultados').style.display = 'block';

  state.obstaculosNaRota.forEach(obstaculo => criarMarcadorObstaculo(obstaculo, configuracoesVeiculo.altura, configuracoesVeiculo.largura));
  renderizarLista();

  log(`Obstáculos na rota: ${state.obstaculosNaRota.length} (${criticos} críticos)`);
  setStatus(`Verificação concluída · ${criticos} crítico(s)`, criticos > 0 ? 'error' : 'ok');
  updateActionButtons();
}

export function toggleFiltrosCriticos() {
  const criticos = state.obstaculosNaRota.filter(obstaculo => obstaculo.critico).length;
  if (!criticos) return;

  state.filtroCriticosAtivo = !state.filtroCriticosAtivo;
  const card = $('cardCritico');
  const hint = $('filtroHint');

  if (state.filtroCriticosAtivo) {
    card.classList.add('ativo');
    hint.style.display = 'block';
  } else {
    card.classList.remove('ativo');
    hint.style.display = 'none';
  }

  renderizarLista();
}

export function renderizarLista() {
  const container = $('resultadoContainer');
  container.innerHTML = '';

  const lista = state.filtroCriticosAtivo
    ? state.obstaculosNaRota.filter(obstaculo => obstaculo.critico)
    : state.obstaculosNaRota;

  lista.forEach(obstaculo => {
    const item = document.createElement('div');
    const alturaMinima = obterAlturaMinima(obstaculo);
    const larguraMinima = obterLarguraMinima(obstaculo);
    item.className = `obstaculo-item ${obstaculo.critico ? 'obstaculo-critico' : 'obstaculo-ok'}`;
    item.innerHTML = `
      <strong>${obstaculo.critico ? '🚫' : '✅'} ${obstaculo.via || 'Via não informada'}</strong><br>
      ${obstaculo.uf ? `UF: ${obstaculo.uf} · ` : ''}${obstaculo.km ? `KM: ${obstaculo.km}<br>` : '<br>'}
      ${obstaculo.descricao ? `${obstaculo.descricao}<br>` : ''}
      ${obstaculo.obs ? `Obs.: ${obstaculo.obs}<br>` : ''}
      ${obstaculo.fonte ? `Fonte: <b>${obstaculo.fonte}</b><br>` : ''}
      Coordenadas: ${obstaculo.lat.toFixed(5)}, ${obstaculo.lng.toFixed(5)}<br>
      Altura mín.: <b>${alturaMinima.toFixed(2)} m</b>${Number.isFinite(larguraMinima) ? ` · Largura mín.: <b>${larguraMinima.toFixed(2)} m</b>` : ''} · Status: <b>${obstaculo.critico ? 'CRÍTICO' : 'OK'}</b>
    `;
    container.appendChild(item);
  });
}
