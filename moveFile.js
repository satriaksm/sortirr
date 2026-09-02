const fs = require('fs');
const path = require('path');

/**
 * Move a file from dump directory to target category folder safely.
 * If a file with the same name already exists at destination, generates a unique non-conflicting name.
 */
function moveFile(fileName, folder, customDataDir) {
    const dataDir = customDataDir || process.env.SORTIRR_DATA_DIR;

    const sourcePath = dataDir 
        ? path.join(dataDir, 'dump', fileName)
        : path.join(__dirname, 'public', 'dump', fileName);

    const folderPath = dataDir 
        ? path.join(dataDir, folder)
        : path.join(__dirname, 'public', folder);

    return new Promise((resolve, reject) => {
        // Check if source file exists
        if (!fs.existsSync(sourcePath)) {
            return reject(new Error(`Source file "${fileName}" not found in dump directory`));
        }

        // Ensure destination folder exists
        if (!fs.existsSync(folderPath)) {
            try {
                fs.mkdirSync(folderPath, { recursive: true });
                console.log(`Created destination folder: ${folderPath}`);
            } catch (err) {
                return reject(new Error(`Failed to create destination folder "${folder}": ${err.message}`));
            }
        }

        // Generate safe unique filename if conflict exists
        let finalFileName = fileName;
        let destinationPath = path.join(folderPath, finalFileName);

        if (fs.existsSync(destinationPath)) {
            const ext = path.extname(fileName);
            const base = path.basename(fileName, ext);
            let counter = 1;
            while (fs.existsSync(path.join(folderPath, `${base}_${counter}${ext}`))) {
                counter++;
            }
            finalFileName = `${base}_${counter}${ext}`;
            destinationPath = path.join(folderPath, finalFileName);
        }

        fs.rename(sourcePath, destinationPath, (err) => {
            if (err) {
                // Fallback to copy + unlink if cross-device link error
                if (err.code === 'EXDEV') {
                    fs.copyFile(sourcePath, destinationPath, (copyErr) => {
                        if (copyErr) return reject(copyErr);
                        fs.unlink(sourcePath, (unlinkErr) => {
                            if (unlinkErr) console.warn(`Warning: Could not remove source file after copy:`, unlinkErr);
                            resolve({
                                message: `File moved to "${folder}"`,
                                originalName: fileName,
                                finalName: finalFileName,
                                folder: folder,
                                path: destinationPath
                            });
                        });
                    });
                } else {
                    reject(err);
                }
            } else {
                resolve({
                    message: `File moved to "${folder}"`,
                    originalName: fileName,
                    finalName: finalFileName,
                    folder: folder,
                    path: destinationPath
                });
            }
        });
    });
}

module.exports = moveFile;

