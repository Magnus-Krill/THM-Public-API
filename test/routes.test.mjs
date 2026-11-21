import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { createPublicApi } from '../index.mjs';

test('public routes revalidate, hide private fields and keep status variants separate', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thm-public-api-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const jar = '26.2/dev/' + 'a'.repeat(40) + '.jar';
    fs.mkdirSync(path.join(dir, '26.2/dev'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'feed.json'), '{"payload":"test","signature":"test"}');
    fs.writeFileSync(path.join(dir, jar), 'test jar');
    fs.symlinkSync(path.join(dir, jar), path.join(dir, jar.replaceAll('a', 'b')));
    let time = 2_000_000;
    let reads = 0;
    let lengths = { nether: { N: { paved: 50, total: 100 } } };
    const worker = { username: 'Example', timestamp: time - 599_950, route: 'ring-200', clientMode: 'dug', x: 42 };
    const app = express();
    app.use(createPublicApi({
        updatesDir: dir, clock: () => time,
        readers: {
            lengths: () => { reads++; if (!lengths) throw new Error('Fixture failed'); return lengths; },
            users: () => [{ usernames: ['MainName', 'AltName'], rank: 'Paver', branch: 'Main', discordname: 'hidden' }],
            capes: () => ({ players: { MainName: { cape: 'thm1', token: 'hidden' } } }),
            kits: () => ({ kits: [{ name: 'pvp', cost: 1 }, { name: 'restricted', cost: 2 }, { name: 'gift', cost: 0, orderable: false }],
                whitelists: { whitelistedKits: ['Restricted'] } }),
            activity: () => ({ OffDugE: { workers: [worker] }, N: { workers: [worker] } }),
            routeLabel: () => 'Ring road 200'
        }
    }));
    app.all('/cape', (_req, res) => res.status(401).end());
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const get = (route, options) => fetch(`http://127.0.0.1:${server.address().port}${route}`, options);
    const original = await get('/highway-lengths');
    assert.equal(original.status, 200);
    assert.equal(original.headers.get('cache-control'), 'public, max-age=60');
    assert.deepEqual(await original.json(), lengths);
    const oldEtag = original.headers.get('etag');
    assert.ok(oldEtag);
    const conditional = { headers: { 'If-None-Match': oldEtag, 'Cache-Control': 'max-age=0' } };
    assert.equal((await get('/highway-lengths', conditional)).status, 304);
    assert.equal(reads, 1);
    time += 5_001;
    lengths = { nether: { N: { paved: 100, total: 100 } } };
    assert.equal((await get('/highway-lengths', conditional)).status, 200);
    time += 5_001;
    lengths = null;
    const failed = await get('/highway-lengths');
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await (await get('/status')).json(), {});
    worker.timestamp = time - 40;
    const offMain = (await (await get('/status?routes=1')).json()).OffDugE;
    assert.deepEqual(offMain.workers, [{ username: 'Example', timestamp: time - 40, since: time - 40, route: 'ring-200', routeLabel: 'Ring road 200' }]);
    assert.deepEqual(await (await get('/status')).json(), {});
    time += 600_000;
    assert.deepEqual(await (await get('/status?routes=1')).json(), {});

    assert.deepEqual(await (await get('/users')).json(), [
        { usernames: ['MainName'], rank: 'Paver', branch: 'Main' },
        { usernames: ['AltName'], rank: 'Paver', branch: 'Main' }
    ]);
    assert.deepEqual(await (await get('/kits', { headers: { Authorization: 'Bearer ignored' } })).json(),
        { success: true, kits: [{ name: 'pvp', price: 1 }] });
    assert.deepEqual(await (await get('/cape/')).json(), { players: { MainName: { username: 'MainName', cape: 'thm1' } } });
    assert.equal((await get('/cape', { method: 'POST' })).status, 401);

    const feed = await get('/updates/feed.json');
    assert.equal(feed.headers.get('cache-control'), 'public, max-age=60');
    assert.equal((await get('/updates/feed.json', { headers: { 'If-None-Match': feed.headers.get('etag'), 'Cache-Control': 'max-age=0' } })).status, 304);
    const download = await get('/updates/' + jar);
    assert.equal(download.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(await download.text(), 'test jar');
    const head = await get('/updates/' + jar, { method: 'HEAD' });
    assert.equal(head.headers.get('content-length'), '8');
    assert.equal(await head.text(), '');
    const bad = await get('/updates/' + jar.replaceAll('a', 'b'));
    assert.equal(bad.status, 404);
    assert.equal(bad.headers.get('cache-control'), 'no-store');
});
