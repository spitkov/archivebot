const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('./configManager');
const { TEMP_DIR_NAME, COBALT_SUPPORTED_SITES } = require('./constants');
const { updateStatusEmbed } = require('./uploaders/uploaderUtils');
const { downloadWithCobalt, isInstagramCollection, handleInstagramCollection } = require('./downloaders/cobaltDownloader');
const { downloadWithYtDlp } = require('./downloaders/ytdlpDownloader');
const { uploadToCatbox } = require('./uploaders/catboxUploader');
const { uploadToFilebin } = require('./uploaders/filebinUploader');
const { uploadToPomfWithCurl } = require('./uploaders/pomfUploader');
const { uploadToFileditch } = require('./uploaders/fileditchUploader');
const { uploadToSodiShare } = require('./uploaders/sodishareUploader');
const { uploadToDiscord } = require('./uploaders/discordUploader');

// Ensure the temporary directory exists
const tempDir = path.join(__dirname, TEMP_DIR_NAME);
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Global tracking for progress UI (to be managed within specific downloaders eventually)
// For now, keeping it here for the orchestrator's high-level view if needed, but primarily for passage.
let lastUpdateTime = 0;

function generateProgressDescription(uploaderStates, fileBaseName, fileSizeMB, fileIndexStr, stage = 'uploading') {
    let description = '';
    if (stage === 'downloaded') {
        description = `Letöltve: ${fileBaseName} (${fileSizeMB}MB)${fileIndexStr}. Feltöltés indul...\n\nSzolgáltatók:\n`;
    } else { // uploading or individual uploader update
        description = `Fájl${fileIndexStr}: ${fileBaseName} (${fileSizeMB}MB)\n\nFeltöltési állapot:\n`;
    }

    uploaderStates.forEach(uploader => {
        let statusIcon = '⏳'; // Pending
        let resultText = '';
        if (uploader.status === 'uploading') {
            statusIcon = '🔄'; // Uploading
        } else if (uploader.status === 'success') {
            statusIcon = '✅';
            resultText = ` -> ${uploader.resultUrl}`;
        } else if (uploader.status === 'failed') {
            statusIcon = '❌';
            resultText = ` - Hiba: ${uploader.error || 'Ismeretlen hiba'}`;
        } else if (uploader.status === 'skipped') {
            statusIcon = '⏩';
            resultText = ` - Kihagyva (méretkorlát: ${uploader.limitMB}MB)`;
        }
        description += `${statusIcon} ${uploader.name}${resultText}\n`;
    });
    return description;
}

