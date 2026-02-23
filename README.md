# JobConnect - Moderne Jobvermittlungsplattform

JobConnect ist eine moderne Webplattform zur Jobvermittlung mit Login, Registrierung und JSON-Datei-Datenbank.

## Features

- Registrierung und Login (Bewerber/Arbeitgeber)
- Session-basierte Authentifizierung
- Jobs erstellen, anzeigen, filtern und suchen
- Bewerbungen senden
- Favoriten speichern
- Arbeitgeber-Dashboard (Jobs verwalten)
- Bewerber-Dashboard (Bewerbungen/Favoriten)
- Datei-Datenbank (`jobportal.json`)

## Tech Stack

- Node.js + Express
- Datei-Storage über Node.js (`fs`)
- bcryptjs (Passwort-Hashing)
- express-session
- HTML/CSS/Vanilla JavaScript

## Start

1. Node.js (LTS) installieren
2. Abhängigkeiten installieren:

```bash
npm install
```

3. Server starten:

```bash
npm start
```

4. Browser öffnen:

```text
http://localhost:3000
```

## Hauptseiten

- index.html (Startseite mit Suche und Jobliste)
- register.html (Registrierung)
- login.html (Login)
- dashboard.html (Rollenabhängiges Dashboard)
- job-details.html (Jobdetails + Bewerbung/Favorit)

## API (Auszug)

- POST /api/register
- POST /api/login
- POST /api/logout
- GET /api/user
- PUT /api/user
- GET /api/jobs
- GET /api/jobs/:id
- POST /api/jobs (Arbeitgeber)
- POST /api/bewerbungen (Bewerber)
- PUT /api/bewerbungen/:id/status (Arbeitgeber)
- GET /api/my-bewerbungen
- POST /api/favoriten
- GET /api/favoriten
- GET /api/favoriten/:jobId/status

Bewerbungsstatus-Werte:

- eingereicht
- in_pruefung
- eingeladen
- abgelehnt
- angenommen

## Hinweis

Die Datenbank-Datei wird automatisch beim ersten Start erstellt.

## Vercel

- Empfohlen für Produktion: Postgres anbinden (z. B. Vercel Postgres/Neon) und `POSTGRES_URL` oder `DATABASE_URL` als Environment Variable setzen.
- Sobald `POSTGRES_URL` oder `DATABASE_URL` vorhanden ist, nutzt die App automatisch Postgres (inkl. Auto-Tabellenanlage beim Start).
- Ohne Postgres-URL fällt die App auf Datei-Storage zurück. Auf Vercel wird dafür automatisch `os.tmpdir()` genutzt.
- Optional kann ein eigener Dateipfad per `DB_PATH` gesetzt werden.
