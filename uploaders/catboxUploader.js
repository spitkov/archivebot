const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadToCatbox(filePath, statusMessage, fileIndexStr) {
    // statusMessage and fileIndexStr are included for potential future use in detailed progress updates
    // For now, this uploader is simple and doesn't provide granular progress.
    console.log(`[DEBUG][CatboxUploader] Starting Catbox upload for: ${filePath}`);
    try {
        let fileExt = path.extname(filePath).toLowerCase();
        let fileName = path.basename(filePath);

        let contentType = 'application/octet-stream'; // Default content type
        if (fileExt === '.mp4') {
            contentType = 'video/mp4';
        } else if (fileExt === '.jpg' || fileExt === '.jpeg') {
            contentType = 'image/jpeg';
        } else if (fileExt === '.png') {
            contentType = 'image/png';
        } else if (fileExt === '.gif') {
            contentType = 'image/gif';
        }
        console.log(`[DEBUG][CatboxUploader] Uploading ${fileName} (ext: ${fileExt}) with Content-Type: ${contentType}`);

        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', fs.createReadStream(filePath), {
            filename: fileName,
            contentType: contentType
        });

        const response = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            body: form,
            headers: form.getHeaders() // Important for FormData with node-fetch
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[DEBUG][CatboxUploader] Catbox API request failed with status ${response.status}: ${errorText}`);
            throw new Error(`Catbox API request failed: ${response.status} - ${errorText}`);
        }

        const url = await response.text();
        if (!url.startsWith('https://catbox.moe/') && !url.startsWith('https://files.catbox.moe/')) {
            console.error(`[DEBUG][CatboxUploader] Invalid Catbox response (not a catbox.moe or files.catbox.moe URL): ${url}`);
            throw new Error(`Invalid Catbox response: ${url}`);
        }
        console.log(`[DEBUG][CatboxUploader] Upload successful: ${url}`);
        return { success: true, url: url };
    } catch (error) {
        console.error(`[DEBUG][CatboxUploader] Catbox upload failed for file ${path.basename(filePath)}:`, error.message);
        return { success: false, error: error.message, service: `Catbox${fileIndexStr || ''}` };
    }
}

module.exports = {
    uploadToCatbox
}; 