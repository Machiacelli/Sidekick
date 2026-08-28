/**
 * Sidekick Hustling Advisor
 * Reads the visible Hustling state and recommends, but never performs, the next action.
 */
const HustlingHelperModule = (() => {
    const STORAGE_KEY = 'crime-hustling';
    const ADVISOR_ID = 'sidekick-hustling-advisor';
    const BADGE_ID = 'sidekick-hustling-badge';
    const STYLE_ID = 'sidekick-hustling-styles';
    const RECOMMENDED_CLASS = 'sidekick-hustling-recommended';

    const MODES = [
        { value: 'efficient', label: 'Efficient' },
        { value: 'technique', label: 'Technique' },
        { value: 'money', label: 'Money' },
        { value: 'spam', label: 'Spam CS' },
        { value: 'snake', label: 'Snake Oil' },
    ];
    const GAME_DEFS = [
        { name: 'Cornhole', max: 7 },
        { name: 'Snail Racing', max: 9 },
        { name: 'Find the Lady', max: 11 },
        { name: 'Shell Game', max: 12 },
    ];
    const DEMO_ORDER = ['Shell Game', 'Find the Lady', 'Snail Racing', 'Cornhole'];

    let enabled = false;
    let mode = 'efficient';
    let collapsed = false;
    let advisor = null;
    let observer = null;
    let interval = null;
    let navigationWatcher = null;
    let scheduledUpdate = null;
    let storageListenerInstalled = false;
    let clickListenerInstalled = false;
    let lastUrl = '';
    let lastStateKey = '';
    let lastAudienceCount = 0;

    const tracker = {
        lastAction: '',
        lastGame: '',
        lastInteractionAt: 0,
        consecutiveLosses: 0,
        consecutiveWins: 0,
        demoedGames: new Set(),
        shillSeenAt: 0,
    };

    const normalise = value => String(value || '').replace(/\s+/g, ' ').trim();
    const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

    function searchText(element) {
        if (!element) return '';
        const parts = [
            element.textContent,
            element.getAttribute?.('aria-label'),
            element.getAttribute?.('title'),
            element.getAttribute?.('class'),
            element.getAttribute?.('data-testid'),
        ];
        element.querySelectorAll?.('[aria-label], [title], [class], [data-testid]').forEach(child => {
            parts.push(child.getAttribute('aria-label'), child.getAttribute('title'),
                child.getAttribute('class'), child.getAttribute('data-testid'));
        });
        return normalise(parts.filter(Boolean).join(' '));
    }

    function parseAction(value) {
        const text = normalise(value).toLowerCase();
        if (/\bcollect(?=\b|\d)/.test(text)) return 'collect';
        if (/\brecruit(?=\b|\d)/.test(text)) return 'recruit';
        if (/\b(?:demonstrate|demo)(?=\b|\d)/.test(text)) return 'demo';
        if (/\bhype(?=\b|\d)/.test(text)) return 'hype';
        if (/\blose(?=\b|\d)/.test(text)) return 'lose';
        if (/\bwin(?=\b|\d)/.test(text)) return 'win';
        if (/\bgather(?=\b|\d)/.test(text)) return 'gather';
        return '';
    }

    function parseMoney(value) {
        const match = normalise(value).replace(/,/g, '').match(/\$\s*([\d.]+)\s*([kmb])?/i);
        if (!match) return 0;
        const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] || '').toLowerCase()] || 1;
        return Number(match[1]) * multiplier;
    }

    function percentFromText(value, keyword = '') {
        const text = normalise(value);
        const match = keyword
            ? text.match(new RegExp(`${keyword}[^\\d]{0,24}(\\d+(?:\\.\\d+)?)\\s*%`, 'i'))
            : text.match(/(\d+(?:\.\d+)?)\s*%/);
        return match ? clamp(Number(match[1])) : null;
    }

    function percentFromStyles(element) {
        if (!element) return null;
        for (const candidate of [element, ...element.querySelectorAll('[style]')]) {
            const style = candidate.getAttribute?.('style') || '';
            const variable = style.match(/--(?:progress|value|percent|percentage):\s*(\d+(?:\.\d+)?)%/i);
            if (variable) return clamp(Number(variable[1]));
            const width = style.match(/(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)%/i);
            if (width) return clamp(Number(width[1]));
        }
        return null;
    }

    function readGauge(member, keyword) {
        const candidates = [member, ...member.querySelectorAll('*')].filter(element => {
            const value = normalise([
                element.getAttribute?.('aria-label'), element.getAttribute?.('title'),
                element.getAttribute?.('class'), element.getAttribute?.('data-testid'),
            ].filter(Boolean).join(' '));
            return value.toLowerCase().includes(keyword);
        });
        for (const candidate of candidates) {
            const label = normalise([
                candidate.getAttribute?.('aria-label'), candidate.getAttribute?.('title'), candidate.textContent,
            ].filter(Boolean).join(' '));
            const labelled = percentFromText(label, keyword) ?? percentFromText(label);
            if (labelled !== null) return labelled;
            const styled = percentFromStyles(candidate);
            if (styled !== null) return styled;
        }
        return null;
    }

    function getGameDefinition(value) {
        const text = normalise(value).toLowerCase();
        return GAME_DEFS.find(game => text.includes(game.name.toLowerCase())) || null;
    }

    function isHustlingPage() {
        const url = new URL(window.location.href);
        const crimesPage = (url.pathname.endsWith('/page.php') || url.pathname.endsWith('/loader.php'))
            && url.searchParams.get('sid') === 'crimes';
        return crimesPage && /(?:^|\/)hustling(?:$|[/?#])/i.test(url.hash.replace(/^#/, ''));
    }

    function getButtonActions(root = document) {
        return Array.from(root.querySelectorAll('button')).map(button => {
            const label = normalise([
                button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent,
            ].filter(Boolean).join(' '));
            const action = parseAction(label);
            if (!action) return null;
            const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true'
                || /disabled/i.test(button.className || '')
                || /(?:no|requires? an?) audience/i.test(label);
            return { action, label, button, enabled: !disabled };
        }).filter(Boolean);
    }

    function getTechnique(row, definition) {
        const bar = row.querySelector('[class*="techniqueBar"], [aria-label*="Technique" i]');
        const label = normalise([
            bar?.getAttribute('aria-label'), bar?.getAttribute('title'), bar?.textContent,
        ].filter(Boolean).join(' '));
        const match = label.match(/Technique\s*:?\s*(\d+)\s*(?:out of|\/|of)\s*(\d+)/i)
            || label.match(/(\d+)\s*\/\s*(\d+)/);
        let current = match ? Number(match[1]) : 0;
        const max = match ? Number(match[2]) : definition.max;
        const pct = percentFromStyles(bar) ?? (max > 0 ? clamp((current / max) * 100) : 0);
        if (!match && Number.isFinite(pct) && pct > 0) current = Math.round((pct / 100) * max);
        return { current, max, pct, label };
    }

    function findExactTextElement(name) {
        const root = document.querySelector('.crimes-app, [class*="crimesApp" i], [class*="crimeApp" i], main')
            || document.body;
        const matches = Array.from(root.querySelectorAll('span, div, p, h1, h2, h3, h4, h5, li'))
            .filter(element => !element.closest(`#${ADVISOR_ID}`)
                && normalise(element.textContent).toLowerCase() === name.toLowerCase());
        return matches.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
    }

    function findRowFromLabel(label, expectedName, isGame) {
        let candidate = label;
        for (let depth = 0; candidate && depth < 10; depth += 1, candidate = candidate.parentElement) {
            if (candidate.id === ADVISOR_ID || candidate === document.body) break;
            const text = normalise(candidate.textContent);
            const namedEntries = [...GAME_DEFS.map(game => game.name), 'Shill', 'Pickpocket']
                .filter(name => text.toLowerCase().includes(name.toLowerCase()));
            if (namedEntries.some(name => name !== expectedName)) break;

            const actions = getButtonActions(candidate);
            const hasExpectedAction = actions.some(action => isGame
                ? ['demo', 'hype', 'lose', 'win'].includes(action.action)
                : ['recruit', 'collect'].includes(action.action));
            if (hasExpectedAction) return candidate;
        }
        return null;
    }

    function discoverRowElements() {
        const discovered = Array.from(document.querySelectorAll('[class*="virtualItem"]'));
        [...GAME_DEFS.map(game => game.name), 'Shill', 'Pickpocket'].forEach(name => {
            const label = findExactTextElement(name);
            const row = label && findRowFromLabel(label, name, GAME_DEFS.some(game => game.name === name));
            if (row) discovered.push(row);
        });
        return [...new Set(discovered)];
    }

    function getRows() {
        return discoverRowElements().map(element => {
            if (!normalise(element.textContent) && element.innerHTML.length < 20) return null;
            const fullText = searchText(element);
            const matchedGames = GAME_DEFS.filter(game => fullText.toLowerCase().includes(game.name.toLowerCase()));
            const game = matchedGames.length === 1 ? matchedGames[0] : null;
            const isShill = /\bshill\b/i.test(fullText);
            const isPickpocket = /\bpickpocket\b/i.test(fullText);
            const matchedKinds = Number(Boolean(game)) + Number(isShill) + Number(isPickpocket);
            if (matchedKinds !== 1) return null;
            const betNode = element.querySelector('[class*="betAmount"], [class*="bet" i]');
            const betText = normalise(betNode?.textContent);
            const entry = {
                element,
                kind: game ? 'game' : 'crew',
                name: game?.name || (isShill ? 'Shill' : 'Pickpocket'),
                actions: getButtonActions(element),
                betText,
                betValue: parseMoney(betText),
            };
            if (game) entry.technique = getTechnique(element, game);
            return entry;
        }).filter(Boolean);
    }

    function isEmptyAudienceSlot(element, text) {
        if (/\b(?:empty|vacant|available)\s+(?:audience\s+)?slot\b/i.test(text)) return true;
        const className = normalise(element.getAttribute?.('class'));
        return /(?:^|\s)(?:empty|placeholder)(?:\s|$)/i.test(className)
            && !element.querySelector('img, [class*="person" i], [class*="member" i], [aria-label]');
    }

    function getAudienceInfo() {
        const section = document.querySelector('[class*="audienceSection"], [aria-label*="Audience" i]');
        const audience = section?.querySelector('[class*="audience"]') || section;
        const empty = {
            customers: [], crew: [], count: 0, totalCount: 0, heartsCount: 0, bettingCount: 0,
            averageAttention: null, heartAttention: null, maxSuspicion: null,
            hasShill: false, hasPickpocket: false,
        };
        if (!audience) return empty;

        const members = Array.from(audience.children).map(element => {
            const text = searchText(element);
            if (isEmptyAudienceSlot(element, text)) return null;
            const lower = text.toLowerCase();
            const hasHeart = /\b(?:heart|favorite|favourite)\b/.test(lower)
                || element.textContent?.includes('♥') || element.textContent?.includes('❤');
            const isBetting = /\b(?:betting|money|wager)\b/.test(lower) || element.textContent?.includes('$');
            const isShill = /\bshill\b/.test(lower);
            const isPickpocket = /\bpickpocket\b/.test(lower);
            const looksLikeMember = isShill || isPickpocket || hasHeart || isBetting
                || element.querySelector('img, svg, [class*="portrait" i], [class*="person" i], [class*="member" i]')
                || /\b(?:audience|spectator)\b/.test(lower);
            if (!looksLikeMember) return null;
            return {
                element, hasHeart, isBetting, isShill, isPickpocket,
                attention: readGauge(element, 'attention'), suspicion: readGauge(element, 'suspicion'),
            };
        }).filter(Boolean);
        const crew = members.filter(member => member.isShill || member.isPickpocket);
        const customers = members.filter(member => !member.isShill && !member.isPickpocket);
        const hearts = customers.filter(member => member.hasHeart);
        const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
        const attentionValues = customers.map(member => member.attention).filter(Number.isFinite);
        const heartAttentionValues = hearts.map(member => member.attention).filter(Number.isFinite);
        const suspicionValues = customers.map(member => member.suspicion).filter(Number.isFinite);
        return {
            customers, crew, count: customers.length, totalCount: members.length,
            heartsCount: hearts.length,
            bettingCount: customers.filter(member => member.isBetting).length,
            averageAttention: average(attentionValues),
            heartAttention: average(heartAttentionValues),
            maxSuspicion: suspicionValues.length ? Math.max(...suspicionValues) : null,
            hasShill: crew.some(member => member.isShill),
            hasPickpocket: crew.some(member => member.isPickpocket),
        };
    }

    function getSkillLevel() {
        const source = document.querySelector('button[aria-label*="Skill:" i], [aria-label*="Crime skill" i]');
        const text = normalise([source?.getAttribute('aria-label'), source?.textContent].filter(Boolean).join(' '));
        const match = text.match(/(?:crime\s+)?skill\s*:?\s*(\d+(?:\.\d+)?)/i);
        return match ? Number(match[1]) : 0;
    }

    function getTechniqueSummary(rows) {
        const games = rows.filter(row => row.kind === 'game');
        const current = games.reduce((sum, row) => sum + (row.technique?.current || 0), 0);
        const max = games.reduce((sum, row) => sum + (row.technique?.max || 0), 0);
        const completed = games.filter(row => row.technique?.max > 0
            && row.technique.current >= row.technique.max).length;
        return { current, max, completed, allMaxed: games.length === 4 && completed === 4 };
    }

    function findAction(rows, actionName, gameName = '') {
        for (const row of rows.filter(item => !gameName || item.name === gameName)) {
            const action = row.actions.find(item => item.action === actionName && item.enabled);
            if (action) return { ...action, row };
        }
        return null;
    }

    function getCurrentGame(rows) {
        const active = rows.find(row => row.kind === 'game'
            && row.actions.some(action => ['hype', 'lose', 'win'].includes(action.action) && action.enabled));
        return active?.name || tracker.lastGame || '';
    }

    function formatAction(action, gameName = '') {
        const labels = {
            gather: 'Gather an audience', demo: `Demo ${gameName}`, hype: `Hype ${gameName}`,
            lose: `Lose ${gameName}`, win: `Win ${gameName}`,
            recruit: `Recruit ${gameName}`, collect: `Collect from ${gameName}`,
        };
        return labels[action] || 'Review the current game';
    }

    function chooseDemo(rows, techniqueOnly = false) {
        const available = DEMO_ORDER.map(name => {
            const row = rows.find(item => item.kind === 'game' && item.name === name);
            if (!row || (techniqueOnly && row.technique?.current >= row.technique?.max)) return null;
            const action = findAction([row], 'demo', name);
            return action ? { row, action } : null;
        }).filter(Boolean);
        return available.find(candidate => !tracker.demoedGames.has(candidate.row.name)) || available[0] || null;
    }

    function fallbackCycleAction(hasHeart) {
        if (hasHeart) {
            if (tracker.consecutiveLosses >= 2) return 'win';
            if (tracker.consecutiveWins >= 1) return 'lose';
            return 'lose';
        }
        return tracker.lastAction === 'lose' ? 'win' : 'lose';
    }

    function crewAdvice(snapshot, now) {
        const shillRow = snapshot.rows.find(row => row.name === 'Shill');
        const pickpocketRow = snapshot.rows.find(row => row.name === 'Pickpocket');
        const shillCollect = shillRow ? findAction([shillRow], 'collect', 'Shill') : null;
        const pickpocketCollect = pickpocketRow ? findAction([pickpocketRow], 'collect', 'Pickpocket') : null;
        const shillRecruit = shillRow ? findAction([shillRow], 'recruit', 'Shill') : null;
        const pickpocketRecruit = pickpocketRow ? findAction([pickpocketRow], 'recruit', 'Pickpocket') : null;
        const shillAge = tracker.shillSeenAt ? now - tracker.shillSeenAt : 0;
        if (shillCollect && shillAge >= 8 * 60 * 1000) {
            return { text: 'Collect from the Shill soon — uncollected money is lost when they leave', urgentAction: shillCollect };
        }
        if (shillCollect && tracker.lastAction === 'lose') {
            return { text: 'Shill collection available after your loss', urgentAction: null };
        }
        if (pickpocketCollect) {
            return { text: 'Pickpocket collection available; collecting costs 2 nerve', urgentAction: null };
        }
        if (snapshot.mode === 'efficient') {
            if (snapshot.skill >= 60 && shillRecruit) return { text: 'Recruit a Shill to reduce intentional-loss costs', urgentAction: null };
            if (snapshot.skill >= 80 && pickpocketRecruit) return { text: 'Recruit a Pickpocket once the audience is active', urgentAction: null };
            if (snapshot.audience.hasShill && snapshot.audience.hasPickpocket) return { text: 'Shill and Pickpocket active', urgentAction: null };
            if (snapshot.audience.hasShill) return { text: 'Shill active', urgentAction: null };
            if (snapshot.audience.hasPickpocket) return { text: 'Pickpocket active', urgentAction: null };
        }
        return { text: '', urgentAction: null };
    }

    function makeDecision(snapshot, now = Date.now()) {
        const { rows, audience, skill } = snapshot;
        const gather = (snapshot.globalActions || []).find(action => action.action === 'gather' && action.enabled) || null;
        const technique = getTechniqueSummary(rows);
        const currentGame = getCurrentGame(rows);
        const crew = crewAdvice(snapshot, now);
        const result = {
            mode: snapshot.mode, technique, next: 'Waiting for the Hustling controls',
            why: 'The page is still loading', crew: crew.text, action: null, currentGame,
        };
        if (crew.urgentAction) {
            result.next = 'Collect from Shill';
            result.why = 'Shills leave after roughly ten minutes and take uncollected money';
            result.action = crew.urgentAction;
            return result;
        }
        const playableActionVisible = rows.some(row => row.kind === 'game'
            && row.actions.some(action => ['demo', 'hype', 'lose', 'win'].includes(action.action) && action.enabled));
        if (!playableActionVisible && gather) {
            result.next = 'Gather an audience';
            result.why = '';
            result.action = gather;
            return result;
        }
        if (audience.count === 0) {
            result.next = 'Gather an audience';
            result.why = '';
            result.action = gather;
            return result;
        }
        const inactivityMs = tracker.lastInteractionAt ? now - tracker.lastInteractionAt : 0;
        const idleWarning = inactivityMs >= 60 * 1000
            ? ' Audience members can leave after 1–3 minutes without interaction.' : '';

        if (snapshot.mode === 'snake') {
            const target = skill >= 100 ? 10 : Math.min(10, 4 + Math.floor(skill / 20));
            if (audience.count < target && gather) {
                result.next = 'Gather more audience';
                result.why = `Snake Oil benefits from a full crowd; guide target is about ${target} at this skill`;
                result.action = gather;
                return result;
            }
        }
        if (snapshot.mode === 'money' && audience.count < 5 && audience.heartsCount === 0 && gather) {
            result.next = 'Gather more audience';
            result.why = 'Money mode aims for several bettors unless a favorite game is already found';
            result.action = gather;
            return result;
        }

        const hype = findAction(rows, 'hype', currentGame) || findAction(rows, 'hype');
        const bettingRow = rows.find(row => row.kind === 'game'
            && row.actions.some(action => ['lose', 'win'].includes(action.action) && action.enabled));

        if (snapshot.mode === 'spam') {
            const lose = bettingRow && findAction([bettingRow], 'lose', bettingRow.name);
            if (lose) {
                result.next = formatAction('lose', bettingRow.name);
                result.why = 'Spam CS mode intentionally trades money for simple, repeatable skill gains';
                result.action = lose;
                return result;
            }
            if (hype) {
                result.next = formatAction('hype', hype.row.name);
                result.why = 'Hype is required before betting becomes available';
                result.action = hype;
                return result;
            }
        }

        if (bettingRow) {
            const lose = findAction([bettingRow], 'lose', bettingRow.name);
            const win = findAction([bettingRow], 'win', bettingRow.name);
            const hasHeart = audience.heartsCount > 0;
            const attention = hasHeart ? audience.heartAttention : audience.averageAttention;
            const suspicion = audience.maxSuspicion;
            let wanted = '';
            let reason = '';
            if (snapshot.mode === 'snake' && bettingRow.betValue >= 100000 && win) {
                wanted = 'win';
                reason = 'The current bet meets the $100,000 Snake Oil requirement';
            } else if (hasHeart) {
                if (Number.isFinite(suspicion) && suspicion >= 85) {
                    wanted = 'win'; reason = 'The favorite-game audience is near maximum suspicion; finish with wins';
                } else if (Number.isFinite(attention) && attention >= 85) {
                    wanted = 'win'; reason = 'Favorite-game attention is high enough to cash in';
                } else if (Number.isFinite(attention) && attention <= 45) {
                    wanted = 'lose'; reason = 'Favorite-game attention needs rebuilding';
                }
            } else {
                if (Number.isFinite(suspicion) && suspicion >= 60) {
                    wanted = 'win'; reason = 'Without a favorite game, high suspicion means it is time to finish with wins';
                } else if (Number.isFinite(attention) && attention >= 60) {
                    wanted = 'win'; reason = 'Overall attention is above the guide’s cash-in threshold';
                } else if (Number.isFinite(attention) && attention <= 40) {
                    wanted = 'lose'; reason = 'Overall attention is low and should be rebuilt';
                }
            }
            if (!wanted) {
                wanted = fallbackCycleAction(hasHeart);
                reason = hasHeart
                    ? 'Gauge values are unavailable; using the guide’s short lose/win fallback cycle'
                    : 'No favorite game is visible; using a conservative alternating fallback';
            }
            if (snapshot.mode === 'technique' && wanted === 'lose' && win
                && Number.isFinite(attention) && attention > 45) {
                wanted = 'win'; reason = 'Technique mode favors wins while attention remains safe';
            }
            const selected = wanted === 'win' ? win : lose;
            const fallback = selected || win || lose;
            if (fallback) {
                result.next = formatAction(fallback.action, bettingRow.name);
                result.why = `${reason}.${idleWarning}`.trim();
                result.action = fallback;
                return result;
            }
        }

        if (hype) {
            result.next = formatAction('hype', hype.row.name);
            result.why = `Hype raises attention and can start betting.${idleWarning}`.trim();
            result.action = hype;
            return result;
        }
        const demo = chooseDemo(rows, snapshot.mode === 'technique');
        if (demo) {
            result.next = formatAction('demo', demo.row.name);
            result.why = snapshot.mode === 'technique'
                ? 'Searching bottom-up for a favorite game while skipping maxed techniques'
                : `Searching bottom-up for a favorite game.${idleWarning}`.trim();
            result.action = demo.action;
            return result;
        }
        if (snapshot.mode === 'technique' && technique.allMaxed) {
            result.next = 'All techniques are maxed';
            result.why = 'Switch to Efficient or Money mode for continuing Hustling guidance';
            return result;
        }
        result.next = 'Interact with the current game';
        result.why = `No supported action button is currently available.${idleWarning}`.trim();
        return result;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ADVISOR_ID}{box-sizing:border-box;width:100%;margin:0 0 10px;overflow:hidden;border:1px solid rgba(0,0,0,.78);border-radius:5px;background:#292929;color:#ddd;font-family:inherit;box-shadow:inset 0 1px rgba(255,255,255,.035),0 1px 2px rgba(0,0,0,.5)}
            #${ADVISOR_ID} *{box-sizing:border-box}
            #${ADVISOR_ID} .sk-hh-header{min-height:34px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#404040;border-bottom:1px solid #181818;color:#eee;font-size:12px;font-weight:700;text-transform:uppercase;text-shadow:0 -1px #111}
            #${ADVISOR_ID} .sk-hh-collapse{display:inline-flex;align-items:center;gap:7px;min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-transform:inherit;cursor:pointer}
            #${ADVISOR_ID} .sk-hh-caret{width:10px;color:#c5c5c5;font-size:9px;line-height:1}
            #${ADVISOR_ID}.sk-hh-collapsed .sk-hh-caret{transform:rotate(-90deg)}
            #${ADVISOR_ID} .sk-hh-spacer{flex:1}
            #${ADVISOR_ID} .sk-hh-technique{color:#bbb;font-size:11px;white-space:nowrap}
            #${ADVISOR_ID} .sk-hh-mode{height:24px;max-width:110px;padding:0 22px 0 7px;border:1px solid #202020;border-radius:3px;background:#2b2b2b;color:#8bc832;font:inherit;font-size:10px;text-transform:uppercase;cursor:pointer}
            #${ADVISOR_ID} .sk-hh-body{display:block}
            #${ADVISOR_ID}.sk-hh-collapsed .sk-hh-body{display:none}
            #${ADVISOR_ID} .sk-hh-row{min-height:31px;display:grid;grid-template-columns:minmax(108px,17%) 1fr;align-items:center;border-top:1px solid #393939;background:#2c2c2c}
            #${ADVISOR_ID} .sk-hh-row[hidden]{display:none!important}
            #${ADVISOR_ID} .sk-hh-row:first-child{border-top:0}
            #${ADVISOR_ID} .sk-hh-label{align-self:stretch;display:flex;align-items:center;padding:6px 10px;border-right:1px solid #1e1e1e;color:#8bc832;font-size:11px;font-weight:700;text-transform:uppercase}
            #${ADVISOR_ID} .sk-hh-value{min-width:0;padding:6px 10px;color:#e2e2e2;font-size:12px;line-height:1.35}
            #${ADVISOR_ID} .sk-hh-row[data-kind="crew"] .sk-hh-label{color:#aaa}
            .${RECOMMENDED_CLASS}{outline:2px solid #82bd29!important;outline-offset:-2px!important;box-shadow:0 0 7px rgba(130,189,41,.5)!important}
            @media(max-width:784px){#${ADVISOR_ID}{margin-bottom:7px}#${ADVISOR_ID} .sk-hh-header{flex-wrap:wrap;padding:5px 8px}#${ADVISOR_ID} .sk-hh-spacer{display:none}#${ADVISOR_ID} .sk-hh-technique{margin-left:auto}#${ADVISOR_ID} .sk-hh-row{grid-template-columns:92px 1fr}#${ADVISOR_ID} .sk-hh-label,#${ADVISOR_ID} .sk-hh-value{padding:6px 8px;font-size:10px}}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function findCommonAncestor(elements) {
        if (!elements.length) return null;
        let candidate = elements[0].parentElement;
        while (candidate && !elements.every(element => candidate.contains(element))) candidate = candidate.parentElement;
        return candidate;
    }

    function getAdvisorAnchor(rows) {
        const games = rows.filter(row => row.kind === 'game').map(row => row.element);
        if (!games.length) return null;
        const common = findCommonAncestor(games);
        if (common && common.parentElement && common !== document.body && common !== document.documentElement
            && !common.matches('main')) {
            return { parent: common.parentElement, before: common };
        }
        return { parent: games[0].parentElement, before: games[0] };
    }

    function createAdvisor(rows) {
        if (advisor?.isConnected) return advisor;
        const anchor = getAdvisorAnchor(rows);
        if (!anchor?.parent || !anchor.before) return null;
        advisor = document.createElement('section');
        advisor.id = ADVISOR_ID;
        advisor.setAttribute('aria-label', 'Hustling Advisor');
        advisor.innerHTML = `
            <div class="sk-hh-header">
                <button type="button" class="sk-hh-collapse" aria-expanded="true"><span class="sk-hh-caret" aria-hidden="true">▼</span><span>Hustling Advisor</span></button>
                <span class="sk-hh-spacer"></span><span class="sk-hh-technique">Technique —</span>
                <select class="sk-hh-mode" aria-label="Hustling strategy"></select>
            </div>
            <div class="sk-hh-body">
                <div class="sk-hh-row" data-kind="next"><span class="sk-hh-label">Next move</span><span class="sk-hh-value">Waiting for the Hustling controls</span></div>
                <div class="sk-hh-row" data-kind="crew" hidden><span class="sk-hh-label">Crew</span><span class="sk-hh-value"></span></div>
            </div>`;
        const select = advisor.querySelector('.sk-hh-mode');
        MODES.forEach(option => {
            const element = document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            select.appendChild(element);
        });
        select.value = mode;
        select.addEventListener('change', async event => {
            mode = MODES.some(option => option.value === event.target.value) ? event.target.value : 'efficient';
            lastStateKey = '';
            await savePreferences();
            scheduleUpdate(0);
        });
        advisor.querySelector('.sk-hh-collapse').addEventListener('click', async () => {
            collapsed = !collapsed;
            applyCollapsedState();
            await savePreferences();
        });
        applyCollapsedState();
        anchor.parent.insertBefore(advisor, anchor.before);
        return advisor;
    }

    function applyCollapsedState() {
        if (!advisor) return;
        advisor.classList.toggle('sk-hh-collapsed', collapsed);
        advisor.querySelector('.sk-hh-collapse')?.setAttribute('aria-expanded', String(!collapsed));
    }

    function clearRecommendation() {
        document.querySelectorAll(`.${RECOMMENDED_CLASS}`).forEach(element => {
            element.classList.remove(RECOMMENDED_CLASS);
            if (element.dataset.sidekickHustlingTitle !== undefined) {
                if (element.dataset.sidekickHustlingTitle) element.setAttribute('title', element.dataset.sidekickHustlingTitle);
                else element.removeAttribute('title');
                delete element.dataset.sidekickHustlingTitle;
            }
        });
    }

    function applyRecommendation(decision) {
        clearRecommendation();
        const button = decision.action?.button;
        if (!button?.isConnected) return;
        button.classList.add(RECOMMENDED_CLASS);
        button.dataset.sidekickHustlingTitle = button.getAttribute('title') || '';
        button.setAttribute('title', `Sidekick recommends: ${decision.next}`);
    }

    function renderDecision(decision) {
        if (!advisor) return;
        const techniqueText = decision.technique.allMaxed ? 'Technique maxed'
            : decision.technique.max > 0 ? `Technique ${decision.technique.current}/${decision.technique.max}` : 'Technique —';
        advisor.querySelector('.sk-hh-technique').textContent = techniqueText;
        advisor.querySelector('.sk-hh-mode').value = mode;
        advisor.querySelector('[data-kind="next"] .sk-hh-value').textContent = decision.next;
        const crewRow = advisor.querySelector('[data-kind="crew"]');
        const showCrew = mode === 'efficient' && Boolean(decision.crew);
        crewRow.hidden = !showCrew;
        crewRow.querySelector('.sk-hh-value').textContent = showCrew ? decision.crew : '';
        applyRecommendation(decision);
    }

    function findHustlingHeading() {
        return Array.from(document.querySelectorAll('h1, h2, h3, h4'))
            .filter(element => normalise(element.textContent).toLowerCase() === 'hustling')
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || null;
    }

    function injectHeaderBadge() {
        if (document.getElementById(BADGE_ID)) return;
        const heading = findHustlingHeading();
        if (!heading) return;
        const badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.title = 'Sidekick Hustling active';
        badge.textContent = '\u2713';
        badge.style.cssText = ['display:inline-flex','align-items:center','justify-content:center','width:16px','height:16px',
            'border-radius:50%','background:#57a64a','color:#fff','font-size:10px','font-weight:bold','margin-left:6px',
            'vertical-align:middle','flex-shrink:0','box-shadow:0 0 4px rgba(87,166,74,.6)'].join(';');
        heading.appendChild(badge);
    }

    function makeSnapshot() {
        const rows = getRows();
        const audience = getAudienceInfo();
        const skill = getSkillLevel();
        const globalActions = getButtonActions(document).filter(action => action.action === 'gather');
        if (audience.count > lastAudienceCount) {
            tracker.demoedGames.clear();
            tracker.consecutiveLosses = 0;
            tracker.consecutiveWins = 0;
            tracker.lastInteractionAt = Date.now();
        } else if (audience.count === 0 && lastAudienceCount > 0) {
            tracker.demoedGames.clear();
            tracker.lastAction = '';
            tracker.lastGame = '';
            tracker.consecutiveLosses = 0;
            tracker.consecutiveWins = 0;
            tracker.shillSeenAt = 0;
        }
        lastAudienceCount = audience.count;
        if (audience.hasShill && !tracker.shillSeenAt) tracker.shillSeenAt = Date.now();
        if (!audience.hasShill) tracker.shillSeenAt = 0;
        return { mode, rows, audience, skill, globalActions };
    }

    function snapshotKey(snapshot, decision) {
        const idleBucket = tracker.lastInteractionAt ? Math.floor((Date.now() - tracker.lastInteractionAt) / 30000) : 0;
        return JSON.stringify({
            mode: snapshot.mode, collapsed, skill: snapshot.skill,
            audience: {
                count: snapshot.audience.count, total: snapshot.audience.totalCount,
                hearts: snapshot.audience.heartsCount, betting: snapshot.audience.bettingCount,
                attention: snapshot.audience.averageAttention, heartAttention: snapshot.audience.heartAttention,
                suspicion: snapshot.audience.maxSuspicion, shill: snapshot.audience.hasShill,
                pickpocket: snapshot.audience.hasPickpocket,
            },
            rows: snapshot.rows.map(row => ({
                name: row.name, actions: row.actions.map(action => `${action.action}:${action.enabled}`),
                technique: row.technique && [row.technique.current, row.technique.max, row.technique.pct], bet: row.betValue,
            })),
            tracked: {
                lastAction: tracker.lastAction, lastGame: tracker.lastGame,
                losses: tracker.consecutiveLosses, wins: tracker.consecutiveWins,
                demos: [...tracker.demoedGames], idleBucket,
            },
            decision: [decision.next, decision.why, decision.crew],
        });
    }

    function update() {
        scheduledUpdate = null;
        if (!enabled || !isHustlingPage()) {
            removeUi();
            return;
        }
        injectStyles();
        injectHeaderBadge();
        const snapshot = makeSnapshot();
        if (!snapshot.rows.length || !createAdvisor(snapshot.rows)) return;
        const decision = makeDecision(snapshot);
        const key = snapshotKey(snapshot, decision);
        if (key === lastStateKey) return;
        lastStateKey = key;
        renderDecision(decision);
    }

    function scheduleUpdate(delay = 120) {
        clearTimeout(scheduledUpdate);
        scheduledUpdate = setTimeout(update, delay);
    }

    function recordInteraction(button) {
        const label = normalise([button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
            .filter(Boolean).join(' '));
        const action = parseAction(label);
        if (!action) return;
        const row = button.closest('[class*="virtualItem"]');
        const rowText = searchText(row);
        const game = getGameDefinition(rowText)?.name
            || (/\bshill\b/i.test(rowText) ? 'Shill' : /\bpickpocket\b/i.test(rowText) ? 'Pickpocket' : '');
        tracker.lastAction = action;
        tracker.lastInteractionAt = Date.now();
        if (game && GAME_DEFS.some(definition => definition.name === game)) tracker.lastGame = game;
        if (action === 'demo' && game) tracker.demoedGames.add(game);
        if (action === 'lose') {
            tracker.consecutiveLosses += 1;
            tracker.consecutiveWins = 0;
        } else if (action === 'win') {
            tracker.consecutiveWins += 1;
            tracker.consecutiveLosses = 0;
        } else if (['gather', 'demo', 'hype'].includes(action)) {
            tracker.consecutiveLosses = 0;
            tracker.consecutiveWins = 0;
        }
        if (action === 'recruit' && game === 'Shill') tracker.shillSeenAt = Date.now();
        lastStateKey = '';
        scheduleUpdate(80);
    }

    async function savePreferences() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            settings[STORAGE_KEY] = { ...(settings[STORAGE_KEY] || {}), isEnabled: enabled, mode, collapsed };
            await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', settings);
        } catch (error) {
            console.warn('[HustlingAdvisor] Could not save preferences:', error);
        }
    }

    async function loadSettings() {
        try {
            const settings = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
            const entry = settings[STORAGE_KEY] || {};
            const wasEnabled = enabled;
            enabled = entry.isEnabled === true;
            mode = MODES.some(option => option.value === entry.mode) ? entry.mode : 'efficient';
            collapsed = entry.collapsed === true;
            if (enabled && !wasEnabled) start();
            else if (!enabled && wasEnabled) stop();
            else if (enabled) {
                applyCollapsedState();
                lastStateKey = '';
                scheduleUpdate(0);
            }
        } catch (error) {
            console.warn('[HustlingAdvisor] Settings load failed:', error);
            enabled = false;
            stop();
        }
    }

    function installListeners() {
        if (!storageListenerInstalled) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.sidekick_settings) loadSettings();
            });
            storageListenerInstalled = true;
        }
        if (!clickListenerInstalled) {
            document.addEventListener('click', event => {
                const button = event.target.closest?.('button');
                if (button && enabled && isHustlingPage()) recordInteraction(button);
            }, true);
            clickListenerInstalled = true;
        }
    }

    function startObserver() {
        observer?.disconnect();
        const root = document.querySelector('.crimes-app, [class*="crimesApp" i], [class*="crimeApp" i], main') || document.body;
        observer = new MutationObserver(() => scheduleUpdate(120));
        observer.observe(root, { childList: true, subtree: true, attributes: true,
            attributeFilter: ['aria-label', 'style', 'class'] });
    }

    function start() {
        installListeners();
        injectStyles();
        startObserver();
        clearInterval(interval);
        interval = setInterval(() => { if (!document.hidden) scheduleUpdate(0); }, 1000);
        clearInterval(navigationWatcher);
        lastUrl = window.location.href;
        navigationWatcher = setInterval(() => {
            if (window.location.href === lastUrl) return;
            lastUrl = window.location.href;
            lastStateKey = '';
            if (isHustlingPage()) {
                startObserver();
                scheduleUpdate(250);
            } else removeUi();
        }, 300);
        scheduleUpdate(0);
    }

    function removeUi() {
        clearRecommendation();
        document.getElementById(BADGE_ID)?.remove();
        document.getElementById(ADVISOR_ID)?.remove();
        advisor = null;
        lastStateKey = '';
    }

    function stop() {
        clearTimeout(scheduledUpdate);
        clearInterval(interval);
        clearInterval(navigationWatcher);
        observer?.disconnect();
        scheduledUpdate = null;
        interval = null;
        navigationWatcher = null;
        observer = null;
        removeUi();
    }

    return {
        async init() {
            installListeners();
            await loadSettings();
            console.log(`[HustlingAdvisor] Initialized — ${enabled ? 'enabled' : 'disabled'}`);
        },
        start, stop, update,
        __test: {
            parseAction, parseMoney, getTechniqueSummary, makeDecision,
            resetTracker() {
                tracker.lastAction = '';
                tracker.lastGame = '';
                tracker.lastInteractionAt = 0;
                tracker.consecutiveLosses = 0;
                tracker.consecutiveWins = 0;
                tracker.demoedGames.clear();
                tracker.shillSeenAt = 0;
            },
            tracker,
        },
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.HustlingHelper = HustlingHelperModule;
console.log('[HustlingAdvisor] Registered');
