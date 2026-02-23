const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'jobportal.db');
const db = new Database(DB_PATH);

// Datenbank-Tabellen initialisieren
const initDatabase = () => {
    // Users Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            passwort TEXT NOT NULL,
            user_typ TEXT DEFAULT 'bewerber',
            firma TEXT,
            position TEXT,
            telefon TEXT,
            standort TEXT,
            profilbild TEXT,
            lebenslauf TEXT,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Jobs Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            arbeitgeber_id INTEGER NOT NULL,
            titel TEXT NOT NULL,
            firma TEXT NOT NULL,
            standort TEXT NOT NULL,
            job_typ TEXT NOT NULL,
            gehalt_von INTEGER,
            gehalt_bis INTEGER,
            beschreibung TEXT NOT NULL,
            anforderungen TEXT,
            benefits TEXT,
            kategorie TEXT,
            branche TEXT,
            erfahrung TEXT,
            status TEXT DEFAULT 'aktiv',
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (arbeitgeber_id) REFERENCES users(id)
        )
    `);

    // Bewerbungen Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS bewerbungen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            bewerber_id INTEGER NOT NULL,
            anschreiben TEXT,
            status TEXT DEFAULT 'eingereicht',
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            FOREIGN KEY (bewerber_id) REFERENCES users(id)
        )
    `);

    // Favoriten Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS favoriten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (job_id) REFERENCES jobs(id),
            UNIQUE(user_id, job_id)
        )
    `);

    console.log('✅ Datenbank-Tabellen initialisiert');
};

// === USER OPERATIONS ===

const createUser = (vorname, nachname, email, passwort, userTyp = 'bewerber', firma = null) => {
    const stmt = db.prepare(`
        INSERT INTO users (vorname, nachname, email, passwort, user_typ, firma)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    try {
        const result = stmt.run(vorname, nachname, email.toLowerCase(), passwort, userTyp, firma);
        return result.lastInsertRowid;
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            throw new Error('E-Mail bereits registriert');
        }
        throw error;
    }
};

const findUserByEmail = (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email.toLowerCase());
};

const findUserById = (id) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
};

const updateUserProfile = (userId, data) => {
    const { telefon, standort, position, lebenslauf } = data;
    const stmt = db.prepare(`
        UPDATE users 
        SET telefon = ?, standort = ?, position = ?, lebenslauf = ?
        WHERE id = ?
    `);
    return stmt.run(telefon, standort, position, lebenslauf, userId);
};

// === JOB OPERATIONS ===

