const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

async function uploadToSodiShare(filePath, statusMessage, fileIndexStr) {
    const fileName = path.basename(filePath);
    console.log(`[DEBUG][SodiShareUploader] Starting SodiShare upload for: ${filePath}`);

    // Escape backslashes and double quotes for shell command, as the path will be within double quotes for curl -F
    const shellSafeFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const command = `curl -F "file=@${shellSafeFilePath}" https://sodishare.zsh.one/upload`;
    console.log(`[DEBUG][SodiShareUploader] Executing command: ${command}`);

    try {
        const { stdout, stderr } = await execAsync(command);

        console.log(`[DEBUG][SodiShareUploader] stdout for ${fileName}:\n${stdout}`);
        if (stderr) { // Log stderr only if it has content
            console.log(`[DEBUG][SodiShareUploader] stderr for ${fileName}:\n${stderr}`);
        }

        if (!stdout) {
            console.error(`[DEBUG][SodiShareUploader] No stdout from SodiShare upload for ${fileName}. Stderr: ${stderr}`);
            throw new Error('SodiShare did not return a URL. Possible error or empty response.');
        }
        
        let responseData;
        let parsedUrl;

        try {
            responseData = JSON.parse(stdout.trim());
            if (responseData && responseData.success && responseData.url) {
                parsedUrl = responseData.url;
            } else {
                console.error(`[DEBUG][SodiShareUploader] SodiShare JSON response missing success or url field:`, responseData);
                throw new Error('SodiShare response JSON invalid or missing URL.');
            }
        } catch (parseError) {
            console.error(`[DEBUG][SodiShareUploader] Failed to parse SodiShare response as JSON. Raw stdout: ${stdout.trim()}`, parseError);
            // Fallback: If it's not JSON, maybe it's a direct URL (less likely now but for robustness)
            // However, based on user log, it IS JSON. So this path is an error.
            throw new Error(`Failed to parse SodiShare response: ${stdout.trim()}`);
        }

        if (!parsedUrl || (!parsedUrl.startsWith('http://') && !parsedUrl.startsWith('https://'))) {
            console.error(`[DEBUG][SodiShareUploader] Invalid or missing URL from SodiShare JSON: ${parsedUrl || 'N/A'}`);
            throw new Error(`Invalid or missing URL from SodiShare after parsing: ${parsedUrl || 'N/A'}`);
        }

        console.log(`[DEBUG][SodiShareUploader] SodiShare upload successful for ${fileName}: ${parsedUrl}`);
        return { success: true, url: parsedUrl, service: `SodiShare${fileIndexStr || ''}` };

    } catch (error) {
        console.error(`[DEBUG][SodiShareUploader] SodiShare upload failed for ${fileName}:`, error.message);
        if (error.stdout) console.error(`[DEBUG][SodiShareUploader] Error stdout: ${error.stdout}`);
        if (error.stderr) console.error(`[DEBUG][SodiShareUploader] Error stderr: ${error.stderr}`);
        return { success: false, error: error.message, service: `SodiShare${fileIndexStr || ''}` };
    }
}

module.exports = {
    uploadToSodiShare
}; 