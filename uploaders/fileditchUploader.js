const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadToFileditch(filePath, statusMessage, fileIndexStr) {
    // statusMessage and fileIndexStr are included for potential future use
    console.log(`[DEBUG][FileditchUploader] Starting Fileditch upload for: ${filePath}`);
    try {
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath).toLowerCase();

        let contentType = 'application/octet-stream'; // Default
        if (fileExt === '.mp4') {
            contentType = 'video/mp4';
        } else if (fileExt === '.jpg' || fileExt === '.jpeg') {
            contentType = 'image/jpeg';
        } else if (fileExt === '.png') {
            contentType = 'image/png';
        } else if (fileExt === '.gif') {
            contentType = 'image/gif';
        }
        console.log(`[DEBUG][FileditchUploader] Uploading ${fileName} (ext: ${fileExt}) with Content-Type: ${contentType}`);

        const form = new FormData();
        form.append('files[]', fs.createReadStream(filePath), {
            filename: fileName,
            contentType: contentType
        });

        const response = await fetch('https://up1.fileditch.com/upload.php', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[DEBUG][FileditchUploader] Fileditch API request failed with status ${response.status}: ${errorText}`);
            throw new Error(`Fileditch API request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[DEBUG][FileditchUploader] Fileditch response:', data);

        if (data && data.success && data.files && data.files.length > 0 && data.files[0].url) {
            const fileditchUrl = data.files[0].url;
            console.log(`[DEBUG][FileditchUploader] Upload successful: ${fileditchUrl}`);
            return { success: true, url: fileditchUrl };
        } else {
            console.error('[DEBUG][FileditchUploader] Fileditch upload failed or response format unexpected:', data);
            // Try to extract a more specific error message if available
            const errorMessage = data?.files?.[0]?.error || data?.error || 'Fileditch upload failed or returned an invalid response format.';
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error(`[DEBUG][FileditchUploader] Fileditch upload failed for file ${path.basename(filePath)}:`, error.message);
        return { success: false, error: error.message, service: `Fileditch${fileIndexStr || ''}` };
    }
}

module.exports = {
    uploadToFileditch
}; 