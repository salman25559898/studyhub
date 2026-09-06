const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));

app.use('/media', express.static(UPLOADS_DIR, {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (['.mp4', '.webm', '.mkv'].includes(ext)) res.set('Content-Type', 'video/mp4');
        else if (['.mp3', '.wav', '.ogg'].includes(ext)) res.set('Content-Type', 'audio/mpeg');
        else if (ext === '.pdf') res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline');
    }
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}_${uuidv4()}${ext}`);
    }
});
const upload = multer({ storage });

const dbPath = path.join(DATA_DIR, 'study_hub.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (!err) console.log('Connected to local SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, parentId TEXT, createdAt TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS media_files (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, filePath TEXT NOT NULL, type TEXT NOT NULL, folderId TEXT, size INTEGER, createdAt TEXT NOT NULL
    )`);
});

app.get('/api/folders', (req, res) => {
    const { type, parentId } = req.query;
    let query = 'SELECT * FROM folders WHERE type = ?';
    let params = [type];
    if (parentId && parentId !== 'null' && parentId !== '') {
        query += ' AND parentId = ?';
        params.push(parentId);
    } else {
        query += ' AND (parentId IS NULL OR parentId = "null" OR parentId = "")';
    }
    db.all(query, params, (err, rows) => res.json(rows || []));
});

app.post('/api/folders', (req, res) => {
    const { name, type, parentId } = req.body;
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    db.run(`INSERT INTO folders (id, name, type, parentId, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [id, name, type, parentId || null, createdAt],
        () => res.json({ id, name, type, parentId, createdAt })
    );
});

app.post('/api/media/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file selected' });
    const { type, folderId } = req.body;
    const id = uuidv4();
    const name = req.file.originalname;
    const filePath = req.file.filename;
    const size = req.file.size;
    const createdAt = new Date().toISOString();

    db.run(`INSERT INTO media_files (id, name, filePath, type, folderId, size, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, filePath, type, folderId || null, size, createdAt],
        () => res.json({ id, name, filePath: `/media/${filePath}`, type, folderId, size, createdAt })
    );
});

app.get('/api/media', (req, res) => {
    const { type, folderId } = req.query;
    let query = 'SELECT * FROM media_files WHERE type = ?';
    let params = [type];
    if (folderId && folderId !== 'null' && folderId !== '') {
        query += ' AND folderId = ?';
        params.push(folderId);
    } else {
        query += ' AND (folderId IS NULL OR folderId = "null" OR folderId = "")';
    }
    db.all(query, params, (err, rows) => {
        const results = (rows || []).map(r => ({ ...r, url: `/media/${r.filePath}` }));
        res.json(results);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Study Hub Server Running: http://localhost:${PORT}`);
});