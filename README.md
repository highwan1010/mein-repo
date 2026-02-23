# 🏦 FinanzPlus - Moderne Banking Website mit Login-System

Eine moderne, responsive Banking-Landingpage mit vollständigem Authentifizierungs-System.

## ✨ Features

### Frontend
- **Responsive Design** - Optimiert für alle Bildschirmgrößen
- **Moderne UI/UX** - Gradient-Designs, Animationen und Hover-Effekte
- **Interaktive Elemente** - Smooth Scrolling, Animationen beim Scrollen
- **Banking-Features**:
  - Produktübersicht (Girokonto, Premium, Business)
  - Feature-Highlights
  - App-Mockup mit Live-Interface
  - Kontaktformular
  - Statistiken mit Counter-Animation

### Backend & Authentifizierung
- **Benutzer-Registrierung** - Sicheres Erstellen neuer Konten
- **Login-System** - Session-basierte Authentifizierung
- **Dashboard** - Personalisierter Bereich nach Login
- **Passwort-Hashing** - BCrypt für sichere Passwort-Speicherung
- **Session-Management** - Express-Session für sichere Sessions
- **JSON-Datenbank** - Einfache Benutzerverwaltung

## 🚀 Installation & Start

### Voraussetzungen
- Node.js (Version 14 oder höher)
- npm (kommt mit Node.js)

### 1. Repository klonen
```bash
git clone https://github.com/highwan1010/mein-repo.git
cd mein-repo
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Server starten
```bash
npm start
```

### 4. Im Browser öffnen
Öffne: `http://localhost:3000`

## 📁 Struktur

```
├── index.html          # Hauptseite (Landing Page)
├── login.html          # Login-Seite
├── register.html       # Registrierungs-Seite
├── dashboard.html      # Dashboard (nach Login)
├── styles.css          # Styling
├── script.js           # Frontend-Interaktivität
├── server.js           # Backend-Server (Express)
├── package.json        # Node.js Abhängigkeiten
├── users.json          # Benutzerdatenbank (wird automatisch erstellt)
├── .gitignore          # Git-Ignorier-Datei
└── README.md           # Diese Datei
```

## 🔐 Authentifizierungs-Features

### Registrierung
- Vor- und Nachname
- E-Mail-Validierung
- Passwort-Stärke-Anzeige
- Automatisches Login nach Registrierung
- Generierung einer IBAN

### Login
- E-Mail und Passwort
- Passwort anzeigen/verstecken Toggle
- Session-basierte Authentifizierung
- Automatische Weiterleitung zum Dashboard

### Dashboard
- Persönliche Begrüßung
- Kontostand-Anzeige
- IBAN-Anzeige
- Quick Actions
- Transaktions-Übersicht
- Logout-Funktion

## 🛡️ Sicherheit

- **BCrypt** - Passwörter werden mit bcrypt gehasht (nicht im Klartext gespeichert)
- **Sessions** - Sichere Session-Verwaltung mit express-session
- **Input-Validierung** - Validierung auf Client- und Server-Seite
- **HTTP-Only Cookies** - Schutz vor XSS-Angriffen

## 🎨 Design-Features

- **Farbschema**: Modern mit Primary (#6366f1), Secondary (#8b5cf6), Accent (#ec4899)
- **Typografie**: Inter / System Fonts
- **Icons**: Font Awesome 6.4.0
- **Animationen**: 
  - Scroll-basierte Fade-in Effekte
  - Counter-Animationen für Statistiken
  - Hover-Effekte auf Karten und Buttons
  - 3D-Tilt-Effekt auf Kreditkarte

## 📱 Responsive Breakpoints

- Desktop: > 968px
- Tablet: 640px - 968px
- Mobile: < 640px

## 🛠️ Technologien

- HTML5
- CSS3 (Grid, Flexbox, Animations)
- Vanilla JavaScript
- Font Awesome Icons

## 📦 Deployment

### GitHub Pages

1. Pushe den Code zu GitHub
2. Gehe zu Settings → Pages
3. Wähle "Deploy from branch" → main
4. Webseite ist live unter: `https://username.github.io/repo-name`

### Vercel

```bash
npm i -g vercel
vercel
```

### Netlify

Drag & Drop den Ordner auf [netlify.com/drop](https://netlify.com/drop)

## 🎯 Anpassung

**Farben ändern** in `styles.css`:
```css
:root {
    --primary: #6366f1;
    --secondary: #8b5cf6;
    --accent: #ec4899;
}
```

**Logo ändern** in `index.html`:
```html
<div class="logo">
    <i class="fas fa-landmark"></i>
    <span>DeinName</span>
</div>
```

## 📄 Lizenz

Frei verwendbar für persönliche und kommerzielle Projekte.

## 🤝 Mitwirken

Verbesserungsvorschläge sind willkommen! Feel free to fork und Pull Requests erstellen.

---

Erstellt mit ❤️ für modernes Banking
