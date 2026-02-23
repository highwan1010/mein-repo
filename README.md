# 🏦 FinanzPlus - Moderne Banking Website

Eine moderne, responsive Banking-Landingpage mit elegantem Design und interaktiven Features.

## ✨ Features

- **Responsive Design** - Optimiert für alle Bildschirmgrößen
- **Moderne UI/UX** - Gradient-Designs, Animationen und Hover-Effekte
- **Interaktive Elemente** - Smooth Scrolling, Animationen beim Scrollen
- **Banking-Features**:
  - Produktübersicht (Girokonto, Premium, Business)
  - Feature-Highlights
  - App-Mockup mit Live-Interface
  - Kontaktformular
  - Statistiken mit Counter-Animation

## 🚀 Verwendung

Einfach die `index.html` in einem Browser öffnen:

```bash
# Mit Python
python -m http.server 8000

# Mit Node.js (wenn http-server installiert ist)
npx http-server

# Oder einfach Doppelklick auf index.html
```

Dann öffne: `http://localhost:8000`

## 📁 Struktur

```
├── index.html      # Hauptseite
├── styles.css      # Styling
├── script.js       # Interaktivität
└── README.md       # Diese Datei
```

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
