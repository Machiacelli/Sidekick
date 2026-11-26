/**
 * Book Planner Module
 * Adds a "Plan Book" button on Torn book item pages that opens a planning
 * window showing whether the user meets the guide's recommended thresholds
 * for using the book, and what items they have on hand to maximize it.
 *
 * Uses Torn API v2 (battlestats + inventory) via the background proxyFetch
 * so the API key is never exposed in the page.
 *
 * Version: 1.0.0
 */

(function () {
    'use strict';

    if (!window.SidekickModules) {
        window.SidekickModules = {};
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BOOK DATABASE (seed — one easy example, extendable)
    // Each entry matches a Torn book by name (case-insensitive).
    // ═══════════════════════════════════════════════════════════════════════════

    const BOOKS = {
        'brawn over brains': {
            name: 'Brawn Over Brains',
            effect: 'Permanently increases Strength by 5% (up to 200,000,000 maximum gain) after 31 days.',
            statKey: 'strength',
            statLabel: 'Strength',
            statIcon: '💪',
            threshold: 200000000,
            thresholdLabel: '200,000,000',
            cap: 200000000,
            capLabel: '200,000,000',
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            hideVerdict: true,
        },
        'time is in the mind': {
            name: 'Time Is In The Mind',
            effect: 'Permanently increases Speed by 5% (up to 200,000,000 maximum gain) after 31 days.',
            statKey: 'speed',
            statLabel: 'Speed',
            statIcon: '🏃',
            threshold: 200000000,
            thresholdLabel: '200,000,000',
            cap: 200000000,
            capLabel: '200,000,000',
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            hideVerdict: true,
        },
        'keeping your face handsome': {
            name: 'Keeping Your Face Handsome',
            effect: 'Permanently increases Defense by 5% (up to 200,000,000 maximum gain) after 31 days.',
            statKey: 'defense',
            statLabel: 'Defense',
            statIcon: '🛡️',
            threshold: 200000000,
            thresholdLabel: '200,000,000',
            cap: 200000000,
            capLabel: '200,000,000',
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            hideVerdict: true,
        },
        'a job for your hands': {
            name: 'A Job For Your Hands',
            effect: 'Permanently increases Dexterity by 5% (up to 200,000,000 maximum gain) after 31 days.',
            statKey: 'dexterity',
            statLabel: 'Dexterity',
            statIcon: '✌️',
            threshold: 200000000,
            thresholdLabel: '200,000,000',
            cap: 200000000,
            capLabel: '200,000,000',
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            hideVerdict: true,
        },
        'working 9 til 5': {
            name: 'Working 9 Til 5',
            effect: 'Increases all working stats by 5% (up to 2,500 maximum gain each) upon completion.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: 2500,
            capLabel: '2,500',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsWorkstats: true,
        },
'making friends enemies and cakes': {
            name: 'Making Friends, Enemies, And Cakes',
            effect: 'Increases friends list, enemies list & targets list capacity by +100 upon completion.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
'high school for adults': {
            name: 'High School For Adults',
            effect: 'Provides a free merit reset upon completion.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'milk yourself sober': {
            name: 'Milk Yourself Sober',
            effect: 'Removes a substantial amount of drug addiction upon completion.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
            ],
            helperNote: 'No plan needed',
            durationDays: 31,
            needsDrugInventory: true,
        },
        'fight like an asshole': {
            name: 'Fight Like An Asshole',
            effect: 'Provides a passive 25% bonus to all battle stats for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'mind over matter': {
            name: 'Mind Over Matter',
effect: 'Provides a passive 100% bonus to Strength for 31 days.',
            statKey: 'strength',
            statLabel: 'Strength',
            statIcon: '💪',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'no shame no pain': {
            name: 'No Shame No Pain',
            effect: 'Provides a passive 100% bonus to Defense for 31 days.',
            statKey: 'defense',
            statLabel: 'Defense',
            statIcon: '🛡️',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'run like the wind': {
            name: 'Run Like The Wind',
            effect: 'Provides a passive 100% bonus to Speed for 31 days.',
            statKey: 'speed',
            statLabel: 'Speed',
            statIcon: '🏃',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'weaseling out of trouble': {
            name: 'Weaseling Out Of Trouble',
effect: 'Provides a passive 100% bonus to Dexterity for 31 days.',
            statKey: 'dexterity',
            statLabel: 'Dexterity',
            statIcon: '✌️',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'get hard or go home': {
            name: 'Get Hard Or Go Home',
            effect: 'Increases all gym gains by 20% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
                { name: 'Feathery Hotel Coupon', count: 120 },
            ],
            helperNote: '',
            durationDays: 31,
            needsDrugInventory: true,
            needsCompanyCheck: true,
        },
        'gym grunting shouting to success': {
            name: 'Gym Grunting - Shouting To Success',
            effect: 'Increases Strength gym gains by 30% for 31 days.',
            statKey: 'strength',
            statLabel: 'Strength',
            statIcon: '💪',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
                { name: 'Feathery Hotel Coupon', count: 120 },
            ],
            helperNote: '',
            durationDays: 31,
            needsDrugInventory: true,
            needsCompanyCheck: true,
            needsBoosterCooldown: true,
        },
        'self defense in the workplace': {
            name: 'Self Defense In The Workplace',
            effect: 'Increases Defense gym gains by 30% for 31 days.',
            statKey: 'defense',
            statLabel: 'Defense',
            statIcon: '🛡️',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
                { name: 'Feathery Hotel Coupon', count: 120 },
            ],
            helperNote: '',
            durationDays: 31,
            needsCompanyCheck: true,
            needsBoosterCooldown: true,
        },
        'speed 3 the rejected script': {
            name: 'Speed 3 - The Rejected Script',
            effect: 'Increases Speed gym gains by 30% for 31 days.',
            statKey: 'speed',
            statLabel: 'Speed',
            statIcon: '🏃',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
                { name: 'Feathery Hotel Coupon', count: 120 },
            ],
            helperNote: '',
            durationDays: 31,
            needsDrugInventory: true,
            needsCompanyCheck: true,
        },
        'limbo lovers 101': {
            name: 'Limbo Lovers 101',
            effect: 'Increases Dexterity gym gains by 30% for 31 days.',
            statKey: 'dexterity',
            statLabel: 'Dexterity',
            statIcon: '✌️',
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
                { name: 'Feathery Hotel Coupon', count: 120 },
            ],
            helperNote: '',
            durationDays: 31,
            needsDrugInventory: true,
            needsCompanyCheck: true,
        },
        'the hamburglar\'s guide to crime': {
            name: 'The Hamburglar\'s Guide To Crime',
            effect: 'Increases crime skill & crime experience gain by 25% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
'what are old folk good for anyway': {
            name: 'What Are Old Folk Good For Anyway?',
            effect: 'Increases leveling EXP gains by 25% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'medical degree schmedical degree': {
            name: 'Medical Degree Schmedical Degree',
            effect: 'Reduces all hospital time by 50% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'no more soap on a rope': {
            name: 'No More Soap On A Rope',
            effect: 'Reduces all jail time by 50% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'mailing yourself abroad': {
            name: 'Mailing Yourself Abroad',
            effect: 'Reduces all travel times by 25% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'smuggling for beginners': {
            name: 'Smuggling For Beginners',
            effect: 'Increases travel capacity by +10 for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
        },
        'smuggling for beginners': {
            name: 'Smuggling For Beginners',
            effect: 'Increases travel capacity by +10 for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsCompanyCheck: true,
            companyBonusTypes: ['travel_items'],
            companyTypeIds: [32, 15],
        },
        'stealthy stealing of underwear': {
            name: 'Stealthy Stealing of Underwear',
            effect: 'Maximum stealth for the next 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'shawshank sure ain\'t for me': {
            name: 'Shawshank Sure Ain\'t For Me!',
            effect: 'Large jail bust & escape boost for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'ignorance is bliss': {
            name: 'Ignorance Is Bliss',
            effect: 'Happiness can regenerate above maximum for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: 50000000,
            capLabel: '50,000,000',
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsCapCheck: true,
        },
'winking to win': {
            name: 'Winking To Win',
            effect: 'Doubles contract credit and money rewards for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
'finders keepers': {
            name: 'Finders Keepers',
            effect: 'Increases awareness by 2500% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'higher daddy higher': {
            name: 'Higher Daddy, Higher!',
            effect: 'Provides +20% energy regeneration for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
helperNote: 'No plan needed',
            durationDays: 31,
        },
'the real dutch courage': {
            name: 'The Real Dutch Courage',
            effect: 'Doubles nerve regeneration for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsCompanyCheck: true,
            companyBonusTypes: ['item_boost'],
            companyTypeIds: [25],
        },
        'because im happy the pharrell story': {
            name: "Because I'm Happy - The Pharrell Story",
            effect: 'Doubles happiness regeneration for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsCapCheck: true,
        },
        'no more sick days': {
            name: 'No More Sick Days',
            effect: 'Doubles life regeneration for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'duke my story': {
            name: 'Duke - My Story',
            effect: 'Duke will occasionally retaliate against your attackers for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'self control is for losers': {
            name: 'Self Control Is For Losers',
            effect: 'Reduces all consumable cooldowns by 50% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            tabs: [
                {
                    label: 'Energy',
                    helperItems: [
                        { name: 'Energy Can', count: null, calcType: 'booster_cans' },
                    ],
                },
                {
                    label: 'Nerve',
                    helperItems: [
                        { name: 'Bottle of Beer', count: null, calcType: 'booster_cans' },
                    ],
                },
            ],
        },
        'hot turkey': {
            name: 'Hot Turkey',
            effect: 'Gain no drug addiction for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Xanax', count: null, calcType: 'drug_pills' },
            ],
            helperNote: '',
            durationDays: 31,
            needsDrugCooldown: true,
        },
        'going back for more': {
            name: 'Going Back For More',
            effect: 'Reduces all medical cooldowns by 50% for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'get drunk and lose dignity': {
            name: 'Get Drunk And Lose Dignity',
            effect: 'Doubles alcohol effects for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsBoosterCooldown: true,
            needsCompanyCheck: true,
            companyBonusTypes: ['item_boost'],
            companyTypeIds: [25],
            tabs: [
                {
                    label: 'Nerve',
                    helperItems: [
                        { name: 'Bottle of Beer', count: null, calcType: 'booster_cans' },
                    ],
                },
            ],
        },
        'fuelling your way to failure': {
            name: 'Fuelling Your Way To Failure',
            effect: 'Doubles energy drink effects for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsBoosterCooldown: true,
            tabs: [
                {
                    label: 'Energy',
                    helperItems: [
                        { name: 'Energy Can', count: null, calcType: 'booster_cans' },
                    ],
                },
            ],
        },
        'yes please diabetes': {
            name: 'Yes Please Diabetes',
            effect: 'Doubles candy effects for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: '',
            durationDays: 31,
            needsCapCheck: true,
        },
        'ugly energy': {
            name: 'Ugly Energy',
            effect: 'Increases maximum energy (including energy refills) to 250 for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [
                { name: 'Feathery Hotel Coupon', count: 124 },
            ],
            helperNote: '',
            durationDays: 31,
            needsBoosterCooldown: true,
        },
'memories and mammaries': {
            name: 'Memories And Mammaries',
            effect: 'Takes the same effect from the last used book for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'brown-nosing the boss': {
            name: 'Brown-nosing The Boss',
effect: 'Greatly increases personal employee effectiveness for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
        'running away from trouble': {
            name: 'Running Away From Trouble',
            effect: 'Guaranteed attacking escape attempt success for 31 days.',
            statKey: null,
            statLabel: null,
            statIcon: null,
            threshold: null,
            thresholdLabel: null,
            cap: null,
            capLabel: null,
            reason: '',
            helperItems: [],
            helperNote: 'No plan needed',
            durationDays: 31,
        },
    };

    // Map Torn item IDs to book keys (for URL-based lookup on item.php?id=XXX)
    const ITEM_ID_TO_BOOK_KEY = {
        744: 'brawn over brains',
        745: 'time is in the mind',
        746: 'keeping your face handsome',
        747: 'a job for your hands',
        748: 'working 9 til 5',
        749: 'making friends enemies and cakes',
        750: 'high school for adults',
        751: 'milk yourself sober',
        752: 'fight like an asshole',
        753: 'mind over matter',
        754: 'no shame no pain',
        755: 'run like the wind',
        756: 'weaseling out of trouble',
        757: 'get hard or go home',
        758: 'gym grunting shouting to success',
        759: 'self defense in the workplace',
        760: 'speed 3 the rejected script',
        761: 'limbo lovers 101',
        762: 'the hamburglar\'s guide to crime',
        763: 'what are old folk good for anyway',
        764: 'medical degree schmedical degree',
        765: 'no more soap on a rope',
        766: 'mailing yourself abroad',
        767: 'smuggling for beginners',
        768: 'stealthy stealing of underwear',
        769: 'shawshank sure ain\'t for me',
        770: 'ignorance is bliss',
        771: 'winking to win',
        772: 'finders keepers',
        773: 'hot turkey',
        774: 'higher daddy higher',
        775: 'the real dutch courage',
        776: 'because im happy the pharrell story',
        777: 'no more sick days',
        779: 'self control is for losers',
        780: 'going back for more',
        781: 'get drunk and lose dignity',
        782: 'fuelling your way to failure',
        783: 'yes please diabetes',
        784: 'ugly energy',
        785: 'memories and mammaries',
        786: 'brown-nosing the boss',
        787: 'running away from trouble',
    };

    const ENERGY_DRINKS_BY_ID = {
        530: { name: 'Can of Munster', baseEnergy: 20 },
        532: { name: 'Can of Red Cow', baseEnergy: 25 },
        533: { name: 'Can of Taurine Elite', baseEnergy: 30 },
        553: { name: 'Can of Santa Shooters', baseEnergy: 20 },
        554: { name: 'Can of Rockstar Rudolph', baseEnergy: 25 },
        555: { name: 'Can of X-MASS', baseEnergy: 30 },
        985: { name: 'Can of Goose Juice', baseEnergy: 5 },
        986: { name: 'Can of Damp Valley', baseEnergy: 10 },
        987: { name: 'Can of Crocozade', baseEnergy: 15 },
    };

    const ENERGY_DRINKS_BY_NAME = {
        'can of crocozade': 15,
        'can of damp valley': 10,
        'can of munster': 20,
        'can of red cow': 25,
        'can of rockstar rudolph': 25,
        'can of santa shooters': 20,
        'can of taurine elite': 30,
        'can of x-mass': 30,
        'can of goose juice': 5,
        'energy can': 50,
        'energy drink': 25,
        'taurine': 100,
    };

    const ALL_ENERGY_DRINK_NAMES = Object.values(ENERGY_DRINKS_BY_ID).map(d => d.name);

    const ALCOHOLS_BY_ID = {
        180: { name: 'Bottle of Beer', baseNerve: 1 },
        181: { name: 'Bottle of Champagne', baseNerve: 1 },
        294: { name: 'Bottle of Sake', baseNerve: 1 },
        426: { name: 'Bottle of Tequila', baseNerve: 1 },
        531: { name: 'Bottle of Pumpkin Brew', baseNerve: 2 },
        541: { name: 'Bottle of Stinky Swamp Punch', baseNerve: 4 },
        542: { name: 'Bottle of Wicked Witch', baseNerve: 3 },
        550: { name: 'Bottle of Kandy Kane', baseNerve: 2 },
        551: { name: 'Bottle of Minty Mayhem', baseNerve: 3 },
        552: { name: 'Bottle of Mistletoe Madness', baseNerve: 4 },
        638: { name: 'Bottle of Christmas Cocktail', baseNerve: 3 },
        816: { name: 'Glass of Beer', baseNerve: 2 },
        873: { name: 'Bottle of Green Stout', baseNerve: 5 },
        924: { name: 'Bottle of Christmas Spirit', baseNerve: 5 },
        984: { name: 'Bottle of Moonshine', baseNerve: 5 },
    };

    const ALCOHOLS_BY_NAME = {
        'bottle of beer': 1,
        'bottle of champagne': 1,
        'bottle of sake': 1,
        'bottle of tequila': 1,
        'bottle of pumpkin brew': 2,
        'bottle of stinky swamp punch': 4,
        'bottle of wicked witch': 3,
        'bottle of kandy kane': 2,
        'bottle of minty mayhem': 3,
        'bottle of mistletoe madness': 4,
        'bottle of christmas cocktail': 3,
        'glass of beer': 2,
        'bottle of green stout': 5,
        'bottle of christmas spirit': 5,
        'bottle of moonshine': 5,
    };

const ALL_ALCOHOL_NAMES = Object.values(ALCOHOLS_BY_ID).map(d => d.name);

// ════════════════════════════════════════════════════════════════════════════════
// COMPANY BONUS REGISTRY (smart — no per-book config needed)
// Keyed by Torn company type ID. Each star defines bonuses that apply
// automatically to any tab whose type matches the bonus target.
//   type: 'cooldown_reduction' → reduces base cooldown hours (energy/nerve tabs)
//   type: 'item_boost'         → multiplies item effect (nerve per bottle, energy per can)
//   target: 'all' | 'energy' | 'alcohol' → which tab type this bonus applies to
// ════════════════════════════════════════════════════════════════════════════════

const COMPANY_BONUSES = {
    15: { // Cruise Line
        name: 'Cruise Line',
        stars: {
            10: [{ type: 'travel_items', count: 3 }],
            3: [{ type: 'travel_items', count: 2 }],
        },
    },
    12: { // Grocery Store
        name: 'Grocery Store',
        stars: {
            3: [{ type: 'cooldown_reduction', target: 'all', percent: 10 }],
            7: [{ type: 'item_boost', target: 'all', percent: 10 }],
        },
    },
    25: { // Pub
        name: 'Pub',
        stars: {
            7: [{ type: 'item_boost', target: 'alcohol', percent: 50 }],
        },
    },
    27: { // Restaurant
        name: 'Restaurant',
        stars: {
            10: [{ type: 'cooldown_reduction', target: 'all', percent: 25 }],
        },
    },
    38: { // Mining Corporation
        name: 'Mining Corporation',
        stars: {
            3: [{ type: 'cooldown_reduction', target: 'alcohol', percent: 30 }],
        },
    },
    36: { // Ladies Strip Club
        name: 'Ladies Strip Club',
        stars: {
            7: [{ type: 'gym_gain_boost', target: 'defense', percent: 10 }],
        },
    },
    26: { // Gents Strip Club
        name: 'Gents Strip Club',
        stars: {
            7: [{ type: 'gym_gain_boost', target: 'dexterity', percent: 10 }],
        },
    },
    29: { // Fitness Center
        name: 'Fitness Center',
        stars: {
            10: [{ type: 'gym_gain_boost', target: 'speed', percent: 3 }, { type: 'gym_gain_boost', target: 'strength', percent: 3 }],
        },
    },
    32: { // Lingerie Store
        name: 'Lingerie Store',
        stars: {
            3: [{ type: 'travel_items', count: 2 }],
        },
    },
};

const STORAGE_KEY = 'book-planner';
    const SELECTIONS_KEY = 'book-planner-selections';
    const ICON_ID = 'sk-book-planner-btn';
    const MODAL_ID = 'sk-book-planner-modal';
    const STYLES_ID = 'sk-book-planner-styles';

    const BookPlannerModule = {
        name: 'Book Planner',
        version: '1.0.0',
        isEnabled: true,

        observer: null,

        _injectedPanels: new Set(),
        _scanInterval: null,

        // Inventory cache (shared across all book opens within TTL)
        _inventoryCache: null,
        _drugInventoryCache: null,
        _displayCaseCache: null,
        _displayCaseLogged: false,
        _cacheTtlMs: 2 * 60 * 1000,

        // User's can/alcohol choice per book: { [bookKey]: { can, alcohol } }
        _selections: {},
        _selectionsLoaded: false,

        // ═════════════════════════════════════════════════════════════════════════
        // Init
        // ════════════════════════════════════════════════════════════════════════

        async init() {
            console.log('📖 Book Planner: initializing...');
            await this.loadSettings();
            this.isEnabled = true; // always on

            this.injectStyles();
            this.startObserver();

            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'local' && changes.sidekick_settings) {
                    this.loadSettings().then(() => {
                        this.removeButton();
                        this.removeModal();
                    });
                }
            });

            console.log('✅ Book Planner initialized');
        },

        // ════════════════════════════════════════════════════════════════════════
        // Settings
        // ════════════════════════════════════════════════════════════════════════

        async loadSettings() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings');
                if (data && data[STORAGE_KEY]) {
                    this.isEnabled = data[STORAGE_KEY].isEnabled || false;
                }
            } catch (e) {
                console.error('📖 Book Planner: failed to load settings:', e);
            }
        },

        async saveSettings() {
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('sidekick_settings') || {};
                data[STORAGE_KEY] = { isEnabled: this.isEnabled };
                await window.SidekickModules.Core.ChromeStorage.set('sidekick_settings', data);
            } catch (e) {
                console.error('📖 Book Planner: failed to save settings:', e);
            }
        },

        async toggle() {
            this.isEnabled = !this.isEnabled;
            await this.saveSettings();
            if (this.isEnabled) {
                this.startObserver();
            } else {
                this.stopObserver();
                this.removeButton();
                this.removeModal();
            }
            return this.isEnabled;
        },

        enable() {
            this.isEnabled = true;
            this.saveSettings();
            this.startObserver();
        },

        disable() {
            this.isEnabled = false;
            this.saveSettings();
            this.stopObserver();
            this.removeButton();
            this.removeModal();
        },

        // ════════════════════════════════════════════════════════════════════════
        // ── Per-book user selections (can / alcohol / tab) ──────────────────────
        // Persisted so the Plan Book modal reopens with the same choices and
        // the Book Item Tracker window reflects the path the user picked.

        async loadSelections() {
            if (this._selectionsLoaded) return;
            try {
                const data = await window.SidekickModules.Core.ChromeStorage.get('book-planner-selections');
                if (data && typeof data === 'object') this._selections = data;
            } catch (e) {
                console.warn('📖 Book Planner: failed to load selections:', e);
            }
            this._selectionsLoaded = true;
        },

        async saveSelection(bookKey, type, value) {
            if (!bookKey || !value) return;
            this._selections[bookKey] = { ...(this._selections[bookKey] || {}), [type]: value };
            try {
                await window.SidekickModules.Core.ChromeStorage.set('book-planner-selections', this._selections);
            } catch (e) {
                console.warn('📖 Book Planner: failed to save selection:', e);
            }
        },

        // API helpers
        // ════════════════════════════════════════════════════════════════════════

        async getApiKey() {
            console.log('📖 Book Planner: getApiKey() called');
            console.log('📖 Book Planner: Settings module available:', !!window.SidekickModules?.Settings);
            console.log('📖 Book Planner: Core module available:', !!window.SidekickModules?.Core);
            console.log('📖 Book Planner: Core.ChromeStorage available:', !!window.SidekickModules?.Core?.ChromeStorage);
            console.log('📖 Book Planner: chrome.runtime.id:', chrome?.runtime?.id);

            // Use the same retry pattern as Debt module — Settings may not be ready yet
            let attempts = 0;
            const maxAttempts = 20;
            while (attempts < maxAttempts) {
                try {
                    if (window.SidekickModules?.Settings?.getApiKey) {
                        const key = await window.SidekickModules.Settings.getApiKey();
                        console.log(`📖 Book Planner: Settings.getApiKey() attempt ${attempts + 1} returned:`, key ? 'KEY FOUND' : 'empty');
                        if (key) {
                            console.log('📖 Book Planner: API key found via Settings module');
                            return key;
                        }
                    } else {
                        console.log(`📖 Book Planner: Settings.getApiKey not available, attempt ${attempts + 1}`);
                    }
                } catch (e) {
                    console.warn('📖 Book Planner: Settings.getApiKey error:', e);
                }
                attempts++;
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
            }

            // Fallback: direct Core.ChromeStorage
            try {
                if (window.SidekickModules?.Core?.ChromeStorage) {
                    const key = await window.SidekickModules.Core.ChromeStorage.get('sidekick_api_key');
                    console.log('📖 Book Planner: Core.ChromeStorage.get returned:', key ? 'KEY FOUND' : 'empty');
                    if (key) {
                        console.log('📖 Book Planner: API key found via Core.ChromeStorage');
                        return key;
                    }
                }
            } catch (e) {
                console.warn('📖 Book Planner: Core.ChromeStorage error:', e);
            }

            // Fallback: direct chrome.storage.local at top level (not inside sidekick_settings)
            try {
                const result = await chrome.storage.local.get('sidekick_api_key');
                console.log('📖 Book Planner: chrome.storage.local.get returned:', result);
                if (result && result.sidekick_api_key) {
                    console.log('📖 Book Planner: API key found via chrome.storage.local');
                    return result.sidekick_api_key;
                }
            } catch (e) {
                console.warn('📖 Book Planner: chrome.storage.local error:', e);
            }

            console.warn('📖 Book Planner: No API key found in any storage location');
            return '';
        },

        async fetchData(url, headers = {}) {
            try {
                const response = await chrome.runtime.sendMessage({
                    action: 'proxyFetch',
                    url,
                    headers: { 'Accept': 'application/json', ...headers }
                });
                if (response && response.success) return response.data;
                throw new Error(response?.error || 'Background fetch failed');
            } catch (e) {
                console.warn('📖 Book Planner: fetchData failed for', url, ':', e.message);
                const r = await fetch(url, { headers });
                if (!r.ok) throw new Error(`Direct fetch failed: ${r.status} ${r.statusText}`);
                return r.json();
            }
        },

        async fetchInventory(authHeader, category = 'Energy+Drink') {
            const pageSize = 250;
            const maxPages = 20;
            const items = [];
            let offset = 0;
            let total = null;
            let timestamp = null;

            for (let page = 0; page < maxPages; page++) {
                let url = `https://api.torn.com/v2/user/inventory?limit=${pageSize}&offset=${offset}`;
                if (category) {
                    url += `&cat=${category}`;
                }
                const response = await this.fetchData(url, { Authorization: authHeader });
                if (!response || response.error) {
                    const message = response?.error?.error || response?.error?.message || 'Inventory request failed';
                    throw new Error(message);
                }

                const pageItems = this.getInventoryItems(response);
                items.push(...pageItems);

                if (timestamp === null) {
                    timestamp = response?.inventory?.timestamp ?? null;
                }

                const responseTotal = Number(response?._metadata?.total);
                if (Number.isFinite(responseTotal)) {
                    total = responseTotal;
                }

                if (pageItems.length < pageSize || (total !== null && items.length >= total)) {
                    break;
                }

                offset += pageItems.length;
            }

            const displayCase = await this.getDisplayCaseCounts(authHeader);
            if (displayCase) {
                for (const [name, count] of Object.entries(displayCase.byName)) {
                    items.push({ name, amount: count, skDisplayCase: true });
                }
                for (const [id, count] of Object.entries(displayCase.byId)) {
                    if (displayCase.byIdHasName && displayCase.byIdHasName[id]) continue;
                    items.push({ name: `Item #${id}`, ID: Number(id), amount: count, skDisplayCase: true });
                }
                console.log('📖 Book Planner: display case merged into inventory:', displayCase.byName, displayCase.byId);
            }

            return {
                inventory: { items, timestamp },
                _metadata: { total: items.length }
            };
        },

        // ── Display case (legacy v1-shaped selection: /user?selections=display) ──
        // Returns { byName: {lowercaseName: count}, byId: {itemId: count}, byIdHasName: {} }
        // or null when unavailable. The spec marks this selection as an unstable
        // v1 fallback, so the parser is deliberately defensive about the shape.
        async getDisplayCaseCounts(authHeader) {
            const now = Date.now();
            if (this._displayCaseCache && now - this._displayCaseCache.timestamp < this._cacheTtlMs) {
                return this._displayCaseCache.data;
            }

            const raw = await this.fetchData(`https://api.torn.com/v2/user?selections=display`, { Authorization: authHeader });
            if (!raw || raw.error) {
                this._displayCaseCache = { data: null, timestamp: now };
                return null;
            }
            if (!this._displayCaseLogged) {
                this._displayCaseLogged = true;
                console.log('📖 Book Planner: display case raw response (logged once):', raw);
            }

            const byName = {};
            const byId = {};
            const byIdHasName = {};
            const addEntry = (entry) => {
                if (!entry || typeof entry !== 'object') return;
                const idRaw = entry.ID ?? entry.id ?? entry.itemID ?? entry.item_id ?? entry.itemId;
                const qty = Number(entry.quantity ?? entry.amount ?? entry.count ?? entry.qty ?? 0);
                if (!Number.isFinite(qty) || qty <= 0) return;
                const name = typeof entry.name === 'string' ? entry.name : null;
                if (idRaw !== undefined && idRaw !== null && String(idRaw) !== '') {
                    byId[String(idRaw)] = (byId[String(idRaw)] || 0) + qty;
                    if (name) byIdHasName[String(idRaw)] = true;
                }
                if (name) {
                    byName[name.toLowerCase()] = (byName[name.toLowerCase()] || 0) + qty;
                }
            };

            // Walk the response for a collection of item entries: an array of
            // entries, or an object of entries (possibly nested one level under
            // a "display" key). _metadata / timestamp wrappers are skipped.
            const walk = (value, depth) => {
                if (!value || typeof value !== 'object' || depth > 2) return;
                if (Array.isArray(value)) {
                    value.forEach(entry => addEntry(entry));
                    return;
                }
                const keys = Object.keys(value);
                const looksLikeEntry = keys.some(k => ['quantity', 'amount', 'count', 'qty'].includes(k));
                if (looksLikeEntry) {
                    addEntry(value);
                    return;
                }
                for (const k of keys) {
                    if (k === '_metadata' || k === 'timestamp' || k === 'error') continue;
                    walk(value[k], depth + 1);
                }
            };
            walk(raw, 0);

            const result = { byName, byId, byIdHasName };
            this._displayCaseCache = { data: result, timestamp: now };
            return result;
        },

        getInventoryItems(inventory) {
            if (Array.isArray(inventory)) return inventory;
            if (Array.isArray(inventory?.inventory?.items)) return inventory.inventory.items;
            if (Array.isArray(inventory?.inventory)) return inventory.inventory;
            if (Array.isArray(inventory?.items)) return inventory.items;
            return [];
        },

        // ════════════════════════════════════════════════════════════════════════
        // DOM observation + button injection
        // ════════════════════════════════════════════════════════════════════════

        startObserver() {
            if (this.observer) return;
            let debounce = null;
            this.observer = new MutationObserver(() => {
                if (!this.isEnabled) return;
                clearTimeout(debounce);
                debounce = setTimeout(() => this.scanPage(), 50);
            });
            this.observer.observe(document.documentElement, { childList: true, subtree: true });

            // Fallback periodic check in case MutationObserver misses dynamic flyouts
            this._scanInterval = setInterval(() => {
                if (this.isEnabled) this.scanPage();
            }, 5000);

            this.scanPage();
        },

        stopObserver() {
            this._injectedPanels.clear();
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            if (this._scanInterval) {
                clearInterval(this._scanInterval);
                this._scanInterval = null;
            }
        },

        scanPage() {
            if (!this.isEnabled) return;

            // Process every open item-information panel
            const panels = document.querySelectorAll('ul[class*="properties___"]');
            if (panels.length === 0) return;

            panels.forEach((panelUl) => {
                try {
                    // Skip if our button is already in this panel
                    if (panelUl.querySelector('#' + ICON_ID)) return;
                    // Skip if we already processed this panel (injected or not a book)
                    if (this._injectedPanels.has(panelUl)) return;

                    // Extract item ID from the item image src: /images/items/774/large.png
                    let itemId = null;

                    const li = panelUl.closest('li');
                    const imgInLi = li?.querySelector('img[src*="/images/items/"]');
                    if (imgInLi) {
                        const m = imgInLi.getAttribute('src')?.match(/\/images\/items\/(\d+)\//);
                        if (m) itemId = Number(m[1]);
                    }

                    if (!itemId) {
                        const container = panelUl.closest('div[class*="item"], div[class*="flyout"], div[class*="info"], section, main') || panelUl.parentElement;
                        const imgInContainer = container?.querySelector('img[src*="/images/items/"]');
                        if (imgInContainer) {
                            const m = imgInContainer.getAttribute('src')?.match(/\/images\/items\/(\d+)\//);
                            if (m) itemId = Number(m[1]);
                        }
                    }

                    if (!itemId) {
                        const urlMatch = window.location.href.match(/[?&]id=(\d+)/);
                        if (urlMatch) {
                            itemId = Number(urlMatch[1]);
                        }
                    }

                    if (!itemId) return;

                    const bookKey = ITEM_ID_TO_BOOK_KEY[itemId];
                    const book = bookKey ? BOOKS[bookKey] : null;
                    if (!book) {
                        this._injectedPanels.add(panelUl);
                        return;
                    }

                    // Find an empty property <li> (React left it blank) — insert button there
                    const propDivs = Array.from(panelUl.querySelectorAll('[class*="property___"]'));
                    const emptyDiv = propDivs.find(d => !d.children.length && !d.textContent.trim());

                    if (emptyDiv) {
                        emptyDiv.style.justifyContent = 'center';
                        const btn = this._makeButton(book);
                        emptyDiv.appendChild(btn);
                        console.log('📖 Book Planner: BUTTON INJECTED for', book.name);
                    } else {
                        // Fallback: inject into empty <li class="left"></li> (actions row)
                        const emptyLeftLis = Array.from(panelUl.querySelectorAll('li.left')).filter(li => !li.children.length && !li.textContent.trim());
                        if (emptyLeftLis.length > 0) {
                            const targetLi = emptyLeftLis[0];
                            targetLi.style.minHeight = '36px';
                            targetLi.style.display = 'flex';
                            targetLi.style.alignItems = 'center';
                            targetLi.style.justifyContent = 'center';
                            const btn = this._makeButton(book);
                            targetLi.appendChild(btn);
                            console.log('📖 Book Planner: BUTTON INJECTED into empty <li class="left"> for', book.name);
                        }
                    }

                    this._injectedPanels.add(panelUl);
                } catch (e) {
                    console.warn('📖 Book Planner: panel error:', e);
                }
            });
        },

        _makeButton(book) {
            const btn = document.createElement('button');
            btn.id = ICON_ID;
            btn.type = 'button';
            btn.className = 'sk-book-planner-btn';
            btn.textContent = 'Plan Book';
            btn.title = `Plan how to use ${book.name} best`;
            btn.style.cssText = `
                display:flex; align-items:center; justify-content:center; gap:6px;
                background:#252525; border:none; color:#f0f0f0; border-radius:6px;
                padding:0; font-size:12px; font-weight:600;
                font-family:Arial,sans-serif; cursor:pointer;
                box-shadow:none; width:100%; height:100%;
                transition:background 0.15s;
            `;
            btn.innerHTML = 'Plan Book';
            btn.addEventListener('click', () => this.openModal(book));
            return btn;
        },

        getItemNameFromPage() {
            // Torn item pages show the item name in an h1 / title area
            const candidates = [
                document.querySelector('h1'),
                document.querySelector('.tt-item-name'),
                document.querySelector('[data-testid="item-name"]'),
                document.querySelector('[class*="itemName"]'),
                document.querySelector('[class*="item-name"]'),
                document.querySelector('.item-name'),
                document.querySelector('.itemName'),
            ];
            for (const el of candidates) {
                if (el && el.textContent) {
                    const name = el.textContent.trim();
                    if (name) return name;
                }
            }
            // Close button aria-label: "Close item info for Book : X" (inventory flyout)
            const closeBtn = document.querySelector('[data-testid="close-x-button"]');
            if (closeBtn && closeBtn.getAttribute('aria-label')) {
                const m = closeBtn.getAttribute('aria-label').match(/Close item info for (.+)$/);
                if (m) return m[1].trim();
            }
            // Description bold text: "The Book : X" (inventory flyout)
            const boldSpan = document.querySelector('.description___t9fnb .bold, .descriptionWrapper___fCgo0 .bold');
            if (boldSpan && boldSpan.textContent) {
                const name = boldSpan.textContent.trim().replace(/^The\s*/i, '');
                if (name) return name;
            }
            return null;
        },

        findBook(itemName) {
            const key = itemName
                .toLowerCase()
                .replace(/^the\s+book\s*:\s*/i, '')
                .replace(/^book\s*:\s*/i, '')
                .replace(/[^a-z0-9\s']/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            return BOOKS[key] || null;
        },

        ensureButton(book) {
            if (document.getElementById(ICON_ID)) return;

            const anchor =
                document.querySelector('.properties___DY7lL') ||
                document.querySelector('.tt-item-info, .tt-sidebar-information, .item-info, .item-description') ||
                document.querySelector('h1') ||
                document.querySelector('.tt-item-name') ||
                document.body;

            const btn = this._makeButton(book);

            // Insert after the anchor element
            if (anchor.parentNode) {
                anchor.parentNode.insertBefore(btn, anchor.nextSibling);
            } else {
                anchor.appendChild(btn);
            }
        },

        removeButton() {
            this._injectedPanels.clear();
            document.getElementById(ICON_ID)?.remove();
        },

        // ════════════════════════════════════════════════════════════════════════
        // Modal
        // ════════════════════════════════════════════════════════════════════════

        // Gathers every piece of remote data the planner (and the Book Item
        // Tracker window) needs for one book. Extracted from openModal so both
        // consumers share the exact same fetch pipeline.
        async gatherBookData(book) {
            const data = {
                userStat: null,
                statContainer: null,
                battlestats: null,
                inventory: null,
                drugInventory: null,
                boosterCooldown: null,
                drugCooldown: null,
                workstats: null,
                boosterMaxHours: 24,
                companyProfile: null,
                perkMultiplier: 1,
                nervePerkMultiplier: 1,
                caffeineConActive: false,
            };
            if (!book) return data;

            const apiKey = await this.getApiKey();
            if (!apiKey) return data;

            const hasStatRequirement = book.statKey && book.threshold;
            const needsBoosterCooldown = book.needsBoosterCooldown === true
                || (book.helperItems || []).some(i => i.calcType === 'booster_cans')
                || (book.tabs || []).some(t => (t.helperItems || []).some(i => i.calcType === 'booster_cans'));
            const needsDrugCooldown = book.needsDrugCooldown === true;
            const needsWorkstats = book.needsWorkstats === true;
            const needsDrugInventory = book.needsDrugInventory === true;
            const needsDrugItems = (book.helperItems || []).some(i => i.calcType === 'drug_pills')
                || (book.tabs || []).some(t => (t.helperItems || []).some(i => i.calcType === 'drug_pills'));
            const needsCapCheck = book.needsCapCheck === true;
            const needsCompanyCheck = book.needsCompanyCheck === true;
            const needsPerks = needsBoosterCooldown;

            try {
                const authHeader = `ApiKey ${apiKey}`;
                const now = Date.now();
                const calls = [];
                if (hasStatRequirement) {
                    calls.push({ key: 'stats', promise: this.fetchData(`https://api.torn.com/v2/user/battlestats`, { Authorization: authHeader }) });
                }
                if (needsCapCheck) {
                    calls.push({ key: 'capStats', promise: this.fetchData(`https://api.torn.com/v2/user/battlestats`, { Authorization: authHeader }) });
                }
                const cachedInv = this._inventoryCache && now - this._inventoryCache.timestamp < this._cacheTtlMs ? this._inventoryCache.data : null;
                if (cachedInv) {
                    data.inventory = cachedInv;
                } else {
                    calls.push({ key: 'inventory', promise: this.fetchInventory(authHeader) });
                }
                if (needsBoosterCooldown || needsDrugCooldown) {
                    calls.push({ key: 'cooldowns', promise: this.fetchData(`https://api.torn.com/v2/user/cooldowns`, { Authorization: authHeader }) });
                }
                const cachedDrugInv = this._drugInventoryCache && now - this._drugInventoryCache.timestamp < this._cacheTtlMs ? this._drugInventoryCache.data : null;
                if (needsBoosterCooldown || needsDrugCooldown || needsDrugInventory || needsDrugItems) {
                    if (cachedDrugInv) {
                        data.drugInventory = cachedDrugInv;
                    } else {
                        calls.push({ key: 'drugInventory', promise: this.fetchInventory(authHeader, 'Drug') });
                    }
                }
                if (needsWorkstats) {
                    calls.push({ key: 'workstats', promise: this.fetchData(`https://api.torn.com/v2/user/workstats`, { Authorization: authHeader }) });
                }
                if (needsPerks) {
                    calls.push({ key: 'perks', promise: this.fetchUserPerks(authHeader) });
                    calls.push({ key: 'calendar', promise: this.fetchCalendar(authHeader) });
                }
                const needsCompanyData = needsBoosterCooldown || needsCompanyCheck;
                if (needsCompanyData) {
                    calls.push({ key: 'company', promise: this.fetchData(`https://api.torn.com/v2/company/profile`, { Authorization: authHeader }) });
                }
                const results = await Promise.allSettled(calls.map(c => c.promise));
                results.forEach((result, i) => {
                    if (result.status !== 'fulfilled') {
                        console.warn('📖 Book Planner:', calls[i].key, 'request failed:', result.reason);
                        return;
                    }

                    const r = result.value;
                    if (r && r.error) return;
                    const key = calls[i].key;
                    if (key === 'stats') {
                        data.userStat = r;
                        data.statContainer = data.userStat && data.userStat.battlestats ? data.userStat.battlestats : data.userStat;
                    } else if (key === 'capStats') {
                        data.battlestats = r && r.battlestats ? r.battlestats : r;
                    } else if (key === 'inventory') {
                        data.inventory = r;
                        this._inventoryCache = { data: r, timestamp: Date.now() };
                    } else if (key === 'cooldowns') {
                        const cd = r.cooldowns || r;
                        const boosterSeconds = Number(cd.booster);
                        data.boosterCooldown = Number.isFinite(boosterSeconds) ? Math.max(0, boosterSeconds) : 0;
                        const drugSeconds = Number(cd.drug);
                        data.drugCooldown = Number.isFinite(drugSeconds) ? Math.max(0, drugSeconds) : 0;
                    } else if (key === 'drugInventory') {
                        data.drugInventory = r;
                        this._drugInventoryCache = { data: r, timestamp: Date.now() };
                    } else if (key === 'workstats') {
                        data.workstats = r && r.workstats ? r.workstats : r;
                    } else if (key === 'perks') {
                        data.perkMultiplier = this.calculatePerkMultiplier(r);
                        data.nervePerkMultiplier = this.calculateNervePerkMultiplier(r);
                        data.boosterMaxHours = this.calculateMaxBoosterCooldown(r);
                    } else if (key === 'calendar') {
                        data.caffeineConActive = this.isCaffeineConActive(r);
                    } else if (key === 'company') {
                        data.companyProfile = r && r.profile ? r.profile : r;
                    }
                });
            } catch (e) {
                console.warn('📖 Book Planner: fetch failed', e);
            }

            return data;
        },

        // Resolves the full item plan for a book into flat rows the Book Item
        // Tracker window can render. Returns { book, items }.
        async resolveBookPlan(bookKey) {
            const book = BOOKS[bookKey] || null;
            if (!book) return { book: null, tabs: [], activeTab: null, items: [] };

            const data = await this.gatherBookData(book);
            await this.loadSelections();
            const selections = this._selections[bookKey] || {};
            const items = [];

            const push = (label, item, resolved) => {
                items.push({
                    label: label || null,
                    name: resolved.name,
                    have: resolved.have,
                    haveInventory: resolved.haveInventory || 0,
                    haveCase: resolved.haveCase || 0,
                    need: resolved.need,
                    note: resolved.note || '',
                    calcType: resolved.calcType || null,
                    isGroupedMember: resolved.isGroupedMember || false,
                });
            };

            // Tab books (e.g. Self Control): only resolve the tab the user
            // picked. Book-level helper items (Xanax) always apply.
            const tabs = (book.tabs || []).map(t => ({ label: t.label }));
            let activeTab = null;

            if (tabs.length > 0) {
                const saved = tabs.find(t => t.label === selections.tab);
                activeTab = (saved || tabs[0]).label;
                const tab = (book.tabs || []).find(t => t.label === activeTab) || book.tabs[0];

                const tabItems = tab.helperItems || [];
                const isEnergyTab = tabItems.some(i => i.calcType === 'booster_cans' && !this.isAlcohol(i.name));
                const isNerveTab = tabItems.some(i => i.calcType === 'booster_cans' && this.isAlcohol(i.name));
                const tabType = isEnergyTab ? 'energy' : (isNerveTab ? 'alcohol' : null);
                let companyReduction = 0;
                let companyNerveMultiplier = 1;
                if (data.companyProfile && data.companyProfile.type && tabType) {
                    const bonuses = this.getApplicableCompanyBonuses(data.companyProfile, tabType);
                    companyReduction = this.calculateCompanyCooldownReduction(bonuses);
                    companyNerveMultiplier = this.calculateCompanyItemBoost(bonuses);
                }

                // Mirror the modal's SELECT CAN / SELECT ALCOHOL choice.
                let selected = null;
                let isGroupedSelection = false;
                if (isEnergyTab) {
                    const allCans = this.getAllCans(data.inventory);
                    const savedSelection = selections.can;
                    if (savedSelection === 'Taurine Elite + XMASS') {
                        isGroupedSelection = true;
                        const taurine = allCans.find(c => c.name === 'Can of Taurine Elite');
                        const xmass = allCans.find(c => c.name === 'Can of X-MASS');
                        if (taurine && xmass) {
                            selected = {
                                name: 'Taurine Elite + XMASS',
                                count: taurine.count + xmass.count,
                                inventoryCount: taurine.inventoryCount + xmass.inventoryCount,
                                caseCount: taurine.caseCount + xmass.caseCount,
                                isGrouped: true,
                                members: [taurine, xmass],
                            };
                        }
                    } else if (savedSelection) {
                        selected = allCans.find(c => c.name === savedSelection);
                    }
                    if (!selected && allCans.length > 0) {
                        selected = allCans.reduce((a, b) => this.getCanEnergy(b.name, data.perkMultiplier, data.caffeineConActive) > this.getCanEnergy(a.name, data.perkMultiplier, data.caffeineConActive) ? b : a);
                    }
                } else if (isNerveTab) {
                    const allAlcohols = this.getAllAlcohols(data.inventory);
                    const savedAlc = selections.alcohol ? allAlcohols.find(c => c.name === selections.alcohol) : null;
                    if (savedAlc) {
                        selected = savedAlc;
                    } else if (allAlcohols.length > 0) {
                        selected = allAlcohols.reduce((a, b) => this.getAlcoholNerve(b.name, data.perkMultiplier * data.nervePerkMultiplier * companyNerveMultiplier) > this.getAlcoholNerve(a.name, data.perkMultiplier * data.nervePerkMultiplier * companyNerveMultiplier) ? b : a);
                    }
                }

                for (const i of tabItems) {
                    const resolved = this.resolveHelperItem(
                        data.inventory, i, data.boosterCooldown, book.durationDays,
                        data.perkMultiplier, data.nervePerkMultiplier, data.caffeineConActive,
                        companyReduction, companyNerveMultiplier, 0, null, data.boosterMaxHours || 0
                    );
                    if (selected && i.calcType === 'booster_cans') {
                        if (selected.isGrouped && selected.members?.length > 0) {
                            selected.members.forEach(member => {
                                const displayName = member.name.replace(/^Can of /, '');
                                const memberResolved = { name: displayName, have: member.count, haveInventory: member.inventoryCount || 0, haveCase: member.caseCount || 0, need: resolved.need, note: i.note, calcType: i.calcType, isGroupedMember: true };
                                const isSingleTab = tabs.length <= 1;
                                push(isSingleTab ? null : tab.label, i, memberResolved);
                            });
                        } else {
                            resolved.name = selected.name;
                            resolved.have = selected.count;
                            resolved.haveInventory = selected.inventoryCount;
                            resolved.haveCase = selected.caseCount;
                            const isSingleTab = tabs.length <= 1;
                            push(isSingleTab ? null : tab.label, i, resolved);
                        }
                    } else {
                        const isSingleTab = tabs.length <= 1;
                        push(isSingleTab ? null : tab.label, i, resolved);
                    }
                }
            }

            if (tabs.length === 0) {
                for (const i of (book.helperItems || [])) {
                    const itemInventory = book.needsDrugInventory ? (data.drugInventory || data.inventory) : data.inventory;
                    const resolved = this.resolveHelperItem(
                        itemInventory, i, data.boosterCooldown, book.durationDays,
                        data.perkMultiplier, data.nervePerkMultiplier, data.caffeineConActive,
                        0, 1, data.drugCooldown,
                        data.drugInventory
                    );
                    push(null, i, resolved);
                }
            }

            return {
                book: { key: bookKey, name: book.name, effect: book.effect, durationDays: book.durationDays },
                tabs,
                activeTab,
                items,
            };
        },

        async openModal(book) {
            console.log('📖 Book Planner: openModal called for', book?.name);
            this.removeModal();

            const bookKey = Object.keys(BOOKS).find(k => BOOKS[k] === book) || null;
            await this.loadSelections();
            const hasStatRequirement = book.statKey && book.threshold;
            const hasTabs = book.tabs && book.tabs.length > 0;
            const needsBoosterCooldown = book.needsBoosterCooldown === true
                || (book.helperItems || []).some(i => i.calcType === 'booster_cans')
                || (book.tabs || []).some(t => (t.helperItems || []).some(i => i.calcType === 'booster_cans'));

            // All remote data now comes from the shared gatherBookData pipeline
            // (also used by the Book Item Tracker window).
            const bookData = await this.gatherBookData(book);
            const userStat = bookData.userStat;
            const boosterCooldown = bookData.boosterCooldown;
            const drugCooldown = bookData.drugCooldown;
            const workstats = bookData.workstats;
            const battlestats = bookData.battlestats;
            const boosterMaxHours = bookData.boosterMaxHours;
            const inventory = bookData.inventory;
            const drugInventory = bookData.drugInventory;
            const statContainer = bookData.statContainer;
            const companyProfile = bookData.companyProfile;
            const perkMultiplier = bookData.perkMultiplier;
            const nervePerkMultiplier = bookData.nervePerkMultiplier;
            const caffeineConActive = bookData.caffeineConActive;

            

            const statDetail = hasStatRequirement ? statContainer?.[book.statKey] : null;
            const statValue = statDetail && statDetail.value !== undefined ? statDetail.value : null;
            const meetsThreshold = hasStatRequirement ? (statValue !== null ? statValue >= book.threshold : null) : null;

            const userCompany = companyProfile && companyProfile.type ? companyProfile.type.name : null;
            const userCompanyTypeId = companyProfile && companyProfile.type ? companyProfile.type.id : null;
            const boosterActive = boosterCooldown && boosterCooldown > 0;
            const boosterRemaining = boosterActive ? Math.max(0, boosterCooldown) : 0;
            const boosterCurrentH = (boosterRemaining / 3600).toFixed(1);

            const tabsContent = book.tabs || [];
            const activeTab = tabsContent[0];

            let selectedCanName = (bookKey && this._selections[bookKey]?.can) || null;
            let selectedAlcoholName = (bookKey && this._selections[bookKey]?.alcohol) || null;

            const modal = document.createElement('div');
            modal.id = MODAL_ID;
            modal.className = 'sk-book-planner-modal';
            modal.style.cssText = `
                position:fixed; inset:0; z-index:2147483647;
                display:flex; align-items:center; justify-content:center;
                background:rgba(0,0,0,0.75); font-family:'Segoe UI',Arial,sans-serif;
            `;

            const renderTabs = () => {
                const tabItems = tabsContent.map((t, idx) => renderTabPanel(t, idx)).join('');

                const tabButtons = tabsContent.map((t, idx) => `
                    <button class="skbp-tab-btn ${idx === 0 ? 'skbp-tab-active' : ''}" data-tab="${idx}" type="button">${this.escapeHtml(t.label)}</button>
                `).join('');

                return `
                <div class="skbp-tabs">
                    <div class="skbp-tab-list">${tabButtons}</div>
                    ${tabItems}
                </div>
                `;
            };

            const renderTabPanel = (t, idx) => {
                const helperItems = t.helperItems || [];
                const isEnergyTab = helperItems.some(i => i.calcType === 'booster_cans' && !this.isAlcohol(i.name));
                const isNerveTab = helperItems.some(i => i.calcType === 'booster_cans' && this.isAlcohol(i.name));
                const tabType = isEnergyTab ? 'energy' : (isNerveTab ? 'alcohol' : null);

                const userCompany = companyProfile && companyProfile.type ? companyProfile.type.name : null;
                const companyRating = companyProfile && companyProfile.rating !== undefined ? companyProfile.rating : null;
                const userCompanyTypeId = companyProfile && companyProfile.type ? companyProfile.type.id : null;

                let companyReduction = 0;
                let companyNerveMultiplier = 1;
                let allPaths = [];
                if (userCompanyTypeId) {
                    const applicableBonuses = this.getApplicableCompanyBonuses(companyProfile, tabType);
                    companyReduction = this.calculateCompanyCooldownReduction(applicableBonuses);
                    companyNerveMultiplier = this.calculateCompanyItemBoost(applicableBonuses);
                }
                allPaths = this.getAllCompanyBonusPaths(tabType).sort((a, b) => b.percent - a.percent);
                const hasPaths = allPaths.length > 0;

                const resolvedHelpers = (t.helperItems || []).map(i => this.resolveHelperItem(inventory, i, boosterCooldown, book.durationDays, perkMultiplier, nervePerkMultiplier, caffeineConActive, companyReduction, companyNerveMultiplier, 0, null, boosterMaxHours || 0));
                const hasHelpers = resolvedHelpers.length > 0;

                const now = Math.floor(Date.now() / 1000);
                const boosterActive = boosterCooldown && boosterCooldown > 0;
                const boosterRemaining = boosterActive ? Math.max(0, boosterCooldown) : 0;
                const boosterCurrentH = (boosterRemaining / 3600).toFixed(1);
                const boosterMaxH = boosterMaxHours;

                // Find all cans in inventory (only for energy tab)
                let allCans = [];
                let cansWithEnergy = [];
                let defaultCan = null;
                let selectedCanNameFinal = null;
                let boosterCansNeed = null;

                if (isEnergyTab) {
                    allCans = this.getAllCans(inventory);
                    cansWithEnergy = allCans.map(c => ({
                        ...c,
                        energy: this.getCanEnergy(c.name, perkMultiplier, caffeineConActive)
                    }));
                    cansWithEnergy.sort((a, b) => b.energy - a.energy);

                    // Group Taurine Elite + XMASS (same 30 energy, interchangeable) at top
                    const taurineIdx = cansWithEnergy.findIndex(c => c.name === 'Can of Taurine Elite');
                    const xmassIdx = cansWithEnergy.findIndex(c => c.name === 'Can of X-MASS');
                    if (taurineIdx !== -1 && xmassIdx !== -1) {
                        const taurine = cansWithEnergy[taurineIdx];
                        const xmass = cansWithEnergy[xmassIdx];
                        const grouped = {
                            name: 'Taurine Elite + XMASS',
                            count: taurine.count + xmass.count,
                            inventoryCount: taurine.inventoryCount + xmass.inventoryCount,
                            caseCount: taurine.caseCount + xmass.caseCount,
                            energy: taurine.energy,
                            isGrouped: true,
                            members: [taurine, xmass],
                        };
                        cansWithEnergy = cansWithEnergy.filter(c => c.name !== 'Can of Taurine Elite' && c.name !== 'Can of X-MASS');
                        cansWithEnergy.unshift(grouped);
                    }

                    defaultCan = allCans.length > 0 ? allCans.reduce((a, b) => this.getCanEnergy(b.name, perkMultiplier, caffeineConActive) > this.getCanEnergy(a.name, perkMultiplier, caffeineConActive) ? b : a) : null;
                    selectedCanNameFinal = selectedCanName || (defaultCan ? defaultCan.name : null);

                    const boosterHelper = resolvedHelpers.find(i => i.calcType === 'booster_cans');
                    boosterCansNeed = boosterHelper ? boosterHelper.need : null;
                }

                let allAlcohols = [];
                let alcoholsWithNerve = [];
                let defaultAlcohol = null;
                let selectedAlcoholNameFinal = null;
                let boosterAlcoholsNeed = null;

                if (isNerveTab) {
                    allAlcohols = this.getAllAlcohols(inventory);
                    alcoholsWithNerve = allAlcohols.map(c => ({
                        ...c,
                        nerve: this.getAlcoholNerve(c.name, perkMultiplier * nervePerkMultiplier * companyNerveMultiplier)
                    }));
                    alcoholsWithNerve.sort((a, b) => b.nerve - a.nerve);

                    defaultAlcohol = alcoholsWithNerve.length > 0 ? alcoholsWithNerve.reduce((a, b) => b.nerve > a.nerve ? b : a) : null;
                    selectedAlcoholNameFinal = selectedAlcoholName || (defaultAlcohol ? defaultAlcohol.name : null);

                    const boosterHelper = resolvedHelpers.find(i => i.calcType === 'booster_cans');
                    boosterAlcoholsNeed = boosterHelper ? boosterHelper.need : null;
                }

                return `
                <div class="skbp-tab-panel" id="skbp-tab-${idx}" style="${idx === 0 ? 'display:block' : 'display:none'}">
                    ${isEnergyTab && allCans.length > 0 ? `<div class="skbp-section skbp-can-section" style="margin-top:8px;">
                        <div class="skbp-section-title">SELECT ENERGY CAN</div>
                        <div class="skbp-item-table">
                        ${cansWithEnergy.map(c => {
                            const isSelected = selectedCanNameFinal === c.name;
                            const totalEnergy = c.energy !== null && boosterCansNeed !== null ? c.energy * boosterCansNeed : 0;
                            return `<div class="skbp-item-row skbp-can-row${isSelected ? ' skbp-can-selected' : ''}" data-can-name="${this.escapeHtml(c.name)}"><input type="radio" class="skbp-can-radio" name="skbp-can-${idx}" ${isSelected ? 'checked' : ''} style="margin:0; cursor:pointer; width:16px; height:16px;"/><span class="skbp-item-name">${this.escapeHtml(c.name.replace(/^Can of /, ''))}</span><span class="skbp-item-energy">${totalEnergy.toLocaleString()} energy</span><span class="skbp-item-count">×${c.count.toLocaleString()} have</span></div>`;
                        }).join('')}
                        </div>
                    </div>` : ''}
                    ${isNerveTab && allAlcohols.length > 0 ? `<div class="skbp-section skbp-alcohol-section" style="margin-top:8px;">
                        <div class="skbp-section-title">SELECT ALCOHOL</div>
                        <div class="skbp-item-table">
                        ${alcoholsWithNerve.map(c => {
                            const isSelected = selectedAlcoholNameFinal === c.name;
                            const totalNerve = c.nerve !== null && boosterAlcoholsNeed !== null ? c.nerve * boosterAlcoholsNeed : 0;
                            return `<div class="skbp-item-row skbp-alcohol-row${isSelected ? ' skbp-alcohol-selected' : ''}" data-alcohol-name="${this.escapeHtml(c.name)}"><input type="radio" class="skbp-alcohol-radio" name="skbp-alcohol-${idx}" ${isSelected ? 'checked' : ''} style="margin:0; cursor:pointer; width:16px; height:16px;"/><span class="skbp-item-name">${this.escapeHtml(c.name)}</span><span class="skbp-item-nerve">${totalNerve.toLocaleString()} nerve</span><span class="skbp-item-count">×${c.count.toLocaleString()} have</span></div>`;
                        }).join('')}
                        </div>
                    </div>` : ''}
                    ${hasHelpers ? `<div class="skbp-section">
                        <div class="skbp-section-title">ITEMS NEEDED</div>
                        <div class="skbp-item-table">
                        ${resolvedHelpers.map(i => {
                            if (i.calcType === 'booster_cans' && this.isAlcohol(i.name)) {
                                const selectedAlc = allAlcohols.find(c => c.name === selectedAlcoholNameFinal);
                                const selName = selectedAlc ? selectedAlc.name : i.name;
                                const selHave = selectedAlc ? selectedAlc.count : i.have;
                                const selNeed = i.need !== null ? i.need : null;
                                const shortfall = selNeed !== null ? Math.max(0, selNeed - selHave) : 0;
                                return `<div class="skbp-item-row"><span class="skbp-item-name">${this.escapeHtml(selName)}</span><span class="skbp-item-count">×${selHave.toLocaleString()} have${selectedAlc ? this.breakdownText(selectedAlc.inventoryCount, selectedAlc.caseCount) : this.breakdownText(i.haveInventory, i.haveCase)}</span><span class="skbp-item-needed">${selNeed !== null ? (shortfall > 0 ? '⚠️ ' : '') + '×' + selNeed.toLocaleString() + ' need' : '–'}${shortfall > 0 ? ' (short ×' + shortfall.toLocaleString() + ')' : ''}</span><span class="skbp-item-note">${this.escapeHtml(i.note)}</span></div>`;
                            }
                            if (i.calcType === 'booster_cans') {
                                let selHave = 0;
                                const selectedCan = allCans.find(c => c.name === selectedCanNameFinal);
                                if (selectedCanNameFinal === 'Taurine Elite + XMASS') {
                                    const taurine = allCans.find(c => c.name === 'Can of Taurine Elite');
                                    const xmass = allCans.find(c => c.name === 'Can of X-MASS');
                                    selHave = (taurine ? taurine.count : 0) + (xmass ? xmass.count : 0);
                                } else if (selectedCan) {
                                    selHave = selectedCan.count;
                                } else {
                                    selHave = i.have;
                                }
                                const selName = selectedCanNameFinal === 'Taurine Elite + XMASS' ? 'Taurine Elite + XMASS' : (selectedCan ? selectedCan.name : i.name);
                                const selNeed = i.need !== null ? i.need : null;
                                const shortfall = selNeed !== null ? Math.max(0, selNeed - selHave) : 0;
                                return `<div class="skbp-item-row"><span class="skbp-item-name">${this.escapeHtml(selName)}</span><span class="skbp-item-count">×${selHave.toLocaleString()} have</span><span class="skbp-item-needed">${selNeed !== null ? (shortfall > 0 ? '⚠️ ' : '') + '×' + selNeed.toLocaleString() + ' need' : '–'}${shortfall > 0 ? ' (short ×' + shortfall.toLocaleString() + ')' : ''}</span><span class="skbp-item-note">${this.escapeHtml(i.note)}</span></div>`;
                            }
                            const energyText = i.energyPerCan !== null ? ` · ${i.energyPerCan} energy/can` : '';
                            const nerveText = i.energyPerCan !== null ? ` · ${i.energyPerCan} nerve/bottle` : '';
                            return `<div class="skbp-item-row"><span class="skbp-item-name">${this.escapeHtml(i.name)}</span><span class="skbp-item-count">×${i.have.toLocaleString()} have</span><span class="skbp-item-needed">${i.need !== null ? (i.have < i.need ? '⚠️ ' : '') + '×' + i.need.toLocaleString() + ' need' : '–'}</span><span class="skbp-item-note">${this.escapeHtml(i.note + energyText + nerveText)}</span></div>`;
                        }).join('')}
                        </div>
                    </div>` : ''}
                    ${hasPaths ? `<div class="skbp-section">
                        <div class="skbp-section-title">COMPANY PATHS</div>
                        ${allPaths.map(p => {
                            const isActive = userCompanyTypeId === p.typeId && companyRating !== null && companyRating >= p.star;
                            const gainText = p.type === 'cooldown_reduction' ? `${p.percent}% cooldown reduction` : `${p.percent}% item boost`;
                            return `<div class="skbp-check-row"><span class="skbp-check-name">${p.star}* ${this.escapeHtml(p.company)}</span><span class="skbp-check-percent">${gainText}</span><span class="skbp-check-status ${isActive ? 'skbp-check-active' : 'skbp-check-inactive'}">${isActive ? '✓ active' : '✗ not active'}</span></div>`;
                        }).join('')}
                    </div>` : ''}
                    <div class="skbp-section">
                        <div class="skbp-section-title">BOOSTER COOLDOWN</div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Booster cooldown</span><span class="skbp-check-percent">${boosterCurrentH}h / ${boosterMaxH}h</span><span class="skbp-check-status ${boosterActive ? 'skbp-check-inactive' : 'skbp-check-active'}">${boosterActive ? 'ON COOLDOWN' : 'ready'}</span></div>
                    </div>
                    ${!hasHelpers && allCans.length === 0 ? `<div class="skbp-empty">No specific items or company specials apply for this direction.</div>` : ''}
                </div>
                `;
            }

            modal.innerHTML = `
            <style>
                #${MODAL_ID} .skbp-card {
                    background:var(--surface,#1e1e1e); border:1px solid var(--border,rgba(255,255,255,0.12));
                    border-radius:16px; width:min(680px,94vw); max-height:90vh;
                    overflow:hidden; color:var(--text,#f0f0f0); box-shadow:0 24px 60px rgba(0,0,0,0.7);
                    display:flex; flex-direction:column;
                }
                #${MODAL_ID} .skbp-header {
                    padding:20px 24px; border-bottom:1px solid var(--border2,rgba(255,255,255,0.08));
                    display:flex; align-items:center; justify-content:space-between;
                }
                #${MODAL_ID} .skbp-title {
                    font-size:18px; font-weight:700; line-height:1.2; padding-bottom:4px; background:linear-gradient(135deg,#5fcc6a,#ffad5a);
                    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
                }
                #${MODAL_ID} .skbp-close {
                    background:transparent; border:none; color:var(--muted,rgba(255,255,255,0.5)); font-size:24px; cursor:pointer; line-height:1;
                }
                #${MODAL_ID} .skbp-close:hover{color:#fff;}
                #${MODAL_ID} .skbp-body{padding:20px 24px; overflow-y:auto; flex:1;}
                #${MODAL_ID} .skbp-effect{font-size:13px; color:var(--muted,rgba(255,255,255,0.7)); margin-bottom:20px; line-height:1.6;}
                #${MODAL_ID} .skbp-row{display:flex; align-items:center; gap:10px; margin-bottom:12px; font-size:13px;}
                #${MODAL_ID} .skbp-label{color:var(--muted,rgba(255,255,255,0.55)); min-width:150px;}
                #${MODAL_ID} .skbp-value{font-weight:700; color:var(--text,#f0f0f0);}
                #${MODAL_ID} .skbp-verdict {
                    padding:12px 16px; border-radius:10px; margin-top:18px; font-size:13px; font-weight:700;
                    text-align:center;
                }
                #${MODAL_ID} .skbp-verdict.ready{background:rgba(74,222,128,0.12); border:1px solid rgba(74,222,128,0.3); color:#4ade80;}
                #${MODAL_ID} .skbp-verdict.notready{background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.25); color:#f87171;}
                #${MODAL_ID} .skbp-verdict.unknown{background:rgba(156,163,175,0.1); border:1px solid rgba(156,163,175,0.2); color:#9ca3af;}
                #${MODAL_ID} .skbp-reason {
                    margin-top:16px; padding:14px 18px; background:rgba(255,255,255,0.03);
                    border-radius:10px; font-size:12px; color:var(--muted,rgba(255,255,255,0.65)); line-height:1.5;
                    border-left:3px solid #5fcc6a;
                }
                #${MODAL_ID} .skbp-tabs { width:100%; }
                #${MODAL_ID} .skbp-tab-list{display:flex; gap:2px; border-bottom:1px solid var(--border2,rgba(255,255,255,0.08)); margin-bottom:20px;}
                #${MODAL_ID} .skbp-tab-btn{background:transparent;border:none;border-bottom:2px solid transparent;color:var(--muted,rgba(255,255,255,0.45));font-size:13px;font-weight:600;padding:10px 16px;cursor:pointer;transition:all .15s;}
                #${MODAL_ID} .skbp-tab-btn:hover{color:var(--text,#f0f0f0);background:var(--surface2,#252525);}
                #${MODAL_ID} .skbp-tab-btn.skbp-tab-active{color:var(--green,#5fcc6a);border-bottom-color:var(--green,#5fcc6a);}
                #${MODAL_ID} .skbp-tab-panel{display:none;}
                #${MODAL_ID} .skbp-section{margin-bottom:24px;}
                #${MODAL_ID} .skbp-section-title{font-size:11px;font-weight:700;color:var(--muted,rgba(255,255,255,0.55));margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;}
                #${MODAL_ID} .skbp-item-table{display:table;width:100%;border:none;border-collapse:separate;margin-bottom:12px;}
                #${MODAL_ID} .skbp-item-row{display:table-row;}
                #${MODAL_ID} .skbp-item-name{display:table-cell;}
                #${MODAL_ID} .skbp-item-count{display:table-cell;width:160px;white-space:nowrap;font-weight:700;color:#f0f0f0;}
                #${MODAL_ID} .skbp-item-needed{display:table-cell;width:190px;white-space:nowrap;font-weight:700;color:#fbbf24;}
                #${MODAL_ID} .skbp-item-note{display:table-cell;font-size:10px;color:rgba(255,255,255,0.45);font-style:italic;}
                #${MODAL_ID} .skbp-can-row{cursor:pointer;background:rgba(255,255,255,0.03);border-radius:6px;padding:4px 8px;}
                #${MODAL_ID} .skbp-can-row:hover{background:rgba(255,255,255,0.08);}
                #${MODAL_ID} .skbp-can-selected{background:rgba(95,204,106,0.15);border-left:3px solid var(--green,#5fcc6a);}
                #${MODAL_ID} .skbp-item-energy{font-weight:700;color:#5fcc6a;}
                #${MODAL_ID} .skbp-item-nerve{font-weight:700;color:#5fcc6a;}
                #${MODAL_ID} .skbp-alcohol-row{cursor:pointer;background:rgba(255,255,255,0.03);border-radius:6px;padding:4px 8px;}
                #${MODAL_ID} .skbp-alcohol-row:hover{background:rgba(255,255,255,0.08);}
                #${MODAL_ID} .skbp-alcohol-selected{background:rgba(95,204,106,0.15);border-left:3px solid var(--green,#5fcc6a);}
                #${MODAL_ID} .skbp-check-row{display:flex;align-items:center;gap:10px;font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:6px;}
                #${MODAL_ID} .skbp-check-name{flex:1;}
                #${MODAL_ID} .skbp-check-percent{font-weight:700;color:#f0f0f0;}
                #${MODAL_ID} .skbp-check-status{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;}
                #${MODAL_ID} .skbp-check-active{color:#4ade80;}
                #${MODAL_ID} .skbp-check-inactive{color:#f87171;}
                #${MODAL_ID} .skbp-empty{font-size:12px;color:var(--muted,rgba(255,255,255,0.6));padding:16px 0;text-align:center;}
                #${MODAL_ID} .skbp-footnote-value{font-weight:400; color:var(--muted,rgba(255,255,255,0.45)); font-size:11px; font-style:italic;}
                #${MODAL_ID} .skbp-footer {padding:16px 24px; border-top:1px solid var(--border2,rgba(255,255,255,0.06)); display:flex; justify-content:flex-end; gap:8px; background:var(--surface,#1e1e1e);}

                #${MODAL_ID} .skbp-btn {
                    border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:700;
                    cursor:pointer; color:#111;
                }
                #${MODAL_ID} .skbp-btn-primary{background:linear-gradient(135deg,#5fcc6a,#ffad5a);}
                #${MODAL_ID} .skbp-btn-ghost{background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:#f0f0f0;}
                #${MODAL_ID} .skbp-btn-ghost:hover{background:rgba(255,255,255,0.12);}
            </style>
            <div class="skbp-card">
                <div class="skbp-header">
                    <div class="skbp-title">${this.escapeHtml(book.name)}</div>
                    <button class="skbp-close" id="skbp-close">&times;</button>
                </div>
                <div class="skbp-body">
                    <div class="skbp-effect">${this.escapeHtml(book.effect)}</div>

                    <div class="skbp-row">
                        <span class="skbp-label">Duration</span>
                        <span class="skbp-value">${book.durationDays} days</span>
                    </div>
                    ${hasStatRequirement ? `<div class="skbp-section">
                        <div class="skbp-section-title">BATTLESTATS</div>
                        <div class="skbp-check-row"><span class="skbp-check-name">${book.statLabel}</span><span class="skbp-check-percent">${statValue !== null ? statValue.toLocaleString() + ' / ' + book.capLabel : '— / ' + book.capLabel}</span><span class="skbp-check-status ${statValue !== null && statValue < book.cap ? 'skbp-check-active' : 'skbp-check-inactive'}">${statValue !== null && statValue < book.cap ? '✓ below cap' : '✗ at/above cap'}</span></div>
                    </div>` : ''}
                    ${book.needsCapCheck && battlestats ? `<div class="skbp-section">
                        <div class="skbp-section-title">BATTLESTATS</div>
                        ${Object.entries(battlestats).filter(([key]) => key !== 'total').map(([key, stat]) => {
                            const val = Number(stat.value ?? stat);
                            const below = val < 50000000;
                            return `<div class="skbp-check-row"><span class="skbp-check-name">${key.charAt(0).toUpperCase() + key.slice(1)}</span><span class="skbp-check-percent">${val !== null ? val.toLocaleString() + ' / 50,000,000' : '— / 50,000,000'}</span><span class="skbp-check-status ${below ? 'skbp-check-active' : 'skbp-check-inactive'}">${below ? '✓ below cap' : '✗ at/above cap'}</span></div>`;
                        }).join('')}
                    </div>` : ''}

                    ${hasStatRequirement && !book.hideVerdict ? `
                    <div class="skbp-verdict ${book.verdictInverted ? (meetsThreshold === true ? 'notready' : meetsThreshold === false ? 'ready' : 'unknown') : (meetsThreshold === true ? 'ready' : meetsThreshold === false ? 'notready' : 'unknown')}">
                        ${book.verdictInverted
                            ? (meetsThreshold === true
                                ? `⏳ Above cap — your ${book.statLabel || 'stat'} is at or above ${book.thresholdLabel || 'the cap'}. The book still works but with reduced benefit.`
                                : '✅ Below cap — your battlestats are under 50m, so happiness will boost gym gains.')
                            : (meetsThreshold === true
                                ? '✅ Ready to use — you meet the recommended threshold.'
                                : `⏳ Not yet — your ${book.statLabel || 'stat'} is below the recommended ${book.thresholdLabel || 'threshold'}. Wait until you reach it before using the book.`)}
                    </div>
                    ` : ''}

                    ${book.reason ? `<div class="skbp-reason">
                        <strong>Why:</strong> ${this.escapeHtml(book.reason)}
                    </div>` : ''}

                    ${hasTabs ? renderTabs() : ``}

                    ${!hasTabs && book.helperItems && book.helperItems.length > 0 ? `
                    <div class="skbp-section">
                        <div class="skbp-section-title">ITEMS NEEDED</div>
                        <div class="skbp-item-table">
                        ${(book.helperItems || []).map(i => {
                            const itemInventory = book.needsDrugInventory ? (drugInventory || inventory) : inventory;
                            const resolved = this.resolveHelperItem(itemInventory, i, boosterCooldown, book.durationDays, perkMultiplier, nervePerkMultiplier, caffeineConActive, 0, 1, drugCooldown, drugInventory);
                            const energyText = resolved.energyPerCan !== null ? ` · ~${resolved.energyPerCan} energy/can` : '';
                            return `<div class="skbp-item-row"><span class="skbp-item-name">${this.escapeHtml(resolved.name)}</span><span class="skbp-item-count">×${resolved.have.toLocaleString()} have${this.breakdownText(resolved.haveInventory, resolved.haveCase)}</span><span class="skbp-item-needed">${resolved.need !== null ? (resolved.have < resolved.need ? '⚠️ ' : '') + '×' + resolved.need.toLocaleString() + ' need' : '–'}</span><span class="skbp-item-note">${this.escapeHtml(resolved.note + energyText)}</span></div>`;
                        }).join('')}
                        </div>
                    </div>` : ''}
                    ${book.needsDrugCooldown ? `<div class="skbp-section">
                        <div class="skbp-section-title">DRUG COOLDOWN</div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Drug cooldown</span><span class="skbp-check-percent">${drugCooldown !== null ? (drugCooldown / 3600).toFixed(1) : '—'}h</span><span class="skbp-check-status ${drugCooldown && drugCooldown > 0 ? 'skbp-check-inactive' : 'skbp-check-active'}">${drugCooldown && drugCooldown > 0 ? 'ON COOLDOWN' : 'ready'}</span></div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Best start</span><span class="skbp-check-percent">0h cooldown</span><span class="skbp-check-status skbp-check-active">✓ maximizes doses/day</span></div>
                    </div>` : ''}
                    ${book.needsWorkstats ? `<div class="skbp-section">
                        <div class="skbp-section-title">WORKSTATS CHECK</div>
                        ${workstats ? `
                        <div class="skbp-check-row"><span class="skbp-check-name">Manual</span><span class="skbp-check-percent">${workstats.manual_labor?.toLocaleString() ?? '—'}</span><span class="skbp-check-status ${workstats.manual_labor >= 50000 ? 'skbp-check-active' : 'skbp-check-inactive'}">${workstats.manual_labor >= 50000 ? '✓ 50k+' : '✗ below 50k'}</span></div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Intelligence</span><span class="skbp-check-percent">${workstats.intelligence?.toLocaleString() ?? '—'}</span><span class="skbp-check-status ${workstats.intelligence >= 50000 ? 'skbp-check-active' : 'skbp-check-inactive'}">${workstats.intelligence >= 50000 ? '✓ 50k+' : '✗ below 50k'}</span></div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Endurance</span><span class="skbp-check-percent">${workstats.endurance?.toLocaleString() ?? '—'}</span><span class="skbp-check-status ${workstats.endurance >= 50000 ? 'skbp-check-active' : 'skbp-check-inactive'}">${workstats.endurance >= 50000 ? '✓ 50k+' : '✗ below 50k'}</span></div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Best start</span><span class="skbp-check-percent">50k+ in all three</span><span class="skbp-check-status skbp-check-active">✓ maximizes 5% gain</span></div>
                        ` : `<div class="skbp-empty">Workstats unavailable.</div>`}
                    </div>` : ''}
${book.needsCompanyCheck ? `<div class="skbp-section">
                        <div class="skbp-section-title">COMPANY PATHS</div>
                        ${companyProfile ? this.renderCompanyPaths(book, companyProfile, userCompanyTypeId) : '<div class="skbp-empty">Company data unavailable.</div>'}
                    </div>` : ''}
                    ${!hasTabs && needsBoosterCooldown ? `<div class="skbp-section">
                        <div class="skbp-section-title">BOOSTER COOLDOWN</div>
                        <div class="skbp-check-row"><span class="skbp-check-name">Booster cooldown</span><span class="skbp-check-percent">${boosterCurrentH}h / ${boosterMaxHours}h</span><span class="skbp-check-status ${boosterActive ? 'skbp-check-inactive' : 'skbp-check-active'}">${boosterActive ? 'ON COOLDOWN' : 'ready'}</span></div>
                    </div>` : ''}
                    ${!hasTabs && book.helperItems && book.helperItems.length === 0 && !book.needsDrugCooldown && !book.needsWorkstats && !book.needsCompanyCheck && !needsBoosterCooldown && !book.needsCapCheck ? '' : ''}
                    ${book.helperNote ? `<div class="skbp-row skbp-footnote" style="text-align:center; justify-content:center;">
                        <span class="skbp-value skbp-footnote-value">${this.escapeHtml(book.helperNote)}</span>
                    </div>` : ''}
                </div>
                <div class="skbp-footer">
                    <button class="skbp-btn skbp-btn-ghost" id="skbp-tracker">Item Tracker</button>
                    <button class="skbp-btn skbp-btn-ghost" id="skbp-cancel">Close</button>
                </div>
            </div>
            `;

            document.body.appendChild(modal);

            const close = () => this.removeModal();
            modal.querySelector('#skbp-close')?.addEventListener('click', close);
            modal.querySelector('#skbp-cancel')?.addEventListener('click', close);
            modal.querySelector('#skbp-tracker')?.addEventListener('click', () => {
                if (!window.SidekickModules?.BookItemTracker) {
                    console.warn('📖 Book Planner: Book Item Tracker module not loaded');
                    return;
                }
                this.removeModal();
                window.SidekickModules.BookItemTracker.open(bookKey);
            });
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

            modal.querySelectorAll('.skbp-tab-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.tab, 10);
                    this.saveSelection(bookKey, 'tab', tabsContent[idx]?.label);
                    modal.querySelectorAll('.skbp-tab-btn').forEach(b => b.classList.remove('skbp-tab-active'));
                    modal.querySelectorAll('.skbp-tab-panel').forEach(p => p.style.display = 'none');
                    e.currentTarget.classList.add('skbp-tab-active');
                    modal.querySelector(`#skbp-tab-${idx}`).style.display = 'block';
                });
            });

            const setupCanListeners = () => {
                modal.querySelectorAll('.skbp-can-radio').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        const row = e.currentTarget.closest('.skbp-can-row');
                        const panel = row.closest('.skbp-tab-panel');
                        const idx = parseInt(panel.id.replace('skbp-tab-', ''), 10);
                        selectedCanName = row.dataset.canName;
                        this.saveSelection(bookKey, 'can', selectedCanName);
                        const t = tabsContent[idx];
                        panel.innerHTML = renderTabPanel(t, idx);
                        setupCanListeners();
                    });
                });
            };
            setupCanListeners();

            const setupAlcoholListeners = () => {
                modal.querySelectorAll('.skbp-alcohol-radio').forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        const row = e.currentTarget.closest('.skbp-alcohol-row');
                        const panel = row.closest('.skbp-tab-panel');
                        const idx = parseInt(panel.id.replace('skbp-tab-', ''), 10);
                        selectedAlcoholName = row.dataset.alcoholName;
                        this.saveSelection(bookKey, 'alcohol', selectedAlcoholName);
                        const t = tabsContent[idx];
                        panel.innerHTML = renderTabPanel(t, idx);
                        setupAlcoholListeners();
                    });
                });
            };
            setupAlcoholListeners();
        },

        removeModal() {
            document.getElementById(MODAL_ID)?.remove();
        },

        // ════════════════════════════════════════════════════════════════════════
        // Styles + utils
        // ════════════════════════════════════════════════════════════════════════

        injectStyles() {
            if (document.getElementById(STYLES_ID)) return;
            const style = document.createElement('style');
            style.id = STYLES_ID;
            style.textContent = `
                .sk-book-planner-btn:hover{background:#2e2e2e;}
            `;
            document.head.appendChild(style);
        },

        // " (40 inv + 10 case)" once the display case contributes to a count.
        breakdownText(inventoryCount, caseCount) {
            if (!caseCount || caseCount <= 0) return '';
            return ` (${(inventoryCount || 0).toLocaleString()} inv + ${caseCount.toLocaleString()} case)`;
        },

        escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },

        renderCompanyPaths(book, companyProfile, userCompanyTypeId) {
            let html = '';
            for (const [typeId, info] of Object.entries(COMPANY_BONUSES)) {
                for (const [star, bonuses] of Object.entries(info.stars).sort(([a], [b]) => Number(b) - Number(a))) {
                    if (Number(star) <= companyProfile.rating) {
                        for (const b of bonuses) {
                            let isActive = false;
                            let rowHtml = '';
                            if (book.statKey && b.type === 'gym_gain_boost' && b.target === book.statKey) {
                                isActive = userCompanyTypeId === Number(typeId) && companyProfile.rating >= Number(star);
                                rowHtml = '<div class="skbp-check-row"><span class="skbp-check-name">' + star + '* ' + this.escapeHtml(info.name) + '</span><span class="skbp-check-percent">' + b.percent + '% ' + book.statLabel + ' gym gains</span><span class="skbp-check-status ' + (isActive ? 'skbp-check-active' : 'skbp-check-inactive') + '">' + (isActive ? '✓ active' : '✗ not active') + '</span></div>';
                            } else if (!book.statKey && b.type === 'gym_gain_boost') {
                                isActive = userCompanyTypeId === Number(typeId) && companyProfile.rating >= Number(star);
                                const targetLabel = b.target ? b.target.charAt(0).toUpperCase() + b.target.slice(1) : 'all';
                                rowHtml = '<div class="skbp-check-row"><span class="skbp-check-name">' + star + '* ' + this.escapeHtml(info.name) + '</span><span class="skbp-check-percent">' + b.percent + '% ' + targetLabel + ' gym gains</span><span class="skbp-check-status ' + (isActive ? 'skbp-check-active' : 'skbp-check-inactive') + '">' + (isActive ? '✓ active' : '✗ not active') + '</span></div>';
                            } else if (!book.statKey && b.type === 'travel_items' && (book.companyBonusTypes || []).includes('travel_items') && (book.companyTypeIds || []).includes(Number(typeId))) {
                                isActive = userCompanyTypeId === Number(typeId) && companyProfile.rating >= Number(star);
                                rowHtml = '<div class="skbp-check-row"><span class="skbp-check-name">' + star + '* ' + this.escapeHtml(info.name) + '</span><span class="skbp-check-percent">' + b.count + ' extra travel items</span><span class="skbp-check-status ' + (isActive ? 'skbp-check-active' : 'skbp-check-inactive') + '">' + (isActive ? '✓ active' : '✗ not active') + '</span></div>';
                            } else if (!book.statKey && b.type === 'item_boost' && (book.companyBonusTypes || []).includes('item_boost') && (book.companyTypeIds || []).includes(Number(typeId))) {
                                isActive = userCompanyTypeId === Number(typeId) && companyProfile.rating >= Number(star);
                                rowHtml = '<div class="skbp-check-row"><span class="skbp-check-name">' + star + '* ' + this.escapeHtml(info.name) + '</span><span class="skbp-check-percent">' + b.percent + '% item boost (' + (b.target || 'all') + ')</span><span class="skbp-check-status ' + (isActive ? 'skbp-check-active' : 'skbp-check-inactive') + '">' + (isActive ? '✓ active' : '✗ not active') + '</span></div>';
                            }
                            if (rowHtml) html += rowHtml;
                        }
                    }
                }
            }
            return html || '<div class="skbp-empty">Company data unavailable.</div>';
        },

        // ════════════════════════════════════════════════════════════════════════
        // Public API
        // ════════════════════════════════════════════════════════════════════════

        calculateBoosterCans(durationDays, companyReduction = 0, baseCooldownHours = 2, boosterMaxHours = 0) {
            if (!durationDays || durationDays <= 0) return 0;
            const effectiveCooldownHours = baseCooldownHours * (1 - companyReduction);
            const cansPerDay = boosterMaxHours > 0 ? boosterMaxHours / effectiveCooldownHours : 24 / effectiveCooldownHours;
            return Math.ceil(cansPerDay * durationDays);
        },

        // Counts an item, split by source so callers can show the
        // "×A inventory + ×B display case" breakdown.
        collectItemCounts(inventory, itemName) {
            const target = String(itemName || '').toLowerCase();
            if (!target) return { inventory: 0, displayCase: 0, total: 0 };

            let exact = 0, partial = 0;
            let caseExact = 0, casePartial = 0;

            for (const item of this.getInventoryItems(inventory)) {
                const name = String(item.name || '').toLowerCase();
                const amount = Number(item.amount ?? item.count ?? item.quantity ?? 0);
                if (!Number.isFinite(amount)) continue;
                const isCase = item.skDisplayCase === true;
                if (name === target) {
                    if (isCase) caseExact += amount; else exact += amount;
                } else if (name.includes(target)) {
                    if (isCase) casePartial += amount; else partial += amount;
                }
            }

            const inventoryCount = exact || partial;
            const caseCount = caseExact || casePartial;
            return { inventory: inventoryCount, displayCase: caseCount, total: inventoryCount + caseCount };
        },

        getInventoryItemCount(inventory, itemName) {
            return this.collectItemCounts(inventory, itemName).total;
        },

        resolveHelperItem(inventory, item, boosterCooldown, durationDays, perkMultiplier = 1, nervePerkMultiplier = 1, caffeineConActive = false, companyReduction = 0, companyNerveMultiplier = 1, drugCooldown = 0, drugInventory = null, boosterMaxHours = 0) {
            let counts = this.collectItemCounts(inventory, item.name);
            let have = counts.total;
            let haveInventory = counts.inventory;
            let haveCase = counts.displayCase;
            if (drugInventory && item.calcType !== 'booster_cans' && inventory !== drugInventory) {
                const drugCounts = this.collectItemCounts(drugInventory, item.name);
                have += drugCounts.total;
                haveInventory += drugCounts.inventory;
                haveCase += drugCounts.displayCase;
            }
            let need = item.count !== null ? item.count : null;
            let note = '';
            let energyPerCan = null;
            if (item.calcType === 'booster_cans') {
                if (this.isAlcohol(item.name)) {
                    have = this.getTotalAlcoholCount(inventory);
                    need = this.calculateBoosterCans(durationDays, 0, 1, boosterMaxHours);
                    note = ' (est. by booster cooldown)';
                    energyPerCan = this.getAlcoholNerve(item.name, perkMultiplier * nervePerkMultiplier * companyNerveMultiplier);
                } else {
                    have = this.getTotalEnergyDrinkCount(inventory);
                    need = this.calculateBoosterCans(durationDays, companyReduction, 2, boosterMaxHours);
                    note = ' (est. by booster cooldown)';
                    energyPerCan = this.getCanEnergy(item.name, perkMultiplier, caffeineConActive);
                }
            } else if (item.calcType === 'drug_pills') {
                have = this.getInventoryItemCount(inventory, item.name);
                const minPerDay = 3; // 8h cooldown
                const maxPerDay = 4; // 6h cooldown
                need = Math.ceil(minPerDay * durationDays);
                note = ` (est. ${Math.ceil(minPerDay * durationDays)}–${Math.ceil(maxPerDay * durationDays)} needed, 3–4 per day)`;
            }
            return { name: item.name, have, haveInventory, haveCase, need, note, calcType: item.calcType, energyPerCan };
        },

        isEnergyDrink(name) {
            return this.getEnergyDrinkBaseEnergy(name) !== null
                || String(name || '').toLowerCase().includes('can')
                || String(name || '').toLowerCase().includes('taurine')
                || String(name || '').toLowerCase().includes('energy drink')
                || String(name || '').toLowerCase().includes('boost juice');
        },

        getEnergyDrinkBaseEnergy(name) {
            const n = String(name || '').toLowerCase();
            if (ENERGY_DRINKS_BY_NAME[n] !== undefined) return ENERGY_DRINKS_BY_NAME[n];
            for (const [key, energy] of Object.entries(ENERGY_DRINKS_BY_NAME)) {
                if (n.includes(key) || key.includes(n)) return energy;
            }
            return null;
        },

        getTotalEnergyDrinkCount(inventory) {
            let total = 0;
            for (const item of this.getInventoryItems(inventory)) {
                if (this.isEnergyDrink(item.name)) {
                    const count = Number(item.amount ?? item.count ?? item.quantity ?? 0);
                    if (Number.isFinite(count)) total += count;
                }
            }
            return total;
        },

        getAllCans(inventory) {
            const ownedCounts = {};
            const inventoryCounts = {};
            const caseCounts = {};
            for (const item of this.getInventoryItems(inventory)) {
                const name = String(item.name || '').toLowerCase();
                const count = Number(item.amount ?? item.count ?? item.quantity ?? 0);
                if (Number.isFinite(count) && this.isEnergyDrink(name)) {
                    ownedCounts[name] = (ownedCounts[name] || 0) + count;
                    if (item.skDisplayCase === true) {
                        caseCounts[name] = (caseCounts[name] || 0) + count;
                    } else {
                        inventoryCounts[name] = (inventoryCounts[name] || 0) + count;
                    }
                }
            }

            const allCans = Object.values(ENERGY_DRINKS_BY_ID).map(d => ({
                name: d.name,
                count: ownedCounts[d.name.toLowerCase()] || 0,
                inventoryCount: inventoryCounts[d.name.toLowerCase()] || 0,
                caseCount: caseCounts[d.name.toLowerCase()] || 0,
            }));
            return allCans.sort((a, b) => b.count - a.count);
        },

        getCanEnergy(canName, perkMultiplier = 1, caffeineConActive = false) {
            const n = String(canName || '').toLowerCase();
            const baseEnergy = this.getEnergyDrinkBaseEnergy(n);
            if (baseEnergy === null) return null;

            let totalEnergy = Math.round(baseEnergy * perkMultiplier);
            if (caffeineConActive) totalEnergy *= 2;
            return totalEnergy;
        },

        isAlcohol(name) {
            return this.getAlcoholBaseNerve(name) !== null
                || String(name || '').toLowerCase().includes('bottle of')
                || String(name || '').toLowerCase().includes('glass of');
        },

        getAlcoholBaseNerve(name) {
            const n = String(name || '').toLowerCase();
            if (ALCOHOLS_BY_NAME[n] !== undefined) return ALCOHOLS_BY_NAME[n];
            for (const [key, nerve] of Object.entries(ALCOHOLS_BY_NAME)) {
                if (n.includes(key) || key.includes(n)) return nerve;
            }
            return null;
        },

        getTotalAlcoholCount(inventory) {
            let total = 0;
            for (const item of this.getInventoryItems(inventory)) {
                if (this.isAlcohol(item.name)) {
                    const count = Number(item.amount ?? item.count ?? item.quantity ?? 0);
                    if (Number.isFinite(count)) total += count;
                }
            }
            return total;
        },

        getAllAlcohols(inventory) {
            const ownedCounts = {};
            const inventoryCounts = {};
            const caseCounts = {};
            for (const item of this.getInventoryItems(inventory)) {
                const name = String(item.name || '').toLowerCase();
                const count = Number(item.amount ?? item.count ?? item.quantity ?? 0);
                if (Number.isFinite(count) && this.isAlcohol(name)) {
                    ownedCounts[name] = (ownedCounts[name] || 0) + count;
                    if (item.skDisplayCase === true) {
                        caseCounts[name] = (caseCounts[name] || 0) + count;
                    } else {
                        inventoryCounts[name] = (inventoryCounts[name] || 0) + count;
                    }
                }
            }

            const allAlcohols = Object.values(ALCOHOLS_BY_ID).map(d => ({
                name: d.name,
                count: ownedCounts[d.name.toLowerCase()] || 0,
                inventoryCount: inventoryCounts[d.name.toLowerCase()] || 0,
                caseCount: caseCounts[d.name.toLowerCase()] || 0,
            }));
            return allAlcohols.sort((a, b) => b.count - a.count);
        },

        getAlcoholNerve(alcoholName, perkMultiplier = 1) {
            const n = String(alcoholName || '').toLowerCase();
            const baseNerve = this.getAlcoholBaseNerve(n);
            if (baseNerve === null) return null;
            return Math.round(baseNerve * perkMultiplier);
        },

        calculateBoosterCans(durationDays, companyReduction = 0, baseCooldownHours = 2, boosterMaxHours = 0) {
            if (!durationDays || durationDays <= 0) return 0;
            const effectiveCooldownHours = baseCooldownHours * (1 - companyReduction);
            const cansPerDay = boosterMaxHours > 0 ? boosterMaxHours / effectiveCooldownHours : 24 / effectiveCooldownHours;
            return Math.ceil(cansPerDay * durationDays);
        },

        async fetchUserPerks(authHeader) {
            try {
                const res = await this.fetchData(`https://api.torn.com/v2/user/perks?selections=perks`, { Authorization: authHeader });
                return res;
            } catch (e) {
                console.warn('📖 Book Planner: failed to fetch perks', e);
                return null;
            }
        },

        calculatePerkMultiplier(perkData) {
            if (!perkData) return 1;
            const perks = perkData.perks || perkData;
            const perkStrings = [];
            if (Array.isArray(perks.faction)) perkStrings.push(...perks.faction.map(String));
            if (Array.isArray(perks.job)) perkStrings.push(...perks.job.map(String));
            if (Array.isArray(perks.book)) perkStrings.push(...perks.book.map(String));

            return perkStrings
                .filter(x => /energy drinks/i.test(x) || /consumable gain/i.test(x))
                .map(x => {
                    const num = x.replaceAll(/\D+/g, '');
                    return num ? 1 + parseInt(num) / 100 : 1;
                })
                .reduce((total, m) => total * m, 1);
        },

        calculateNervePerkMultiplier(perkData) {
            if (!perkData) return 1;
            const perks = perkData.perks || perkData;
            const perkStrings = [];
            if (Array.isArray(perks.faction)) perkStrings.push(...perks.faction.map(String));
            if (Array.isArray(perks.job)) perkStrings.push(...perks.job.map(String));
            if (Array.isArray(perks.book)) perkStrings.push(...perks.book.map(String));

            return perkStrings
                .filter(x => /nerve gain from alcohol/i.test(x) || /alcohol/i.test(x))
                .map(x => {
                    const num = x.replaceAll(/\D+/g, '');
                    return num ? 1 + parseInt(num) / 100 : 1;
                })
                .reduce((total, m) => total * m, 1);
        },

        calculateMaxBoosterCooldown(perkData) {
            if (!perkData) return 24;
            const perks = perkData.perks || perkData;
            let total = 24;
            for (const category of Object.values(perks)) {
                if (!Array.isArray(category)) continue;
                for (const s of category) {
                    const str = String(s);
                    if (/maximum booster cooldown/i.test(str)) {
                        const num = str.replaceAll(/\D+/g, '');
                        if (num) total += parseInt(num);
                    }
                }
            }
            return total;
        },

        // ═══════════════════════════════════════════════════════════════════════════
        // Smart Company Bonus System
        // ═══════════════════════════════════════════════════════════════════════════

        getApplicableCompanyBonuses(companyProfile, tabType) {
            if (!companyProfile || !companyProfile.type || companyProfile.rating === undefined) return [];
            const typeId = companyProfile.type.id;
            const rating = companyProfile.rating;
            const companyInfo = COMPANY_BONUSES[typeId];
            if (!companyInfo) return [];
            const applicable = [];
            for (const [star, bonuses] of Object.entries(companyInfo.stars)) {
                const starNum = Number(star);
                if (starNum <= rating) {
                    for (const bonus of bonuses) {
                        if (bonus.target === 'all' || bonus.target === tabType) {
                            applicable.push({ ...bonus, star: starNum, company: companyInfo.name });
                        }
                    }
                }
            }
            return applicable;
        },

        calculateCompanyCooldownReduction(bonuses) {
            const reductionBonuses = bonuses.filter(b => b.type === 'cooldown_reduction');
            if (reductionBonuses.length === 0) return 0;
            let totalReduction = 0;
            for (const b of reductionBonuses) {
                totalReduction = 1 - (1 - totalReduction) * (1 - b.percent / 100);
            }
            return totalReduction;
        },

        calculateCompanyItemBoost(bonuses) {
            const boostBonuses = bonuses.filter(b => b.type === 'item_boost');
            if (boostBonuses.length === 0) return 1;
            let multiplier = 1;
            for (const b of boostBonuses) {
                multiplier *= (1 + b.percent / 100);
            }
            return multiplier;
        },

        calculateCompanyGymGainMultiplier(bonuses, statKey) {
            const gymBonuses = bonuses.filter(b => b.type === 'gym_gain_boost' && b.target === statKey);
            if (gymBonuses.length === 0) return 1;
            let multiplier = 1;
            for (const b of gymBonuses) {
                multiplier *= (1 + b.percent / 100);
            }
            return multiplier;
        },

        getAllCompanyBonusPaths(tabType) {
            const paths = [];
            for (const [typeId, info] of Object.entries(COMPANY_BONUSES)) {
                for (const [star, bonuses] of Object.entries(info.stars)) {
                    for (const bonus of bonuses) {
                        if (bonus.target === 'all' || bonus.target === tabType) {
                            paths.push({
                                company: info.name,
                                typeId: Number(typeId),
                                star: Number(star),
                                type: bonus.type,
                                percent: bonus.percent,
                                target: bonus.target,
                            });
                        }
                    }
                }
            }
            return paths;
        },

        async fetchCalendar(authHeader) {
            try {
                const res = await this.fetchData(`https://api.torn.com/v2/torn/calendar?selections=calendar`, { Authorization: authHeader });
                return res;
            } catch (e) {
                console.warn('📖 Book Planner: failed to fetch calendar', e);
                return null;
            }
        },

        isCaffeineConActive(calendarData) {
            if (!calendarData) return false;
            const events = calendarData.calendar?.events || [];
            const now = Date.now();
            return events.some(e => {
                if (!e.title || !e.title.toLowerCase().includes('caffeinecon')) return false;
                const start = new Date(e.start * 1000).getTime();
                const end = new Date(e.end * 1000).getTime();
                return now >= start && now <= end;
            });
        },

        getBookData() {
            return BOOKS;
        },
    };

    window.SidekickModules.BookPlanner = BookPlannerModule;
    console.log('📖 Book Planner module registered');
})();

