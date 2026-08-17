const express = require('express');
const moveFile = require('./moveFile');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
    console.log('FFmpeg binary available at:', ffmpegPath);
} catch (e) {
    console.warn('ffmpeg-static module not available:', e.message);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Ensure 'public' directory exists
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log(`Created 'public' directory at ${publicDir}`);
}

// Ensure 'public/dump' directory exists
const dumpDir = path.join(__dirname, 'public', 'dump');
if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
    console.log(`Created 'dump' directory at ${dumpDir}`);
}

// Ensure '.cache' directory exists for video previews and thumbnails
const cacheDir = path.join(__dirname, '.cache');
if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`Created '.cache' directory at ${cacheDir}`);
}

// Path to folder configuration JSON
const configPath = path.join(__dirname, 'config.json');

const defaultFolders = [
    { key: "1", name: "Family" },
    { key: "2", name: "Kuliah" },
    { key: "3", name: "prau" },
    { key: "4", name: "Cant See" },
    { key: "5", name: "andong" },
    { key: "6", name: "Merbabu" }
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
                // Fallback: try capturing frame at 00:00:00 if 0.5s was beyond duration
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
    const videoExtensions = ['.mov', '.mp4', '.mkv', '.avi', '.webm', '.m4v', '.3gp', '.flv', '.wmv'];
    
    try {
        for (const file of files) {
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

app.get('/api/folders', (req, res) => {
    const folders = getFoldersConfig();
    res.json(folders);
});

app.post('/api/folders', (req, res) => {
    const folders = req.body;
    if (!Array.isArray(folders)) {
        return res.status(400).json({ message: 'Invalid folder configuration data' });
    }
    try {
        fs.writeFileSync(configPath, JSON.stringify(folders, null, 2), 'utf8');
        folders.forEach(item => {
            if (item.name) {
                const folderDir = path.join(__dirname, 'public', item.name);
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

app.post('/delete-file', async (req, res) => {
    console.log('Received request to delete file:', req.body);
    const { fileName } = req.body;
    const filePath = path.join(__dirname, 'public', 'dump', fileName);
  
    try {
        await fs.promises.unlink(filePath);
        removeFileCache(fileName);
        res.json({ message: 'File deleted successfully' });
    } catch (err) {
        console.error(`Error deleting file: ${fileName}`, err);
        return res.status(500).json({ message: 'Error deleting file' });
    }
});

app.post('/move-file', async (req, res) => {
    const { fileName, folder } = req.body;
    try {
        const result = await moveFile(fileName, folder);
        removeFileCache(fileName);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Direct file serving (for downloads or native previews)
app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'dump', filename);

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
        // Fallback: serve original file if FFmpeg is not available
        return res.sendFile(filePath);
    }

    try {
        await transcodeToMp4(filePath, previewPath);
        res.sendFile(previewPath);
    } catch (err) {
        console.error(`Error transcoding video ${filename}:`, err.message);
        // Fallback to sending original file
        res.sendFile(filePath);
    }
});

// List files in dump directory
app.get('/new-list-dump-files', (req, res) => {
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
        console.log(`Created 'dump' directory at ${dumpDir}`);
        return res.json([]);
    }
    
    try {
        const rawFiles = fs.readdirSync(dumpDir);
        const files = rawFiles.filter(file => {
            if (file.startsWith('.')) return false;
            try {
                const stat = fs.statSync(path.join(dumpDir, file));
                return stat.isFile();
            } catch (e) {
                return false;
            }
        });
        
        // Start background pre-caching for video thumbnails
        preCacheThumbnails(files);
        
        res.json(files);
    } catch (err) {
        console.error(`Error reading dump directory: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Check if a file exists
app.get('/check-file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'public', 'dump', filename);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.json({ exists: false, message: `File ${filename} not found` });
        } else {
            res.json({ exists: true, path: `/dump/${filename}` });
        }
    });
});

// Debug route
app.get('/debug-files', (req, res) => {
    fs.readdir(dumpDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        const fileDetails = files.map(file => {
            const filePath = path.join(dumpDir, file);
            let stats = {};
            try {
                stats = fs.statSync(filePath);
            } catch (e) {
                stats = { error: e.message };
            }
            
            return {
                name: file,
                path: filePath,
                exists: fs.existsSync(filePath),
                stats: {
                    size: stats.size,
                    isFile: stats.isFile ? stats.isFile() : 'error',
                    isDirectory: stats.isDirectory ? stats.isDirectory() : 'error',
                    permissions: stats.mode
                }
            };
        });
        
        res.json({
            serverDirectory: __dirname,
            dumpDirectory: dumpDir,
            ffmpegAvailable: !!ffmpegPath,
            files: fileDetails
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Serving static files from ${path.join(__dirname, 'public')}`);
    console.log(`Dump directory at ${dumpDir}`);
});