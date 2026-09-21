const express = require('express');
const moveFile = require('./moveFile');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const multer = require('multer');
const crypto = require('crypto');

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
const electron = isElectron ? require('electron') : null;
const dataDir = process.env.SORTIRR_DATA_DIR || (isElectron 
    ? path.join(process.env.USERPROFILE || process.env.HOME || process.env.APPDATA, 'Documents', 'Sortirr')
    : null);

const storageRoot = dataDir || path.join(__dirname, 'public');
const publicDir = path.join(__dirname, 'public'); // for static HTML, CSS, JS web assets

const dumpDir = path.join(storageRoot, 'dump');
const cacheDir = dataDir ? path.join(dataDir, '.cache') : path.join(__dirname, '.cache');
const trashDir = dataDir ? path.join(dataDir, '.trash') : path.join(__dirname, '.trash');
const configPath = dataDir ? path.join(dataDir, 'config.json') : path.join(__dirname, 'config.json');
const settingsPath = dataDir ? path.join(dataDir, 'settings.json') : path.join(__dirname, 'settings.json');

function getCategoryPath(categoryName) {
    return path.join(storageRoot, categoryName);
}

// Settings and Dynamic Source Folder State
function loadSettings() {
    try {
        if (fs.existsSync(settingsPath)) {
            const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (typeof parsed === 'object' && parsed !== null) {
                return {
                    currentSourceFolder: parsed.currentSourceFolder || null,
                    recentFolders: Array.isArray(parsed.recentFolders) ? parsed.recentFolders : []
                };
            }
        }
    } catch (e) {
        console.error('Error reading settings.json:', e.message);
    }
    return { currentSourceFolder: null, recentFolders: [] };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving settings.json:', e.message);
    }
}

const initialSettings = loadSettings();
let currentSourceFolder = initialSettings.currentSourceFolder;
if (currentSourceFolder && !fs.existsSync(currentSourceFolder)) {
    console.warn(`Saved source folder "${currentSourceFolder}" does not exist. Falling back to default dump folder.`);
    currentSourceFolder = null;
    saveSettings({ ...initialSettings, currentSourceFolder: null });
}

function getSourceDir() {
    if (currentSourceFolder && fs.existsSync(currentSourceFolder)) {
        return currentSourceFolder;
    }
    return dumpDir;
}

function getSourceInfo() {
    const activeDir = getSourceDir();
    const isDefault = path.resolve(activeDir) === path.resolve(dumpDir);
    return {
        path: activeDir,
        name: isDefault ? 'dump (Default)' : path.basename(activeDir),
        isDefault
    };
}

function setSourceDir(newPath) {
    if (!newPath || typeof newPath !== 'string') {
        throw new Error('Path folder tidak valid');
    }
    const resolvedPath = path.resolve(newPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Folder "${newPath}" tidak ditemukan di komputer`);
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
        throw new Error(`Path "${newPath}" bukan merupakan sebuah folder`);
    }

    const isDefault = path.resolve(resolvedPath) === path.resolve(dumpDir);
    currentSourceFolder = isDefault ? null : resolvedPath;

    const settings = loadSettings();
    settings.currentSourceFolder = currentSourceFolder;

    if (!Array.isArray(settings.recentFolders)) {
        settings.recentFolders = [];
    }

    if (!isDefault) {
        // Remove existing occurrence and unshift
        settings.recentFolders = settings.recentFolders.filter(p => path.resolve(p) !== path.resolve(resolvedPath));
        settings.recentFolders.unshift(resolvedPath);
        if (settings.recentFolders.length > 8) {
            settings.recentFolders = settings.recentFolders.slice(0, 8);
        }
    }

    saveSettings(settings);
    return getSourceInfo();
}

function resetSourceToDump() {
    currentSourceFolder = null;
    const settings = loadSettings();
    settings.currentSourceFolder = null;
    saveSettings(settings);
    return getSourceInfo();
}

// Native OS Folder Picker
async function pickFolderNative() {
    if (isElectron && electron && electron.dialog) {
        const focusedWindow = electron.BrowserWindow ? electron.BrowserWindow.getFocusedWindow() : null;
        const result = await electron.dialog.showOpenDialog(focusedWindow || undefined, {
            title: 'Pilih Folder untuk Disortir',
            defaultPath: getSourceDir(),
            properties: ['openDirectory', 'dontAddToRecent']
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { canceled: true };
        }
        return { canceled: false, folderPath: result.filePaths[0] };
    }

    // Windows PowerShell fallback
    if (process.platform === 'win32') {
        return new Promise((resolve) => {
            const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Pilih Folder untuk Disortir dengan Sortirr'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
`;
            const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
            let stdout = '';
            ps.stdout.on('data', (d) => { stdout += d.toString(); });
            ps.on('close', (code) => {
                const selected = stdout.trim();
                if (code === 0 && selected && fs.existsSync(selected)) {
                    resolve({ canceled: false, folderPath: selected });
                } else {
                    resolve({ canceled: true });
                }
            });
            ps.on('error', (err) => {
                console.error('PowerShell folder dialog error:', err);
                resolve({ canceled: true });
            });
        });
    }

    return { canceled: true, unsupported: true };
}

