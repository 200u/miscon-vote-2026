(function () {
  'use strict';

  const APP_VERSION = '20260620-final';
  const STORAGE_KEY = 'm26-device-state-v3';
  const OLD_STORAGE_KEYS = ['m26-device-state-v2', 'm26-device-state-v1', 'm26-votes', 'm26-state', 'votes', 'voteState'];
  const AGG_KEY = 'm26-aggregate-state-v3';
  const PERFORMANCES = ['1', '2', '3', '4'];
  const EXPECTED_DEVICES = ['01', '02', '03', '04', '05', '06', '07'];

  const CANDIDATES = [
    { id: 'akane', number: 1, name: 'あかね', photo: './images/akane.jpg' },
    { id: 'hamamero', number: 2, name: 'はまめろ', photo: './images/hamamero.jpg' },
    { id: 'reina', number: 3, name: 'れいな', photo: './images/reina.jpg' },
    { id: 'sorara', number: 4, name: 'そらら', photo: './images/sorara.jpg' },
    { id: 'yusepi', number: 5, name: 'ゆせぴ', photo: './images/yusepi.jpg' },
    { id: 'ruta', number: 6, name: 'るた', photo: './images/ruta.jpg' },
    { id: 'hina', number: 7, name: 'ひな', photo: './images/hina.jpg' }
  ];

  function now() {
    return new Date().toISOString();
  }

  function blankPerformance() {
    return { votingOpen: true, counts: CANDIDATES.map(() => 0), log: [], updatedAt: now() };
  }

  function defaultState() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = blankPerformance(); });
    return { version: 3, appVersion: APP_VERSION, deviceId: '01', performanceId: '1', performances, updatedAt: now() };
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

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function candidateIndex(candidateId) {
    const id = String(candidateId == null ? '' : candidateId);
    return CANDIDATES.findIndex(c => c.id === id || String(c.number) === id);
  }

  function normalizeCounts(counts) {
    if (Array.isArray(counts)) return CANDIDATES.map((_, i) => safeNumber(counts[i]));
    if (counts && typeof counts === 'object') {
      return CANDIDATES.map(c => safeNumber(counts[c.id] ?? counts[c.number] ?? counts[c.name]));
    }
    return CANDIDATES.map(() => 0);
  }

  function normalizeLog(log) {
    if (!Array.isArray(log)) return [];
    return log.map(item => {
      const idx = candidateIndex(item && (item.candidateId ?? item.id));
      if (idx < 0) return null;
      return {
        candidateId: CANDIDATES[idx].id,
        adjust: item.adjust == null ? undefined : Number(item.adjust),
        ts: item.ts || item.createdAt || now()
      };
    }).filter(Boolean);
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
        log: normalizeLog(perf.log || perf.voteLog),
        updatedAt: perf.updatedAt || now()
      };
    });
    base.updatedAt = src.updatedAt || now();
    return base;
  }

  function migrateStateFromAnyKey() {
    for (const key of OLD_STORAGE_KEYS) {
      try {
        const raw = JSON.parse(localStorage.getItem(key) || 'null');
        if (!raw || typeof raw !== 'object') continue;
        if (raw.performances) return normalizeState(raw);
        const migrated = defaultState();
        migrated.deviceId = normalizeDeviceId(raw.deviceId || raw.tabletId || raw.terminalId);
        migrated.performanceId = normalizePerformanceId(raw.performanceId || raw.performance || raw.stage);
        const perf = migrated.performances[migrated.performanceId];
        perf.counts = normalizeCounts(raw.counts || raw.votes || raw.candidates);
        perf.log = normalizeLog(raw.log || raw.voteLog || raw.history);
        perf.votingOpen = raw.votingOpen !== false && raw.closed !== true;
        return migrated;
      } catch (_) {}
    }
    return null;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeState(JSON.parse(raw));
      const migrated = migrateStateFromAnyKey();
      if (migrated) return saveState(migrated);
    } catch (_) {}
    return defaultState();
  }

  function saveState(state) {
    const next = normalizeState(state);
    next.updatedAt = now();
    next.appVersion = APP_VERSION;
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
    if (!perf.votingOpen) throw new Error('投票は締め切られています。');
    const index = candidateIndex(candidateId);
    if (index < 0) throw new Error('候補者IDが不正です。');
    perf.counts[index] += 1;
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
      const delta = last.adjust == null ? 1 : Number(last.adjust);
      perf.counts[index] = Math.max(0, perf.counts[index] - delta);
    }
    perf.updatedAt = now();
    return saveState(state);
  }

  function adjustVote(candidateId, delta) {
    const state = loadState();
    const perf = state.performances[state.performanceId];
    const index = candidateIndex(candidateId);
    if (index < 0) throw new Error('候補者IDが不正です。');
    const d = Number(delta || 0);
    perf.counts[index] = Math.max(0, perf.counts[index] + d);
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

  function clearDeviceStorage() {
    [STORAGE_KEY, ...OLD_STORAGE_KEYS].forEach(key => localStorage.removeItem(key));
    return saveState(defaultState());
  }

  async function refreshAppCache() {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.update().catch(() => undefined)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => !key.includes(APP_VERSION)).map(key => caches.delete(key)));
    }
  }

  async function unregisterServiceWorkersAndClearCaches() {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister().catch(() => undefined)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
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
    return CANDIDATES.map((c, i) => ({ ...c, votes: safeNumber((counts || [])[i]) }))
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
    return { performanceId: m[1], deviceId: m[2], counts: m[3].split('-').map(safeNumber), checksum: m[4], code: body + '/' + m[4], warning };
  }

  function defaultAggregate() {
    const performances = {};
    PERFORMANCES.forEach(id => { performances[id] = { devices: {} }; });
    return { version: 3, appVersion: APP_VERSION, performances, updatedAt: now() };
  }

  function loadAggregate() {
    try {
      const raw = JSON.parse(localStorage.getItem(AGG_KEY) || 'null');
      const agg = defaultAggregate();
      if (!raw) return agg;
      PERFORMANCES.forEach(id => {
        const devices = raw.performances && raw.performances[id] && raw.performances[id].devices ? raw.performances[id].devices : {};
        Object.keys(devices).forEach(deviceId => {
          agg.performances[id].devices[normalizeDeviceId(deviceId)] = {
            counts: normalizeCounts(devices[deviceId].counts),
            code: devices[deviceId].code || '',
            importedAt: devices[deviceId].importedAt || now(),
            warning: devices[deviceId].warning || ''
          };
        });
      });
      return agg;
    } catch (_) {
      return defaultAggregate();
    }
  }

  function saveAggregate(data) {
    const next = defaultAggregate();
    PERFORMANCES.forEach(id => {
      const devices = data.performances && data.performances[id] ? data.performances[id].devices || {} : {};
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
    Object.values(a.performances[p].devices || {}).forEach(device => {
      normalizeCounts(device.counts).forEach((n, i) => { totals[i] += n; });
    });
    return totals;
  }

  function aggregateCountsAll(agg) {
    const totals = CANDIDATES.map(() => 0);
    PERFORMANCES.forEach(p => {
      aggregateCountsForPerformance(agg, p).forEach((n, i) => { totals[i] += n; });
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
      ['公演', s.performanceId],
      ['端末', s.deviceId],
      ['合計', totalVotesFromCounts(perf.counts)],
      [],
      ['No', '候補者', '票数'],
      ...CANDIDATES.map((c, i) => [c.number, c.name, perf.counts[i]])
    ];
  }

  function oneLineSummary(state) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[s.performanceId];
    return '公演' + s.performanceId + ' 端末' + s.deviceId + ' ' +
      CANDIDATES.map((c, i) => c.name + perf.counts[i]).join(' ') +
      ' 合計' + totalVotesFromCounts(perf.counts);
  }

  function devicePasteTsv(state) {
    const s = normalizeState(state || loadState());
    const perf = s.performances[s.performanceId];
    return rowsToTsv([
      ['公演', '端末', ...CANDIDATES.map(c => c.name), '合計'],
      [s.performanceId, s.deviceId, ...CANDIDATES.map((_, i) => perf.counts[i]), totalVotesFromCounts(perf.counts)]
    ]);
  }

  function aggregateRowsForPerformance(agg, performanceId) {
    const a = agg || loadAggregate();
    const p = normalizePerformanceId(performanceId);
    const counts = aggregateCountsForPerformance(a, p);
    const devices = a.performances[p].devices || {};
    return [
      ['公演', p],
      ['取り込み端末数', Object.keys(devices).length],
      ['未取り込み端末', missingDevices(a, p).join(', ') || 'なし'],
      ['合計', totalVotesFromCounts(counts)],
      [],
      ['順位', 'No', '候補者', '票数'],
      ...rankingFromCounts(counts).map(c => [c.rank, c.number, c.name, c.votes])
    ];
  }

  function aggregateSummaryRows(agg) {
    const a = agg || loadAggregate();
    const rows = [['4公演合計'], ['合計', totalVotesFromCounts(aggregateCountsAll(a))], [], ['順位', 'No', '候補者', '票数']];
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
      rows.push([], ['公演' + p], ['端末', ...CANDIDATES.map(c => c.name), '合計']);
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
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  window.M26 = {
    APP_VERSION, STORAGE_KEY, CANDIDATES, PERFORMANCES, EXPECTED_DEVICES,
    loadState, saveState, currentPerformance, setDeviceId, setPerformanceId, setVotingOpen,
    addVote, undoLastVote, adjustVote, resetCurrentPerformance, resetAllPerformances, clearDeviceStorage,
    refreshAppCache, unregisterServiceWorkersAndClearCaches,
    totalVotes, totalVotesFromCounts, rankingFromCounts, generateCode, parseCode,
    loadAggregate, saveAggregate, importAggregateCode, clearAggregate,
    aggregateCountsForPerformance, aggregateCountsAll, missingDevices,
    makeDeviceCsv, makeAggregateCsv, makePerformanceTsv, makeAllPerformancesTsv, makeOverallTsv,
    oneLineSummary, devicePasteTsv, rowsToTsv, downloadText, copyText,
    normalizeDeviceId, normalizePerformanceId, esc
  };
})();
