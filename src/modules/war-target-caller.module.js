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
            let testUser = await window.SidekickModules.Core.ChromeStorage.get('sidekick_wtc_test_user');
            if (!testUser) testUser = localStorage.getItem('sidekick_wtc_test_user_backup');
            this.testChatUser = testUser || '';
        } catch (error) {
            console.error('🎯 Failed to load settings:', error);
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
                background: linear-gradient(180deg, #444, #222);
                border: 1px solid #555;
                color: #ddd;
                border-radius: 3px;
                padding: 1px 6px;
                font-size: 10px;
                cursor: pointer;
                margin-left: 6px;
                line-height: 14px;
                vertical-align: middle;
            }
            .sk-wtc-btn:hover {
                background: linear-gradient(180deg, #555, #333);
                color: #fff;
            }
            .sk-wtc-btn:active {
                background: #111;
            }
            .sk-wtc-badge {
                font-size: 10px;
                font-weight: bold;
                color: #ff5e5e;
                margin-left: 6px;
                vertical-align: middle;
                background: rgba(255, 0, 0, 0.1);
                padding: 1px 4px;
                border-radius: 2px;
                border: 1px solid rgba(255, 0, 0, 0.3);
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
        // Find the sender (usually in previous sibling or parent context)
        // In Torn, a message wrapper usually contains sender info, but we can just regex the text for testing.
        const text = msgNode.textContent || '';
        const match = text.match(/(?:\bcall\b|\bhitting\b)\s+(.+?)(?:\s+in\s+|\s*$)/i);
        if (match) {
            let targetName = match[1].trim();
            // Remove trailing words if they match "in xxx minutes"
            targetName = targetName.replace(/\s+in\s+\d+\s+minutes?$/i, '').trim();
            
            // For now, we don't know who said it unless we traverse up, 
            // but we can just mark it as claimed
            this.claimedTargets.set(targetName.toLowerCase(), 'Claimed');
            this.updateWarPanelVisuals();
        }
    },

    startMembersObserver() {
        if (this.membersObserver) return;
        
        const updateUI = () => {
            const enemies = document.querySelectorAll('ul.members-list li.enemy');
            enemies.forEach(li => this.injectToMemberRow(li));
        };

        this.membersObserver = new MutationObserver(() => updateUI());
        this.membersObserver.observe(document.body, { childList: true, subtree: true });
        
        // Initial run
        setTimeout(updateUI, 500);
    },

    injectToMemberRow(li) {
        if (li.querySelector('.sk-wtc-btn') || li.querySelector('.sk-wtc-badge')) return;

        const nameEl = li.querySelector('.name a') || li.querySelector('.user.name');
        if (!nameEl) return;

        const targetName = nameEl.textContent.trim();
        const targetNameLow = targetName.toLowerCase();

        // Container to inject badge or button
        const container = li.querySelector('.name') || li.querySelector('.user');
        if (!container) return;

        if (this.claimedTargets.has(targetNameLow)) {
            // It's claimed
            const claimer = this.claimedTargets.get(targetNameLow);
            const badge = document.createElement('span');
            badge.className = 'sk-wtc-badge';
            badge.textContent = `CLAIMED`;
            container.appendChild(badge);
        } else {
            // Not claimed, add Claim button
            const btn = document.createElement('button');
            btn.className = 'sk-wtc-btn';
            btn.textContent = 'Claim';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.claimTarget(targetName, li);
            });
            container.appendChild(btn);
        }
    },

    updateWarPanelVisuals() {
        if (!window.location.href.includes('factions.php')) return;
        const enemies = document.querySelectorAll('ul.members-list li.enemy');
        enemies.forEach(li => {
            const nameEl = li.querySelector('.name a') || li.querySelector('.user.name');
            if (!nameEl) return;
            const targetNameLow = nameEl.textContent.trim().toLowerCase();
            
            if (this.claimedTargets.has(targetNameLow)) {
                // If it has a button, remove it and add badge
                const btn = li.querySelector('.sk-wtc-btn');
                if (btn) btn.remove();
                
                if (!li.querySelector('.sk-wtc-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'sk-wtc-badge';
                    badge.textContent = `CLAIMED`;
                    const container = li.querySelector('.name') || li.querySelector('.user');
                    if (container) container.appendChild(badge);
                }
            }
        });
    },

    claimTarget(targetName, li) {
        if (this.myCurrentClaim) {
            if (confirm(`You already claimed ${this.myCurrentClaim}. Release it and claim ${targetName} instead?`)) {
                this.myCurrentClaim = targetName;
            } else {
                return;
            }
        } else {
            this.myCurrentClaim = targetName;
        }

        this.claimedTargets.set(targetName.toLowerCase(), 'Me');
        this.updateWarPanelVisuals();

        // Format message
        let timeString = '';
        
        // Try to get data from WarMonitor if enabled
        const profileLink = li.querySelector('.name a');
        if (profileLink && window.SidekickModules?.WarMonitor?.memberStatus) {
            const idMatch = profileLink.href.match(/ID=(\d+)/);
            if (idMatch) {
                const id = idMatch[1];
                const status = window.SidekickModules.WarMonitor.memberStatus.get(id);
                if (status && (status.state === 'Hospital' || status.state === 'Jail' || status.state === 'Traveling' || status.state === 'Abroad')) {
                    const now = Date.now() / 1000;
                    if (status.until > now) {
                        const mins = Math.ceil((status.until - now) / 60);
                        timeString = ` in ${mins} minutes`;
                    }
                }
            }
        }

        const message = `Hitting ${targetName}${timeString}`;
        this.sendChatMessage(message);
    },

    sendChatMessage(message) {
        const chatRoot = document.getElementById('chatRoot');
        if (!chatRoot) {
            alert("Test Send Failed: Could not find Torn's main chat container (chatRoot). Make sure chat is loaded on this page!");
            return;
        }

        // Find the right chat box robustly
        let targetBox = null;
        const targetNameLower = this.testChatUser ? this.testChatUser.toLowerCase() : 'faction';

        // 1. Try finding by chat box containers
        const boxes = chatRoot.querySelectorAll('div[class*="chat-box"], div[class*="chatWindow"]');
        boxes.forEach(box => {
            const header = box.querySelector('div[class*="header"], div[class*="title"], span[class*="name"]');
            if (header && header.textContent.toLowerCase().includes(targetNameLower)) {
                targetBox = box;
            }
        });

        // 2. If not found, try finding from the textareas upwards
        if (!targetBox) {
            const inputs = chatRoot.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]');
            for (const input of inputs) {
                let curr = input;
                let found = false;
                for (let i = 0; i < 8; i++) {
                    if (!curr || curr === chatRoot) break;
                    
                    // Look for anything that might be a header in this container
                    const possibleHeaders = curr.querySelectorAll('div, span, button, a');
                    for (const el of possibleHeaders) {
                        const className = (el.className || '').toLowerCase();
                        if ((className.includes('head') || className.includes('title') || className.includes('name')) && 
                            el.textContent.toLowerCase().includes(targetNameLower)) {
                            targetBox = curr;
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                    curr = curr.parentElement;
                }
                if (found) break;
            }
        }

        if (!targetBox) {
            console.warn(`🎯 Chat box matching "${targetNameLower}" not found!`);
            alert(`Could not find chat box for ${this.testChatUser || 'Faction'}. Please open the chat first.`);
            return;
        }

        const input = targetBox.querySelector('textarea, [contenteditable="true"]');
        if (!input) {
            console.warn('🎯 Chat input field not found inside the chat box!');
            return;
        }

        // Focus and type
        input.focus();
        
        if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeInputValueSetter.call(input, message);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // ContentEditable
            input.textContent = message;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Simulate Enter key to send
        const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: 'Enter',
            code: 'Enter',
            keyCode: 13
        });
        input.dispatchEvent(enterEvent);
        
        console.log(`🎯 Sent claim message: ${message}`);
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.WarTargetCaller = WarTargetCallerModule;
console.log('🎯 War Target Caller module registered');
