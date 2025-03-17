const fs = require('fs');
const path = require('path');

function moveFile(fileName, folder) {
    const sourcePath = path.join(__dirname, 'public', 'dump', fileName);
    const folderPath = path.join(__dirname, 'public', folder);
    const destinationPath = path.join(folderPath, fileName);

    return new Promise((resolve, reject) => {
        // Check if source file exists
        if (!fs.existsSync(sourcePath)) {
            return reject(new Error(`Source file ${fileName} not found`));
        }

        // Ensure destination folder exists
        if (!fs.existsSync(folderPath)) {
            try {
                fs.mkdirSync(folderPath, { recursive: true });
                console.log(`Created folder: ${folderPath}`);
            } catch (err) {
                return reject(new Error(`Failed to create folder ${folder}: ${err.message}`));
            }
        }

        fs.rename(sourcePath, destinationPath, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve({ message: `File moved to ${folder}` });
            }
        });
    });
}

module.exports = moveFile;
