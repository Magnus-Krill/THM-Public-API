import fs, { constants } from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { Router } from 'express';
import { renderDownloads, styles } from './downloads.mjs';

const jarLimit = 32 * 1024 * 1024;
const feedLimit = 1024 * 1024;
const livePublicKey = 'MCowBQYDK2VwAyEABOC016sw9YhavsewbR+jG1sQglaxVKGv9ikvq1kSYYA=';
const commitPattern = /^[a-f0-9]{40}$/;
const shaPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^[0-9][A-Za-z0-9._-]{0,19}$/;
const jarPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\/(?:dev\/[a-f0-9]{40}|stable\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,99})\.jar$/;

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

async function readDownloads(root, key) {
    const feed = path.join(await fs.promises.realpath(root), 'feed.json');
    const handle = await fs.promises.open(feed, constants.O_RDONLY | constants.O_NOFOLLOW);
    let raw;
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > feedLimit) throw new Error('Invalid update feed');
        raw = await handle.readFile();
    } finally {
        await handle.close();
    }
    const envelope = JSON.parse(raw);
    const payload = Buffer.from(envelope.payload, 'base64');
    const signature = Buffer.from(envelope.signature, 'base64');
    if (!verify(null, payload, key, signature)) throw new Error('Invalid feed signature');
    const { format, entries } = JSON.parse(payload);
    if (format !== 1 || !Array.isArray(entries) || entries.length > 100) throw new Error('Invalid update entries');
    const latest = new Map();
    for (const entry of entries) {
        const { branch, channel, commit, minecraft, sha256, url, version } = entry ?? {};
        if (!['STABLE', 'DEV'].includes(channel) || typeof minecraft !== 'string' || !versionPattern.test(minecraft)
            || typeof version !== 'string' || !commitPattern.test(commit) || !shaPattern.test(sha256)) continue;
        const artifact = URL.parse(url);
        if (artifact?.protocol !== 'https:') continue;
        const { pathname } = artifact;
        if (!pathname.startsWith('/updates/')) continue;
        const jar = pathname.slice('/updates/'.length);
        if (!jarPattern.test(jar) || !jar.startsWith(`${branch}/${channel.toLowerCase()}/`)
            || (channel === 'DEV' && path.basename(jar) !== `${commit}.jar`)) continue;
        const id = `${minecraft}/${channel}`;
        if (!latest.has(id)) latest.set(id, { minecraft, channel, version, pathname, sha256 });
    }
    return [...latest.values()].sort((a, b) =>
        b.minecraft.localeCompare(a.minecraft, 'en', { numeric: true }) || b.channel.localeCompare(a.channel));
}

export function createUpdaterRouter({ updatesDir, publicKey = livePublicKey }) {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    const router = Router();
    const servePage = async (_req, res) => {
        res.set({
            'Content-Security-Policy': "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff'
        });
        try {
            const builds = await readDownloads(updatesDir, key);
            res.set('Cache-Control', 'public, max-age=60').type('html').send(renderDownloads(builds));
        } catch {
            res.set('Cache-Control', 'no-store').status(503).type('html').send(renderDownloads(null));
        }
    };
    const serveUpdate = updaterFiles(updatesDir);
    router.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return res.set({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).sendStatus(405);
        }
        if (req.path === '/') return servePage(req, res, next);
        if (req.path === '/style.css') {
            return res.set('Cache-Control', 'public, max-age=3600').type('css').send(styles);
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
