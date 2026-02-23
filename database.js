const Database = require('better-sqlite3');
const path = require('path');

// Datenbank-Datei
const DB_PATH = path.join(__dirname, 'banking.db');

// Datenbank initialisieren
const db = new Database(DB_PATH);

// Tabellen erstellen
const initDatabase = () => {
    // Users Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vorname TEXT NOT NULL,
            nachname TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            passwort TEXT NOT NULL,
            kontostand REAL DEFAULT 0,
            kontonummer TEXT UNIQUE NOT NULL,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Transaktionen Tabelle
    db.exec(`
        CREATE TABLE IF NOT EXISTS transaktionen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            typ TEXT NOT NULL,
            betrag REAL NOT NULL,
            beschreibung TEXT,
            kategorie TEXT,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    console.log('✅ Datenbank-Tabellen initialisiert');
};

// Datenbank-Operationen

// Benutzer erstellen
const createUser = (vorname, nachname, email, passwort, kontonummer) => {
    const stmt = db.prepare(`
        INSERT INTO users (vorname, nachname, email, passwort, kontonummer)
        VALUES (?, ?, ?, ?, ?)
    `);
    
    try {
        const result = stmt.run(vorname, nachname, email.toLowerCase(), passwort, kontonummer);
        return result.lastInsertRowid;
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            throw new Error('E-Mail bereits registriert');
        }
        throw error;
    }
};

// Benutzer per Email finden
const findUserByEmail = (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email.toLowerCase());
};

// Benutzer per ID finden
const findUserById = (id) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
};

// Kontostand aktualisieren
const updateBalance = (userId, newBalance) => {
    const stmt = db.prepare('UPDATE users SET kontostand = ? WHERE id = ?');
    return stmt.run(newBalance, userId);
};

// Transaktion hinzufügen
const addTransaction = (userId, typ, betrag, beschreibung, kategorie) => {
    const stmt = db.prepare(`
        INSERT INTO transaktionen (user_id, typ, betrag, beschreibung, kategorie)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(userId, typ, betrag, beschreibung, kategorie);
    return result.lastInsertRowid;
};

// Transaktionen eines Users abrufen
const getUserTransactions = (userId, limit = 10) => {
    const stmt = db.prepare(`
        SELECT * FROM transaktionen 
        WHERE user_id = ? 
        ORDER BY erstellt_am DESC 
        LIMIT ?
    `);
    return stmt.all(userId, limit);
};

// Alle Benutzer (für Admin-Zwecke)
const getAllUsers = () => {
    const stmt = db.prepare('SELECT id, vorname, nachname, email, kontostand, erstellt_am FROM users');
    return stmt.all();
};

// Benutzer löschen
const deleteUser = (userId) => {
    // Erst Transaktionen löschen
    const deleteTransactions = db.prepare('DELETE FROM transaktionen WHERE user_id = ?');
    deleteTransactions.run(userId);
    
    // Dann Benutzer
    const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
    return deleteUserStmt.run(userId);
};

module.exports = {
    db,
    initDatabase,
    createUser,
    findUserByEmail,
    findUserById,
    updateBalance,
    addTransaction,
    getUserTransactions,
    getAllUsers,
    deleteUser
};
