const express = require('express');
const moveFile = require('./moveFile');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');

let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
    if (process.versions && process.versions.electron && ffmpegPath && ffmpegPath.includes('app.asar')) {
        ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    console.log('FFmpeg binary available at:', ffmpegPath);
} catch (e) {
    console.warn('ffmpeg-static module not available:', e.message);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Determine storage directory (for dump, sorted folders, config, cache, trash)
// Priority: SORTIRR_DATA_DIR env var > Documents/Sortirr (in Electron) > local folder (self-hosted fallback)
const isElectron = !!(process.versions && process.versions.electron);
const dataDir = process.env.SORTIRR_DATA_DIR || (isElectron 
    ? path.join(process.env.USERPROFILE || process.env.HOME || process.env.APPDATA, 'Documents', 'Sortirr')
    : null);

const storageRoot = dataDir || path.join(__dirname, 'public');
const publicDir = path.join(__dirname, 'public'); // for static HTML, CSS, JS web assets

const dumpDir = path.join(storageRoot, 'dump');
const cacheDir = dataDir ? path.join(dataDir, '.cache') : path.join(__dirname, '.cache');
const trashDir = dataDir ? path.join(dataDir, '.trash') : path.join(__dirname, '.trash');
const configPath = dataDir ? path.join(dataDir, 'config.json') : path.join(__dirname, 'config.json');

function getCategoryPath(categoryName) {
    return path.join(storageRoot, categoryName);
}

// Ensure required directories exist
[storageRoot, dumpDir, cacheDir, trashDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
});

app.use(express.static(publicDir));

// Multer storage for uploading files into public/dump/
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, dumpDir);
    },
    filename: function (req, file, cb) {
        // Preserve original file name, or resolve duplicate if needed
        let targetName = file.originalname;
        let counter = 1;
        const ext = path.extname(targetName);
        const base = path.basename(targetName, ext);
        while (fs.existsSync(path.join(dumpDir, targetName))) {
            targetName = `${base}_${counter}${ext}`;
            counter++;
        }
        cb(null, targetName);
    }
});
const upload = multer({ storage });


const defaultFolders = [
    { key: "1", name: "Family", color: "#6366f1" },
    { key: "2", name: "Kuliah", color: "#06b6d4" },
    { key: "3", name: "prau", color: "#10b981" },
    { key: "4", name: "Cant See", color: "#f59e0b" },
    { key: "5", name: "andong", color: "#ec4899" },
    { key: "6", name: "Merbabu", color: "#8b5cf6" }
];

function getFoldersConfig() {
    if (!fs.existsSync(configPath)) {
        try {
            fs.writeFileSync(configPath, JSON.stringify(defaultFolders, null, 2), 'utf8');
            return defaultFolders;
        } catch (err) {
            console.error('Error writing default config.json:', err);
            return defaultFolders;
        }
    }
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading config.json:', err);
        return defaultFolders;
    }
}

// Helper: Clean up preview cache when a file is moved or deleted
function removeFileCache(filename) {
    try {
        const cacheMp4 = path.join(cacheDir, `${filename}.mp4`);
        const cacheJpg = path.join(cacheDir, `${filename}.jpg`);
        if (fs.existsSync(cacheMp4)) fs.unlinkSync(cacheMp4);
        if (fs.existsSync(cacheJpg)) fs.unlinkSync(cacheJpg);
    } catch (e) {
        console.error(`Error cleaning cache for ${filename}:`, e.message);
    }
}

// Undo Stack for reverse operations
const actionHistory = [];
const MAX_UNDO_HISTORY = 50;

function pushUndoAction(action) {
    actionHistory.push(action);
    if (actionHistory.length > MAX_UNDO_HISTORY) {
        const oldest = actionHistory.shift();
        // If oldest was a delete, permanently purge the trash backup
        if (oldest.type === 'delete' && oldest.trashPath && fs.existsSync(oldest.trashPath)) {
            try { fs.unlinkSync(oldest.trashPath); } catch (_) {}
        }
    }
}

// Track active transcode jobs to deduplicate concurrent requests
const activeTranscodes = new Map();
const activeThumbnails = new Map();

