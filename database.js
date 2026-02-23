const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : (process.env.VERCEL ? path.join(os.tmpdir(), 'jobportal.json') : path.join(__dirname, 'jobportal.json'));

const CONNECTION_STRING = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const USE_POSTGRES = Boolean(CONNECTION_STRING);
const REQUIRE_POSTGRES = process.env.NODE_ENV === 'production';

const pgPool = USE_POSTGRES ? new Pool({
    connectionString: CONNECTION_STRING,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
}) : null;

const defaultStore = () => ({
    counters: {
        users: 0,
        jobs: 0,
        bewerbungen: 0,
        favoriten: 0
    },
    users: [],
    jobs: [],
    bewerbungen: [],
    favoriten: []
});

const nowIso = () => new Date().toISOString();

const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const mapUser = (row) => row ? {
    id: row.id,
    vorname: row.vorname,
    nachname: row.nachname,
    email: row.email,
    passwort: row.passwort,
    user_typ: row.user_typ,
    firma: row.firma,
    position: row.position,
    telefon: row.telefon,
    standort: row.standort,
    profilbild: row.profilbild,
    lebenslauf: row.lebenslauf,
    erstellt_am: row.erstellt_am
} : null;

const mapJob = (row) => row ? {
    id: row.id,
    arbeitgeber_id: row.arbeitgeber_id,
    titel: row.titel,
    firma: row.firma,
    standort: row.standort,
    job_typ: row.job_typ,
    gehalt_von: row.gehalt_von,
    gehalt_bis: row.gehalt_bis,
    beschreibung: row.beschreibung,
    anforderungen: row.anforderungen,
    benefits: row.benefits,
    kategorie: row.kategorie,
    branche: row.branche,
    erfahrung: row.erfahrung,
    status: row.status,
    erstellt_am: row.erstellt_am
} : null;

