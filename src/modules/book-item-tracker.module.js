/**
 * Book Item Tracker Module
 * Spawned from the Book Planner modal ("Item Tracker" button). Opens a
 * window inside the Sidekick sidepanel that tracks the items a book
 * requires — how many the user has (inventory + display case, merged by
 * the Book Planner) and how many more are still needed.
 *
 * Window behaviour follows the Stats Tracker pattern: movable, resizable,
 * state persisted via Core.ChromeStorage (geometry, owning page, tracked
 * book, last fetched counts with a last-updated stamp).
 *
 * Version: 1.0.0
 */

(function () {
    'use strict';

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    const STORAGE_KEY = 'book-item-tracker-window';
    const WINDOW_ID = 'sk-book-item-tracker';
    const STYLES_ID = 'sk-book-item-tracker-styles';

    const BookItemTrackerModule = {
        name: 'Book Item Tracker',
        version: '1.0.0',

        isInitialized: false,
        window: null,
        windowState: {
            x: 140,
            y: 120,
            width: 360,
            height: 340,
            pageId: null,
            bookKey: null,
            items: [],
            tabs: [],
            activeTab: null,
            lastFetchedAt: null,
            isOpen: false,
        },

        _resizeObserver: null,

        // ═════════════════════════════════════════════════════════════════════
        // Init + state persistence
        // ═════════════════════════════════════════════════════════════════════

        async init() {
            if (this.isInitialized) return;
            console.log('📦 Book Item Tracker: initializing...');

            try {
                const saved = await window.SidekickModules.Core.ChromeStorage.get(STORAGE_KEY);
                if (saved) {
                    this.windowState = { ...this.windowState, ...saved };
                }
            } catch (e) {
                console.warn('📦 Book Item Tracker: failed to load state:', e);
            }

            this.injectStyles();
            this.isInitialized = true;
            console.log('✅ Book Item Tracker initialized');

            // Restore the window (with last fetched counts) across page loads
            if (this.windowState.isOpen && this.windowState.bookKey) {
                this.createWindow();
                console.log('📦 Book Item Tracker: restored window for', this.getBookName());
            }
        },

        async saveState() {
            try {
                await window.SidekickModules.Core.ChromeStorage.set(STORAGE_KEY, this.windowState);
            } catch (e) {
                console.warn('📦 Book Item Tracker: failed to save state:', e);
            }
        },

        // ═════════════════════════════════════════════════════════════════════
        // Public API
        // ═════════════════════════════════════════════════════════════════════

        // Opens (or re-targets) the tracker window for a book key from BOOKS.
        async open(bookKey) {
            if (!this.isInitialized) await this.init();
            if (!bookKey) {
                console.warn('📦 Book Item Tracker: open() called without a book key');
                return;
            }

            const retargeted = this.windowState.bookKey !== bookKey;
            this.windowState.bookKey = bookKey;
            this.windowState.isOpen = true;
            this.windowState.pageId = window.SidekickModules?.UI?.getActivePageId?.() ?? this.windowState.pageId ?? null;
            await this.saveState();

            if (this.window) {
                if (retargeted) {
                    this.removeWindow();
                    this.createWindow();
                }
            } else {
                this.createWindow();
            }

            await this.refresh();
        },

        // Re-fetches live counts (inventory + display case) through the
        // Book Planner's shared data pipeline.
        async refresh() {
            const bookKey = this.windowState.bookKey;
            if (!bookKey) return;

            const planner = window.SidekickModules?.BookPlanner;
            if (!planner?.resolveBookPlan) {
                console.warn('📦 Book Item Tracker: Book Planner module not available');
                return;
            }

            this.renderBody({ loading: true });
            try {
                const plan = await planner.resolveBookPlan(bookKey);
                this.windowState.items = plan.items || [];
                this.windowState.tabs = plan.tabs || [];
                this.windowState.activeTab = plan.activeTab || null;
                this.windowState.lastFetchedAt = Date.now();
                await this.saveState();
                this.renderBody({ loading: false, book: plan.book });
            } catch (e) {
                console.warn('📦 Book Item Tracker: refresh failed', e);
                this.renderBody({ loading: false, error: true });
            }
        },

        closeWindow() {
            this.removeWindow();
        },

        removeWindow() {
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }
            if (this.window) {
                this.window.remove();
                this.window = null;
            }
        },

        // ═════════════════════════════════════════════════════════════════════
        // Window construction (Stats Tracker pattern)
        // ═════════════════════════════════════════════════════════════════════

        getContentArea() {
            const el = window.SidekickModules?.UI?.getPageContentEl?.(this.windowState.pageId)
                || document.getElementById('sidekick-content');
            return el || null;
        },

        createWindow() {
            this.removeWindow();

            const contentArea = this.getContentArea();
            if (!contentArea) {
                console.warn('📦 Book Item Tracker: sidepanel content area not found');
                return;
            }

            const bookName = this.getBookName();
            this.window = document.createElement('div');
            this.window.id = WINDOW_ID;
            this.window.className = 'sk-bit-window';
            this.window.style.cssText = `
                position: absolute;
                left: ${this.windowState.x}px;
                top: ${this.windowState.y}px;
                width: ${this.windowState.width}px;
                height: ${this.windowState.height}px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                min-width: 260px;
                min-height: 180px;
                resize: both;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                font-family: Arial, sans-serif;
                color: #f0f0f0;
            `;

            const header = document.createElement('div');
            header.className = 'sk-bit-header';
            header.style.cssText = `
                padding: 10px;
                background: linear-gradient(135deg, #5fcc6a, #ffad5a);
                color: #111;
                font-weight: bold;
                font-size: 13px;
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
                user-select: none;
            `;
            header.innerHTML = `
                <span class="sk-bit-title" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Item Tracker</span>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button class="sk-bit-refresh" title="Refresh counts" style="background:none; border:none; color:#111; font-size:13px; cursor:pointer; padding:0 4px; font-weight:bold;">⟳</button>
                    <button class="sk-bit-close" title="Close" style="background:none; border:none; color:#111; font-size:18px; cursor:pointer; padding:0 5px; line-height:1;">×</button>
                </div>
            `;

            const body = document.createElement('div');
            body.className = 'sk-bit-body';
            body.style.cssText = `
                flex: 1;
                padding: 12px;
                overflow-y: auto;
                font-size: 12px;
                scrollbar-width: none;
                -ms-overflow-style: none;
            `;

            this.window.appendChild(header);
            this.window.appendChild(body);
            contentArea.appendChild(this.window);

            // Click-to-front
            if (window.SidekickModules?.Core?.WindowManager) {
                window.SidekickModules.Core.WindowManager.registerWindow(this.window, 'Book Item Tracker');
            }

            header.querySelector('.sk-bit-close').addEventListener('click', () => {
                this.windowState.isOpen = false;
                this.saveState();
                this.removeWindow();
            });
            header.querySelector('.sk-bit-refresh').addEventListener('click', () => this.refresh());

            this.makeDraggable(header);

            // Debounced resize persistence
            let isInitializing = true;
            setTimeout(() => { isInitializing = false; }, 500);
            this._resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (isInitializing) return;
                    clearTimeout(this.window._resizeTimeout);
                    this.window._resizeTimeout = setTimeout(() => {
                        this.windowState.width = Math.round(entry.contentRect.width);
                        this.windowState.height = Math.round(entry.contentRect.height);
                        this.saveState();
                    }, 500);
                }
            });
            this._resizeObserver.observe(this.window);

            this.renderBody({ loading: false });
        },

        makeDraggable(handle) {
            let isDragging = false;
            let startX, startY, startLeft, startTop;

            handle.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startLeft = this.window.offsetLeft;
                startTop = this.window.offsetTop;
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                this.window.style.left = (startLeft + e.clientX - startX) + 'px';
                this.window.style.top = (startTop + e.clientY - startY) + 'px';
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                this.windowState.x = this.window.offsetLeft;
                this.windowState.y = this.window.offsetTop;
                this.saveState();
            });
        },

        // ═════════════════════════════════════════════════════════════════════
        // Rendering
        // ═════════════════════════════════════════════════════════════════════

        getBookName() {
            const books = window.SidekickModules?.BookPlanner?.getBookData?.() || {};
            const book = books[this.windowState.bookKey];
            return book ? book.name : (this.windowState.bookKey || 'Unknown book');
        },

        renderBody({ loading = false, book = null, error = false } = {}) {
            if (!this.window) return;
            const body = this.window.querySelector('.sk-bit-body');
            if (!body) return;

            if (loading) {
                body.innerHTML = `<div style="text-align:center; color:#888; padding:20px;">Checking inventory & display case…</div>`;
                return;
            }
            if (error) {
                body.innerHTML = `<div style="text-align:center; color:#f87171; padding:20px;">Refresh failed — API key missing or request error.</div>`;
                return;
            }

            const tabs = this.windowState.tabs || [];
            const activeTab = this.windowState.activeTab;
            const tabsHtml = tabs.length > 1 ? `
                <div class="sk-bit-tabs" style="display:flex; gap:4px; margin-bottom:10px;">
                    ${tabs.map(t => {
                        const isActive = t.label === activeTab;
                        return `<button class="sk-bit-tab-btn" data-tab="${this.escapeHtml(t.label)}" style="flex:1; background:${isActive ? 'rgba(95,204,106,0.25)' : 'rgba(255,255,255,0.06)'}; border:1px solid rgba(255,255,255,0.1); color:${isActive ? '#5fcc6a' : '#f0f0f0'}; border-radius:6px; padding:6px 4px; font-size:11px; font-weight:600; cursor:pointer;">${this.escapeHtml(t.label)}</button>`;
                    }).join('')}
                </div>` : '';

            const items = this.windowState.items || [];
            const bookName = book?.name || this.getBookName();
            const duration = book?.durationDays ? ` · ${book.durationDays} days` : '';
            const stamp = this.windowState.lastFetchedAt
                ? new Date(this.windowState.lastFetchedAt).toLocaleString()
                : 'never (showing saved counts)';

            let rowsHtml;
            if (items.length === 0) {
                rowsHtml = `<div style="text-align:center; color:#888; padding:16px;">No items needed for this book.</div>`;
            } else {
                const groupedItems = items.filter(i => i.isGroupedMember);
                const combinedShortfall = groupedItems.length > 0
                    ? Math.max(0, groupedItems[0].need - groupedItems.reduce((s, gi) => s + (gi.have || 0), 0))
                    : null;
                rowsHtml = items.map(i => {
                    const isGroupedMember = i.isGroupedMember === true;
                    const displayShortfall = isGroupedMember ? combinedShortfall : (i.need !== null && i.need !== undefined ? Math.max(0, i.need - i.have) : null);
                    const status = displayShortfall === null
                        ? `<span style="color:#9ca3af;">–</span>`
                        : (displayShortfall > 0
                            ? `<span style="color:#fbbf24; font-weight:bold;">short ×${displayShortfall.toLocaleString()}</span>`
                            : `<span style="color:#4ade80; font-weight:bold;">ready</span>`);
                    const breakdown = i.haveCase > 0
                        ? ` <span style="color:#9ca3af; font-weight:400;">(${i.haveInventory.toLocaleString()} inv + ${i.haveCase.toLocaleString()} case)</span>`
                        : '';
                    const label = i.label ? `<span style="color:#9ca3af;">[${this.escapeHtml(i.label)}]</span> ` : '';
                    const note = i.note ? `<div style="font-size:10px; color:rgba(255,255,255,0.45); font-style:italic; margin-top:2px;">${this.escapeHtml(i.note)}</div>` : '';
                    return `
                        <div style="padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.03); border-radius:6px;">
                            <div style="display:flex; justify-content:space-between; gap:8px; align-items:baseline;">
                                <span style="font-weight:600;">${label}${this.escapeHtml(i.name)}</span>
                                <span style="white-space:nowrap;">×${i.have.toLocaleString()} have${breakdown}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; gap:8px; margin-top:4px;">
                                <span style="color:#fbbf24; font-weight:700;">${i.need !== null && i.need !== undefined ? '×' + i.need.toLocaleString() + ' need' : '—'}</span>
                                ${status}
                            </div>
                            ${note}
                        </div>
                    `;
                }).join('');
            }

            body.innerHTML = `
                <div style="font-size:13px; font-weight:bold; margin-bottom:2px;">${this.escapeHtml(bookName)}</div>
                <div style="font-size:10px; color:#9ca3af; margin-bottom:10px;">${duration.replace(' · ', '')}</div>
                ${tabsHtml}${rowsHtml}
                <div style="font-size:10px; color:#666; text-align:center; margin-top:8px;">Last updated: ${this.escapeHtml(stamp)}</div>
            `;

            body.querySelectorAll('.sk-bit-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const label = btn.dataset.tab;
                    const planner = window.SidekickModules?.BookPlanner;
                    if (planner?.saveSelection) planner.saveSelection(this.windowState.bookKey, 'tab', label);
                    this.refresh();
                });
            });
        },

        escapeHtml(value) {
            const amp = '&' + 'amp;';
            const lt = '&' + 'lt;';
            const gt = '&' + 'gt;';
            const quot = '&' + 'quot;';
            const apos = '&' + '#039;';
            return String(value ?? '')
                .replaceAll('&', amp)
                .replaceAll('<', lt)
                .replaceAll('>', gt)
                .replaceAll('"', quot)
                .replaceAll("'", apos);
        },

        injectStyles() {
            if (document.getElementById(STYLES_ID)) return;
            const style = document.createElement('style');
            style.id = STYLES_ID;
            style.textContent = `
                #${WINDOW_ID} .sk-bit-body::-webkit-scrollbar { display: none; }
                #${WINDOW_ID} .sk-bit-refresh:hover { opacity: 0.7; }
            `;
            document.head.appendChild(style);
        },
    };

    window.SidekickModules.BookItemTracker = BookItemTrackerModule;
    console.log('📦 Book Item Tracker module registered');
})();