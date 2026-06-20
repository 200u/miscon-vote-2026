(function () {
  'use strict';

  const QRCodeV3 = (function () {
    const size = 29;
    const dataCodewords = 55;
    const ecCodewords = 15;
    const gfExp = new Array(512);
    const gfLog = new Array(256);
    let x = 1;

    for (let i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

    function mul(a, b) { return a && b ? gfExp[gfLog[a] + gfLog[b]] : 0; }
    function polyMul(p, q) {
      const r = Array(p.length + q.length - 1).fill(0);
      for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) r[i + j] ^= mul(p[i], q[j]);
      return r;
    }
    function generator(degree) {
      let g = [1];
      for (let i = 0; i < degree; i++) g = polyMul(g, [1, gfExp[i]]);
      return g;
    }
    function reedSolomon(data) {
      const gen = generator(ecCodewords);
      const res = data.concat(Array(ecCodewords).fill(0));
      for (let i = 0; i < data.length; i++) {
        const coef = res[i];
        if (!coef) continue;
        for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], coef);
      }
      return res.slice(data.length);
    }
    function bitBuffer(text) {
      const data = Array.from(new TextEncoder().encode(text));
      if (data.length > 53) throw new Error('QR code text is too long');
      const bits = [];
      function push(value, len) { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
      push(4, 4);
      push(data.length, 8);
      data.forEach(b => push(b, 8));
      const maxBits = dataCodewords * 8;
      for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
      while (bits.length % 8) bits.push(0);
      const words = [];
      for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0));
      let pad = 0;
      while (words.length < dataCodewords) words.push(pad++ % 2 ? 0x11 : 0xec);
      return words;
    }
    function matrix(text) {
      const m = Array.from({ length: size }, () => Array(size).fill(null));
      const reserved = Array.from({ length: size }, () => Array(size).fill(false));
      function set(r, c, v, res) {
        if (r < 0 || c < 0 || r >= size || c >= size) return;
        m[r][c] = v;
        if (res) reserved[r][c] = true;
      }
      function finder(r, c) {
        for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
          const rr = r + y, cc = c + x;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const dark = y >= 0 && y <= 6 && x >= 0 && x <= 6 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
          set(rr, cc, dark, true);
        }
      }
      finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
      for (let i = 8; i < size - 8; i++) {
        set(6, i, i % 2 === 0, true);
        set(i, 6, i % 2 === 0, true);
      }
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const d = Math.max(Math.abs(x), Math.abs(y));
        set(22 + y, 22 + x, d !== 1, true);
      }
      set(size - 8, 8, true, true);
      const format = '111011111000100';
      const pos1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
      const pos2 = [[size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],[8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]];
      for (let i = 0; i < 15; i++) {
        set(pos1[i][0], pos1[i][1], format[i] === '1', true);
        set(pos2[i][0], pos2[i][1], format[i] === '1', true);
      }
      const all = bitBuffer(text).concat(reedSolomon(bitBuffer(text)));
      const bits = [];
      all.forEach(w => { for (let i = 7; i >= 0; i--) bits.push((w >>> i) & 1); });
      let bit = 0;
      let upward = true;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        for (let rowOffset = 0; rowOffset < size; rowOffset++) {
          const row = upward ? size - 1 - rowOffset : rowOffset;
          for (let dx = 0; dx < 2; dx++) {
            const c = col - dx;
            if (reserved[row][c]) continue;
            const mask = (row + c) % 2 === 0;
            set(row, c, Boolean((bits[bit++] || 0) ^ (mask ? 1 : 0)), false);
          }
        }
        upward = !upward;
      }
      return m.map(row => row.map(Boolean));
    }
    function draw(canvas, text) {
      const m = matrix(text);
      const quiet = 4;
      const scale = Math.floor(Math.min(canvas.width || 260, canvas.height || 260) / (size + quiet * 2)) || 6;
      const w = (size + quiet * 2) * scale;
      canvas.width = w;
      canvas.height = w;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, w);
      ctx.fillStyle = '#101112';
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return { draw };
  })();

  window.QRCodeV3 = QRCodeV3;
})();
