import { state } from './state.js';
import { CSV_URL_1, CSV_URL_2 } from './config.js';
import { normalizarTexto, parseNumeroFlex, corrigirCoordenadasBrasil, coordenadasValidas } from './utils.js';

const FIELD_ALIASES = {
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
  coordenadas: ['coordenadas', 'coordenada', 'coord', 'coords'],
  via: ['via', 'rodovia', 'trecho'],
  uf: ['uf', 'estado'],
  km: ['km', 'quilometro'],
  descricao: ['descricao', 'descrição'],
  obs: ['obs', 'observacao', 'observacao_livre'],
  data: ['data', 'data_da_afericao', 'data_afericao', 'data_hora', 'datahora'],
  fonte: ['fonte', 'evg', 'arquivo_evg'],
  restricoes: {
    altura: {
      esquerda: ['altura_esquerda', 'altura_esq', 'altura1'],
      centro: ['altura_centro', 'altura_cent', 'altura_central', 'altura2'],
      direita: ['altura_direita', 'altura_dir', 'altura3'],
      minima: ['altura_minima', 'altura_min']
    },
    largura: {
      esquerda: ['largura_esquerda', 'largura_esq', 'largura1'],
      centro: ['largura_centro', 'largura_cent', 'largura_central', 'largura2'],
      direita: ['largura_direita', 'largura_dir', 'largura3'],
      minima: ['largura_minima', 'largura_min']
    }
  }
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (const caractere of line) {
    if (caractere === '"') {
      insideQuotes = !insideQuotes;
    } else if (caractere === ',' && !insideQuotes) {
      result.push(current);
      current = '';
    } else {
      current += caractere;
    }
  }

  result.push(current);
  return result.map(valor => valor.replace(/^"|"$/g, '').trim());
}

function csvToObjects(csv) {
  const texto = String(csv || '').replace(/^\uFEFF/, '');
  const linhas = texto.split(/\r?\n/).map(linha => linha.trim()).filter(linha => linha.length > 0);
  if (!linhas.length) return [];

  const cabecalhos = parseCSVLine(linhas[0]).map(normalizarTexto);
  return linhas.slice(1).map(linha => {
    const colunas = parseCSVLine(linha);
    const objeto = {};
    cabecalhos.forEach((cabecalho, indice) => {
      if (cabecalho) objeto[cabecalho] = (colunas[indice] ?? '').trim();
    });
    return objeto;
  });
}

function pegarCampo(objeto, aliases) {
  for (const alias of aliases) {
    const chave = normalizarTexto(alias);
    if (objeto[chave] !== undefined && String(objeto[chave]).trim() !== '') {
      return String(objeto[chave]).trim();
    }
  }
  return '';
}

function construirRestricoesDaLinha(objeto) {
  const restricoes = {};

  const construirGrupo = (grupo, aliases) => {
    const grupoRestricoes = {};
    const esquerda = pegarCampo(objeto, aliases.esquerda);
    const centro = pegarCampo(objeto, aliases.centro);
    const direita = pegarCampo(objeto, aliases.direita);
    const minima = pegarCampo(objeto, aliases.minima);

    const valores = [
      [esquerda, 'esquerda'],
      [centro, 'centro'],
      [direita, 'direita'],
      [minima, 'minima']
    ];

    valores.forEach(([valor, nome]) => {
      if (valor) {
        grupoRestricoes[nome] = parseNumeroFlex(valor);
      }
    });

    const valoresNumericos = [grupoRestricoes.esquerda, grupoRestricoes.centro, grupoRestricoes.direita, grupoRestricoes.minima]
      .filter(valor => Number.isFinite(valor));

    if (valoresNumericos.length) {
      grupoRestricoes.minima = Number.isFinite(grupoRestricoes.minima)
        ? grupoRestricoes.minima
        : Math.min(...valoresNumericos);
      return grupoRestricoes;
    }

    return null;
  };

  const altura = construirGrupo('altura', FIELD_ALIASES.restricoes.altura);
  if (altura) {
    restricoes.altura = altura;
  }

  const largura = construirGrupo('largura', FIELD_ALIASES.restricoes.largura);
  if (largura) {
    restricoes.largura = largura;
  }

  return restricoes;
}

