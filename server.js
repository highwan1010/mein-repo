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
} = require('./database');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
    app.set('trust proxy', 1);
}

// Datenbank initialisieren
const dbInitPromise = initDatabase().catch((error) => {
    console.error('Datenbank-Initialisierung fehlgeschlagen:', error);
    if (require.main === module) {
        process.exit(1);
    }
    throw error;
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'job-portal-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction
    }
}));

app.use(async (req, res, next) => {
    try {
        await dbInitPromise;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Datenbank nicht initialisiert' });
    }
});

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Nicht autorisiert' });
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Nicht autorisiert' });
        }

        const user = await findUserById(req.session.userId);
        if (!user || user.user_typ !== 'admin') {
            return res.status(403).json({ error: 'Admin-Berechtigung erforderlich' });
        }

        req.currentAdmin = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Fehler bei der Admin-Authentifizierung' });
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

        if (await findUserByEmail(email)) {
            return res.status(400).json({ error: 'E-Mail bereits registriert' });
        }

        const hashedPassword = await bcrypt.hash(passwort, 10);
        const userId = await createUser(vorname, nachname, email, hashedPassword, userTyp, firma);

        req.session.userId = userId;
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

        const user = await findUserByEmail(email);
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
    res.json({ 
        isAuthenticated: !!req.session.userId,
        userId: req.session.userId || null
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

// Job erstellen (nur Arbeitgeber)
app.post('/api/jobs', requireAuth, async (req, res) => {
    try {
        const user = await findUserById(req.session.userId);

        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        
        if (user.user_typ !== 'arbeitgeber') {
            return res.status(403).json({ error: 'Nur Arbeitgeber können Jobs erstellen' });
        }

        const { titel, firma, standort, beschreibung } = req.body;
        if (!titel || !firma || !standort || !beschreibung) {
            return res.status(400).json({ error: 'Titel, Firma, Standort und Beschreibung sind erforderlich' });
        }

        const jobId = await createJob(req.session.userId, req.body);
        const job = await getJobById(jobId);

        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Erstellen des Jobs' });
    }
});

// Jobs des aktuellen Arbeitgebers
app.get('/api/my-jobs', requireAuth, async (req, res) => {
    try {
        const jobs = await getJobsByArbeitgeber(req.session.userId);
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

app.get('/api/admin/jobs', requireAdmin, async (req, res) => {
    try {
        const jobs = await getAllJobsAdmin();
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: 'Fehler beim Laden der Jobs' });
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

if (require.main === module) {
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
}

module.exports = app;