async function handleVideoDownload(client, message, isSlashCommand = false, providedUrl = null, explicitTargetChannelId = null) {
    console.log(`[DEBUG][Orchestrator] handleVideoDownload invoked. Initial providedUrl: "${providedUrl}"`);
    let downloadedFilePaths = []; // Declare here
    console.log(`[DEBUG][Orchestrator] handleVideoDownload called. isSlashCommand=${isSlashCommand}, hasProvidedUrl=${!!providedUrl}, explicitTarget=${explicitTargetChannelId}`);
    console.log(`[DEBUG][Orchestrator] Original message content: "${message.content}"`);

    let contentToCheck = providedUrl;
    if (!contentToCheck) {
        contentToCheck = message.content.replace(/^\/(?:letoltes|archive)\s*/, '').trim();
        console.log(`[DEBUG][Orchestrator] Content to check after command removal: "${contentToCheck}"`);

        if (message.reference && message.reference.messageId) {
            console.log(`[DEBUG][Orchestrator] Message is a reply.`);
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                console.log(`[DEBUG][Orchestrator] Replied message content: "${repliedMessage.content}"`);
                if (isSlashCommand && (!contentToCheck || contentToCheck.startsWith('/'))) {
                    // If slash command had no URL, or its content is another command, use replied message.
                    contentToCheck = repliedMessage.content;
                } else if (repliedMessage.content) {
                    // Append if there was initial content, otherwise just use replied.
                    contentToCheck = contentToCheck ? `${contentToCheck} ${repliedMessage.content}` : repliedMessage.content;
                }
                console.log(`[DEBUG][Orchestrator] Updated content to check after reply: "${contentToCheck}"`);
            } catch (error) {
                console.error('[DEBUG][Orchestrator] Failed to fetch replied message:', error);
                // Potentially notify user if fetching reply is critical and fails
            }
        }
    }

    // Clean content: remove custom emojis, trim
    const cleanedContent = contentToCheck.replace(/<:[^:]+:[0-9]+>/g, '').trim();
    if (cleanedContent !== contentToCheck) {
        console.log(`[DEBUG][Orchestrator] Cleaned content: "${cleanedContent}"`);
    }

    const urlMatch = cleanedContent.match(/https?:\/\/[^\s<>"]+/g);

    if (!urlMatch || urlMatch.length === 0) {
        console.log('[DEBUG][Orchestrator] No URL found in message.');
        if (isSlashCommand || message.channel.type === 'DM') { // Only auto-reply if it was a direct command or DM
            try {
                await message.reply('❌ Nem található videó URL az üzenetben!');
            } catch (e) { console.error("Failed to send 'no URL' reply", e); }
        }
        return;
    }

    const videoUrl = urlMatch[0];
    console.log(`[DEBUG][Orchestrator] URL found: ${videoUrl}`);

    const processingEmbed = new EmbedBuilder()
        .setTitle('🔄 Videó Letöltése')
        .setDescription(`URL: ${videoUrl}\n\nA videó feldolgozás alatt...`)
        .setColor('#ffaa00')
        .setFooter({ text: 'Videó Archíváló Bot' });

    // Reply handling: if it's a slash command, it has deferReply and editReply.
    // If it's a regular message, it has reply.
    let statusMessage;
    try {
        if (isSlashCommand || (message.interaction && message.interaction.deferred)) {
            statusMessage = await message.editReply({ embeds: [processingEmbed] });
        } else {
            statusMessage = await message.reply({ embeds: [processingEmbed] });
        }
    } catch (replyError) {
        console.error('[DEBUG][Orchestrator] Failed to send initial processing message:', replyError);
        // If we can't even send the first status, we probably can't continue updating it.
        return; 
    }
    // Attach the status message to the original message object for easy access by uploaders
    message.statusMessage = statusMessage; 

    try {
        const timestamp = Date.now();
        let cobaltAttempted = false;
        let cobaltSuccess = false;

        // 1. Determine Download Strategy (Cobalt for Instagram collections / supported, else yt-dlp)
        const isInsta = await isInstagramCollection(videoUrl);
        if (isInsta) {
            console.log(`[DEBUG][Orchestrator] URL is Instagram: ${videoUrl}. Attempting Cobalt collection handler.`);
            cobaltAttempted = true;
            const instaResult = await handleInstagramCollection(videoUrl, statusMessage);
            if (instaResult.success && instaResult.files && instaResult.files.length > 0) {
                downloadedFilePaths = instaResult.files;
                cobaltSuccess = true;
                console.log(`[DEBUG][Orchestrator] Instagram collection download successful via Cobalt. Files: ${downloadedFilePaths.join(', ')}`);
            } else {
                console.log('[DEBUG][Orchestrator] Cobalt Instagram collection handler failed or returned no files. Error: ', instaResult.error);
                // Do not immediately fall back to yt-dlp for collections if Cobalt failed, 
                // as yt-dlp might not handle them as well or as intended by picker.
                // However, if it wasn't a picker scenario, a fallback might be considered.
            }
        } else if (COBALT_SUPPORTED_SITES.some(site => videoUrl.includes(site))) {
            console.log(`[DEBUG][Orchestrator] URL is supported by Cobalt (not Instagram collection): ${videoUrl}. Attempting Cobalt single download.`);
            cobaltAttempted = true;
            const tempCobaltPath = path.join(tempDir, `video-cobalt-${timestamp}.mp4`); // Generic name for Cobalt single download
            const cobaltSingleSuccess = await downloadWithCobalt(videoUrl, tempCobaltPath, statusMessage);
            if (cobaltSingleSuccess && fs.existsSync(tempCobaltPath)) {
                downloadedFilePaths = [tempCobaltPath];
                cobaltSuccess = true;
                console.log(`[DEBUG][Orchestrator] Single video download successful via Cobalt: ${tempCobaltPath}`);
            } else {
                console.log('[DEBUG][Orchestrator] Cobalt single download failed.');
                if (fs.existsSync(tempCobaltPath)) fs.unlinkSync(tempCobaltPath); // Clean up if exists but failed
            }
        }

        // 2. Fallback to yt-dlp if Cobalt was not applicable, not attempted, or failed for non-collection scenarios
        if (!cobaltSuccess && (!cobaltAttempted || (cobaltAttempted && !isInsta))) {
            console.log(`[DEBUG][Orchestrator] Cobalt failed or not applicable. Falling back to yt-dlp for: ${videoUrl}`);
            await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Előkészítése', 'Cobalt nem működött vagy nem volt megfelelő, próbálkozás yt-dlp-vel...', '#ffaa00');
            
            try {
                const ytdlpResult = await downloadWithYtDlp(videoUrl, statusMessage, timestamp, client);
                if (ytdlpResult.success && ytdlpResult.files && ytdlpResult.files.length > 0) {
                    downloadedFilePaths = ytdlpResult.files;
                    console.log(`[DEBUG][Orchestrator] yt-dlp download successful. Files: ${downloadedFilePaths.join(', ')}`);
                } else {
                    throw new Error(ytdlpResult.error || 'yt-dlp download failed to return files.');
                }
            } catch (ytdlpError) {
                console.error('[DEBUG][Orchestrator] yt-dlp download process failed:', ytdlpError.message);
                await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '❌ Hiba Történt', `yt-dlp letöltés sikertelen: ${ytdlpError.message}`, '#ff0000');
                return; // Stop if download fails
            }
        }

        if (!downloadedFilePaths || downloadedFilePaths.length === 0) {
            console.log('[DEBUG][Orchestrator] No files were downloaded.');
            throw new Error('Nem sikerült letölteni a videó(ka)t egyik módszerrel sem.');
        }

        // 3. Uploading Process
        const overallUploadResults = [];
        const discordUploadResults = [];
        const config = getConfig();

        // Define uploader services
        const uploaderServices = [
            { name: 'Catbox', uploadFunction: uploadToCatbox, limitMB: 200, status: 'pending', resultUrl: null, error: null },
            { name: 'Filebin', uploadFunction: uploadToFilebin, limitMB: 20000, status: 'pending', resultUrl: null, error: null }, // Filebin has a 20GB limit per file according to their site
            { name: 'Pomf', uploadFunction: uploadToPomfWithCurl, limitMB: 200, status: 'pending', resultUrl: null, error: null },
            { name: 'Fileditch', uploadFunction: uploadToFileditch, limitMB: 5000, status: 'pending', resultUrl: null, error: null }, // 5GB
            { name: 'SodiShare', uploadFunction: uploadToSodiShare, limitMB: Infinity, status: 'pending', resultUrl: null, error: null }
        ];

        for (let i = 0; i < downloadedFilePaths.length; i++) {
            const currentFile = downloadedFilePaths[i];
            const fileIndexStr = downloadedFilePaths.length > 1 ? ` (${i + 1}/${downloadedFilePaths.length})` : '';
            const fileSize = fs.statSync(currentFile).size;
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            console.log(`[DEBUG][Orchestrator] Uploading file${fileIndexStr}: ${currentFile} (${fileSizeMB}MB)`);

            const currentFileBaseName = path.basename(currentFile);
            // Correct way to deep copy while preserving functions and other non-JSON-stringify-safe types
            const currentFileUploaderStates = uploaderServices.map(service => ({ ...service })); 

            // Initial "Downloaded, starting uploads..." message with all uploaders listed as pending
            let initialUploadMessage = generateProgressDescription(currentFileUploaderStates, currentFileBaseName, fileSizeMB, fileIndexStr, 'downloaded');
            await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Feltöltése', initialUploadMessage, '#ffaa00');

            const fileSpecificResults = [];

            for (const uploader of currentFileUploaderStates) {
                if (fileSize <= uploader.limitMB * 1024 * 1024) {
                    uploader.status = 'uploading';
                    await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Feltöltése', generateProgressDescription(currentFileUploaderStates, currentFileBaseName, fileSizeMB, fileIndexStr), '#ffaa00');
                    
                    console.log(`[DEBUG][Orchestrator] Attempting upload to ${uploader.name} for ${currentFileBaseName}`);
                    const result = await uploader.uploadFunction(currentFile, statusMessage, fileIndexStr, client); // Pass client if uploader uses updateStatusEmbed
                    
                    if (result.success) {
                        uploader.status = 'success';
                        uploader.resultUrl = result.url;
                        console.log(`[DEBUG][Orchestrator] ${uploader.name} upload successful: ${result.url}`);
                    } else {
                        uploader.status = 'failed';
                        uploader.error = result.error;
                        console.error(`[DEBUG][Orchestrator] ${uploader.name} upload failed: ${result.error}`);
                    }
                    fileSpecificResults.push({ ...result, service: `${uploader.name}${fileIndexStr}`, file: currentFile, skipped: false });
                } else {
                    uploader.status = 'skipped';
                    uploader.error = `File too large (${fileSizeMB}MB > ${uploader.limitMB}MB)`;
                    console.log(`[DEBUG][Orchestrator] Skipping ${uploader.name} for ${currentFileBaseName} due to size limit.`);
                    fileSpecificResults.push({ service: `${uploader.name}${fileIndexStr}`, error: uploader.error, file: currentFile, skipped: true });
                }
                await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Feltöltése', generateProgressDescription(currentFileUploaderStates, currentFileBaseName, fileSizeMB, fileIndexStr), '#ffaa00');
            }
            
            overallUploadResults.push(...fileSpecificResults); 

            // Discord Upload (handled separately as it's primary and has fallback)
            const finalTargetChannelIdForDiscord = explicitTargetChannelId || config.channelMappings?.[message.channelId] || config.watchMappings?.[message.channelId];
            
            console.log(`[DEBUG][Orchestrator] Discord upload target evaluation: explicit=${explicitTargetChannelId}, messageChannel=${message.channelId}, mappedTarget=${finalTargetChannelIdForDiscord}`);

            const discordResult = await uploadToDiscord(client, finalTargetChannelIdForDiscord, message, currentFile, fileIndexStr, fileSpecificResults); // Pass fileSpecificResults for fallback
            discordUploadResults.push(discordResult);
        }

        // 4. Final Message Construction
        const successfulUploads = overallUploadResults.filter(r => r.success && r.url);
        const successfulDiscordUploads = discordUploadResults.filter(r => r.success && r.url);

        if (successfulUploads.length === 0 && successfulDiscordUploads.length === 0) {
            // Log all errors if all uploads failed
            overallUploadResults.forEach(res => {
                if (res.error) console.error(`[Orchestrator] Upload Error for ${res.service} on ${res.file}: ${res.error}`);
            });
            discordUploadResults.forEach(res => {
                if (res.error) console.error(`[Orchestrator] Discord Upload Error on ${res.file || 'unknown file'}: ${res.error}`);
            });
            throw new Error('Minden feltöltés sikertelen volt.');
        }

        let archiveDescription = `Eredeti Média URL: ${videoUrl}
`;
        const configData = getConfig(); // Ensure config is loaded, may already be as 'config'

        // Check if it's a message from a mapped channel (and not a slash command)
        if (!isSlashCommand && message.url && configData.channelMappings?.[message.channelId]) {
            archiveDescription += `Forrásüzenet: ${message.url}
`;
        } 
        // Check if it's a watched channel callback (using the structure from messageHandler)
        else if (message.reference && message.reference.messageUrl && message.reference.isWatchedCallback) { // Assumes 'isWatchedCallback' is added to fakeMessage
            archiveDescription += `Forrásüzenet (auto-figyelt): ${message.reference.messageUrl}
`;
        }
        // General reply case (if not covered by the specific cases above)
        else if (message.reference && message.reference.messageId) {
            archiveDescription += `(Válasz egy másik üzenetre - parancs URL: ${message.url})
`;
        }
        
        archiveDescription += `
Archivált verziók:
`;

        const hasImageFiles = downloadedFilePaths.some(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
        });

        if (hasImageFiles) {
            archiveDescription += `\n**Megjegyzés:** Néhány szolgáltatás (mint pl. Filebin) a képeket .mp4 kiterjesztéssel jelenítheti meg, de ezek valójában képfájlok. A letöltés után változtasd meg a kiterjesztést, ha szükséges.\n`;
        }

        // Group by file for multiple downloads (e.g., Instagram collections)
        if (downloadedFilePaths.length > 1) {
            for (let i = 0; i < downloadedFilePaths.length; i++) {
                const currentFile = downloadedFilePaths[i];
                const fileBaseName = path.basename(currentFile);
                archiveDescription += `\n**Fájl ${i + 1}/${downloadedFilePaths.length}: ${fileBaseName}**\n`;
                
                const uploadsForThisFile = overallUploadResults.filter(upload => upload.file === currentFile && upload.url);
                if (uploadsForThisFile.length > 0) {
                    archiveDescription += uploadsForThisFile.map(upload => {
                        const serviceName = upload.service.replace(/\s*\(\d+\/\d+\)$/, '').trim(); // Clean " (1/2)"
                        return `${serviceName}: ${upload.displayUrl || upload.url}`;
                    }).join('\n');
                } else {
                    archiveDescription += "Nem sikerült feltölteni ezt a fájlt külső szolgáltatásokra.";
                }
                archiveDescription += '\n';
            }
            // Add Discord links separately if they exist for collections
            if (successfulDiscordUploads.length > 0) {
                archiveDescription += `\n**Discord Linkek:**\n`;
                archiveDescription += successfulDiscordUploads.map((upload, idx) => {
                     // Try to associate with a file if possible, or just list them
                    const fileBaseName = upload.file ? path.basename(upload.file) : `Feltöltés ${idx + 1}`;
                    return `${fileBaseName}: ${upload.url}`;
                }).join('\n');
            }
        } else {
            // Single file download
            const uploadsForSingleFile = overallUploadResults.filter(upload => upload.url);
            if (uploadsForSingleFile.length > 0) {
                archiveDescription += uploadsForSingleFile.map(upload => `${upload.service}: ${upload.displayUrl || upload.url}`).join('\n');
            }
            if (successfulDiscordUploads.length > 0 && successfulDiscordUploads[0].url) {
                 archiveDescription += `\nDiscord: ${successfulDiscordUploads[0].url}`;
            } else if (uploadsForSingleFile.length === 0) {
                archiveDescription += "Nem sikerült feltölteni a fájlt.";
            }
        }
        
        archiveDescription += '\n\nKész!';

        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Videó Archiválva')
            .setDescription(archiveDescription)
            .setColor('#00ff00')
            .setFooter({ text: 'Videó Archíváló Bot' });

        await statusMessage.edit({ embeds: [successEmbed] });

    } catch (error) {
        console.error('[DEBUG][Orchestrator] Error during video processing pipeline:', error.message, error.stack);
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Hiba Történt')
            .setDescription(`Nem sikerült letölteni vagy feltölteni a videót: ${error.message}`)
            .setColor('#ff0000')
            .setFooter({ text: 'Videó Archíváló Bot' });
        try {
            await statusMessage.edit({ embeds: [errorEmbed] });
        } catch (editError) {
            console.error('[DEBUG][Orchestrator] Failed to edit message with final error embed:', editError);
        }
    } finally {
        // 5. Cleanup
        if (downloadedFilePaths && downloadedFilePaths.length > 0) {
            downloadedFilePaths.forEach(filePath => {
                if (fs.existsSync(filePath)) {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`[DEBUG][Orchestrator] Error cleaning up file ${filePath}:`, err);
                        else console.log(`[DEBUG][Orchestrator] Cleaned up temp file: ${filePath}`);
                    });
                }
            });
        }
        // Reset any global progress trackers if they were used by the orchestrator
        lastUpdateTime = 0; 
    }
}

module.exports = {
    handleVideoDownload
}; 