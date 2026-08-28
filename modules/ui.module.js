/**
 * Sidekick Chrome Extension - UI Module
 * Handles hamburger button, sidebar, and main UI components
 * Converted from Tampermonkey userscript to Chrome extension
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    "use strict";

    // Ensure SidekickModules namespace exists
    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    console.log("🎨 Loading Sidekick UI Module...");

    // Wait for Core module to be available
    function waitForCore() {
        return new Promise((resolve) => {
            const checkCore = () => {
                if (window.SidekickModules.Core) {
                    resolve();
                } else {
                    setTimeout(checkCore, 100);
                }
            };
            checkCore();
        });
    }

    // UI Module Implementation
    const UIModule = {
        isInitialized: false,
        sidebarVisible: false,
        hamburgerButton: null,
        sidebar: null,
        savedState: { visible: false, width: 500, activePage: 0 },
        pages: [],            // Array of { id, name, contentEl }
        activePageIndex: 0,
        sidebarWidth: 500,
        pageClickTimer: null,

        // Initialize the UI module
        async init() {
            if (this.isInitialized) {
                console.log("🎨 UI Module already initialized");
                return;
            }

            console.log("🎨 Initializing UI Module...");

            try {
                // Wait for Core module
                await waitForCore();
                console.log("✅ Core module ready for UI");

                // Load saved sidebar state
                await this.loadSidebarState();

                // Create hamburger button
                this.createHamburgerButton();

                // Create sidebar
                this.createSidebar();

                // Apply loaded state
                this.applySidebarState();

                // Set up cross-tab state synchronization
                this.setupStateSync();

                this.isInitialized = true;
                console.log("✅ UI Module initialized successfully");

            } catch (error) {
                console.error("❌ UI Module initialization failed:", error);
            }
        },

        // Create the hamburger menu button
        createHamburgerButton() {
            console.log("🍔 Creating hamburger button...");

            // Remove existing button if it exists
            const existingButton = document.getElementById('sidekick-hamburger');
            if (existingButton) {
                existingButton.remove();
            }

            // Create hamburger button with original tool icon
            this.hamburgerButton = document.createElement('button');
            this.hamburgerButton.id = 'sidekick-hamburger';
            this.hamburgerButton.className = 'sidekick-hamburger';
            this.hamburgerButton.innerHTML = '🔧';
            this.hamburgerButton.title = 'Toggle Sidekick Sidebar';

            // Add click event
            this.hamburgerButton.addEventListener('click', () => {
                this.toggleSidebar();
            });

            // Append to body
            document.body.appendChild(this.hamburgerButton);
            console.log("✅ Hamburger button created");
        },

        // Create the main sidebar
        createSidebar() {
            console.log("📋 Creating sidebar...");

            // Remove existing sidebar if it exists
            const existingSidebar = document.getElementById('sidekick-sidebar');
            if (existingSidebar) {
                existingSidebar.remove();
            }

            // Create sidebar container
            this.sidebar = document.createElement('div');
            this.sidebar.id = 'sidekick-sidebar';
            this.sidebar.className = 'sidekick-sidebar hidden';

            // ── Resize handle (right edge) ────────────────────────────────
            const resizeHandle = document.createElement('div');
            resizeHandle.id = 'sidekick-resize-handle';
            this.sidebar.appendChild(resizeHandle);

            // Create top bar inside sidebar
            this.topBar = document.createElement('div');
            this.topBar.id = 'sidekick-top-bar';
            this.topBar.className = 'sidekick-top-bar';
            this.topBar.style.cssText = `
                position: relative;
                width: 100%;
                padding: 8px 15px;
                background: rgba(0,0,0,0.2);
                border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                flex-shrink: 0;
            `;

            this.topBar.innerHTML = `
                <div style="display: flex; align-items: center; width: 100%;">
                    <span style="
                        color: #fff;
                        font-size: 22px;
                        font-weight: bold;
                        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                        background: linear-gradient(45deg, #8BC34A, #FFC107);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        margin-right: 15px;
                        margin-left: 40px;
                        flex-shrink: 0;
                    ">Sidekick</span>
                    <div id="sidekick-ticker-placeholder" style="
                        flex: 1;
                        overflow: hidden;
                        margin-left: 2px;
                        margin-right: 15px;
                        min-height: 18px;
                        z-index: 1;
                        display: flex;
                        align-items: center;
                        justify-content: flex-start;
                    "></div>
                    <div id="sidekick-clock-container" style="
                        color: #ccc; 
                        font-size: 12px; 
                        margin-right: 15px;
                        min-width: 80px;
                        flex-shrink: 0;
                        z-index: 5;
                        position: relative;
                    "></div>
                </div>
            `;

            // Add cog wheel button in top bar
            const cogButton = document.createElement('button');
            cogButton.id = 'sidekick-cog-button';
            cogButton.innerHTML = '⚙️';
            cogButton.title = 'Advanced Settings';
            cogButton.style.cssText = `
                position: absolute;
                right: 25px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                outline: none;
                color: rgba(255,255,255,0.8);
                cursor: pointer;
                font-size: 16px;
                padding: 2px 6px;
                border-radius: 4px;
                transition: all 0.2s ease;
                user-select: none;
                z-index: 10;
            `;

            cogButton.addEventListener('mouseenter', () => {
                cogButton.style.background = 'rgba(255,255,255,0.1)';
                cogButton.style.color = '#fff';
                cogButton.style.transform = 'translateY(-50%) scale(1.1)';
            });

            cogButton.addEventListener('mouseleave', () => {
                cogButton.style.background = 'none';
                cogButton.style.color = 'rgba(255,255,255,0.8)';
                cogButton.style.transform = 'translateY(-50%) scale(1)';
            });

            cogButton.addEventListener('click', () => {
                console.log("🔧 Cogwheel button clicked!");
                this.showAdvancedSettings();
            });

            this.topBar.appendChild(cogButton);

            // Assemble sidebar
            this.sidebar.appendChild(this.topBar);

            // ── Page containers + tab bar ─────────────────────────────────
            // Use saved pages or create a single default page
            const savedPages = this.savedState?.pages || [];
            if (savedPages.length === 0) savedPages.push({ id: Date.now(), name: 'Page 1' });

            const pageHost = document.createElement('div');
            pageHost.id = 'sidekick-page-host';
            pageHost.style.cssText = 'flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden;';

            this.pages = [];
            savedPages.forEach((pg, idx) => {
                const contentEl = document.createElement('div');
                contentEl.className = 'sidekick-page' + (idx === 0 ? ' active' : '');
                contentEl.dataset.pageId = pg.id;
                contentEl.id = 'sidekick-content'; // keep backward compat for first page
                contentEl.style.cssText = 'flex:1; overflow:auto; position:relative; padding:5px;';
                pageHost.appendChild(contentEl);
                this.pages.push({ id: pg.id, name: pg.name, contentEl });
            });

            // Add module (+) button — lives in the add-module button area per page
            const addModuleButton = document.createElement('button');
            addModuleButton.className = 'sidekick-add-module-btn';
            addModuleButton.innerHTML = '+';
            addModuleButton.title = 'Add new module';
            addModuleButton.style.cssText = `
                position: absolute;
                bottom: 15px;
                left: 15px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.2);
                color: rgba(255,255,255,0.7);
                padding: 0;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                font-weight: bold;
                transition: all 0.3s ease;
                backdrop-filter: blur(5px);
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 20000;
                opacity: 0.85;
            `;
            addModuleButton.addEventListener('mouseenter', () => {
                addModuleButton.style.background = 'rgba(255,255,255,0.2)';
                addModuleButton.style.color = 'white';
                addModuleButton.style.transform = 'translateY(-2px)';
            });
            addModuleButton.addEventListener('mouseleave', () => {
                addModuleButton.style.background = 'rgba(255,255,255,0.1)';
                addModuleButton.style.color = 'rgba(255,255,255,0.7)';
                addModuleButton.style.transform = 'translateY(0)';
            });
            addModuleButton.addEventListener('click', () => this.showAddModuleMenu());
            pageHost.appendChild(addModuleButton);

            // ── Tab bar ───────────────────────────────────────────────────
            const tabBar = document.createElement('div');
            tabBar.id = 'sidekick-page-tabs';
            this.tabBar = tabBar;

            const addPageBtn = document.createElement('button');
            addPageBtn.id = 'sidekick-add-page-btn';
            addPageBtn.textContent = '+';
            addPageBtn.title = 'Add new page';
            addPageBtn.addEventListener('click', () => this.addPage());
            this.addPageBtn = addPageBtn;

            this.sidebar.appendChild(pageHost);
            this.sidebar.appendChild(tabBar);

            // Append to body
            document.body.appendChild(this.sidebar);

            // Render tabs
            this.activePageIndex = Math.min(this.savedState?.activePage || 0, this.pages.length - 1);
            this.renderPageTabs();
            this.switchPage(this.activePageIndex, true);

            // Apply saved width
            this.sidebarWidth = this.savedState?.width || 500;
            this.updateSidebarWidth(this.sidebarWidth);

            // Wire resize handle
            this.initResizeHandle(resizeHandle);

            // Initialize notepad functionality
            this.initializeNotepadArea();

            console.log('✅ Sidebar created with ' + this.pages.length + ' page(s)');
        },

        // Toggle sidebar visibility
        toggleSidebar() {
            if (this.sidebarVisible) {
                this.closeSidebar();
            } else {
                this.openSidebar();
            }
        },

        // Open sidebar
        openSidebar() {
            if (this.sidebar) {
                this.sidebar.classList.remove('hidden');
                this.sidebarVisible = true;
                console.log("📖 Sidebar opened");

                // Trigger lazy initialization for timer module when sidebar opens
                if (window.SidekickModules?.Timer?.lazyInit) {
                    console.log("🔄 Triggering Timer lazy initialization...");
                    window.SidekickModules.Timer.lazyInit();
                }

                // Initialize/refresh Link Group module when sidebar opens
                if (window.SidekickModules?.LinkGroup) {
                    if (!window.SidekickModules.LinkGroup.isInitialized) {
                        console.log("🔗 Triggering Link Group initialization...");
                        window.SidekickModules.LinkGroup.init().then(() => {
                            // Render any existing link groups
                            window.SidekickModules.LinkGroup.renderAllLinkGroups();
                        });
                    } else {
                        console.log("🔗 Refreshing existing Link Groups...");
                        window.SidekickModules.LinkGroup.refresh();
                    }
                }

                // Initialize/refresh Attack List module when sidebar opens
                if (window.SidekickModules?.AttackList) {
                    if (!window.SidekickModules.AttackList.isInitialized) {
                        console.log("⚔️ Triggering Attack List initialization...");
                        window.SidekickModules.AttackList.init().then(() => {
                            // Render any existing attack lists
                            window.SidekickModules.AttackList.renderAllAttackLists();
                        });
                    } else {
                        console.log("⚔️ Refreshing existing Attack Lists...");
                        window.SidekickModules.AttackList.renderAllAttackLists();
                    }
                }

                // Initialize/refresh Todo List module when sidebar opens
                if (window.SidekickModules?.TodoList) {
                    if (!window.SidekickModules.TodoList.isInitialized) {
                        console.log("📋 Triggering Todo List initialization...");
                        window.SidekickModules.TodoList.init().then(() => {
                            // Render any existing todo lists
                            window.SidekickModules.TodoList.renderAllTodoLists();
                        });
                    } else {
                        console.log("📋 Refreshing existing Todo Lists...");
                        window.SidekickModules.TodoList.renderAllTodoLists();
                    }
                }

                // Initialize Stock Advisor module when sidebar opens
                if (window.SidekickModules?.StockAdvisor) {
                    if (!window.SidekickModules.StockAdvisor.isInitialized) {
                        console.log("📊 Triggering Stock Advisor initialization...");
                        window.SidekickModules.StockAdvisor.init();
                    }
                }

                // Save state
                this.saveSidebarState();
            }
            // Show logo when sidebar opens
            if (this.topBar) {
                this.topBar.classList.remove('hidden');
            }
        },

        // Close sidebar
        closeSidebar() {
            if (this.sidebar) {
                this.sidebar.classList.add('hidden');
                this.sidebarVisible = false;
                console.log("📕 Sidebar closed");

                // Don't clear existing link group elements when sidebar closes - they should persist
                // Comment out the clearing to keep link groups visible
                // if (window.SidekickModules?.LinkGroup?.clearExistingLinkGroups) {
                //     window.SidekickModules.LinkGroup.clearExistingLinkGroups();
                // }

                // Save state
                this.saveSidebarState();
            }
            // Hide logo when sidebar closes
            if (this.topBar) {
                this.topBar.classList.add('hidden');
            }
        },

        // ── Multi-page system ──────────────────────────────────────────────

        // Render the page tab strip
        renderPageTabs() {
            if (!this.tabBar) return;
            this.tabBar.innerHTML = '';
            this.pages.forEach((pg, idx) => {
                const tab = document.createElement('div');
                tab.className = 'sidekick-page-tab' + (idx === this.activePageIndex ? ' active' : '');
                tab.dataset.idx = idx;
                tab.innerHTML = `<span class="tab-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;">${this.escapeTabName(pg.name)}</span>`
                    + (this.pages.length > 1 ? `<span class="tab-delete" title="Delete page">✕</span>` : '');

                // Delay a single click briefly so it does not destroy and
                // re-render the tab before the browser can deliver dblclick.
                tab.querySelector('.tab-label').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (e.detail > 1) return;
                    clearTimeout(this.pageClickTimer);
                    this.pageClickTimer = setTimeout(() => {
                        if (idx !== this.activePageIndex) this.switchPage(idx);
                    }, 220);
                });

                // Double-click to rename
                tab.querySelector('.tab-label').addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearTimeout(this.pageClickTimer);
                    const input = document.createElement('input');
                    input.value = pg.name;
                    input.style.cssText = 'background:transparent;border:none;outline:none;color:#8BC34A;width:80px;font-size:11px;';
                    const lbl = tab.querySelector('.tab-label');
                    lbl.textContent = '';
                    lbl.appendChild(input);
                    input.focus();
                    input.select();
                    let finished = false;
                    const done = (save = true) => {
                        if (finished) return;
                        finished = true;
                        const v = save ? (input.value.trim() || pg.name) : pg.name;
                        pg.name = v;
                        this.renderPageTabs();
                        this.saveSidebarState();
                    };
                    input.addEventListener('blur', done);
                    input.addEventListener('click', event => event.stopPropagation());
                    input.addEventListener('dblclick', event => event.stopPropagation());
                    input.addEventListener('keydown', event => {
                        if (event.key === 'Enter') input.blur();
                        if (event.key === 'Escape') done(false);
                    });
                });

                // Delete button
                const delBtn = tab.querySelector('.tab-delete');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deletePage(idx);
                    });
                }

                this.tabBar.appendChild(tab);
            });
            this.tabBar.appendChild(this.addPageBtn);
        },

        escapeTabName(s) {
            return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        },

        // Switch to a page by index
        switchPage(idx, silent = false) {
            this.pages.forEach((pg, i) => {
                pg.contentEl.classList.toggle('active', i === idx);
            });
            this.activePageIndex = idx;
            // Update backward-compat #sidekick-content to point to active page
            this.pages.forEach((pg, i) => {
                pg.contentEl.id = i === idx ? 'sidekick-content' : `sidekick-page-${pg.id}`;
            });
            if (!silent) {
                this.renderPageTabs();
                this.saveSidebarState();
            }
        },

        // Add a new page
        addPage() {
            const pg = { id: Date.now() + Math.random(), name: `Page ${this.pages.length + 1}` };
            const contentEl = document.createElement('div');
            contentEl.className = 'sidekick-page';
            contentEl.dataset.pageId = pg.id;
            contentEl.style.cssText = 'flex:1; overflow:auto; position:relative; padding:5px;';
            const pageHost = document.getElementById('sidekick-page-host');
            // Insert before the add-module (+) button
            const addModBtn = pageHost?.querySelector('.sidekick-add-module-btn');
            if (addModBtn) pageHost.insertBefore(contentEl, addModBtn);
            else pageHost?.appendChild(contentEl);
            this.pages.push({ ...pg, contentEl });
            this.switchPage(this.pages.length - 1);
            this.renderPageTabs();
            this.saveSidebarState();
        },

        // Delete a page (and all its module windows)
        deletePage(idx) {
            if (this.pages.length <= 1) return; // Always keep at least one page
            const pg = this.pages[idx];
            if (!pg) return;
            if (!confirm(`Delete "${pg.name}" and all its modules?`)) return;

            // Remove all child module windows in this page
            while (pg.contentEl.firstChild) pg.contentEl.removeChild(pg.contentEl.firstChild);
            pg.contentEl.remove();

            this.pages.splice(idx, 1);
            const newActive = Math.min(this.activePageIndex, this.pages.length - 1);
            this.switchPage(newActive, true);
            this.renderPageTabs();
            this.saveSidebarState();
        },

        // ── Resize handle ─────────────────────────────────────────────────
        initResizeHandle(handle) {
            let startX = 0, startW = 0;
            const MIN_W = 280, MAX_W = 900;

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startX = e.clientX;
                startW = this.sidebarWidth;
                handle.classList.add('dragging');

                const onMove = (ev) => {
                    const delta = ev.clientX - startX;
                    const newW = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
                    this.updateSidebarWidth(newW);
                };
                const onUp = () => {
                    handle.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    this.saveSidebarState();
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        },

        updateSidebarWidth(w) {
            this.sidebarWidth = w;
            document.documentElement.style.setProperty('--sidekick-width', w + 'px');
        },

        // Initialize notepad area instead of navigation tabs
        async initializeNotepadArea() {
            const contentArea = this.sidebar.querySelector('#sidekick-content');
            if (!contentArea) return;

            // Don't clear existing content - preserve any existing timers or modules
            // Only initialize if notepad area is truly empty
            if (contentArea.children.length === 0) {
                console.log("🔍 Content area is empty, safe to initialize notepad");
            } else {
                console.log("🔍 Content area has existing content, preserving it");
            }

            // Wait for notepad module and initialize it
            try {
                if (window.SidekickModules?.Notepad) {
                    await window.SidekickModules.Notepad.init();
                    window.SidekickModules.Notepad.refreshDisplay();
                    console.log("✅ Notepad module initialized in sidebar");
                }
            } catch (error) {
                console.error("❌ Failed to initialize notepad module:", error);
            }
        },

        // Create a new notepad window in the sidebar
        async createNewNotepad() {
            try {
                if (!window.SidekickModules?.Notepad) {
                    this.showNotification('Notepad Error', 'Notepad module not loaded', 'error');
                    return;
                }

                await window.SidekickModules.Notepad.init();

                // Create notepad immediately without prompting for title
                const notepad = window.SidekickModules.Notepad.addNotepad('New Note');
            } catch (error) {
                console.error('Failed to create notepad:', error);
                this.showNotification('Notepad Error', 'Failed to create notepad', 'error');
            }
        },

        // Show add module menu as sleek inline dropdown
        showAddModuleMenu() {
            console.log("📋 Showing add module menu");

            // Remove existing menu if present
            const existingMenu = document.getElementById('sidekick-module-menu');
            if (existingMenu) {
                existingMenu.remove();
                return; // Toggle behavior - close if already open
            }

            // Create sleek inline menu - positioned on the left side
            const menu = document.createElement('div');
            menu.id = 'sidekick-module-menu';
            menu.style.cssText = `
                position: absolute;
                bottom: 55px;
                left: 15px;
                width: 140px;
                background: rgba(25, 25, 25, 0.98);
                border-radius: 8px;
                padding: 6px;
                box-shadow: 0 6px 24px rgba(0,0,0,0.7);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255,255,255,0.12);
                z-index: 19999;
                transform: translateY(10px);
                opacity: 0;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            menu.innerHTML = `
                <div style="display: grid; gap: 3px;">
                    <button class="module-option" data-module="notepad" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">📝</span> Notepad
                    </button>
                    <button class="module-option" data-module="timer" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">⏰</span> Timer
                    </button>
                    <button class="module-option" data-module="todolist" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">✅</span> Todo
                    </button>
                    <button class="module-option" data-module="stockadvisor" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">📊</span> Stock Advisor
                    </button>
                    <button class="module-option" data-module="linkgroup" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">🔗</span> Links
                    </button>
                    <button class="module-option" data-module="attacklist" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">⚔️</span> Attack List
                    </button>
                    <button class="module-option" data-module="debttracker" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">💰</span> Debt Tracker
                    </button>
                    <button class="module-option" data-module="statstracker" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">📊</span> Stats Tracker
                    </button>
                    <button class="module-option" data-module="travelstocks" style="
                       background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">✈️</span> Travel Stocks
                   </button>
                    <button class="module-option" data-module="auctiontracker" style="
                        background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));
                        border: 1px solid rgba(255,255,255,0.06);
                        color: rgba(255,255,255,0.92);
                        padding: 10px 12px;
                        border-radius: 6px;
                        cursor: pointer;
                        text-align: left;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-weight: 500;
                        letter-spacing: 0.3px;
                    ">
                        <span style="font-size: 13px; filter: grayscale(0.2);">🏷️</span> Auction Tracker
                    </button>
                </div>
            `;

            // Add to sidebar content area
            const contentArea = this.sidebar.querySelector('#sidekick-content');
            if (contentArea) {
                contentArea.appendChild(menu);
            }

            // Add event listeners
            setTimeout(() => {
                // Animate in
                menu.style.transform = 'translateY(0)';
                menu.style.opacity = '1';

                const moduleOptions = menu.querySelectorAll('.module-option');
                moduleOptions.forEach(option => {
                    option.addEventListener('mouseenter', () => {
                        option.style.background = 'linear-gradient(135deg, rgba(102, 187, 106, 0.2), rgba(102, 187, 106, 0.1))';
                        option.style.borderColor = 'rgba(102, 187, 106, 0.3)';
                        option.style.transform = 'translateY(-1px)';
                        option.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                    });
                    option.addEventListener('mouseleave', () => {
                        option.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))';
                        option.style.borderColor = 'rgba(255,255,255,0.06)';
                        option.style.transform = 'translateY(0)';
                        option.style.boxShadow = 'none';
                    });
                    option.addEventListener('click', () => {
                        const moduleType = option.dataset.module;
                        this.addNewModule(moduleType);
                        menu.remove();
                    });
                });
            }, 0);

            // Auto-close after 8 seconds
            setTimeout(() => {
                if (document.getElementById('sidekick-module-menu') === menu) {
                    menu.style.transform = 'translateY(10px)';
                    menu.style.opacity = '0';
                    setTimeout(() => menu.remove(), 250);
                }
            }, 8000);
        },

        // Add new notepad module directly to sidebar
        addNewModule(moduleType) {
            console.log(`➕ Adding new ${moduleType} module`);

            switch (moduleType) {
                case 'notepad':
                    this.createNewNotepad();
                    break;
                case 'timer':
                    this.createNewTimer();
                    break;
                case 'linkgroup':
                    this.createNewLinkGroup();
                    break;
                case 'attacklist':
                    this.createNewAttackList();
                    break;
                case 'todolist':
                    this.createNewTodoList();
                    break;
                case 'stockadvisor':
                    this.createStockAdvisor();
                    break;
                case 'debttracker':
                    this.createNewDebtTracker();
                    break;
                case 'statstracker':
                    this.createStatsTracker();
                    break;
                case 'travelstocks':
                    this.createTravelStocks();
                    break;
                case 'auctiontracker':
                    this.createAuctionTracker();
                    break;
                default:
                    this.showNotification('Unknown Module', 'Module type not recognized', 'error');
            }
        },

        // Create a new timer window in the sidebar
        async createNewTimer() {
            try {
                if (!window.SidekickModules?.Timer) {
                    this.showNotification('Timer Error', 'Timer module not loaded', 'error');
                    return;
                }

                // Don't re-init if already initialized - just add timer
                if (!window.SidekickModules.Timer.isInitialized) {
                    await window.SidekickModules.Timer.init();
                }

                // Create timer immediately with cooldown selection interface
                const timer = window.SidekickModules.Timer.addTimer('Cooldown Timer');
                this.showNotification('Timer Created', 'New cooldown timer created', 'success');
            } catch (error) {
                console.error('Failed to create timer:', error);
                this.showNotification('Timer Error', 'Failed to create timer', 'error');
            }
        },

        // Create a new notepad window in the sidebar
        async createNewNotepad() {
            try {
                if (!window.SidekickModules?.Notepad) {
                    this.showNotification('Notepad Error', 'Notepad module not loaded', 'error');
                    return;
                }

                await window.SidekickModules.Notepad.init();

                // Create notepad immediately without prompting for title
                const notepad = window.SidekickModules.Notepad.addNotepad('New Note');
            } catch (error) {
                console.error('Failed to create notepad:', error);
                this.showNotification('Notepad Error', 'Failed to create notepad', 'error');
            }
        },

        // Create a new link group window in the sidebar
        async createNewLinkGroup() {
            try {
                if (!window.SidekickModules?.LinkGroup) {
                    this.showNotification('Link Group Error', 'Link Group module not loaded', 'error');
                    return;
                }

                // Don't re-init if already initialized - just add link group
                if (!window.SidekickModules.LinkGroup.isInitialized) {
                    await window.SidekickModules.LinkGroup.init();
                }

                // Create link group immediately with default name
                const linkGroup = window.SidekickModules.LinkGroup.createLinkGroup('Links');
                this.showNotification('Link Group Created', 'New link group created', 'success');
            } catch (error) {
                console.error('Failed to create link group:', error);
                this.showNotification('Link Group Error', 'Failed to create link group', 'error');
            }
        },

        // Create a new attack list window in the sidebar
        async createNewAttackList() {
            try {
                if (!window.SidekickModules?.AttackList) {
                    this.showNotification('Attack List Error', 'Attack List module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.AttackList.isInitialized) {
                    await window.SidekickModules.AttackList.init();
                }

                // Create attack list immediately with default name
                const attackList = window.SidekickModules.AttackList.createNewAttackList();
                this.showNotification('Attack List Created', 'New attack list created', 'success');
            } catch (error) {
                console.error('Failed to create attack list:', error);
                this.showNotification('Attack List Error', 'Failed to create attack list', 'error');
            }
        },

        // Create a new todo list window in the sidebar
        async createNewTodoList() {
            try {
                if (!window.SidekickModules?.TodoList) {
                    this.showNotification('Todo List Error', 'Todo List module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.TodoList.isInitialized) {
                    await window.SidekickModules.TodoList.init();
                }

                // Create todo list immediately
                const todoList = window.SidekickModules.TodoList.createNewTodoList();
                this.showNotification('Todo List Created', 'New todo list with daily tasks created', 'success');
            } catch (error) {
                console.error('Failed to create todo list:', error);
                this.showNotification('Todo List Error', 'Failed to create todo list', 'error');
            }
        },

        // Create a new debt tracker window
        async createNewDebtTracker() {
            try {
                if (!window.SidekickModules?.Debt) {
                    this.showNotification('Debt Tracker Error', 'Debt module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.Debt.isInitialized) {
                    await window.SidekickModules.Debt.init();
                }

                // Show unified debt tracker window
                window.SidekickModules.Debt.showDebtTrackerWindow();
                this.showNotification('Debt Tracker', 'Debt tracker window opened', 'info');
            } catch (error) {
                console.error('Failed to create debt tracker:', error);
                this.showNotification('Debt Tracker Error', 'Failed to open debt tracker', 'error');
            }
        },

        // Create Stock Advisor window
        async createStockAdvisor() {
            try {
                if (!window.SidekickModules?.StockAdvisor) {
                    this.showNotification('Stock Advisor Error', 'Stock Advisor module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.StockAdvisor.isInitialized) {
                    await window.SidekickModules.StockAdvisor.init();
                }

                // Show stock advisor window
                window.SidekickModules.StockAdvisor.showStockAdvisor();
                this.showNotification('Stock Advisor', 'Stock advisor window opened', 'info');
            } catch (error) {
                console.error('Failed to create stock advisor:', error);
                this.showNotification('Stock Advisor Error', 'Failed to open stock advisor', 'error');
            }
        },

        // Create Stats Tracker window
        async createStatsTracker() {
            try {
                if (!window.SidekickModules?.StatsTracker) {
                    this.showNotification('Stats Tracker Error', 'Stats Tracker module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.StatsTracker.isInitialized) {
                    await window.SidekickModules.StatsTracker.init();
                }

                // Enable stats tracker (creates window)
                if (!window.SidekickModules.StatsTracker.isEnabled) {
                    window.SidekickModules.StatsTracker.enable();
                    this.showNotification('Stats Tracker', 'Stats tracker window opened', 'info');
                } else {
                    this.showNotification('Stats Tracker', 'Stats tracker already open', 'info');
                }
            } catch (error) {
                console.error('Failed to create stats tracker:', error);
                this.showNotification('Stats Tracker Error', 'Failed to open stats tracker', 'error');
            }
        },

        // Create Travel Stocks window
        async createTravelStocks() {
            try {
                if (!window.SidekickModules?.TravelStocks) {
                    this.showNotification('Travel Stocks Error', 'Travel Stocks module not loaded', 'error');
                    return;
                }

                // Initialize if not already done
                if (!window.SidekickModules.TravelStocks.state.isEnabled === false) {
                    await window.SidekickModules.TravelStocks.init();
                }

                // Create window
                await window.SidekickModules.TravelStocks.createWindow();
                this.showNotification('Travel Stocks', 'Travel stocks window opened', 'info');
            } catch (error) {
                console.error('Failed to create travel stocks:', error);
                this.showNotification('Travel Stocks Error', 'Failed to open travel stocks', 'error');
            }
        },

        // Create / focus the Auction Tracker window
        async createAuctionTracker() {
            try {
                if (!window.SidekickModules?.AuctionTracker) {
                    this.showNotification('Auction Tracker', 'Module not loaded yet — reload the page and try again', 'error');
                    return;
                }
                await window.SidekickModules.AuctionTracker.open();
            } catch (error) {
                console.error('Failed to open auction tracker:', error);
                this.showNotification('Auction Tracker Error', 'Failed to open tracker window', 'error');
            }
        },

        // Show advanced settings panel

        showAdvancedSettings() {
            console.log("⚙️ Showing advanced settings panel");
            console.log("⚙️ Available modules:", Object.keys(window.SidekickModules || {}));
            console.log("⚙️ Settings module check:", !!window.SidekickModules?.Settings?.createSettingsPanel);

            // Check if Settings module is available and use it
            if (window.SidekickModules?.Settings?.createSettingsPanel) {
                console.log("⚙️ Using Settings module for advanced settings");
                window.SidekickModules.Settings.createSettingsPanel();
                return;
            }

            console.log("⚙️ Settings module not available, using fallback panel");

            // Remove existing panel if present
            const existingPanel = document.getElementById('sidekick-advanced-panel');
            if (existingPanel) {
                existingPanel.remove();
                return; // Toggle behavior
            }

            // Create advanced settings panel
            const panel = document.createElement('div');
            panel.id = 'sidekick-advanced-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50px;
                right: 15px;
                width: 250px;
                background: linear-gradient(135deg, #2a2a2a, #1f1f1f);
                border: 1px solid #444;
                border-radius: 8px;
                padding: 15px;
                z-index: 10001;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                backdrop-filter: blur(20px);
                color: #fff;
                font-family: Arial, sans-serif;
            `;

            panel.innerHTML = `
                <div style="text-align: center; margin-bottom: 15px; font-weight: bold; color: #FFC107;">
                    ⚙️ Advanced Settings
                </div>
                
                <div class="setting-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px;">Chain Timer</span>
                        <button id="chain-timer-toggle" class="toggle-btn" style="
                            background: #444;
                            border: 1px solid #666;
                            color: #fff;
                            padding: 4px 8px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 12px;
                        ">Off</button>
                    </div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 2px;">
                        Floating chain countdown timer
                    </div>
                </div>
                
                <div class="setting-item" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px;">Debt Tracker</span>
                        <button id="open-debt-tracker" style="
                            background: #388e3c;
                            border: 1px solid #4caf50;
                            color: #fff;
                            padding: 4px 12px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 11px;
                        ">Open Tracker</button>
                    </div>
                    <div style="font-size: 11px; color: #aaa; margin-top: 2px;">
                        Unified debt and loan tracking window
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 15px;">
                    <button id="close-advanced" style="
                        background: #444;
                        border: 1px solid #666;
                        color: #fff;
                        padding: 6px 12px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    ">Close</button>
                </div>
            `;

            document.body.appendChild(panel);

            // Set up event listeners
            this.setupAdvancedSettingsListeners(panel);

            // Auto-close after 10 seconds
            setTimeout(() => {
                if (document.getElementById('sidekick-advanced-panel') === panel) {
                    panel.remove();
                }
            }, 10000);
        },

        // Set up advanced settings event listeners
        setupAdvancedSettingsListeners(panel) {
            // Chain Timer toggle
            const chainTimerToggle = panel.querySelector('#chain-timer-toggle');
            if (chainTimerToggle && window.SidekickModules?.ChainTimer) {
                const updateChainTimerButton = () => {
                    const status = window.SidekickModules.ChainTimer.getStatus();
                    chainTimerToggle.textContent = status.isActive ? 'On' : 'Off';
                    chainTimerToggle.style.background = status.isActive ? '#4CAF50' : '#444';
                };

                updateChainTimerButton();

                chainTimerToggle.addEventListener('click', async () => {
                    try {
                        await window.SidekickModules.ChainTimer.toggle();
                        updateChainTimerButton();
                    } catch (error) {
                        console.error('Failed to toggle chain timer:', error);
                    }
                });
            }

            // Close button
            const closeBtn = panel.querySelector('#close-advanced');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    panel.remove();
                });
            }

            // Open Debt Tracker button
            const openDebtTrackerBtn = panel.querySelector('#open-debt-tracker');
            if (openDebtTrackerBtn && window.SidekickModules?.Debt) {
                openDebtTrackerBtn.addEventListener('click', () => {
                    panel.remove(); // Close the settings panel
                    window.SidekickModules.Debt.showDebtTrackerWindow();
                });
            }

            // Click outside to close
            const closeOnClickOutside = (e) => {
                if (!panel.contains(e.target) && e.target.id !== 'sidekick-cog-button') {
                    panel.remove();
                    document.removeEventListener('click', closeOnClickOutside);
                }
            };

            setTimeout(() => {
                document.addEventListener('click', closeOnClickOutside);
            }, 100);
        },

        // Load sidebar state from storage
        async loadSidebarState() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.get) {
                    const saved = await window.SidekickModules.Core.ChromeStorage.get('sidekick_sidebar_state');
                    this.savedState = saved || { visible: false, width: 500, activePage: 0, pages: [] };
                    console.log('📖 Sidebar state loaded:', this.savedState);
                }
            } catch (error) {
                console.warn('⚠️ Failed to load sidebar state:', error);
                this.savedState = { visible: false, width: 500, activePage: 0, pages: [] };
            }
        },

        // Save sidebar state to storage
        async saveSidebarState() {
            try {
                if (window.SidekickModules?.Core?.ChromeStorage?.set) {
                    const state = {
                        visible: this.sidebarVisible,
                        width: this.sidebarWidth,
                        activePage: this.activePageIndex,
                        pages: this.pages.map(pg => ({ id: pg.id, name: pg.name }))
                    };
                    await window.SidekickModules.Core.ChromeStorage.set('sidekick_sidebar_state', state);

                    // Broadcast to other tabs
                    if (chrome?.runtime?.id) {
                        chrome.runtime.sendMessage({ type: 'SIDEBAR_STATE_CHANGED', state }).catch(() => {});
                    }
                }
            } catch (error) {
                if (error.message && !error.message.includes('Extension context invalidated')) {
                    console.warn('⚠️ Failed to save sidebar state:', error);
                }
            }
        },

        // Apply loaded sidebar state
        applySidebarState() {
            if (this.savedState && this.savedState.visible) {
                this.openSidebar();
            } else {
                this.closeSidebar();
            }
        },

        // Set up cross-tab state synchronization
        setupStateSync() {
            // Listen for messages from other tabs
            if (chrome && chrome.runtime && chrome.runtime.onMessage) {
                chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                    if (message.type === 'SIDEBAR_STATE_CHANGED') {
                        console.log("📡 Received sidebar state change from other tab:", message.state);
                        // Update local state to match
                        if (message.state.visible !== this.sidebarVisible) {
                            console.log(`📡 Syncing sidebar state: ${this.sidebarVisible} → ${message.state.visible}`);
                            if (message.state.visible) {
                                this.openSidebar();
                            } else {
                                this.closeSidebar();
                            }
                        }
                    }
                });

                // Also check for state changes via storage events
                if (chrome.storage && chrome.storage.onChanged) {
                    chrome.storage.onChanged.addListener((changes, namespace) => {
                        if (changes.sidekick_sidebar_state && namespace === 'local') {
                            const newState = changes.sidekick_sidebar_state.newValue;
                            if (newState && newState.visible !== this.sidebarVisible) {
                                console.log("💾 Storage sync detected sidebar state change:", newState);
                                if (newState.visible) {
                                    this.openSidebar();
                                } else {
                                    this.closeSidebar();
                                }
                            }
                        }
                    });
                }
            }
        },

        // Show notification (placeholder for now)
        showNotification(title, message, type = 'info') {
            console.log(`🔔 ${type.toUpperCase()}: ${title} - ${message}`);

            // Use Core notification system if available
            if (window.SidekickModules?.Core?.NotificationSystem) {
                window.SidekickModules.Core.NotificationSystem.show(title, message, type, 3000);
            }
        },

    };

    // Export UI module to global namespace
    window.SidekickModules.UI = UIModule;
    console.log("✅ UI Module loaded and ready");

})();