// Helper: Generate video thumbnail with FFmpeg
function generateThumbnail(sourcePath, targetThumbPath) {
    if (!ffmpegPath) return Promise.reject(new Error('FFmpeg not available'));
    if (activeThumbnails.has(targetThumbPath)) {
        return activeThumbnails.get(targetThumbPath);
    }

    const promise = new Promise((resolve, reject) => {
        const proc = spawn(ffmpegPath, [
            '-ss', '00:00:00.500',
            '-i', sourcePath,
            '-vframes', '1',
            '-q:v', '2',
            '-vf', 'scale=-2:480',
            '-y',
            targetThumbPath
        ]);

        proc.on('close', (code) => {
            activeThumbnails.delete(targetThumbPath);
            if (code === 0 && fs.existsSync(targetThumbPath)) {
                resolve(targetThumbPath);
            } else {
                const retryProc = spawn(ffmpegPath, [
                    '-ss', '00:00:00.000',
                    '-i', sourcePath,
                    '-vframes', '1',
                    '-q:v', '2',
                    '-vf', 'scale=-2:480',
                    '-y',
                    targetThumbPath
                ]);
                retryProc.on('close', (retryCode) => {
                    if (retryCode === 0 && fs.existsSync(targetThumbPath)) {
                        resolve(targetThumbPath);
                    } else {
                        reject(new Error(`FFmpeg thumbnail failed with code ${retryCode}`));
                    }
                });
            }
        });

        proc.on('error', (err) => {
            activeThumbnails.delete(targetThumbPath);
            reject(err);
        });
    });

    activeThumbnails.set(targetThumbPath, promise);
    return promise;
}

