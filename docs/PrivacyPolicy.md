<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy — Sidekick</title>
  <meta name="description" content="Sidekick browser extension privacy policy and Torn API usage disclosure.">
  <style>
    :root {
      color-scheme: light dark;
      --green: #66BB6A;
      --green-dark: #3f9c44;
      --orange: #ffad5a;
      --border: #8886;
      --heading: #2c7a35;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --heading: #7fd484;
      }
    }

    body {
      max-width: 1000px;
      margin: 0 auto;
      padding: 32px 20px 64px;
      font: 16px/1.65 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }

    h1, h2, h3 {
      line-height: 1.25;
      color: var(--heading);
    }

    h1 {
      border-bottom: 3px solid var(--green);
      padding-bottom: 12px;
    }

    h2 {
      margin-top: 2.2em;
    }

    a {
      color: var(--green-dark);
      overflow-wrap: anywhere;
    }

    .table-wrap {
      overflow-x: auto;
      margin: 20px 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      min-width: 760px;
    }

    th, td {
      border: 1px solid var(--border);
      padding: 12px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #8882;
    }

    .notice {
      border-left: 4px solid var(--orange);
      padding: 12px 16px;
      background: #8881;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>Sidekick Privacy Policy</h1>
  <p><strong>Last updated:</strong> October 23, 2026</p>

  <p>
    <strong>Plain-language summary:</strong> Sidekick is a browser extension for
    Torn.com. It stores your settings, notes and feature data locally in your
    browser. Your Torn API key is stored locally and sent to Torn when an
    API-powered feature requests data. A small number of optional features can
    communicate with third-party services, described below. Sidekick contains
    no analytics, no trackers and no advertising, and does not sell your
    information.
  </p>

  <h2>1. Who we are</h2>
  <p>
    Sidekick is developed and maintained by Machiacelli as an open-source
    project. The source code is publicly available at
    <a href="https://github.com/Machiacelli/Sidekick">github.com/Machiacelli/Sidekick</a>,
    and the documentation is published at
    <a href="https://machiacelli.github.io/Sidekick/">machiacelli.github.io/Sidekick</a>.
    Questions about this policy or Sidekick's data handling can be raised
    through the GitHub repository (see <a href="#contact">Contact</a>).
  </p>

  <h2>2. Information Sidekick accesses</h2>
  <ul>
    <li>
      <strong>Torn account information:</strong> When you add a Torn API key,
      Sidekick can retrieve the information Torn's API returns for your player,
      according to the key's access level and the features you enable. Sidekick
      only requests the selections it needs for the features in use.
    </li>
    <li>
      <strong>Torn API key:</strong> The key you provide to enable
      API-powered features.
    </li>
    <li>
      <strong>Game page content:</strong> Sidekick runs on torn.com pages and
      reads the page content shown to you in order to add its interface
      features (for example, highlighting, fillers, alerts and timers).
    </li>
    <li>
      <strong>Preferences and locally stored content:</strong> Extension
      settings and the content you create in Sidekick — notes, to-do lists,
      link groups, target lists, debt records, timers and similar feature data.
    </li>
    <li>
      <strong>Bug report content:</strong> If you choose to submit a bug
      report, it contains the fields described in
      <a href="#bug-reports">Bug reports and screenshots</a>.
    </li>
  </ul>

  <h2 id="torn-api-disclosure">3. Torn API usage disclosure</h2>
  <p>
    Sidekick uses the Torn API to provide gameplay tools, statistics,
    calculations, reminders and notifications. API requests are sent to Torn's
    API servers, and your API key is included in requests that require it.
    In line with
    <a href="https://www.torn.com/api.html">Torn's API Terms of Service
    guidelines</a>, the table below describes how Sidekick handles your data
    and key. The same disclosure is shown inside the extension next to the
    field where you enter your API key.
  </p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Data Storage</th>
          <th>Data Sharing</th>
          <th>Purpose of Use</th>
          <th>Key Storage & Sharing</th>
          <th>Key Access Level</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            Persistent storage in the user's browser using Chrome extension
            storage. Some API responses may be cached temporarily in memory or
            locally.
          </td>
          <td>
            API requests are sent to Torn. Certain features may communicate
            with third-party services, such as YATA, TornProbability, Weav3r,
            TornWar, GitLab, or Sidekick's bug-reporting service.
          </td>
          <td>
            Provides gameplay tools, statistics, calculations, reminders,
            notifications, and other Sidekick features requested by the user.
          </td>
          <td>
            The Torn API key is stored locally in the user's browser and sent
            to Torn when required for API requests. It is not intentionally
            sent to Sidekick's bug-reporting service.
          </td>
          <td>
            Depends on the features used and the permissions granted to the
            API key. Users should grant only the minimum access required by
            their chosen features.
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <p class="notice">
    <strong>Tip:</strong> More features become available as your key's access
    level increases — Sidekick works best with a higher-access key. Torn lets
    you create a <em>custom</em> key with only the selections you are
    comfortable granting, which you can adjust or revoke at any time. Never
    provide your Torn password to any extension, script or website.
  </p>

  <h2>4. Where information is stored</h2>
  <p>
    Sidekick is local-first. Your settings, notes, lists and other feature data
    are stored in your browser's extension storage
    (<code>chrome.storage.local</code>) on your device. API responses used by
    features may be cached temporarily in memory while the extension runs, or
    locally between sessions. Locally stored information remains on your
    device until you remove it, clear the extension's data, or uninstall the
    extension.
  </p>
  <p>
    Sidekick's developer does not operate a central server that collects users'
    Torn API keys or personal information as part of the extension's normal
    use. This does not mean all information stays on your device: Torn receives
    API requests, and the optional integrations listed below communicate with
    third-party services when you use them.
  </p>

  <h2 id="third-party">5. Third-party services</h2>
  <p>
    Depending on the features you enable and use, Sidekick may communicate
    with the following services. Each integration is tied to a specific
    feature; features that do not use a service do not contact it.
  </p>
  <ul>
    <li>
      <a href="https://www.torn.com/api.html">Torn</a> — API requests for game
      data, made with your API key as described above.
    </li>
    <li>
      <a href="https://yata.yt/">YATA</a> — public travel market data used by
      the Travel Stocks feature. No personal information is sent.
    </li>
    <li>
      <a href="https://tornprobability.com/">TornProbability</a> — organized
      crime role-weight statistics used by the OC Weights feature. No personal
      information is sent.
    </li>
    <li>
      <a href="https://weav3r.dev/">Weav3r</a> — bazaar price data (item IDs
      only) used by the Bazaar/Price Filler features. No personal information
      is sent.
    </li>
    <li>
      <a href="https://gitlab.com/">GitLab</a> — a publicly hosted reference
      file (a common-password word list) used by the Cracking assistant. No
      personal information is sent.
    </li>
    <li>
      <a href="https://tornwar.com/">TornWar</a> — used by the FactionOps
      Target Caller. If you enable this feature, your Torn API key is sent to
      tornwar.com to authenticate you, and target claim information is shared
      with other faction members using the war room. This feature is intended
      for members of participating factions and can be switched off at any
      time.
    </li>
    <li>
      Sidekick's bug-reporting service — information you voluntarily submit
      when you report a bug (see below).
    </li>
    <li>
      <a href="https://fonts.google.com/">Google Fonts</a> — loads a font when
      the Legible Player Names feature is enabled. No personal information is
      sent.
    </li>
    <li>
      <a href="https://imgur.com/">Imgur</a> — loads a static background image
      when the Block Training feature is enabled. No personal information is
      sent.
    </li>
  </ul>
  <p>
    Third-party services process information under their own terms and privacy
    policies, which you should review before using an integration. Some
    services (YATA, TornProbability, Weav3r, GitLab, Google Fonts, Imgur)
    receive no personal information at all. Sidekick does not claim that every
    listed service is contacted in every session.
  </p>

  <h2 id="bug-reports">6. Bug reports and screenshots</h2>
  <p>
    Submitting a bug report is entirely optional. When you submit one, the
    following is transmitted to Sidekick's bug-reporting service so the issue
    can be reviewed and fixed:
  </p>
  <ul>
    <li>The <strong>title, description and priority</strong> you enter;</li>
    <li>Any <strong>screenshot</strong> you choose to attach;</li>
    <li>
      Basic technical <strong>metadata</strong>: your browser type, the
      Sidekick version, the submission time, and — as a convenience for
      follow-up — the Torn player name visible on the current page (or
      "Anonymous" if none is available).
    </li>
  </ul>
  <p>
    Do not include passwords, API keys, financial details or other sensitive
    information in reports or screenshots. Screenshots may capture whatever is
    visible on your screen at the time, so please review them before attaching.
  </p>

  <h2>7. API key handling</h2>
  <ul>
    <li>
      Your key is stored locally in your browser and is included in requests
      to Torn's API when a feature needs data.
    </li>
    <li>
      If you enable the FactionOps Target Caller, your key is also sent to
      tornwar.com for authentication (see
      <a href="#third-party">Third-party services</a>).
    </li>
    <li>
      Your key is not sent to Sidekick's bug-reporting service, is not shared
      with other Sidekick users, and no central Sidekick server stores it.
    </li>
    <li>
      Sidekick never asks for, stores or transmits your Torn password.
    </li>
  </ul>

  <h2>8. Sharing and sale of information</h2>
  <p>
    Sidekick does not sell, rent or trade your personal information. It does
    not include analytics, trackers or advertising of any kind. Information
    leaves your browser only in the ways described in this policy: API
    requests to Torn, feature requests to the third-party services listed
    above, and bug reports you choose to submit.
  </p>

  <h2>9. Security</h2>
  <p>
    Locally stored data is protected by the security of your browser and
    device. Data transmitted to Torn and third-party services uses encrypted
    HTTPS connections. Sidekick cannot guarantee the security practices or
    availability of external services; those services are responsible for the
    data they receive under their own policies.
  </p>

  <h2>10. Your choices and controls</h2>
  <ul>
    <li>
      <strong>Key permissions:</strong> grant only the API selections your
      features need — Torn supports custom keys for this purpose. You can
      revoke, replace or pause a key at any time through Torn's account
      preferences.
    </li>
    <li>
      <strong>Features:</strong> every Sidekick module can be toggled
      individually; integrations only run when their feature is enabled.
    </li>
    <li>
      <strong>Data:</strong> you can export a backup, clear stored data, or
      uninstall the extension to remove locally stored information.
    </li>
  </ul>

  <h2>11. Data retention and deletion</h2>
  <p>
    Locally stored Sidekick data is retained until you remove it (by clearing
    the extension's data or uninstalling the extension). Some histories are
    automatically trimmed by the extension itself, such as the 90-day battle
    stats window and the notification history. Information already transmitted
    to Torn or a third-party service, or included in a bug report, remains
    subject to those services' retention policies — bug reports are kept only
    as long as needed to investigate and fix the reported issue.
  </p>

  <h2>12. Children's privacy</h2>
  <p>
    Sidekick is a tool for players of Torn.com and is not directed at
    children. Torn is intended for adults, and Sidekick does not knowingly
    collect personal information from children through any
    account-registration or similar mechanism.
  </p>

  <h2>13. Changes to this policy</h2>
  <p>
    This policy may be updated when Sidekick's features, integrations or data
    practices change. The current version is always published at this URL,
    with the revision date shown at the top of the page.
  </p>

  <h2 id="contact">14. Contact</h2>
  <p>
    For questions about this policy or Sidekick's data handling, please open
    an issue in the
    <a href="https://github.com/Machiacelli/Sidekick">Sidekick GitHub
    repository</a>.
  </p>
</body>
</html>
