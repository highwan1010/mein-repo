const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const {
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
    updateBewerbungStatus,
    addFavorit,
    removeFavorit,
    getFavoriten,
    isFavorit,
    getStatistiken
} = require('./database');

const app = express();
const PORT = 3000;

// Datenbank initialisieren
initDatabase();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session
app.use(session({
    secret: 'job-portal-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Nicht autorisiert' });
    }
};

// ===== AUTH ROUTES =====

// Registrierung
app.post('/api/register', async (req, res) => {
    try {
        const { vorname, nachname, email, passwort, userTyp, firma } = req.body;

        if (!vorname || !nachname || !email || !passwort) {
            return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
        }

        if (passwort.length < 6) {
            return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
        }

        if (findUserByEmail(email)) {
            return res.status(400).json({ error: 'E-Mail bereits registriert' });
        }

        const hashedPassword = await bcrypt.hash(passwort, 10);
        const userId = createUser(vorname, nachname, email, hashedPassword, userTyp, firma);

        req.session.userId = userId;
        const newUser = findUserById(userId);

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

    } catch (error) {
        console.error('Registrierungsfehler:', error);
        res.status(500).json({ error: error.message || 'Serverfehler' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, passwort } = req.body;

        if (!email || !passwort) {
            return res.status(400).json({ error: 'Email und Passwort erforderlich' });
        }

        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        const isValidPassword = await bcrypt.compare(passwort, user.passwort);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Ungültige Email oder Passwort' });
        }

        req.session.userId = user.id;

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

// User Info
app.get('/api/user', requireAuth, (req, res) => {
    const user = findUserById(req.session.userId);
    if (!user) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const { passwort, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
});

// Session Check
app.get('/api/check-session', (req, res) => {
    res.json({ 
        isAuthenticated: !!req.session.userId,
        userId: req.session.userId || null
    });
});

// ===== JOB ROUTES =====

// Alle Jobs abrufen
app.get('/api/jobs', (req, res) => {
    try {
        const filters = {
            standort: req.query.standort,
            kategorie: req.query.kategorie,
            jobTyp: req.query.jobTyp,
            search: req.query.search
        };

        const jobs = getAllJobs(filters);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Jobs' });
    }
});

// Einzelnen Job abrufen
app.get('/api/jobs/:id', (req, res) => {
    try {
        const job = getJobById(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job nicht gefunden' });
        }
        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen des Jobs' });
    }
});

// Job erstellen (nur Arbeitgeber)
app.post('/api/jobs', requireAuth, (req, res) => {
    try {
        const user = findUserById(req.session.userId);
        
        if (user.user_typ !== 'arbeitgeber') {
            return res.status(403).json({ error: 'Nur Arbeitgeber können Jobs erstellen' });
        }

        const jobId = createJob(req.session.userId, req.body);
        const job = getJobById(jobId);

        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Erstellen des Jobs' });
    }
});

// Jobs des aktuellen Arbeitgebers
app.get('/api/my-jobs', requireAuth, (req, res) => {
    try {
        const jobs = getJobsByArbeitgeber(req.session.userId);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Jobs' });
    }
});

// Job aktualisieren
app.put('/api/jobs/:id', requireAuth, (req, res) => {
    try {
        const job = getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        updateJob(req.params.id, req.body);
        const updatedJob = getJobById(req.params.id);

        res.json({ success: true, job: updatedJob });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

// Job löschen
app.delete('/api/jobs/:id', requireAuth, (req, res) => {
    try {
        const job = getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        deleteJob(req.params.id);
        res.json({ success: true, message: 'Job gelöscht' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Löschen' });
    }
});

// ===== BEWERBUNGS ROUTES =====

// Bewerbung einreichen
app.post('/api/bewerbungen', requireAuth, (req, res) => {
    try {
        const { jobId, anschreiben } = req.body;

        if (!jobId || !anschreiben) {
            return res.status(400).json({ error: 'Job-ID und Anschreiben erforderlich' });
        }

        const bewerbungId = createBewerbung(jobId, req.session.userId, anschreiben);

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
app.get('/api/my-bewerbungen', requireAuth, (req, res) => {
    try {
        const bewerbungen = getBewerbungenByBewerber(req.session.userId);
        res.json({ success: true, bewerbungen });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen der Bewerbungen' });
    }
});

// Bewerbungen für einen Job (nur Arbeitgeber)
app.get('/api/jobs/:id/bewerbungen', requireAuth, (req, res) => {
    try {
        const job = getJobById(req.params.id);
        
        if (!job || job.arbeitgeber_id !== req.session.userId) {
            return res.status(403).json({ error: 'Keine Berechtigung' });
        }

        const bewerbungen = getBewerbungenByJob(req.params.id);
        res.json({ success: true, bewerbungen });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// Bewerbungsstatus aktualisieren
app.put('/api/bewerbungen/:id/status', requireAuth, (req, res) => {
    try {
        const { status } = req.body;
        updateBewerbungStatus(req.params.id, status);
        res.json({ success: true, message: 'Status aktualisiert' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Aktualisieren' });
    }
});

// ===== FAVORITEN ROUTES =====

// Favorit hinzufügen
app.post('/api/favoriten', requireAuth, (req, res) => {
    try {
        const { jobId } = req.body;
        addFavorit(req.session.userId, jobId);
        res.json({ success: true, message: 'Als Favorit gespeichert' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Favorit entfernen
app.delete('/api/favoriten/:jobId', requireAuth, (req, res) => {
    try {
        removeFavorit(req.session.userId, req.params.jobId);
        res.json({ success: true, message: 'Favorit entfernt' });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Entfernen' });
    }
});

// Favoriten abrufen
app.get('/api/favoriten', requireAuth, (req, res) => {
    try {
        const favoriten = getFavoriten(req.session.userId);
        res.json({ success: true, favoriten });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// ===== STATISTIKEN =====

app.get('/api/stats', (req, res) => {
    try {
        const stats = getStatistiken();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Abrufen' });
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     💼  Job-Portal Server                    ║
║                                               ║
║     Server läuft auf:                         ║
║     http://localhost:${PORT}                       ║
║                                               ║
║     Professionelle Job-Vermittlung            ║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
});
