# JobVermittlung - Moderne Jobvermittlungsplattform

JobVermittlung ist eine moderne Webplattform zur Jobvermittlung mit Login, Registrierung und PostgreSQL-Backend für Produktion.

## Features

- Registrierung und Login (Bewerber/Arbeitgeber)
- Session-basierte Authentifizierung
- Jobs erstellen, anzeigen, filtern und suchen
- Bewerbungen senden
- Favoriten speichern
- Arbeitgeber-Dashboard (Jobs verwalten)
- Bewerber-Dashboard (Bewerbungen/Favoriten)
- PostgreSQL in Produktion, Datei-Fallback nur lokal in Entwicklung

## Tech Stack

- Node.js + Express
- PostgreSQL (`pg`) + lokaler Datei-Fallback für Dev
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
- GET /api/admin/overview (Admin)
- GET /api/admin/users (Admin)
- GET /api/admin/jobs (Admin)
- GET /api/admin/bewerbungen (Admin)
- GET /api/admin/favoriten (Admin)

Bewerbungsstatus-Werte:

- eingereicht
- in_pruefung
- eingeladen
- abgelehnt
- angenommen

Admin-Zugang:

- Benutzer mit `user_typ = admin` erhalten Zugriff auf `admin.html` und die Admin-API.

## Hinweis

Die Datenbank-Datei wird automatisch beim ersten Start erstellt.

## Vercel

- Vercel Postgres im Projekt unter **Storage → Postgres** erstellen.
- API läuft serverless über `api/index.js` (Express-App aus `server.js`).
- `vercel.json` routet `/api/*` auf die Serverless-Funktion.

Erforderliche ENV-Variablen für Online-Betrieb:

- `POSTGRES_URL` (kommt automatisch von Vercel Postgres)
- `SESSION_SECRET` (starkes, zufälliges Secret)
- `NODE_ENV=production`
- `ADMIN_EMAIL` (z. B. `admin@admin.admin`)
- `ADMIN_PASSWORD` (z. B. `123456`)

Optionale ENV-Variablen für Telegram-Benachrichtigungen bei neuer Terminbuchung:

- `TELEGRAM_BOT_TOKEN` (Bot-Token von BotFather)
- `TELEGRAM_CHAT_ID` (Chat-ID des Empfänger-Chats oder der Gruppe)

Wichtig:

- In `production` startet die App absichtlich **nicht**, wenn keine `DATABASE_URL`/`POSTGRES_URL` gesetzt ist.
- In `production` startet die App absichtlich **nicht**, wenn `SESSION_SECRET` fehlt.
- Damit ist eine externe Online-Datenbank verbindlich erzwungen.
- Wenn `ADMIN_EMAIL` + `ADMIN_PASSWORD` gesetzt sind, wird der Admin-User beim Start automatisch erstellt/aktualisiert.

Sicherheitsmaßnahmen:

- Security-Header via `helmet`
- Rate-Limit auf `POST /api/login`
- Request-Body-Limit (`100kb`) für JSON/Form-Daten
- Blockierte Auslieferung sensibler Serverdateien (`server.js`, `database.js`, `package*.json`, `jobportal.json`, ...)

Hinweis zum Frontend:

- Die Seiten nutzen online automatisch die aktuelle Domain (`window.location.origin`) für API-Calls.
- Es gibt keinen lokalen `localhost`-Fallback mehr im Frontend.

## Vercel Deploy (kurz)

1. Repo zu Vercel importieren.
2. Vercel Postgres hinzufügen (Storage).
3. ENV setzen: `SESSION_SECRET`, `NODE_ENV=production`.
4. Deploy starten.
5. App über die Vercel-Domain öffnen.

Externe API-Domain festlegen:

- In `config.js` den Wert `API_BASE_URL` setzen, z. B. `https://deine-backend-domain.com`.
- Bei leerem Wert (`''`) nutzt das Frontend automatisch die aktuelle Domain (same-origin).

## Telegram einrichten (Termin-Benachrichtigung)

1. In Telegram den Bot `@BotFather` öffnen.
2. Mit `/newbot` einen Bot erstellen und den Token kopieren.
3. Deinen Bot einmal starten (im Bot-Chat auf **Start** klicken oder `/start` senden).
4. Chat-ID ermitteln:
	- URL aufrufen: `https://api.telegram.org/bot<DEIN_BOT_TOKEN>/getUpdates`
	- In der Antwort die `chat.id` verwenden.
5. ENV setzen:
	- `TELEGRAM_BOT_TOKEN=<DEIN_BOT_TOKEN>`
	- `TELEGRAM_CHAT_ID=<DEINE_CHAT_ID>`
6. Lokal im Projekt eine Datei `.env` anlegen (oder `.env.example` kopieren) und die Werte eintragen.
7. Server neu starten.

Beispiel `.env`:

```env
TELEGRAM_BOT_TOKEN=<DEIN_BOT_TOKEN>
TELEGRAM_CHAT_ID=8557639051
```

Hinweis:

- Wenn `TELEGRAM_BOT_TOKEN` oder `TELEGRAM_CHAT_ID` fehlen, läuft die App normal ohne Telegram-Benachrichtigung weiter.
