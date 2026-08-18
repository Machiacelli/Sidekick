// Hustling Helper Module
// Provides a visual helper for the Hustling crime

const HustlingHelperModule = {
    isEnabled: false,
    panelEl: null,
    lastState: '',

    async init() {
        console.log('🎪 Hustling Helper initializing...');
        await this.loadSettings();

        // React to settings changes
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.sidekick_settings) {
                this.loadSettings();
            }
        });

        // Setup DOM observers and hash listeners if enabled
        if (this.isEnabled) {
            this.start();
        }
    },

    async loadSettings() {
        const result = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
        const val = result['crime-hustling'];
        const wasEnabled = this.isEnabled;
        this.isEnabled = val && typeof val.isEnabled === 'boolean' ? val.isEnabled : false;

        if (this.isEnabled && !wasEnabled) {
            this.start();
        } else if (!this.isEnabled && wasEnabled) {
            this.stop();
        }
    },

    isHustlingPage() {
        return window.location.hash.includes('/hustling');
    },

    isMobile() {
        return window.innerWidth <= 768 ||
            navigator.userAgent.includes('TornPDA') ||
            document.querySelector('.pda-wrap') !== null;
    },

    getGameRows() {
        const items = document.querySelectorAll('[class*="virtualItem___"]');
        const rows = [];
        items.forEach(item => {
            if (item.innerHTML.length < 20) return; // skip empty virtual items
            const btn = item.querySelector('button[class*="commitButton___"]');
            const ariaLabel = btn?.getAttribute('aria-label') || '';
            const titleEl = item.querySelector('[class*="crimeOptionSection___"][class*="flexGrow___"]');
            const title = titleEl?.textContent?.trim() || '';
            const techBar = item.querySelector('[class*="techniqueBar___"]');
            const techLabel = techBar?.getAttribute('aria-label') || '';
            const betEl = item.querySelector('[class*="betAmount___"]');
            const bet = betEl?.textContent?.trim() || '';
            const btnText = btn?.textContent?.trim() || '';
 
            rows.push({ el: item, title, ariaLabel, techLabel, bet, btnText, btn });
        });
        return rows;
    },

    getAudienceInfo() {
        const section = document.querySelector('[class*="audienceSection___"]');
        if (!section) return { count: 0, members: [] };
 
        const audience = section.querySelector('[class*="audience___"]');
        if (!audience) return { count: 0, members: [] };
 
        const members = audience.children;
        const memberData = [];
        for (const member of members) {
            const cls = member.getAttribute('class') || '';
            const ariaLabel = member.getAttribute('aria-label') || member.textContent?.trim() || '';
 
            const hasHeart = member.querySelector('[class*="heart"], [class*="favorite"]') !== null
                || cls.includes('heart') || cls.includes('favorite');
 
            const isBetting = member.querySelector('[class*="money"], [class*="betting"]') !== null
                || cls.includes('money') || cls.includes('betting');
 
            const isShill = cls.includes('shill') || ariaLabel.toLowerCase().includes('shill');
            const isPickpocket = cls.includes('pickpocket') || ariaLabel.toLowerCase().includes('pickpocket');
 
            memberData.push({ el: member, hasHeart, isBetting, isShill, isPickpocket, ariaLabel });
        }
 
        return { count: memberData.length, members: memberData };
    },

    getTechniqueProgress() {
        const bars = document.querySelectorAll('[class*="techniqueBar___"]');
        const progress = [];
        bars.forEach(bar => {
            const label = bar.getAttribute('aria-label') || '';
            const match = label.match(/Technique:\s*(\d+)\s*out of\s*(\d+)/i);
            const style = bar.getAttribute('style') || '';
            const progressMatch = style.match(/--progress:\s*([\d.]+)%/);
            const pct = progressMatch ? parseFloat(progressMatch[1]) : 0;
 
            progress.push({
                label,
                current: match ? parseInt(match[1]) : 0,
                max: match ? parseInt(match[2]) : 0,
                pct
            });
        });
        return progress;
    },

    getSkillLevel() {
        const btn = document.querySelector('button[aria-label*="Skill:"]');
        if (!btn) return 0;
        const match = btn.getAttribute('aria-label').match(/Skill:\s*([\d.]+)/);
        return match ? parseFloat(match[1]) : 0;
    },

    generateAdvice(rows, audience, technique, skillLevel) {
        const advice = [];
        const hasAudience = audience.count > 0;
        const heartsPresent = audience.members.some(m => m.hasHeart);
 
        if (!hasAudience) {
            advice.push({ icon: '👥', text: 'Gather an audience first (4 nerve)', priority: 'action' });
            advice.push({ icon: '💡', text: 'Aim for 4+ audience members before starting games', priority: 'tip' });
        } else if (audience.count < 3) {
            advice.push({ icon: '👥', text: `Only ${audience.count} audience — consider gathering more (4 nerve)`, priority: 'suggestion' });
        }
 
        if (hasAudience) {
            const demoAvailable = rows.some(r => r.btnText.includes('Demo') && !r.ariaLabel.includes('no audience'));
            const loseAvailable = rows.some(r => r.btnText.includes('Lose'));
            const winAvailable = rows.some(r => r.btnText.includes('Win'));
            const hypeAvailable = rows.some(r => r.btnText.includes('Hype'));
 
            if (loseAvailable && winAvailable) {
                if (heartsPresent) {
                    advice.push({ icon: '❤️', text: 'Heart game active! Follow this cycle:', priority: 'important' });
                }
                advice.push({ icon: '✕', text: 'Lose (✕) 2-3 times to build attention', priority: 'action' });
                advice.push({ icon: '✓', text: 'Then Win (✓) 1-2 times to cash in', priority: 'action' });
                advice.push({ icon: '🔄', text: 'Repeat: ✕✕✕ ✓✓ ✕✕ ✓✓ ... until they leave', priority: 'action' });
                advice.push({ icon: '⚠️', text: 'DON\'T win too many times in a row — they leave!', priority: 'important' });
            } else if (demoAvailable && !loseAvailable && !winAvailable) {
                if (heartsPresent) {
                    advice.push({ icon: '❤️', text: 'Heart detected! Demo/Hype that game', priority: 'important' });
                } else {
                    advice.push({ icon: '🎯', text: 'Demo each game to find hearts (❤️), start from bottom up', priority: 'action' });
                }
            } else if (hypeAvailable) {
                advice.push({ icon: '📢', text: 'Hype the game to get audience betting', priority: 'action' });
            }
 
            if (skillLevel >= 60 && !audience.members.some(m => m.isShill)) {
                advice.push({ icon: '🕵️', text: 'Recruit a Shill to recover losses (skill 60+)', priority: 'tip' });
            }
            if (skillLevel >= 80 && !audience.members.some(m => m.isPickpocket)) {
                advice.push({ icon: '🤏', text: 'Recruit a Pickpocket for passive income (skill 80+)', priority: 'tip' });
            }
        }
 
        const allMaxed = technique.every(t => t.current >= t.max && t.max > 0);
        if (!allMaxed && technique.length > 0) {
            const lowest = technique.reduce((min, t) => t.pct < min.pct ? t : min, technique[0]);
            if (lowest.pct < 100) {
                advice.push({ icon: '📈', text: `Technique tip: Winning gives 2x technique`, priority: 'tip' });
            }
        }
        return advice;
    },

    createPanel() {
        if (this.panelEl) return this.panelEl;
 
        this.panelEl = document.createElement('div');
        this.panelEl.id = 'hustling-helper-panel';
 
        const mobile = this.isMobile();
 
        this.panelEl.style.cssText = mobile ? `
            position: fixed; bottom: 50px; left: 5px; right: 5px; max-height: 90px;
            overflow-y: auto; background: rgba(15, 23, 42, 0.97); backdrop-filter: blur(10px);
            border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 8px;
            padding: 0; font-family: 'Segoe UI', sans-serif; font-size: 10px;
            color: #e2e8f0; z-index: 99999; box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.5);
        ` : `
            position: fixed; top: 10px; right: 10px; width: 280px; max-height: 400px;
            overflow-y: auto; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);
            border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 12px;
            padding: 0; font-family: 'Segoe UI', sans-serif; font-size: 12px;
            color: #e2e8f0; z-index: 99999; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            transition: all 0.3s ease;
        `;
        document.body.appendChild(this.panelEl);
        return this.panelEl;
    },

    renderPanel(audience, technique, advice, skillLevel) {
        const panel = this.createPanel();
        const mobile = this.isMobile();
 
        const techHTML = technique.map((t, i) => {
            const games = ['Cornhole', 'Snail Racing', 'Find the Lady', 'Shell Game'];
            const name = games[i] || `Game ${i + 1}`;
            const pct = t.pct || 0;
            const color = pct >= 100 ? '#10b981' : pct > 50 ? '#f59e0b' : '#6366f1';
            return `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="width:85px;font-size:10px;color:#94a3b8;">${name}</span>
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.3s;"></div>
                    </div>
                    <span style="font-size:9px;color:${color};min-width:28px;text-align:right;">${t.current}/${t.max}</span>
                </div>
            `;
        }).join('');
 
        const adviceHTML = advice.slice(0, mobile ? 2 : advice.length).map(a => {
            const bgMap = { action: 'rgba(99,102,241,0.15)', important: 'rgba(239,68,68,0.15)', suggestion: 'rgba(245,158,11,0.1)', tip: 'rgba(255,255,255,0.05)' };
            const borderMap = { action: 'rgba(99,102,241,0.4)', important: 'rgba(239,68,68,0.4)', suggestion: 'rgba(245,158,11,0.3)', tip: 'rgba(255,255,255,0.1)' };
            return `
                <div style="background:${bgMap[a.priority]};border:1px solid ${borderMap[a.priority]};border-radius:6px;padding:${mobile ? '4px 6px' : '6px 8px'};margin-bottom:4px;">
                    <span>${a.icon}</span> <span style="font-size:${mobile ? '10px' : '11px'};">${a.text}</span>
                </div>
            `;
        }).join('');
 
        const audienceText = audience.count > 0 ? `${audience.count} member${audience.count > 1 ? 's' : ''}` : 'None';
        const heartsCount = audience.members.filter(m => m.hasHeart).length;
        const bettingCount = audience.members.filter(m => m.isBetting).length;
 
        if (mobile) {
            panel.innerHTML = `
                <div style="padding:6px 10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <span style="font-weight:700;font-size:10px;">🎪 Hustling · Skill ${skillLevel} · 👥 ${audienceText} ${heartsCount > 0 ? `❤️×${heartsCount}` : ''}</span>
                    </div>
                    ${adviceHTML}
                </div>
            `;
        } else {
            panel.innerHTML = `
                <div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:16px;">🎪</span>
                        <span style="font-weight:700;font-size:13px;">Hustling Helper</span>
                    </div>
                    <span style="font-size:10px;color:#6366f1;">Skill ${skillLevel}</span>
                </div>
                <div style="padding:10px 12px;">
                    <div style="margin-bottom:10px;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                            <span style="font-size:11px;">👥</span>
                            <span style="font-weight:600;font-size:11px;">Audience: ${audienceText}</span>
                            ${heartsCount > 0 ? `<span style="color:#ef4444;">❤️×${heartsCount}</span>` : ''}
                            ${bettingCount > 0 ? `<span style="color:#10b981;">💰×${bettingCount}</span>` : ''}
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <div style="font-weight:600;font-size:11px;margin-bottom:6px;">📊 Technique</div>
                        ${techHTML}
                    </div>
                    <div>
                        <div style="font-weight:600;font-size:11px;margin-bottom:6px;">💡 Next Steps</div>
                        ${adviceHTML || '<div style="color:#64748b;font-size:11px;">Waiting for game state...</div>'}
                    </div>
                </div>
            `;
        }
    },

    update() {
        if (!this.isEnabled || !this.isHustlingPage()) {
            if (this.panelEl) { this.panelEl.style.display = 'none'; }
            return;
        }
        if (this.panelEl) { this.panelEl.style.display = ''; }
 
        const rows = this.getGameRows();
        const audience = this.getAudienceInfo();
        const technique = this.getTechniqueProgress();
        const skillLevel = this.getSkillLevel();
 
        const stateKey = JSON.stringify({ ac: audience.count, tech: technique.map(t => t.pct), skill: skillLevel, rows: rows.map(r => r.ariaLabel) });
        if (stateKey === this.lastState) return;
        this.lastState = stateKey;
 
        const advice = this.generateAdvice(rows, audience, technique, skillLevel);
        this.renderPanel(audience, technique, advice, skillLevel);
    },

    start() {
        if (this._interval) return;
        
        this.createPanel();
        this.update();
        
        this._interval = setInterval(() => this.update(), 1500);

        this._observer = new MutationObserver(() => {
            setTimeout(() => this.update(), 200);
        });
        
        const tryObserve = () => {
            const crimeApp = document.querySelector('.crimes-app');
            if (crimeApp) {
                this._observer.observe(crimeApp, { childList: true, subtree: true });
            } else {
                setTimeout(tryObserve, 1000);
            }
        };
        tryObserve();

        this._hashListener = () => {
            if (this.isHustlingPage()) {
                setTimeout(() => this.update(), 500);
            } else if (this.panelEl) {
                this.panelEl.style.display = 'none';
            }
        };
        window.addEventListener('hashchange', this._hashListener);
    },

    stop() {
        if (this._interval) clearInterval(this._interval);
        if (this._observer) this._observer.disconnect();
        if (this._hashListener) window.removeEventListener('hashchange', this._hashListener);
        if (this.panelEl) this.panelEl.style.display = 'none';
        this._interval = null;
        this._observer = null;
        this._hashListener = null;
    }
};

if (typeof window.SidekickModules === 'undefined') {
    window.SidekickModules = {};
}
window.SidekickModules.HustlingHelper = HustlingHelperModule;

console.log('🎪 Hustling Helper module registered');
