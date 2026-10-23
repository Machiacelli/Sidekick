# Sidekick Privacy Policy

**Last updated:** October 23, 2026

> **Plain-language summary:** Sidekick is a browser extension for Torn.com. It stores your settings, notes and feature data locally in your browser. Your Torn API key is stored locally and sent to Torn when an API-powered feature requests data. A small number of optional features can communicate with third-party services, described below. Sidekick contains no analytics, no trackers and no advertising, and does not sell your information.

## 1. Who we are

Sidekick is developed and maintained by Machiacelli as an open-source project. The source code is publicly available at [github.com/Machiacelli/Sidekick](https://github.com/Machiacelli/Sidekick), and the documentation is published at [machiacelli.github.io/Sidekick](https://machiacelli.github.io/Sidekick/). Questions about this policy or Sidekick's data handling can be raised through the GitHub repository (see [Contact](#14-contact)).

## 2. Information Sidekick accesses

- **Torn account information:** When you add a Torn API key, Sidekick can retrieve the information Torn's API returns for your player, according to the key's access level and the features you enable. Sidekick only requests the selections it needs for the features in use.
- **Torn API key:** The key you provide to enable API-powered features.
- **Game page content:** Sidekick runs on torn.com pages and reads the page content shown to you in order to add its interface features (for example, highlighting, fillers, alerts and timers).
- **Preferences and locally stored content:** Extension settings and the content you create in Sidekick — notes, to-do lists, link groups, target lists, debt records, timers and similar feature data.
- **Bug report content:** If you choose to submit a bug report, it contains the fields described in [Bug reports and screenshots](#6-bug-reports-and-screenshots).

## 3. Torn API usage disclosure

Sidekick uses the Torn API to provide gameplay tools, statistics, calculations, reminders and notifications. API requests are sent to Torn's API servers, and your API key is included in requests that require it. In line with [Torn's API Terms of Service guidelines](https://www.torn.com/api.html), the table below describes how Sidekick handles your data and key. The same disclosure is shown inside the extension next to the field where you enter your API key.

| Data Storage | Data Sharing | Purpose of Use | Key Storage & Sharing | Key Access Level |
| --- | --- | --- | --- | --- |
| Persistent storage in the user's browser using Chrome extension storage. Some API responses may be cached temporarily in memory or locally. | API requests are sent to Torn. Certain features may communicate with third-party services, such as YATA, TornProbability, Weav3r, TornWar, GitLab, or Sidekick's bug-reporting service. | Provides gameplay tools, statistics, calculations, reminders, notifications, and other Sidekick features requested by the user. | The Torn API key is stored locally in the user's browser and sent to Torn when required for API requests. It is not intentionally sent to Sidekick's bug-reporting service. | Depends on the features used and the permissions granted to the API key. Users should grant only the minimum access required by their chosen features. |

> **Tip:** More features become available as your key's access level increases — Sidekick works best with a higher-access key. Torn lets you create a *custom* key with only the selections you are comfortable granting, which you can adjust or revoke at any time. Never provide your Torn password to any extension, script or website.

## 4. Where information is stored

Sidekick is local-first. Your settings, notes, lists and other feature data are stored in your browser's extension storage (`chrome.storage.local`) on your device. API responses used by features may be cached temporarily in memory while the extension runs, or locally between sessions. Locally stored information remains on your device until you remove it, clear the extension's data, or uninstall the extension.

Sidekick's developer does not operate a central server that collects users' Torn API keys or personal information as part of the extension's normal use. This does not mean all information stays on your device: Torn receives API requests, and the optional integrations listed below communicate with third-party services when you use them.

## 5. Third-party services

Depending on the features you enable and use, Sidekick may communicate with the following services. Each integration is tied to a specific feature; features that do not use a service do not contact it.

- [Torn](https://www.torn.com/api.html) — API requests for game data, made with your API key as described above.
- [YATA](https://yata.yt/) — public travel market data used by the Travel Stocks feature. No personal information is sent.
- [TornProbability](https://tornprobability.com/) — organized crime role-weight statistics used by the OC Weights feature. No personal information is sent.
- [Weav3r](https://weav3r.dev/) — bazaar price data (item IDs only) used by the Bazaar/Price Filler features. No personal information is sent.
- [GitLab](https://gitlab.com/) — a publicly hosted reference file (a common-password word list) used by the Cracking assistant. No personal information is sent.
- [TornWar](https://tornwar.com/) — used by the FactionOps Target Caller. If you enable this feature, your Torn API key is sent to tornwar.com to authenticate you, and target claim information is shared with other faction members using the war room. This feature is intended for members of participating factions and can be switched off at any time.
- Sidekick's bug-reporting service — information you voluntarily submit when you report a bug (see below).
- [Google Fonts](https://fonts.google.com/) — loads a font when the Legible Player Names feature is enabled. No personal information is sent.
- [Imgur](https://imgur.com/) — loads a static background image when the Block Training feature is enabled. No personal information is sent.

Third-party services process information under their own terms and privacy policies, which you should review before using an integration. Some services (YATA, TornProbability, Weav3r, GitLab, Google Fonts, Imgur) receive no personal information at all. Sidekick does not claim that every listed service is contacted in every session.

## 6. Bug reports and screenshots

Submitting a bug report is entirely optional. When you submit one, the following is transmitted to Sidekick's bug-reporting service so the issue can be reviewed and fixed:

- The **title, description and priority** you enter;
- Any **screenshot** you choose to attach;
- Basic technical **metadata**: your browser type, the Sidekick version, the submission time, and — as a convenience for follow-up — the Torn player name visible on the current page (or "Anonymous" if none is available).

Do not include passwords, API keys, financial details or other sensitive information in reports or screenshots. Screenshots may capture whatever is visible on your screen at the time, so please review them before attaching.

## 7. API key handling

- Your key is stored locally in your browser and is included in requests to Torn's API when a feature needs data.
- If you enable the FactionOps Target Caller, your key is also sent to tornwar.com for authentication (see [Third-party services](#5-third-party-services)).
- Your key is not sent to Sidekick's bug-reporting service, is not shared with other Sidekick users, and no central Sidekick server stores it.
- Sidekick never asks for, stores or transmits your Torn password.

## 8. Sharing and sale of information

Sidekick does not sell, rent or trade your personal information. It does not include analytics, trackers or advertising of any kind. Information leaves your browser only in the ways described in this policy: API requests to Torn, feature requests to the third-party services listed above, and bug reports you choose to submit.

## 9. Security

Locally stored data is protected by the security of your browser and device. Data transmitted to Torn and third-party services uses encrypted HTTPS connections. Sidekick cannot guarantee the security practices or availability of external services; those services are responsible for the data they receive under their own policies.

## 10. Your choices and controls

- **Key permissions:** grant only the API selections your features need — Torn supports custom keys for this purpose. You can revoke, replace or pause a key at any time through Torn's account preferences.
- **Features:** every Sidekick module can be toggled individually; integrations only run when their feature is enabled.
- **Data:** you can export a backup, clear stored data, or uninstall the extension to remove locally stored information.

## 11. Data retention and deletion

Locally stored Sidekick data is retained until you remove it (by clearing the extension's data or uninstalling the extension). Some histories are automatically trimmed by the extension itself, such as the 90-day battle stats window and the notification history. Information already transmitted to Torn or a third-party service, or included in a bug report, remains subject to those services' retention policies — bug reports are kept only as long as needed to investigate and fix the reported issue.

## 12. Children's privacy

Sidekick is a tool for players of Torn.com and is not directed at children. Torn is intended for adults, and Sidekick does not knowingly collect personal information from children through any account-registration or similar mechanism.

## 13. Changes to this policy

This policy may be updated when Sidekick's features, integrations or data practices change. The current version is always published with the revision date shown at the top of the page.

## 14. Contact

For questions about this policy or Sidekick's data handling, please open an issue in the [Sidekick GitHub repository](https://github.com/Machiacelli/Sidekick).
