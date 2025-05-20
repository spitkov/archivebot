const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { COBALT_API_ENDPOINT, COBALT_SUPPORTED_SITES, TEMP_DIR_NAME, PROGRESS_UPDATE_TIME_THRESHOLD, PROGRESS_PERCENTAGE_CHANGE_THRESHOLD } = require('../constants');
const { progressBar } = require('../utils');
const { updateStatusEmbed } = require('../uploaders/uploaderUtils');

// Improved tracking system for updates (local to this module now)
let lastUpdateTime = 0;
let lastPercentage = 0;

// Download content using Cobalt API
async function downloadWithCobalt(url, outputPath, statusMessage, client) {
  console.log(`[DEBUG][CobaltDownloader] Entered downloadWithCobalt. URL: ${url}`);
  console.log(`[DEBUG][CobaltDownloader] Received statusMessage: ID=${statusMessage ? statusMessage.id : 'N/A'}, ChannelID=${statusMessage ? statusMessage.channelId : 'N/A'}`);
  console.log(`[DEBUG][CobaltDownloader] Received client: ${client ? 'Exists' : 'N/A'}`);
  // console.dir(statusMessage, { depth: 1 }); // Optional: for more details on statusMessage structure

  console.log(`[DEBUG] Starting Cobalt download for: ${url}`);
  
  try {
    const isCobaltSupported = COBALT_SUPPORTED_SITES.some(site => url.includes(site));
    
    if (!isCobaltSupported) {
      console.log(`[DEBUG] URL not supported by Cobalt, falling back to yt-dlp: ${url}`);
      return false; // Not supported, fall back to yt-dlp
    }
    
    await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Cobalt API', 'Előkészítés a Cobalt API-val...', '#ffaa00');
    
    let formattedUrl = url;
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
      console.log(`[DEBUG] Processing Facebook URL: ${url}`);
      if (url.includes('fb.watch')) {
        console.log(`[DEBUG] Found fb.watch short URL, keeping as is`);
      } else {
        try {
          const urlObj = new URL(url);
          formattedUrl = `https://${urlObj.hostname}${urlObj.pathname}`;
          if (urlObj.pathname.includes('/video.php') && urlObj.searchParams.has('v')) {
            const videoId = urlObj.searchParams.get('v');
            formattedUrl = `https://${urlObj.hostname}/video.php?v=${videoId}`;
          }
          if (urlObj.pathname.includes('/watch') && urlObj.searchParams.has('v')) {
            const videoId = urlObj.searchParams.get('v');
            formattedUrl = `https://${urlObj.hostname}/watch?v=${videoId}`;
          }
        } catch (urlError) {
          console.error(`[DEBUG] Error parsing Facebook URL: ${urlError.message}`);
          const fbUrlMatch = url.match(/([^?]+)/);
          if (fbUrlMatch && fbUrlMatch[1]) {
            formattedUrl = fbUrlMatch[1];
          }
        }
      }
      console.log(`[DEBUG] Formatted Facebook URL: ${formattedUrl}`);
    }
    
    const initialResponse = await axios.post(COBALT_API_ENDPOINT, {
      url: formattedUrl,
      videoQuality: 'max',
      audioFormat: 'best',
      filenameStyle: 'basic',
      downloadMode: 'auto',
      youtubeVideoCodec: 'h264',
      alwaysProxy: true,
      disableMetadata: false,
      tiktokFullAudio: true,
      tiktokH265: false,
      twitterGif: true,
      youtubeHLS: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log(`[DEBUG] Cobalt API response:`, initialResponse.data);
    
    if (!initialResponse.data) {
      console.error('Cobalt API did not return valid data', initialResponse.data);
      return false;
    }
    
    if (initialResponse.data.status === 'error') {
      let errorMessage = 'Cobalt API returned an error.';
      if (initialResponse.data.error) {
        errorMessage += ` Code: ${initialResponse.data.error.code}`;
        if (initialResponse.data.error.text) { // Some cobalt instances might use 'text'
            errorMessage += ` Message: ${initialResponse.data.error.text}`;
        }
        if (initialResponse.data.error.context) {
          errorMessage += ` Context: ${JSON.stringify(initialResponse.data.error.context)}`;
        }
      } else if (initialResponse.data.text) { // Fallback for older/different error structures
        errorMessage += ` Message: ${initialResponse.data.text}`;
      }
      console.error(errorMessage, initialResponse.data);
      return false;
    }
    
    if (initialResponse.data.status !== 'tunnel' && initialResponse.data.status !== 'redirect' && initialResponse.data.status !== 'stream') { // Added stream status
      console.error('Cobalt API returned unexpected status:', initialResponse.data.status);
      return false;
    }
    
    if (!initialResponse.data.url) {
      console.error('Cobalt API did not return a valid download URL', initialResponse.data);
      return false;
    }
    
    await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Cobalt Letöltés', 'Letöltés kezdése...', '#ffaa00');
    
    const writer = fs.createWriteStream(outputPath);
    
    const downloadResponse = await axios({
      method: 'get',
      url: initialResponse.data.url,
      responseType: 'stream',
      headers: initialResponse.data.headers || {}
    });
    
    const totalBytes = parseInt(downloadResponse.headers['content-length'] || 0);
    let bytesDownloaded = 0;
    
    downloadResponse.data.on('data', (chunk) => {
      bytesDownloaded += chunk.length;
      
      if (totalBytes > 0) {
        const now = Date.now();
        const percentage = (bytesDownloaded / totalBytes) * 100;
        
        if (now - lastUpdateTime > PROGRESS_UPDATE_TIME_THRESHOLD || 
            Math.abs(percentage - lastPercentage) > PROGRESS_PERCENTAGE_CHANGE_THRESHOLD || 
            percentage >= 99.5) {
          
          const downloadedMB = (bytesDownloaded / 1024 / 1024).toFixed(2);
          const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
          const percentageFormatted = percentage.toFixed(2);
          const bar = progressBar(percentage);
          
          const currentClient = client;
          const currentChannelId = statusMessage ? statusMessage.channelId : null;
          const currentMessageId = statusMessage ? statusMessage.id : null;
          const currentTitle = '🔄 Cobalt Letöltés Folyamatban';
          const currentDescription = `Letöltés: ${bar} ${percentageFormatted}%\n(${downloadedMB}MB / ${totalMB}MB)`;
          const currentColor = '#0099ff';

          // console.log(`[DEBUG][CobaltDownloader][DataEvent] Preparing to call updateStatusEmbed. currentClient: ${currentClient ? 'Exists' : 'N/A'}, currentChannelId: ${currentChannelId || 'N/A'}, currentMessageId: ${currentMessageId || 'N/A'}`);
          
          // updateStatusEmbed(
          //   currentClient,
          //   currentChannelId,
          //   currentMessageId,
          //   currentTitle,
          //   currentDescription,
          //   currentColor
          // ).catch(e => console.warn('[CobaltDownloader] Failed to update progress embed (data event):', e));

          process.nextTick(() => {
            console.log(`[DEBUG][CobaltDownloader][DataEvent][nextTick] Calling updateStatusEmbed. Client: ${currentClient ? 'Exists' : 'N/A'}, ChannelID: ${currentChannelId || 'N/A'}, MessageID: ${currentMessageId || 'N/A'}`);
            updateStatusEmbed(currentClient, currentChannelId, currentMessageId, currentTitle, currentDescription, currentColor)
              .catch(e => console.warn('[CobaltDownloader] Failed to update progress embed (data event - nextTick):', e));
          });

          lastUpdateTime = now;
          lastPercentage = percentage;
        }
      }
    });
    
    return new Promise((resolve, reject) => {
      downloadResponse.data.pipe(writer);
      writer.on('finish', () => {
        // Ensure 100% progress is shown upon completion
        if (lastPercentage < 100 && totalBytes > 0) {
          const downloadedMB = (totalBytes / 1024 / 1024).toFixed(2);
          const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
          const bar = progressBar(100);
          // Fire-and-forget for UI update
          updateStatusEmbed(
            client, statusMessage.channelId, statusMessage.id,
            '🔄 Cobalt Letöltés', 
            `Letöltés befejezve!\n\n${bar} 100.00%\n${downloadedMB}MB / ${totalMB}MB`,
            '#00ff00' // Green color for completion
          ).catch(e => console.warn('[CobaltDownloader] Failed to update progress embed (finish event):', e));
          lastPercentage = 100; // Update lastPercentage to reflect this final update
        }
        console.log(`[DEBUG] Cobalt download completed: ${outputPath}`);
        resolve(true);
      });
      writer.on('error', (err) => {
        console.error(`[DEBUG] Cobalt download error:`, err);
        fs.unlink(outputPath, () => {}); // Clean up partial file
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error with Cobalt download:', error.message);
    // Attempt to get more details from Axios error
    if (error.response && error.response.data) {
        // Check if the error.response.data itself is the Cobalt error structure
        if (error.response.data.status === 'error' && error.response.data.error) {
            let axiosErrorMessage = 'Cobalt API error via Axios:';
            axiosErrorMessage += ` Code: ${error.response.data.error.code}`;
            if (error.response.data.error.text) {
                 axiosErrorMessage += ` Message: ${error.response.data.error.text}`;
            }
            if (error.response.data.error.context) {
                axiosErrorMessage += ` Context: ${JSON.stringify(error.response.data.error.context)}`;
            }
            console.error(axiosErrorMessage, error.response.data);
        } else {
            // Generic Axios error data logging
            console.error('Cobalt Axios Response Error Data:', error.response.data);
        }
        console.error('Cobalt Axios Response Status:', error.response.status);
    }
    return false;
  }
}

// Function to check if the URL is for multiple Instagram images/videos
async function isInstagramCollection(url) {
  try {
    // This is a simple check; Cobalt's 'picker' response is more definitive.
    return url.includes('instagram.com/p/') || url.includes('instagram.com/reel/');
  } catch (error) {
    console.error('Error checking if Instagram collection:', error);
    return false;
  }
}

// Function to handle Instagram collections with Cobalt
async function handleInstagramCollection(url, statusMessage, client) {
  console.log(`[DEBUG] Handling Instagram collection: ${url}`);
  const tempDir = path.join(__dirname, '..', TEMP_DIR_NAME); // Ensure tempDir is correctly pathed

  try {
    await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Instagram Gyűjtemény', 'Instagram gyűjtemény feldolgozása...', '#ffaa00');
    
    const initialResponse = await axios.post(COBALT_API_ENDPOINT, {
      url: url,
      videoQuality: 'max',
      audioFormat: 'best',
      filenameStyle: 'basic',
      downloadMode: 'auto', // Cobalt will decide if it needs picker
      // Other params as before
      youtubeVideoCodec: 'h264',
      alwaysProxy: false, // Typically not needed for Instagram, but can be true
      disableMetadata: false,
      tiktokFullAudio: true,
      tiktokH265: false,
      twitterGif: true,
      youtubeHLS: false
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log('[DEBUG] Cobalt API response for Instagram collection:', initialResponse.data);

    if (!initialResponse.data) {
        console.error('Cobalt API (Insta Collection) did not return valid data', initialResponse.data);
        return { success: false, error: 'No data from Cobalt' };
    }

    if (initialResponse.data.status === 'error') {
        let errorMessage = 'Cobalt API (Insta Collection) returned an error.';
        if (initialResponse.data.error) {
            errorMessage += ` Code: ${initialResponse.data.error.code}`;
            if (initialResponse.data.error.text) {
                errorMessage += ` Message: ${initialResponse.data.error.text}`;
            }
            if (initialResponse.data.error.context) {
                errorMessage += ` Context: ${JSON.stringify(initialResponse.data.error.context)}`;
            }
        } else if (initialResponse.data.text) {
            errorMessage += ` Message: ${initialResponse.data.text}`;
        }
        console.error(errorMessage, initialResponse.data);
        return { success: false, error: initialResponse.data.error ? (initialResponse.data.error.text || initialResponse.data.error.code) : initialResponse.data.text || 'Unknown Cobalt error' };
    }
    
    // Handle 'picker' for collections
    if (initialResponse.data.status === 'picker' && 
        initialResponse.data.picker && 
        initialResponse.data.picker.length > 0) {
      
      await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Instagram Gyűjtemény', 
        `${initialResponse.data.picker.length} elem található a gyűjteményben. Letöltés kezdése...`, '#ffaa00');
      
      const timestamp = Date.now();
      const downloadedFiles = [];
      
      for (let i = 0; i < initialResponse.data.picker.length; i++) {
        const item = initialResponse.data.picker[i];
        
        let fileExtension = '.mp4'; // Default
        if (item.type === 'photo') {
          fileExtension = '.jpg';
        } else if (item.type === 'gif') {
          fileExtension = '.gif';
        } else if (item.type === 'video') {
           fileExtension = '.mp4';
        }
        // Use item.filename if available to get a better name/extension
        const filename = item.filename || `instagram-${timestamp}-${i+1}${fileExtension}`;
        const itemOutputPath = path.join(tempDir, filename);
        
        await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Instagram Gyűjtemény', 
          `${i+1}/${initialResponse.data.picker.length} elem letöltése... (${item.type || 'media'})`, '#ffaa00');
        
        try {
          // For picker items, the URL is directly the download URL
          const itemResponse = await axios({
            method: 'get',
            url: item.url, 
            responseType: 'stream'
          });
          
          const writer = fs.createWriteStream(itemOutputPath);
          itemResponse.data.pipe(writer);
          
          await new Promise((resolveItem, rejectItem) => {
            writer.on('finish', () => {
              // TODO: Consider if a 100% update is needed here per item if not already shown.
              // For now, the main status update is for the collection progress (e.g., "2/5 elem letöltése")
              // A specific 100% for each item might be too verbose during collection download.
              resolveItem();
            });
            writer.on('error', (err) => {
                fs.unlink(itemOutputPath, () => {}); // Clean up partial file
                rejectItem(err);
            });
          });
          
          downloadedFiles.push(itemOutputPath);
          console.log(`Downloaded item ${i+1} (${item.type}) as ${filename}: ${itemOutputPath}`);
        } catch (error) {
          console.error(`Error downloading Instagram item ${i+1} from ${item.url}:`, error.message);
          // Optionally, push an error object or skip the file
        }
      }
      
      return { 
        success: downloadedFiles.length > 0, 
        files: downloadedFiles,
        isCollection: true
      };

    } else if (initialResponse.data.status === 'tunnel' || initialResponse.data.status === 'redirect' || initialResponse.data.status === 'stream') {
      // Single item, proceed with normal download logic (though this might be a bit redundant if called from downloadWithCobalt)
      // This path implies that the URL was not a collection initially, or Cobalt resolved it to a single stream.
      const timestamp = Date.now();
      let fileExtension = '.mp4'; 
      if (initialResponse.data.filename) {
        const responseExtension = path.extname(initialResponse.data.filename);
        if (responseExtension) fileExtension = responseExtension;
      } else if (initialResponse.data.type === 'photo') {
        fileExtension = '.jpg';
      } else if (initialResponse.data.type === 'gif') {
        fileExtension = '.gif';
      }

      const singleItemFilename = initialResponse.data.filename || `instagram-single-${timestamp}${fileExtension}`;
      const outputPath = path.join(tempDir, singleItemFilename);
      console.log(`Single Instagram item download. Type: ${initialResponse.data.type || 'N/A'}, Filename: ${singleItemFilename}`);
      
      // Re-use downloadWithCobalt logic here for a single stream, but it needs the *original* Cobalt response URL.
      // This part might need adjustment. For now, assuming we directly download.
      const writer = fs.createWriteStream(outputPath);
      const downloadResponse = await axios({
        method: 'get',
        url: initialResponse.data.url, // This is the direct download link from Cobalt's response
        responseType: 'stream',
        headers: initialResponse.data.headers || {}
      });

      // For this direct download, we should also implement the 100% jump.
      // However, this section currently lacks its own progress tracking variables (lastPercentage, totalBytes for THIS stream)
      // To do this properly, it would need its own `totalBytes`, `bytesDownloaded`, `lastPercentage` local to this scope.
      // For now, this part does not have granular progress updates, so a jump to 100% is less critical here
      // compared to the main downloadWithCobalt function which has progress. The collection handler focuses on item counts.
      
      await new Promise((resolve, reject) => {
        downloadResponse.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => {
            fs.unlink(outputPath, () => {});
            reject(err);
        });
      });
      
      return {
        success: true,
        files: [outputPath],
        isCollection: false // Or based on initial intent
      };
    }
    
    console.error('Cobalt API returned an unexpected status for Instagram collection:', initialResponse.data.status);
    return { success: false, error: `Unexpected Cobalt status: ${initialResponse.data.status}` };

  } catch (error) {
    console.error('Error with Cobalt Instagram collection download:', error.message);
    if (error.response && error.response.data) {
        if (error.response.data.status === 'error' && error.response.data.error) {
            let axiosErrorMessage = 'Cobalt API error (Insta Collection) via Axios:';
            axiosErrorMessage += ` Code: ${error.response.data.error.code}`;
            if (error.response.data.error.text) {
                 axiosErrorMessage += ` Message: ${error.response.data.error.text}`;
            }
            if (error.response.data.error.context) {
                axiosErrorMessage += ` Context: ${JSON.stringify(error.response.data.error.context)}`;
            }
            console.error(axiosErrorMessage, error.response.data);
            return { success: false, error: error.response.data.error ? (error.response.data.error.text || error.response.data.error.code) : 'Unknown Cobalt error via Axios' };
        } else {
            console.error('Cobalt (Insta Collection) Axios Response Error Data:', error.response.data);
        }
        console.error('Cobalt (Insta Collection) Axios Response Status:', error.response.status);
        return { success: false, error: error.response.data.text || error.message || 'Cobalt Axios error' };
    }
    return { success: false, error: error.message || 'Unknown error in Cobalt collection handling' };
  }
}

module.exports = {
  downloadWithCobalt,
  isInstagramCollection,
  handleInstagramCollection
}; 