const initPostgres = async () => {
    await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            passwort TEXT NOT NULL,
            user_typ TEXT NOT NULL DEFAULT 'bewerber',
            firma TEXT,
            position TEXT,
            telefon TEXT,
            standort TEXT,
            profilbild TEXT,
            lebenslauf TEXT,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            arbeitgeber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            titel TEXT NOT NULL,
            firma TEXT NOT NULL,
            standort TEXT NOT NULL,
            job_typ TEXT,
            gehalt_von INTEGER,
            gehalt_bis INTEGER,
            beschreibung TEXT NOT NULL,
            anforderungen TEXT,
            benefits TEXT,
            kategorie TEXT,
            branche TEXT,
            erfahrung TEXT,
            status TEXT NOT NULL DEFAULT 'aktiv',
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS bewerbungen (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            bewerber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            anschreiben TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'eingereicht',
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (job_id, bewerber_id)
        );

        CREATE TABLE IF NOT EXISTS favoriten (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (user_id, job_id)
        );
    `);

    console.log('✅ Postgres-Datenbank initialisiert');
};

const initFileDatabase = () => {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultStore(), null, 2), 'utf8');
    }

    console.log(`✅ Datei-Datenbank initialisiert (${DB_PATH})`);
};

const readDb = () => {
    initFileDatabase();
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
};

const writeDb = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
};

const nextId = (db, key) => {
    db.counters[key] += 1;
    return db.counters[key];
};

const ensureConfiguredAdmin = async () => {
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '').trim();

    if (!adminEmail || !adminPassword) return;

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    if (USE_POSTGRES) {
        const existing = await pgPool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [adminEmail]);

        if (existing.rowCount > 0) {
            await pgPool.query(
                `UPDATE users
                 SET vorname = COALESCE(vorname, 'System'),
                     nachname = COALESCE(nachname, 'Admin'),
                     passwort = $1,
                     user_typ = 'admin'
                 WHERE id = $2`,
                [hashedPassword, existing.rows[0].id]
            );
        } else {
            await pgPool.query(
                `INSERT INTO users (vorname, nachname, email, passwort, user_typ, firma)
                 VALUES ('System', 'Admin', $1, $2, 'admin', NULL)`,
                [adminEmail, hashedPassword]
            );
        }

        console.log(`✅ Admin-Benutzer synchronisiert (${adminEmail})`);
        return;
    }

    const db = readDb();
    const existingUser = db.users.find((entry) => String(entry.email).toLowerCase() === adminEmail);

    if (existingUser) {
        existingUser.passwort = hashedPassword;
        existingUser.user_typ = 'admin';
        existingUser.vorname = existingUser.vorname || 'System';
        existingUser.nachname = existingUser.nachname || 'Admin';
    } else {
        const id = nextId(db, 'users');
        db.users.push({
            id,
            vorname: 'System',
            nachname: 'Admin',
            email: adminEmail,
            passwort: hashedPassword,
            user_typ: 'admin',
            firma: null,
            position: null,
            telefon: null,
            standort: null,
            profilbild: null,
            lebenslauf: null,
            erstellt_am: nowIso()
        });
    }

    writeDb(db);
    console.log(`✅ Admin-Benutzer synchronisiert (${adminEmail})`);
};

const initDatabase = async () => {
    if (REQUIRE_POSTGRES && !USE_POSTGRES) {
        throw new Error('Production benötigt eine Online-Datenbank: Bitte DATABASE_URL oder POSTGRES_URL setzen.');
    }

    if (USE_POSTGRES) {
        await initPostgres();
        await ensureConfiguredAdmin();
        return;
    }

    initFileDatabase();
    await ensureConfiguredAdmin();
};

const createUser = async (vorname, nachname, email, passwort, userTyp = 'bewerber', firma = null) => {
    const normalizedEmail = String(email).toLowerCase();

    if (USE_POSTGRES) {
        const existing = await findUserByEmail(normalizedEmail);
        if (existing) {
            throw new Error('E-Mail bereits registriert');
        }

        const result = await pgPool.query(
            `INSERT INTO users (vorname, nachname, email, passwort, user_typ, firma)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [vorname, nachname, normalizedEmail, passwort, userTyp || 'bewerber', firma || null]
        );

        return result.rows[0].id;
    }

    const db = readDb();
    if (db.users.some((user) => user.email === normalizedEmail)) {
        throw new Error('E-Mail bereits registriert');
    }

    const id = nextId(db, 'users');
    db.users.push({
        id,
        vorname,
        nachname,
        email: normalizedEmail,
        passwort,
        user_typ: userTyp || 'bewerber',
        firma: firma || null,
        position: null,
        telefon: null,
        standort: null,
        profilbild: null,
        lebenslauf: null,
        erstellt_am: nowIso()
    });

    writeDb(db);
    return id;
};

const findUserByEmail = async (email) => {
    const normalizedEmail = String(email).toLowerCase();

    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [normalizedEmail]);
        return mapUser(result.rows[0]) || null;
    }

    const db = readDb();
    return db.users.find((user) => user.email === normalizedEmail) || null;
};

const findUserById = async (id) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [Number(id)]);
        return mapUser(result.rows[0]) || null;
    }

    const db = readDb();
    return db.users.find((user) => user.id === Number(id)) || null;
};

const updateUserProfile = async (userId, data) => {
    if (USE_POSTGRES) {
        const existing = await findUserById(userId);
        if (!existing) return null;

        const result = await pgPool.query(
            `UPDATE users
             SET telefon = $1,
                 standort = $2,
                 position = $3,
                 lebenslauf = $4
             WHERE id = $5
             RETURNING *`,
            [
                data.telefon ?? existing.telefon,
                data.standort ?? existing.standort,
                data.position ?? existing.position,
                data.lebenslauf ?? existing.lebenslauf,
                Number(userId)
            ]
        );

        return mapUser(result.rows[0]);
    }

    const db = readDb();
    const index = db.users.findIndex((user) => user.id === Number(userId));
    if (index === -1) return null;

    db.users[index] = {
        ...db.users[index],
        telefon: data.telefon ?? db.users[index].telefon,
        standort: data.standort ?? db.users[index].standort,
        position: data.position ?? db.users[index].position,
        lebenslauf: data.lebenslauf ?? db.users[index].lebenslauf
    };

    writeDb(db);
    return db.users[index];
};

