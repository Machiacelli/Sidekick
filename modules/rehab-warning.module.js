// Rehab Warning Module
// Checks user addiction levels and company addiction penalty against settings
// Displays a sticky notification if thresholds are exceeded

const RehabWarningModule = (() => {
    const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const REHAB_BASE_COST = 250000;
    
    // Default settings
    let isEnabled = false;
    let eduThreshold = 4; // 4%
    let companyEnable = false;
    let companyPenalty = 5; // -5
    
    let containerElement = null;

    async function CS() {
        return window.SidekickModules?.Core?.ChromeStorage || chrome.storage.local;
    }

    // Convert string icon title to addiction %
    // E.g., "Addiction: 2%" -> 2
    function parseAddiction(iconText) {
        if (!iconText) return 0;
        const match = iconText.match(/Addiction:\s*(\d+(\.\d+)?)%/i);
        return match ? parseFloat(match[1]) : 0;
    }

    async function fetchRehabData() {
        const cs = await CS();
        const apiKey = await cs.get('sidekick_api_key');
        if (!apiKey) return null;

        try {
            // Use API v1 since it provides a flat structure and known employee dictionary
            const userRes = await fetch(`https://api.torn.com/user/?selections=profile,icons,personalstats&key=${apiKey}&comment=SidekickRehab`);
            const userData = await userRes.json();
            
            if (userData.error) return null;

            let addictionPercent = 0;
            if (userData.icons) {
                for (const [key, iconObj] of Object.entries(userData.icons)) {
                    if (iconObj.includes('Addiction')) {
                        // Extract percentage like "Addiction: 4%" or "Addiction (4%)"
                        const match = iconObj.match(/(\d+)%/);
                        if (match) {
                            addictionPercent = parseInt(match[1], 10);
                        }
                    }
                }
            }

            const rehabsDone = userData.personalstats?.rehabs || 0;

            // Fetch company info if user wants company penalty alert
            let companyPenaltyVal = 0;
            if (companyEnable && companyPenalty > 0) {
                try {
                    if (userData.job && userData.job.company_id) {
                        // Fetch own company data without passing compId, as v1 defaults to own company
                        const empRes = await fetch(`https://api.torn.com/company/?selections=employees&key=${apiKey}&comment=SidekickRehab`);
                        const empData = await empRes.json();
                        
                        if (empData.company_employees && empData.company_employees[userData.player_id]) {
                            const myEmp = empData.company_employees[userData.player_id];
                            companyPenaltyVal = myEmp.effectiveness?.addiction || 0;
                            // Make it positive for easier comparison
                            companyPenaltyVal = Math.abs(companyPenaltyVal);
                        }
                    }
                } catch (e) {
                    console.error("Sidekick: Error fetching company data for rehab warning", e);
                }
            }

            return {
                addiction: addictionPercent,
                rehabsDone: rehabsDone,
                companyPenalty: companyPenaltyVal
            };

        } catch (e) {
            console.error("[Rehab Warning] Error fetching data:", e);
            return null;
        }
    }

    async function checkAddiction() {
        if (!isEnabled) return;

        const cs = await CS();
        const state = await cs.get('sidekick_rehab_state') || {
            lastFetch: 0,
            addiction: 0,
            rehabsDone: 0,
            companyPenalty: 0,
            dismissedAddiction: -1
        };

        const now = Date.now();
        let data = state;

        if (now - state.lastFetch > API_CACHE_TTL) {
            const freshData = await fetchRehabData();
            if (freshData) {
                data = {
                    ...state,
                    lastFetch: now,
                    addiction: freshData.addiction,
                    rehabsDone: freshData.rehabsDone,
                    companyPenalty: freshData.companyPenalty
                };
                
                // If addiction went down (i.e. rehabbed), reset the dismissedAddiction
                if (freshData.addiction < state.addiction) {
                    data.dismissedAddiction = -1;
                }
                
                await cs.set('sidekick_rehab_state', data);
            }
        }

        evaluateWarnings(data);
    }

    function evaluateWarnings(data) {
        if (data.addiction <= 0 && data.companyPenalty <= 0) {
            hideNotification();
            return;
        }

        // If user already dismissed this exact level of addiction, don't show it again until it goes UP
        if (data.dismissedAddiction >= data.addiction) {
            return;
        }

        const isEduRisk = (data.addiction >= eduThreshold);
        const isCompanyRisk = (companyEnable && companyPenalty > 0 && data.companyPenalty >= companyPenalty);

        if (!isEduRisk && !isCompanyRisk) {
            hideNotification();
            return;
        }

        // Calculate metrics
        // Assume maximum safe addiction before kick is approx 8-10% depending on education,
        // we'll use the user's defined eduThreshold as the max limit to warn about.
        const addLeft = Math.max(0, eduThreshold - data.addiction);
        // Approx 1 xanax = ~0.8 to 1% addiction (varies by faction perks, but 1% is a safe conservative estimate)
        // Let's assume ~1% per xanax for the sake of the "safe xanax" warning.
        const safeXanax = Math.floor(addLeft / 1.0) || 0; 



        let msgHtml = `<div style="margin-bottom: 6px;"><b>⚠️ Rehab Warning</b></div>`;
        
        if (isEduRisk) {
            msgHtml += `<div style="font-size:12px; margin-bottom: 4px;">Education kick risk! Addiction is at <b>${data.addiction}%</b> (Threshold: ${eduThreshold}%).</div>`;
            msgHtml += `<div style="font-size:11px; margin-bottom: 4px; color:#e57373;">You have approx ${safeXanax} safe Xanax left before reaching the threshold.</div>`;
        }
        
        if (isCompanyRisk) {
            msgHtml += `<div style="font-size:12px; margin-bottom: 4px;">Company Penalty is <b>-${data.companyPenalty}</b>!</div>`;
        }

        showNotification(msgHtml, data.addiction);
    }

    function showNotification(htmlContent, currentAddiction) {
        if (!containerElement) {
            containerElement = document.createElement('div');
            containerElement.id = 'sk-rehab-warning-banner';
            containerElement.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                background: #1a2332;
                border-left: 4px solid #e57373;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                color: #fff;
                padding: 12px 16px;
                border-radius: 6px;
                z-index: 999999;
                font-family: inherit;
                line-height: 1.4;
            `;
            document.body.appendChild(containerElement);
        }

        containerElement.innerHTML = `
            <div style="position: absolute; top: 8px; right: 8px; cursor: pointer; color: #888; font-size: 16px; line-height: 1;" class="sk-rw-close">×</div>
            ${htmlContent}
        `;
        
        containerElement.style.display = 'block';

        containerElement.querySelector('.sk-rw-close').addEventListener('click', async () => {
            hideNotification();
            const cs = await CS();
            const state = await cs.get('sidekick_rehab_state') || {};
            state.dismissedAddiction = currentAddiction;
            await cs.set('sidekick_rehab_state', state);
        });
    }

    function hideNotification() {
        if (containerElement) {
            containerElement.style.display = 'none';
        }
    }

    return {
        async init() {
            console.log("[Rehab Warning] Init...");
            const cs = await CS();
            const settings = await cs.get('sidekick_rehab_warning') || {};
            isEnabled = settings.isEnabled === true;
            
            // Set values from settings if they exist
            if (settings.eduThreshold !== undefined) eduThreshold = settings.eduThreshold;
            if (settings.companyEnable !== undefined) companyEnable = settings.companyEnable;
            if (settings.companyPenalty !== undefined) companyPenalty = settings.companyPenalty;

            if (isEnabled) {
                checkAddiction();
                // Check every 5 mins
                setInterval(checkAddiction, API_CACHE_TTL);
            }
        },

        updateSettings(settings) {
            let shouldForce = false;
            if (settings.eduThreshold !== undefined) {
                if (settings.eduThreshold !== eduThreshold) shouldForce = true;
                eduThreshold = settings.eduThreshold;
            }
            if (settings.companyEnable !== undefined) {
                if (!companyEnable && settings.companyEnable) shouldForce = true;
                companyEnable = settings.companyEnable;
            }
            if (settings.companyPenalty !== undefined) {
                if (settings.companyPenalty !== companyPenalty) shouldForce = true;
                companyPenalty = settings.companyPenalty;
            }
            
            if (isEnabled) {
                if (shouldForce) {
                    CS().then(cs => cs.get('sidekick_rehab_state')).then(state => {
                        if (state) {
                            state.lastFetch = 0;
                            state.dismissedAddiction = -1; // Reset dismissal on setting change
                            cs.set('sidekick_rehab_state', state).then(() => checkAddiction());
                        } else {
                            checkAddiction();
                        }
                    });
                } else {
                    checkAddiction();
                }
            }
        }
    };
})();

if (!window.SidekickModules) window.SidekickModules = {};
window.SidekickModules.RehabWarning = RehabWarningModule;
console.log('[Rehab Warning] Module registered');
