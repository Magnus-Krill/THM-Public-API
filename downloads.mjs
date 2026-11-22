import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt({ html: false }).disable('image');
const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const site = 'https://highwaymen.cc';
const addon = 'https://github.com/Magnus-Krill/THM-Addons';
const channels = { STABLE: 'Stable', DEV: 'Development' };

function buildNotes({ commit, notes, sha256 }) {
    return `<div class="release-notes">
        ${notes.trim() ? markdown.render(notes) : '<p>No notes were published for this build.</p>'}
        <p class="build-meta"><a href="${addon}/commit/${commit}">Source commit ${commit.slice(0, 7)}</a></p>
        <details class="checksum"><summary>SHA-256 checksum</summary><code>${sha256}</code></details>
    </div>`;
}

function latestCard(build) {
    const { channel, version, minecraft, pathname } = build;
    const label = channels[channel];
    return `<article class="download-card">
        <p class="kicker">${label}</p>
        <h3>Addon ${escapeHtml(version)}</h3>
        <p class="meta">Minecraft ${minecraft}</p>
        <a class="btn ${channel === 'STABLE' ? 'btn-signal' : 'btn-line'}" href="${pathname}" download>Download ${label.toLowerCase()} JAR</a>
        <details><summary>Read release notes</summary>${buildNotes(build)}</details>
    </article>`;
}

function historyGroup(builds, channel, version) {
    const rows = builds.filter(build => build.channel === channel);
    if (!rows.length) return '';
    const heading = `history-${version}-${channel.toLowerCase()}`;
    return `<section class="history-group" aria-labelledby="${heading}">
        <h3 id="${heading}">${channels[channel]}</h3>
        <ul>${rows.map(build => `<li>
            <details class="history-entry">
                <summary><strong>Addon ${escapeHtml(build.version)}</strong>
                    <span class="meta">${build.commit.slice(0, 7)}</span>
                </summary>
                ${buildNotes(build)}
            </details>
            <a class="btn btn-line" href="${build.pathname}" download aria-label="Download ${channels[channel].toLowerCase()} addon ${escapeHtml(build.version)}, commit ${build.commit.slice(0, 7)}">Download JAR</a>
        </li>`).join('')}</ul>
    </section>`;
}

export function renderDownloads(builds) {
    const versions = [...new Set(builds?.map(build => build.minecraft))];
    const sections = versions.map(version => {
        const entries = builds.filter(build => build.minecraft === version);
        const latest = Object.keys(channels).map(channel => entries.find(build => build.channel === channel)).filter(Boolean);
        return { version, latest, history: entries.filter(build => !latest.includes(build)) };
    });
    return `<!doctype html>
<html lang="en" data-theme="light">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Download THM Addons for Meteor Client and read the release notes.">
    <meta name="theme-color" content="#f3efe8">
    <title>THM Addons Downloads · The Highway Men</title>
    <link rel="icon" type="image/webp" href="/updates/thm.webp">
    <script src="/updates/theme.js"></script>
    <link rel="stylesheet" href="/updates/downloads.css">
</head>
<body>
    <a class="skip-link" href="#content">Skip to content</a>
    <nav class="nav" aria-label="Main">
        <a class="nav-logo" href="${site}/" aria-label="The Highway Men, home"><img src="/updates/thm.webp" alt="" width="32" height="32"><span>THM<span class="nav-wordmark">The Highway Men</span></span></a>
        <ul class="nav-links" id="nav-menu">
            ${[['Home', '/'], ['Network', '/network/'], ['Players', '/players/'], ['Achievements', '/achievements/'], ['Story', '/about/']].map(([label, href]) => `<li><a href="${site}${href}">${label}</a></li>`).join('')}
            <li><a href="/updates/" aria-current="page">Downloads</a></li>
        </ul>
        <div class="nav-right">
            <button class="theme-toggle" type="button" aria-label="Switch to dark theme"><span aria-hidden="true">◐</span></button>
            <a class="nav-cta" href="https://discord.gg/thm">Join Discord <span aria-hidden="true">↗</span></a>
            <button class="nav-burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu"><span></span><span></span><span></span></button>
        </div>
    </nav>
    <main id="content" tabindex="-1">
        <header class="wrap page-intro">
            <h1>THM Addons<span class="accent">.</span></h1>
            <p class="lede">Download the addon for Meteor Client, browse builds and read release notes.</p>
            <div class="hero-actions"><a class="btn btn-signal" href="#latest">Latest builds</a><a class="text-link" href="#history">Build history</a></div>
        </header>
        <section class="band" id="latest" aria-labelledby="latest-heading">
            <div class="wrap">
                <h2 id="latest-heading">Latest builds</h2>
                ${sections.length ? sections.map(({ version, latest }) => `<section class="version-group" aria-label="Minecraft ${version}"><div class="download-grid">${latest.map(latestCard).join('')}</div></section>`).join('') : `<p>${builds ? 'No builds have been published yet.' : 'Downloads are temporarily unavailable. Reload this page in a minute.'}</p>`}
            </div>
        </section>
        <section class="band" id="history" aria-labelledby="history-heading">
            <div class="wrap">
                <div class="section-heading"><h2 id="history-heading">Build history</h2><a class="text-link" href="${addon}/releases">GitHub release archive <span aria-hidden="true">↗</span></a></div>
                ${sections.some(({ history }) => history.length) ? sections.filter(({ history }) => history.length).map(({ version, history }) => `<section class="version-group" aria-label="Minecraft ${version}">
                    <p class="kicker">Minecraft ${version}</p>
                    ${Object.keys(channels).map(channel => historyGroup(history, channel, version)).join('')}
                </section>`).join('') : '<p>No previous builds are listed in the signed feed.</p>'}
            </div>
        </section>
        <section class="band install">
            <div class="wrap prose">
                <h2>Install the addon</h2>
                <ol>
                    <li>Download a JAR for your Minecraft version.</li>
                    <li>Replace any older THM Addons JAR in your Minecraft <code>mods</code> folder.</li>
                    <li>Launch Fabric with Meteor Client, Fabric API, and Baritone. Check the <a href="${addon}#requirements">version requirements</a>.</li>
                </ol>
            </div>
        </section>
    </main>
    <footer class="foot">
        <div class="wrap foot-lines">
            <a class="foot-brand" href="${site}/">The Highway Men</a>
            <div class="foot-links">
                <a href="${addon}">Addon source</a>
                <a href="https://github.com/Magnus-Krill/THM-Updater">Publisher source</a>
                <a href="https://github.com/Magnus-Krill/THM-Public-API">Download service source</a>
                <a href="/updates/feed.json">Signed feed</a>
            </div>
        </div>
    </footer>
</body>
</html>`;
}
