const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

// Datenbank importieren
const {
    initDatabase,
    createUser,
    findUserByEmail,
    findUserById,
    updateBalance,
    addTransaction,
    getUserTransactions
} = require('./database');

const app = express();
const PORT = 3000;

// Datenbank initialisieren
initDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session Configuration
app.use(session({
    secret: 'finanzplus-banking-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 Stunden
        httpOnly: true
    }
}));

// Middleware: Prüfe ob eingeloggt
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Nicht autorisiert. Bitte einloggen.' });
    }
};

// API Routes

// Registrierung
app.post('/api/register', async (req, res) => {
    try {
        const { vorname, nachname, email, passwort } = req.body;

        // Validierung
        if (!vorname || !nachname || !email || !passwort) {
            return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
        }

        if (passwort.length < 6) {
            return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }

        // Email-Format validieren
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        // Prüfe ob Email bereits existiert
        if (findUserByEmail(email)) {
            return res.status(400).json({ error: 'E-Mail bereits registriert' });
        }

        // Hash Passwort
        const hashedPassword = await bcrypt.hash(passwort, 10);

        // Generiere Kontonummer
        const kontonummer = 'DE' + Math.random().toString().slice(2, 20);

        // Erstelle neuen Benutzer in der Datenbank
        const userId = createUser(vorname, nachname, email, hashedPassword, kontonummer);

        // Automatisch einloggen nach Registrierung
        req.session.userId = userId;

        // Hole erstellten User
        const newUser = findUserById(userId);

        res.json({ 
            success: true, 
            message: 'Registrierung erfolgreich!',
            user: {
                id: newUser.id,
                vorname: newUser.vorname,
                nachname: newUser.nachname,
                email: newUser.email
            }
        });

    } catch (error) {
        console.error('Registrierungsfehler:', error);
        res.status(500).json({ error: 'Serverfehler bei der Registrierung' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, passwort } = req.body;

        // Validierung
        if (!email || !passwort) {
            return res.status(400).json({ error: 'Email und Passwort erforderlich' });
        }

        // Finde Benutzer
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        // Prüfe Passwort
        const isValidPassword = await bcrypt.compare(passwort, user.passwort);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        // Erstelle Session
        req.session.userId = user.id;

        res.json({ 
            success: true, 
            message: 'Login erfolgreich!',
            user: {
                id: user.id,
                vorname: user.vorname,
                nachname: user.nachname,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Login-Fehler:', error);
        res.status(500).json({ error: 'Serverfehler beim Login' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Logout' });
        }
        res.json({ success: true, message: 'Erfolgreich ausgeloggt' });
    });
});

// Aktuellen Benutzer abrufen
app.get('/api/user', requireAuth, (req, res) => {
    const user = findUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    res.json({
        id: user.id,
        vorname: user.vorname,
        nachname: user.nachname,
        email: user.email,
        kontostand: user.kontostand,
        kontonummer: user.kontonummer,
        erstelltAm: user.erstelltAm
    });
});

// Kontostand aktualisieren (Demo-Funktion)
app.post('/api/update-balance', requireAuth, (req, res) => {
    const { amount } = req.body;
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === req.session.userId);
    
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    
    try {
        updateBalance(req.session.userId, parseFloat(amount) || 0);
        res.json({ success: true, kontostand: parseFloat(amount) || 0 });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren des Kontostands' });
    }
});

// Transaktion hinzufügen
app.post('/api/transaction', requireAuth, (req, res) => {
    const { typ, betrag, beschreibung, kategorie } = req.body;
    
    try {
        const transactionId = addTransaction(
            req.session.userId,
            typ,
            betrag,
            beschreibung,
            kategorie
        );
        
        // Kontostand aktualisieren
        const user = findUserById(req.session.userId);
        const newBalance = parseFloat(user.kontostand) + parseFloat(betrag);
        updateBalance(req.session.userId, newBalance);
        
        res.json({ 
            success: true, 
            transactionId,
            newBalance 
        });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Erstellen der Transaktion' });
    }
});

// Transaktionen abrufen
app.get('/api/transactions', requireAuth, (req, res) => {
    try {
        const transactions = getUserTransactions(req.session.userId, 20);
        res.json({ success: true, transactions });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Transaktionen' });
    }
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     🏦  FinanzPlus Banking Server            ║
║                                               ║
║     Server läuft auf:                         ║
║     http://localhost:${PORT}                       ║
║                                               ║
║     API Endpoints:                            ║
║     POST /api/register  - Registrierung       ║
║     POST /api/login     - Login               ║
║     POST /api/logout    - Logout              ║
║     GET  /api/user      - User-Info           ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
});
