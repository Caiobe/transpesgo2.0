import { state } from './state.js';
import { $ } from './utils.js';

export function updateActionButtons() {
  const hasRoute = Boolean(state.rotaAtual?.routes?.length);
  const hasPath = state.rotaPathDenso.length > 0 || Boolean(state.rotaPolyline?.getPath?.()?.getLength());
  const enabled = !state.carregamentoEmAndamento;

  const setButton = (id, allow) => {
    const button = $(id);
    if (button) button.disabled = !allow;
  };

  setButton('btnCalcular', enabled);
  setButton('btnVerificar', enabled && state.basesCarregadas && hasPath);
  setButton('btnCompartilhar', enabled && hasRoute);
}
