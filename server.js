const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

let nodemailer = null;
try {
    nodemailer = require('nodemailer');
} catch {
    nodemailer = null;
}

let connectPgSimpleFactory = null;
try {
    connectPgSimpleFactory = require('connect-pg-simple');
} catch {
    connectPgSimpleFactory = null;
}

const {
    initDatabase,
    createUser,
    findUserByEmail,
    findUserById,
    updateUserProfile,
    updateUserByAdmin,
    createJob,
    getAllJobs,
    getJobById,
    getJobsByArbeitgeber,
    updateJob,
    deleteJob,
    createBewerbung,
    getBewerbungenByBewerber,
    getBewerbungenByJob,
    getBewerbungById,
    updateBewerbungStatus,
    addFavorit,
    removeFavorit,
    getFavoriten,
    isFavorit,
    getAllUsersAdmin,
    deleteUserByAdmin,
    createTaskByAdmin,
    getTasksByUser,
    getAllTasksAdmin,
    updateTaskStatusForUser,
    updateTaskStatusByAdmin,
    createTerminByBewerber,
    getTermineByUser,
    getAllTermineAdmin,
    getBookedTerminSlots,
    isTerminSlotOccupied,
    updateTerminByUser,
    deleteTerminByUser,
    deleteTerminByAdmin,
    createChatMessage,
    getChatMessagesByConversation,
    getChatConversationMeta,
    updateChatConversationState,
    getChatConversationsByUser,
    getChatConversationsAdmin,
    getChatById,
    updateChatMessageByAdmin,
    getAllJobsAdmin,
    getAllBewerbungenAdmin,
    getAllFavoritenAdmin,
    getStatistiken
} = require('./database');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'job-portal-secret-2026';
const AUTH_COOKIE_NAME = 'jc_auth';
const AUTH_TOKEN_TTL_SECONDS = 24 * 60 * 60;

const hasCustomSessionSecret = Boolean(process.env.SESSION_SECRET && String(process.env.SESSION_SECRET).trim());
if (isProduction && !hasCustomSessionSecret) {
    throw new Error('SESSION_SECRET muss in Produktion gesetzt sein.');
}

const staticDenyList = new Set([
    '/server.js',
    '/database.js',
    '/package.json',
    '/package-lock.json',
    '/jobportal.json',
    '/readme.md',
    '/vercel.json',
    '/api/index.js'
]);

if (isProduction) {
    app.set('trust proxy', 1);
}

app.disable('x-powered-by');

// Datenbank initialisieren
let isDatabaseReady = false;
let dbInitPromise = null;
let lastDbInitErrorAt = 0;
const DB_INIT_RETRY_COOLDOWN_MS = 5000;

const ensureDatabaseInitialized = async () => {
    if (isDatabaseReady) {
        return;
    }

    const now = Date.now();
    if (!dbInitPromise && now - lastDbInitErrorAt < DB_INIT_RETRY_COOLDOWN_MS) {
        throw new Error('Datenbank-Initialisierung wird erneut versucht');
    }

    if (!dbInitPromise) {
        dbInitPromise = initDatabase()
            .then(() => {
                isDatabaseReady = true;
                dbInitPromise = null;
            })
            .catch((error) => {
                lastDbInitErrorAt = Date.now();
                dbInitPromise = null;
                throw error;
            });
    }

    await dbInitPromise;
};

if (require.main === module) {
    ensureDatabaseInitialized().catch((error) => {
        console.error('Datenbank-Initialisierung fehlgeschlagen:', error);
        process.exit(1);
    });
}

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use((req, res, next) => {
    const requestPath = String(req.path || '').toLowerCase();
    if (staticDenyList.has(requestPath)) {
        return res.status(404).send('Not Found');
    }
    next();
});

app.use(express.static(__dirname, {
    index: false,
    dotfiles: 'ignore'
}));

// Session
const sessionConfig = {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    }
};

const sessionDbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (sessionDbUrl) {
    if (!connectPgSimpleFactory) {
        throw new Error('connect-pg-simple ist erforderlich, wenn POSTGRES_URL oder DATABASE_URL gesetzt ist.');
    }

    const PgSessionStore = connectPgSimpleFactory(session);
    const sessionPool = new Pool({
        connectionString: sessionDbUrl,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    });

    sessionConfig.store = new PgSessionStore({
        pool: sessionPool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    });
}

app.use(session(sessionConfig));

app.use(async (req, res, next) => {
    try {
        await ensureDatabaseInitialized();
        next();
    } catch (error) {
        console.error('Datenbank nicht bereit:', error.message || error);
        res.status(500).json({ error: 'Datenbank nicht initialisiert' });
    }
});

