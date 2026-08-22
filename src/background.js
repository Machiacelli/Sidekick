/**
 * Sidekick Chrome Extension - Background Service Worker
 * Handles extension lifecycle and background tasks
 * Version: 1.0.0
 */

// Remove the retired secondary-key setting from existing installations.
chrome.storage.local.remove('sidekick_secondary_api_key');

// API Cache Manager - Prevents rate limiting by caching responses and deduplicating requests
const apiCache = {
    cache: new Map(),
    pendingRequests: new Map(),

    // Cache TTL (Time To Live) in milliseconds for different data types
    TTL: {
        personalstats: 30000,   // 30 seconds - changes frequently with actions
        cooldowns: 15000,       // 15 seconds - time-sensitive
        bars: 30000,            // 30 seconds - changes with actions
        logs: 60000,            // 60 seconds - historical data
        refills: 300000,        // 5 minutes - only changes once per day
        profile: 300000,        // 5 minutes - rarely changes
        items: 60000,           // 60 seconds - inventory changes
        money: 60000,           // 60 seconds - bank/wallet changes
        company: 300000         // 5 minutes - company data rarely changes
    },

    // Generate unique cache key from request parameters
    getCacheKey(apiKey, selections, endpoint) {
        // Sort selections for consistent cache keys
        const sortedSelections = Array.isArray(selections) ? selections.sort().join(',') : selections;
        return `${apiKey}:${endpoint}:${sortedSelections}`;
    },

    // Get cached data if still valid
    get(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (!cached) return null;

        // Check if cache is still valid based on TTL
        const maxTTL = this.getMaxTTL(cached.selections);
        const age = Date.now() - cached.timestamp;

        if (age > maxTTL) {
            console.log(`🗑️ Cache expired for ${cacheKey} (age: ${age}ms, max: ${maxTTL}ms)`);
            this.cache.delete(cacheKey);
            return null;
        }

        console.log(`✅ Cache hit for ${cacheKey} (age: ${age}ms, max: ${maxTTL}ms)`);
        return cached.data;
    },

    // Store data in cache with timestamp
    set(cacheKey, data, selections) {
        this.cache.set(cacheKey, {
            data,
            selections,
            timestamp: Date.now()
        });
        console.log(`💾 Cached data for ${cacheKey}`);
    },

    // Get the shortest TTL among requested selections
    getMaxTTL(selections) {
        if (!Array.isArray(selections)) {
            selections = [selections];
        }

        let minTTL = 30000; // Default 30 seconds
        for (const selection of selections) {
            if (this.TTL[selection] && this.TTL[selection] < minTTL) {
                minTTL = this.TTL[selection];
            }
        }
        return minTTL;
    },

    // Deduplicate concurrent identical requests
    async deduplicate(cacheKey, requestFn) {
        // If an identical request is already in progress, wait for it
        if (this.pendingRequests.has(cacheKey)) {
            console.log(`🔄 Deduplicating concurrent request: ${cacheKey}`);
            return await this.pendingRequests.get(cacheKey);
        }

        // Start new request and track it
        const requestPromise = requestFn();
        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            return result;
        } finally {
            // Clean up pending request tracker
            this.pendingRequests.delete(cacheKey);
        }
    },

    // Clear all cached data
    clear() {
        console.log('🗑️ Clearing API cache');
        this.cache.clear();
        this.pendingRequests.clear();
    },

    // Get cache statistics for debugging
    getStats() {
        return {
            cacheSize: this.cache.size,
            pendingRequests: this.pendingRequests.size,
            cacheKeys: Array.from(this.cache.keys())
        };
    }
};

// Target activity is deliberately cached for one minute. This keeps attack
// page navigation responsive without spending repeated Torn API requests.
const attackOnlineStatusCache = new Map();
const attackOnlineStatusPending = new Map();
const ATTACK_ONLINE_STATUS_TTL = 60_000;

