/**
 * Sidekick - Debt Receipt Sharing
 * Adds reciprocal debt/loan imports to Debt Tracker receipts.
 */

(() => {
    'use strict';

    const VERSION = '1';
    const HASH_PREFIX = '#sidekick-debt?';
    const LINK_TEXT = 'Add to your Sidekick Debt Tracker';
    const INTEREST_TYPES = new Set(['none', 'daily', 'weekly', 'flat', 'apr']);

    const DebtReceiptSharing = {
        debt: null,
        identity: null,
        observer: null,
        initialized: false,

        async init() {
            if (this.initialized) return;
            this.initialized = true;
            this.debt = window.SidekickModules.Debt;

            // Replace the original receipt generator.
            this.debt.generateReceipt = entryId => this.generateReceipt(entryId);
            this.startLinkHandling();

            try {
                await this.getIdentity();
            } catch (error) {
                console.warn(
                    '💰 Debt receipt identity unavailable:',
                    error.message
                );
            }

            await this.processImportLink();
            console.log('💰 Debt Receipt Sharing initialized');
        },

        makeAgreementId() {
            if (globalThis.crypto?.randomUUID) {
                return `skd_${globalThis.crypto.randomUUID()}`;
            }

            return `skd_${Date.now().toString(36)}_${Math.random()
                .toString(36)
                .slice(2, 12)}`;
        },

        formatPlayer(playerName, playerId) {
            const name = String(playerName || 'Player').trim();
            const id = String(playerId || '').trim();

            if (!id || name.includes(`[${id}]`)) {
                return name;
            }

            return `${name} [${id}]`;
        },

        async getIdentity(force = false) {
            if (!force && this.identity?.playerId) {
                return this.identity;
            }

            if (!this.debt?.apiKey) {
                throw new Error(
                    'Add an API key in Sidekick settings to verify receipts.'
                );
            }

            const response = await this.debt.makeApiCallViaBackground(
                this.debt.apiKey,
                ['profile']
            );

            const profile =
                response?.profile?.profile || response?.profile;

            const playerId = String(
                profile?.player_id ?? profile?.id ?? ''
            );

            if (
                !response?.success ||
                !/^\d{1,10}$/.test(playerId)
            ) {
                throw new Error(
                    'Sidekick could not verify the logged-in Torn player.'
                );
            }

            this.identity = {
                playerId,
                playerName: String(
                    profile?.name || `Player [${playerId}]`
                )
            };

            return this.identity;
        },

        buildImportLink(entry, identity) {
            entry.agreementId ||= this.makeAgreementId();

            const parameters = new URLSearchParams({
                v: VERSION,
                agreement: entry.agreementId,
                from: identity.playerId,
                fromName: identity.playerName,
                to: String(entry.playerId),
                kind: entry.isDebt ? 'loan' : 'debt',
                original: String(Number(entry.originalAmount || 0)),
                balance: String(Number(entry.currentAmount || 0)),
                interest: entry.interestType || 'none',
                rate: String(Number(entry.interestRate || 0)),
                created: String(
                    Math.floor(
                        new Date(entry.createdAt).getTime() / 1000
                    )
                ),
                snapshot: String(Math.floor(Date.now() / 1000)),
                due: entry.dueDate
                    ? String(
                        Math.floor(
                            new Date(entry.dueDate).getTime() / 1000
                        )
                    )
                    : '0'
            });

            if (entry.notes) {
                parameters.set(
                    'notes',
                    String(entry.notes).slice(0, 240)
                );
            }

            if (entry.frozen) {
                parameters.set('frozen', '1');
            }

            return `https://www.torn.com/index.php${HASH_PREFIX}${parameters.toString()}`;
        },

        parseImportLink(hash = window.location.hash) {
            if (!hash.startsWith(HASH_PREFIX)) {
                return null;
            }

            const parameters = new URLSearchParams(
                hash.slice(HASH_PREFIX.length)
            );

            if (parameters.get('v') !== VERSION) {
                throw new Error('Unsupported receipt version.');
            }

            const receipt = {
                agreementId: String(
                    parameters.get('agreement') || ''
                ),
                fromPlayerId: String(
                    parameters.get('from') || ''
                ),
                fromPlayerName: String(
                    parameters.get('fromName') || ''
                ),
                toPlayerId: String(
                    parameters.get('to') || ''
                ),
                kind: String(parameters.get('kind') || ''),
                originalAmount: Number(
                    parameters.get('original')
                ),
                currentAmount: Number(
                    parameters.get('balance')
                ),
                interestType: String(
                    parameters.get('interest') || 'none'
                ),
                interestRate: Number(
                    parameters.get('rate') || 0
                ),
                createdTimestamp: Number(
                    parameters.get('created')
                ),
                snapshotTimestamp: Number(
                    parameters.get('snapshot')
                ),
                dueTimestamp: Number(
                    parameters.get('due') || 0
                ),
                notes: String(
                    parameters.get('notes') || ''
                ).slice(0, 240),
                frozen: parameters.get('frozen') === '1'
            };

            if (
                !/^[A-Za-z0-9_-]{8,80}$/.test(
                    receipt.agreementId
                )
            ) {
                throw new Error('Invalid agreement ID.');
            }

            if (
                !/^\d{1,10}$/.test(receipt.fromPlayerId) ||
                !/^\d{1,10}$/.test(receipt.toPlayerId)
            ) {
                throw new Error('Invalid player information.');
            }

            if (!['debt', 'loan'].includes(receipt.kind)) {
                throw new Error('Invalid debt type.');
            }

            if (
                !Number.isFinite(receipt.originalAmount) ||
                receipt.originalAmount <= 0 ||
                receipt.originalAmount > Number.MAX_SAFE_INTEGER
            ) {
                throw new Error('Invalid original amount.');
            }

            if (
                !Number.isFinite(receipt.currentAmount) ||
                receipt.currentAmount < 0 ||
                receipt.currentAmount > Number.MAX_SAFE_INTEGER
            ) {
                throw new Error('Invalid current balance.');
            }

            if (!INTEREST_TYPES.has(receipt.interestType)) {
                throw new Error('Invalid interest type.');
            }

            if (
                !Number.isFinite(receipt.interestRate) ||
                receipt.interestRate < 0 ||
                receipt.interestRate > 100000
            ) {
                throw new Error('Invalid interest rate.');
            }

            const earliest =
                Date.UTC(2004, 0, 1) / 1000;
            const latest =
                Date.now() / 1000 + 86400;

            if (
                !Number.isFinite(receipt.createdTimestamp) ||
                receipt.createdTimestamp < earliest ||
                receipt.createdTimestamp > latest
            ) {
                throw new Error('Invalid start date.');
            }

            if (
                !Number.isFinite(receipt.snapshotTimestamp) ||
                receipt.snapshotTimestamp <
                    receipt.createdTimestamp ||
                receipt.snapshotTimestamp > latest
            ) {
                throw new Error('Invalid receipt date.');
            }

            if (
                receipt.dueTimestamp &&
                (
                    !Number.isFinite(receipt.dueTimestamp) ||
                    receipt.dueTimestamp < earliest
                )
            ) {
                throw new Error('Invalid due date.');
            }

            receipt.fromPlayerName =
                receipt.fromPlayerName
                    .replace(/[\u0000-\u001f\u007f]/g, '')
                    .slice(0, 64) ||
                `Player [${receipt.fromPlayerId}]`;

            receipt.notes = receipt.notes.replace(
                /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
                ''
            );

            receipt.createdAt = new Date(
                receipt.createdTimestamp * 1000
            ).toISOString();

            receipt.snapshotAt = new Date(
                receipt.snapshotTimestamp * 1000
            ).toISOString();

            receipt.dueDate = receipt.dueTimestamp
                ? new Date(
                    receipt.dueTimestamp * 1000
                ).toISOString()
                : null;

            return receipt;
        },

        generateReceipt(entryId) {
            const entry = this.debt.debtsAndLoans.find(
                item => item.id === entryId
            );

            if (!entry) {
                alert('Entry not found!');
                return;
            }

            if (!this.identity?.playerId) {
                this.getIdentity()
                    .then(() => {
                        this.debt.showToast(
                            '💰 Identity verified. Click Receipt again to copy it.'
                        );
                    })
                    .catch(error => {
                        this.debt.showToast(
                            `Receipt unavailable: ${error.message}`
                        );
                    });

                return;
            }

            const isDebt = Boolean(entry.isDebt);
            const originalAmount = Number(
                entry.originalAmount || 0
            );
            const currentAmount = Number(
                entry.currentAmount || 0
            );

            const totalPaid = (
                entry.repayments || []
            ).reduce(
                (sum, payment) =>
                    sum + (Number(payment.amount) || 0),
                0
            );

            const borrower = isDebt
                ? this.formatPlayer(
                    this.identity.playerName,
                    this.identity.playerId
                )
                : this.formatPlayer(
                    entry.playerName,
                    entry.playerId
                );

            const lender = isDebt
                ? this.formatPlayer(
                    entry.playerName,
                    entry.playerId
                )
                : this.formatPlayer(
                    this.identity.playerName,
                    this.identity.playerId
                );

            const interest =
                Number(entry.interestRate || 0) > 0
                    ? `${entry.interestRate}% ${entry.interestType}`
                    : 'No interest';

            const receipt =
`${isDebt ? 'Debt Owed Receipt' : 'Loan Given Receipt'}
-------------
Borrower: ${borrower}
Lender: ${lender}
Original Amount: $${originalAmount.toLocaleString()}
Interest: ${interest}
Remaining Balance: $${currentAmount.toLocaleString()}
Start Date: ${new Date(entry.createdAt).toLocaleDateString()}
Due Date: ${
    entry.dueDate
        ? new Date(entry.dueDate).toLocaleDateString()
        : 'No due date'
}
${entry.notes ? `Notes: ${entry.notes}` : 'Notes: None'}${
    totalPaid > 0
        ? `\nTotal Paid: $${totalPaid.toLocaleString()}`
        : ''
}${
    entry.frozen
        ? '\nStatus: FROZEN'
        : ''
}`;

            const importLink = this.buildImportLink(
                entry,
                this.identity
            );

            this.debt.saveDebtsAndLoans();

            this.copyReceipt(
                receipt,
                importLink,
                entry.playerName
            );
        },

        copyReceipt(receipt, importLink, playerName) {
            /*
             * The plain version contains only the URL.
             * Once Torn renders the URL, maskLinks() changes it into
             * the single LINK_TEXT hyperlink.
             *
             * This prevents the text from appearing twice.
             */
            const plainText =
                `${receipt}\n\n${importLink}`;

            const escapeHtml = value =>
                String(value).replace(
                    /[&<>"']/g,
                    character => ({
                        '&': '&amp;',
                        '<': '&lt;',
                        '>': '&gt;',
                        '"': '&quot;',
                        "'": '&#039;'
                    }[character])
                );

            const htmlText =
                `<div style="font-family:Arial,sans-serif;">` +
                `${escapeHtml(receipt).replace(/\n/g, '<br>')}` +
                `<p>` +
                `<a href="${escapeHtml(importLink)}">` +
                `${LINK_TEXT}` +
                `</a>` +
                `</p>` +
                `</div>`;

            const copyPlain = () =>
                navigator.clipboard.writeText(plainText);

            let operation;

            if (
                navigator.clipboard.write &&
                typeof ClipboardItem !== 'undefined' &&
                typeof Blob !== 'undefined'
            ) {
                try {
                    operation = navigator.clipboard.write([
                        new ClipboardItem({
                            'text/plain': new Blob(
                                [plainText],
                                { type: 'text/plain' }
                            ),
                            'text/html': new Blob(
                                [htmlText],
                                { type: 'text/html' }
                            )
                        })
                    ]).catch(copyPlain);
                } catch (_) {
                    operation = copyPlain();
                }
            } else {
                operation = copyPlain();
            }

            operation
                .then(() => {
                    this.debt.showToast(
                        `📋 Receipt copied to clipboard for ${playerName}!`
                    );
                })
                .catch(error => {
                    console.error(
                        'Failed to copy receipt:',
                        error
                    );

                    alert(
                        'Failed to copy receipt to clipboard. Please try again.'
                    );
                });
        },

        startLinkHandling() {
            const handleHash = () =>
                this.processImportLink();

            window.addEventListener(
                'hashchange',
                handleHash
            );

            this.maskLinks(document);

            if (!document.body) {
                return;
            }

            this.observer = new MutationObserver(
                mutations => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            this.maskLinks(node);
                        });
                    });
                }
            );

            this.observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        maskLinks(root) {
            const links = [];

            if (
                root?.nodeType === Node.ELEMENT_NODE &&
                root.matches?.('a[href]')
            ) {
                links.push(root);
            }

            root?.querySelectorAll?.('a[href]')
                .forEach(link => links.push(link));

            links.forEach(link => {
                try {
                    const url = new URL(
                        link.href,
                        window.location.origin
                    );

                    if (
                        url.hostname !== 'www.torn.com' ||
                        !url.hash.startsWith(HASH_PREFIX)
                    ) {
                        return;
                    }

                    link.textContent = LINK_TEXT;
                    link.title =
                        'Review this receipt before adding it';
                } catch (_) {
                    // Ignore malformed links rendered by Torn.
                }
            });
        },

        clearImportHash() {
            if (
                !window.location.hash.startsWith(HASH_PREFIX)
            ) {
                return;
            }

            window.history.replaceState(
                window.history.state,
                document.title,
                `${window.location.pathname}${window.location.search}`
            );
        },

        numbersMatch(first, second) {
            return (
                Math.abs(
                    Number(first || 0) -
                    Number(second || 0)
                ) < 0.01
            );
        },

        findExisting(receipt) {
            const agreementMatch =
                this.debt.debtsAndLoans.find(entry =>
                    entry.agreementId ===
                        receipt.agreementId ||
                    entry.sourceAgreementId ===
                        receipt.agreementId
                );

            if (agreementMatch) {
                return agreementMatch;
            }

            const receiptCreated = new Date(
                receipt.createdAt
            ).getTime();

            return (
                this.debt.debtsAndLoans.find(entry =>
                    String(entry.playerId) ===
                        receipt.fromPlayerId &&
                    Boolean(entry.isDebt) ===
                        (receipt.kind === 'debt') &&
                    this.numbersMatch(
                        entry.originalAmount,
                        receipt.originalAmount
                    ) &&
                    Math.abs(
                        new Date(
                            entry.createdAt
                        ).getTime() -
                        receiptCreated
                    ) <= 86400000
                ) || null
            );
        },

        needsUpdate(entry, receipt) {
            return (
                !this.numbersMatch(
                    entry.originalAmount,
                    receipt.originalAmount
                ) ||
                !this.numbersMatch(
                    entry.currentAmount,
                    receipt.currentAmount
                ) ||
                entry.interestType !==
                    receipt.interestType ||
                !this.numbersMatch(
                    entry.interestRate,
                    receipt.interestRate
                ) ||
                (
                    entry.dueDate
                        ? new Date(
                            entry.dueDate
                        ).getTime()
                        : 0
                ) !== (
                    receipt.dueDate
                        ? new Date(
                            receipt.dueDate
                        ).getTime()
                        : 0
                ) ||
                Boolean(entry.frozen) !==
                    receipt.frozen ||
                (
                    receipt.notes &&
                    entry.notes !== receipt.notes
                )
            );
        },

        applyReceipt(receipt, existing = null) {
            let entry = existing;

            if (!entry) {
                const placeholderName =
                    `Player [${receipt.fromPlayerId}]`;

                entry = receipt.kind === 'debt'
                    ? this.debt.createDebt(
                        receipt.fromPlayerId,
                        placeholderName,
                        receipt.originalAmount,
                        receipt.interestType,
                        receipt.interestRate,
                        receipt.notes,
                        receipt.dueDate
                    )
                    : this.debt.createLoan(
                        receipt.fromPlayerId,
                        placeholderName,
                        receipt.originalAmount,
                        receipt.interestType,
                        receipt.interestRate,
                        receipt.notes,
                        receipt.dueDate
                    );
            }

            entry.agreementId = receipt.agreementId;
            entry.sourceAgreementId =
                receipt.agreementId;
            entry.importedFromReceipt = true;
            entry.sharedByPlayerId =
                receipt.fromPlayerId;

            entry.type = receipt.kind;
            entry.isDebt =
                receipt.kind === 'debt';

            entry.playerId =
                receipt.fromPlayerId;
            entry.originalAmount =
                receipt.originalAmount;
            entry.principal =
                receipt.originalAmount;
            entry.currentAmount =
                receipt.currentAmount;
            entry.interestType =
                receipt.interestType;
            entry.interestRate =
                receipt.interestRate;
            entry.createdAt =
                receipt.createdAt;
            entry.lastInterestUpdate =
                receipt.snapshotAt;
            entry.dueDate =
                receipt.dueDate;
            entry.frozen =
                receipt.frozen;

            if (receipt.notes) {
                entry.notes = receipt.notes;
            }

            if (entry.currentAmount <= 0.01) {
                entry.completed = true;
                entry.completedAt ||=
                    receipt.snapshotAt;
            } else {
                entry.completed = false;
                delete entry.completedAt;
                delete entry.dismissed;
            }

            this.debt.saveDebtsAndLoans();
            this.debt.populateDebtTrackerWindow();

            return entry;
        },

        askForImport(receipt, identity, existing) {
            const isUpdate = Boolean(existing);

            const accent =
                receipt.kind === 'debt'
                    ? '#ef5350'
                    : '#4caf50';

            const sender = this.formatPlayer(
                receipt.fromPlayerName,
                receipt.fromPlayerId
            );

            const relationship =
                receipt.kind === 'debt'
                    ? `You owe ${sender}`
                    : `${sender} owes you`;

            return new Promise(resolve => {
                document
                    .getElementById(
                        'sidekick-debt-receipt-prompt'
                    )
                    ?.remove();

                const overlay =
                    document.createElement('div');

                overlay.id =
                    'sidekick-debt-receipt-prompt';

                overlay.style.cssText =
                    'position:fixed;' +
                    'inset:0;' +
                    'background:rgba(0,0,0,.72);' +
                    'display:flex;' +
                    'align-items:center;' +
                    'justify-content:center;' +
                    'z-index:10000000;' +
                    'padding:20px;';

                const panel =
                    document.createElement('div');

                panel.style.cssText =
                    `width:min(450px,100%);` +
                    `background:#242424;` +
                    `border:1px solid #555;` +
                    `border-top:4px solid ${accent};` +
                    `border-radius:8px;` +
                    `box-shadow:0 12px 40px rgba(0,0,0,.7);` +
                    `color:#fff;` +
                    `padding:20px;` +
                    `font-family:Arial,sans-serif;`;

                const title =
                    document.createElement('h3');

                title.textContent = isUpdate
                    ? 'Update Tracked Agreement?'
                    : 'Add to Your Debt Tracker?';

                title.style.cssText =
                    `margin:0 0 8px;` +
                    `font-size:18px;` +
                    `color:${accent};`;

                const verified =
                    document.createElement('div');

                verified.textContent =
                    `✓ Addressed to ${this.formatPlayer(
                        identity.playerName,
                        identity.playerId
                    )}`;

                verified.style.cssText =
                    'font-size:12px;' +
                    'color:#81c784;' +
                    'margin-bottom:14px;';

                const relation =
                    document.createElement('div');

                relation.textContent =
                    relationship;

                relation.style.cssText =
                    'font-size:15px;' +
                    'font-weight:bold;' +
                    'margin-bottom:12px;';

                const details =
                    document.createElement('div');

                details.textContent =
                    `Original: $${receipt.originalAmount.toLocaleString()}\n` +
                    `Balance: $${receipt.currentAmount.toLocaleString()}\n` +
                    `Interest: ${
                        receipt.interestRate > 0
                            ? `${receipt.interestRate}% ${receipt.interestType}`
                            : 'None'
                    }\n` +
                    `Due: ${
                        receipt.dueDate
                            ? new Date(
                                receipt.dueDate
                            ).toLocaleDateString()
                            : 'No due date'
                    }`;

                details.style.cssText =
                    'white-space:pre-line;' +
                    'background:#191919;' +
                    'border:1px solid #444;' +
                    'border-radius:6px;' +
                    'padding:12px;' +
                    'font-size:13px;' +
                    'line-height:1.7;';

                const note =
                    document.createElement('div');

                note.textContent = isUpdate
                    ? 'This agreement already exists. Accepting updates it instead of creating a duplicate.'
                    : 'Review the shared details before accepting.';

                note.style.cssText =
                    `margin-top:12px;` +
                    `font-size:12px;` +
                    `color:${
                        isUpdate
                            ? '#ffca28'
                            : '#bbb'
                    };`;

                const buttons =
                    document.createElement('div');

                buttons.style.cssText =
                    'display:flex;' +
                    'justify-content:flex-end;' +
                    'gap:8px;' +
                    'margin-top:18px;';

                const cancel =
                    document.createElement('button');

                cancel.textContent = 'Cancel';

                cancel.style.cssText =
                    'background:#555;' +
                    'border:1px solid #777;' +
                    'color:#fff;' +
                    'padding:8px 14px;' +
                    'border-radius:4px;' +
                    'cursor:pointer;';

                const accept =
                    document.createElement('button');

                accept.textContent = isUpdate
                    ? 'Update existing entry'
                    : 'Add to tracker';

                accept.style.cssText =
                    `background:${accent};` +
                    `border:1px solid ${accent};` +
                    `color:#fff;` +
                    `padding:8px 14px;` +
                    `border-radius:4px;` +
                    `cursor:pointer;` +
                    `font-weight:bold;`;

                const finish = result => {
                    overlay.remove();
                    resolve(result);
                };

                cancel.addEventListener(
                    'click',
                    () => finish(false)
                );

                accept.addEventListener(
                    'click',
                    () => finish(true)
                );

                buttons.append(cancel, accept);

                panel.append(
                    title,
                    verified,
                    relation,
                    details,
                    note,
                    buttons
                );

                overlay.appendChild(panel);
                document.body.appendChild(overlay);
            });
        },

        async processImportLink() {
            if (
                !window.location.hash.startsWith(
                    HASH_PREFIX
                )
            ) {
                return;
            }

            let receipt;

            try {
                receipt = this.parseImportLink();
            } catch (error) {
                this.clearImportHash();

                alert(
                    `Invalid Sidekick receipt: ${error.message}`
                );

                return;
            }

            this.clearImportHash();

            try {
                const identity =
                    await this.getIdentity(true);

                if (
                    identity.playerId !==
                    receipt.toPlayerId
                ) {
                    alert(
                        `This receipt is addressed to player ` +
                        `[${receipt.toPlayerId}], but Sidekick ` +
                        `verified you as ${this.formatPlayer(
                            identity.playerName,
                            identity.playerId
                        )}.`
                    );

                    return;
                }

                const existing =
                    this.findExisting(receipt);

                if (
                    existing &&
                    !this.needsUpdate(
                        existing,
                        receipt
                    )
                ) {
                    this.debt.showToast(
                        '💰 This agreement is already in your Debt Tracker and is up to date.'
                    );

                    return;
                }

                if (
                    !await this.askForImport(
                        receipt,
                        identity,
                        existing
                    )
                ) {
                    return;
                }

                this.applyReceipt(
                    receipt,
                    existing
                );

                this.debt.showToast(
                    existing
                        ? '💰 Existing Debt Tracker entry updated.'
                        : '💰 Shared receipt added to your Debt Tracker.'
                );
            } catch (error) {
                alert(
                    `Sidekick could not verify this receipt: ${error.message}`
                );
            }
        }
    };

    async function waitForDebtTracker() {
        for (
            let attempt = 0;
            attempt < 300;
            attempt++
        ) {
            if (
                window.SidekickModules?.Debt
                    ?.isInitialized
            ) {
                window.SidekickModules.DebtReceiptSharing =
                    DebtReceiptSharing;

                await DebtReceiptSharing.init();
                return;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 100)
            );
        }

        console.warn(
            '💰 Debt Receipt Sharing could not find the Debt Tracker module.'
        );
    }

    waitForDebtTracker();
})();