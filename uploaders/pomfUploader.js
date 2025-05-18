const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Function to upload to Pomf using curl command
async function uploadToPomfWithCurl(filePath, statusMessage, fileIndexStr) { // Added statusMessage and fileIndexStr for consistency, though not used in current logic
  try {
    console.log(`[DEBUG][PomfUploader] Executing curl command for Pomf upload: ${filePath}`);
    
    // The pomf.lain.la endpoint might be outdated or specific. Using fileb.in as in the original code.
    // The original code used https://pomf.fileb.in/upload.php
    const curlCommand = `curl -i -F "files[]=@${filePath}" https://pomf.fileb.in/upload.php`;
    console.log(`[DEBUG][PomfUploader] Curl command: ${curlCommand}`);
    
    const { stdout, stderr } = await execAsync(curlCommand);

    if (stderr){
        console.warn(`[DEBUG][PomfUploader] Curl stderr: ${stderr}`); // Log stderr for debugging potential issues
    }
    console.log('[DEBUG][PomfUploader] Curl command output:', stdout);
    
    // Parse the JSON response from the curl output
    // The response often includes HTTP headers before the JSON body.
    const jsonStartIndex = stdout.indexOf('{');
    if (jsonStartIndex === -1) {
      console.error('[DEBUG][PomfUploader] Could not find JSON in curl response. Full stdout:', stdout);
      throw new Error('Could not find JSON in curl response from Pomf');
    }
    
    const jsonResponse = stdout.substring(jsonStartIndex);
    const pomfData = JSON.parse(jsonResponse);
    console.log('[DEBUG][PomfUploader] Parsed Pomf response:', pomfData);
    
    if (pomfData && pomfData.success && pomfData.files && pomfData.files.length > 0 && pomfData.files[0].url) {
      const pomfUrl = pomfData.files[0].url;
      console.log(`[DEBUG][PomfUploader] Upload successful: ${pomfUrl}`);
      return { success: true, url: pomfUrl };
    } else {
      console.error('[DEBUG][PomfUploader] Pomf upload failed or returned unexpected response format:', pomfData);
      throw new Error(`Pomf upload failed: ${pomfData?.description || pomfData?.error?.message || 'Unknown error from Pomf API'}`);
    }
  } catch (error) {
    console.error('[DEBUG][PomfUploader] Pomf upload error:', error.message);
    // Include stdout/stderr from execAsync error if available
    if (error.stdout) console.error('[DEBUG][PomfUploader] Error stdout:', error.stdout);
    if (error.stderr) console.error('[DEBUG][PomfUploader] Error stderr:', error.stderr);
    return { success: false, error: error.message }; // Return a consistent error object shape
  }
}

module.exports = {
  uploadToPomfWithCurl
}; 