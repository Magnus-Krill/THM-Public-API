const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderDownloads(builds) {
    const rows = builds?.map(build => {
        const { minecraft, channel, version, pathname, sha256 } = build;
        const stable = channel === 'STABLE';
        const heading = stable ? 'Stable' : 'Development';
        return `<li class="build ${stable ? 'stable' : ''}">
    <div>
        <h3>${heading}</h3>
        <p>Addon ${escapeHtml(version)} · Minecraft ${escapeHtml(minecraft)}</p>
    </div>
    <a class="download" href="${pathname}" download>Download ${heading.toLowerCase()} JAR</a>
    <details><summary>SHA-256 checksum</summary><code>${sha256}</code></details>
</li>`;
    }).join('');
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Download stable and development builds of THM Addons for Meteor Client.">
    <title>THM Addons Downloads</title>
    <link rel="stylesheet" href="/updates/style.css">
</head>
<body>
    <header class="wrap"><a class="brand" href="https://highwaymen.cc/">The Highway Men</a><a href="https://github.com/Magnus-Krill/THM-Addons">Addon source</a></header>
    <main class="wrap">
        <h1>THM Addons</h1>
        <p class="intro">Download the JAR for your Minecraft version and install it in Meteor Client.</p>
        <section aria-labelledby="builds">
            <h2 id="builds">Latest builds</h2>
            ${rows ? `<ul class="builds">${rows}</ul>` : `<p>${builds ? 'No builds have been published yet.' : 'Downloads are temporarily unavailable. Reload this page in a minute.'}</p>`}
        </section>
        <section aria-labelledby="install" class="install">
            <h2 id="install">Install the addon</h2>
            <ol>
                <li>Choose the JAR for your Minecraft version. Stable is the release build. Development gets newer changes first.</li>
                <li>Put the JAR in your Minecraft <code>mods</code> folder. Remove any older THM Addons JAR.</li>
                <li>Launch your Fabric profile with Meteor Client, Fabric API, and Baritone. Check the <a href="https://github.com/Magnus-Krill/THM-Addons#requirements">version requirements</a>.</li>
            </ol>
        </section>
    </main>
    <footer class="wrap">
        <a href="https://github.com/Magnus-Krill/THM-Updater">Publisher source</a>
        <a href="https://github.com/Magnus-Krill/THM-Public-API">Download service source</a>
        <a href="/updates/feed.json">Signed feed</a>
    </footer>
</body>
</html>`;
}

export const styles = `
:root {
    color-scheme: dark;
    font: 100%/1.6 system-ui, sans-serif;
    color: #edf4f5;
    background: #121d21;
    --muted: #b7c7c8;
    --line: #466269;
    --accent: #a9e0c9;
}
* { box-sizing: border-box; }
body { margin: 0; }
.wrap { width: min(100% - 2.5rem, 54rem); margin-inline: auto; }
header, footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .7rem 1.5rem; padding-block: 1.15rem; }
header { border-bottom: 1px solid var(--line); }
a { color: var(--accent); text-underline-offset: .22em; }
a:focus-visible, summary:focus-visible { outline: 2px solid #ffdc90; outline-offset: 4px; }
.brand { color: inherit; font-weight: 750; }
main { padding-block: clamp(2rem, 6vw, 4.5rem) 1.5rem; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: clamp(2.75rem, 9vw, 5.3rem); letter-spacing: -.065em; line-height: 1.05; }
h2 { font-size: 1.35rem; margin-bottom: .8rem; }
h3 { font-size: 1.2rem; }
.intro { font-size: 1.1rem; margin: .85rem 0 2.75rem; color: var(--muted); }
.builds { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; }
.build {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: .45rem 1rem;
    padding: .95rem 1.15rem;
    border: 1px solid var(--line);
    border-radius: .5rem;
    background: #1a2a30;
}
.stable { border-inline-start: .3rem solid var(--accent); padding-inline-start: .9rem; }
.build p, details, footer { color: var(--muted); }
.download {
    text-align: center;
    padding: .55rem .9rem;
    border: 1px solid var(--accent);
    border-radius: .25rem;
    text-decoration: none;
    font-weight: 700;
}
.stable .download { color: #12241f; background: var(--accent); }
.download:hover { background: #2a4544; }
.stable .download:hover { background: #c6f0de; }
details { grid-column: 1 / -1; font-size: .875rem; }
summary { width: fit-content; cursor: pointer; }
details code { overflow-wrap: anywhere; }
.install { margin-top: 2.5rem; }
ol { padding-left: 1.4rem; }
ol li + li { margin-top: .45rem; }
footer { justify-content: flex-start; border-top: 1px solid var(--line); font-size: .9rem; }
@media (max-width: 36rem) {
    .build { grid-template-columns: 1fr; gap: .65rem; }
}
`;
