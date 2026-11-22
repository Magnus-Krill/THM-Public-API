import { Router } from 'express';
import { createUpdaterRouter } from './updates.mjs';

const workerTtl = 10 * 60_000;
const usernamePattern = /^[a-zA-Z0-9_]{1,16}$/;
const activityKeyPattern = /^(?:Off)?(?:Dug)?(?:N|NE|E|SE|S|SW|W|NW)$/;
const routePattern = /^(?:main|grid|other|(?:unlisted-)?(?:ring|diamond)(?:-[1-9][0-9]{0,7})?)$/;

export function projectActivity(activity, includeRoutes, now, routeLabel) {
    const board = {};
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) throw new Error('Invalid activity data');
    for (const [key, entry] of Object.entries(activity)) {
        if (!activityKeyPattern.test(key) || !entry || typeof entry !== 'object') continue;
        const offMain = key.startsWith('Off');
        if (offMain && !includeRoutes) continue;
        const direction = key.replace(/^(?:Off)?(?:Dug)?/, '');
        const mode = key.includes('Dug') ? 'dug' : 'paved';
        const workers = (Array.isArray(entry.workers) ? entry.workers : [entry])
            .filter(worker => worker && typeof worker.username === 'string' && usernamePattern.test(worker.username)
                && Number.isSafeInteger(worker.timestamp) && worker.timestamp <= now && now - worker.timestamp < workerTtl)
            .sort((a, b) => b.timestamp - a.timestamp).slice(0, 8)
            .map(({ username, timestamp, since, route }) => ({
                username, timestamp,
                since: Number.isSafeInteger(since) && since > 0 && since <= timestamp ? since : timestamp,
                ...(offMain && typeof route === 'string' && routePattern.test(route) ? { route, routeLabel: routeLabel(route) } : {})
            }));
        if (workers.length) {
            const { username, timestamp, since } = workers[0];
            board[key] = { direction, mode, workers, username, timestamp, since };
        }
    }
    return board;
}

function projectUsers(rows) {
    if (!Array.isArray(rows)) throw new Error('Invalid player data');
    return rows.flatMap(row => Array.isArray(row?.usernames) && typeof row.rank === 'string'
        && typeof row.branch === 'string' ? row.usernames.filter(name => typeof name === 'string' && usernamePattern.test(name))
            .map(name => ({ usernames: [name], rank: row.rank, branch: row.branch })) : []);
}

function projectCapes(data) {
    if (!data?.players || Array.isArray(data.players) || typeof data.players !== 'object') throw new Error('Invalid cape data');
    return { players: Object.fromEntries(Object.entries(data.players)
        .filter(([name, row]) => usernamePattern.test(name) && typeof row?.cape === 'string' && /^[\w-]{1,32}$/.test(row.cape))
        .map(([name, row]) => [name, { username: name, cape: row.cape }])) };
}

export function kitCatalog({ kits, whitelists, WhitelistedKits }, includeRestricted = false) {
    const restricted = whitelists?.whitelistedKits ?? WhitelistedKits ?? [];
    if (!Array.isArray(kits) || !Array.isArray(restricted) || !restricted.every(name => typeof name === 'string')
        || !kits.every(kit => typeof kit?.name === 'string' && /^[\w-]{1,64}$/.test(kit.name)
            && Number.isFinite(kit.cost) && kit.cost >= 0)) throw new Error('Invalid kit data');
    const blocked = new Set(restricted.map(name => name.toLowerCase()));
    return { success: true, kits: kits.filter(kit => kit.orderable !== false
        && (includeRestricted || !blocked.has(kit.name.toLowerCase()))).map(({ name, cost }) => ({ name, price: cost })) };
}

function cachedJson(read, maxAge, clock) {
    let body;
    let expires = 0;
    return (_req, res) => {
        try {
            const now = clock();
            if (body === undefined || now >= expires) {
                body = JSON.stringify(read(now));
                expires = now + Math.min(maxAge, 5) * 1_000;
            }
            res.set('Cache-Control', `public, max-age=${maxAge}`).type('json').send(body);
        } catch {
            res.set('Cache-Control', 'no-store').status(503).json({ success: false, code: 'DATA_UNAVAILABLE' });
        }
    };
}

export function createPublicApi({ readers, updatesDir, clock = Date.now }) {
    const router = Router();
    const mainStatus = cachedJson(now => projectActivity(readers.activity(), false, now, readers.routeLabel), 15, clock);
    const allStatus = cachedJson(now => projectActivity(readers.activity(), true, now, readers.routeLabel), 15, clock);
    router.get('/users', cachedJson(() => projectUsers(readers.users()), 60, clock));
    router.get('/status', (req, res) => (req.query.routes === '1' ? allStatus : mainStatus)(req, res));
    router.get('/kits', cachedJson(() => kitCatalog(readers.kits()), 300, clock));
    router.get('/highway-lengths', cachedJson(readers.lengths, 60, clock));
    router.get('/cape', cachedJson(() => projectCapes(readers.capes()), 60, clock));
    router.use('/updates', createUpdaterRouter({ updatesDir }));
    return router;
}