const createJob = async (arbeitgeberId, jobData) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `INSERT INTO jobs (
                arbeitgeber_id, titel, firma, standort, job_typ, gehalt_von, gehalt_bis,
                beschreibung, anforderungen, benefits, kategorie, branche, erfahrung, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, 'aktiv'
            ) RETURNING id`,
            [
                Number(arbeitgeberId),
                jobData.titel,
                jobData.firma,
                jobData.standort,
                jobData.jobTyp,
                toNumberOrNull(jobData.gehaltVon),
                toNumberOrNull(jobData.gehaltBis),
                jobData.beschreibung,
                jobData.anforderungen || '',
                jobData.benefits || '',
                jobData.kategorie || '',
                jobData.branche || '',
                jobData.erfahrung || ''
            ]
        );

        return result.rows[0].id;
    }

    const db = readDb();
    const id = nextId(db, 'jobs');

    db.jobs.push({
        id,
        arbeitgeber_id: Number(arbeitgeberId),
        titel: jobData.titel,
        firma: jobData.firma,
        standort: jobData.standort,
        job_typ: jobData.jobTyp,
        gehalt_von: toNumberOrNull(jobData.gehaltVon),
        gehalt_bis: toNumberOrNull(jobData.gehaltBis),
        beschreibung: jobData.beschreibung,
        anforderungen: jobData.anforderungen || '',
        benefits: jobData.benefits || '',
        kategorie: jobData.kategorie || '',
        branche: jobData.branche || '',
        erfahrung: jobData.erfahrung || '',
        status: 'aktiv',
        erstellt_am: nowIso()
    });

    writeDb(db);
    return id;
};

const getAllJobs = async (filters = {}) => {
    if (USE_POSTGRES) {
        const whereParts = ["status = 'aktiv'"];
        const values = [];

        if (filters.standort) {
            values.push(`%${String(filters.standort).toLowerCase()}%`);
            whereParts.push(`LOWER(COALESCE(standort, '')) LIKE $${values.length}`);
        }

        if (filters.kategorie) {
            values.push(filters.kategorie);
            whereParts.push(`kategorie = $${values.length}`);
        }

        if (filters.jobTyp) {
            values.push(filters.jobTyp);
            whereParts.push(`job_typ = $${values.length}`);
        }

        if (filters.search) {
            values.push(`%${String(filters.search).toLowerCase()}%`);
            whereParts.push(`(
                LOWER(COALESCE(titel, '')) LIKE $${values.length}
                OR LOWER(COALESCE(beschreibung, '')) LIKE $${values.length}
                OR LOWER(COALESCE(firma, '')) LIKE $${values.length}
            )`);
        }

        const sql = `SELECT * FROM jobs WHERE ${whereParts.join(' AND ')} ORDER BY erstellt_am DESC`;
        const result = await pgPool.query(sql, values);
        return result.rows.map(mapJob);
    }

    const db = readDb();
    let jobs = db.jobs.filter((job) => job.status === 'aktiv');

    if (filters.standort) {
        const needle = String(filters.standort).toLowerCase();
        jobs = jobs.filter((job) => String(job.standort || '').toLowerCase().includes(needle));
    }

    if (filters.kategorie) {
        jobs = jobs.filter((job) => job.kategorie === filters.kategorie);
    }

    if (filters.jobTyp) {
        jobs = jobs.filter((job) => job.job_typ === filters.jobTyp);
    }

    if (filters.search) {
        const needle = String(filters.search).toLowerCase();
        jobs = jobs.filter((job) =>
            String(job.titel || '').toLowerCase().includes(needle)
            || String(job.beschreibung || '').toLowerCase().includes(needle)
            || String(job.firma || '').toLowerCase().includes(needle)
        );
    }

    return jobs.sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getJobById = async (id) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM jobs WHERE id = $1 LIMIT 1', [Number(id)]);
        return mapJob(result.rows[0]) || null;
    }

    const db = readDb();
    return db.jobs.find((job) => job.id === Number(id)) || null;
};

