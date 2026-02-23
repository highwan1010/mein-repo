const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

// Benutzerdatenbank (JSON-Datei)
const USERS_FILE = path.join(__dirname, 'users.json');

// Initialisiere users.json falls nicht vorhanden
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

// Hilfsfunktionen für Benutzerverwaltung
const getUsers = () => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const findUserByEmail = (email) => {
    const users = getUsers();
    return users.find(user => user.email.toLowerCase() === email.toLowerCase());
};

const findUserById = (id) => {
    const users = getUsers();
    return users.find(user => user.id === id);
};

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

        // Erstelle neuen Benutzer
        const users = getUsers();
        const newUser = {
            id: Date.now().toString(),
            vorname,
            nachname,
            email: email.toLowerCase(),
            passwort: hashedPassword,
            kontostand: 0,
            erstelltAm: new Date().toISOString(),
            kontonummer: 'DE' + Math.random().toString().slice(2, 20)
        };

        users.push(newUser);
        saveUsers(users);

        // Automatisch einloggen nach Registrierung
        req.session.userId = newUser.id;

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

    users[userIndex].kontostand = parseFloat(amount) || 0;
    saveUsers(users);

    res.json({ success: true, kontostand: users[userIndex].kontostand });
});

// Session-Check
app.get('/api/check-session', (req, res) => {
    res.json({ 
        isAuthenticated: !!req.session.userId,
        userId: req.session.userId || null
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
