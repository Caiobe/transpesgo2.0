import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairObstaculosDaBase } from '../js/csv.js';

test('parser cria restricoes.altura a partir de colunas antigas', () => {
  const csv = [
    'latitude,longitude,altura esquerda,altura centro,altura direita,via,uf,km,descrição,obs,fonte,data',
    '-19.9,-44.0,4.10,4.30,4.20,BR 040,MG,12,Passagem estreita,Teste,EVG,2024-01-01'
  ].join('\n');

  const [obstaculo] = extrairObstaculosDaBase(csv, 'base1');

  assert.ok(obstaculo);
  assert.deepEqual(obstaculo.restricoes.altura, {
    esquerda: 4.1,
    centro: 4.3,
    direita: 4.2,
    minima: 4.1
  });
});

test('parser aceita aliases alternativos das planilhas atuais', () => {
  const csv = [
    'lat,lng,altura_esq,altura_cent,altura_dir,observacao,fonte',
    '-19.8,-43.9,3.9,4.0,3.8,Obstáculo de teste,Form'
  ].join('\n');

  const [obstaculo] = extrairObstaculosDaBase(csv, 'base2');

  assert.ok(obstaculo);
  assert.equal(obstaculo.restricoes.altura.minima, 3.8);
  assert.equal(obstaculo.restricoes.altura.esquerda, 3.9);
  assert.equal(obstaculo.restricoes.altura.centro, 4);
  assert.equal(obstaculo.restricoes.altura.direita, 3.8);
});

test('parser cria restricoes.largura quando há colunas de largura', () => {
  const csv = [
    'latitude,longitude,largura_esq,largura_centro,largura_dir,altura_esq,altura_centro,altura_dir',
    '-19.7,-44.1,2.6,2.8,2.7,4.1,4.2,4.3'
  ].join('\n');

  const [obstaculo] = extrairObstaculosDaBase(csv, 'base1');

  assert.ok(obstaculo);
  assert.deepEqual(obstaculo.restricoes.largura, {
    esquerda: 2.6,
    centro: 2.8,
    direita: 2.7,
    minima: 2.6
  });
});
