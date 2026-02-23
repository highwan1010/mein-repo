# Bastisbanking - Installations- und Start-Anleitung

## 🚀 Schnellstart

### 1. Node.js installieren (falls noch nicht vorhanden)
- Download: https://nodejs.org/
- Installiere die **LTS Version**
- Starte VS Code neu nach der Installation

### 2. Abhängigkeiten installieren
```powershell
npm install
```

Dies installiert:
- `express` - Web-Server
- `express-session` - Session-Management
- `bcryptjs` - Passwort-Verschlüsselung
- `better-sqlite3` - SQLite Datenbank

### 3. Server starten
```powershell
npm start
```

### 4. Im Browser öffnen
Öffne: **http://localhost:3000**

## 📊 Datenbank

Das System verwendet **SQLite** - eine lokale Datenbank-Datei:
- Keine separate Datenbank-Installation nötig
- Automatisch initialisiert beim ersten Start
- Datei: `banking.db` (wird automatisch erstellt)

### Datenbank-Schema

**Tabelle: users**
- id (PRIMARY KEY)
- vorname
- nachname
- email (UNIQUE)
- passwort (gehasht mit bcrypt)
- kontostand
- kontonummer (IBAN)
- erstellt_am

**Tabelle: transaktionen**
- id (PRIMARY KEY)
- user_id (FOREIGN KEY)
- typ (Einnahme/Ausgabe)
- betrag
- beschreibung
- kategorie
- erstellt_am

## ✅ System-Test

1. **Registrierung testen:**
   - Gehe zu http://localhost:3000
   - Klicke auf "Konto eröffnen"
   - Fülle das Formular aus
   - Account wird erstellt ✓

2. **Login testen:**
   - Melde dich ab
   - Gehe zu Login
   - Melde dich mit deinen Daten an
   - Dashboard sollte erscheinen ✓

3. **Dashboard checken:**
   - Kontostand sichtbar ✓
   - IBAN angezeigt ✓
   - Benutzerinfo korrekt ✓

## 🔧 Troubleshooting

### "npm" nicht gefunden
- Node.js ist nicht installiert oder nicht im PATH
- Lösung: Node.js von nodejs.org installieren

### Port 3000 bereits in Verwendung
```powershell
# Ändere Port in server.js (Zeile 15):
const PORT = 5000;  // Oder einen anderen freien Port
```

### Datenbank-Fehler
```powershell
# Datenbank zurücksetzen (löscht alle Daten!):
# 1. Server stoppen (Ctrl+C)
# 2. Datei löschen:
Remove-Item banking.db
# 3. Server neu starten:
npm start
```

## 🛡️ Sicherheitshinweise

✅ **Was bereits implementiert ist:**
- Passwörter werden mit BCrypt gehasht
- Sessions sind HTTP-Only
- SQL-Injection geschützt (Prepared Statements)
- Input-Validierung

⚠️ **Für Produktions-Einsatz zusätzlich nötig:**
- HTTPS verwenden
- Stärkerer Session-Secret
- Rate-Limiting für Login-Versuche
- E-Mail-Verifizierung
- 2-Faktor-Authentifizierung

## 📁 Projekt-Struktur

```
├── server.js           # Express Backend
├── database.js         # Datenbank-Logik (SQLite)
├── index.html          # Landing Page
├── login.html          # Login-Seite
├── register.html       # Registrierung
├── dashboard.html      # User Dashboard
├── styles.css          # Styling
├── script.js           # Frontend JS
├── package.json        # Dependencies
└── banking.db          # SQLite Datenbank (automatisch erstellt)
```

## 🎯 API Endpoints

```
POST /api/register           - Neuen Benutzer registrieren
POST /api/login              - Benutzer einloggen
POST /api/logout             - Benutzer ausloggen
GET  /api/user               - Aktuelle Benutzer-Daten
GET  /api/check-session      - Session-Status prüfen
POST /api/update-balance     - Kontostand aktualisieren
POST /api/transaction        - Neue Transaktion erstellen
GET  /api/transactions       - Transaktionen abrufen
```

## 💡 Nächste Schritte

- [ ] Überweisungs-Funktion implementieren
- [ ] Transaktions-Historie im Dashboard anzeigen
- [ ] Profilbild-Upload
- [ ] E-Mail-Benachrichtigungen
- [ ] PDF-Export von Kontoauszügen
- [ ] Dark Mode
