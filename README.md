# JobConnect - Moderne Jobvermittlungsplattform

JobConnect ist eine moderne Webplattform zur Jobvermittlung mit Login, Registrierung und SQLite-Datenbank.

## Features

- Registrierung und Login (Bewerber/Arbeitgeber)
- Session-basierte Authentifizierung
- Jobs erstellen, anzeigen, filtern und suchen
- Bewerbungen senden
- Favoriten speichern
- Arbeitgeber-Dashboard (Jobs verwalten)
- Bewerber-Dashboard (Bewerbungen/Favoriten)
- SQLite Datenbank mit strukturiertem Schema

## Tech Stack

- Node.js + Express
- better-sqlite3 (SQLite)
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
- GET /api/jobs
- GET /api/jobs/:id
- POST /api/jobs (Arbeitgeber)
- POST /api/bewerbungen (Bewerber)
- GET /api/my-bewerbungen
- POST /api/favoriten
- GET /api/favoriten

## Hinweis

Die Datenbank-Datei wird automatisch beim ersten Start erstellt.