const parseCookies = (req) => {
    const header = req.headers.cookie;
    if (!header) return {};

    return header.split(';').reduce((cookies, cookiePart) => {
        const separatorIndex = cookiePart.indexOf('=');
        if (separatorIndex <= 0) return cookies;

        const key = cookiePart.slice(0, separatorIndex).trim();
        const value = cookiePart.slice(separatorIndex + 1).trim();
        cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
};

const signPayload = (payload) => {
    return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
};

const createAuthToken = (userId) => {
    const expiresAt = Date.now() + AUTH_TOKEN_TTL_SECONDS * 1000;
    const payload = `${userId}.${expiresAt}`;
    const signature = signPayload(payload);
    return Buffer.from(`${payload}.${signature}`).toString('base64url');
};

const verifyAuthToken = (token) => {
    try {
        const decoded = Buffer.from(token, 'base64url').toString('utf8');
        const [userIdRaw, expiresAtRaw, signature] = decoded.split('.');

        if (!userIdRaw || !expiresAtRaw || !signature) return null;

        const payload = `${userIdRaw}.${expiresAtRaw}`;
        const expectedSignature = signPayload(payload);
        if (signature !== expectedSignature) return null;

        const userId = Number(userIdRaw);
        const expiresAt = Number(expiresAtRaw);
        if (!Number.isInteger(userId) || !Number.isFinite(expiresAt)) return null;
        if (Date.now() > expiresAt) return null;

        return userId;
    } catch {
        return null;
    }
};

const setAuthCookie = (res, userId) => {
    const token = encodeURIComponent(createAuthToken(userId));
    const attributes = [
        `${AUTH_COOKIE_NAME}=${token}`,
        'Path=/',
        `Max-Age=${AUTH_TOKEN_TTL_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax'
    ];

    if (isProduction) {
        attributes.push('Secure');
    }

    res.append('Set-Cookie', attributes.join('; '));
};

const clearAuthCookie = (res) => {
    const attributes = [
        `${AUTH_COOKIE_NAME}=`,
        'Path=/',
        'Max-Age=0',
        'HttpOnly',
        'SameSite=Lax'
    ];

    if (isProduction) {
        attributes.push('Secure');
    }

    res.append('Set-Cookie', attributes.join('; '));
};

const getAuthenticatedUserId = (req) => {
    if (req.session && req.session.userId) {
        return req.session.userId;
    }

    const cookies = parseCookies(req);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) return null;

    return verifyAuthToken(token);
};

app.use((req, res, next) => {
    const authenticatedUserId = getAuthenticatedUserId(req);
    req.authUserId = authenticatedUserId;

    if (authenticatedUserId && req.session && !req.session.userId) {
        req.session.userId = authenticatedUserId;
    }

    next();
});

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.authUserId) {
        next();
    } else {
        res.status(401).json({ error: 'Nicht autorisiert' });
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.authUserId) {
            return res.status(401).json({ error: 'Nicht autorisiert' });
        }

        const user = await findUserById(req.authUserId);
        if (!user || user.user_typ !== 'admin') {
            return res.status(403).json({ error: 'Admin-Berechtigung erforderlich' });
        }

        req.currentAdmin = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Fehler bei der Admin-Authentifizierung' });
    }
};

const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 8 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Login-Versuche. Bitte später erneut versuchen.' }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTIFICATION_EMAIL = String(process.env.NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true';
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || '').trim();

const isEmailNotificationConfigured = Boolean(
    nodemailer
    && NOTIFICATION_EMAIL
    && SMTP_HOST
    && SMTP_PORT
    && SMTP_USER
    && SMTP_PASS
    && SMTP_FROM
);

let notificationMailer = null;
const getNotificationMailer = () => {
    if (!isEmailNotificationConfigured) {
        return null;
    }

    if (!notificationMailer) {
        notificationMailer = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            }
        });
    }

    return notificationMailer;
};

const sendNotificationEmail = async ({ subject, lines }) => {
    const mailer = getNotificationMailer();
    if (!mailer) {
        return false;
    }

    const text = Array.isArray(lines) ? lines.filter(Boolean).join('\n') : String(lines || '');
    await mailer.sendMail({
        from: SMTP_FROM,
        to: NOTIFICATION_EMAIL,
        subject: String(subject || 'Neue Benachrichtigung'),
        text
    });

    return true;
};

const queueNotificationEmail = (payload) => {
    sendNotificationEmail(payload).catch((error) => {
        console.error('E-Mail-Benachrichtigung fehlgeschlagen:', error.message || error);
    });
};

const normalizeConversationId = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
};

const createConversationId = () => {
    if (typeof crypto.randomUUID === 'function') {
        return `chat_${crypto.randomUUID().replace(/-/g, '')}`;
    }

    return `chat_${crypto.randomBytes(16).toString('hex')}`;
};

const sanitizeChatIdentity = (input = {}) => {
    const vorname = String(input.vorname || '').trim();
    const nachname = String(input.nachname || '').trim();
    const email = String(input.email || '').trim().toLowerCase();

    if (!vorname || !nachname || !email) {
        throw new Error('Vorname, Nachname und E-Mail sind erforderlich');
    }

    if (!EMAIL_REGEX.test(email)) {
        throw new Error('Ungültige E-Mail-Adresse');
    }

    return { vorname, nachname, email };
};

const getSessionChatIdentity = (req) => {
    if (!req.session || !req.session.chatIdentity) {
        return null;
    }

    const value = req.session.chatIdentity;
    if (!value.vorname || !value.nachname || !value.email) {
        return null;
    }

    return {
        vorname: String(value.vorname).trim(),
        nachname: String(value.nachname).trim(),
        email: String(value.email).trim().toLowerCase()
    };
};

// ===== AUTH ROUTES =====

// Registrierung
app.post('/api/register', async (req, res) => {
    try {
        const { vorname, nachname, email, passwort, userTyp, firma } = req.body;

        if (!vorname || !nachname || !email || !passwort) {
            return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
        }

        if (userTyp && userTyp !== 'bewerber') {
            return res.status(400).json({ error: 'Arbeitgeber-Funktion ist deaktiviert' });
        }

        if (passwort.length < 6) {
            return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        if (await findUserByEmail(email)) {
            return res.status(400).json({ error: 'E-Mail bereits registriert' });
        }

        const hashedPassword = await bcrypt.hash(passwort, 10);
        const userId = await createUser(vorname, nachname, email, hashedPassword, 'bewerber', null);

        req.session.userId = userId;
        req.session.save(async (saveError) => {
            if (saveError) {
                return res.status(500).json({ error: 'Session konnte nicht gespeichert werden' });
            }

            try {
                setAuthCookie(res, userId);
                const newUser = await findUserById(userId);

                res.json({ 
                    success: true, 
                    message: 'Registrierung erfolgreich!',
                    user: {
                        id: newUser.id,
                        vorname: newUser.vorname,
                        nachname: newUser.nachname,
                        email: newUser.email,
                        userTyp: newUser.user_typ
                    }
                });
            } catch (responseError) {
                res.status(500).json({ error: 'Serverfehler' });
            }
        });

    } catch (error) {
        console.error('Registrierungsfehler:', error);
        res.status(500).json({ error: error.message || 'Serverfehler' });
    }
});

// Login
app.post('/api/login', loginRateLimiter, async (req, res) => {
    try {
        const { email, passwort } = req.body;

        if (!email || !passwort) {
            return res.status(400).json({ error: 'Email und Passwort erforderlich' });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        const isValidPassword = await bcrypt.compare(passwort, user.passwort);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        req.session.userId = user.id;
        req.session.save((saveError) => {
            if (saveError) {
                return res.status(500).json({ error: 'Session konnte nicht gespeichert werden' });
            }

            setAuthCookie(res, user.id);
            res.json({ 
                success: true, 
                message: 'Login erfolgreich!',
                user: {
                    id: user.id,
                    vorname: user.vorname,
                    nachname: user.nachname,
                    email: user.email,
                    userTyp: user.user_typ
                }
            });
        });

    } catch (error) {
        console.error('Login-Fehler:', error);
        res.status(500).json({ error: 'Serverfehler beim Login' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    clearAuthCookie(res);
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Logout' });
        }
        res.json({ success: true, message: 'Erfolgreich ausgeloggt' });
    });
});

// User Info
app.get('/api/user', requireAuth, async (req, res) => {
    try {
        const user = await findUserById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        const { passwort, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen des Benutzers' });
    }
});

// User Profil aktualisieren
app.put('/api/user', requireAuth, async (req, res) => {
    try {
        const updatedUser = await updateUserProfile(req.session.userId, req.body || {});
        if (!updatedUser) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        const { passwort, ...userWithoutPassword } = updatedUser;
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren des Profils' });
    }
});

// Session Check
app.get('/api/check-session', (req, res) => {
    const authenticatedUserId = req.authUserId || null;
    res.json({ 
        isAuthenticated: !!authenticatedUserId,
        userId: authenticatedUserId
    });
});

// ===== JOB ROUTES =====

// Alle Jobs abrufen
app.get('/api/jobs', async (req, res) => {
    try {
        const filters = {
            standort: req.query.standort,
            kategorie: req.query.kategorie,
            jobTyp: req.query.jobTyp,
            search: req.query.search
        };

        const jobs = await getAllJobs(filters);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Jobs' });
    }
});

// Einzelnen Job abrufen
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await getJobById(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
        }
        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen des Jobs' });
    }
});

// Job erstellen (Arbeitgeber oder Admin)
app.post('/api/jobs', requireAuth, async (req, res) => {
    try {
        const userId = req.authUserId;
        const user = await findUserById(userId);

        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        
        if (user.user_typ !== 'arbeitgeber' && user.user_typ !== 'admin') {
            return res.status(403).json({ error: 'Nur Arbeitgeber oder Admin können Jobs erstellen' });
        }

        const { titel, firma, standort, beschreibung } = req.body;
        if (!titel || !firma || !standort || !beschreibung) {
            return res.status(400).json({ error: 'Titel, Firma, Standort und Beschreibung sind erforderlich' });
        }

        const jobId = await createJob(userId, req.body);
        const job = await getJobById(jobId);

        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Erstellen des Jobs' });
    }
});

// Jobs des aktuellen Arbeitgebers
app.get('/api/my-jobs', requireAuth, async (req, res) => {
    try {
        const jobs = await getJobsByArbeitgeber(req.authUserId);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Jobs' });
    }
});

// Job aktualisieren
app.put('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
        const job = await getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        await updateJob(req.params.id, req.body);
        const updatedJob = await getJobById(req.params.id);

        res.json({ success: true, job: updatedJob });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

// Job löschen
app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
        const job = await getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        await deleteJob(req.params.id);
        res.json({ success: true, message: 'Job gelöscht' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Löschen' });
    }
});

// ===== BEWERBUNGS ROUTES =====

// Bewerbung einreichen
app.post('/api/bewerbungen', requireAuth, async (req, res) => {
    try {
        const { jobId, anschreiben } = req.body;

        if (!jobId || !anschreiben) {
            return res.status(400).json({ error: 'Job-ID und Anschreiben erforderlich' });
        }

        const user = await findUserById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        if (user.user_typ !== 'bewerber') {
            return res.status(403).json({ error: 'Nur Bewerber können Bewerbungen senden' });
        }

        const job = await getJobById(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
        }

        if (job.arbeitgeber_id === req.session.userId) {
            return res.status(400).json({ error: 'Sie können sich nicht auf Ihren eigenen Job bewerben' });
        }

        const bewerbungId = await createBewerbung(jobId, req.session.userId, anschreiben);

        res.json({ 
            success: true, 
            message: 'Bewerbung erfolgreich eingereicht!',
            bewerbungId 
        });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Einreichen der Bewerbung' });
    }
});

// Eigene Bewerbungen
app.get('/api/my-bewerbungen', requireAuth, async (req, res) => {
    try {
        const bewerbungen = await getBewerbungenByBewerber(req.session.userId);
        res.json({ success: true, bewerbungen });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Bewerbungen' });
    }
});

// Bewerbungen für einen Job (nur Arbeitgeber)
app.get('/api/jobs/:id/bewerbungen', requireAuth, async (req, res) => {
    try {
        const job = await getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        const bewerbungen = await getBewerbungenByJob(req.params.id);
        res.json({ success: true, bewerbungen });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// Bewerbungsstatus aktualisieren
app.put('/api/bewerbungen/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;

        const allowedStatus = ['eingereicht', 'in_pruefung', 'eingeladen', 'abgelehnt', 'angenommen'];
        if (!allowedStatus.includes(status)) {
            return res.status(400).json({ error: 'Ungültiger Status' });
        }

        const bewerbung = await getBewerbungById(req.params.id);
        if (!bewerbung) {
            return res.status(404).json({ error: 'Bewerbung nicht gefunden' });
        }

        const job = await getJobById(bewerbung.job_id);
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        await updateBewerbungStatus(req.params.id, status);
        res.json({ success: true, message: 'Status aktualisiert' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

// ===== FAVORITEN ROUTES =====

// Favorit hinzufügen
app.post('/api/favoriten', requireAuth, async (req, res) => {
    try {
        const { jobId } = req.body;

        const job = await getJobById(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
        }

        await addFavorit(req.session.userId, jobId);
        res.json({ success: true, message: 'Als Favorit gespeichert' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Favorit-Status prüfen
app.get('/api/favoriten/:jobId/status', requireAuth, async (req, res) => {
    try {
        const favorit = await isFavorit(req.session.userId, req.params.jobId);
        res.json({ success: true, favorit });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Prüfen des Favoriten-Status' });
    }
});

// Favorit entfernen
app.delete('/api/favoriten/:jobId', requireAuth, async (req, res) => {
    try {
        await removeFavorit(req.session.userId, req.params.jobId);
        res.json({ success: true, message: 'Favorit entfernt' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Entfernen' });
    }
});

// Favoriten abrufen
app.get('/api/favoriten', requireAuth, async (req, res) => {
    try {
        const favoriten = await getFavoriten(req.session.userId);
        res.json({ success: true, favoriten });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// ===== AUFGABEN ROUTES =====

app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        const tasks = await getTasksByUser(req.authUserId);
        res.json({ success: true, tasks });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Aufgaben' });
    }
});

app.patch('/api/tasks/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body || {};
        const allowedStatus = ['offen', 'in_bearbeitung', 'erledigt'];
        if (!allowedStatus.includes(status)) {
            return res.status(400).json({ error: 'Ungültiger Aufgaben-Status' });
        }

        const updatedTask = await updateTaskStatusForUser(req.params.id, req.authUserId, status);
        if (!updatedTask) {
            return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
        }

        res.json({ success: true, task: updatedTask });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren der Aufgabe' });
    }
});

// ===== TERMIN ROUTES =====

function isValidThirtyMinuteTimeSlot(timeValue) {
    if (!/^\d{2}:\d{2}$/.test(timeValue)) {
        return false;
    }

    const [hours, minutes] = timeValue.split(':').map((entry) => Number(entry));
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return false;
    }

    if (hours < 0 || hours > 23) {
        return false;
    }

    return minutes === 0 || minutes === 30;
}

app.get('/api/termine', requireAuth, async (req, res) => {
    try {
        const termine = await getTermineByUser(req.authUserId);
        res.json({ success: true, termine });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Termine' });
    }
});

app.get('/api/termine/belegt', requireAuth, async (req, res) => {
    try {
        const termine = await getBookedTerminSlots();
        res.json({ success: true, termine });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der belegten Termine' });
    }
});

app.post('/api/termine', requireAuth, async (req, res) => {
    try {
        const name = String((req.body && req.body.name) || '').trim();
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        const datum = String((req.body && req.body.datum) || '').trim();
        const uhrzeit = String((req.body && req.body.uhrzeit) || '').trim();

        if (!name || !email || !datum || !uhrzeit) {
            return res.status(400).json({ error: 'Name, E-Mail, Datum und Uhrzeit sind erforderlich' });
        }

        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
            return res.status(400).json({ error: 'Ungültiges Datum' });
        }

        if (!isValidThirtyMinuteTimeSlot(uhrzeit)) {
            return res.status(400).json({ error: 'Ungültige Uhrzeit. Es sind nur 30-Minuten-Slots erlaubt.' });
        }

        const isOccupied = await isTerminSlotOccupied({ datum, uhrzeit });
        if (isOccupied) {
            return res.status(409).json({ error: 'Dieser Termin-Slot ist bereits gebucht.' });
        }

        const terminZeit = new Date(`${datum}T${uhrzeit}:00`);
        if (Number.isNaN(terminZeit.getTime())) {
            return res.status(400).json({ error: 'Datum/Uhrzeit konnte nicht verarbeitet werden' });
        }

        const termin = await createTerminByBewerber(req.authUserId, {
            name,
            email,
            datum,
            uhrzeit,
            terminZeit: terminZeit.toISOString()
        });

        queueNotificationEmail({
            subject: 'Neuer Bewerbungstermin gebucht',
            lines: [
                'Ein neuer Bewerbungstermin wurde gebucht.',
                `Name: ${name}`,
                `E-Mail: ${email}`,
                `Datum: ${datum}`,
                `Uhrzeit: ${uhrzeit}`,
                `User-ID: ${req.authUserId}`
            ]
        });

        res.json({ success: true, termin });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Buchen des Termins' });
    }
});

app.patch('/api/termine/:id', requireAuth, async (req, res) => {
    try {
        const terminId = Number(req.params.id);
        if (!Number.isFinite(terminId) || terminId <= 0) {
            return res.status(400).json({ error: 'Ungültige Termin-ID' });
        }

        const datum = String((req.body && req.body.datum) || '').trim();
        const uhrzeit = String((req.body && req.body.uhrzeit) || '').trim();

        if (!datum || !uhrzeit) {
            return res.status(400).json({ error: 'Datum und Uhrzeit sind erforderlich' });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
            return res.status(400).json({ error: 'Ungültiges Datum' });
        }

        if (!isValidThirtyMinuteTimeSlot(uhrzeit)) {
            return res.status(400).json({ error: 'Ungültige Uhrzeit. Es sind nur 30-Minuten-Slots erlaubt.' });
        }

        const isOccupied = await isTerminSlotOccupied({
            datum,
            uhrzeit,
            excludeTerminId: terminId
        });
        if (isOccupied) {
            return res.status(409).json({ error: 'Dieser Termin-Slot ist bereits gebucht.' });
        }

        const terminZeit = new Date(`${datum}T${uhrzeit}:00`);
        if (Number.isNaN(terminZeit.getTime())) {
            return res.status(400).json({ error: 'Datum/Uhrzeit konnte nicht verarbeitet werden' });
        }

        const termin = await updateTerminByUser(terminId, req.authUserId, {
            datum,
            uhrzeit,
            terminZeit: terminZeit.toISOString()
        });

        if (!termin) {
            return res.status(404).json({ error: 'Termin nicht gefunden' });
        }

        res.json({ success: true, termin });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Verschieben des Termins' });
    }
});

app.delete('/api/termine/:id', requireAuth, async (req, res) => {
    try {
        const terminId = Number(req.params.id);
        if (!Number.isFinite(terminId) || terminId <= 0) {
            return res.status(400).json({ error: 'Ungültige Termin-ID' });
        }

        const deleted = await deleteTerminByUser(terminId, req.authUserId);
        if (!deleted) {
            return res.status(404).json({ error: 'Termin nicht gefunden' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Abbrechen des Termins' });
    }
});

// ===== LIVECHAT ROUTES =====

app.post('/api/chat/session', async (req, res) => {
    try {
        const identity = sanitizeChatIdentity(req.body || {});
        const requestedConversationId = normalizeConversationId(req.body && req.body.conversationId);
        const conversationId = requestedConversationId || createConversationId();

        if (req.session) {
            req.session.chatConversationId = conversationId;
            req.session.chatIdentity = identity;
        }

        res.json({ success: true, conversationId, identity });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Ungültige Chat-Daten' });
    }
});

app.get('/api/chat/messages', async (req, res) => {
    try {
        const requestedConversationId = normalizeConversationId(req.query && req.query.conversationId);
        const conversationId = requestedConversationId
            || normalizeConversationId(req.session && req.session.chatConversationId);

        if (!conversationId) {
            return res.status(400).json({ error: 'Chat-Session fehlt. Bitte Chat neu starten.' });
        }

        const messages = await getChatMessagesByConversation(conversationId);
        const conversation = await getChatConversationMeta(conversationId);
        res.json({ success: true, conversationId, conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Chat-Nachrichten' });
    }
});

app.get('/api/chat/conversations', async (req, res) => {
    try {
        let identity = getSessionChatIdentity(req);
        if (!identity && req.authUserId) {
            const user = await findUserById(req.authUserId);
            if (user) {
                identity = {
                    vorname: user.vorname,
                    nachname: user.nachname,
                    email: String(user.email || '').toLowerCase()
                };
            }
        }

        if (!identity && !req.authUserId) {
            return res.json({ success: true, conversations: [] });
        }

        const conversations = await getChatConversationsByUser({
            userId: req.authUserId || null,
            email: identity ? identity.email : null
        });

        res.json({ success: true, conversations });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Chat-Historie' });
    }
});

app.post('/api/chat/messages', async (req, res) => {
    try {
        const requestedConversationId = normalizeConversationId(req.body && req.body.conversationId);
        const conversationId = requestedConversationId
            || normalizeConversationId(req.session && req.session.chatConversationId);
        const text = String((req.body && req.body.nachricht) || '').trim();

        if (!conversationId) {
            return res.status(400).json({ error: 'Chat-Session fehlt. Bitte Chat neu starten.' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Nachricht ist erforderlich' });
        }

        if (text.length > 1200) {
            return res.status(400).json({ error: 'Nachricht ist zu lang (max. 1200 Zeichen)' });
        }

        const currentConversationMeta = await getChatConversationMeta(conversationId);
        if (currentConversationMeta && Boolean(currentConversationMeta.conversation_deleted)) {
            return res.status(404).json({ error: 'Konversation wurde gelöscht' });
        }

        if (currentConversationMeta && ['geschlossen', 'erledigt'].includes(String(currentConversationMeta.conversation_status || '').toLowerCase())) {
            return res.status(400).json({ error: 'Konversation ist geschlossen. Bitte neues Gespräch starten.' });
        }

        let identity = null;
        try {
            identity = sanitizeChatIdentity(req.body || {});
        } catch {
            identity = getSessionChatIdentity(req);
        }

        if (!identity && req.authUserId) {
            const user = await findUserById(req.authUserId);
            if (user) {
                identity = {
                    vorname: user.vorname,
                    nachname: user.nachname,
                    email: String(user.email || '').toLowerCase()
                };
            }
        }

        if (!identity) {
            return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind erforderlich' });
        }

        if (req.session) {
            req.session.chatConversationId = conversationId;
            req.session.chatIdentity = identity;
        }

        const isNewConversation = !currentConversationMeta;

        const message = await createChatMessage({
            conversationId,
            nachricht: text,
            userId: req.authUserId || null,
            adminId: null,
            conversationStatus: currentConversationMeta?.conversation_status || 'offen',
            conversationDeleted: false,
            conversationClosedAt: currentConversationMeta?.conversation_closed_at || null,
            visitorVorname: identity.vorname,
            visitorNachname: identity.nachname,
            visitorEmail: identity.email
        });

        if (isNewConversation) {
            queueNotificationEmail({
                subject: 'Neuer Livechat gestartet',
                lines: [
                    'Ein neuer Livechat wurde gestartet.',
                    `Konversations-ID: ${conversationId}`,
                    `Name: ${identity.vorname} ${identity.nachname}`,
                    `E-Mail: ${identity.email}`,
                    `Erste Nachricht: ${text}`
                ]
            });
        }

        res.json({ success: true, message });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Senden der Nachricht' });
    }
});

// ===== STATISTIKEN =====

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStatistiken();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// ===== ADMIN ROUTES =====

app.get('/api/admin/overview', requireAdmin, async (req, res) => {
    try {
        const [stats, users, jobs, bewerbungen, favoriten] = await Promise.all([
            getStatistiken(),
            getAllUsersAdmin(),
            getAllJobsAdmin(),
            getAllBewerbungenAdmin(),
            getAllFavoritenAdmin()
        ]);

        res.json({
            success: true,
            stats: {
                ...stats,
                totalFavoriten: favoriten.length,
                totalAdmins: users.filter((user) => user.user_typ === 'admin').length
            },
            recent: {
                users: users.slice(0, 5).map(({ passwort, ...userWithoutPassword }) => userWithoutPassword),
                jobs: jobs.slice(0, 5),
                bewerbungen: bewerbungen.slice(0, 5),
                favoriten: favoriten.slice(0, 5)
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Admin-Übersicht' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await getAllUsersAdmin();
        res.json({
            success: true,
            users: users.map(({ passwort, ...userWithoutPassword }) => userWithoutPassword)
        });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Benutzer' });
    }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { vorname, nachname, email, passwort, userTyp, firma } = req.body || {};

        if (!vorname || !nachname || !email || !passwort) {
            return res.status(400).json({ error: 'Vorname, Nachname, E-Mail und Passwort sind erforderlich' });
        }

        if (String(passwort).length < 6) {
            return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }

        const normalizedType = String(userTyp || 'bewerber').trim().toLowerCase();
        const allowedTypes = ['bewerber', 'admin'];
        if (!allowedTypes.includes(normalizedType)) {
            return res.status(400).json({ error: 'Ungültiger Benutzer-Typ' });
        }

        if (!EMAIL_REGEX.test(String(email).trim())) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        if (await findUserByEmail(String(email).trim())) {
            return res.status(400).json({ error: 'E-Mail bereits registriert' });
        }

        const hashedPassword = await bcrypt.hash(String(passwort), 10);
        const userId = await createUser(
            String(vorname).trim(),
            String(nachname).trim(),
            String(email).trim(),
            hashedPassword,
            normalizedType,
            firma ? String(firma).trim() : null
        );

        const createdUser = await findUserById(userId);
        const { passwort: _, ...userWithoutPassword } = createdUser;

        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Erstellen des Benutzers' });
    }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        const { vorname, nachname, email, userTyp, firma } = req.body || {};

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
        }

        if (!vorname || !nachname || !email) {
            return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind erforderlich' });
        }

        const allowedTypes = ['bewerber', 'admin'];
        if (!allowedTypes.includes(userTyp)) {
            return res.status(400).json({ error: 'Ungültiger Benutzer-Typ' });
        }

        if (req.currentAdmin && Number(req.currentAdmin.id) === targetUserId && userTyp !== 'admin') {
            return res.status(400).json({ error: 'Admin kann die eigene Rolle nicht entfernen' });
        }

        const updatedUser = await updateUserByAdmin(targetUserId, {
            vorname: String(vorname).trim(),
            nachname: String(nachname).trim(),
            email: String(email).trim(),
            userTyp,
            firma: firma ? String(firma).trim() : null
        });

        if (!updatedUser) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        const { passwort, ...userWithoutPassword } = updatedUser;
        res.json({ success: true, user: userWithoutPassword });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Aktualisieren des Benutzers' });
    }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ error: 'Ungültige Benutzer-ID' });
        }

        if (req.currentAdmin && Number(req.currentAdmin.id) === targetUserId) {
            return res.status(400).json({ error: 'Sie können sich nicht selbst löschen' });
        }

        const targetUser = await findUserById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        await deleteUserByAdmin(targetUserId);
        res.json({ success: true, message: 'Benutzer gelöscht' });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Löschen des Benutzers' });
    }
});

app.get('/api/admin/jobs', requireAdmin, async (req, res) => {
    try {
        const jobs = await getAllJobsAdmin();
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Jobs' });
    }
});

app.put('/api/admin/jobs/:id', requireAdmin, async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        if (!Number.isInteger(jobId) || jobId <= 0) {
            return res.status(400).json({ error: 'Ungültige Job-ID' });
        }

        const existingJob = await getJobById(jobId);
        if (!existingJob) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
        }

        const payload = req.body || {};
        const allowedStatus = ['aktiv', 'pausiert', 'geschlossen'];
        if (payload.status && !allowedStatus.includes(payload.status)) {
            return res.status(400).json({ error: 'Ungültiger Job-Status' });
        }

        const updatedJob = await updateJob(jobId, {
            titel: payload.titel !== undefined ? String(payload.titel).trim() : undefined,
            firma: payload.firma !== undefined ? String(payload.firma).trim() : undefined,
            standort: payload.standort !== undefined ? String(payload.standort).trim() : undefined,
            jobTyp: payload.jobTyp !== undefined ? String(payload.jobTyp).trim() : undefined,
            beschreibung: payload.beschreibung !== undefined ? String(payload.beschreibung).trim() : undefined,
            status: payload.status !== undefined ? String(payload.status).trim() : undefined
        });

        res.json({ success: true, job: updatedJob });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Aktualisieren des Jobs' });
    }
});

app.get('/api/admin/bewerbungen', requireAdmin, async (req, res) => {
    try {
        const bewerbungen = await getAllBewerbungenAdmin();
        res.json({ success: true, bewerbungen });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Bewerbungen' });
    }
});

app.get('/api/admin/favoriten', requireAdmin, async (req, res) => {
    try {
        const favoriten = await getAllFavoritenAdmin();
        res.json({ success: true, favoriten });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Favoriten' });
    }
});

app.get('/api/admin/tasks', requireAdmin, async (req, res) => {
    try {
        const tasks = await getAllTasksAdmin();
        res.json({ success: true, tasks });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Aufgaben' });
    }
});

app.patch('/api/admin/tasks/:id/status', requireAdmin, async (req, res) => {
    try {
        const status = String((req.body && req.body.status) || '').trim().toLowerCase();
        const allowedTaskStatus = ['offen', 'in_bearbeitung', 'erledigt'];

        if (!allowedTaskStatus.includes(status)) {
            return res.status(400).json({ error: 'Ungültiger Aufgaben-Status' });
        }

        const task = await updateTaskStatusByAdmin(req.params.id, status);
        if (!task) {
            return res.status(404).json({ error: 'Aufgabe nicht gefunden' });
        }

        res.json({ success: true, task });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren der Aufgabe' });
    }
});

app.get('/api/admin/termine', requireAdmin, async (req, res) => {
    try {
        const termine = await getAllTermineAdmin();
        res.json({ success: true, termine });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Termine' });
    }
});

app.delete('/api/admin/termine/:id', requireAdmin, async (req, res) => {
    try {
        const terminId = Number(req.params.id);
        if (!Number.isInteger(terminId) || terminId <= 0) {
            return res.status(400).json({ error: 'Ungültige Termin-ID' });
        }

        const deleted = await deleteTerminByAdmin(terminId);
        if (!deleted) {
            return res.status(404).json({ error: 'Termin nicht gefunden' });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Löschen des Termins' });
    }
});

app.post('/api/admin/tasks', requireAdmin, async (req, res) => {
    try {
        const { userId, titel, beschreibung, faelligAm, status, auftragVonName } = req.body || {};

        if (!userId || !titel) {
            return res.status(400).json({ error: 'Benutzer und Titel sind erforderlich' });
        }

        const normalizedStatus = String(status || 'offen').trim().toLowerCase();
        const allowedTaskStatus = ['offen', 'in_bearbeitung', 'erledigt'];
        if (!allowedTaskStatus.includes(normalizedStatus)) {
            return res.status(400).json({ error: 'Ungültiger Aufgaben-Status' });
        }

        const targetUser = await findUserById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        if (targetUser.user_typ === 'admin') {
            return res.status(400).json({ error: 'Aufgaben können nur an Bewerber zugeteilt werden' });
        }

        const normalizedSenderName = auftragVonName ? String(auftragVonName).trim() : '';
        if (normalizedSenderName.length > 140) {
            return res.status(400).json({ error: 'Auftraggeber-Name ist zu lang' });
        }

        const task = await createTaskByAdmin(req.currentAdmin.id, userId, {
            titel: String(titel).trim(),
            beschreibung: beschreibung ? String(beschreibung).trim() : '',
            faelligAm: faelligAm || null,
            status: normalizedStatus,
            adminAnzeigeName: normalizedSenderName || null
        });

        res.json({ success: true, task });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Fehler beim Erstellen der Aufgabe' });
    }
});

app.get('/api/admin/chats', requireAdmin, async (req, res) => {
    try {
        const conversations = await getChatConversationsAdmin();
        res.json({ success: true, conversations });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Livechats' });
    }
});

app.get('/api/admin/chats/:conversationId/messages', requireAdmin, async (req, res) => {
    try {
        const conversationId = normalizeConversationId(req.params.conversationId);
        if (!conversationId) {
            return res.status(400).json({ error: 'Ungültige Konversation' });
        }

        const messages = await getChatMessagesByConversation(conversationId);
        const conversation = await getChatConversationMeta(conversationId);
        if (!conversation || Boolean(conversation.conversation_deleted)) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        res.json({ success: true, conversationId, conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Chat-Nachrichten' });
    }
});

app.patch('/api/admin/chats/:conversationId/status', requireAdmin, async (req, res) => {
    try {
        const conversationId = normalizeConversationId(req.params.conversationId);
        const status = String((req.body && req.body.status) || '').trim().toLowerCase();
        const allowedStatus = ['offen', 'in_bearbeitung', 'erledigt', 'geschlossen'];

        if (!conversationId) {
            return res.status(400).json({ error: 'Ungültige Konversation' });
        }

        if (!allowedStatus.includes(status)) {
            return res.status(400).json({ error: 'Ungültiger Konversations-Status' });
        }

        const updatedConversation = await updateChatConversationState(conversationId, {
            status,
            deleted: false
        });

        if (!updatedConversation) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        res.json({ success: true, conversation: updatedConversation });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren des Konversations-Status' });
    }
});

app.delete('/api/admin/chats/:conversationId', requireAdmin, async (req, res) => {
    try {
        const conversationId = normalizeConversationId(req.params.conversationId);
        if (!conversationId) {
            return res.status(400).json({ error: 'Ungültige Konversation' });
        }

        const updatedConversation = await updateChatConversationState(conversationId, {
            deleted: true
        });

        if (!updatedConversation) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        res.json({ success: true, message: 'Konversation gelöscht' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Löschen der Konversation' });
    }
});

app.put('/api/admin/chats/:id', requireAdmin, async (req, res) => {
    try {
        const chatId = Number(req.params.id);
        const text = String((req.body && req.body.nachricht) || '').trim();

        if (!Number.isInteger(chatId) || chatId <= 0) {
            return res.status(400).json({ error: 'Ungültige Chat-ID' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Nachricht ist erforderlich' });
        }

        if (text.length > 1200) {
            return res.status(400).json({ error: 'Nachricht ist zu lang (max. 1200 Zeichen)' });
        }

        const updated = await updateChatMessageByAdmin(chatId, text);
        if (!updated) {
            return res.status(404).json({ error: 'Chat-Nachricht nicht gefunden' });
        }

        res.json({ success: true, message: updated });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Bearbeiten der Chat-Nachricht' });
    }
});

app.post('/api/admin/chats/:conversationId/reply', requireAdmin, async (req, res) => {
    try {
        const conversationId = normalizeConversationId(req.params.conversationId);
        const text = String((req.body && req.body.nachricht) || '').trim();
        const adminAnzeigename = String((req.body && req.body.adminAnzeigename) || '').trim();

        if (!conversationId) {
            return res.status(400).json({ error: 'Ungültige Konversation' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Antwort ist erforderlich' });
        }

        if (text.length > 1200) {
            return res.status(400).json({ error: 'Antwort ist zu lang (max. 1200 Zeichen)' });
        }

        const conversationMeta = await getChatConversationMeta(conversationId);
        if (!conversationMeta || Boolean(conversationMeta.conversation_deleted)) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        const conversationMessages = await getChatMessagesByConversation(conversationId);
        const latestMessage = conversationMessages[conversationMessages.length - 1];
        if (!latestMessage) {
            return res.status(404).json({ error: 'Konversation nicht gefunden' });
        }

        const reply = await createChatMessage({
            conversationId,
            nachricht: text,
            userId: latestMessage.user_id || null,
            adminId: req.currentAdmin.id,
            adminDisplayName: adminAnzeigename || `${req.currentAdmin.vorname || ''} ${req.currentAdmin.nachname || ''}`.trim() || req.currentAdmin.email,
            conversationStatus: conversationMeta.conversation_status || 'offen',
            conversationDeleted: false,
            conversationClosedAt: conversationMeta.conversation_closed_at || null,
            visitorVorname: latestMessage.visitor_vorname || latestMessage.user_vorname || null,
            visitorNachname: latestMessage.visitor_nachname || latestMessage.user_nachname || null,
            visitorEmail: latestMessage.visitor_email || latestMessage.user_email || null
        });
        res.json({ success: true, message: reply });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Senden der Antwort' });
    }
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     💼  JobVermittlung Server               ║
║                                               ║
║     Server läuft auf:                         ║
║     http://localhost:${PORT}                       ║
║                                               ║
║     Professionelle Jobvermittlung             ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
    });
}

module.exports = app;