// Extension installation/update handler
chrome.runtime.onInstalled.addListener((details) => {
    console.log('🚀 Sidekick Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
        // First installation
        console.log('🎉 Welcome to Sidekick! Extension installed successfully.');

        // Set default settings
        chrome.storage.local.set({
            'sidekick_first_install': true,
            'sidekick_version': '1.0.0',
            'sidekick_install_date': new Date().toISOString()
        });

    } else if (details.reason === 'update') {
        // Extension updated
        const previousVersion = details.previousVersion;
        console.log(`🔄 Sidekick updated from v${previousVersion} to v1.0.0`);

        chrome.storage.local.set({
            'sidekick_last_update': new Date().toISOString(),
            'sidekick_previous_version': previousVersion,
            'sidekick_version': '1.0.0'
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('🌟 Sidekick Extension starting up...');
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const safeRequest = request?.apiKey ? { ...request, apiKey: '[redacted]' } : request;
    console.log('📨 Background received message:', safeRequest);

    switch (request.action) {
        case 'ping':
            // Simple ping test for debugging
            sendResponse({ success: true, message: 'Background script is alive', timestamp: Date.now() });
            break;

        case 'fetchTornApi':
            // Handle Torn API calls from content scripts (avoids CORS)
            handleTornApiCall(request)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Keep message channel open for async response

        case 'fetchAttackOnlineStatus':
            handleAttackOnlineStatus(request)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'reportBug':
            // Handle Notion bug reporting
            handleBugReport(request.data)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true; // Keep message channel open for async response

        case 'getStorageData':
            // Helper for content scripts to access storage
            chrome.storage.local.get(request.keys, (result) => {
                sendResponse({ success: true, data: result });
            });
            return true; // Keep message channel open for async response

        case 'setStorageData':
            // Helper for content scripts to set storage
            chrome.storage.local.set(request.data, () => {
                sendResponse({ success: true });
            });
            return true;

        case 'clearStorageData':
            // Helper for content scripts to clear storage
            chrome.storage.local.clear(() => {
                sendResponse({ success: true });
            });
            return true;

        case 'openOptionsPage':
            // Open the extension options/settings page
            chrome.runtime.openOptionsPage();
            sendResponse({ success: true });
            break;

        case 'notification':
            // Create native Chrome notifications
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/swissknife-48.png',
                title: request.title || 'Sidekick',
                message: request.message || 'Notification from Sidekick'
            });
            sendResponse({ success: true });
            break;

        case 'proxyFetch':
            // Cross-origin fetch proxy for content scripts. Existing callers
            // receive JSON, while Cracking requests plain text.
            (async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), request.timeout || 30000);
                try {
                    const method = request.method || 'GET';
                    const fetchOptions = {
                        method,
                        headers: request.headers || {},
                        signal: controller.signal
                    };
                    if (request.body && method !== 'GET' && method !== 'HEAD') fetchOptions.body = request.body;

                    const response = await fetch(request.url, fetchOptions);
                    const responseText = await response.text();
                    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`);

                    if (request.responseType === 'text') {
                        sendResponse({
                            success: true,
                            data: responseText,
                            status: response.status,
                            statusText: response.statusText,
                            responseHeaders: [...response.headers]
                                .map(([key, value]) => `${key}: ${value}`)
                                .join('\r\n')
                        });
                    } else {
                        sendResponse({
                            success: true,
                            data: JSON.parse(responseText),
                            status: response.status,
                            statusText: response.statusText
                        });
                    }
                } catch (error) {
                    sendResponse({
                        success: false,
                        error: error.name === 'AbortError' ? 'Request timed out' : error.message
                    });
                } finally {
                    clearTimeout(timeoutId);
                }
            })();
            return true;

        case 'crimeNotifierAlert':
            // Handle Crime Notifier alerts with browser notifications and badge
            handleCrimeNotifierAlert(request.data)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        default:
            console.warn('Unknown action:', request.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

// Bug reporting is handled securely through Cloudflare Worker
// No API keys stored in the extension code

// Handle Torn API calls from content scripts (avoids CORS issues)
async function handleTornApiCall(request) {
    const { apiKey, selections, userId, endpoint: requestEndpoint } = request;

    if (!apiKey) {
        return { success: false, error: 'No API key provided' };
    }

    // Determine the API endpoint
    const endpoint = requestEndpoint || (userId ? `user/${userId}` : 'user');

    const cacheKey = apiCache.getCacheKey(apiKey, selections, endpoint);
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const result = await apiCache.deduplicate(cacheKey, async () => {
        console.log('🔍 Background: Making fresh API call:', { endpoint, selections });
        const r = await makeActualApiCall(apiKey, selections, endpoint);
        if (r.success) apiCache.set(cacheKey, r, selections);
        return r;
    });

    return result;
}

async function handleAttackOnlineStatus(request) {
    const apiKey = String(request.apiKey || '').trim();
    const userId = String(request.userId || '').trim();
    if (!apiKey) return { success: false, error: 'No API key provided' };
    if (!/^\d+$/.test(userId)) return { success: false, error: 'Invalid target user ID' };

    const cacheKey = `${apiKey}:${userId}`;
    const cached = attackOnlineStatusCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ATTACK_ONLINE_STATUS_TTL) {
        return { ...cached.result, cached: true };
    }

    if (attackOnlineStatusPending.has(cacheKey)) return attackOnlineStatusPending.get(cacheKey);

    const pending = (async () => {
        const url = `https://api.torn.com/v2/user/${userId}/profile?key=${encodeURIComponent(apiKey)}&comment=SidekickAttackStatus`;
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': 'Sidekick Chrome Extension' }
        });
        if (!response.ok) {
            const result = { success: false, error: `Torn API request failed (${response.status})` };
            attackOnlineStatusCache.set(cacheKey, { result, timestamp: Date.now() });
            return result;
        }

        const data = await response.json();
        if (data.error) {
            const result = { success: false, error: data.error.error || data.error.message || 'Torn API error' };
            attackOnlineStatusCache.set(cacheKey, { result, timestamp: Date.now() });
            return result;
        }

        const status = data.profile?.last_action?.status;
        if (!status) {
            const result = { success: false, error: 'Torn API profile did not include last_action.status' };
            attackOnlineStatusCache.set(cacheKey, { result, timestamp: Date.now() });
            return result;
        }
        const result = { success: true, status, name: data.profile?.name || '', cached: false };
        attackOnlineStatusCache.set(cacheKey, { result, timestamp: Date.now() });
        return result;
    })();

    attackOnlineStatusPending.set(cacheKey, pending);
    try {
        return await pending;
    } finally {
        attackOnlineStatusPending.delete(cacheKey);
    }
}


