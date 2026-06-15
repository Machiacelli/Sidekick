/**
 * Sidekick Chrome Extension - Main Entry Point
 * Converted from Tampermonkey userscript to Chrome extension
 * Version: 1.0.0
 * Author: Machiacelli
 */

(function () {
    "use strict";

    // Immediate test - this should show up right away
    console.log("🚀 Sidekick Chrome Extension v1.0.0 Loading...");
    console.log("🌍 Current URL:", window.location.href);
    console.log("📍 Script running on domain:", window.location.hostname);

    // Main initialization function
    async function initializeSidekick() {
        try {
            console.log("⏳ Sidekick: Waiting for modules to load...");

            console.log("🔍 Sidekick: Checking for Core and UI modules...");

            // Wait for critical modules with timeout
            const timeout = 15000; // 15 seconds
            const startTime = Date.now();

            while (!window.SidekickModules?.Core?.STORAGE_KEYS || !window.SidekickModules?.UI?.createSidebar) {
                console.log("🔄 Sidekick: Still waiting for modules...", {
                    core: !!window.SidekickModules?.Core?.STORAGE_KEYS,
                    ui: !!window.SidekickModules?.UI?.createSidebar,
                    clock: !!window.SidekickModules?.Clock
                });

                if (Date.now() - startTime > timeout) {
                    console.error("❌ Module loading timeout after 15 seconds");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log("✅ Sidekick: Core and UI modules loaded successfully");

            console.log("📦 Sidekick: Available modules:", Object.keys(window.SidekickModules || {}));

            // Initialize Core Module (for extension context monitoring)
            console.log("🔧 Sidekick: Initializing Core Module...");
            if (window.SidekickModules.Core?.init) {
                await window.SidekickModules.Core.init();
                console.log("✅ Sidekick: Core Module initialized");
            } else {
                console.warn("⚠️ Core module init not available");
            }

            // Initialize Settings Module
            console.log("⚙️ Sidekick: Initializing Settings...");
            if (window.SidekickModules.Settings?.init) {
                await window.SidekickModules.Settings.init();
                console.log("✅ Sidekick: Settings initialized");
            } else {
                console.warn("⚠️ Settings module not available");
            }

            // Initialize UI
            console.log("🎨 Sidekick: Initializing UI...");
            if (window.SidekickModules.UI.init) {
                window.SidekickModules.UI.init();
                console.log("✅ Sidekick: UI initialized");
            }

            // Initialize Clock Module
            console.log("🕐 Sidekick: Initializing Clock...");
            if (window.SidekickModules.Clock?.init) {
                await window.SidekickModules.Clock.init();
                console.log("✅ Sidekick: Clock initialized");
            } else {
                console.warn("⚠️ Clock module not available");
            }

            // Initialize Event Ticker Module
            console.log("🎪 Sidekick: Initializing Event Ticker...");
            if (window.SidekickModules.EventTicker?.init) {
                await window.SidekickModules.EventTicker.init();
                console.log("✅ Sidekick: Event Ticker initialized");
            } else {
                console.warn("⚠️ Event Ticker module not available");
            }

            // Initialize Link Group Module
            console.log("🔗 Sidekick: Initializing Link Group...");
            if (window.SidekickModules.LinkGroup?.init) {
                await window.SidekickModules.LinkGroup.init();
                console.log("✅ Sidekick: Link Group initialized");
            } else {
                console.warn("⚠️ Link Group module not available");
            }

            // Initialize Attack List Module
            console.log("⚔️ Sidekick: Initializing Attack List...");
            if (window.SidekickModules.AttackList?.init) {
                await window.SidekickModules.AttackList.init();
                console.log("✅ Sidekick: Attack List initialized");
            } else {
                console.warn("⚠️ Attack List module not available");
            }

            // Initialize Attack Button Mover Module
            console.log("⚔️ Sidekick: Initializing Attack Button Mover...");
            if (window.SidekickModules.AttackButtonMover?.init) {
                await window.SidekickModules.AttackButtonMover.init();
                console.log("✅ Sidekick: Attack Button Mover initialized");
            } else {
                console.warn("⚠️ Attack Button Mover module not available");
            }

            // Initialize Xanax Viewer Module
            console.log("💊 Sidekick: Initializing Xanax Viewer...");
            if (window.SidekickModules.XanaxViewer?.init) {
                await window.SidekickModules.XanaxViewer.init();
                console.log("✅ Sidekick: Xanax Viewer initialized");
            } else {
                console.warn("⚠️ Xanax Viewer module not available");
            }

            // Initialize Block Training Module
            console.log("🚫 Sidekick: Initializing Block Training...");
            if (window.SidekickModules.BlockTraining?.init) {
                await window.SidekickModules.BlockTraining.init();
                console.log("✅ Sidekick: Block Training initialized");
            } else {
                console.warn("⚠️ Block Training module not available");
            }

            // Initialize Time on Tab Module
            console.log("⏰ Sidekick: Initializing Time on Tab...");
            if (window.SidekickModules.TimeOnTab?.init) {
                await window.SidekickModules.TimeOnTab.init();
                console.log("✅ Sidekick: Time on Tab initialized");
            } else {
                console.warn("⚠️ Time on Tab module not available");
            }

            // Initialize Chain Timer Module
            console.log("⏱️ Sidekick: Initializing Chain Timer...");
            if (window.SidekickModules.ChainTimer?.init) {
                await window.SidekickModules.ChainTimer.init();
                console.log("✅ Sidekick: Chain Timer initialized");
            } else {
                console.warn("⚠️ Chain Timer module not available");
            }

            // Initialize OC Weights Module
            console.log("📊 Sidekick: Initializing OC Weights...");
            if (window.SidekickModules.OCWeights?.init) {
                await window.SidekickModules.OCWeights.init();
                console.log("✅ Sidekick: OC Weights initialized");
            } else {
                console.warn("⚠️ OC Weights module not available");
            }

            // Initialize Bunker Bucks Calculator Module
            console.log("💰 Sidekick: Initializing Bunker Bucks Calculator...");
            if (window.SidekickModules.BunkerBucks?.init) {
                await window.SidekickModules.BunkerBucks.init();
                console.log("✅ Sidekick: Bunker Bucks Calculator initialized");
            } else {
                console.warn("⚠️ Bunker Bucks Calculator module not available");
            }

            // Initialize Blood Bag Reminder Module
            console.log("🩸 Sidekick: Initializing Blood Bag Reminder...");
            if (window.SidekickModules.BloodBagReminder?.init) {
                await window.SidekickModules.BloodBagReminder.init();
                console.log("✅ Sidekick: Blood Bag Reminder initialized");
            } else {
                console.warn("⚠️ Blood Bag Reminder module not available");
            }





            // Initialize Locked Items Module
            console.log("🔒 Sidekick: Initializing Locked Items Manager...");
            if (window.SidekickModules.LockedItems?.init) {
                await window.SidekickModules.LockedItems.init();
                console.log("✅ Sidekick: Locked Items Manager initialized");
            } else {
                console.warn("⚠️ Locked Items Manager module not available");
            }


            // Initialize NPC Attack Timer Module
            console.log("⚔️ Sidekick: Initializing NPC Attack Timer...");
            if (window.SidekickModules.NPCAttackTimer?.init) {
                await window.SidekickModules.NPCAttackTimer.init();
                console.log("✅ Sidekick: NPC Attack Timer initialized");
            } else {
                console.warn("⚠️ NPC Attack Timer module not available");
            }

            // Initialize Random Target Module
            console.log('🎯 Sidekick: Initializing Random Target...');
            if (window.SidekickModules.RandomTarget?.init) {
                await window.SidekickModules.RandomTarget.init();
                console.log('✅ Sidekick: Random Target initialized');
            } else {
                console.warn('⚠️ Random Target module not available');
            }

            // Initialize Inventory Sorter Module
            console.log('📦 Sidekick: Initializing Inventory Sorter...');
            if (window.SidekickModules.InventorySorter?.init) {
                await window.SidekickModules.InventorySorter.init();
                console.log('✅ Sidekick: Inventory Sorter initialized');
            } else {
                console.warn('⚠️ Inventory Sorter module not available');
            }

            // Initialize Item Market Max Quantity Module
            console.log('🛒 Sidekick: Initializing Item Market Max Quantity...');
            if (window.SidekickModules.ItemMarketMaxQuantity?.init) {
                window.SidekickModules.ItemMarketMaxQuantity.init();
                console.log('✅ Sidekick: Item Market Max Quantity initialized');
            } else {
                console.warn('⚠️ Item Market Max Quantity module not available');
            }

            // Initialize Mug Calculator Module
            console.log('💰 Sidekick: Initializing Mug Calculator...');
            if (window.SidekickModules.MugCalculator?.initialize) {
                await window.SidekickModules.MugCalculator.initialize();
                console.log('✅ Sidekick: Mug Calculator initialized');
            } else {
                console.warn('⚠️ Mug Calculator module not available');
            }

            // Initialize Weapon XP Tracker Module
            console.log('🎯 Sidekick: Initializing Weapon XP Tracker...');
            if (window.SidekickModules.WeaponExpTracker?.initialize) {
                await window.SidekickModules.WeaponExpTracker.initialize();
                console.log('✅ Sidekick: Weapon XP Tracker initialized');
            } else {
                console.warn('⚠️ Weapon XP Tracker module not available');
            }

            // Initialize Racing Alert Module
            console.log('🏎️ Sidekick: Initializing Racing Alert...');
            if (window.SidekickModules.RacingAlert?.initialize) {
                await window.SidekickModules.RacingAlert.initialize();
                console.log('✅ Sidekick: Racing Alert initialized');
            } else {
                console.warn('⚠️ Racing Alert module not available');
            }

            // Initialize Refill Blocker Module
            console.log('🛡️ Sidekick: Initializing Refill Blocker...');
            if (window.SidekickModules.RefillBlocker?.initialize) {
                await window.SidekickModules.RefillBlocker.initialize();
                console.log('✅ Sidekick: Refill Blocker initialized');
            } else {
                console.warn('⚠️ Refill Blocker module not available');
            }

            // Initialize Extended Chain View Module
            console.log('⛓️ Sidekick: Initializing Extended Chain View...');
            if (window.SidekickModules.ExtendedChainView?.initialize) {
                await window.SidekickModules.ExtendedChainView.initialize();
                console.log('✅ Sidekick: Extended Chain View initialized');
            } else {
                console.warn('⚠️ Extended Chain View module not available');
            }

            // Initialize Timer Module
            console.log("⏰ Sidekick: Initializing Timer...");
            if (window.SidekickModules.Timer?.init) {
                await window.SidekickModules.Timer.init();
                console.log("✅ Sidekick: Timer initialized");
            } else {
                console.warn("⚠️ Timer module not available");
            }

            // Initialize Flight Tracker Module
            console.log("✈️ Sidekick: Initializing Flight Tracker...");
            if (window.SidekickModules.FlightTracker?.init) {
                await window.SidekickModules.FlightTracker.init();
                console.log("✅ Sidekick: Flight Tracker initialized");
            } else {
                console.warn("⚠️ Flight Tracker module not available");
            }

            // Initialize Legible Names Module
            console.log("🔤 Sidekick: Initializing Legible Names...");
            if (window.SidekickModules.LegibleNames?.init) {
                await window.SidekickModules.LegibleNames.init();
                console.log("✅ Sidekick: Legible Names initialized");
            } else {
                console.warn("⚠️ Legible Names module not available");
            }

            // Initialize TravelArc Module
            console.log("🌍 Sidekick: Initializing TravelArc...");
            if (window.SidekickModules.TravelArc?.init) {
                await window.SidekickModules.TravelArc.init();
                console.log("✅ Sidekick: TravelArc initialized");
            } else {
                console.warn("⚠️ TravelArc module not available");
            }

            // Initialize Stats Tracker Module
            console.log("📊 Sidekick: Initializing Stats Tracker...");
            if (window.SidekickModules.StatsTracker?.init) {
                await window.SidekickModules.StatsTracker.init();
                console.log("✅ Sidekick: Stats Tracker initialized");
            } else {
                console.warn("⚠️ Stats Tracker module not available");
            }



            // Initialize Todo List
            console.log("📋 Sidekick: Initializing Todo List...");
            if (window.SidekickModules.TodoList?.init) {
                await window.SidekickModules.TodoList.init();
                console.log("✅ Sidekick: Todo List initialized");
            } else {
                console.warn("⚠️ Todo List module not available");
            }

            // Initialize Debt Module
            console.log("💰 Sidekick: Initializing Debt Module...");
            if (window.SidekickModules.Debt?.init) {
                await window.SidekickModules.Debt.init();
                console.log("✅ Sidekick: Debt Module initialized");
            } else {
                console.warn("⚠️ Debt Module not available");
            }

            // Initialize Crime Notifier Module
            console.log("🚨 Sidekick: Initializing Crime Notifier...");
            if (window.SidekickModules.CrimeNotifier?.init) {
                await window.SidekickModules.CrimeNotifier.init();
                console.log("✅ Sidekick: Crime Notifier initialized");
            } else {
                console.warn("⚠️ Crime Notifier module not available");
            }


            // Scamming module runs in MAIN world (self-initializing) — no init call needed here
            console.log('🎣 Sidekick: Scamming module is self-initializing in MAIN world');

            // Initialize War Monitor Module
            console.log("⚔️ Sidekick: Initializing War Monitor...");
            if (window.SidekickModules.WarMonitor?.init) {
                await window.SidekickModules.WarMonitor.init();
                console.log("✅ Sidekick: War Monitor initialized");
            } else {
                console.warn("⚠️ War Monitor module not available");
            }

            // Initialize Chat Alert Module
            console.log("💬 Sidekick: Initializing Chat Alert...");
            if (window.SidekickModules.ChatAlert?.init) {
                await window.SidekickModules.ChatAlert.init();
                console.log("✅ Sidekick: Chat Alert initialized");
            } else {
                console.warn("⚠️ Chat Alert module not available");
            }

            // Initialize Mug Warning Module
            console.log("⚠️ Sidekick: Initializing Mug Warning...");
            if (window.SidekickModules.MugWarning?.init) {
                await window.SidekickModules.MugWarning.init();
                console.log("✅ Sidekick: Mug Warning initialized");
            } else {
                console.warn("⚠️ Mug Warning module not available");
            }

            // Initialize Mug Calculator Module
            console.log("🥊 Sidekick: Initializing Mug Calculator...");
            if (window.SidekickModules.MugCalculator?.initialize) {
                await window.SidekickModules.MugCalculator.initialize();
                console.log("✅ Sidekick: Mug Calculator initialized");
            } else {
                console.warn("⚠️ Mug Calculator module not available");
            }

            // Initialize Auto Gym Switch
            console.log('💪 Sidekick: Initializing Auto Gym Switch...');
            if (window.SidekickModules.AutoGymSwitch?.init) {
                await window.SidekickModules.AutoGymSwitch.init();
                console.log('✅ Sidekick: Auto Gym Switch initialized');
            } else {
                console.warn('⚠️ Auto Gym Switch module not available');
            }


            // REMOVED: Vault Tracker Module
            // Vault Tracker has been removed from the extension

            // Initialize Price Filler Module
            console.log('🛒 Sidekick: Initializing Price Filler...');
            if (window.SidekickModules.PriceFiller?.init) {
                await window.SidekickModules.PriceFiller.init();
                console.log('✅ Sidekick: Price Filler initialized');
            } else {
                console.warn('⚠️ Price Filler module not available');
            }

            // Initialize Bazaar Filler Module
            console.log('🏪 Sidekick: Initializing Bazaar Filler...');
            if (window.SidekickModules.BazaarFiller?.init) {
                await window.SidekickModules.BazaarFiller.init();
                console.log('✅ Sidekick: Bazaar Filler initialized');
            } else {
                console.warn('⚠️ Bazaar Filler module not available');
            }

            // Initialize Auction Weapon Bonus Module
            console.log('🗡️ Sidekick: Initializing Auction Weapon Bonus...');
            if (window.SidekickModules.AuctionWeaponBonus?.init) {
                await window.SidekickModules.AuctionWeaponBonus.init();
                console.log('✅ Sidekick: Auction Weapon Bonus initialized');
            } else {
                console.warn('⚠️ Auction Weapon Bonus module not available');
            }

            // Initialize Mission Tracker Module
            console.log('🎯 Sidekick: Initializing Mission Tracker...');
            if (window.SidekickModules.MissionTracker?.init) {
                await window.SidekickModules.MissionTracker.init();
                console.log('✅ Sidekick: Mission Tracker initialized');
            } else {
                console.warn('⚠️ Mission Tracker module not available');
            }

            // Initialize Book Notifier Module
            console.log("📚 Sidekick: Initializing Book Notifier...");
            if (window.SidekickModules.BookNotifier?.init) {
                await window.SidekickModules.BookNotifier.init();
                console.log("✅ Sidekick: Book Notifier initialized");
            } else {
                console.warn("⚠️ Book Notifier module not available");
            }

            // Initialize Disposal Module
            console.log('🗑️ Sidekick: Initializing Disposal...');
            if (window.SidekickModules.Disposal?.init) {
                await window.SidekickModules.Disposal.init();
                console.log('✅ Sidekick: Disposal initialized');
            } else {
                console.warn('⚠️ Disposal module not available');
            }

            // Initialize Hide Crime Outcome Module
            console.log('🦹 Sidekick: Initializing Hide Crime Outcome...');
            if (window.SidekickModules.HideCrimeOutcome?.init) {
                await window.SidekickModules.HideCrimeOutcome.init();
                console.log('✅ Sidekick: Hide Crime Outcome initialized');
            } else {
                console.warn('⚠️ Hide Crime Outcome module not available');
            }

            // Initialize Burglary Module
            console.log('🏠 Sidekick: Initializing Burglary...');
            if (window.SidekickModules.Burglary?.init) {
                await window.SidekickModules.Burglary.init();
                console.log('✅ Sidekick: Burglary initialized');
            } else {
                console.warn('⚠️ Burglary module not available');
            }

            // Initialize Cracking Module
            console.log('💻 Sidekick: Initializing Cracking...');
            if (window.SidekickModules.Cracking?.init) {
                await window.SidekickModules.Cracking.init();
                console.log('✅ Sidekick: Cracking initialized');
            } else {
                console.warn('⚠️ Cracking module not available');
            }

            // Initialize Search for Cash Module
            console.log('🔍 Sidekick: Initializing Search for Cash...');
            if (window.SidekickModules.SearchForCash?.init) {
                await window.SidekickModules.SearchForCash.init();
                console.log('✅ Sidekick: Search for Cash initialized');
            } else {
                console.warn('⚠️ Search for Cash module not available');
            }


            // Initialize Egg Helper Module
            console.log('🎉 Sidekick: Initializing Egg Helper Module...');
            if (window.SidekickModules.Holiday?.init) {
                await window.SidekickModules.Holiday.init();
                console.log('✅ Sidekick: Egg Helper Module initialized');
            } else {
                console.warn('⚠️ Egg Helper Module not available');
            }

            // Initialize Special Gym Ratios Module
            console.log('🏋️ Sidekick: Initializing Special Gym Ratios...');
            if (window.SidekickModules.SpecialGymRatios?.init) {
                await window.SidekickModules.SpecialGymRatios.init();
                console.log('✅ Sidekick: Special Gym Ratios initialized');
            } else {
                console.warn('⚠️ Special Gym Ratios module not available');
            }

            // Initialize Player ID Linker Module
            console.log('🔗 Sidekick: Initializing Player ID Linker...');
            if (window.SidekickModules.PlayerIdLinker?.init) {
                await window.SidekickModules.PlayerIdLinker.init();
                console.log('✅ Sidekick: Player ID Linker initialized');
            } else {
                console.warn('⚠️ Player ID Linker module not available');
            }

            // Initialize Loadout Switcher Module
            console.log('👕 Sidekick: Initializing Loadout Switcher...');
            if (window.SidekickModules.LoadoutSwitcher?.init) {
                await window.SidekickModules.LoadoutSwitcher.init();
                console.log('✅ Sidekick: Loadout Switcher initialized');
            } else {
                console.warn('⚠️ Loadout Switcher module not available');
            }

            // Initialize Notion Bug Reporter Module
            console.log("🐛 Sidekick: Initializing Notion Bug Reporter...");
            if (window.SidekickModules.NotionBugReporter?.init) {
                await window.SidekickModules.NotionBugReporter.init();
                console.log("✅ Sidekick: Notion Bug Reporter initialized");
            } else {
                console.warn("⚠️ Notion Bug Reporter module not available");
            }

            // UI and modules initialized successfully
            console.log("🎉 Sidekick Chrome Extension initialization complete!");

            // Expose global helper functions for testing
            exposeGlobalHelpers();

            // Test multiple exposure methods for Chrome extension content script environment
            console.log('🧪 Testing multiple global function exposure methods:');

            // Method 1: Standard window assignment (already done above)
            console.log('🔧 Method 1: Standard window assignment complete');

            // Method 2: Direct window property assignment (CSP-compliant)
            // These functions are already exposed via exposeGlobalHelpers() above
            console.log('🔧 Method 2: Using direct window property assignment (CSP-compliant)');

            // Method 3: Verify accessibility
            setTimeout(() => {
                console.log('🧪 Testing function accessibility after injection:');
                try {
                    if (typeof window.testExtensionConnection === 'function') {
                        console.log('✅ testExtensionConnection is accessible');
                        // Test the function
                        try {
                            const result = window.testExtensionConnection();
                            console.log('✅ Function call successful:', result);
                        } catch (e) {
                            console.warn('⚠️ Function call failed:', e.message);
                        }
                    } else {
                        console.error('❌ testExtensionConnection still not accessible');
                    }
                } catch (e) {
                    console.error('❌ Error during accessibility test:', e.message);
                }
            }, 200);

            // Set up message listener for popup communications
            setupMessageListener();

        } catch (error) {
            console.error("❌ Sidekick initialization failed:", error);
            // Fallback: create simple hamburger button
            createFallbackButton();
        }
    }

    // Expose global helper functions for debugging and testing
    function exposeGlobalHelpers() {
        // Extension connectivity tests
        window.testExtensionConnection = function () {
            if (window.SidekickModules?.Core?.SafeMessageSender?.testExtensionConnection) {
                return window.SidekickModules.Core.SafeMessageSender.testExtensionConnection();
            } else {
                console.error('❌ SafeMessageSender not available');
                return false;
            }
        };

        window.checkExtensionContext = function () {
            if (window.SidekickModules?.Core?.SafeMessageSender?.isExtensionContextValid) {
                const isValid = window.SidekickModules.Core.SafeMessageSender.isExtensionContextValid();
                console.log(`🔍 Extension context valid: ${isValid}`);
                return isValid;
            } else {
                console.error('❌ SafeMessageSender not available');
                return false;
            }
        };

        window.forceContextRecovery = function () {
            if (window.SidekickModules?.Core?.SafeMessageSender?.attemptContextRecovery) {
                return window.SidekickModules.Core.SafeMessageSender.attemptContextRecovery();
            } else {
                console.error('❌ SafeMessageSender not available');
                return false;
            }
        };

        // Debug shortcut for daily tasks
        window.testDailyTasks = function () {
            if (window.SidekickModules?.TodoList) {
                console.log('📋 Available TodoList debug functions:', {
                    debugTodoList: typeof window.debugTodoList,
                    debugNerveRefillLogs: typeof window.debugNerveRefillLogs,
                    debugEnergyRefillLogs: typeof window.debugEnergyRefillLogs,
                    debugXanaxLogs: typeof window.debugXanaxLogs
                });

                if (typeof window.debugTodoList === 'function') {
                    return window.debugTodoList();
                }
            }
            console.error('❌ TodoList module or debug functions not available');
            return false;
        };

        // Also expose functions globally without window prefix for easier access
        try {
            globalThis.testExtensionConnection = window.testExtensionConnection;
            globalThis.checkExtensionContext = window.checkExtensionContext;
            globalThis.forceContextRecovery = window.forceContextRecovery;
            globalThis.testDailyTasks = window.testDailyTasks;

            console.log('✅ Functions exposed to global scope');
        } catch (e) {
            console.warn('⚠️ Could not expose to global scope:', e.message);
        }

        // Verify functions are properly attached
        console.log('🔧 Global helper functions exposed:');
        console.log('  - testExtensionConnection():', typeof window.testExtensionConnection);
        console.log('  - checkExtensionContext():', typeof window.checkExtensionContext);
        console.log('  - forceContextRecovery():', typeof window.forceContextRecovery);
        console.log('  - testDailyTasks():', typeof window.testDailyTasks);

        // Also expose them as properties of window explicitly
        try {
            Object.defineProperty(window, 'testExtensionConnection', {
                value: window.testExtensionConnection,
                writable: false,
                configurable: false
            });
            Object.defineProperty(window, 'checkExtensionContext', {
                value: window.checkExtensionContext,
                writable: false,
                configurable: false
            });
            Object.defineProperty(window, 'forceContextRecovery', {
                value: window.forceContextRecovery,
                writable: false,
                configurable: false
            });
            Object.defineProperty(window, 'testDailyTasks', {
                value: window.testDailyTasks,
                writable: false,
                configurable: false
            });
            console.log('✅ Global functions secured with defineProperty');
        } catch (e) {
            console.warn('⚠️ Could not secure global functions:', e.message);
        }
    }

    // Set up message listener for popup communications
    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log('📨 Received message:', request);

            if (request.action === 'openSettings') {
                handleOpenSettings(sendResponse);
                return true;
            }

            if (request.action === 'toggleModule') {
                handleModuleToggle(request.moduleType, request.enabled, sendResponse);
                return true; // Keep message channel open for async response
            }

            // Legacy support for old action name
            if (request.action === 'toggleAttackButtonMover') {
                handleModuleToggle('attackButtonMover', request.enabled, sendResponse);
                return true;
            }

            if (request.action === 'settingsUpdated') {
                handleSettingsUpdate(request.settings);
                sendResponse({ success: true });
            }

            if (request.action === 'reloadXanaxViewer') {
                handleReloadXanaxViewer(sendResponse);
                return true;
            }

            if (request.action === 'emitNotification') {
                // Handle notification emission from popup
                if (window.NotificationCenter && request.notification) {
                    console.log('📬 Emitting notification from popup:', request.notification);
                    NotificationCenter.emit(request.notification);
                    sendResponse({ success: true });
                } else {
                    console.warn('⚠️ NotificationCenter not available or no notification data');
                    sendResponse({ success: false });
                }
                return true;
            }

            if (request.action === 'reloadChainTimer') {
                handleReloadChainTimer(sendResponse);
                return true;
            }

            if (request.action === 'dataCleared') {
                handleDataCleared();
                sendResponse({ success: true });
            }

            if (request.action === 'openBugReporter') {
                handleOpenBugReporter(sendResponse);
                return true; // Keep message channel open for async response
            }

            if (request.action === 'toggleTrainingBlocker') {
                handleToggleTrainingBlocker(request.enabled, sendResponse);
                return true; // Keep message channel open for async response
            }



            // Handle module settings update from popup
            if (request.action === 'updateModuleSettings') {
                console.log(`⚙️ Module settings updated for ${request.moduleId}`, request.settings);
                // Reload the page to apply module changes
                setTimeout(() => {
                    window.location.reload();
                }, 100);
                sendResponse({ success: true });
                return true;
            }
        });
    }

    // Handle module toggle from popup
    async function handleModuleToggle(moduleType, enabled, sendResponse) {
        try {
            let module;
            let displayName;

            switch (moduleType) {
                case 'xanaxViewer':
                    module = window.SidekickModules?.XanaxViewer;
                    displayName = 'Xanax Viewer';
                    break;
                case 'attackButtonMover':
                    module = window.SidekickModules?.AttackButtonMover;
                    displayName = 'Attack Button Mover';
                    break;
                case 'blockTraining':
                    module = window.SidekickModules?.BlockTraining;
                    displayName = 'Block Training';
                    break;
                case 'timeOnTab':
                    module = window.SidekickModules?.TimeOnTab;
                    displayName = 'Time on Tab';
                    break;
                case 'npcAttackTimer':
                    module = window.SidekickModules?.NPCAttackTimer;
                    displayName = 'NPC Attack Timer';
                    break;
                case 'randomTarget':
                    module = window.SidekickModules?.RandomTarget;
                    displayName = 'Random Target';
                    break;
                case 'chainTimer':
                    module = window.SidekickModules?.ChainTimer;
                    displayName = 'Chain Timer';
                    break;
                case 'statsTracker':
                    module = window.SidekickModules?.StatsTracker;
                    displayName = 'Stats Tracker';
                    break;
                default:
                    console.warn('⚠️ Unknown module type:', moduleType);
                    sendResponse({ success: false, error: 'Unknown module type' });
                    return;
            }

            if (module) {
                const newState = await module.toggle();
                console.log(`⚙️ ${displayName} toggled:`, newState);
                sendResponse({ success: true, enabled: newState });
            } else {
                console.warn(`⚠️ ${displayName} module not available`);
                sendResponse({ success: false, error: 'Module not available' });
            }
        } catch (error) {
            console.error(`❌ Failed to toggle ${moduleType}:`, error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Handle settings update from popup
    function handleSettingsUpdate(settings) {
        console.log('⚙️ Settings updated:', settings);
        // Modules will automatically pick up new settings on next operation
    }

    // Handle Xanax Viewer reload from popup
    async function handleReloadXanaxViewer(sendResponse) {
        try {
            const module = window.SidekickModules?.XanaxViewer;
            if (module) {
                console.log('💊 Reloading Xanax Viewer settings...');

                // Reload settings
                await module.loadSettings();

                // If enabled, restart the viewer
                if (module.isEnabled) {
                    module.stopXanaxViewer();
                    await module.startXanaxViewer();
                }

                console.log('✅ Xanax Viewer reloaded successfully');
                sendResponse({ success: true });
            } else {
                console.warn('⚠️ Xanax Viewer module not available');
                sendResponse({ success: false, error: 'Module not available' });
            }
        } catch (error) {
            console.error('❌ Failed to reload Xanax Viewer:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Handle Chain Timer reload from popup
    async function handleReloadChainTimer(sendResponse) {
        try {
            const module = window.SidekickModules?.ChainTimer;
            if (module) {
                console.log('⏱️ Reloading Chain Timer settings...');

                // Reload settings
                await module.loadSettings();

                // If enabled, restart the timer
                if (module.isEnabled) {
                    module.stopMonitoring();
                    module.startMonitoring();
                }

                console.log('✅ Chain Timer reloaded successfully');
                sendResponse({ success: true });
            } else {
                console.warn('⚠️ Chain Timer module not available');
                sendResponse({ success: false, error: 'Module not available' });
            }
        } catch (error) {
            console.error('❌ Failed to reload Chain Timer:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Handle data cleared from popup
    function handleDataCleared() {
        console.log('🗑️ Data cleared, reloading page...');
        // Reload page to reset everything
        window.location.reload();
    }

    // Handle opening bug reporter from popup
    function handleOpenBugReporter(sendResponse) {
        try {
            if (window.SidekickModules?.NotionBugReporter?.openReporter) {
                window.SidekickModules.NotionBugReporter.openReporter();
                sendResponse({ success: true });
            } else {
                console.warn('⚠️ Bug reporter not available');
                sendResponse({ success: false, error: 'Bug reporter not available' });
            }
        } catch (error) {
            console.error('❌ Failed to open bug reporter:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async function handleToggleTrainingBlocker(enabled, sendResponse) {
        try {
            if (window.SidekickModules?.BlockTraining) {
                window.SidekickModules.BlockTraining.isBlocked = enabled;
                await window.SidekickModules.BlockTraining.saveSettings();

                if (enabled) {
                    window.SidekickModules.BlockTraining.startBlocking();
                } else {
                    window.SidekickModules.BlockTraining.stopBlocking();
                }

                sendResponse({ success: true });
            } else {
                console.warn('⚠️ Block Training module not available');
                sendResponse({ success: false, error: 'Block Training module not available' });
            }
        } catch (error) {
            console.error('❌ Failed to toggle training blocker:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Handle opening settings panel
    function handleOpenSettings(sendResponse) {
        try {
            if (window.SidekickModules?.Settings?.createSettingsPanel) {
                window.SidekickModules.Settings.createSettingsPanel();
                sendResponse({ success: true });
            } else {
                console.warn('⚠️ Settings module not available');
                sendResponse({ success: false, error: 'Settings module not available' });
            }
        } catch (error) {
            console.error('❌ Failed to open settings:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    // Fallback function to create hamburger button if modules fail
    function createFallbackButton() {
        console.log("🔧 Creating fallback hamburger button...");

        const button = document.createElement('button');
        button.id = 'sidekick-hamburger-fallback';
        button.style.cssText = `
            position: fixed !important;
            top: 10px !important;
            right: 10px !important;
            z-index: 10000 !important;
            width: 40px !important;
            height: 40px !important;
            background: #FF6B6B !important;
            color: white !important;
            border: none !important;
            border-radius: 5px !important;
            cursor: pointer !important;
            font-size: 20px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
        `;
        button.textContent = '☰';
        button.title = 'Sidekick (Fallback Mode)';

        button.addEventListener('click', () => {
            alert('Sidekick is running in fallback mode. Check console for errors.');
        });

        document.body.appendChild(button);
        console.log("✅ Fallback button created");
    }

    // Enhanced startup sequence
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeSidekick);
    } else {
        // DOM already ready, start immediately
        setTimeout(initializeSidekick, 100);
    }

})();
