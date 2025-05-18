const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function uploadToFilebin(filePath, statusMessage, fileIndexStr) {
    // statusMessage and fileIndexStr are included for potential future use
    console.log(`[DEBUG][FilebinUploader] Starting Filebin upload for: ${filePath}`);
    try {
        let fileExt = path.extname(filePath).toLowerCase();
        let fileName = path.basename(filePath);

        let contentType = 'application/octet-stream';
        if (fileExt === '.mp4') {
            contentType = 'video/mp4';
        } else if (fileExt === '.jpg' || fileExt === '.jpeg') {
            contentType = 'image/jpeg';
        } else if (fileExt === '.png') {
            contentType = 'image/png';
        } else if (fileExt === '.gif') {
            contentType = 'image/gif';
        }
        console.log(`[DEBUG][FilebinUploader] Uploading ${fileName} (ext: ${fileExt}) with Content-Type: ${contentType}`);

        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), { // Changed from 'file[]' to 'file' as per many Filebin API examples
            filename: fileName,
            contentType: contentType
        });

        // Filebin API seems to prefer the bin be specified or a random one is used.
        // The /api/upload endpoint might not be the one that returns a direct file link in the simple way expected.
        // The original code used 'https://fileb.in/api/upload' and expected a `data.url`.
        // Let's try to stick to that, but be aware it might create a bin first.
        // Consider using a specific bin name if consistent behavior is needed: `https://fileb.in/YOUR_BIN_NAME`

        const response = await fetch('https://fileb.in/api/upload', { // Or 'https://fileb.in/' if uploading to a new random bin directly.
            method: 'POST',
            body: form,
            headers: {
                ...form.getHeaders(), // Includes Content-Type: multipart/form-data; boundary=...
                // 'X-Bin-Name': 'my-archive-bin', // Optional: to upload to a specific bin
                // 'X-File-Name': fileName // Often redundant if filename is in FormData, but some APIs like it.
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[DEBUG][FilebinUploader] Filebin API request failed with status ${response.status}: ${errorText}`);
            throw new Error(`Filebin API request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[DEBUG][FilebinUploader] Filebin response:', data);

        // The original code expected `data.url`. Filebin's direct upload to `/api/upload` might give a JSON object 
        // describing the file within a potentially new bin.
        // Example: { "bin": { "id": "randomly_generated_bin_id", ... }, "file": { "name": "filename.ext", "url": "..." } }
        // Or, it might be `data.files[0].url` if it supports multiple uploads in one go.
        // Based on the original code's successful validation: `!data || !data.url`.
        // Let's try to find a URL, preferring `data.file.url` or `data.url` directly.

        let filebinUrl = null;
        if (data && data.file && data.file.url) {
            filebinUrl = data.file.url;
        } else if (data && data.url) { // Direct URL from response
            filebinUrl = data.url;
        } else if (data && data.files && data.files.length > 0 && data.files[0].url) { // If it was an array of files
             filebinUrl = data.files[0].url;
        }

        if (!filebinUrl) {
            console.error('[DEBUG][FilebinUploader] Invalid Filebin response: URL not found in expected locations.', data);
            throw new Error('Invalid Filebin response: URL not found.');
        }
        
        console.log(`[DEBUG][FilebinUploader] Upload successful: ${filebinUrl}`);

        // Logic for displayUrl (image file with .mp4 extension in URL)
        let displayUrl = filebinUrl;
        const isImage = contentType.startsWith('image/');
        const urlHasMP4 = filebinUrl.toLowerCase().endsWith('.mp4');
        if (isImage && urlHasMP4) {
            displayUrl = `${filebinUrl} (valójában ${fileExt} fájl)`;
        }

        return { 
            success: true, 
            url: filebinUrl, 
            displayUrl: displayUrl,
            isImage: isImage 
        };
    } catch (error) {
        console.error(`[DEBUG][FilebinUploader] Filebin upload failed for file ${path.basename(filePath)}:`, error.message);
        return { success: false, error: error.message, service: `Filebin${fileIndexStr || ''}` };
    }
}

module.exports = {
    uploadToFilebin
}; 