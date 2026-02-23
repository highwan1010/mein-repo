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
        favoriten: 0,
        tasks: 0,
        chats: 0,
        termine: 0
    },
    users: [],
    jobs: [],
    bewerbungen: [],
    favoriten: [],
    tasks: [],
    chats: [],
    termine: []
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

const mapTask = (row) => row ? {
    id: row.id,
    user_id: row.user_id,
    admin_id: row.admin_id,
    titel: row.titel,
    beschreibung: row.beschreibung,
    status: row.status,
    faellig_am: row.faellig_am,
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

        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            titel TEXT NOT NULL,
            beschreibung TEXT,
            status TEXT NOT NULL DEFAULT 'offen',
            faellig_am TIMESTAMPTZ,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS chats (
            id SERIAL PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            visitor_vorname TEXT,
            visitor_nachname TEXT,
            visitor_email TEXT,
            admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            admin_anzeige_name TEXT,
            conversation_status TEXT NOT NULL DEFAULT 'offen',
            conversation_deleted BOOLEAN NOT NULL DEFAULT FALSE,
            conversation_closed_at TIMESTAMPTZ,
            nachricht TEXT NOT NULL,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS termine (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            datum TEXT NOT NULL,
            uhrzeit TEXT NOT NULL,
            termin_zeit TIMESTAMPTZ NOT NULL,
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pgPool.query(`
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS conversation_id TEXT;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS visitor_vorname TEXT;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS visitor_nachname TEXT;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS visitor_email TEXT;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS admin_anzeige_name TEXT;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS conversation_status TEXT NOT NULL DEFAULT 'offen';
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS conversation_deleted BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE chats ADD COLUMN IF NOT EXISTS conversation_closed_at TIMESTAMPTZ;
        ALTER TABLE chats ALTER COLUMN user_id DROP NOT NULL;

        UPDATE chats
        SET conversation_id = COALESCE(conversation_id, CONCAT('legacy-', COALESCE(user_id::TEXT, id::TEXT)));

        UPDATE chats c
        SET visitor_vorname = COALESCE(c.visitor_vorname, u.vorname),
            visitor_nachname = COALESCE(c.visitor_nachname, u.nachname),
            visitor_email = COALESCE(c.visitor_email, u.email)
        FROM users u
        WHERE c.user_id = u.id;

        UPDATE chats
        SET conversation_status = COALESCE(NULLIF(TRIM(conversation_status), ''), 'offen');

        UPDATE chats
        SET conversation_deleted = COALESCE(conversation_deleted, FALSE);

        ALTER TABLE chats ALTER COLUMN conversation_id SET NOT NULL;
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

const ensureFileStoreShape = (data) => {
    const nextData = data && typeof data === 'object' ? data : defaultStore();

    if (!nextData.counters || typeof nextData.counters !== 'object') {
        nextData.counters = defaultStore().counters;
    }

    for (const key of ['users', 'jobs', 'bewerbungen', 'favoriten', 'tasks', 'chats', 'termine']) {
        if (!Array.isArray(nextData[key])) {
            nextData[key] = [];
        }
    }

    for (const counterKey of ['users', 'jobs', 'bewerbungen', 'favoriten', 'tasks', 'chats', 'termine']) {
        if (!Number.isFinite(nextData.counters[counterKey])) {
            nextData.counters[counterKey] = nextData[counterKey].reduce((maxId, item) => {
                const value = Number(item && item.id);
                return Number.isFinite(value) && value > maxId ? value : maxId;
            }, 0);
        }
    }

    nextData.chats = nextData.chats.map((chat, index) => {
        const fallbackConversationId = `legacy-${chat?.user_id ? String(chat.user_id) : String(index + 1)}`;
        const hasUserId = chat?.user_id !== null && chat?.user_id !== undefined && String(chat.user_id).trim() !== '';
        const hasAdminId = chat?.admin_id !== null && chat?.admin_id !== undefined && String(chat.admin_id).trim() !== '';
        return {
            ...chat,
            conversation_id: String(chat?.conversation_id || fallbackConversationId),
            user_id: hasUserId && Number.isInteger(Number(chat.user_id)) ? Number(chat.user_id) : null,
            visitor_vorname: chat?.visitor_vorname ? String(chat.visitor_vorname) : null,
            visitor_nachname: chat?.visitor_nachname ? String(chat.visitor_nachname) : null,
            visitor_email: chat?.visitor_email ? String(chat.visitor_email) : null,
            admin_anzeige_name: chat?.admin_anzeige_name ? String(chat.admin_anzeige_name) : null,
            conversation_status: chat?.conversation_status ? String(chat.conversation_status) : 'offen',
            conversation_deleted: Boolean(chat?.conversation_deleted),
            conversation_closed_at: chat?.conversation_closed_at ? String(chat.conversation_closed_at) : null,
            admin_id: hasAdminId && Number.isInteger(Number(chat.admin_id)) ? Number(chat.admin_id) : null
        };
    });

    nextData.termine = nextData.termine.map((termin) => {
        const hasUserId = termin?.user_id !== null && termin?.user_id !== undefined && String(termin.user_id).trim() !== '';
        return {
            ...termin,
            user_id: hasUserId && Number.isInteger(Number(termin.user_id)) ? Number(termin.user_id) : null,
            name: String(termin?.name || '').trim(),
            email: String(termin?.email || '').trim().toLowerCase(),
            datum: String(termin?.datum || '').trim(),
            uhrzeit: String(termin?.uhrzeit || '').trim(),
            termin_zeit: String(termin?.termin_zeit || ''),
            erstellt_am: termin?.erstellt_am ? String(termin.erstellt_am) : nowIso()
        };
    });

    return nextData;
};

const readDb = () => {
    initFileDatabase();
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = ensureFileStoreShape(parsed);

    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        writeDb(normalized);
    }

    return normalized;
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

const updateUserByAdmin = async (userId, data) => {
    const targetId = Number(userId);
    const normalizedEmail = data.email ? String(data.email).toLowerCase().trim() : null;

    if (USE_POSTGRES) {
        const existing = await findUserById(targetId);
        if (!existing) return null;

        if (normalizedEmail && normalizedEmail !== existing.email) {
            const emailOwner = await findUserByEmail(normalizedEmail);
            if (emailOwner && Number(emailOwner.id) !== targetId) {
                throw new Error('E-Mail bereits registriert');
            }
        }

        const result = await pgPool.query(
            `UPDATE users
             SET vorname = $1,
                 nachname = $2,
                 email = $3,
                 user_typ = $4,
                 firma = $5
             WHERE id = $6
             RETURNING *`,
            [
                data.vorname ?? existing.vorname,
                data.nachname ?? existing.nachname,
                normalizedEmail ?? existing.email,
                data.userTyp ?? existing.user_typ,
                data.firma ?? existing.firma,
                targetId
            ]
        );

        return mapUser(result.rows[0]);
    }

    const db = readDb();
    const index = db.users.findIndex((user) => user.id === targetId);
    if (index === -1) return null;

    if (normalizedEmail && normalizedEmail !== db.users[index].email) {
        const emailOwner = db.users.find((user) => user.email === normalizedEmail && user.id !== targetId);
        if (emailOwner) {
            throw new Error('E-Mail bereits registriert');
        }
    }

    db.users[index] = {
        ...db.users[index],
        vorname: data.vorname ?? db.users[index].vorname,
        nachname: data.nachname ?? db.users[index].nachname,
        email: normalizedEmail ?? db.users[index].email,
        user_typ: data.userTyp ?? db.users[index].user_typ,
        firma: data.firma ?? db.users[index].firma
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
                 firma = $2,
                 standort = $3,
                 job_typ = $4,
                 gehalt_von = $5,
                 gehalt_bis = $6,
                 beschreibung = $7,
                 anforderungen = $8,
                 benefits = $9,
                 status = $10
             WHERE id = $11
             RETURNING *`,
            [
                data.titel ?? existing.titel,
                data.firma ?? existing.firma,
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
        firma: data.firma ?? db.jobs[index].firma,
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

const updateBewerbungByAdmin = async (bewerbungId, data) => {
    if (USE_POSTGRES) {
        const existing = await getBewerbungById(bewerbungId);
        if (!existing) return null;

        const result = await pgPool.query(
            `UPDATE bewerbungen
             SET anschreiben = $1,
                 status = $2
             WHERE id = $3
             RETURNING *`,
            [
                data.anschreiben ?? existing.anschreiben,
                data.status ?? existing.status,
                Number(bewerbungId)
            ]
        );

        return result.rows[0] || null;
    }

    const db = readDb();
    const index = db.bewerbungen.findIndex((bewerbung) => bewerbung.id === Number(bewerbungId));
    if (index === -1) return null;

    db.bewerbungen[index] = {
        ...db.bewerbungen[index],
        anschreiben: data.anschreiben ?? db.bewerbungen[index].anschreiben,
        status: data.status ?? db.bewerbungen[index].status
    };

    writeDb(db);
    return db.bewerbungen[index];
};

const deleteBewerbungByAdmin = async (bewerbungId) => {
    if (USE_POSTGRES) {
        await pgPool.query('DELETE FROM bewerbungen WHERE id = $1', [Number(bewerbungId)]);
        return true;
    }

    const db = readDb();
    db.bewerbungen = db.bewerbungen.filter((bewerbung) => bewerbung.id !== Number(bewerbungId));
    writeDb(db);
    return true;
};

const createTaskByAdmin = async (adminId, userId, data) => {
    const taskStatus = String(data.status || 'offen').trim().toLowerCase();
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `INSERT INTO tasks (user_id, admin_id, titel, beschreibung, status, faellig_am)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                Number(userId),
                Number(adminId),
                data.titel,
                data.beschreibung || null,
                taskStatus,
                data.faelligAm || null
            ]
        );

        return mapTask(result.rows[0]);
    }

    const db = readDb();
    const id = nextId(db, 'tasks');
    const task = {
        id,
        user_id: Number(userId),
        admin_id: Number(adminId),
        titel: data.titel,
        beschreibung: data.beschreibung || null,
        status: taskStatus,
        faellig_am: data.faelligAm || null,
        erstellt_am: nowIso()
    };

    db.tasks.push(task);
    writeDb(db);
    return task;
};

const getTasksByUser = async (userId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT t.*, a.vorname AS admin_vorname, a.nachname AS admin_nachname, a.email AS admin_email
             FROM tasks t
             LEFT JOIN users a ON a.id = t.admin_id
             WHERE t.user_id = $1
             ORDER BY t.erstellt_am DESC`,
            [Number(userId)]
        );
        return result.rows;
    }

    const db = readDb();
    return (db.tasks || [])
        .filter((task) => Number(task.user_id) === Number(userId))
        .map((task) => {
            const admin = db.users.find((entry) => Number(entry.id) === Number(task.admin_id)) || {};
            return {
                ...task,
                admin_vorname: admin.vorname || null,
                admin_nachname: admin.nachname || null,
                admin_email: admin.email || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const getAllTasksAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT t.*, u.vorname AS user_vorname, u.nachname AS user_nachname, u.email AS user_email,
                    a.vorname AS admin_vorname, a.nachname AS admin_nachname, a.email AS admin_email
             FROM tasks t
             LEFT JOIN users u ON u.id = t.user_id
             LEFT JOIN users a ON a.id = t.admin_id
             ORDER BY t.erstellt_am DESC`
        );
        return result.rows;
    }

    const db = readDb();
    return (db.tasks || [])
        .map((task) => {
            const user = db.users.find((entry) => Number(entry.id) === Number(task.user_id)) || {};
            const admin = db.users.find((entry) => Number(entry.id) === Number(task.admin_id)) || {};
            return {
                ...task,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null,
                admin_vorname: admin.vorname || null,
                admin_nachname: admin.nachname || null,
                admin_email: admin.email || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const updateTaskStatusForUser = async (taskId, userId, status) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `UPDATE tasks
             SET status = $1
             WHERE id = $2 AND user_id = $3
             RETURNING *`,
            [status, Number(taskId), Number(userId)]
        );
        return mapTask(result.rows[0]) || null;
    }

    const db = readDb();
    const index = (db.tasks || []).findIndex(
        (task) => Number(task.id) === Number(taskId) && Number(task.user_id) === Number(userId)
    );
    if (index === -1) return null;

    db.tasks[index].status = status;
    writeDb(db);
    return db.tasks[index];
};

const createTerminByBewerber = async (userId, data) => {
    const normalizedName = String(data.name || '').trim();
    const normalizedEmail = String(data.email || '').trim().toLowerCase();
    const normalizedDate = String(data.datum || '').trim();
    const normalizedTime = String(data.uhrzeit || '').trim();
    const appointmentAt = String(data.terminZeit || '').trim();

    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `INSERT INTO termine (user_id, name, email, datum, uhrzeit, termin_zeit)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                Number(userId),
                normalizedName,
                normalizedEmail,
                normalizedDate,
                normalizedTime,
                appointmentAt
            ]
        );

        return result.rows[0] || null;
    }

    const db = readDb();
    const id = nextId(db, 'termine');
    const termin = {
        id,
        user_id: Number(userId),
        name: normalizedName,
        email: normalizedEmail,
        datum: normalizedDate,
        uhrzeit: normalizedTime,
        termin_zeit: appointmentAt,
        erstellt_am: nowIso()
    };

    db.termine.push(termin);
    writeDb(db);
    return termin;
};

const getTermineByUser = async (userId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT *
             FROM termine
             WHERE user_id = $1
             ORDER BY termin_zeit ASC, erstellt_am ASC`,
            [Number(userId)]
        );

        return result.rows;
    }

    const db = readDb();
    return (db.termine || [])
        .filter((termin) => Number(termin.user_id) === Number(userId))
        .sort((left, right) => {
            const leftDate = new Date(left.termin_zeit).getTime();
            const rightDate = new Date(right.termin_zeit).getTime();
            return leftDate - rightDate;
        });
};

const getAllTermineAdmin = async () => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT t.*, u.vorname AS user_vorname, u.nachname AS user_nachname, u.email AS user_email
             FROM termine t
             LEFT JOIN users u ON u.id = t.user_id
             ORDER BY t.termin_zeit ASC, t.erstellt_am ASC`
        );

        return result.rows;
    }

    const db = readDb();
    return (db.termine || [])
        .map((termin) => {
            const user = db.users.find((entry) => Number(entry.id) === Number(termin.user_id)) || {};
            return {
                ...termin,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null
            };
        })
        .sort((left, right) => {
            const leftDate = new Date(left.termin_zeit).getTime();
            const rightDate = new Date(right.termin_zeit).getTime();
            return leftDate - rightDate;
        });
};

const createChatMessage = async ({
    conversationId,
    nachricht,
    userId = null,
    adminId = null,
    adminDisplayName = null,
    conversationStatus = 'offen',
    conversationDeleted = false,
    conversationClosedAt = null,
    visitorVorname = null,
    visitorNachname = null,
    visitorEmail = null
}) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `INSERT INTO chats (conversation_id, user_id, admin_id, admin_anzeige_name, conversation_status, conversation_deleted, conversation_closed_at, visitor_vorname, visitor_nachname, visitor_email, nachricht)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [
                String(conversationId),
                userId ? Number(userId) : null,
                adminId ? Number(adminId) : null,
                adminDisplayName ? String(adminDisplayName) : null,
                String(conversationStatus || 'offen'),
                Boolean(conversationDeleted),
                conversationClosedAt || null,
                visitorVorname ? String(visitorVorname) : null,
                visitorNachname ? String(visitorNachname) : null,
                visitorEmail ? String(visitorEmail) : null,
                String(nachricht)
            ]
        );
        return result.rows[0];
    }

    const db = readDb();
    const id = nextId(db, 'chats');
    const entry = {
        id,
        conversation_id: String(conversationId),
        user_id: userId ? Number(userId) : null,
        admin_id: adminId ? Number(adminId) : null,
        admin_anzeige_name: adminDisplayName ? String(adminDisplayName) : null,
        conversation_status: String(conversationStatus || 'offen'),
        conversation_deleted: Boolean(conversationDeleted),
        conversation_closed_at: conversationClosedAt || null,
        visitor_vorname: visitorVorname ? String(visitorVorname) : null,
        visitor_nachname: visitorNachname ? String(visitorNachname) : null,
        visitor_email: visitorEmail ? String(visitorEmail) : null,
        nachricht: String(nachricht),
        erstellt_am: nowIso(),
        aktualisiert_am: nowIso()
    };

    db.chats.push(entry);
    writeDb(db);
    return entry;
};

const getChatMessagesByConversation = async (conversationId, options = {}) => {
    const includeDeleted = Boolean(options && options.includeDeleted);
    if (USE_POSTGRES) {
        const filters = ['c.conversation_id = $1'];
        if (!includeDeleted) {
            filters.push('COALESCE(c.conversation_deleted, FALSE) = FALSE');
        }

        const result = await pgPool.query(
            `SELECT c.*, a.vorname AS admin_vorname, a.nachname AS admin_nachname, a.email AS admin_email,
                    u.vorname AS user_vorname, u.nachname AS user_nachname, u.email AS user_email
             FROM chats c
             LEFT JOIN users a ON a.id = c.admin_id
             LEFT JOIN users u ON u.id = c.user_id
             WHERE ${filters.join(' AND ')}
             ORDER BY c.erstellt_am ASC`,
            [String(conversationId)]
        );

        return result.rows;
    }

    const db = readDb();
    return (db.chats || [])
        .filter((chat) => {
            if (String(chat.conversation_id) !== String(conversationId)) {
                return false;
            }

            if (!includeDeleted && Boolean(chat.conversation_deleted)) {
                return false;
            }

            return true;
        })
        .map((chat) => {
            const admin = db.users.find((entry) => Number(entry.id) === Number(chat.admin_id)) || {};
            const user = db.users.find((entry) => Number(entry.id) === Number(chat.user_id)) || {};
            return {
                ...chat,
                admin_vorname: admin.vorname || null,
                admin_nachname: admin.nachname || null,
                admin_email: admin.email || null,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null
            };
        })
        .sort((left, right) => new Date(left.erstellt_am) - new Date(right.erstellt_am));
};

const getChatConversationMeta = async (conversationId) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) return null;

    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `SELECT conversation_id, conversation_status, conversation_deleted, conversation_closed_at, MAX(erstellt_am) AS letzte_nachricht_am
             FROM chats
             WHERE conversation_id = $1
             GROUP BY conversation_id, conversation_status, conversation_deleted, conversation_closed_at
             ORDER BY MAX(erstellt_am) DESC
             LIMIT 1`,
            [normalizedConversationId]
        );

        return result.rows[0] || null;
    }

    const db = readDb();
    const conversationMessages = (db.chats || [])
        .filter((chat) => String(chat.conversation_id) === normalizedConversationId)
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));

    if (!conversationMessages.length) {
        return null;
    }

    const latest = conversationMessages[0];
    return {
        conversation_id: normalizedConversationId,
        conversation_status: latest.conversation_status || 'offen',
        conversation_deleted: Boolean(latest.conversation_deleted),
        conversation_closed_at: latest.conversation_closed_at || null,
        letzte_nachricht_am: latest.erstellt_am
    };
};

const updateChatConversationState = async (conversationId, payload = {}) => {
    const normalizedConversationId = String(conversationId || '').trim();
    if (!normalizedConversationId) return null;

    const requestedStatus = payload.status ? String(payload.status).trim().toLowerCase() : null;
    const requestedDeleted = payload.deleted !== undefined ? Boolean(payload.deleted) : undefined;

    const currentMeta = await getChatConversationMeta(normalizedConversationId);
    if (!currentMeta) return null;

    const nextStatus = requestedStatus || currentMeta.conversation_status || 'offen';
    const nextDeleted = requestedDeleted === undefined
        ? Boolean(currentMeta.conversation_deleted)
        : requestedDeleted;
    const shouldSetClosedAt = ['geschlossen', 'erledigt'].includes(nextStatus) && !nextDeleted;
    const nextClosedAt = shouldSetClosedAt ? nowIso() : null;

    if (USE_POSTGRES) {
        await pgPool.query(
            `UPDATE chats
             SET conversation_status = $1,
                 conversation_deleted = $2,
                 conversation_closed_at = $3,
                 aktualisiert_am = NOW()
             WHERE conversation_id = $4`,
            [nextStatus, nextDeleted, nextClosedAt, normalizedConversationId]
        );

        return getChatConversationMeta(normalizedConversationId);
    }

    const db = readDb();
    let updated = false;
    db.chats = (db.chats || []).map((chat) => {
        if (String(chat.conversation_id) !== normalizedConversationId) {
            return chat;
        }

        updated = true;
        return {
            ...chat,
            conversation_status: nextStatus,
            conversation_deleted: nextDeleted,
            conversation_closed_at: nextClosedAt,
            aktualisiert_am: nowIso()
        };
    });

    if (!updated) {
        return null;
    }

    writeDb(db);
    return getChatConversationMeta(normalizedConversationId);
};

const getAllChatsAdmin = async (options = {}) => {
    const includeDeleted = Boolean(options && options.includeDeleted);
    if (USE_POSTGRES) {
        const conditions = includeDeleted ? '' : 'WHERE COALESCE(c.conversation_deleted, FALSE) = FALSE';
        const result = await pgPool.query(
                `SELECT c.*, u.vorname AS user_vorname, u.nachname AS user_nachname, u.email AS user_email,
                    a.vorname AS admin_vorname, a.nachname AS admin_nachname, a.email AS admin_email
             FROM chats c
             LEFT JOIN users u ON u.id = c.user_id
             LEFT JOIN users a ON a.id = c.admin_id
             ${conditions}
             ORDER BY c.erstellt_am DESC`
        );

        return result.rows;
    }

    const db = readDb();
    return (db.chats || [])
        .filter((chat) => includeDeleted || !Boolean(chat.conversation_deleted))
        .map((chat) => {
            const user = db.users.find((entry) => Number(entry.id) === Number(chat.user_id)) || {};
            const admin = db.users.find((entry) => Number(entry.id) === Number(chat.admin_id)) || {};
            return {
                ...chat,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null,
                admin_vorname: admin.vorname || null,
                admin_nachname: admin.nachname || null,
                admin_email: admin.email || null
            };
        })
        .sort((left, right) => new Date(right.erstellt_am) - new Date(left.erstellt_am));
};

const aggregateChatConversations = (messages = []) => {
    const grouped = new Map();

    for (const message of messages) {
        const conversationId = String(message.conversation_id || `legacy-${message.user_id || message.id}`);
        if (!grouped.has(conversationId)) {
            grouped.set(conversationId, {
                conversation_id: conversationId,
                user_id: message.user_id || null,
                visitor_vorname: message.visitor_vorname || message.user_vorname || null,
                visitor_nachname: message.visitor_nachname || message.user_nachname || null,
                visitor_email: message.visitor_email || message.user_email || null,
                letzte_nachricht: message.nachricht || '',
                letzte_nachricht_am: message.erstellt_am,
                letzte_nachricht_von_admin: Boolean(message.admin_id),
                letzte_admin_anzeige_name: message.admin_anzeige_name || null,
                conversation_status: message.conversation_status || 'offen',
                conversation_deleted: Boolean(message.conversation_deleted),
                conversation_closed_at: message.conversation_closed_at || null,
                anzahl_nachrichten: 1
            });
            continue;
        }

        const current = grouped.get(conversationId);
        current.anzahl_nachrichten += 1;
        if (!current.letzte_nachricht_am || new Date(message.erstellt_am) > new Date(current.letzte_nachricht_am)) {
            current.letzte_nachricht = message.nachricht || '';
            current.letzte_nachricht_am = message.erstellt_am;
            current.letzte_nachricht_von_admin = Boolean(message.admin_id);
            current.letzte_admin_anzeige_name = message.admin_anzeige_name || null;
            current.conversation_status = message.conversation_status || 'offen';
            current.conversation_deleted = Boolean(message.conversation_deleted);
            current.conversation_closed_at = message.conversation_closed_at || null;
        }

        if (!current.visitor_vorname && (message.visitor_vorname || message.user_vorname)) {
            current.visitor_vorname = message.visitor_vorname || message.user_vorname || null;
        }
        if (!current.visitor_nachname && (message.visitor_nachname || message.user_nachname)) {
            current.visitor_nachname = message.visitor_nachname || message.user_nachname || null;
        }
        if (!current.visitor_email && (message.visitor_email || message.user_email)) {
            current.visitor_email = message.visitor_email || message.user_email || null;
        }
        if (!current.user_id && message.user_id) {
            current.user_id = message.user_id;
        }
    }

    return Array.from(grouped.values()).sort(
        (left, right) => new Date(right.letzte_nachricht_am || 0) - new Date(left.letzte_nachricht_am || 0)
    );
};

const getChatConversationsByUser = async ({ userId = null, email = null } = {}) => {
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    if (!userId && !normalizedEmail) {
        return [];
    }

    if (USE_POSTGRES) {
        const whereParts = [];
        const values = [];

        if (userId) {
            values.push(Number(userId));
            whereParts.push(`c.user_id = $${values.length}`);
        }

        if (normalizedEmail) {
            values.push(normalizedEmail);
            whereParts.push(`LOWER(COALESCE(c.visitor_email, '')) = $${values.length}`);
        }

        const result = await pgPool.query(
            `SELECT c.*, a.vorname AS admin_vorname, a.nachname AS admin_nachname, a.email AS admin_email,
                    u.vorname AS user_vorname, u.nachname AS user_nachname, u.email AS user_email
             FROM chats c
             LEFT JOIN users a ON a.id = c.admin_id
             LEFT JOIN users u ON u.id = c.user_id
                         WHERE (${whereParts.join(' OR ')})
                             AND COALESCE(c.conversation_deleted, FALSE) = FALSE
             ORDER BY c.erstellt_am DESC`,
            values
        );

        return aggregateChatConversations(result.rows || []);
    }

    const db = readDb();
    const messages = (db.chats || [])
        .filter((chat) => {
            const matchesUser = userId ? Number(chat.user_id) === Number(userId) : false;
            const matchesEmail = normalizedEmail
                ? String(chat.visitor_email || '').trim().toLowerCase() === normalizedEmail
                : false;
            return (matchesUser || matchesEmail) && !Boolean(chat.conversation_deleted);
        })
        .map((chat) => {
            const admin = db.users.find((entry) => Number(entry.id) === Number(chat.admin_id)) || {};
            const user = db.users.find((entry) => Number(entry.id) === Number(chat.user_id)) || {};
            return {
                ...chat,
                admin_vorname: admin.vorname || null,
                admin_nachname: admin.nachname || null,
                admin_email: admin.email || null,
                user_vorname: user.vorname || null,
                user_nachname: user.nachname || null,
                user_email: user.email || null
            };
        });

    return aggregateChatConversations(messages);
};

const getChatConversationsAdmin = async () => {
    const messages = await getAllChatsAdmin();
    return aggregateChatConversations(messages);
};

const getChatById = async (chatId) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query('SELECT * FROM chats WHERE id = $1 LIMIT 1', [Number(chatId)]);
        return result.rows[0] || null;
    }

    const db = readDb();
    return (db.chats || []).find((chat) => Number(chat.id) === Number(chatId)) || null;
};

const updateChatMessageByAdmin = async (chatId, nachricht) => {
    if (USE_POSTGRES) {
        const result = await pgPool.query(
            `UPDATE chats
             SET nachricht = $1,
                 aktualisiert_am = NOW()
             WHERE id = $2
             RETURNING *`,
            [String(nachricht), Number(chatId)]
        );
        return result.rows[0] || null;
    }

    const db = readDb();
    const index = (db.chats || []).findIndex((chat) => Number(chat.id) === Number(chatId));
    if (index === -1) return null;

    db.chats[index].nachricht = String(nachricht);
    db.chats[index].aktualisiert_am = nowIso();
    writeDb(db);
    return db.chats[index];
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

const deleteUserByAdmin = async (userId) => {
    const targetId = Number(userId);

    if (USE_POSTGRES) {
        await pgPool.query('DELETE FROM users WHERE id = $1', [targetId]);
        return true;
    }

    const db = readDb();
    db.users = db.users.filter((user) => user.id !== targetId);

    const jobIdsByUser = db.jobs
        .filter((job) => Number(job.arbeitgeber_id) === targetId)
        .map((job) => Number(job.id));

    db.jobs = db.jobs.filter((job) => Number(job.arbeitgeber_id) !== targetId);
    db.bewerbungen = db.bewerbungen.filter(
        (bewerbung) => Number(bewerbung.bewerber_id) !== targetId && !jobIdsByUser.includes(Number(bewerbung.job_id))
    );
    db.favoriten = db.favoriten.filter(
        (favorit) => Number(favorit.user_id) !== targetId && !jobIdsByUser.includes(Number(favorit.job_id))
    );

    writeDb(db);
    return true;
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
    updateBewerbungByAdmin,
    deleteBewerbungByAdmin,
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
    createTerminByBewerber,
    getTermineByUser,
    getAllTermineAdmin,
    createChatMessage,
    getChatMessagesByConversation,
    getChatConversationMeta,
    updateChatConversationState,
    getChatConversationsByUser,
    getAllChatsAdmin,
    getChatConversationsAdmin,
    getChatById,
    updateChatMessageByAdmin,
    getAllJobsAdmin,
    getAllBewerbungenAdmin,
    getAllFavoritenAdmin,
    getStatistiken
};
