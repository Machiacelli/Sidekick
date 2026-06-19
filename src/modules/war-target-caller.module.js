// War Target Caller Module
const WarTargetCallerModule = {
    isEnabled: false,
    STORAGE_KEY: 'sidekick_war_target_caller',
    testChatUser: '',

    claimedTargets: new Map(), // name -> claimer (e.g. "TargetName" -> "MyName")
    myCurrentClaim: null, // Track our own claim to enforce max 1

    chatObserver: null,
    membersObserver: null,

    async init() {
        console.log('🎯 War Target Caller initializing...');

        await this.loadSettings();

        if (this.isEnabled) {
            this.enable();
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && (changes[this.STORAGE_KEY] || changes['sidekick_war_target_caller'])) {
                this.loadSettings().then(() => {
                    if (this.isEnabled) this.enable();
                    else this.disable();
                });
            }
        });

        console.log('🎯 War Target Caller initialized');
    },

    async loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get(this.STORAGE_KEY) || {};
            this.isEnabled = settings.isEnabled === true;
            
            const savedData = await window.SidekickModules.Core.ChromeStorage.get('sidekick_wtc_data') || {};
            if (savedData.claims && Array.isArray(savedData.claims)) {
                const now = Date.now();
                this.claimedTargets = new Map();
                savedData.claims.forEach(([name, data]) => {
                    // Filter out claims older than 2 hours
                    if (data && data.timestamp && (now - data.timestamp < 3600000 * 2)) {
                        this.claimedTargets.set(name, {
                            claimer: data.claimer,
                            lastUntil: data.lastUntil || 0
                        });
                    }
                });
            }
            if (savedData.myCurrentClaim) {
                if (this.claimedTargets.has(savedData.myCurrentClaim.toLowerCase())) {
                    this.myCurrentClaim = savedData.myCurrentClaim;
                } else {
                    this.myCurrentClaim = null;
                }
            }
        } catch (error) {
            console.error('🎯 Failed to load settings:', error);
        }
    },

    async saveClaims() {
        try {
            const claimsArr = Array.from(this.claimedTargets.entries()).map(([name, val]) => [name, {
                claimer: val.claimer, 
                lastUntil: val.lastUntil, 
                timestamp: Date.now()
            }]);
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_wtc_data', {
                claims: claimsArr,
                myCurrentClaim: this.myCurrentClaim
            });
        } catch (err) {
            console.error('Failed to save WTC claims', err);
        }
    },

    enable() {
        this.isEnabled = true;
        this.injectStyles();
        this.startChatObserver();
        
        if (window.location.href.includes('factions.php')) {
            this.startMembersObserver();
        }
    },

    disable() {
        this.isEnabled = false;
        if (this.chatObserver) {
            this.chatObserver.disconnect();
            this.chatObserver = null;
        }
        if (this.membersObserver) {
            this.membersObserver.disconnect();
            this.membersObserver = null;
        }
        
        // Remove visuals
        document.querySelectorAll('.sk-wtc-badge, .sk-wtc-btn').forEach(el => el.remove());
    },

    injectStyles() {
        if (document.getElementById('war-target-caller-styles')) return;

        const style = document.createElement('style');
        style.id = 'war-target-caller-styles';
        style.textContent = `
            .sk-wtc-btn {
                background: transparent;
                border: none;
                padding: 0;
                font-size: 12px;
                cursor: pointer;
                margin-right: 3px;
                vertical-align: middle;
                line-height: 1;
            }
            .sk-wtc-btn:hover {
                transform: scale(1.1);
            }
            .sk-wtc-btn:active {
                transform: scale(0.9);
            }
            .sk-wtc-badge {
                font-size: 12px;
                margin-right: 3px;
                vertical-align: middle;
                line-height: 1;
                cursor: help;
            }
        `;
        document.head.appendChild(style);
    },

    startChatObserver() {
        if (this.chatObserver) return;
        const chatRoot = document.getElementById('chatRoot');
        if (!chatRoot) {
            setTimeout(() => this.startChatObserver(), 1000);
            return;
        }

        this.chatObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        // Look for message text containers
                        const msgs = node.querySelectorAll ? node.querySelectorAll('[class*="messageText"]') : [];
                        if (node.className && typeof node.className === 'string' && node.className.includes('messageText')) {
                            this.parseChatMessage(node);
                        }
                        msgs.forEach(msg => this.parseChatMessage(msg));
                    }
                }
            }
        });
        
        this.chatObserver.observe(chatRoot, { childList: true, subtree: true });
    },

    parseChatMessage(msgNode) {
        let validChat = false;
        let curr = msgNode;
        while (curr && curr !== document && curr.classList) {
            if (curr.className && typeof curr.className === 'string' && (curr.className.includes('chat-box') || curr.className.includes('chatWindow'))) {
                const header = curr.querySelector('div[class*="header"], div[class*="title"], span[class*="name"]');
                if (header) {
                    const headerText = header.textContent.toLowerCase();
                    if (headerText.includes('faction')) {
                        validChat = true;
                    }
                }
                break;
            }
            curr = curr.parentNode;
        }

        if (!validChat) return;

        // Find the sender (usually in previous sibling or parent context)
        const text = msgNode.textContent || '';
        const match = text.match(/(?:\bcall\b|\bhitting\b)\s+(.+?)(?:\s+in\s+|\s*$)/i);
        if (match) {
            let targetName = match[1].trim();
            targetName = targetName.replace(/\s+in\s+.*$/i, '').trim();
            
            // For now, we don't know who said it unless we traverse up, 
            // but we can just mark it as claimed
            this.claimedTargets.set(targetName.toLowerCase(), { claimer: 'Claimed', lastUntil: 0 });
            this.saveClaims();
            this.updateWarPanelVisuals();
        }
    },

    startMembersObserver() {
        if (this.membersObserver) return;
        
        const updateUI = () => {
            const enemies = document.querySelectorAll('.enemy-faction ul.members-list li, ul.members-list li.enemy');
            enemies.forEach(li => {
                if (!li.classList.contains('clear') && !li.classList.contains('title')) {
                    this.injectToMemberRow(li);
                }
            });
        };

        this.membersObserver = new MutationObserver(() => updateUI());
        this.membersObserver.observe(document.body, { childList: true, subtree: true });
        
        // Initial run
        setTimeout(updateUI, 500);
    },

    extractNameFromRow(li) {
        const nameEl = li.querySelector('.name a') || li.querySelector('.user.name');
        if (nameEl) return nameEl.textContent.trim();

        const profileLink = li.querySelector(`a[href^='/profiles.php']`);
        if (profileLink) {
            const honorText = profileLink.querySelector('.honor-text:not(.honor-text-svg)');
            if (honorText) return honorText.textContent.trim();
            
            const aria = profileLink.getAttribute('aria-label');
            if (aria) return aria.replace('View profile of ', '').trim();
        }
        return null;
    },

    injectToMemberRow(li) {
        if (li.querySelector('.sk-wtc-btn') || li.querySelector('.sk-wtc-badge')) return;
        const targetName = this.extractNameFromRow(li);
        if (!targetName) return;
        this.updateMemberRow(li, targetName);
    },

    updateMemberRow(li, targetName) {
        const targetNameLow = targetName.toLowerCase();
        const container = li.querySelector('.level') || li.querySelector('.name') || li.querySelector('.user');
        if (!container) return;

        if (this.claimedTargets.has(targetNameLow)) {
            const claimObj = this.claimedTargets.get(targetNameLow);
            
            // Check if timer jumped up
            let currentUntil = 0;
            const profileLink = li.querySelector('.name a') || li.querySelector(`a[href^='/profiles.php']`);
            if (profileLink) {
                const idMatch = profileLink.href.match(/[IX]D=(\d+)/i);
                if (idMatch && window.SidekickModules?.WarMonitor?.memberStatus) {
                    const status = window.SidekickModules.WarMonitor.memberStatus.get(idMatch[1]);
                    if (status) currentUntil = status.until || 0;
                }
            }
            
            if (currentUntil > claimObj.lastUntil + 60) {
                // Timer jumped! Auto unclaim
                this.claimedTargets.delete(targetNameLow);
                if (this.myCurrentClaim && this.myCurrentClaim.toLowerCase() === targetNameLow) {
                    this.myCurrentClaim = null;
                }
                this.saveClaims();
                return this.updateMemberRow(li, targetName);
            } else if (currentUntil < claimObj.lastUntil - 60) {
                // Timer dropped (e.g. revives)
                claimObj.lastUntil = currentUntil;
                this.saveClaims();
            }

            const btn = li.querySelector('.sk-wtc-btn:not(.sk-wtc-badge)');
            if (btn) btn.remove();
            
            let badge = li.querySelector('.sk-wtc-badge');
            if (!badge) {
                badge = document.createElement('button');
                badge.className = 'sk-wtc-badge sk-wtc-btn';
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const co = this.claimedTargets.get(targetNameLow);
                    if (co && co.claimer === 'Me') {
                        this.claimedTargets.delete(targetNameLow);
                        if (this.myCurrentClaim && this.myCurrentClaim.toLowerCase() === targetNameLow) {
                            this.myCurrentClaim = null;
                        }
                        this.saveClaims();
                        this.updateWarPanelVisuals();
                    }
                });
                container.insertBefore(badge, container.firstChild);
            }
            const claimer = claimObj.claimer;
            if (badge.textContent !== '❌') badge.textContent = '❌';
            const newColor = claimer === 'Me' ? '#ff4d4d' : '#4d79ff';
            if (badge.style.color !== newColor) badge.style.color = newColor;
            const newTitle = `Claimed by ${claimer}` + (claimer === 'Me' ? ' (Click to unclaim)' : '');
            if (badge.title !== newTitle) badge.title = newTitle;
            const newCursor = claimer === 'Me' ? 'pointer' : 'help';
            if (badge.style.cursor !== newCursor) badge.style.cursor = newCursor;
        } else {
            const badge = li.querySelector('.sk-wtc-badge');
            if (badge && badge.textContent !== 'Copied!') badge.remove();
            
            let btn = li.querySelector('.sk-wtc-btn:not(.sk-wtc-badge)');
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'sk-wtc-btn';
                btn.textContent = '✔️';
                btn.title = 'Claim Target';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.claimTarget(targetName, li);
                });
                container.insertBefore(btn, container.firstChild);
            }
        }
    },

    updateWarPanelVisuals() {
        if (!window.location.href.includes('factions.php')) return;
        const enemies = document.querySelectorAll('.enemy-faction ul.members-list li, ul.members-list li.enemy');
        enemies.forEach(li => {
            if (li.classList.contains('clear') || li.classList.contains('title')) return;
            const targetName = this.extractNameFromRow(li);
            if (!targetName) return;
            this.updateMemberRow(li, targetName);
        });
    },

    claimTarget(targetName, li) {
        if (this.myCurrentClaim) {
            if (confirm(`You already claimed ${this.myCurrentClaim}. Release it and claim ${targetName} instead?`)) {
                this.claimedTargets.delete(this.myCurrentClaim.toLowerCase());
                this.myCurrentClaim = targetName;
            } else {
                return;
            }
        } else {
            this.myCurrentClaim = targetName;
        }

        let targetId = '';
        const profileLink = li.querySelector('.name a') || li.querySelector(`a[href^='/profiles.php']`);
        if (profileLink) {
            const idMatch = profileLink.href.match(/[IX]D=(\d+)/i);
            if (idMatch) {
                targetId = idMatch[1];
            }
        }

        let targetUntil = 0;
        let timeString = '';
        if (targetId && window.SidekickModules?.WarMonitor?.memberStatus) {
            const status = window.SidekickModules.WarMonitor.memberStatus.get(targetId);
            if (status && (status.state === 'Hospital' || status.state === 'Jail' || status.state === 'Traveling' || status.state === 'Abroad')) {
                const now = Date.now() / 1000;
                if (status.until > now) {
                    targetUntil = status.until;
                    const diff = status.until - now;
                    const mins = Math.floor(diff / 60);
                    const secs = Math.floor(diff % 60);
                    if (mins > 0) {
                        timeString = ` in ${mins}m ${secs}s`;
                    } else {
                        timeString = ` in ${secs}s`;
                    }
                }
            }
        }

        this.claimedTargets.set(targetName.toLowerCase(), { claimer: 'Me', lastUntil: targetUntil });
        this.saveClaims();
        this.updateWarPanelVisuals();

        const idString = targetId ? ` [${targetId}]` : '';
        const message = `Hitting ${targetName}${idString}${timeString}`;
        
        navigator.clipboard.writeText(message).then(() => {
            const badge = li.querySelector('.sk-wtc-badge');
            if (badge) {
                const oldText = badge.textContent;
                const oldColor = badge.style.color;
                badge.textContent = 'Copied!';
                badge.style.color = '#4CAF50';
                badge.style.fontSize = '10px';
                setTimeout(() => { 
                    badge.textContent = oldText; 
                    badge.style.color = oldColor;
                    badge.style.fontSize = '';
                }, 1500);
            }
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
            alert(`Copy to clipboard blocked by browser.\n\nMessage: ${message}`);
        });
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.WarTargetCaller = WarTargetCallerModule;
console.log('🎯 War Target Caller module registered');
