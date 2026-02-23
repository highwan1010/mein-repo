# 📁 Datei Upload & Download System

Ein einfaches Web-basiertes Datei-Upload-System mit Python Flask.

## Features

✅ Dateien hochladen  
✅ Dateien herunterladen  
✅ Dateien löschen  
✅ Moderne, benutzerfreundliche Oberfläche  
✅ Unterstützung für verschiedene Dateitypen  

## Installation

1. **Python installieren** (falls noch nicht vorhanden):
   - Download von https://www.python.org/downloads/

2. **Abhängigkeiten installieren**:
   ```bash
   pip install -r requirements.txt
   ```

## Verwendung

1. **Server starten**:
   ```bash
   python app.py
   ```

2. **Browser öffnen**:
   - Öffne http://localhost:5000 in deinem Browser

3. **Dateien hochladen**:
   - Klicke auf "Datei auswählen"
   - Wähle eine Datei aus
   - Klicke auf "Hochladen"

4. **Dateien herunterladen**:
   - Klicke auf den "Download" Button neben der gewünschten Datei

5. **Dateien löschen**:
   - Klicke auf den "Löschen" Button neben der gewünschten Datei

## Unterstützte Dateitypen

- Dokumente: TXT, PDF, DOC, DOCX
- Bilder: PNG, JPG, JPEG, GIF
- Archive: ZIP
- Media: MP4, MP3

**Maximale Dateigröße:** 16 MB

## Struktur

```
Coding/
├── app.py              # Flask-Server
├── templates/
│   └── index.html      # Web-Interface
├── uploads/            # Hochgeladene Dateien (wird automatisch erstellt)
├── requirements.txt    # Python-Abhängigkeiten
└── README.md          # Diese Datei
```

## Sicherheitshinweise

⚠️ **Wichtig für Produktion:**
- Ändere den `secret_key` in app.py
- Implementiere Benutzer-Authentifizierung
- Verwende HTTPS
- Setze weitere Sicherheitsmaßnahmen ein

## Netzwerkzugriff

Der Server läuft standardmäßig auf `0.0.0.0:5000`, sodass andere Geräte im lokalen Netzwerk darauf zugreifen können:

- Finde deine IP-Adresse: `ipconfig` (Windows) oder `ifconfig` (Mac/Linux)
- Andere können dann auf http://DEINE-IP:5000 zugreifen

Um nur lokalen Zugriff zu erlauben, ändere in app.py:
```python
app.run(debug=True, host='127.0.0.1', port=5000)
```

## Troubleshooting

**Port bereits in Verwendung?**
```bash
# Ändere Port in app.py auf z.B. 5001
app.run(debug=True, host='0.0.0.0', port=5001)
```

**Modul nicht gefunden?**
```bash
pip install -r requirements.txt
```

## Lizenz

Frei verwendbar für persönliche und kommerzielle Projekte.
