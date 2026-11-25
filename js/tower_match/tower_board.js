/**
 * ============================================================================
 * محرك لوحة الألغاز v2.0 — «برج التحدي اللانهائي» (Tower Match-3)
 * المسار: js/tower_match/tower_board.js
 * التحديثات في v2.0:
 * - مدفع عمودي (col_blast) ومدفع أفقي (row_blast) + قنبلة 3×3 + جوهرة الطيف
 * - تفاعلات خارقة (Super Combos): قنبلة + مدفع = صليب عريض (3 صفوف + 3 أعمدة)
 * - عقبات الجليد المتدرجة (ice: 1..2) بعد الطابق 10 + أقفال الزعماء (locked)
 * - قطع «المنتجات الذهبية» من متجر معاذ (golden: true) لمكافأة نقاط فورية
 * - قدرات الزعماء على اللوحة (قفل قطع، تبديل قطعتين، تجميد جليدي)
 * ============================================================================
 */
(function () {
  const DEFAULT_TILE_KEYS = ["sword", "clock", "coin", "star", "emerald", "bolt"];

  function hashSeedToUint32(seedInput) {
    const str = String(seedInput ?? "moaath_default_seed");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function createSeededRNG(seedInput) {
    let a = hashSeedToUint32(seedInput);
    return function nextRand() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class TowerBoard {
    constructor(options = {}) {
      this.rows = Math.max(5, Math.min(8, parseInt(options.rows, 10) || 6));
      this.cols = Math.max(5, Math.min(8, parseInt(options.cols, 10) || 6));
      this.tileKeys = Array.isArray(options.tileKeys) && options.tileKeys.length >= 4
        ? options.tileKeys.slice()
        : (window.MoaathTowerAssets?.TILE_KEYS || DEFAULT_TILE_KEYS).slice();

      this.seed = options.seed || `tower_${Date.now()}`;
      this.rng = createSeededRNG(this.seed);
      this._uidCounter = 1;
      this.grid = [];
      this.moveCount = 0;

      this.initBoard();
    }

    _nextId() { return this._uidCounter++; }

    _randomType() {
      const idx = Math.floor(this.rng() * this.tileKeys.length);
      return this.tileKeys[idx] || this.tileKeys[0];
    }

    _makeTile(type, special = null, locked = 0, ice = 0, golden = false) {
      return {
        uid: this._nextId(),
        type: type || this._randomType(),
        special: special || null, // null | 'row_blast' | 'col_blast' | 'bomb_3x3' | 'prism_core'
        locked: Math.max(0, parseInt(locked, 10) || 0),
        ice: Math.max(0, parseInt(ice, 10) || 0),
        golden: !!golden
      };
    }

    inBounds(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
    isAdjacent(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1; }

    initBoard() {
      this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          let type = this._randomType();
          let guard = 0;
          while (guard < 25 && this._wouldCreateInitialMatch(r, c, type)) {
            type = this._randomType();
            guard++;
          }
          this.grid[r][c] = this._makeTile(type);
        }
      }
      if (!this.hasValidMoves()) this.shuffleBoard();
      return this.getSnapshot();
    }

    _wouldCreateInitialMatch(r, c, type) {
      if (c >= 2 && this.grid[r][c - 1]?.type === type && this.grid[r][c - 2]?.type === type) return true;
      if (r >= 2 && this.grid[r - 1][c]?.type === type && this.grid[r - 2][c]?.type === type) return true;
      return false;
    }

    getSnapshot() {
      return this.grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    }

    // وضع قنبلة بداية (أداة تكتيكية)
    spawnStartingSpecial(specialType = "bomb_3x3") {
      const r = Math.floor(this.rows / 2);
      const c = Math.floor(this.cols / 2);
      if (this.grid[r]?.[c]) {
        this.grid[r][c].special = specialType;
      }
      return this.getSnapshot();
    }

    // قطعة منتج ذهبي نادرة من متجر معاذ (كل 3 طوابق)
    spawnGoldenProductTile() {
      const pool = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c];
          if (t && !t.special && !t.golden && t.locked === 0) pool.push({ r, c });
        }
      }
      if (!pool.length) return null;
      const pick = pool[Math.floor(this.rng() * pool.length)];
      this.grid[pick.r][pick.c].golden = true;
      return pick;
    }

    // أقفال الزعيم
    applyBossLocks(count = 2) {
      const candidates = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c];
          if (t && t.locked === 0 && !t.special) candidates.push([r, c]);
        }
      }
      const lockedCoords = [];
      let n = Math.min(count, candidates.length);
      while (n > 0 && candidates.length > 0) {
        const idx = Math.floor(this.rng() * candidates.length);
        const [r, c] = candidates.splice(idx, 1)[0];
        this.grid[r][c].locked = 1;
        lockedCoords.push({ r, c });
        n--;
      }
      return lockedCoords;
    }

    // عقبات الجليد المتدرجة (طبقتان بعد الطابق 10)
    applyIceObstacles(count = 2, layers = 2) {
      const candidates = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c];
          if (t && t.ice === 0 && t.locked === 0 && !t.special) candidates.push([r, c]);
        }
      }
      const iced = [];
      let n = Math.min(count, candidates.length);
      while (n > 0 && candidates.length > 0) {
        const idx = Math.floor(this.rng() * candidates.length);
        const [r, c] = candidates.splice(idx, 1)[0];
        this.grid[r][c].ice = layers;
        iced.push({ r, c });
        n--;
      }
      return iced;
    }

    // قدرة العملاق السيبراني: قلب مكان قطعتين عشوائياً
    bossSwapRandomPair() {
      const pool = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c];
          if (t && t.locked === 0 && !t.special) pool.push({ r, c });
        }
      }
      if (pool.length < 2) return null;
      const i1 = Math.floor(this.rng() * pool.length);
      const p1 = pool.splice(i1, 1)[0];
      const i2 = Math.floor(this.rng() * pool.length);
      const p2 = pool[i2];
      const tmp = this.grid[p1.r][p1.c];
      this.grid[p1.r][p1.c] = this.grid[p2.r][p2.c];
      this.grid[p2.r][p2.c] = tmp;
      return { p1, p2 };
    }

    findMatchGroups() {
      const horizRuns = [];
      const vertRuns = [];

      for (let r = 0; r < this.rows; r++) {
        let c = 0;
        while (c < this.cols) {
          const cell = this.grid[r][c];
          if (!cell || cell.special === "prism_core") { c++; continue; }
          let end = c + 1;
          while (end < this.cols && this.grid[r][end] && this.grid[r][end].special !== "prism_core" && this.grid[r][end].type === cell.type) end++;
          if (end - c >= 3) {
            const cells = [];
            for (let k = c; k < end; k++) cells.push({ r, c: k });
            horizRuns.push({ type: cell.type, dir: "h", cells });
          }
          c = end;
        }
      }

      for (let c = 0; c < this.cols; c++) {
        let r = 0;
        while (r < this.rows) {
          const cell = this.grid[r][c];
          if (!cell || cell.special === "prism_core") { r++; continue; }
          let end = r + 1;
          while (end < this.rows && this.grid[end][c] && this.grid[end][c].special !== "prism_core" && this.grid[end][c].type === cell.type) end++;
          if (end - r >= 3) {
            const cells = [];
            for (let k = r; k < end; k++) cells.push({ r: k, c });
            vertRuns.push({ type: cell.type, dir: "v", cells });
          }
          r = end;
        }
      }

      const allRuns = [...horizRuns, ...vertRuns];
      const used = new Array(allRuns.length).fill(false);
      const groups = [];

      for (let i = 0; i < allRuns.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const base = allRuns[i];
        const cellMap = new Map();
        base.cells.forEach((p) => cellMap.set(`${p.r},${p.c}`, p));
        let hasH = base.dir === "h";
        let hasV = base.dir === "v";

        let merged = true;
        while (merged) {
          merged = false;
          for (let j = 0; j < allRuns.length; j++) {
            if (used[j] || allRuns[j].type !== base.type) continue;
            if (allRuns[j].cells.some((p) => cellMap.has(`${p.r},${p.c}`))) {
              used[j] = true;
              if (allRuns[j].dir === "h") hasH = true;
              if (allRuns[j].dir === "v") hasV = true;
              allRuns[j].cells.forEach((p) => cellMap.set(`${p.r},${p.c}`, p));
              merged = true;
            }
          }
        }

        const mergedCells = Array.from(cellMap.values());
        let spawnSpecial = null;
        if (mergedCells.length >= 5 && !(hasH && hasV)) {
          spawnSpecial = "prism_core";
        } else if (hasH && hasV && mergedCells.length >= 5) {
          spawnSpecial = "bomb_3x3";
        } else if (mergedCells.length === 4) {
          // 4 أفقياً = مدفع صف، 4 عمودياً = مدفع عمود
          spawnSpecial = hasV && !hasH ? "col_blast" : "row_blast";
        }

        groups.push({ type: base.type, cells: mergedCells, spawnSpecial });
      }
      return groups;
    }

    trySwap(r1, c1, r2, c2) {
      if (!this.inBounds(r1, c1) || !this.inBounds(r2, c2)) return { valid: false, reason: "out_of_bounds" };
      if (!this.isAdjacent(r1, c1, r2, c2)) return { valid: false, reason: "not_adjacent" };
      const t1 = this.grid[r1][c1];
      const t2 = this.grid[r2][c2];
      if (!t1 || !t2) return { valid: false, reason: "empty_cell" };
      if (t1.locked > 0 || t2.locked > 0) return { valid: false, reason: "tile_locked" };

      this.grid[r1][c1] = t2;
      this.grid[r2][c2] = t1;

      const isPrismCombo = t1.special === "prism_core" || t2.special === "prism_core";
      const isDoubleSpecial = !!(t1.special && t2.special);
      const isSingleSpecial = !!(t1.special || t2.special) && !isDoubleSpecial && !isPrismCombo;

      if (!isPrismCombo && !isDoubleSpecial && !isSingleSpecial) {
        if (this.findMatchGroups().length === 0) {
          this.grid[r1][c1] = t1;
          this.grid[r2][c2] = t2;
          return { valid: false, reason: "no_match" };
        }
      }

      this.moveCount++;
      const steps = [];
      let comboLevel = 0;

      if (isPrismCombo || isDoubleSpecial || isSingleSpecial) {
        comboLevel = 1;
        const specialStep = this._resolveSpecialSwap(r1, c1, r2, c2, t2, t1);
        steps.push(specialStep);
        this._applyGravityAndRefill(specialStep);
      }

      let guard = 0;
      while (guard < 20) {
        const groups = this.findMatchGroups();
        if (!groups.length) break;
        comboLevel++;
        const pivot = comboLevel === 1 ? { r: r2, c: c2 } : null;
        const step = this._clearGroups(groups, comboLevel, pivot);
        this._applyGravityAndRefill(step);
        steps.push(step);
        guard++;
      }

      let reshuffled = false;
      if (!this.hasValidMoves()) {
        this.shuffleBoard();
        reshuffled = true;
      }

      return {
        valid: true,
        swap: { r1, c1, r2, c2 },
        steps,
        totals: this._aggregateSteps(steps, comboLevel),
        reshuffled,
        boardAfter: this.getSnapshot()
      };
    }

    detonateSpecial(r, c) {
      if (!this.inBounds(r, c)) return { valid: false, reason: "out_of_bounds" };
      const cell = this.grid[r][c];
      if (!cell || !cell.special || cell.locked > 0) return { valid: false, reason: "not_special" };

      this.moveCount++;
      const toClear = new Map();
      const specialsTriggered = [{ type: cell.special, r, c }];
      const addCell = (nr, nc) => {
        if (this.inBounds(nr, nc) && this.grid[nr][nc]) toClear.set(`${nr},${nc}`, { r: nr, c: nc });
      };
      addCell(r, c);
      this._expandSpecialArea(cell.special, r, c, addCell);

      const steps = [];
      let comboLevel = 1;
      const firstStep = this._executeClearMap(toClear, [], specialsTriggered, comboLevel);
      this._applyGravityAndRefill(firstStep);
      steps.push(firstStep);

      let guard = 0;
      while (guard < 20) {
        const groups = this.findMatchGroups();
        if (!groups.length) break;
        comboLevel++;
        const step = this._clearGroups(groups, comboLevel, null);
        this._applyGravityAndRefill(step);
        steps.push(step);
        guard++;
      }

      let reshuffled = false;
      if (!this.hasValidMoves()) { this.shuffleBoard(); reshuffled = true; }

      return {
        valid: true,
        swap: { r1: r, c1: c, r2: r, c2: c },
        steps,
        totals: this._aggregateSteps(steps, comboLevel),
        reshuffled,
        boardAfter: this.getSnapshot()
      };
    }

    _expandSpecialArea(spType, r, c, addCell) {
      if (spType === "row_blast") {
        for (let cc = 0; cc < this.cols; cc++) addCell(r, cc);
      } else if (spType === "col_blast") {
        for (let rr = 0; rr < this.rows; rr++) addCell(rr, c);
      } else if (spType === "bomb_3x3") {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) addCell(r + dr, c + dc);
        }
      } else if (spType === "prism_core") {
        const target = this._randomType();
        for (let rr = 0; rr < this.rows; rr++) {
          for (let cc = 0; cc < this.cols; cc++) {
            if (this.grid[rr][cc]?.type === target) addCell(rr, cc);
          }
        }
      }
    }

    _resolveSpecialSwap(r1, c1, r2, c2, cellAt1, cellAt2) {
      const toClear = new Map();
      const specialsTriggered = [];
      const addCell = (r, c) => {
        if (this.inBounds(r, c) && this.grid[r][c]) toClear.set(`${r},${c}`, { r, c });
      };
      addCell(r1, c1);
      addCell(r2, c2);

      if (cellAt1.special === "prism_core" && cellAt2.special === "prism_core") {
        specialsTriggered.push({ type: "prism_double", r: r2, c: c2 });
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) addCell(r, c);
      } else if (cellAt1.special === "prism_core" || cellAt2.special === "prism_core") {
        const targetType = cellAt1.special === "prism_core" ? cellAt2.type : cellAt1.type;
        specialsTriggered.push({ type: "prism_core", r: r2, c: c2, targetType });
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if (this.grid[r][c]?.type === targetType) addCell(r, c);
          }
        }
      } else if (cellAt1.special && cellAt2.special) {
        // Super Combo: صليب عريض (3 صفوف + 3 أعمدة)
        specialsTriggered.push({ type: "super_cross", r: r2, c: c2 });
        for (let dr = -1; dr <= 1; dr++) {
          for (let c = 0; c < this.cols; c++) addCell(r2 + dr, c);
        }
        for (let dc = -1; dc <= 1; dc++) {
          for (let r = 0; r < this.rows; r++) addCell(r, c2 + dc);
        }
      } else {
        const spR = cellAt1.special ? r1 : r2;
        const spC = cellAt1.special ? c1 : c2;
        const spType = cellAt1.special ? cellAt1.special : cellAt2.special;
        specialsTriggered.push({ type: spType, r: spR, c: spC });
        this._expandSpecialArea(spType, spR, spC, addCell);
      }

      return this._executeClearMap(toClear, [], specialsTriggered, 1);
    }

    _clearGroups(groups, comboLevel, pivot) {
      const toClear = new Map();
      const spawns = [];
      const specialsTriggered = [];

      groups.forEach((g) => {
        if (g.spawnSpecial) {
          const spawnPos = (pivot && g.cells.some((p) => p.r === pivot.r && p.c === pivot.c))
            ? { r: pivot.r, c: pivot.c }
            : g.cells[Math.floor(g.cells.length / 2)];
          spawns.push({ r: spawnPos.r, c: spawnPos.c, type: g.type, special: g.spawnSpecial });
        }
        g.cells.forEach((p) => toClear.set(`${p.r},${p.c}`, p));
      });

      const queue = Array.from(toClear.values());
      const visitedSpecial = new Set();
      while (queue.length > 0) {
        const { r, c } = queue.shift();
        const key = `${r},${c}`;
        const cell = this.grid[r]?.[c];
        if (!cell || !cell.special || visitedSpecial.has(key)) continue;
        visitedSpecial.add(key);
        specialsTriggered.push({ type: cell.special, r, c });
        this._expandSpecialArea(cell.special, r, c, (nr, nc) => {
          const nk = `${nr},${nc}`;
          if (this.inBounds(nr, nc) && this.grid[nr][nc] && !toClear.has(nk)) {
            toClear.set(nk, { r: nr, c: nc });
            queue.push({ r: nr, c: nc });
          }
        });
      }

      return this._executeClearMap(toClear, spawns, specialsTriggered, comboLevel);
    }

    _executeClearMap(toClear, spawns, specialsTriggered, comboLevel) {
      const cleared = [];
      const clearedByType = { sword: 0, clock: 0, coin: 0, star: 0, emerald: 0, bolt: 0 };
      let locksBroken = 0;
      let iceBroken = 0;
      let goldenCollected = 0;

      const adjChecked = new Set();
      toClear.forEach(({ r, c }) => {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
          if (this.inBounds(nr, nc) && !adjChecked.has(nk)) {
            adjChecked.add(nk);
            const adj = this.grid[nr][nc];
            if (adj && adj.locked > 0) { adj.locked--; locksBroken++; }
          }
        });
      });

      const spawnSet = new Map();
      spawns.forEach((sp) => spawnSet.set(`${sp.r},${sp.c}`, sp));

      toClear.forEach(({ r, c }, key) => {
        const cell = this.grid[r][c];
        if (!cell) return;
        if (cell.locked > 0) { cell.locked--; locksBroken++; }
        if (cell.ice > 1) {
          // الجليد ذو الطبقتين ينكسر طبقة واحدة ويبقى في مكانه
          cell.ice--;
          iceBroken++;
          return;
        }
        if (cell.ice === 1) { cell.ice = 0; iceBroken++; }
        if (cell.golden) goldenCollected++;

        cleared.push({ r, c, type: cell.type, special: cell.special, golden: cell.golden });
        if (clearedByType[cell.type] !== undefined) clearedByType[cell.type]++;

        if (spawnSet.has(key)) {
          const sp = spawnSet.get(key);
          this.grid[r][c] = this._makeTile(sp.type, sp.special, 0, 0, false);
        } else {
          this.grid[r][c] = null;
        }
      });

      return {
        comboLevel, cleared, clearedByType, spawns, specialsTriggered,
        locksBroken, iceBroken, goldenCollected, drops: [], refills: []
      };
    }

    _applyGravityAndRefill(step) {
      for (let c = 0; c < this.cols; c++) {
        let writeRow = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) {
          if (this.grid[r][c] !== null) {
            if (writeRow !== r) {
              this.grid[writeRow][c] = this.grid[r][c];
              this.grid[r][c] = null;
              step.drops.push({ fromR: r, toR: writeRow, c, uid: this.grid[writeRow][c].uid });
            }
            writeRow--;
          }
        }
        for (let r = writeRow; r >= 0; r--) {
          const newTile = this._makeTile(this._randomType());
          this.grid[r][c] = newTile;
          step.refills.push({ r, c, tile: { ...newTile } });
        }
      }
    }

    _aggregateSteps(steps, maxCombo) {
      const totals = {
        clearedCount: 0,
        clearedByType: { sword: 0, clock: 0, coin: 0, star: 0, emerald: 0, bolt: 0 },
        maxCombo,
        specialsTriggered: 0,
        locksBroken: 0,
        iceBroken: 0,
        goldenCollected: 0
      };
      steps.forEach((st) => {
        totals.clearedCount += st.cleared.length;
        totals.specialsTriggered += st.specialsTriggered.length;
        totals.locksBroken += st.locksBroken;
        totals.iceBroken += st.iceBroken || 0;
        totals.goldenCollected += st.goldenCollected || 0;
        Object.keys(st.clearedByType).forEach((k) => {
          totals.clearedByType[k] = (totals.clearedByType[k] || 0) + st.clearedByType[k];
        });
      });
      return totals;
    }

    findBestHint() {
      let best = null, bestScore = -1;
      const testSwap = (r1, c1, r2, c2) => {
        const a = this.grid[r1][c1], b = this.grid[r2][c2];
        if (!a || !b || a.locked > 0 || b.locked > 0) return;
        if (a.special || b.special) {
          const sc = (a.special && b.special) ? 120 : 90;
          if (sc > bestScore) { bestScore = sc; best = { r1, c1, r2, c2, score: sc }; }
          return;
        }
        this.grid[r1][c1] = b; this.grid[r2][c2] = a;
        const groups = this.findMatchGroups();
        this.grid[r1][c1] = a; this.grid[r2][c2] = b;
        if (groups.length > 0) {
          let sc = 0;
          groups.forEach((g) => {
            sc += g.cells.length * 10 + (g.spawnSpecial ? 25 : 0);
            if (g.type === "sword" || g.type === "clock") sc += 6;
          });
          if (sc > bestScore) { bestScore = sc; best = { r1, c1, r2, c2, score: sc }; }
        }
      };
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (c + 1 < this.cols) testSwap(r, c, r, c + 1);
          if (r + 1 < this.rows) testSwap(r, c, r + 1, c);
        }
      }
      return best;
    }

    hasValidMoves() { return this.findBestHint() !== null; }

    shuffleBoard() {
      const unlocked = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] && this.grid[r][c].locked === 0) unlocked.push(this.grid[r][c]);
        }
      }
      for (let attempt = 0; attempt < 15; attempt++) {
        for (let i = unlocked.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          const tmp = unlocked[i]; unlocked[i] = unlocked[j]; unlocked[j] = tmp;
        }
        let idx = 0;
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if (this.grid[r][c] && this.grid[r][c].locked === 0) this.grid[r][c] = unlocked[idx++];
          }
        }
        if (this.findMatchGroups().length === 0 && this.hasValidMoves()) return this.getSnapshot();
      }
      if (this.rows >= 2 && this.cols >= 3) {
        const t = this.tileKeys[0];
        this.grid[0][0] = this._makeTile(t);
        this.grid[0][1] = this._makeTile(t);
        this.grid[1][2] = this._makeTile(t);
      }
      return this.getSnapshot();
    }

    skillBlastRow(targetRow = null) {
      const r = targetRow !== null && targetRow >= 0 && targetRow < this.rows ? targetRow : Math.floor(this.rows / 2);
      const toClear = new Map();
      for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) toClear.set(`${r},${c}`, { r, c });
      const step = this._executeClearMap(toClear, [], [{ type: "skill_row_blast", r, c: 0 }], 1);
      this._applyGravityAndRefill(step);
      return { step, boardAfter: this.getSnapshot() };
    }

    skillConvertRandomTiles(targetType = "sword", count = 4) {
      const pool = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          if (cell && cell.type !== targetType && !cell.special && cell.locked === 0) pool.push({ r, c });
        }
      }
      const converted = [];
      let n = Math.min(count, pool.length);
      while (n > 0 && pool.length > 0) {
        const idx = Math.floor(this.rng() * pool.length);
        const pos = pool.splice(idx, 1)[0];
        this.grid[pos.r][pos.c].type = targetType;
        converted.push(pos);
        n--;
      }
      return { converted, boardAfter: this.getSnapshot() };
    }
  }

  window.MoaathTowerBoard = { version: "2.0", createSeededRNG, TowerBoard };
})();
