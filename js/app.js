import { state } from './state.js';
import { initMap } from './map.js';
import { updateActionButtons } from './ui.js';
import { carregarTodasAsBases } from './csv.js';
import { restaurarRotaDaURL, compartilharRota as compartilharRotaFn, copiarLink as copiarLinkFn } from './share.js';
import { calcularRota as calcularRotaFn } from './route.js';
import { verificarObstaculosNaRota as verificarObstaculosNaRotaFn, toggleFiltrosCriticos as toggleFiltrosCriticosFn } from './obstacles.js';
import { inicializarWaypointsState, prepararParadasNoDOM, adicionarParada } from './waypoints.js';
import { log, setStatus } from './utils.js';

window.state = state;
window.initMap = initMap;
window.calcularRota = calcularRotaFn;
window.verificarObstaculosNaRota = verificarObstaculosNaRotaFn;
window.compartilharRota = compartilharRotaFn;
window.copiarLink = copiarLinkFn;
window.toggleFiltrosCriticos = toggleFiltrosCriticosFn;
window.adicionarParada = adicionarParada;

export async function initApp() {
  updateActionButtons();
  setStatus('Carregando bases...', 'loading');
  log('Inicializando aplicação modular');
  try {
    inicializarWaypointsState();
    await carregarTodasAsBases();
    state.basesCarregadas = true;
    setStatus('Bases carregadas — Sistema pronto', 'ok');
    updateActionButtons();
    prepararParadasNoDOM();
    await restaurarRotaDaURL();
  } catch (erro) {
    state.basesCarregadas = false;
    setStatus('Erro ao carregar bases', 'error');
    log(`ERRO — ${String(erro?.message || erro)}`);
    throw erro;
  }
}

window.initApp = initApp;
await initApp();
