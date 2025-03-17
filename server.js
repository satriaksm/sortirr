const express = require('express');
const moveFile = require('./moveFile');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// Ensure 'public' directory exists first
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log(`Created 'public' directory at ${publicDir}`);
} else {
    console.log(`'public' directory exists at ${publicDir}`);
}

// Ensure 'public/dump' directory exists
const dumpDir = path.join(__dirname, 'public', 'dump');
if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
    console.log(`Created 'dump' directory at ${dumpDir}`);
} else {
    console.log(`'dump' directory exists at ${dumpDir}`);
}

// No need for explicit static serving of dump since it's inside public
// which is already being served by express.static

app.post('/delete-file', async (req, res) => {
    console.log('Received request to delete file:', req.body);
    const { fileName } = req.body;
    const filePath = path.join(__dirname, 'public', 'dump', fileName);
  
    try {
      await fs.promises.unlink(filePath);
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
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

app.get('/file/:filename', (req, res) => {
    const filename = req.params.filename;
    console.log('Requested file:', filename);
    const filePath = path.join(__dirname, 'public', 'dump', filename);
    console.log('Full file path:', filePath);

    if (fs.existsSync(filePath)) {
        console.log(`Sending file: ${filePath}`);
        res.sendFile(filePath);
    } else {
        console.log(`File not found: ${filePath}`);
        res.status(404).send(`File ${filename} not found`);
    }
});

app.get('/new-list-dump-files', (req, res) => {
    // Ensure directory exists before trying to read it
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
        console.log(`Created 'dump' directory at ${dumpDir}`);
        // Return empty array if directory was just created
        return res.json([]);
    }
    
    try {
        const files = fs.readdirSync(dumpDir);
        console.log(`Found ${files.length} files in dump directory`);
        console.log('Files in dump:', files); // Log the files for debugging
        res.json(files);
    } catch (err) {
        console.error(`Error reading dump directory: ${err.message}`);
        res.status(500).json({ message: err.message });
    }
});

// Add a route to check if a file exists in dump directory
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

// Add a debug route to see exact file paths and permissions
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
            files: fileDetails
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Serving static files from ${path.join(__dirname, 'public')}`);
    console.log(`Dump directory at ${dumpDir}`);
});