const createJob = (arbeitgeberId, jobData) => {
    const stmt = db.prepare(`
        INSERT INTO jobs (
            arbeitgeber_id, titel, firma, standort, job_typ, 
            gehalt_von, gehalt_bis, beschreibung, anforderungen, 
            benefits, kategorie, branche, erfahrung
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
        arbeitgeberId,
        jobData.titel,
        jobData.firma,
        jobData.standort,
        jobData.jobTyp,
        jobData.gehaltVon,
        jobData.gehaltBis,
        jobData.beschreibung,
        jobData.anforderungen,
        jobData.benefits,
        jobData.kategorie,
        jobData.branche,
        jobData.erfahrung
    );
    
    return result.lastInsertRowid;
};

const getAllJobs = (filters = {}) => {
    let query = 'SELECT * FROM jobs WHERE status = "aktiv"';
    const params = [];
    
    if (filters.standort) {
        query += ' AND standort LIKE ?';
        params.push(`%${filters.standort}%`);
    }
    
    if (filters.kategorie) {
        query += ' AND kategorie = ?';
        params.push(filters.kategorie);
    }
    
    if (filters.jobTyp) {
        query += ' AND job_typ = ?';
        params.push(filters.jobTyp);
    }
    
    if (filters.search) {
        query += ' AND (titel LIKE ? OR beschreibung LIKE ? OR firma LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }
    
    query += ' ORDER BY erstellt_am DESC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
};

const getJobById = (id) => {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    return stmt.get(id);
};

const getJobsByArbeitgeber = (arbeitgeberId) => {
    const stmt = db.prepare('SELECT * FROM jobs WHERE arbeitgeber_id = ? ORDER BY erstellt_am DESC');
    return stmt.all(arbeitgeberId);
};

const updateJob = (jobId, data) => {
    const stmt = db.prepare(`
        UPDATE jobs SET
            titel = ?, standort = ?, job_typ = ?,
            gehalt_von = ?, gehalt_bis = ?, beschreibung = ?,
            anforderungen = ?, benefits = ?, status = ?
        WHERE id = ?
    `);
    
    return stmt.run(
        data.titel, data.standort, data.jobTyp,
        data.gehaltVon, data.gehaltBis, data.beschreibung,
        data.anforderungen, data.benefits, data.status,
        jobId
    );
};

const deleteJob = (jobId) => {
    const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
    return stmt.run(jobId);
};

// === BEWERBUNG OPERATIONS ===

const createBewerbung = (jobId, bewerberId, anschreiben) => {
    const stmt = db.prepare(`
        INSERT INTO bewerbungen (job_id, bewerber_id, anschreiben)
        VALUES (?, ?, ?)
    `);
    
    try {
        const result = stmt.run(jobId, bewerberId, anschreiben);
        return result.lastInsertRowid;
    } catch (error) {
        throw new Error('Fehler beim Erstellen der Bewerbung');
    }
};

const getBewerbungenByBewerber = (bewerberId) => {
    const stmt = db.prepare(`
        SELECT b.*, j.titel, j.firma, j.standort
        FROM bewerbungen b
        JOIN jobs j ON b.job_id = j.id
        WHERE b.bewerber_id = ?
        ORDER BY b.erstellt_am DESC
    `);
    return stmt.all(bewerberId);
};

const getBewerbungenByJob = (jobId) => {
    const stmt = db.prepare(`
        SELECT b.*, u.vorname, u.nachname, u.email, u.telefon, u.lebenslauf
        FROM bewerbungen b
        JOIN users u ON b.bewerber_id = u.id
        WHERE b.job_id = ?
        ORDER BY b.erstellt_am DESC
    `);
    return stmt.all(jobId);
};

const updateBewerbungStatus = (bewerbungId, status) => {
    const stmt = db.prepare('UPDATE bewerbungen SET status = ? WHERE id = ?');
    return stmt.run(status, bewerbungId);
};

// === FAVORITEN OPERATIONS ===

const addFavorit = (userId, jobId) => {
    const stmt = db.prepare('INSERT INTO favoriten (user_id, job_id) VALUES (?, ?)');
    try {
        const result = stmt.run(userId, jobId);
        return result.lastInsertRowid;
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            throw new Error('Job bereits als Favorit gespeichert');
        }
        throw error;
    }
};

const removeFavorit = (userId, jobId) => {
    const stmt = db.prepare('DELETE FROM favoriten WHERE user_id = ? AND job_id = ?');
    return stmt.run(userId, jobId);
};

const getFavoriten = (userId) => {
    const stmt = db.prepare(`
        SELECT j.*, f.erstellt_am as favorit_seit
        FROM favoriten f
        JOIN jobs j ON f.job_id = j.id
        WHERE f.user_id = ?
        ORDER BY f.erstellt_am DESC
    `);
    return stmt.all(userId);
};

const isFavorit = (userId, jobId) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM favoriten WHERE user_id = ? AND job_id = ?');
    const result = stmt.get(userId, jobId);
    return result.count > 0;
};

// === STATISTIKEN ===

const getStatistiken = () => {
    const stats = {};
    
    stats.totalJobs = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE status = "aktiv"').get().count;
    stats.totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    stats.totalBewerbungen = db.prepare('SELECT COUNT(*) as count FROM bewerbungen').get().count;
    stats.totalArbeitgeber = db.prepare('SELECT COUNT(*) as count FROM users WHERE user_typ = "arbeitgeber"').get().count;
    
    return stats;
};

module.exports = {
    db,
    initDatabase,
    // Users
    createUser,
    findUserByEmail,
    findUserById,
    updateUserProfile,
    // Jobs
    createJob,
    getAllJobs,
    getJobById,
    getJobsByArbeitgeber,
    updateJob,
    deleteJob,
    // Bewerbungen
    createBewerbung,
    getBewerbungenByBewerber,
    getBewerbungenByJob,
    updateBewerbungStatus,
    // Favoriten
    addFavorit,
    removeFavorit,
    getFavoriten,
    isFavorit,
    // Stats
    getStatistiken
};