function extrairCoordenadasDaLinha(objeto) {
  const latText = pegarCampo(objeto, FIELD_ALIASES.latitude);
  const lngText = pegarCampo(objeto, FIELD_ALIASES.longitude);
  if (latText && lngText) {
    return corrigirCoordenadasBrasil(parseNumeroFlex(latText), parseNumeroFlex(lngText));
  }

  const coordenadasText = pegarCampo(objeto, FIELD_ALIASES.coordenadas);
  if (coordenadasText) {
    const partes = coordenadasText.replace(/\s+/g, '').split(/[,;]/);
    if (partes.length >= 2) {
      return corrigirCoordenadasBrasil(parseNumeroFlex(partes[0]), parseNumeroFlex(partes[1]));
    }
  }

  return { lat: NaN, lng: NaN };
}

export function normalizarRegistroBase1(objeto) {
  const { lat, lng } = extrairCoordenadasDaLinha(objeto);
  const restricoes = construirRestricoesDaLinha(objeto);
  if (!coordenadasValidas(lat, lng) || !Object.keys(restricoes).length) return null;

  return {
    origemBase: 'Base histórica',
    origemDetalhe: 'Planilha principal de restrições',
    via: pegarCampo(objeto, FIELD_ALIASES.via) || 'Via não informada',
    uf: pegarCampo(objeto, FIELD_ALIASES.uf) || '',
    km: pegarCampo(objeto, FIELD_ALIASES.km) || '',
    descricao: pegarCampo(objeto, FIELD_ALIASES.descricao) || '',
    obs: pegarCampo(objeto, FIELD_ALIASES.obs) || '',
    data: pegarCampo(objeto, FIELD_ALIASES.data) || '',
    fonte: pegarCampo(objeto, FIELD_ALIASES.fonte) || '',
    lat,
    lng,
    restricoes
  };
}

export function normalizarRegistroBase2(objeto) {
  const { lat, lng } = extrairCoordenadasDaLinha(objeto);
  const restricoes = construirRestricoesDaLinha(objeto);
  if (!coordenadasValidas(lat, lng) || !Object.keys(restricoes).length) return null;

  const fonte = pegarCampo(objeto, FIELD_ALIASES.fonte);
  const obs = pegarCampo(objeto, FIELD_ALIASES.obs);
  const data = pegarCampo(objeto, FIELD_ALIASES.data);

  return {
    origemBase: 'Registros Vistoria',
    origemDetalhe: 'Registros enviados pelo formulário',
    via: 'Vistoria de campo',
    uf: '',
    km: '',
    descricao: obs || 'Ponto de vistoria',
    obs,
    data,
    fonte,
    lat,
    lng,
    restricoes
  };
}

export function deduplicarObstaculos(lista) {
  const mapa = new Map();
  for (const item of lista) {
    const altura = item.restricoes?.altura;
    const minima = Number.isFinite(altura?.minima)
      ? altura.minima.toFixed(2)
      : 'nan';
    const chave = [
      item.origemBase,
      item.via,
      item.uf,
      item.km,
      item.lat.toFixed(6),
      item.lng.toFixed(6),
      minima,
      item.data,
      item.obs
    ].join('|');

    if (!mapa.has(chave)) mapa.set(chave, item);
  }
  return Array.from(mapa.values());
}

export function extrairObstaculosDaBase(csv, origemTipo) {
  return csvToObjects(csv)
    .map(objeto => origemTipo === 'base1' ? normalizarRegistroBase1(objeto) : normalizarRegistroBase2(objeto))
    .filter(Boolean);
}

export async function carregarTodasAsBases(fetchImpl = fetch) {
  state.carregamentoEmAndamento = true;
  state.basesCarregadas = false;
  state.obstacles = [];

  try {
    const [resposta1, resposta2] = await Promise.all([
      fetchImpl(CSV_URL_1, { cache: 'no-store' }),
      fetchImpl(CSV_URL_2, { cache: 'no-store' })
    ]);

    if (!resposta1.ok) throw new Error(`Falha base 1: ${resposta1.status}`);
    if (!resposta2.ok) throw new Error(`Falha base 2: ${resposta2.status}`);

    const [csv1, csv2] = await Promise.all([resposta1.text(), resposta2.text()]);
    const base1 = extrairObstaculosDaBase(csv1, 'base1');
    const base2 = extrairObstaculosDaBase(csv2, 'base2');
    state.obstacles = deduplicarObstaculos([...base1, ...base2]);
    return state.obstacles;
  } finally {
    state.carregamentoEmAndamento = false;
  }
}