// Helper: Transcode video to web-compatible fast H.264 MP4
function transcodeToMp4(sourcePath, targetMp4Path) {
    if (!ffmpegPath) return Promise.reject(new Error('FFmpeg not available'));
    if (activeTranscodes.has(targetMp4Path)) {
        return activeTranscodes.get(targetMp4Path);
    }

    const promise = new Promise((resolve, reject) => {
        console.log(`Starting video transcode: ${path.basename(sourcePath)} -> MP4`);
        const proc = spawn(ffmpegPath, [
            '-i', sourcePath,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '24',
            '-vf', 'scale=-2:720',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            targetMp4Path
        ]);

        proc.on('close', (code) => {
            activeTranscodes.delete(targetMp4Path);
            if (code === 0 && fs.existsSync(targetMp4Path)) {
                console.log(`Finished transcode: ${path.basename(targetMp4Path)}`);
                resolve(targetMp4Path);
            } else {
                console.error(`Transcode failed for ${path.basename(sourcePath)}, exit code ${code}`);
                if (fs.existsSync(targetMp4Path)) {
                    try { fs.unlinkSync(targetMp4Path); } catch (_) {}
                }
                reject(new Error(`FFmpeg transcode failed with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            activeTranscodes.delete(targetMp4Path);
            console.error(`FFmpeg spawn error for ${path.basename(sourcePath)}:`, err.message);
            reject(err);
        });
    });

    activeTranscodes.set(targetMp4Path, promise);
    return promise;
}

// Background queue to pre-generate thumbnails for smoother browsing
let isPreCaching = false;
async function preCacheThumbnails(files) {
    if (isPreCaching || !ffmpegPath) return;
    isPreCaching = true;
    const videoExtensions = ['.mov', '.mp4', '.mkv', '.avi', '.webm', '.m4v', '.3gp', '.flv', '.wmv', '.ts'];
    
    try {
        for (const item of files) {
            const file = typeof item === 'object' ? item.name : item;
            const ext = path.extname(file).toLowerCase();
            if (videoExtensions.includes(ext)) {
                const thumbPath = path.join(cacheDir, `${file}.jpg`);
                const sourcePath = path.join(dumpDir, file);
                if (!fs.existsSync(thumbPath) && fs.existsSync(sourcePath)) {
                    try {
                        await generateThumbnail(sourcePath, thumbPath);
                    } catch (e) {
                        // ignore pre-cache errors
                    }
                }
            }
        }
    } finally {
        isPreCaching = false;
    }
}

// GET /api/folders with live counts
app.get('/api/folders', (req, res) => {
    const folders = getFoldersConfig();
    const result = folders.map(f => {
        let count = 0;
        const targetDir = getCategoryPath(f.name);
        if (fs.existsSync(targetDir)) {
            try {
                count = fs.readdirSync(targetDir).filter(x => !x.startsWith('.')).length;
            } catch (_) {}
        }
        return {
            key: f.key,
            name: f.name,
            color: f.color || '#6366f1',
            count: count
        };
    });
    res.json(result);
});

// POST /api/folders - Save folder config
app.post('/api/folders', (req, res) => {
    const folders = req.body;
    if (!Array.isArray(folders)) {
        return res.status(400).json({ message: 'Invalid folder configuration data' });
    }
    try {
        fs.writeFileSync(configPath, JSON.stringify(folders, null, 2), 'utf8');
        folders.forEach(item => {
            if (item.name) {
                const folderDir = getCategoryPath(item.name);
                if (!fs.existsSync(folderDir)) {
                    fs.mkdirSync(folderDir, { recursive: true });
                }
            }
        });
        res.json({ message: 'Folders configuration updated successfully', folders });
    } catch (err) {
        console.error('Error writing config.json:', err);
        res.status(500).json({ message: 'Failed to update folder configuration' });
    }
});

// POST /api/upload - Upload files to dump directory
app.post('/api/upload', upload.array('files', 100), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }
    const uploadedNames = req.files.map(f => f.filename);
    res.json({
        message: `Successfully uploaded ${req.files.length} file(s)`,
        files: uploadedNames
    });
});

// POST /api/undo - Undo last move or delete action
app.post('/api/undo', async (req, res) => {
    if (actionHistory.length === 0) {
        return res.status(400).json({ message: 'Tidak ada riwayat tindakan untuk di-undo' });
    }

    const lastAction = actionHistory.pop();
    try {
        if (lastAction.type === 'move') {
            const movedPath = path.join(getCategoryPath(lastAction.toFolder), lastAction.finalName);
            const restorePath = path.join(dumpDir, lastAction.originalName);

            if (!fs.existsSync(movedPath)) {
                return res.status(404).json({ message: `File "${lastAction.finalName}" tidak ditemukan di folder "${lastAction.toFolder}"` });
            }

            // Restore back to dump
            fs.renameSync(movedPath, restorePath);
            removeFileCache(lastAction.originalName);
            removeFileCache(lastAction.finalName);

            return res.json({
                message: `Berhasil mengembalikan "${lastAction.originalName}" dari folder "${lastAction.toFolder}"`,
                restoredFile: lastAction.originalName,
                action: lastAction
            });
        } else if (lastAction.type === 'delete') {
            const trashPath = lastAction.trashPath;
            const restorePath = path.join(dumpDir, lastAction.originalName);

            if (!fs.existsSync(trashPath)) {
                return res.status(404).json({ message: `File yang dihapus "${lastAction.originalName}" tidak ditemukan di tempat sampah` });
            }

            fs.renameSync(trashPath, restorePath);
            return res.json({
                message: `Berhasil memulihkan file "${lastAction.originalName}" yang sempat dihapus`,
                restoredFile: lastAction.originalName,
                action: lastAction
            });
        }
    } catch (err) {
        console.error('Error executing undo:', err);
        res.status(500).json({ message: `Gagal melakukan Undo: ${err.message}` });
    }
});

// POST /delete-file (Safely moved to .trash for undo support)
app.post('/delete-file', async (req, res) => {
    const { fileName } = req.body;
    if (!fileName) {
        return res.status(400).json({ message: 'Filename required' });
    }
    const filePath = path.join(dumpDir, fileName);

    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: `File "${fileName}" not found` });
        }

        const trashFileName = `${Date.now()}_${fileName}`;
        const targetTrashPath = path.join(trashDir, trashFileName);

        // Move to .trash instead of hard unlinking
        fs.renameSync(filePath, targetTrashPath);
        removeFileCache(fileName);

        // Push to undo stack
        pushUndoAction({
            type: 'delete',
            originalName: fileName,
            trashPath: targetTrashPath,
            timestamp: Date.now()
        });

        res.json({ message: 'File deleted successfully (Undoable)' });
    } catch (err) {
        console.error(`Error deleting file: ${fileName}`, err);
        return res.status(500).json({ message: 'Error deleting file: ' + err.message });
    }
});

// POST /move-file
app.post('/move-file', async (req, res) => {
    const { fileName, folder } = req.body;
    try {
        const result = await moveFile(fileName, folder, storageRoot);
        removeFileCache(fileName);

        // Record in undo stack
        pushUndoAction({
            type: 'move',
            originalName: result.originalName,
            finalName: result.finalName,
            toFolder: folder,
            timestamp: Date.now()
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/open-folder - Reveal folder in OS File Explorer (Windows/macOS/Linux)
app.post('/api/open-folder', (req, res) => {
    const { folder } = req.body;
    let targetPath = storageRoot;

    if (folder === 'dump') {
        targetPath = dumpDir;
    } else if (folder) {
        targetPath = getCategoryPath(folder);
    }

    if (!fs.existsSync(targetPath)) {
        try {
            fs.mkdirSync(targetPath, { recursive: true });
        } catch (e) {
            return res.status(400).json({ message: 'Directory does not exist' });
        }
    }

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    try {
        if (isWindows) {
            spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
        } else if (isMac) {
            spawn('open', [targetPath], { detached: true, stdio: 'ignore' });
        } else {
            spawn('xdg-open', [targetPath], { detached: true, stdio: 'ignore' });
        }
        res.json({ message: `Opened ${folder || 'root'} folder in file explorer` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to open file explorer: ' + err.message });
    }
});

// Direct file serving (for downloads or native previews)
app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(dumpDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send(`File ${filename} not found`);
    }
});

// Instant video thumbnail endpoint
app.get('/api/video-thumbnail/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(dumpDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    const thumbPath = path.join(cacheDir, `${filename}.jpg`);
    if (fs.existsSync(thumbPath)) {
        return res.sendFile(thumbPath);
    }

    if (!ffmpegPath) {
        return res.status(501).send('FFmpeg not available');
    }

    try {
        await generateThumbnail(filePath, thumbPath);
        res.sendFile(thumbPath);
    } catch (err) {
        console.error(`Error generating thumbnail for ${filename}:`, err.message);
        res.status(500).send(`Thumbnail error: ${err.message}`);
    }
});

// Fast web-compatible video preview endpoint (transcodes MOV/HEVC/MKV to H.264 MP4 with seeking)
app.get('/api/video-preview/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(dumpDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    const ext = path.extname(filename).toLowerCase();
    const needsTranscode = ['.mov', '.mkv', '.avi', '.m4v', '.3gp', '.flv', '.wmv', '.ts'].includes(ext);

    // If native web format (.mp4, .webm) and no transcode explicitly needed, serve directly with range support
    if (!needsTranscode && ['.mp4', '.webm'].includes(ext)) {
        return res.sendFile(filePath);
    }

    // Check if transcode cache already exists
    const previewPath = path.join(cacheDir, `${filename}.mp4`);
    if (fs.existsSync(previewPath)) {
        return res.sendFile(previewPath);
    }

    if (!ffmpegPath) {
        return res.sendFile(filePath);
    }

    try {
        await transcodeToMp4(filePath, previewPath);
        res.sendFile(previewPath);
    } catch (err) {
        console.error(`Error transcoding video ${filename}:`, err.message);
        res.sendFile(filePath);
    }
});

// List files in dump directory with rich metadata
app.get('/new-list-dump-files', (req, res) => {
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
        return res.json([]);
    }
    
    try {
        const rawFiles = fs.readdirSync(dumpDir);
        const fileObjects = [];

        for (const file of rawFiles) {
            if (file.startsWith('.')) continue;
            try {
                const filePath = path.join(dumpDir, file);
                const stat = fs.statSync(filePath);
                if (stat.isFile()) {
                    fileObjects.push({
                        name: file,
                        size: stat.size,
                        mtime: stat.mtimeMs,
                        ext: path.extname(file).replace('.', '').toLowerCase()
                    });
                }
            } catch (e) {
                // skip unreadable file
            }
        }
        
        // Background thumbnail pre-caching
        preCacheThumbnails(fileObjects);
        
        res.json(fileObjects);
    } catch (err) {
        console.error(`Error reading dump directory: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Get detailed stats of the app
app.get('/api/stats', (req, res) => {
    try {
        let dumpCount = 0;
        let dumpSize = 0;
        if (fs.existsSync(dumpDir)) {
            const files = fs.readdirSync(dumpDir);
            for (const f of files) {
                if (f.startsWith('.')) continue;
                try {
                    const st = fs.statSync(path.join(dumpDir, f));
                    if (st.isFile()) {
                        dumpCount++;
                        dumpSize += st.size;
                    }
                } catch (_) {}
            }
        }

        const folders = getFoldersConfig();
        const folderStats = folders.map(f => {
            const folderPath = getCategoryPath(f.name);
            let count = 0;
            let size = 0;
            if (fs.existsSync(folderPath)) {
                try {
                    const items = fs.readdirSync(folderPath);
                    for (const item of items) {
                        if (item.startsWith('.')) continue;
                        try {
                            const st = fs.statSync(path.join(folderPath, item));
                            if (st.isFile()) {
                                count++;
                                size += st.size;
                            }
                        } catch (_) {}
                    }
                } catch (_) {}
            }
            return {
                name: f.name,
                key: f.key,
                color: f.color || '#6366f1',
                count,
                size
            };
        });

        res.json({
            dumpCount,
            dumpSize,
            folders: folderStats,
            canUndo: actionHistory.length > 0,
            lastAction: actionHistory[actionHistory.length - 1] || null,
            storageRoot,
            dumpDir,
            isDesktop: isElectron
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Start server function for modular launch (e.g. from Electron)
function startServer(customPort, customDataDir) {
    if (customDataDir) {
        process.env.SORTIRR_DATA_DIR = customDataDir;
    }
    const listenPort = customPort !== undefined ? customPort : (process.env.PORT || 3000);
    return new Promise((resolve, reject) => {
        const server = app.listen(listenPort, '127.0.0.1', () => {
            const actualPort = server.address().port;
            console.log(`Server running at http://127.0.0.1:${actualPort}`);
            console.log(`Serving static files from ${publicDir}`);
            console.log(`Storage root at ${storageRoot}`);
            console.log(`Dump directory at ${dumpDir}`);
            resolve({ server, port: actualPort });
        });
        server.on('error', reject);
    });
}

if (require.main === module) {
    startServer(process.env.PORT || 3000).catch(err => {
        console.error('Failed to start server:', err);
    });
}

module.exports = { app, startServer, storageRoot, dumpDir, getFoldersConfig };