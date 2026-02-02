/*
    拼图游戏（纯 HTML/CSS/JavaScript）
    当前能力概览：
    - 模式：经典拖拽（3×3 / 4×4 / 5×5）与滑块拼图（3×3 / 4×4 / 5×5）
    - 图片：仅加载 JPG/JPEG，来源于 assets/images/puzzle/manifest.json
    - 交互：步数统计，可选计时；触屏与鼠标统一用 Pointer Events
    - 通关：锁定棋盘，弹窗展示 ac.jpg 并播放 ac.wav，可「查看原图」
    - 其他：右下角悬浮随机 GIF（assets/images/float/manifest.json）
*/
(function () {
    'use strict';

    // DOM refs
    const board = document.getElementById('board');
    const imageSelect = document.getElementById('imageSelect');
    const prevImageBtn = document.getElementById('prevImage');
    const nextImageBtn = document.getElementById('nextImage');
    const randomImageBtn = document.getElementById('randomImage');
    const difficultySel = document.getElementById('difficulty');
    const restartBtn = document.getElementById('restart');
    const timerToggle = document.getElementById('timerToggle');
    const timeDisplay = document.getElementById('timeDisplay');
    const stepDisplay = document.getElementById('stepDisplay');
    const acModal = document.getElementById('acModal');
    const acImage = document.getElementById('acImage');
    const acClose = document.getElementById('acClose');
    const viewOriginalBtn = document.getElementById('viewOriginal');
    const difficultyGroup = document.getElementById('difficultyGroup');
    const floatBox = document.getElementById('floatBox');
    const floatGif = document.getElementById('floatGif');
    const toast = document.getElementById('completeToast');
    let lastSwapTarget = null;

    // State
    const state = {
        images: [],
        imageIndex: 0,
        mode: 'classic', // 'classic' | 'sliding'
        size: 3, // 3/4/5：两种模式通用
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
            emptyCell: 0
        },
        completed: false
    };

    // 资源基路径：基于页面 baseURI 计算，避免相对路径在不同部署下失效
    const IMG_BASE = new URL('assets/images/puzzle/', document.baseURI).href;
    const FLOAT_BASE = new URL('assets/images/float/', document.baseURI).href;
    // 仅支持 JPG/JPEG 格式的拼图图片
    const IMAGE_EXT_RE = /\.jpe?g$/i;
    let acAudio = null;

    // 初始化入口
    window.addEventListener('resize', onResize);
    init().catch(console.error);

    async function init() {
        // 读取拼图图片清单（仅 JPG）
        try {
            const manifestUrl = new URL('manifest.json', IMG_BASE).href;
            const cachedPuzzle = localStorage.getItem('puzzleManifestV3');
            let list;
            if (cachedPuzzle) {
                try { list = JSON.parse(cachedPuzzle); } catch { list = null; }
            }
            if (!list) {
                const res = await fetch(manifestUrl, { cache: 'force-cache' });
                list = await res.json();
                try { localStorage.setItem('puzzleManifestV3', JSON.stringify(list)); } catch { }
            }
            // 仅保留 JPG/JPEG 文件名
            const filtered = Array.isArray(list) ? list.filter(name => IMAGE_EXT_RE.test(String(name))) : [];
            state.images = filtered.map(name => new URL(name, IMG_BASE).href);
        } catch (e) {
            // 失败时降级为空列表（稍后用占位图）
            console.warn('读取拼图清单失败，未加载图片列表', e);
            state.images = [];
        }

        // 读取浮窗 GIF 清单并用加密随机选择一张
        try {
            const floatManifestUrl = new URL('manifest.json', FLOAT_BASE).href;
            let gifList;
            const cachedFloat = localStorage.getItem('floatManifestV1');
            if (cachedFloat) {
                try { gifList = JSON.parse(cachedFloat); } catch { gifList = null; }
            }
            if (!gifList) {
                const resF = await fetch(floatManifestUrl, { cache: 'force-cache' });
                gifList = await resF.json();
                try { localStorage.setItem('floatManifestV1', JSON.stringify(gifList)); } catch { }
            }
            gifList = gifList.filter(name => /\.gif$/i.test(name));
            if (gifList.length > 0) {
                const idx = secureRandomIndex(gifList.length);
                floatGif.src = new URL(gifList[idx], FLOAT_BASE).href;
            }
        } catch (e) {
            console.warn('读取浮窗 GIF 清单失败', e);
        }

        if (state.images.length === 0) {
            // 无可用图片时，用轻量 SVG 占位图兜底，避免空白
            const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#777"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="48" fill="#fff">No Images</text></svg>');
            state.images = [`data:image/svg+xml,${svg}`];
        }

        // 初始图片：真随机选择一张
        state.imageIndex = secureRandomIndex(state.images.length);

        // Build image select
        imageSelect.innerHTML = '';
        state.images.forEach((src, idx) => {
            const opt = document.createElement('option');
            opt.value = String(idx);
            opt.textContent = src.replace(/^.*\//, '');
            imageSelect.appendChild(opt);
        });

        // 绑定控件事件
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

        randomImageBtn.addEventListener('click', () => {
            state.imageIndex = secureRandomIndex(state.images.length);
            imageSelect.value = String(state.imageIndex);
            resetGame();
        });

        document.querySelectorAll('input[name="mode"]').forEach(r => {
            r.addEventListener('change', () => {
                state.mode = getSelectedMode();
                // 两种模式均支持 3/4/5 难度
                difficultyGroup.style.display = '';
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

        // 弹窗交互：查看原图与关闭
        viewOriginalBtn.addEventListener('click', () => {
            const url = currentImage();
            try { window.open(url, '_blank'); } catch { }
        });
        acClose.addEventListener('click', () => {
            acModal.setAttribute('hidden', '');
        });

        // Defaults
        imageSelect.value = String(state.imageIndex);
        state.mode = getSelectedMode();
        state.size = Number(difficultySel.value);

        // 预加载通关音频，降低首次播放延迟
        try {
            acAudio = new Audio(new URL('assets/media/ac.wav', document.baseURI).href);
            acAudio.preload = 'auto';
        } catch { }

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
        acModal.setAttribute('hidden', '');
        state.completed = false;
        board.classList.remove('disabled');

        // Clear board
        board.classList.toggle('sliding', state.mode === 'sliding');
        board.innerHTML = '';
        state.tiles = []; state.occupied.clear(); state.dragging = null;

        // 先预解码当前图片，再渲染棋盘与拼图，避免首屏闪烁
        preloadImage(currentImage()).then(() => {
            renderGridGuide();
            if (state.mode === 'classic') {
                setupClassic();
            } else {
                setupSliding();
            }
            // 预解码相邻图片，加速后续切换
            predecodeNeighbors();
        });
    }


    function onResize() {
        // Re-lay tiles to new cell size
        if (state.tiles.length === 0) return;
        state.cellSize = board.clientWidth / state.size;
        layoutAllTiles();
    }

    function renderGridGuide() {
        const n = state.size;
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

    // ---------- 经典拖拽模式 ----------
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

            // 背景切片：通过 background-position/size 显示各块
            el.style.backgroundImage = `url("${img}")`;
            el.style.backgroundSize = `${n * 100}% ${n * 100}%`;
            const pr = Math.floor(pieceIndex / n);
            const pc = pieceIndex % n;
            const bx = (pc / (n - 1)) * 100; // when n=1 degenerate, but n>=3 here
            const by = (pr / (n - 1)) * 100;
            el.style.backgroundPosition = `${bx}% ${by}%`;

            // 角标编号
            const tag = document.createElement('span');
            tag.className = 'label';
            tag.textContent = String(pieceIndex + 1);
            el.appendChild(tag);

            // 初始所在格
            const cellIndex = perm[pieceIndex];
            const tile = { el, pieceIndex, cellIndex };
            state.tiles.push(tile);
            state.occupied.set(cellIndex, tile);

            // 放置到棋盘
            placeTile(tile, n);

            // 指针事件：拖拽
            enableDrag(tile, n);

            board.appendChild(el);
        }
    }

    function enableDrag(tile, n) {
        let startX = 0, startY = 0, originLeft = 0, originTop = 0;
        let dragging = false;

        const onDown = (e) => {
            // 移动端限制：仅主指针；已有拖拽时忽略新的按下
            if (!e.isPrimary) return;
            if (state.dragging && state.dragging !== tile) return;
            if (state.completed) return;
            e.preventDefault();
            tile.el.setPointerCapture(e.pointerId);
            dragging = true; state.dragging = tile;
            startX = e.clientX; startY = e.clientY;
            const rect = tile.el.getBoundingClientRect();
            const brect = board.getBoundingClientRect();
            originLeft = rect.left - brect.left; originTop = rect.top - brect.top;
            tile.el.classList.add('ghost');
            // 选中图块置顶
            tile.el.classList.add('selected');
            tile.el.classList.add('dragging');
        };
        const onMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            tile.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
            // 拖拽过程不弹起其他图块，仅在释放并发生交换时强调弹起
        };
        const onUp = (e) => {
            if (!dragging) return;
            dragging = false; state.dragging = null;
            tile.el.releasePointerCapture(e.pointerId);
            tile.el.classList.remove('ghost');
            tile.el.classList.remove('selected');
            tile.el.classList.remove('dragging');

            // 计算释放位置 → 就近单元格
            const brect = board.getBoundingClientRect();
            const endLeft = originLeft + (e.clientX - startX);
            const endTop = originTop + (e.clientY - startY);

            const cellSize = state.cellSize;
            const c = clamp(Math.round(endLeft / cellSize), 0, n - 1);
            const r = clamp(Math.round(endTop / cellSize), 0, n - 1);
            const targetCell = r * n + c;

            // 与目标格占用者交换；若为空则直接移动（经典模式通常都已占满）
            if (targetCell === tile.cellIndex) {
                // no move
                tile.el.style.transform = '';
                return;
            }

            const occupant = state.occupied.get(targetCell);
            if (occupant) {
                // 交换：拖拽图块从当前指针位置直接“落地”到目标格，被交换图块平滑移动到原格
                const oldCell = tile.cellIndex;
                const targetLeftPx = c * cellSize;
                const targetTopPx = r * cellSize;
                state.occupied.set(targetCell, tile);
                state.occupied.set(oldCell, occupant);
                tile.cellIndex = targetCell;
                occupant.cellIndex = oldCell;

                // 布局被交换图块到原格（left/top 过渡驱动）
                layoutTile(occupant, n);

                // 拖拽图块直接从视觉位置落地到目标格
                landFromVisual(tile.el, targetLeftPx, targetTopPx, endLeft, endTop);

                // 弹起反馈
                popOnce(tile.el);
                popOnce(occupant.el);
            } else {
                // 移动到空格：同样从当前视觉位置“落地”到目标格
                const targetLeftPx = c * cellSize;
                const targetTopPx = r * cellSize;
                state.occupied.delete(tile.cellIndex);
                state.occupied.set(targetCell, tile);
                tile.cellIndex = targetCell;
                landFromVisual(tile.el, targetLeftPx, targetTopPx, endLeft, endTop);
                popOnce(tile.el);
            }
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

    // ---------- 滑块模式（3×3 / 4×4 / 5×5） ----------
    function setupSliding() {
        const n = state.size;
        const total = n * n;
        const img = currentImage();

        state.cellSize = board.clientWidth / n;

        // 创建 n*n-1 个图块；最后一格为空
        const positions = [...Array(total - 1).keys()];

        // 初始为完成布局
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

        // 通过随机合法移动打乱，保证有解
        shuffleSliding(n, 200);
    }

    function onSlidingTileClick(tile, n) {
        if (state.completed) return;
        const empty = state.sliding.emptyCell;
        if (isAdjacent(tile.cellIndex, empty, n)) {
            // swap with empty
            state.occupied.delete(tile.cellIndex);
            state.occupied.set(empty, tile);
            const old = tile.cellIndex;
            tile.cellIndex = empty;
            state.sliding.emptyCell = old;
            layoutTile(tile, n);
            // 使用 left/top 过渡，无需临时阴影类，避免高低落差视觉
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

    // ---------- 布局辅助 ----------
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
        const n = state.size;
        for (const t of state.tiles) { layoutTile(t, n); }
    }

    // ---------- 计步与计时 ----------
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

    // ---------- 工具方法 ----------
    function shuffled(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function secureRandomIndex(n) {
        try {
            const u = new Uint32Array(1);
            crypto.getRandomValues(u);
            return Number(u[0] % n);
        } catch {
            return (Math.random() * n) | 0;
        }
    }

    function preloadImage(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.src = url;
            if (img.decode) {
                img.decode().then(resolve).catch(resolve);
            } else {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            }
        });
    }

    function popOnce(el) {
        if (!el) return;
        el.classList.add('swap-pop');
        const handler = () => {
            el.classList.remove('swap-pop');
            el.removeEventListener('animationend', handler);
        };
        el.addEventListener('animationend', handler);
    }

    // 将元素从当前视觉位置（transform 导致）“落地”到目标 left/top
    function landFromVisual(el, targetLeftPx, targetTopPx, currentLeftPx, currentTopPx) {
        if (!el) return;
        // 仅对 transform 做过渡，避免 left/top 动画导致回跳；统一使用全局动画变量
        el.style.transition = 'transform var(--anim-fast) var(--anim-ease)';
        el.style.left = `${targetLeftPx}px`;
        el.style.top = `${targetTopPx}px`;
        const offsetX = currentLeftPx - targetLeftPx;
        const offsetY = currentTopPx - targetTopPx;
        el.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        requestAnimationFrame(() => {
            el.style.transform = 'translate3d(0, 0, 0)';
        });
        const clear = (ev) => {
            if (ev.propertyName === 'transform') {
                el.style.transition = '';
                el.removeEventListener('transitionend', clear);
            }
        };
        el.addEventListener('transitionend', clear);
    }

    function predecodeNeighbors() {
        if (!Array.isArray(state.images) || state.images.length < 2) return;
        const len = state.images.length;
        const prev = state.images[(state.imageIndex - 1 + len) % len];
        const next = state.images[(state.imageIndex + 1) % len];
        preloadImage(prev);
        preloadImage(next);
    }

    // ---------- 通关反馈 ----------
    function showComplete() {
        // 停止计时并定格显示
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
        // 禁用棋盘交互
        state.completed = true;
        board.classList.add('disabled');

        // 展示弹窗与音频
        acImage.src = new URL('assets/images/ac.jpg', document.baseURI).href;
        acModal.removeAttribute('hidden');
        try {
            const audio = new Audio(new URL('assets/media/ac.wav', document.baseURI).href);
            audio.play().catch(() => { });
        } catch { }
    }
})();