// Ensure required base directories exist
[storageRoot, dumpDir, cacheDir, trashDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    }
});

app.use(express.static(publicDir));

// Multer storage for uploading files into active source directory
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const targetDir = getSourceDir();
        if (!fs.existsSync(targetDir)) {
            try { fs.mkdirSync(targetDir, { recursive: true }); } catch (_) {}
        }
        cb(null, targetDir);
    },
    filename: function (req, file, cb) {
        const targetDir = getSourceDir();
        let targetName = file.originalname;
        let counter = 1;
        const ext = path.extname(targetName);
        const base = path.basename(targetName, ext);
        while (fs.existsSync(path.join(targetDir, targetName))) {
            targetName = `${base}_${counter}${ext}`;
            counter++;
        }
        cb(null, targetName);
    }
});
const upload = multer({ storage });

const defaultFolders = [
    { key: "1", name: "Work", color: "#6366f1" },
    { key: "2", name: "Personal", color: "#06b6d4" },
    { key: "3", name: "Media", color: "#10b981" },
    { key: "4", name: "Documents", color: "#f59e0b" },
    { key: "5", name: "Archive", color: "#8b5cf6" },
    { key: "6", name: "Review", color: "#ec4899" }
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

// Cache Key Helper (avoids collisions for files with identical names across different folders)
function getCacheKey(filePath) {
    const hash = crypto.createHash('md5').update(path.resolve(filePath)).digest('hex').slice(0, 8);
    return `${hash}_${path.basename(filePath)}`;
}

// Helper: Clean up preview cache when a file is moved or deleted
function removeFileCache(filePathOrName) {
    try {
        const base = path.basename(filePathOrName);
        if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            for (const f of files) {
                if (f === `${base}.mp4` || f === `${base}.jpg` || f.endsWith(`_${base}.mp4`) || f.endsWith(`_${base}.jpg`)) {
                    try { fs.unlinkSync(path.join(cacheDir, f)); } catch (_) {}
                }
            }
        }
    } catch (e) {
        console.error(`Error cleaning cache for ${filePathOrName}:`, e.message);
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
    const activeDir = getSourceDir();
    
    try {
        for (const item of files) {
            const file = typeof item === 'object' ? item.name : item;
            const ext = path.extname(file).toLowerCase();
            if (videoExtensions.includes(ext)) {
                const sourcePath = path.join(activeDir, file);
                const thumbName = `${getCacheKey(sourcePath)}.jpg`;
                const thumbPath = path.join(cacheDir, thumbName);
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

// GET /api/source-folder - Get active source folder & recent folders
app.get('/api/source-folder', (req, res) => {
    const settings = loadSettings();
    const current = getSourceInfo();
    const validRecent = (settings.recentFolders || [])
        .filter(p => fs.existsSync(p))
        .map(p => ({
            path: p,
            name: path.basename(p),
            isCurrent: path.resolve(p) === path.resolve(current.path)
        }));

    res.json({
        current,
        defaultDump: dumpDir,
        recentFolders: validRecent
    });
});

// POST /api/set-source-folder - Set active source folder manually
app.post('/api/set-source-folder', (req, res) => {
    const { folderPath } = req.body;
    try {
        if (!folderPath || folderPath === 'dump' || path.resolve(folderPath) === path.resolve(dumpDir)) {
            const current = resetSourceToDump();
            return res.json({
                message: 'Folder sumber dialihkan kembali ke default (dump)',
                current
            });
        }

        const current = setSourceDir(folderPath);
        res.json({
            message: `Folder sumber diubah ke "${current.name}"`,
            current
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// POST /api/select-source-folder - Open OS native folder picker dialog
app.post('/api/select-source-folder', async (req, res) => {
    try {
        const dialogResult = await pickFolderNative();
        if (dialogResult.canceled || !dialogResult.folderPath) {
            return res.json({ canceled: true, current: getSourceInfo() });
        }

        const current = setSourceDir(dialogResult.folderPath);
        res.json({
            canceled: false,
            message: `Folder sumber dipilih: "${current.name}"`,
            current
        });
    } catch (err) {
        console.error('Error in select-source-folder:', err);
        res.status(500).json({ message: 'Gagal memilih folder: ' + err.message });
    }
});

// POST /api/remove-recent-folder - Remove a folder from recent list
app.post('/api/remove-recent-folder', (req, res) => {
    const { folderPath } = req.body;
    if (!folderPath) {
        return res.status(400).json({ message: 'folderPath required' });
    }

    const settings = loadSettings();
    settings.recentFolders = (settings.recentFolders || []).filter(
        p => path.resolve(p) !== path.resolve(folderPath)
    );
    saveSettings(settings);

    res.json({ message: 'Folder dihapus dari riwayat' });
});

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

// POST /api/upload - Upload files to active source directory
app.post('/api/upload', upload.array('files', 100), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
    }
    const uploadedNames = req.files.map(f => f.filename);
    const source = getSourceInfo();
    res.json({
        message: `Berhasil mengunggah ${req.files.length} berkas ke "${source.name}"`,
        files: uploadedNames,
        source
    });
});

// Cross-device safe move helper
function safeMoveSync(src, dest) {
    try {
        fs.renameSync(src, dest);
    } catch (err) {
        if (err.code === 'EXDEV') {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
        } else {
            throw err;
        }
    }
}

// POST /api/undo - Undo last move or delete action
app.post('/api/undo', async (req, res) => {
    if (actionHistory.length === 0) {
        return res.status(400).json({ message: 'Tidak ada riwayat tindakan untuk di-undo' });
    }

    const lastAction = actionHistory.pop();
    try {
        const restoreDir = (lastAction.sourceDir && fs.existsSync(lastAction.sourceDir))
            ? lastAction.sourceDir
            : getSourceDir();

        if (lastAction.type === 'move') {
            const movedPath = path.join(getCategoryPath(lastAction.toFolder), lastAction.finalName);
            const restorePath = path.join(restoreDir, lastAction.originalName);

            if (!fs.existsSync(movedPath)) {
                return res.status(404).json({ message: `File "${lastAction.finalName}" tidak ditemukan di folder "${lastAction.toFolder}"` });
            }

            // Restore back to original source folder (safe across drives)
            safeMoveSync(movedPath, restorePath);
            removeFileCache(movedPath);
            removeFileCache(restorePath);

            return res.json({
                message: `Berhasil mengembalikan "${lastAction.originalName}" dari folder "${lastAction.toFolder}"`,
                restoredFile: lastAction.originalName,
                action: lastAction
            });
        } else if (lastAction.type === 'delete') {
            const trashPath = lastAction.trashPath;
            const restorePath = path.join(restoreDir, lastAction.originalName);

            if (!fs.existsSync(trashPath)) {
                return res.status(404).json({ message: `File yang dihapus "${lastAction.originalName}" tidak ditemukan di tempat sampah` });
            }

            safeMoveSync(trashPath, restorePath);
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
    const activeSourceDir = getSourceDir();
    const filePath = path.join(activeSourceDir, fileName);

    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: `File "${fileName}" not found in source directory` });
        }

        const trashFileName = `${Date.now()}_${fileName}`;
        const targetTrashPath = path.join(trashDir, trashFileName);

        // Move to .trash instead of hard unlinking (safe across drives)
        safeMoveSync(filePath, targetTrashPath);
        removeFileCache(filePath);

        // Push to undo stack
        pushUndoAction({
            type: 'delete',
            originalName: fileName,
            trashPath: targetTrashPath,
            sourceDir: activeSourceDir,
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
    const activeSourceDir = getSourceDir();
    try {
        const result = await moveFile(fileName, folder, storageRoot, activeSourceDir);
        removeFileCache(path.join(activeSourceDir, fileName));

        // Record in undo stack with sourceDir
        pushUndoAction({
            type: 'move',
            originalName: result.originalName,
            finalName: result.finalName,
            toFolder: folder,
            sourceDir: activeSourceDir,
            timestamp: Date.now()
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/open-folder - Reveal folder in OS File Explorer (Windows/macOS/Linux)
app.post('/api/open-folder', (req, res) => {
    const { folder, path: customPath } = req.body;
    let targetPath = storageRoot;

    if (customPath && typeof customPath === 'string') {
        targetPath = customPath;
    } else if (folder === 'source' || folder === 'current') {
        targetPath = getSourceDir();
    } else if (folder === 'dump') {
        targetPath = dumpDir;
    } else if (folder) {
        targetPath = getCategoryPath(folder);
    }

    if (!fs.existsSync(targetPath)) {
        try {
            fs.mkdirSync(targetPath, { recursive: true });
        } catch (e) {
            return res.status(400).json({ message: `Directory does not exist: ${targetPath}` });
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
        res.json({ message: `Membuka folder "${path.basename(targetPath)}" di file explorer` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to open file explorer: ' + err.message });
    }
});

// Direct file serving (for downloads or native previews)
app.get('/file/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const sourceDir = getSourceDir();
    const filePath = path.join(sourceDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send(`File ${filename} not found`);
    }
});

// Instant video thumbnail endpoint
app.get('/api/video-thumbnail/:filename', async (req, res) => {
    const filename = path.basename(req.params.filename);
    const sourceDir = getSourceDir();
    const filePath = path.join(sourceDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    const thumbName = `${getCacheKey(filePath)}.jpg`;
    const thumbPath = path.join(cacheDir, thumbName);
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
    const filename = path.basename(req.params.filename);
    const sourceDir = getSourceDir();
    const filePath = path.join(sourceDir, filename);

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
    const previewName = `${getCacheKey(filePath)}.mp4`;
    const previewPath = path.join(cacheDir, previewName);
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

// List files in active source directory with rich metadata
app.get('/new-list-dump-files', (req, res) => {
    const activeDir = getSourceDir();
    if (!fs.existsSync(activeDir)) {
        try { fs.mkdirSync(activeDir, { recursive: true }); } catch (_) {}
        return res.json([]);
    }
    
    try {
        const rawFiles = fs.readdirSync(activeDir);
        const fileObjects = [];

        for (const file of rawFiles) {
            if (file.startsWith('.')) continue;
            try {
                const filePath = path.join(activeDir, file);
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
        console.error(`Error reading source directory (${activeDir}): ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Get detailed stats of the app
app.get('/api/stats', (req, res) => {
    try {
        const activeDir = getSourceDir();
        let sourceCount = 0;
        let sourceSize = 0;
        if (fs.existsSync(activeDir)) {
            const files = fs.readdirSync(activeDir);
            for (const f of files) {
                if (f.startsWith('.')) continue;
                try {
                    const st = fs.statSync(path.join(activeDir, f));
                    if (st.isFile()) {
                        sourceCount++;
                        sourceSize += st.size;
                    }
                } catch (_) {}
            }
        }

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
            sourceStats: {
                path: activeDir,
                name: getSourceInfo().name,
                isDefault: getSourceInfo().isDefault,
                count: sourceCount,
                size: sourceSize
            },
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