const getJobsByArbeitgeber = async (arbeitgeberId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            'SELECT * FROM jobs WHERE arbeitgeber_id = $1 ORDER BY erstellt_am DESC',
            [Number(arbeitgeberId)]
        );
        return result.rows.map(mapJob);
    }

    const db = readDb();
    return db.jobs
        .filter((job) => job.arbeitgeber_id === Number(arbeitgeberId))
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const updateJob = async (jobId, data) => {
    if (USE_POSTGRES) {
        const existing = await getJobById(jobId);
        if (!existing) return null;

        const result = await pgPool.query(
            `UPDATE jobs
             SET titel = $1,
                 standort = $2,
                 job_typ = $3,
                 gehalt_von = $4,
                 gehalt_bis = $5,
                 beschreibung = $6,
                 anforderungen = $7,
                 benefits = $8,
                 status = $9
             WHERE id = $10
             RETURNING *`,
            [
                data.titel ?? existing.titel,
                data.standort ?? existing.standort,
                data.jobTyp ?? existing.job_typ,
                data.gehaltVon ?? existing.gehalt_von,
                data.gehaltBis ?? existing.gehalt_bis,
                data.beschreibung ?? existing.beschreibung,
                data.anforderungen ?? existing.anforderungen,
                data.benefits ?? existing.benefits,
                data.status ?? existing.status,
                Number(jobId)
            ]
        );

        return mapJob(result.rows[0]);
    }

    const db = readDb();
    const index = db.jobs.findIndex((job) => job.id === Number(jobId));
    if (index === -1) return null;

    db.jobs[index] = {
        ...db.jobs[index],
        titel: data.titel ?? db.jobs[index].titel,
        standort: data.standort ?? db.jobs[index].standort,
        job_typ: data.jobTyp ?? db.jobs[index].job_typ,
        gehalt_von: data.gehaltVon ?? db.jobs[index].gehalt_von,
        gehalt_bis: data.gehaltBis ?? db.jobs[index].gehalt_bis,
        beschreibung: data.beschreibung ?? db.jobs[index].beschreibung,
        anforderungen: data.anforderungen ?? db.jobs[index].anforderungen,
        benefits: data.benefits ?? db.jobs[index].benefits,
        status: data.status ?? db.jobs[index].status
    };

    writeDb(db);
    return db.jobs[index];
};

const deleteJob = async (jobId) => {
    if (USE_POSTGRES) {
        await pgPool.query('DELETE FROM jobs WHERE id = $1', [Number(jobId)]);
        return true;
    }

    const db = readDb();
    db.jobs = db.jobs.filter((job) => job.id !== Number(jobId));
    db.bewerbungen = db.bewerbungen.filter((bewerbung) => bewerbung.job_id !== Number(jobId));
    db.favoriten = db.favoriten.filter((favorit) => favorit.job_id !== Number(jobId));
    writeDb(db);
    return true;
};

const createBewerbung = async (jobId, bewerberId, anschreiben) => {
    if (USE_POSTGRES) {
        try {
            const result = await pgPool.query(
                `INSERT INTO bewerbungen (job_id, bewerber_id, anschreiben, status)
                 VALUES ($1, $2, $3, 'eingereicht')
                 RETURNING id`,
                [Number(jobId), Number(bewerberId), anschreiben]
            );
            return result.rows[0].id;
        } catch (error) {
            if (String(error.message).toLowerCase().includes('unique')) {
                throw new Error('Sie haben sich bereits auf diesen Job beworben');
            }
            throw error;
        }
    }

    const db = readDb();

    const duplicate = db.bewerbungen.find(
        (bewerbung) => bewerbung.job_id === Number(jobId) && bewerbung.bewerber_id === Number(bewerberId)
    );
    if (duplicate) {
        throw new Error('Sie haben sich bereits auf diesen Job beworben');
    }

    const id = nextId(db, 'bewerbungen');
    db.bewerbungen.push({
        id,
        job_id: Number(jobId),
        bewerber_id: Number(bewerberId),
        anschreiben,
        status: 'eingereicht',
        erstellt_am: nowIso()
    });

    writeDb(db);
    return id;
};