// Actual API call implementation (extracted from handleTornApiCall)
async function makeActualApiCall(apiKey, selections, endpoint) {

    // Helper: throw an Error that carries Torn's numeric API error code.
    function throwTornError(msg, code) {
        const err = new Error(msg);
        err.apiErrorCode = code ?? null;
        throw err;
    }

    try {
        // Prepare results object
        const results = {
            success: true,
            personalstats: null,
            logs: null,
            bars: null,
            cooldowns: null,
            refills: null,
            items: null,
            profile: null,
            company: null,
            money: null
        };

        // Fetch personal stats if requested
        if (selections.includes('personalstats')) {
            console.log('📊 Background: Fetching personal stats...');
            try {
                const statsResponse = await fetch(`https://api.torn.com/${endpoint}?selections=personalstats&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!statsResponse.ok) {
                    throwTornError(`Personal stats fetch failed: ${statsResponse.status}`);
                }

                const statsData = await statsResponse.json();

                if (statsData.error) {
                    throwTornError(
                        `API Error: ${statsData.error.error} (${statsData.error.code})`,
                        statsData.error.code
                    );
                }

                results.personalstats = statsData.personalstats;
                console.log('✅ Background: Personal stats retrieved successfully');

            } catch (error) {
                console.error('❌ Background: Personal stats fetch failed:', error);
                throw error;
            }
        }

        // Fetch cooldowns if requested
        if (selections.includes('cooldowns')) {
            console.log('⏰ Background: Fetching cooldowns...');
            try {
                const cooldownResponse = await fetch(`https://api.torn.com/${endpoint}?selections=cooldowns&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!cooldownResponse.ok) {
                    console.warn('⚠️ Background: Cooldown fetch failed:', cooldownResponse.status);
                    // Don't throw here, cooldowns are optional
                } else {
                    const cooldownData = await cooldownResponse.json();

                    if (cooldownData.error) {
                        console.warn('⚠️ Background: Cooldown API error:', cooldownData.error);
                        // Don't throw here, cooldowns are optional
                    } else {
                        results.cooldowns = cooldownData.cooldowns;
                        console.log('✅ Background: Cooldowns retrieved successfully');
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Cooldown fetch failed (non-fatal):', error);
                // Continue without cooldowns
            }
        }

        // Fetch bank investment data if requested
        if (selections.includes('money')) {
            console.log('💰 Background: Fetching money data (includes bank investment)...');
            try {
                const moneyResponse = await fetch(`https://api.torn.com/${endpoint}?selections=money&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!moneyResponse.ok) {
                    console.warn('⚠️ Background: Money fetch failed:', moneyResponse.status);
                    // Don't throw here, money is optional
                } else {
                    const moneyData = await moneyResponse.json();

                    if (moneyData.error) {
                        console.warn('⚠️ Background: Money API error:', moneyData.error);
                        // Don't throw here, money is optional
                    } else {
                        results.money = moneyData;
                        console.log('✅ Background: Money data retrieved successfully:', moneyData);
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Money fetch failed (non-fatal):', error);
                // Continue without money data
            }
        }

        // Fetch bars if requested
        if (selections.includes('bars')) {
            console.log('📊 Background: Fetching bars...');
            try {
                const barsResponse = await fetch(`https://api.torn.com/${endpoint}?selections=bars&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!barsResponse.ok) {
                    console.warn('⚠️ Background: Bars fetch failed:', barsResponse.status);
                    // Don't throw here, bars are optional
                } else {
                    const barsData = await barsResponse.json();

                    if (barsData.error) {
                        console.warn('⚠️ Background: Bars API error:', barsData.error);
                        // Don't throw here, bars are optional
                    } else {
                        results.bars = barsData.bars;
                        console.log('✅ Background: Bars retrieved successfully');
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Bars fetch failed (non-fatal):', error);
                // Continue without bars
            }
        }

        // Fetch logs if requested
        if (selections.includes('logs')) {
            console.log('📋 Background: Fetching logs...');
            try {
                const logResponse = await fetch(`https://api.torn.com/${endpoint}?selections=log&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!logResponse.ok) {
                    console.warn('⚠️ Background: Log fetch failed:', logResponse.status);
                    // Don't throw here, logs are optional
                } else {
                    const logData = await logResponse.json();

                    if (logData.error) {
                        console.warn('⚠️ Background: Log API error:', logData.error);
                        // Don't throw here, logs are optional
                    } else {
                        results.logs = logData.log;
                        console.log('✅ Background: Logs retrieved successfully');
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Log fetch failed (non-fatal):', error);
                // Continue without logs
            }
        }

        // 🆕 Fetch refills if requested (MOST IMPORTANT for daily task detection!)
        if (selections.includes('refills')) {
            console.log('💊 Background: Fetching refills...');
            try {
                const refillsResponse = await fetch(`https://api.torn.com/${endpoint}?selections=refills&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!refillsResponse.ok) {
                    console.warn('⚠️ Background: Refills fetch failed:', refillsResponse.status);
                    // Don't throw here, refills are optional
                } else {
                    const refillsData = await refillsResponse.json();

                    if (refillsData.error) {
                        console.warn('⚠️ Background: Refills API error:', refillsData.error);
                        // Don't throw here, refills are optional
                    } else {
                        results.refills = refillsData.refills;
                        console.log('✅ Background: Refills retrieved successfully:', refillsData.refills);
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Refills fetch failed (non-fatal):', error);
                // Continue without refills
            }
        }

        // Fetch items from torn endpoint if requested
        if (selections.includes('items')) {
            console.log('📦 Background: Fetching items from torn endpoint...');
            try {
                const itemsResponse = await fetch(`https://api.torn.com/${endpoint}?selections=items&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!itemsResponse.ok) {
                    console.warn('⚠️ Background: Items fetch failed:', itemsResponse.status);
                } else {
                    const itemsData = await itemsResponse.json();

                    if (itemsData.error) {
                        console.warn('⚠️ Background: Items API error:', itemsData.error);
                    } else {
                        results.items = itemsData.items;
                        console.log('✅ Background: Items retrieved successfully');
                    }
                }

            } catch (error) {
                console.warn('⚠️ Background: Items fetch failed (non-fatal):', error);
            }
        }

        // Fetch profile if requested (for mug calculator)
        if (selections.includes('profile')) {
            console.log('👤 Background: Fetching profile...');
            try {
                const profileResponse = await fetch(`https://api.torn.com/${endpoint}?selections=profile&key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!profileResponse.ok) {
                    throw new Error(`Profile fetch failed: ${profileResponse.status}`);
                }

                const profileData = await profileResponse.json();

                if (profileData.error) {
                    throwTornError(
                        `API Error: ${profileData.error.error} (${profileData.error.code})`,
                        profileData.error.code
                    );
                }

                // Store the complete profile data
                results.profile = profileData;
                console.log('✅ Background: Profile retrieved successfully');

            } catch (error) {
                console.error('❌ Background: Profile fetch failed:', error);
                throw error;
            }
        }

        // Fetch company data if endpoint is company/* (for mug calculator clothing store check)
        if (endpoint.startsWith('company/')) {
            console.log('🏢 Background: Fetching company data...');
            try {
                const companyResponse = await fetch(`https://api.torn.com/${endpoint}?key=${apiKey}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Sidekick Chrome Extension Background'
                    }
                });

                if (!companyResponse.ok) {
                    throw new Error(`Company fetch failed: ${companyResponse.status}`);
                }

                const companyData = await companyResponse.json();

                if (companyData.error) {
                    throwTornError(
                        `API Error: ${companyData.error.error} (${companyData.error.code})`,
                        companyData.error.code
                    );
                }

                // Store company data
                results.company = companyData;
                console.log('✅ Background: Company data retrieved successfully');

            } catch (error) {
                console.error('❌ Background: Company fetch failed:', error);
                throw error;
            }
        }

        // ── Generic endpoint fallback ────────────────────────────────────────────
        // For endpoints like market/{id}, faction/, torn/ that don't match any
        // selection above. Returns raw data in results.raw.
        const knownEndpointPrefixes = ['company/', 'user'];
        const noSelectionHandled = !selections?.length && !knownEndpointPrefixes.some(p => endpoint.startsWith(p));
        const genericEndpoint = !endpoint.startsWith('user') &&
            !endpoint.startsWith('company/') &&
            !(selections?.includes('personalstats') || selections?.includes('bars') ||
                selections?.includes('cooldowns') || selections?.includes('refills') ||
                selections?.includes('items') || selections?.includes('profile') ||
                selections?.includes('money') || selections?.includes('logs'));

        if (genericEndpoint) {
            console.log("Generic endpoint:", endpoint
            );
            try {
                const genSel = selections?.length ? `&selections=${selections.join(',')}` : '';
                const genResponse = await fetch(
                    `https://api.torn.com/${endpoint}?key=${apiKey}${genSel}`,
                    { method: 'GET', headers: { 'User-Agent': 'Sidekick Chrome Extension Background' } }
                );

                if (!genResponse.ok) {
                    throwTornError(`Generic endpoint fetch failed: ${genResponse.status}`);
                }

                const genData = await genResponse.json();

                if (genData.error) {
                    throwTornError(
                        `API Error: ${genData.error.error} (${genData.error.code})`,
                        genData.error.code
                    );
                }

                results.raw = genData;
                // Also spread all top-level keys for convenience
                Object.assign(results, genData);
                console.log(`✅ Background: Generic endpoint ${endpoint} retrieved successfully`);

            } catch (error) {
                console.error('❌ Background: Generic endpoint fetch failed:', error);
                throw error;
            }
        }

        console.log('🎯 Background: API call completed successfully');
        return results;

    } catch (error) {
        console.error('❌ Background: Torn API call failed:', error);
        return {
            success: false,
            error: error.message,
            apiErrorCode: error.apiErrorCode ?? null,
        };
    }
}

// Handle bug reports via secure Cloudflare Worker (no API keys in extension)
async function handleBugReport(bugData) {
    try {
        console.log('🐛 Sending bug report via secure worker:', bugData);

        // Prepare payload for Cloudflare Worker
        const payload = {
            title: bugData.title || 'Bug Report',
            description: bugData.description || 'No description provided',
            priority: bugData.priority || 'Medium',
            screenshot: bugData.screenshot || null,
            metadata: bugData.metadata || {
                timestamp: new Date().toISOString(),
                extensionVersion: chrome.runtime.getManifest().version
            }
        };

        console.log('📦 Sending payload to worker:', JSON.stringify(payload, null, 2));

        // Send to Cloudflare Worker (handles Notion API securely)
        const response = await fetch('https://notion-bug-proxy.akaffebtd.workers.dev/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('📡 Worker response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Bug report failed:', errorText);

            // Try to parse error details if JSON
            let errorDetails = errorText;
            try {
                const errorJson = JSON.parse(errorText);
                errorDetails = JSON.stringify(errorJson, null, 2);
                console.error('❌ Detailed error:', errorJson);
            } catch (e) {
                // Not JSON, use raw text
            }

            return {
                success: false,
                error: `Worker error: ${response.status}`,
                message: `Failed to submit bug report (${response.status}):\n\n${errorDetails}\n\nPlease check that your Cloudflare Worker has the correct Notion API credentials configured.`
            };
        }

        const result = await response.json();
        console.log('✅ Bug report sent successfully:', result);

        return {
            success: true,
            data: {
                pageId: result.id,
                url: result.url
            }
        };

    } catch (error) {
        console.error('❌ Failed to send bug report to Notion:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);

        // Check if it's a network error
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return {
                success: false,
                error: 'Network error: Unable to connect to Notion API. Please check your internet connection and extension permissions.'
            };
        }

        return {
            success: false,
            error: error.message
        };
    }
}

// ========================================
// CRIME NOTIFIER - Badge & Notification Handler
// ========================================

// Handle Crime Notifier alerts - creates browser notification and updates badge
async function handleCrimeNotifierAlert(alertData) {
    try {
        const { title, message, type, timestamp } = alertData;

        console.log('🚨 Crime Notifier Alert:', { title, message, type });

        // Check if Windows notifications are enabled by the user
        const notifPrefs = await chrome.storage.local.get('sidekick_notification_prefs');
        const windowsNotifEnabled = notifPrefs?.sidekick_notification_prefs?.windowsNotifications || false;

        // 1. Create OS-level notification only if opted in
        if (windowsNotifEnabled) {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'assets/icons/swissknife-48.png',
                title: title || '🚨 Crime Notifier',
                message: message || 'Alert from Crime Notifier',
                priority: 2,
                requireInteraction: false
            });
        }

        // 2. Increment badge counter
        await incrementBadge();

        // 3. Store notification in NotificationCenter storage
        await storeNotification({
            id: `crime_${timestamp}`,
            moduleId: 'crime-notifier',
            type: type || 'warning',
            title: title,
            message: message,
            timestamp: timestamp,
            read: false
        });

        console.log('✅ Crime Notifier alert handled successfully');
        return { success: true };

    } catch (error) {
        console.error('❌ Failed to handle Crime Notifier alert:', error);
        return { success: false, error: error.message };
    }
}

// Badge management functions
async function incrementBadge() {
    try {
        const result = await chrome.storage.local.get('crime_notifier_unread_count');
        const currentCount = result.crime_notifier_unread_count || 0;
        const newCount = currentCount + 1;

        await chrome.storage.local.set({ crime_notifier_unread_count: newCount });
        await chrome.action.setBadgeText({ text: String(newCount) });
        await chrome.action.setBadgeBackgroundColor({ color: '#FF6B6B' }); // Red color

        console.log(`📛 Badge updated: ${newCount}`);
    } catch (error) {
        console.error('❌ Failed to update badge:', error);
    }
}

async function clearBadge() {
    try {
        await chrome.storage.local.set({ crime_notifier_unread_count: 0 });
        await chrome.action.setBadgeText({ text: '' });
        console.log('📛 Badge cleared');
    } catch (error) {
        console.error('❌ Failed to clear badge:', error);
    }
}

// Store notification in the existing notification center system
async function storeNotification(notification) {
    try {
        const result = await chrome.storage.local.get('sidekick_notifications');
        const notifications = result.sidekick_notifications || [];

        // Add new notification at the start (most recent first)
        notifications.unshift(notification);

        // Keep only last 50 notifications
        const trimmed = notifications.slice(0, 50);

        await chrome.storage.local.set({ sidekick_notifications: trimmed });
        console.log('💾 Notification stored in NotificationCenter');
    } catch (error) {
        console.error('❌ Failed to store notification:', error);
    }
}

// Handle storage changes for debugging
chrome.storage.onChanged.addListener((changes, areaName) => {
    console.log('💾 Storage changed in', areaName, ':', changes);
});

// Handle tab updates to potentially refresh extension state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('torn.com')) {
        console.log('🔄 Torn.com tab updated:', tab.url);

        // Send message to content script that page is ready
        chrome.tabs.sendMessage(tabId, {
            action: 'pageReady',
            url: tab.url
        }).catch(() => {
            // Ignore errors if content script not ready yet
        });
    }
});

// Keep service worker alive
let keepAlive;

function startKeepAlive() {
    if (keepAlive) return;

    keepAlive = setInterval(() => {
        chrome.storage.local.get('sidekick_keepalive', () => {
            if (chrome.runtime.lastError) {
                console.log('Service worker keep-alive failed:', chrome.runtime.lastError);
            }
        });
    }, 20000); // Check every 20 seconds
}

function stopKeepAlive() {
    if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
    }
}

// Start keep-alive when service worker activates
startKeepAlive();

// Clean up when service worker is about to be terminated
self.addEventListener('beforeunload', () => {
    stopKeepAlive();
});

console.log('✅ Sidekick Background Service Worker loaded - v1.0.0');
