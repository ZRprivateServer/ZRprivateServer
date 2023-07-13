import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { verify } from 'hcaptcha';

export const prefix = '/';

async function routes(app) {
    const defaultHcaptchaSiteKey = '10000000-ffff-ffff-ffff-000000000001';
    const defaultHcaptchaSecretKey = '0x0000000000000000000000000000000000000000';
    app.get('/user/login/:provider', (req, res) => {
        res.cookie('csrf', req.query.csrf || '', {
            httpOnly: true,
            maxAge: 3600,
            secure: 'auto',
            signed: true
        });
        res.redirect('/user/login');
    });
    app.get('/user/login', (req, res) => {
        res.view('views/login.pug', { serverName: process.env.SERVER_NAME, message: req.query.r === 's' ? 'Account created successfully. You may now login.' : undefined });
    });
    app.post('/user/login', async (req, res) => {
        const csrf = req.unsignCookie(req.cookies.csrf);
        if (!csrf.valid) {
            return 'Something went wrong while attempting your login. Please try again.';
        }
        if (!req.body.username || !req.body.password) {
            return 'Missing a required field';
        }
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE name = ? LIMIT 1', [req.body.username]);
        if (rows.length === 0) {
            db.release();
            return 'Invalid username or password.';
        }
        const user = rows[0];
        if (!bcrypt.compareSync(req.body.password, user.password)) {
            db.release();
            return 'Invalid username or password.';
        }
        const token = crypto.randomBytes(20).toString('hex');
        await db.execute('INSERT INTO sessions (user_id, `key`, expires) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))', [user.id, token]);
        db.release();
        res.cookie('userKey', token, {
            httpOnly: true,
            maxAge: 3600,
            secure: 'auto',
            signed: true
        }).cookie('csrf', csrf.value || '', {
            httpOnly: true,
            maxAge: 3600,
            secure: 'auto',
            signed: true
        });
        return 'success';
    });
    app.get('/user/register', (_, res) => {
        res.view('views/register.pug', { serverName: process.env.SERVER_NAME, hcaptchaSiteKey: process.env.HCAPTCHA_SITE_KEY || defaultHcaptchaSiteKey });
    });
    app.post('/user/register', async (req, res) => {
        if (!req.body.username || !req.body.password || !req.body.password2) {
            return 'Missing a required field.';
        }
        if (req.body.password !== req.body.password2) {
            return 'Passwords do not match.';
        }
        const hcaptchaResponse = req.body['h-captcha-response'];
        if (!hcaptchaResponse) {
            return 'Missing hCaptcha response.';
        }
        const hcaptchaSecretKey = process.env.HCAPTCHA_SECRET_KEY || defaultHcaptchaSecretKey;
        const hcaptchaResult = await verify(hcaptchaSecretKey, req.body['h-captcha-response']);
        if (!hcaptchaResult.success) {
            return 'hCaptcha verification failed.';
        }
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(req.body.password, salt);
        const db = await app.mysql.getConnection();
        try {
            await db.execute('INSERT INTO users (name, password) VALUES (?, ?)', [req.body.username, hashed]);
        } catch (e) {
            db.release();
            if (e.code === 'ER_DUP_ENTRY') {
                return res.send('That username is already taken. Please try another.');
            }
        }
        db.release();
        return 'success';
    });
    app.get('/user/validate', async (req, res) => {
        if (!req.cookies.userKey || !req.cookies.csrf) {
            return 'Something went wrong while attempting your login. Please try again.';
        }
        const session = req.unsignCookie(req.cookies.userKey);
        const csrf = req.unsignCookie(req.cookies.csrf);
        if (!session.valid || !csrf.valid) {
            return 'Something went wrong while attempting your login. Please try again.';
        }
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE id = (SELECT user_id FROM sessions WHERE `key` = ?)', [session.value]);
        db.release();
        if (rows.length === 0) {
            return 'Something went wrong while attempting your login. Please try again.';
        }
        const user = rows[0];
        const apiUser = {
            id: user.id,
            provider: 'zrps',
            identifier: user.id.toString(),
            name: user.name,
            avatar: user.avatar,
            email: user.email,
            friend_code: user.friend_code,
            experience: user.experience,
            level: user.level,
            coins: user.coins,
            gems: user.gems,
            status: user.status,
            // created field should go here later
            key: session.value,
            progression: {
                currentExperience: user.experience,
                requiredExperience: 100,
                rewards: [],
                isStale: false
            },
            clans: [],
            licenses: [],
            packs: [],
            subscriptions: [],
            iaps: []
        };
        res.cookie('userKey', session.value, {
            httpOnly: true,
            expires: Date.now(),
            secure: 'auto',
            signed: true
        }).cookie('csrf', csrf.value, {
            httpOnly: true,
            expires: Date.now(),
            secure: 'auto',
            signed: true
        });
        return res.view('views/validate.pug', { session: session.value, csrf: csrf.value, userData: JSON.stringify(apiUser) });
    });
    app.get('/user/:userKey', async (req) => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE id = (SELECT user_id FROM sessions WHERE `key` = ?)', [req.params.userKey]);
        db.release();
        if (rows.length === 0) {
            return {
                status: 'error',
                message: 'The supplied key has expired.'
            };
        }
        const user = rows[0];
        const response = {
            status: 'success',
            user: {
                id: user.id,
                provider: 'zrps',
                identifier: user.id.toString(),
                name: user.name,
                avatar: user.avatar,
                email: user.email,
                friend_code: user.friend_code,
                experience: user.experience,
                level: user.level,
                coins: user.coins,
                gems: user.gems,
                status: user.status,
                // created field should go here later
                key: req.params.userKey,
                progression: {
                    currentExperience: user.experience,
                    requiredExperience: 100,
                    rewards: [],
                    isStale: false
                },
                clans: [],
                licenses: [],
                packs: [],
                subscriptions: [],
                iaps: []
            }
        };
        return response;
    });
    app.get('/api/user/:userKey', async (req) => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE id = (SELECT user_id FROM sessions WHERE `key` = ?)', [req.params.userKey]);
        db.release();
        if (rows.length === 0) {
            return {
                status: 'error',
                message: 'The supplied key has expired.'
            };
        }
        const user = rows[0];
        const response = {
            status: 'success',
            user: {
                id: user.id,
                provider: 'zrps',
                identifier: user.id.toString(),
                name: user.name,
                avatar: user.avatar,
                email: user.email,
                friend_code: user.friend_code,
                experience: user.experience,
                level: user.level,
                coins: user.coins,
                gems: user.gems,
                status: user.status,
                // created field should go here later
                key: req.params.userKey,
                progression: {
                    currentExperience: user.experience,
                    requiredExperience: 100,
                    rewards: [],
                    isStale: false
                },
                clans: [],
                licenses: [],
                packs: [],
                subscriptions: [],
                iaps: []
            },
            rewards: []
        };
        return response;
    });
    app.get('/api/user/:userKey/rewards', async (req) => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE id = (SELECT user_id FROM sessions WHERE `key` = ?)', [req.params.userKey]);
        db.release();
        if (rows.length === 0) {
            return {
                status: 'error',
                message: 'No such user exists.'
            };
        }
        const response = {
            status: 'success',
            types: [{ name: 'first', is_available: true }, {
                name: 'gift',
                is_available: true,
                next_at: null
            }, { name: 'recurring', is_available: true, claimed: 0, total: 5 }, {
                name: 'bonus',
                is_available: false
            }, { name: 'instagram', is_available: true }, {
                name: 'nitro',
                is_available: true,
                next_at: null
            }, { name: 'coming_soon', is_available: true }]
        };
        return response;
    });
    app.post('/api/user/:userKey/friend-code/update', async (req) => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT * FROM users WHERE id = (SELECT user_id FROM sessions WHERE `key` = ?)', [req.params.userKey]);
        db.release();
        if (rows.length === 0) {
            return {
                status: 'error',
                message: 'No such user exists.'
            };
        }
        if (!req.body.name || !/^[a-zA-Z0-9]+$/.test(req.body.name)) {
            return {
                status: 'error',
                message: 'You need to enter a valid name. No special characters!'
            };
        }
        const user = rows[0];
        const name = req.body.name.substring(0, 42);
        let tag = null;
        if (user.friend_code != null) {
            try {
                tag = parseInt(user.friend_code.split('#')[1]);
            } catch (_) { }
        }
        if (tag === null) tag = Math.floor(Math.random() * 9000) + 1000;
        const friendCode = `${name}#${tag}`;
        try {
            await db.execute('UPDATE users SET friend_code = ? WHERE id = ?', [friendCode, user.id]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return {
                    status: 'error',
                    message: 'That name is already taken. Please try again.'
                };
            }
        }
        const response = {
            status: 'success',
            user: {
                id: user.id,
                provider: 'zrps',
                identifier: user.id.toString(),
                name: user.name,
                avatar: user.avatar,
                email: user.email,
                friend_code: friendCode,
                experience: user.experience,
                level: user.level,
                coins: user.coins,
                gems: user.gems,
                status: user.status,
                // created field should go here later
                key: req.params.userKey,
                progression: {
                    currentExperience: user.experience,
                    requiredExperience: 100,
                    rewards: [],
                    isStale: false
                },
                clans: [],
                licenses: [],
                packs: [],
                subscriptions: [],
                iaps: []
            }
        };
        return response;
    });
    app.post('/api/user/:userKey/clear-sessions', async (req) => {
        const db = await app.mysql.getConnection();
        const [rows] = await db.execute('SELECT user_id FROM sessions WHERE `key` = ?', [req.params.userKey]);
        if (rows.length === 0) {
            db.release();
            return {
                status: 'error',
                message: 'No such user exists.'
            };
        }
        await db.execute('DELETE FROM sessions WHERE user_id = ?', [rows[0].user_id]);
        db.release();
        return { status: 'success' };
    });
}

export default routes;
