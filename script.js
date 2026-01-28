/*
  拼图游戏 (纯 HTML/CSS/Vanilla JS)
  功能：
  - 模式：经典拖拽(3/4/5) 与 滑块(3x3)
  - 自动读取 img/manifest.json 图片清单；支持切换图片
  - 查看原图悬浮层；步数统计；可选计时
  - 触屏与桌面均可用（Pointer Events）
*/
(function () {
    'use strict';

    // DOM refs
    const board = document.getElementById('board');
    const imageSelect = document.getElementById('imageSelect');
    const prevImageBtn = document.getElementById('prevImage');
    const nextImageBtn = document.getElementById('nextImage');
    const difficultySel = document.getElementById('difficulty');
    const restartBtn = document.getElementById('restart');
    const timerToggle = document.getElementById('timerToggle');
    const timeDisplay = document.getElementById('timeDisplay');
    const stepDisplay = document.getElementById('stepDisplay');
    const toggleOriginalBtn = document.getElementById('toggleOriginal');
    const overlay = document.getElementById('originalOverlay');
    const overlayImg = document.getElementById('originalImage');
    const closeOverlayBtn = document.getElementById('closeOverlay');
    const difficultyGroup = document.getElementById('difficultyGroup');
    const toast = document.getElementById('completeToast');

    // State
    const state = {
        images: [],
        imageIndex: 0,
        mode: 'classic', // 'classic' | 'sliding'
        size: 3, // for classic: 3,4,5; sliding fixed to 3
        steps: 0,
        timerOn: false,
        timerStarted: false,
        startTimestamp: 0,
        timerRaf: 0,
        // puzzle
        cellSize: 0,
        tiles: [], // {el, pieceIndex, cellIndex}
        occupied: new Map(), // cellIndex -> tile
        dragging: null,
        sliding: {
            emptyCell: 8 // index 0..8 (3x3)
        }
    };

    // Init
    window.addEventListener('resize', onResize);
    init().catch(console.error);

    async function init() {
        // Load manifest
        try {
            const res = await fetch('img/manifest.json', { cache: 'no-store' });
            const list = await res.json();
            state.images = list.map(name => `img/${name}`);
        } catch (e) {
            // fallback: nothing
            console.warn('读取 manifest 失败，未加载图片列表', e);
            state.images = [];
        }

        if (state.images.length === 0) {
            // Minimal guard: create a placeholder gray image using data URL (not heavy)
            const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#777"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="48" fill="#fff">No Images</text></svg>');
            state.images = [`data:image/svg+xml,${svg}`];
        }

        // Build image select
        imageSelect.innerHTML = '';
        state.images.forEach((src, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = src.replace(/^.*\//, '');
            imageSelect.appendChild(opt);
        });

        // Bind controls
        prevImageBtn.addEventListener('click', () => {
            state.imageIndex = (state.imageIndex - 1 + state.images.length) % state.images.length;
            imageSelect.value = String(state.imageIndex);
            resetGame();
        });
        nextImageBtn.addEventListener('click', () => {
            state.imageIndex = (state.imageIndex + 1) % state.images.length;
            imageSelect.value = String(state.imageIndex);
            resetGame();
        });
        imageSelect.addEventListener('change', () => {
            state.imageIndex = Number(imageSelect.value);
            resetGame();
        });

        document.querySelectorAll('input[name="mode"]').forEach(r => {
            r.addEventListener('change', () => {
                state.mode = getSelectedMode();
                difficultyGroup.style.display = state.mode === 'classic' ? '' : 'none';
                resetGame();
            });
        });

        difficultySel.addEventListener('change', () => {
            state.size = Number(difficultySel.value);
            resetGame();
        });

        restartBtn.addEventListener('click', resetGame);

        timerToggle.addEventListener('change', () => {
            state.timerOn = timerToggle.checked;
            if (!state.timerOn) {
                cancelAnimationFrame(state.timerRaf);
                state.timerStarted = false; timeDisplay.textContent = '00:00';
            }
        });

        toggleOriginalBtn.addEventListener('click', () => {
            if (overlay.hasAttribute('hidden')) {
                overlayImg.src = currentImage();
                overlay.removeAttribute('hidden');
            } else {
                overlay.setAttribute('hidden', '');
            }
        });
        closeOverlayBtn.addEventListener('click', () => overlay.setAttribute('hidden', ''));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.setAttribute('hidden', ''); });

        // Defaults
        imageSelect.value = String(state.imageIndex);
        state.mode = getSelectedMode();
        state.size = Number(difficultySel.value);

        // First render
        resetGame();
    }

    function getSelectedMode() {
        const r = document.querySelector('input[name="mode"]:checked');
        return r ? r.value : 'classic';
    }

    function currentImage() {
        return state.images[state.imageIndex];
    }

    function resetGame() {
        // Reset stats
        state.steps = 0; stepDisplay.textContent = `步数：${state.steps}`;
        if (state.timerOn) {
            state.timerStarted = false; timeDisplay.textContent = '00:00';
            cancelAnimationFrame(state.timerRaf);
        }
        toast.setAttribute('hidden', '');

        // Clear board
        board.classList.toggle('sliding', state.mode === 'sliding');
        board.innerHTML = '';
        state.tiles = []; state.occupied.clear(); state.dragging = null;

        // Add grid guide
        renderGridGuide();

        if (state.mode === 'classic') {
            setupClassic();
        } else {
            setupSliding();
        }
    }

    function onResize() {
        // Re-lay tiles to new cell size
        if (state.tiles.length === 0) return;
        state.cellSize = board.clientWidth / (state.mode === 'classic' ? state.size : 3);
        layoutAllTiles();
    }

    function renderGridGuide() {
        const n = state.mode === 'classic' ? state.size : 3;
        const guide = document.createElement('div');
        guide.className = 'grid-guide';
        const cell = 100 / n;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const d = document.createElement('div');
                d.className = 'cell';
                d.style.left = `${c * cell}%`;
                d.style.top = `${r * cell}%`;
                d.style.width = `${cell}%`;
                d.style.height = `${cell}%`;
                guide.appendChild(d);
            }
        }
        board.appendChild(guide);
    }

    // ---------- Classic Drag & Drop ----------
    function setupClassic() {
        const n = state.size;
        const total = n * n;
        const img = currentImage();
        const positions = [...Array(total).keys()];
        const perm = shuffled(positions); // permutation of cell indices (where pieces go initially)

        state.cellSize = board.clientWidth / n;

        for (let pieceIndex = 0; pieceIndex < total; pieceIndex++) {
            const el = document.createElement('div');
            el.className = 'tile';
            el.setAttribute('role', 'button');
            el.setAttribute('aria-label', `拼图块 ${pieceIndex + 1}`);

            // background slicing via background-position and size
            el.style.backgroundImage = `url("${img}")`;
            el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
            const pr = Math.floor(pieceIndex / n);
            const pc = pieceIndex % n;
            const bx = (pc / (n - 1)) * 100; // when n=1 degenerate, but n>=3 here
            const by = (pr / (n - 1)) * 100;
            el.style.backgroundPosition = `${bx}% ${by}%`;

            // numeric label
            const tag = document.createElement('span');
            tag.className = 'label';
            tag.textContent = String(pieceIndex + 1);
            el.appendChild(tag);

            // initial cell
            const cellIndex = perm[pieceIndex];
            const tile = { el, pieceIndex, cellIndex };
            state.tiles.push(tile);
            state.occupied.set(cellIndex, tile);

            // place
            placeTile(tile, n);

            // pointer handlers for drag
            enableDrag(tile, n);

            board.appendChild(el);
        }
    }

    function enableDrag(tile, n) {
        let startX = 0, startY = 0, originLeft = 0, originTop = 0;
        let dragging = false;

        const onDown = (e) => {
            e.preventDefault();
            tile.el.setPointerCapture(e.pointerId);
            dragging = true; state.dragging = tile;
            startX = e.clientX; startY = e.clientY;
            const rect = tile.el.getBoundingClientRect();
            const brect = board.getBoundingClientRect();
            originLeft = rect.left - brect.left; originTop = rect.top - brect.top;
            tile.el.classList.add('ghost');
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            tile.el.style.transform = `translate(${dx}px, ${dy}px)`;
        };
        const onUp = (e) => {
            if (!dragging) return;
            dragging = false; state.dragging = null;
            tile.el.releasePointerCapture(e.pointerId);
            tile.el.classList.remove('ghost');

            // compute drop position -> nearest cell
            const brect = board.getBoundingClientRect();
            const endLeft = originLeft + (e.clientX - startX);
            const endTop = originTop + (e.clientY - startY);

            const cellSize = state.cellSize;
            const c = clamp(Math.round(endLeft / cellSize), 0, n - 1);
            const r = clamp(Math.round(endTop / cellSize), 0, n - 1);
            const targetCell = r * n + c;

            // swap with occupant or move into empty spot (should always be occupied in classic setup)
            if (targetCell === tile.cellIndex) {
                // no move
                tile.el.style.transform = '';
                return;
            }

            const occupant = state.occupied.get(targetCell);
            if (occupant) {
                // swap cells
                const oldCell = tile.cellIndex;
                state.occupied.set(targetCell, tile);
                state.occupied.set(oldCell, occupant);
                tile.cellIndex = targetCell;
                occupant.cellIndex = oldCell;
                layoutTile(tile, n);
                layoutTile(occupant, n);
            } else {
                // move into empty (theoretically none), but handle anyway
                state.occupied.delete(tile.cellIndex);
                state.occupied.set(targetCell, tile);
                tile.cellIndex = targetCell;
                layoutTile(tile, n);
            }

            tile.el.style.transform = '';
            tickStepAndMaybeStartTimer();
            checkCompleteClassic(n);
        };

        tile.el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    function checkCompleteClassic(n) {
        // solve if every tile is in its index cell
        for (const t of state.tiles) {
            if (t.cellIndex !== t.pieceIndex) return;
        }
        showComplete();
    }

    // ---------- Sliding Puzzle (3x3) ----------
    function setupSliding() {
        const n = 3;
        const total = n * n; // 9
        const img = currentImage();

        state.cellSize = board.clientWidth / n;

        // create 8 tiles; last is empty
        const positions = [...Array(total - 1).keys()]; // 0..7 piece indexes

        // start solved layout
        state.sliding.emptyCell = total - 1;

        positions.forEach(pieceIndex => {
            const el = document.createElement('div');
            el.className = 'tile';
            el.setAttribute('role', 'button');
            el.style.backgroundImage = `url("${img}")`;
            el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
            const pr = Math.floor(pieceIndex / n);
            const pc = pieceIndex % n;
            const bx = (pc / (n - 1)) * 100;
            const by = (pr / (n - 1)) * 100;
            el.style.backgroundPosition = `${bx}% ${by}%`;

            const tag = document.createElement('span');
            tag.className = 'label';
            tag.textContent = String(pieceIndex + 1);
            el.appendChild(tag);

            const tile = { el, pieceIndex, cellIndex: pieceIndex };
            state.tiles.push(tile);
            state.occupied.set(tile.cellIndex, tile);
            placeTile(tile, n);

            el.addEventListener('click', () => onSlidingTileClick(tile, n));
            el.addEventListener('pointerdown', (e) => { e.preventDefault(); });

            board.appendChild(el);
        });

        // shuffle with random legal moves to ensure solvable
        shuffleSliding(n, 200);
    }

    function onSlidingTileClick(tile, n) {
        const empty = state.sliding.emptyCell;
        if (isAdjacent(tile.cellIndex, empty, n)) {
            // swap with empty
            state.occupied.delete(tile.cellIndex);
            state.occupied.set(empty, tile);
            const old = tile.cellIndex;
            tile.cellIndex = empty;
            state.sliding.emptyCell = old;
            layoutTile(tile, n);
            tickStepAndMaybeStartTimer();
            checkCompleteSliding(n);
        }
    }

    function checkCompleteSliding(n) {
        for (const t of state.tiles) {
            if (t.cellIndex !== t.pieceIndex) return;
        }
        showComplete();
    }

    function shuffleSliding(n, moves) {
        let last = -1;
        for (let i = 0; i < moves; i++) {
            const empty = state.sliding.emptyCell;
            const neighbors = slidingNeighbors(empty, n).filter(c => c !== last);
            const choice = neighbors[(Math.random() * neighbors.length) | 0];
            const tile = state.occupied.get(choice);
            // move tile into empty
            state.occupied.delete(choice);
            state.occupied.set(empty, tile);
            tile.cellIndex = empty;
            state.sliding.emptyCell = choice;
            last = empty;
        }
        layoutAllTiles();
    }

    function slidingNeighbors(cell, n) {
        const r = Math.floor(cell / n), c = cell % n;
        const res = [];
        if (r > 0) res.push((r - 1) * n + c);
        if (r < n - 1) res.push((r + 1) * n + c);
        if (c > 0) res.push(r * n + (c - 1));
        if (c < n - 1) res.push(r * n + (c + 1));
        return res;
    }

    function isAdjacent(a, b, n) {
        const ar = Math.floor(a / n), ac = a % n, br = Math.floor(b / n), bc = b % n;
        return (ar === br && Math.abs(ac - bc) === 1) || (ac === bc && Math.abs(ar - br) === 1);
    }

    // ---------- Layout helpers ----------
    function placeTile(tile, n) {
        const cell = tile.cellIndex;
        const r = Math.floor(cell / n);
        const c = cell % n;
        const s = state.cellSize;
        tile.el.style.width = `${s}px`;
        tile.el.style.height = `${s}px`;
        tile.el.style.left = `${c * s}px`;
        tile.el.style.top = `${r * s}px`;
    }

    function layoutTile(tile, n) {
        const cell = tile.cellIndex;
        const r = Math.floor(cell / n);
        const c = cell % n;
        const s = state.cellSize;
        tile.el.style.width = `${s}px`;
        tile.el.style.height = `${s}px`;
        tile.el.style.left = `${c * s}px`;
        tile.el.style.top = `${r * s}px`;
    }

    function layoutAllTiles() {
        const n = state.mode === 'classic' ? state.size : 3;
        for (const t of state.tiles) { layoutTile(t, n); }
    }

    // ---------- Steps & Timer ----------
    function tickStepAndMaybeStartTimer() {
        state.steps++; stepDisplay.textContent = `步数：${state.steps}`;
        if (state.timerOn && !state.timerStarted) {
            state.timerStarted = true;
            state.startTimestamp = performance.now();
            tickTimer();
        }
    }

    function tickTimer() {
        const now = performance.now();
        const elapsed = Math.max(0, now - state.startTimestamp);
        const sec = Math.floor(elapsed / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        timeDisplay.textContent = `${mm}:${ss}`;
        if (state.timerOn && state.timerStarted) {
            state.timerRaf = requestAnimationFrame(tickTimer);
        }
    }

    // ---------- Utils ----------
    function shuffled(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // ---------- Complete feedback ----------
    function showComplete() {
        // 如果开启了计时，完成时暂停并定格时间
        if (state.timerOn && state.timerStarted) {
            cancelAnimationFrame(state.timerRaf);
            state.timerStarted = false;
            const now = performance.now();
            const elapsed = Math.max(0, now - state.startTimestamp);
            const sec = Math.floor(elapsed / 1000);
            const mm = String(Math.floor(sec / 60)).padStart(2, '0');
            const ss = String(sec % 60).padStart(2, '0');
            timeDisplay.textContent = `${mm}:${ss}`;
        }
        toast.removeAttribute('hidden');
        setTimeout(() => { toast.setAttribute('hidden', ''); }, 1600);
    }
})();
