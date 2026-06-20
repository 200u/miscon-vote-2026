(function () {
  'use strict';

  const STORAGE_KEY = 'm26-device-state-v2';
  const OLD_STORAGE_KEY = 'm26-device-state-v1';
  const AGG_KEY = 'm26-aggregate-state-v2';
  const PERFORMANCES = ['1', '2', '3', '4'];
  const EXPECTED_DEVICES = ['01', '02', '03', '04', '05', '06', '07'];

  const CANDIDATES = [
    { id: 1, number: 1, name: 'あかね', slug: 'akane', photo: 'images/akane.jpg', color: '#A61E32' },
    { id: 2, number: 2, name: 'はまめろ', slug: 'hamamero', photo: 'images/hamamero.jpg', color: '#B9273A' },
    { id: 3, number: 3, name: 'れいな', slug: 'reina', photo: 'images/reina.jpg', color: '#7F1D2D' },
    { id: 4, number: 4, name: 'そらら', slug: 'sorara', photo: 'images/sorara.jpg', color: '#C43B4E' },
    { id: 5, number: 5, name: 'ゆせぴ', slug: 'yusepi', photo: 'images/yusepi.jpg', color: '#E54B60' },
    { id: 6, number: 6, name: 'るた', slug: 'ruta', photo: 'images/ruta.jpg', color: '#8E2334' },
    { id: 7, number: 7, name: 'ひな', slug: 'hina', photo: 'images/hina.jpg', color: '#D6364D' }
  ];

  function blankPerformance() {
    return { votingOpen: true, counts: CANDIDATES.map(() => 0), log: [], updatedAt: new Date().toISOString() };
  }

  function defaultState() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = blankPerformance(); });
    return { version: 2, deviceId: '01', performanceId: '1', performances, updatedAt: new Date().toISOString() };
  }

  function normalizeDeviceId(value) {
    const raw = String(value || '').trim().replace(/^iPad/i, '').replace(/[^\d]/g, '');
    if (!raw) return '01';
    return String(Math.max(1, Math.min(99, Number(raw)))).padStart(2, '0');
  }

  function normalizePerformanceId(value) {
    const p = String(value || '1').trim();
    return PERFORMANCES.includes(p) ? p : '1';
  }

  function normalizeCounts(counts) {
    return CANDIDATES.map((_, i) => Math.max(0, Number((counts || [])[i] || 0)));
  }

  function normalizeState(input) {
    const base = defaultState();
    const src = input || {};
    base.deviceId = normalizeDeviceId(src.deviceId);
    base.performanceId = normalizePerformanceId(src.performanceId);
    PERFORMANCES.forEach(id => {
      const perf = src.performances && src.performances[id] ? src.performances[id] : {};
      base.performances[id] = {
        votingOpen: perf.votingOpen !== false,
        counts: normalizeCounts(perf.counts),
        log: Array.isArray(perf.log) ? perf.log : [],
        updatedAt: perf.updatedAt || new Date().toISOString()
      };
    });
    base.updatedAt = src.updatedAt || new Date().toISOString();
    return base;
  }

  function migrateOldState() {
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || 'null');
      if (!old) return null;
      const next = defaultState();
      next.deviceId = normalizeDeviceId(old.deviceId);
      next.performances['1'].votingOpen = old.votingOpen !== false;
      next.performances['1'].counts = normalizeCounts(old.counts);
      next.performances['1'].log = Array.isArray(old.log) ? old.log : [];
      return next;
    } catch (_) {
      return null;
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
      const migrated = migrateOldState();
      if (migrated) return saveState(migrated);
      return defaultState();
    } catch (_) {
      return defaultState();
    }
  }

  function saveState(state) {
    const next = normalizeState(state);
    next.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function currentPerformance(state) {
    const s = normalizeState(state || loadState());
    return s.performances[s.performanceId];
  }

  function setDeviceId(value) {
    const state = loadState();
    state.deviceId = normalizeDeviceId(value);
    return saveState(state);
  }

  function setPerformanceId(value) {
    const state = loadState();
    state.performanceId = normalizePerformanceId(value);
    return saveState(state);
  }

  function setVotingOpen(open) {
    const state = loadState();
    state.performances[state.performanceId].votingOpen = Boolean(open);
    return saveState(state);
  }

  function addVote(candidateId) {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    if (!perf.votingOpen) throw new Error('投票は締め切られています');
    const index = CANDIDATES.findIndex(c => c.id === Number(candidateId));
    if (index < 0) throw new Error('候補者が見つかりません');
    perf.counts[index] += 1;
    perf.log.push({ candidateId: CANDIDATES[index].id, ts: new Date().toISOString() });
    perf.updatedAt = new Date().toISOString();
    return saveState(state);
  }

  function undoLastVote() {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    const last = perf.log.pop();
    if (!last) throw new Error('取り消せる投票がありません');
    const index = CANDIDATES.findIndex(c => c.id === Number(last.candidateId));
    if (index >= 0 && !last.adjust) perf.counts[index] = Math.max(0, perf.counts[index] - 1);
    if (index >= 0 && last.adjust) perf.counts[index] = Math.max(0, perf.counts[index] - Number(last.adjust));
    perf.updatedAt = new Date().toISOString();
    return saveState(state);
  }

  function adjustVote(candidateId, delta) {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    const index = CANDIDATES.findIndex(c => c.id === Number(candidateId));
    if (index < 0) throw new Error('候補者が見つかりません');
    const d = Number(delta || 0);
    perf.counts[index] = Math.max(0, perf.counts[index] + d);
    perf.log.push({ candidateId: CANDIDATES[index].id, adjust: d, ts: new Date().toISOString() });
    perf.updatedAt = new Date().toISOString();
    return saveState(state);
  }

  function resetCurrentPerformance() {
    const state = loadState();
    state.performances[state.performanceId] = blankPerformance();
    return saveState(state);
  }

  function resetAllPerformances() {
    const state = loadState();
    const deviceId = state.deviceId;
    const performanceId = state.performanceId;
    const next = defaultState();
    next.deviceId = deviceId;
    next.performanceId = performanceId;
    return saveState(next);
  }

  function totalVotesFromCounts(counts) {
    return normalizeCounts(counts).reduce((sum, n) => sum + n, 0);
  }

  function totalVotes(state, performanceId) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[normalizePerformanceId(performanceId || s.performanceId)];
    return totalVotesFromCounts(perf.counts);
  }

  function rankingFromCounts(counts) {
    let lastVotes = null;
    let lastRank = 0;
    return CANDIDATES.map((c, i) => ({ ...c, votes: Math.max(0, Number((counts || [])[i] || 0)) }))
      .sort((a, b) => b.votes - a.votes || a.number - b.number)
      .map((c, index) => {
        const rank = c.votes === lastVotes ? lastRank : index + 1;
        lastVotes = c.votes;
        lastRank = rank;
        return { ...c, rank };
      });
  }

  function checksumBody(body) {
    let a = 0x42;
    let b = 0x17;
    for (let i = 0; i < body.length; i++) {
      const code = body.charCodeAt(i);
      a = (a + code + i) & 0xff;
      b = (b ^ ((code << (i % 5)) & 0xff) ^ a) & 0xff;
    }
    return ((a ^ b) & 0xff).toString(16).toUpperCase().padStart(2, '0');
  }

  function generateCode(state) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[s.performanceId];
    const body = 'M26/' + s.performanceId + '/' + s.deviceId + '/' + perf.counts.join('-');
    return body + '/' + checksumBody(body);
  }

  function parseCode(input) {
    const code = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
    const m = code.match(/^M26\/([1-4])\/(\d{2})\/(\d+(?:-\d+){6})\/([0-9A-F]{2})$/);
    if (!m) throw new Error('集計コードの形式が違います');
    const body = 'M26/' + m[1] + '/' + m[2] + '/' + m[3];
    const expected = checksumBody(body);
    if (expected !== m[4]) throw new Error('チェックサムが一致しません。入力ミスの可能性があります');
    const warning = EXPECTED_DEVICES.includes(m[2]) ? '' : '端末番号が01〜07以外です';
    return { performanceId: m[1], deviceId: m[2], counts: m[3].split('-').map(n => Math.max(0, Number(n))), checksum: m[4], code: body + '/' + m[4], warning };
  }

  function defaultAggregate() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = { devices: {} }; });
    return { version: 2, performances, updatedAt: new Date().toISOString() };
  }

  function loadAggregate() {
    try {
      const raw = JSON.parse(localStorage.getItem(AGG_KEY) || 'null');
      const agg = defaultAggregate();
      if (!raw) return agg;
      PERFORMANCES.forEach(id => {
        const devices = raw.performances && raw.performances[id] && raw.performances[id].devices ? raw.performances[id].devices : {};
        agg.performances[id].devices = devices;
      });
      agg.updatedAt = raw.updatedAt || new Date().toISOString();
      return agg;
    } catch (_) {
      return defaultAggregate();
    }
  }

  function saveAggregate(data) {
    const next = defaultAggregate();
    PERFORMANCES.forEach(id => {
      next.performances[id].devices = data.performances && data.performances[id] ? data.performances[id].devices || {} : {};
    });
    next.updatedAt = new Date().toISOString();
    localStorage.setItem(AGG_KEY, JSON.stringify(next));
    return next;
  }

  function importAggregateCode(code) {
    const parsed = parseCode(code);
    const agg = loadAggregate();
    agg.performances[parsed.performanceId].devices[parsed.deviceId] = {
      counts: parsed.counts,
      code: parsed.code,
      importedAt: new Date().toISOString(),
      warning: parsed.warning
    };
    saveAggregate(agg);
    return parsed;
  }

  function clearAggregate() {
    localStorage.removeItem(AGG_KEY);
    return loadAggregate();
  }

  function aggregateCountsForPerformance(agg, performanceId) {
    const a = agg || loadAggregate();
    const p = normalizePerformanceId(performanceId);
    const totals = CANDIDATES.map(() => 0);
    Object.values(a.performances[p].devices || {}).forEach(device => {
      CANDIDATES.forEach((_, i) => { totals[i] += Math.max(0, Number((device.counts || [])[i] || 0)); });
    });
    return totals;
  }

  function aggregateCountsAll(agg) {
    const totals = CANDIDATES.map(() => 0);
    PERFORMANCES.forEach(p => {
      const counts = aggregateCountsForPerformance(agg, p);
      CANDIDATES.forEach((_, i) => { totals[i] += counts[i]; });
    });
    return totals;
  }

  function missingDevices(agg, performanceId) {
    const devices = (agg || loadAggregate()).performances[normalizePerformanceId(performanceId)].devices || {};
    return EXPECTED_DEVICES.filter(id => !devices[id]);
  }

  function csvEscape(value) {
    const s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function rowsToCsv(rows) {
    return '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  }

  function rowsToTsv(rows) {
    return rows.map(row => row.map(value => String(value == null ? '' : value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n');
  }

  function deviceRows(state) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[s.performanceId];
    return [
      ['公演番号', s.performanceId],
      ['端末番号', s.deviceId],
      ['総投票数', totalVotesFromCounts(perf.counts)],
      [],
      ['No', '候補者', '票数'],
      ...CANDIDATES.map((c, i) => [c.number, c.name, perf.counts[i]])
    ];
  }

  function aggregateRowsForPerformance(agg, performanceId) {
    const a = agg || loadAggregate();
    const p = normalizePerformanceId(performanceId);
    const counts = aggregateCountsForPerformance(a, p);
    const devices = a.performances[p].devices || {};
    return [
      ['公演番号', p],
      ['取り込み端末数', Object.keys(devices).length],
      ['未取り込み端末', missingDevices(a, p).join(', ') || 'なし'],
      ['総投票数', totalVotesFromCounts(counts)],
      [],
      ['順位', 'No', '候補者', '票数'],
      ...rankingFromCounts(counts).map(c => [c.rank, c.number, c.name, c.votes])
    ];
  }

  function aggregateSummaryRows(agg) {
    const a = agg || loadAggregate();
    const rows = [['4公演合算'], ['総投票数', totalVotesFromCounts(aggregateCountsAll(a))], [], ['順位', 'No', '候補者', '票数']];
    rankingFromCounts(aggregateCountsAll(a)).forEach(c => rows.push([c.rank, c.number, c.name, c.votes]));
    PERFORMANCES.forEach(p => {
      rows.push([], ['公演' + p], ['順位', 'No', '候補者', '票数']);
      rankingFromCounts(aggregateCountsForPerformance(a, p)).forEach(c => rows.push([c.rank, c.number, c.name, c.votes]));
    });
    return rows;
  }

  function aggregateAllRows(agg) {
    const a = agg || loadAggregate();
    const rows = aggregateSummaryRows(a);
    rows.push([], ['端末別']);
    PERFORMANCES.forEach(p => {
      rows.push([], ['公演' + p], ['端末番号', ...CANDIDATES.map(c => c.name), '合計']);
      Object.keys(a.performances[p].devices || {}).sort().forEach(id => {
        const counts = a.performances[p].devices[id].counts || [];
        rows.push([id, ...CANDIDATES.map((_, i) => counts[i] || 0), totalVotesFromCounts(counts)]);
      });
    });
    return rows;
  }

  function makeDeviceCsv(state) { return rowsToCsv(deviceRows(state)); }
  function makeAggregateCsv(agg) { return rowsToCsv(aggregateAllRows(agg)); }
  function makePerformanceTsv(agg, performanceId) { return rowsToTsv(aggregateRowsForPerformance(agg, performanceId)); }
  function makeAllPerformancesTsv(agg) { return rowsToTsv(aggregateAllRows(agg)); }
  function makeOverallTsv(agg) { return rowsToTsv(aggregateSummaryRows(agg)); }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  window.M26 = {
    CANDIDATES, PERFORMANCES, EXPECTED_DEVICES,
    loadState, saveState, currentPerformance, setDeviceId, setPerformanceId, setVotingOpen,
    addVote, undoLastVote, adjustVote, resetCurrentPerformance, resetAllPerformances,
    totalVotes, totalVotesFromCounts, rankingFromCounts, generateCode, parseCode,
    loadAggregate, saveAggregate, importAggregateCode, clearAggregate,
    aggregateCountsForPerformance, aggregateCountsAll, missingDevices,
    makeDeviceCsv, makeAggregateCsv, makePerformanceTsv, makeAllPerformancesTsv, makeOverallTsv,
    rowsToTsv, downloadText, copyText, normalizeDeviceId, normalizePerformanceId
  };
})();
