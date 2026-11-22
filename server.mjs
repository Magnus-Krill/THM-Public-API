import express from 'express';
import { createUpdaterRouter } from './updates.mjs';

const { UPDATES_DIR, UPDATES_PUBLIC_KEY, HOST = '127.0.0.1', PORT = '4311' } = process.env;
if (!UPDATES_DIR) throw new Error('Set UPDATES_DIR to the publisher files directory.');
const port = Number(PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
});
app.get('/', (_req, res) => res.redirect(302, '/updates/'));
app.use('/updates', createUpdaterRouter({ updatesDir: UPDATES_DIR, publicKey: UPDATES_PUBLIC_KEY }));
const server = app.listen(port, HOST);
server.on('listening', () => console.log(`THM Addons downloads listening on ${HOST}:${port}`));