const getBewerbungenByBewerber = async (bewerberId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT b.*, j.titel, j.firma, j.standort
             FROM bewerbungen b
             LEFT JOIN jobs j ON j.id = b.job_id
             WHERE b.bewerber_id = $1
             ORDER BY b.erstellt_am DESC`,
            [Number(bewerberId)]
        );
        return result.rows;
    }

    const db = readDb();
    return db.bewerbungen
        .filter((bewerbung) => bewerbung.bewerber_id === Number(bewerberId))
        .map((bewerbung) => {
            const job = db.jobs.find((entry) => entry.id === bewerbung.job_id) || {};
            return {
                ...bewerbung,
                titel: job.titel || null,
                firma: job.firma || null,
                standort: job.standort || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getBewerbungenByJob = async (jobId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT b.*, u.vorname, u.nachname, u.email, u.telefon, u.lebenslauf
             FROM bewerbungen b
             LEFT JOIN users u ON u.id = b.bewerber_id
             WHERE b.job_id = $1
             ORDER BY b.erstellt_am DESC`,
            [Number(jobId)]
        );
        return result.rows;
    }

    const db = readDb();
    return db.bewerbungen
        .filter((bewerbung) => bewerbung.job_id === Number(jobId))
        .map((bewerbung) => {
            const user = db.users.find((entry) => entry.id === bewerbung.bewerber_id) || {};
            return {
                ...bewerbung,
                vorname: user.vorname || null,
                nachname: user.nachname || null,
                email: user.email || null,
                telefon: user.telefon || null,
                lebenslauf: user.lebenslauf || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getBewerbungById = async (bewerbungId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM bewerbungen WHERE id = $1 LIMIT 1', [Number(bewerbungId)]);
        return result.rows[0] || null;
    }

    const db = readDb();
    return db.bewerbungen.find((bewerbung) => bewerbung.id === Number(bewerbungId)) || null;
};

const updateBewerbungStatus = async (bewerbungId, status) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            'UPDATE bewerbungen SET status = $1 WHERE id = $2 RETURNING *',
            [status, Number(bewerbungId)]
        );
        return result.rows[0] || null;
    }

    const db = readDb();
    const index = db.bewerbungen.findIndex((bewerbung) => bewerbung.id === Number(bewerbungId));
    if (index === -1) return null;

    db.bewerbungen[index].status = status;
    writeDb(db);
    return db.bewerbungen[index];
};

const addFavorit = async (userId, jobId) => {
    if (USE_POSTGRES) {
        try {
            const result = await pgPool.query(
                `INSERT INTO favoriten (user_id, job_id)
                 VALUES ($1, $2)
                 RETURNING id`,
                [Number(userId), Number(jobId)]
            );
            return result.rows[0].id;
        } catch (error) {
            if (String(error.message).toLowerCase().includes('unique')) {
                throw new Error('Job bereits als Favorit gespeichert');
            }
            throw error;
        }
    }

    const db = readDb();
    const exists = db.favoriten.some(
        (favorit) => favorit.user_id === Number(userId) && favorit.job_id === Number(jobId)
    );
    if (exists) {
        throw new Error('Job bereits als Favorit gespeichert');
    }

    const id = nextId(db, 'favoriten');
    db.favoriten.push({
        id,
        user_id: Number(userId),
        job_id: Number(jobId),
        erstellt_am: nowIso()
    });
    writeDb(db);
    return id;
};

const removeFavorit = async (userId, jobId) => {
    if (USE_POSTGRES) {
        await pgPool.query('DELETE FROM favoriten WHERE user_id = $1 AND job_id = $2', [Number(userId), Number(jobId)]);
        return true;
    }

    const db = readDb();
    db.favoriten = db.favoriten.filter(
        (favorit) => !(favorit.user_id === Number(userId) && favorit.job_id === Number(jobId))
    );
    writeDb(db);
    return true;
};

