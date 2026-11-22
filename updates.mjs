import fs, { constants } from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { renderDownloads } from './downloads.mjs';

const jarLimit = 32 * 1024 * 1024;
const feedLimit = 1024 * 1024;
const livePublicKey = 'MCowBQYDK2VwAyEABOC016sw9YhavsewbR+jG1sQglaxVKGv9ikvq1kSYYA=';
const commitPattern = /^[a-f0-9]{40}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^[0-9][A-Za-z0-9._-]{0,19}$/;
const jarPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\/(?:dev\/[a-f0-9]{40}|stable\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99})\.jar$/;
const pageAssets = new Set(['downloads.css', 'theme.js', 'thm.webp', 'archivo.woff2']);

function updaterFiles(root) {
    return async (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        const name = req.path.slice(1);
        const jar = jarPattern.test(name);
        if (name !== 'feed.json' && !jar) return res.sendStatus(404);
        let handle;
        try {
            const [realRoot, file] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(path.join(root, name))]);
            if (file !== path.join(realRoot, name)) return res.sendStatus(404);
            handle = await fs.promises.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > (jar ? jarLimit : feedLimit)) return res.sendStatus(503);
            if (jar) res.set('Content-Disposition', `attachment; filename="THM-Addons-${name.split('/')[0]}-${path.basename(name)}"`);
            res.set({
                'Cache-Control': jar ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
                'Content-Type': jar ? 'application/java-archive' : 'application/json',
                'ETag': `W/"${stat.ino}-${stat.size}-${stat.mtimeMs}"`
            });
            if (req.fresh) return res.status(304).end();
            res.set('Content-Length', String(stat.size));
            if (req.method === 'HEAD') return res.end();
            const stream = handle.createReadStream();
            handle = undefined;
            stream.on('error', next);
            res.on('close', () => stream.destroy());
            stream.pipe(res);
        } catch (err) {
            if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(err.code)) return res.sendStatus(404);
            next(err);
        } finally {
            await handle?.close();
        }
    };
}

function readDownloads(raw, key) {
    const envelope = JSON.parse(raw);
    const payload = Buffer.from(envelope.payload, 'base64');
    const signature = Buffer.from(envelope.signature, 'base64');
    if (!verify(null, payload, key, signature)) throw new Error('Invalid feed signature');
    const { format, entries } = JSON.parse(payload);
    if (format !== 1 || !Array.isArray(entries) || entries.length > 100) throw new Error('Invalid update entries');
    const builds = new Map();
    for (const entry of entries) {
        const { branch, channel, commit, minecraft, notes, sha256, url, version } = entry ?? {};
        if (!['STABLE', 'DEV'].includes(channel) || typeof minecraft !== 'string' || !versionPattern.test(minecraft)
            || typeof version !== 'string' || !commitPattern.test(commit) || !shaPattern.test(sha256)) continue;
        const artifact = URL.parse(url);
        if (artifact?.protocol !== 'https:') continue;
        const { pathname } = artifact;
        if (!pathname.startsWith('/updates/')) continue;
        const jar = pathname.slice('/updates/'.length);
        if (!jarPattern.test(jar) || !jar.startsWith(`${branch}/${channel.toLowerCase()}/`)
            || (channel === 'DEV' && path.basename(jar) !== `${commit}.jar`)) continue;
        if (!builds.has(pathname)) builds.set(pathname, {
            minecraft, channel, version, commit, notes: typeof notes === 'string' ? notes : '', pathname, sha256
        });
    }
    return [...builds.values()].sort((a, b) => b.minecraft.localeCompare(a.minecraft, 'en', { numeric: true }));
}

export function createUpdaterRouter({ updatesDir, publicKey = livePublicKey }) {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    const router = Router();
    let rendered;
    const servePage = async (_req, res) => {
        res.set({
            'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff'
        });
        let handle;
        try {
            const feed = path.join(await fs.promises.realpath(updatesDir), 'feed.json');
            handle = await fs.promises.open(feed, constants.O_RDONLY | constants.O_NOFOLLOW);
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > feedLimit) throw new Error('Invalid update feed');
            const revision = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
            if (rendered?.revision !== revision) {
                const builds = readDownloads(await handle.readFile(), key);
                rendered = { revision, html: renderDownloads(builds) };
            }
            res.set('Cache-Control', 'public, max-age=60').type('html').send(rendered.html);
        } catch {
            res.set('Cache-Control', 'no-store').status(503).type('html').send(renderDownloads(null));
        } finally {
            await handle?.close();
        }
    };
    const serveUpdate = updaterFiles(updatesDir);
    router.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return res.set({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).sendStatus(405);
        }
        if (req.path === '/') return servePage(req, res, next);
        const asset = req.path.slice(1);
        if (pageAssets.has(asset)) {
            return res.sendFile(fileURLToPath(new URL(`./assets/${asset}`, import.meta.url)), { maxAge: '1h' });
        }
        return serveUpdate(req, res, next);
    }, (_err, _req, res, _next) => {
        if (res.headersSent) return res.destroy();
        res.removeHeader('Content-Length');
        res.removeHeader('ETag');
        res.set('Cache-Control', 'no-store').sendStatus(503);
    });
    return router;
}
