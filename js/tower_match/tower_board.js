/**
 * ============================================================================
 * محرك لوحة الألغاز v3.0 Ultra — «برج التحدي اللانهائي» (Tower Match-3)
 * المسار: js/tower_match/tower_board.js
 * إضافات v3.0:
 * - لقطات متتابعة لكل خطوة كومبو (step.boardAfter) لدعم أنيميشن التساقط 60fps
 * - قطعة الجوكر/الحرباء (wildcard) تتطابق مع أي لون وتتولد عند كومبو ×4
 * - البرميل المتفجر (barrel) في طوابق الزعماء ينفجر 3×3 عند المطابقة بجانبه
 * - صندوق الغنيمة الخاطف (chest) يظهر مؤقتاً ويمنح +250 نقطة و+3 ثوانٍ عند كسره
 * - أشكال لوحات متغيرة (stone blockers) في الطوابق العليا
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

    _makeTile(type, opts = {}) {
      return {
        uid: this._nextId(),
        type: type || this._randomType(),
        special: opts.special || null, // null | 'row_blast' | 'col_blast' | 'bomb_3x3' | 'prism_core'
        locked: Math.max(0, parseInt(opts.locked, 10) || 0),
        ice: Math.max(0, parseInt(opts.ice, 10) || 0),
        golden: !!opts.golden,
        wildcard: !!opts.wildcard,
        barrel: !!opts.barrel,
        chest: !!opts.chest,
        stone: !!opts.stone
      };
    }

    inBounds(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
    isAdjacent(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1; }

    _isMovable(cell) {
      return !!(cell && cell.locked === 0 && !cell.stone && !cell.barrel && !cell.chest);
    }

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

    // أشكال لوحات متغيرة في الطوابق العليا (إزالة الحجارة السابقة ثم تطبيق قناع جديد اختياري)
    applyFloorMask(maskType = "none") {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c]?.stone) {
            this.grid[r][c] = this._makeTile(this._randomType());
          }
        }
      }
      const coords = [];
      if (maskType === "corners") {
        coords.push([0, 0], [0, this.cols - 1], [this.rows - 1, 0], [this.rows - 1, this.cols - 1]);
      } else if (maskType === "center") {
        const mr = Math.floor(this.rows / 2) - 1;
        const mc = Math.floor(this.cols / 2) - 1;
        coords.push([mr, mc], [mr + 1, mc + 1]);
      }
      coords.forEach(([r, c]) => {
        if (this.inBounds(r, c)) {
          this.grid[r][c] = this._makeTile("stone", { stone: true });
        }
      });
      if (!this.hasValidMoves()) this.shuffleBoard();
      return this.getSnapshot();
    }

    spawnStartingSpecial(specialType = "bomb_3x3") {
      const r = Math.floor(this.rows / 2), c = Math.floor(this.cols / 2);
      if (this.grid[r]?.[c] && !this.grid[r][c].stone) this.grid[r][c].special = specialType;
      return this.getSnapshot();
    }

    _pickNormalCell() {
      const pool = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const t = this.grid[r][c];
          if (t && this._isMovable(t) && !t.special && !t.golden && !t.wildcard) pool.push({ r, c });
        }
      }
      if (!pool.length) return null;
      return pool[Math.floor(this.rng() * pool.length)];
    }

    spawnGoldenProductTile() {
      const pick = this._pickNormalCell();
      if (!pick) return null;
      this.grid[pick.r][pick.c].golden = true;
      return pick;
    }

    spawnWildcardTile() {
      const pick = this._pickNormalCell();
      if (!pick) return null;
      this.grid[pick.r][pick.c].wildcard = true;
      return pick;
    }

    spawnChainBarrel() {
      const pick = this._pickNormalCell();
      if (!pick) return null;
      this.grid[pick.r][pick.c] = this._makeTile("barrel", { barrel: true });
      return pick;
    }

    spawnFlashChest() {
      this.clearFlashChest();
      const pick = this._pickNormalCell();
      if (!pick) return null;
      this.grid[pick.r][pick.c] = this._makeTile("chest", { chest: true });
      return pick;
    }

    clearFlashChest() {
      let removed = false;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c]?.chest) {
            this.grid[r][c] = this._makeTile(this._randomType());
            removed = true;
          }
        }
      }
      return removed;
    }

    applyBossLocks(count = 2) {
      const lockedCoords = [];
      for (let i = 0; i < count; i++) {
        const pick = this._pickNormalCell();
        if (!pick) break;
        this.grid[pick.r][pick.c].locked = 1;
        lockedCoords.push(pick);
      }
      return lockedCoords;
    }

    applyIceObstacles(count = 2, layers = 2) {
      const iced = [];
      for (let i = 0; i < count; i++) {
        const pick = this._pickNormalCell();
        if (!pick) break;
        if (this.grid[pick.r][pick.c].ice === 0) {
          this.grid[pick.r][pick.c].ice = layers;
          iced.push(pick);
        }
      }
      return iced;
    }

    bossSwapRandomPair() {
      const p1 = this._pickNormalCell();
      const p2 = this._pickNormalCell();
      if (!p1 || !p2 || (p1.r === p2.r && p1.c === p2.c)) return null;
      const tmp = this.grid[p1.r][p1.c];
      this.grid[p1.r][p1.c] = this.grid[p2.r][p2.c];
      this.grid[p2.r][p2.c] = tmp;
      return { p1, p2 };
    }

    _canMatchColor(cell, colorType) {
      if (!cell || cell.stone || cell.barrel || cell.chest || cell.special === "prism_core") return false;
      return cell.wildcard || cell.type === colorType;
    }

    findMatchGroups() {
      const horizRuns = [];
      const vertRuns = [];

      // فحص أفقي مع دعم قطعة الجوكر (wildcard)
      for (let r = 0; r < this.rows; r++) {
        let c = 0;
        while (c < this.cols) {
          const cell = this.grid[r][c];
          if (!cell || cell.stone || cell.barrel || cell.chest || cell.special === "prism_core") { c++; continue; }
          let baseType = cell.wildcard ? null : cell.type;
          let end = c + 1;
          while (end < this.cols) {
            const nxt = this.grid[r][end];
            if (!nxt || nxt.stone || nxt.barrel || nxt.chest || nxt.special === "prism_core") break;
            if (!baseType && !nxt.wildcard) baseType = nxt.type;
            if (baseType && !this._canMatchColor(nxt, baseType)) break;
            end++;
          }
          if (end - c >= 3) {
            const cells = [];
            for (let k = c; k < end; k++) cells.push({ r, c: k });
            horizRuns.push({ type: baseType || this.tileKeys[0], dir: "h", cells });
            c = end;
          } else {
            c++;
          }
        }
      }

      // فحص عمودي مع دعم قطعة الجوكر (wildcard)
      for (let c = 0; c < this.cols; c++) {
        let r = 0;
        while (r < this.rows) {
          const cell = this.grid[r][c];
          if (!cell || cell.stone || cell.barrel || cell.chest || cell.special === "prism_core") { r++; continue; }
          let baseType = cell.wildcard ? null : cell.type;
          let end = r + 1;
          while (end < this.rows) {
            const nxt = this.grid[end][c];
            if (!nxt || nxt.stone || nxt.barrel || nxt.chest || nxt.special === "prism_core") break;
            if (!baseType && !nxt.wildcard) baseType = nxt.type;
            if (baseType && !this._canMatchColor(nxt, baseType)) break;
            end++;
          }
          if (end - r >= 3) {
            const cells = [];
            for (let k = r; k < end; k++) cells.push({ r: k, c });
            vertRuns.push({ type: baseType || this.tileKeys[0], dir: "v", cells });
            r = end;
          } else {
            r++;
          }
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
        if (mergedCells.length >= 5 && !(hasH && hasV)) spawnSpecial = "prism_core";
        else if (hasH && hasV && mergedCells.length >= 5) spawnSpecial = "bomb_3x3";
        else if (mergedCells.length === 4) spawnSpecial = hasV && !hasH ? "col_blast" : "row_blast";

        groups.push({ type: base.type, cells: mergedCells, spawnSpecial });
      }
      return groups;
    }

    trySwap(r1, c1, r2, c2) {
      if (!this.inBounds(r1, c1) || !this.inBounds(r2, c2)) return { valid: false, reason: "out_of_bounds" };
      if (!this.isAdjacent(r1, c1, r2, c2)) return { valid: false, reason: "not_adjacent" };
      const t1 = this.grid[r1][c1], t2 = this.grid[r2][c2];
      if (!this._isMovable(t1) || !this._isMovable(t2)) return { valid: false, reason: "tile_locked" };

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
        this._applyGravityAndRefill(specialStep);
        specialStep.boardAfter = this.getSnapshot();
        steps.push(specialStep);
      }

      let guard = 0;
      while (guard < 20) {
        const groups = this.findMatchGroups();
        if (!groups.length) break;
        comboLevel++;
        const pivot = comboLevel === 1 ? { r: r2, c: c2 } : null;
        const step = this._clearGroups(groups, comboLevel, pivot);
        this._applyGravityAndRefill(step);
        step.boardAfter = this.getSnapshot();
        steps.push(step);
        guard++;
      }

      // مكافأة الجوكر التلقائية عند الوصول لكومبو ×4 فأكثر
      let wildcardSpawned = null;
      if (comboLevel >= 4) {
        wildcardSpawned = this.spawnWildcardTile();
      }

      let reshuffled = false;
      if (!this.hasValidMoves()) { this.shuffleBoard(); reshuffled = true; }

      return {
        valid: true,
        swap: { r1, c1, r2, c2 },
        steps,
        totals: this._aggregateSteps(steps, comboLevel),
        wildcardSpawned,
        reshuffled,
        boardAfter: this.getSnapshot()
      };
    }

    detonateSpecial(r, c) {
      if (!this.inBounds(r, c)) return { valid: false, reason: "out_of_bounds" };
      const cell = this.grid[r][c];
      if (!cell || !cell.special || !this._isMovable(cell)) return { valid: false, reason: "not_special" };

      this.moveCount++;
      const toClear = new Map();
      const specialsTriggered = [{ type: cell.special, r, c }];
      const addCell = (nr, nc) => {
        if (this.inBounds(nr, nc) && this.grid[nr][nc] && !this.grid[nr][nc].stone) toClear.set(`${nr},${nc}`, { r: nr, c: nc });
      };
      addCell(r, c);
      this._expandSpecialArea(cell.special, r, c, addCell);

      const steps = [];
      let comboLevel = 1;
      const firstStep = this._executeClearMap(toClear, [], specialsTriggered, comboLevel);
      this._applyGravityAndRefill(firstStep);
      firstStep.boardAfter = this.getSnapshot();
      steps.push(firstStep);

      let guard = 0;
      while (guard < 20) {
        const groups = this.findMatchGroups();
        if (!groups.length) break;
        comboLevel++;
        const step = this._clearGroups(groups, comboLevel, null);
        this._applyGravityAndRefill(step);
        step.boardAfter = this.getSnapshot();
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
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) addCell(r + dr, c + dc);
      } else if (spType === "prism_core") {
        const target = this._randomType();
        for (let rr = 0; rr < this.rows; rr++) {
          for (let cc = 0; cc < this.cols; cc++) {
            if (this.grid[rr][cc]?.type === target && !this.grid[rr][cc].stone) addCell(rr, cc);
          }
        }
      }
    }

    _resolveSpecialSwap(r1, c1, r2, c2, cellAt1, cellAt2) {
      const toClear = new Map();
      const specialsTriggered = [];
      const addCell = (r, c) => {
        if (this.inBounds(r, c) && this.grid[r][c] && !this.grid[r][c].stone) toClear.set(`${r},${c}`, { r, c });
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
        specialsTriggered.push({ type: "super_cross", r: r2, c: c2 });
        for (let dr = -1; dr <= 1; dr++) for (let c = 0; c < this.cols; c++) addCell(r2 + dr, c);
        for (let dc = -1; dc <= 1; dc++) for (let r = 0; r < this.rows; r++) addCell(r, c2 + dc);
      } else {
        const spR = cellAt1.special ? r1 : r2, spC = cellAt1.special ? c1 : c2;
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
          if (this.inBounds(nr, nc) && this.grid[nr][nc] && !this.grid[nr][nc].stone && !toClear.has(nk)) {
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
      let locksBroken = 0, iceBroken = 0, goldenCollected = 0, chestsOpened = 0, barrelsExploded = 0;

      // فحص المجاورات: أقفال + براميل متفجرة + صندوق الغنيمة الخاطف
      const adjChecked = new Set();
      const extraFromBarrels = [];
      toClear.forEach(({ r, c }) => {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
          const nr = r + dr, nc = c + dc, nk = `${nr},${nc}`;
          if (this.inBounds(nr, nc) && !adjChecked.has(nk)) {
            adjChecked.add(nk);
            const adj = this.grid[nr][nc];
            if (!adj || adj.stone) return;
            if (adj.locked > 0) { adj.locked--; locksBroken++; }
            if (adj.chest) {
              chestsOpened++;
              extraFromBarrels.push({ r: nr, c: nc });
            }
            if (adj.barrel) {
              barrelsExploded++;
              specialsTriggered.push({ type: "barrel_blast", r: nr, c: nc });
              for (let br = -1; br <= 1; br++) {
                for (let bc = -1; bc <= 1; bc++) {
                  if (this.inBounds(nr + br, nc + bc) && !this.grid[nr + br][nc + bc]?.stone) {
                    extraFromBarrels.push({ r: nr + br, c: nc + bc });
                  }
                }
              }
            }
          }
        });
      });

      extraFromBarrels.forEach((p) => toClear.set(`${p.r},${p.c}`, p));

      const spawnSet = new Map();
      spawns.forEach((sp) => spawnSet.set(`${sp.r},${sp.c}`, sp));

      toClear.forEach(({ r, c }, key) => {
        const cell = this.grid[r][c];
        if (!cell || cell.stone) return;
        if (cell.locked > 0) { cell.locked--; locksBroken++; }
        if (cell.ice > 1) { cell.ice--; iceBroken++; return; }
        if (cell.ice === 1) { cell.ice = 0; iceBroken++; }
        if (cell.golden) goldenCollected++;

        cleared.push({ r, c, uid: cell.uid, type: cell.type, special: cell.special, golden: cell.golden });
        if (clearedByType[cell.type] !== undefined) clearedByType[cell.type]++;

        if (spawnSet.has(key)) {
          const sp = spawnSet.get(key);
          this.grid[r][c] = this._makeTile(sp.type, { special: sp.special });
        } else {
          this.grid[r][c] = null;
        }
      });

      return {
        comboLevel, cleared, clearedByType, spawns, specialsTriggered,
        locksBroken, iceBroken, goldenCollected, chestsOpened, barrelsExploded,
        drops: [], refills: []
      };
    }

    _applyGravityAndRefill(step) {
      for (let c = 0; c < this.cols; c++) {
        // الحجارة تبقى ثابتة في مكانها، والقطع تسقط حولها
        for (let r = this.rows - 1; r >= 0; r--) {
          if (this.grid[r][c] === null) {
            let srcR = r - 1;
            while (srcR >= 0 && (this.grid[srcR][c] === null || this.grid[srcR][c].stone)) srcR--;
            if (srcR >= 0) {
              this.grid[r][c] = this.grid[srcR][c];
              this.grid[srcR][c] = null;
              step.drops.push({ fromR: srcR, toR: r, c, uid: this.grid[r][c].uid });
            } else {
              const newTile = this._makeTile(this._randomType());
              this.grid[r][c] = newTile;
              step.refills.push({ r, c, tile: { ...newTile } });
            }
          }
        }
      }
    }

    _aggregateSteps(steps, maxCombo) {
      const totals = {
        clearedCount: 0,
        clearedByType: { sword: 0, clock: 0, coin: 0, star: 0, emerald: 0, bolt: 0 },
        maxCombo, specialsTriggered: 0, locksBroken: 0, iceBroken: 0,
        goldenCollected: 0, chestsOpened: 0, barrelsExploded: 0
      };
      steps.forEach((st) => {
        totals.clearedCount += st.cleared.length;
        totals.specialsTriggered += st.specialsTriggered.length;
        totals.locksBroken += st.locksBroken;
        totals.iceBroken += st.iceBroken || 0;
        totals.goldenCollected += st.goldenCollected || 0;
        totals.chestsOpened += st.chestsOpened || 0;
        totals.barrelsExploded += st.barrelsExploded || 0;
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
        if (!this._isMovable(a) || !this._isMovable(b)) return;
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
          groups.forEach((g) => { sc += g.cells.length * 10 + (g.spawnSpecial ? 25 : 0); });
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
          if (this._isMovable(this.grid[r][c])) unlocked.push(this.grid[r][c]);
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
            if (this._isMovable(this.grid[r][c])) this.grid[r][c] = unlocked[idx++];
          }
        }
        if (this.findMatchGroups().length === 0 && this.hasValidMoves()) return this.getSnapshot();
      }
      return this.getSnapshot();
    }

    skillBlastRow(targetRow = null) {
      const r = targetRow !== null && targetRow >= 0 && targetRow < this.rows ? targetRow : Math.floor(this.rows / 2);
      const toClear = new Map();
      for (let c = 0; c < this.cols; c++) if (this.grid[r][c] && !this.grid[r][c].stone) toClear.set(`${r},${c}`, { r, c });
      const step = this._executeClearMap(toClear, [], [{ type: "skill_row_blast", r, c: 0 }], 1);
      this._applyGravityAndRefill(step);
      step.boardAfter = this.getSnapshot();
      return { step, boardAfter: step.boardAfter };
    }

    skillConvertRandomTiles(targetType = "sword", count = 4) {
      const converted = [];
      for (let i = 0; i < count; i++) {
        const pick = this._pickNormalCell();
        if (!pick) break;
        this.grid[pick.r][pick.c].type = targetType;
        converted.push(pick);
      }
      return { converted, boardAfter: this.getSnapshot() };
    }
  }

  window.MoaathTowerBoard = { version: "3.0", createSeededRNG, TowerBoard };
})();