const getFavoriten = async (userId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT j.*, f.erstellt_am AS favorit_seit
             FROM favoriten f
             JOIN jobs j ON j.id = f.job_id
             WHERE f.user_id = $1
             ORDER BY f.erstellt_am DESC`,
            [Number(userId)]
        );
        return result.rows.map((row) => ({ ...mapJob(row), favorit_seit: row.favorit_seit }));
    }

    const db = readDb();
    return db.favoriten
        .filter((favorit) => favorit.user_id === Number(userId))
        .map((favorit) => {
            const job = db.jobs.find((entry) => entry.id === favorit.job_id);
            return {
                ...(job || {}),
                favorit_seit: favorit.erstellt_am
            };
        })
        .filter((entry) => entry.id)
        .sort((left, right) => new Date(right.favorit_seit) - new Date(left.favorit_seit));
};

const isFavorit = async (userId, jobId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            'SELECT 1 FROM favoriten WHERE user_id = $1 AND job_id = $2 LIMIT 1',
            [Number(userId), Number(jobId)]
        );
        return result.rowCount > 0;
    }

    const db = readDb();
    return db.favoriten.some(
        (favorit) => favorit.user_id === Number(userId) && favorit.job_id === Number(jobId)
    );
};

const getAllUsersAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM users ORDER BY erstellt_am DESC');
        return result.rows.map(mapUser);
    }

    const db = readDb();
    return [...db.users].sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getAllJobsAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT j.*, u.vorname AS arbeitgeber_vorname, u.nachname AS arbeitgeber_nachname, u.email AS arbeitgeber_email
             FROM jobs j
             LEFT JOIN users u ON u.id = j.arbeitgeber_id
             ORDER BY j.erstellt_am DESC`
        );
        return result.rows;
    }

    const db = readDb();
    return db.jobs
        .map((job) => {
            const arbeitgeber = db.users.find((entry) => entry.id === Number(job.arbeitgeber_id)) || {};
            return {
                ...job,
                arbeitgeber_vorname: arbeitgeber.vorname || null,
                arbeitgeber_nachname: arbeitgeber.nachname || null,
                arbeitgeber_email: arbeitgeber.email || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getAllBewerbungenAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT b.*, 
                    u.vorname AS bewerber_vorname,
                    u.nachname AS bewerber_nachname,
                    u.email AS bewerber_email,
                    j.titel AS job_titel,
                    j.firma AS job_firma
             FROM bewerbungen b
             LEFT JOIN users u ON u.id = b.bewerber_id
             LEFT JOIN jobs j ON j.id = b.job_id
             ORDER BY b.erstellt_am DESC`
        );
        return result.rows;
    }

    const db = readDb();
    return db.bewerbungen
        .map((bewerbung) => {
            const bewerber = db.users.find((entry) => entry.id === Number(bewerbung.bewerber_id)) || {};
            const job = db.jobs.find((entry) => entry.id === Number(bewerbung.job_id)) || {};

            return {
                ...bewerbung,
                bewerber_vorname: bewerber.vorname || null,
                bewerber_nachname: bewerber.nachname || null,
                bewerber_email: bewerber.email || null,
                job_titel: job.titel || null,
                job_firma: job.firma || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getAllFavoritenAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT f.*, 
                    u.vorname AS user_vorname,
                    u.nachname AS user_nachname,
                    u.email AS user_email,
                    j.titel AS job_titel,
                    j.firma AS job_firma
             FROM favoriten f
             LEFT JOIN users u ON u.id = f.user_id
             LEFT JOIN jobs j ON j.id = f.job_id
             ORDER BY f.erstellt_am DESC`
        );
        return result.rows;
    }

    const db = readDb();
    return db.favoriten
        .map((favorit) => {
            const user = db.users.find((entry) => entry.id === Number(favorit.user_id)) || {};
            const job = db.jobs.find((entry) => entry.id === Number(favorit.job_id)) || {};

            return {
                ...favorit,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null,
                job_titel: job.titel || null,
                job_firma: job.firma || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getStatistiken = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(`
            SELECT
                (SELECT COUNT(*)::INT FROM jobs WHERE status = 'aktiv') AS "totalJobs",
                (SELECT COUNT(*)::INT FROM users) AS "totalUsers",
                (SELECT COUNT(*)::INT FROM bewerbungen) AS "totalBewerbungen",
                (SELECT COUNT(*)::INT FROM users WHERE user_typ = 'arbeitgeber') AS "totalArbeitgeber"
        `);

        return result.rows[0];
    }

    const db = readDb();
    return {
        totalJobs: db.jobs.filter((job) => job.status === 'aktiv').length,
        totalUsers: db.users.length,
        totalBewerbungen: db.bewerbungen.length,
        totalArbeitgeber: db.users.filter((user) => user.user_typ === 'arbeitgeber').length
    };
};

module.exports = {
    db: null,
    initDatabase,
    createUser,
    findUserByEmail,
    findUserById,
    updateUserProfile,
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
    getAllJobsAdmin,
    getAllBewerbungenAdmin,
    getAllFavoritenAdmin,
    getStatistiken
};
