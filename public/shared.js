(function () {
  'use strict';

  const APP_VERSION = 'v4';
  const STORAGE_KEY = 'm26-device-state-v2';
  const OLD_STORAGE_KEY = 'm26-device-state-v1';
  const AGG_KEY = 'm26-aggregate-state-v2';
  const PERFORMANCES = ['1', '2', '3', '4'];
  const EXPECTED_DEVICES = ['01', '02', '03', '04', '05', '06', '07'];

  const CANDIDATES = [
    { id: 1, number: 1, name: 'あかね', slug: 'akane', photo: './images/akane.jpg', color: '#A61E32' },
    { id: 2, number: 2, name: 'はまめろ', slug: 'hamamero', photo: './images/hamamero.jpg', color: '#B9273A' },
    { id: 3, number: 3, name: 'れいな', slug: 'reina', photo: './images/reina.jpg', color: '#7F1D2D' },
    { id: 4, number: 4, name: 'そらら', slug: 'sorara', photo: './images/sorara.jpg', color: '#C43B4E' },
    { id: 5, number: 5, name: 'ゆせぴ', slug: 'yusepi', photo: './images/yusepi.jpg', color: '#E54B60' },
    { id: 6, number: 6, name: 'るた', slug: 'ruta', photo: './images/ruta.jpg', color: '#8E2334' },
    { id: 7, number: 7, name: 'ひな', slug: 'hina', photo: './images/hina.jpg', color: '#D6364D' }
  ];
  const IMAGE_URLS = CANDIDATES.map(c => c.photo);

  function now() { return new Date().toISOString(); }
  function blankPerformance() { return { votingOpen: true, counts: CANDIDATES.map(() => 0), log: [], updatedAt: now() }; }
  function defaultState() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = blankPerformance(); });
    return { version: 2, appVersion: APP_VERSION, deviceId: '01', performanceId: '1', performances, updatedAt: now() };
  }

  function normalizeDeviceId(value) {
    const raw = String(value || '').trim().replace(/^iPad/i, '').replace(/[^\d]/g, '');
    if (!raw) return '01';
    return String(Math.max(1, Math.min(99, Number(raw) || 1))).padStart(2, '0');
  }

  function normalizePerformanceId(value) {
    const p = String(value || '1').trim();
    return PERFORMANCES.includes(p) ? p : '1';
  }

  function safeVoteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function normalizeCounts(counts, candidates) {
    if (Array.isArray(counts)) return CANDIDATES.map((_, i) => safeVoteNumber(counts[i]));
    if (Array.isArray(candidates)) {
      return CANDIDATES.map(c => {
        const found = candidates.find(item => item && String(item.id) === String(c.id));
        return safeVoteNumber(found && (found.votes != null ? found.votes : found.count));
      });
    }
    return CANDIDATES.map(() => 0);
  }

  function normalizeLog(log) {
    if (!Array.isArray(log)) return [];
    return log.filter(item => item && CANDIDATES.some(c => String(c.id) === String(item.candidateId))).map(item => ({
      candidateId: Number(item.candidateId),
      adjust: item.adjust == null ? undefined : Number(item.adjust) || 0,
      ts: item.ts || now()
    }));
  }

  function normalizeState(input) {
    const base = defaultState();
    const src = input && typeof input === 'object' ? input : {};
    base.deviceId = normalizeDeviceId(src.deviceId);
    base.performanceId = normalizePerformanceId(src.performanceId);
    PERFORMANCES.forEach(id => {
      const perf = src.performances && src.performances[id] ? src.performances[id] : {};
      base.performances[id] = {
        votingOpen: perf.votingOpen !== false,
        counts: normalizeCounts(perf.counts, perf.candidates || src.candidates),
        log: normalizeLog(perf.log || perf.voteLog || src.voteLog),
        updatedAt: perf.updatedAt || now()
      };
    });
    base.updatedAt = src.updatedAt || now();
    return base;
  }

  function migrateOldState() {
    try {
      const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) || 'null');
      if (!old) return null;
      const next = defaultState();
      next.deviceId = normalizeDeviceId(old.deviceId);
      next.performances['1'].votingOpen = old.votingOpen !== false;
      next.performances['1'].counts = normalizeCounts(old.counts, old.candidates);
      next.performances['1'].log = normalizeLog(old.log || old.voteLog);
      return next;
    } catch (_) {
      return null;
    }
  }

  function saveState(state) {
    const next = normalizeState(state);
    next.appVersion = APP_VERSION;
    next.updatedAt = now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return saveState(JSON.parse(raw));
      const migrated = migrateOldState();
      return migrated ? saveState(migrated) : saveState(defaultState());
    } catch (_) {
      return saveState(defaultState());
    }
  }

  function currentPerformance(state) {
    const s = normalizeState(state || loadState());
    return s.performances[s.performanceId] || blankPerformance();
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

  function candidateIndex(candidateId) {
    return CANDIDATES.findIndex(c => String(c.id) === String(candidateId));
  }

  function addVote(candidateId) {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    if (!perf.votingOpen) throw new Error('投票は締め切られています。');
    const index = candidateIndex(candidateId);
    if (index < 0) throw new Error('候補者データを読み込めませんでした。画面を更新してください。');
    perf.counts[index] = safeVoteNumber(perf.counts[index]) + 1;
    perf.log.push({ candidateId: CANDIDATES[index].id, ts: now() });
    perf.updatedAt = now();
    return saveState(state);
  }

  function undoLastVote() {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    const last = perf.log.pop();
    if (!last) throw new Error('取り消せる投票がありません。');
    const index = candidateIndex(last.candidateId);
    if (index >= 0) {
      const delta = last.adjust == null ? 1 : Number(last.adjust) || 0;
      perf.counts[index] = Math.max(0, safeVoteNumber(perf.counts[index]) - delta);
    }
    perf.updatedAt = now();
    return saveState(state);
  }

  function adjustVote(candidateId, delta) {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    const index = candidateIndex(candidateId);
    if (index < 0) throw new Error('候補者データを読み込めませんでした。');
    const d = Number(delta || 0);
    perf.counts[index] = Math.max(0, safeVoteNumber(perf.counts[index]) + d);
    perf.log.push({ candidateId: CANDIDATES[index].id, adjust: d, ts: now() });
    perf.updatedAt = now();
    return saveState(state);
  }

  function resetCurrentPerformance() {
    const state = loadState();
    state.performances[state.performanceId] = blankPerformance();
    return saveState(state);
  }

  function resetAllPerformances() {
    const state = loadState();
    const next = defaultState();
    next.deviceId = state.deviceId;
    next.performanceId = state.performanceId;
    return saveState(next);
  }

  function resetLocalData() {
    [STORAGE_KEY, OLD_STORAGE_KEY, AGG_KEY, 'candidates', 'votes', 'voteLog', 'm26-candidates', 'm26-votes', 'm26-voteLog'].forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
    });
    return saveState(defaultState());
  }

  function totalVotesFromCounts(counts) {
    return normalizeCounts(counts).reduce((sum, n) => sum + n, 0);
  }

  function totalVotes(state, performanceId) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[normalizePerformanceId(performanceId || s.performanceId)];
    return totalVotesFromCounts(perf && perf.counts);
  }

  function rankingFromCounts(counts) {
    let lastVotes = null;
    let lastRank = 0;
    return CANDIDATES.map((c, i) => ({ ...c, votes: safeVoteNumber((counts || [])[i]) }))
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
    if (!m) throw new Error('集計コードの形式が違います。');
    const body = 'M26/' + m[1] + '/' + m[2] + '/' + m[3];
    const expected = checksumBody(body);
    if (expected !== m[4]) throw new Error('チェックサムが一致しません。入力ミスの可能性があります。');
    const warning = EXPECTED_DEVICES.includes(m[2]) ? '' : '端末番号が01-07以外です。';
    return { performanceId: m[1], deviceId: m[2], counts: normalizeCounts(m[3].split('-')), checksum: m[4], code: body + '/' + m[4], warning };
  }

  function defaultAggregate() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = { devices: {} }; });
    return { version: 2, appVersion: APP_VERSION, performances, updatedAt: now() };
  }

  function loadAggregate() {
    try {
      const raw = JSON.parse(localStorage.getItem(AGG_KEY) || 'null');
      const agg = defaultAggregate();
      if (!raw || !raw.performances) return agg;
      PERFORMANCES.forEach(id => {
        const devices = raw.performances[id] && raw.performances[id].devices ? raw.performances[id].devices : {};
        Object.keys(devices).forEach(deviceId => {
          agg.performances[id].devices[normalizeDeviceId(deviceId)] = {
            counts: normalizeCounts(devices[deviceId].counts),
            code: devices[deviceId].code || '',
            importedAt: devices[deviceId].importedAt || now(),
            warning: devices[deviceId].warning || ''
          };
        });
      });
      agg.updatedAt = raw.updatedAt || now();
      return agg;
    } catch (_) {
      return defaultAggregate();
    }
  }

  function saveAggregate(data) {
    const next = defaultAggregate();
    const src = data && data.performances ? data.performances : {};
    PERFORMANCES.forEach(id => {
      const devices = src[id] && src[id].devices ? src[id].devices : {};
      Object.keys(devices).forEach(deviceId => {
        next.performances[id].devices[normalizeDeviceId(deviceId)] = {
          counts: normalizeCounts(devices[deviceId].counts),
          code: devices[deviceId].code || '',
          importedAt: devices[deviceId].importedAt || now(),
          warning: devices[deviceId].warning || ''
        };
      });
    });
    next.updatedAt = now();
    localStorage.setItem(AGG_KEY, JSON.stringify(next));
    return next;
  }

  function importAggregateCode(code) {
    const parsed = parseCode(code);
    const agg = loadAggregate();
    agg.performances[parsed.performanceId].devices[parsed.deviceId] = {
      counts: parsed.counts,
      code: parsed.code,
      importedAt: now(),
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
    const devices = a.performances[p] && a.performances[p].devices ? a.performances[p].devices : {};
    Object.values(devices).forEach(device => {
      normalizeCounts(device.counts).forEach((count, i) => { totals[i] += count; });
    });
    return totals;
  }

  function aggregateCountsAll(agg) {
    const totals = CANDIDATES.map(() => 0);
    PERFORMANCES.forEach(p => {
      aggregateCountsForPerformance(agg, p).forEach((count, i) => { totals[i] += count; });
    });
    return totals;
  }

  function missingDevices(agg, performanceId) {
    const a = agg || loadAggregate();
    const p = normalizePerformanceId(performanceId);
    const devices = a.performances[p] && a.performances[p].devices ? a.performances[p].devices : {};
    return EXPECTED_DEVICES.filter(id => !devices[id]);
  }

  function csvEscape(value) {
    const s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function rowsToCsv(rows) { return '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n'); }
  function rowsToTsv(rows) { return rows.map(row => row.map(value => String(value == null ? '' : value).replace(/\t/g, ' ').replace(/\r?\n/g, ' ')).join('\t')).join('\n'); }

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
    const rows = [['4公演合計'], ['総投票数', totalVotesFromCounts(aggregateCountsAll(a))], [], ['順位', 'No', '候補者', '票数']];
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
        const counts = normalizeCounts(a.performances[p].devices[id].counts);
        rows.push([id, ...counts, totalVotesFromCounts(counts)]);
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
    APP_VERSION, CANDIDATES, IMAGE_URLS, PERFORMANCES, EXPECTED_DEVICES,
    loadState, saveState, currentPerformance, setDeviceId, setPerformanceId, setVotingOpen,
    addVote, undoLastVote, adjustVote, resetCurrentPerformance, resetAllPerformances, resetLocalData,
    totalVotes, totalVotesFromCounts, rankingFromCounts, generateCode, parseCode,
    loadAggregate, saveAggregate, importAggregateCode, clearAggregate,
    aggregateCountsForPerformance, aggregateCountsAll, missingDevices,
    makeDeviceCsv, makeAggregateCsv, makePerformanceTsv, makeAllPerformancesTsv, makeOverallTsv,
    rowsToTsv, downloadText, copyText, normalizeDeviceId, normalizePerformanceId
  };
})();
