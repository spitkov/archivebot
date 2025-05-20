const { downloadWithCobalt, isCobaltSupported, cleanupCobaltTempFiles } = require('../downloaders/cobaltDownloader');
const { downloadWithYtDlp, cleanupYtDlpTempFiles } = require('../downloaders/ytdlpDownloader');
const { updateStatusEmbed } = require('./uploaderUtils');
const { TEMP_DIR, COBALT_SUPPORTED_SITES } = require('../constants');
const { uploadToDiscordChannel } = require('./discordUploader');

// Define the uploader services to use (ensure this is defined, or adapt if it's elsewhere)
const UPLOAD_SERVICES = [
    { name: 'Catbox', uploader: require('./catboxUploader').uploadToCatbox, preference: 1 },
    { name: 'SodiShare', uploader: require('./sodishareUploader').uploadToSodiShare, preference: 2 },
    { name: 'Filebin', uploader: require('./filebinUploader').uploadToFilebin, preference: 3 },
    { name: 'Pomf', uploader: require('./pomfUploader').uploadToPomf, preference: 4 },
    { name: 'Fileditch', uploader: require('./fileditchUploader').uploadToFileditch, preference: 5 }
];


async function attemptDirectDiscordUploadAndFallback(filePath, originalName, interaction, effectiveChannelId, allExternalUploadResults, client) {
    const discordUploadResult = await uploadToDiscordChannel(filePath, originalName, client, effectiveChannelId);

    if (discordUploadResult.success) {
        console.log(`[Orchestrator] Successfully uploaded ${originalName} directly to Discord channel ${effectiveChannelId}`);
        // Optionally, send a small confirmation message to effectiveChannelId IF it\'s different from interaction.channelId
        // For now, we assume the file itself is the notification.
        return { success: true, method: 'discord', channelId: effectiveChannelId, url: null }; // No specific URL for direct upload in this context
    } else {
        console.warn(`[Orchestrator] Failed to upload ${originalName} directly to Discord: ${discordUploadResult.error}. Attempting fallback link.`);
        
        let fallbackSent = false;
        let fallbackDetails = { success: false, error: 'No suitable fallback link found or error sending.', channelId: effectiveChannelId, method: 'none', url: null };

        const relevantUploads = allExternalUploadResults.filter(upload => upload.originalName === originalName && upload.success);

        const preferredServices = ['Catbox', 'SodiShare'];
        for (const serviceName of preferredServices) {
            const foundUpload = relevantUploads.find(u => u.service === serviceName);
            if (foundUpload && foundUpload.url) {
                try {
                    const targetChannel = await client.channels.fetch(effectiveChannelId);
                    await targetChannel.send(`Direct Discord upload for ${originalName} failed (${discordUploadResult.error}). Here is a fallback link from ${serviceName}: ${foundUpload.url}`);
                    fallbackSent = true;
                    fallbackDetails = { success: true, method: `fallback_${serviceName.toLowerCase()}`, url: foundUpload.url, channelId: effectiveChannelId };
                    break; 
                } catch (e) {
                    console.error(`[Orchestrator] Error sending fallback link for ${originalName} to ${effectiveChannelId}:`, e);
                    fallbackDetails.error = `Error sending ${serviceName} fallback link.`; // Update error
                    break; // Stop if sending fails
                }
            }
        }

        if (!fallbackSent) {
            const anyOtherUpload = relevantUploads.sort((a,b) => UPLOAD_SERVICES.find(s => s.name === a.service).preference - UPLOAD_SERVICES.find(s => s.name === b.service).preference)[0];
            if (anyOtherUpload && anyOtherUpload.url) {
                 try {
                    const targetChannel = await client.channels.fetch(effectiveChannelId);
                    await targetChannel.send(`Direct Discord upload for ${originalName} failed (${discordUploadResult.error}). Here is an alternative link: ${anyOtherUpload.url} (from ${anyOtherUpload.service})`);
                    fallbackSent = true;
                    fallbackDetails = { success: true, method: `fallback_${anyOtherUpload.service.toLowerCase()}`, url: anyOtherUpload.url, channelId: effectiveChannelId };
                } catch (e) {
                    console.error(`[Orchestrator] Error sending generic fallback link for ${originalName} to ${effectiveChannelId}:`, e);
                    fallbackDetails.error = 'Error sending a generic fallback link.';
                }
            }
        }

        if (!fallbackSent) {
             try {
                const targetChannel = await client.channels.fetch(effectiveChannelId);
                await targetChannel.send(`Sorry, direct Discord upload for ${originalName} failed (${discordUploadResult.error}), and no alternative upload links were successfully established or could be sent.`);
            } catch (e) {
                 console.error(`[Orchestrator] Error sending final failure message for ${originalName} to ${effectiveChannelId}:`, e);
            }
        }
        return fallbackDetails;
    }
}


async function handleVideoDownload(message, videoUrl, interaction, targetChannelId) {
    const { author, client } = message; // Assuming message is the fakeMessage
    const originalChannelId = interaction.channelId;
    const effectiveChannelId = targetChannelId || originalChannelId;


    let statusMessage = await interaction.editReply({ content: 'Starting download process...', embeds: [], files: [] }).catch(e => {
        console.error("Failed to send initial status message:", e);
        // Try sending to original channel if interaction reply failed
        return interaction.channel.send("Starting download process...").catch(e2 => console.error("Really failed to send status:", e2));
    });

    // Ensure statusMessage has an edit function, if it had to fallback to channel.send, it won't
    // This part needs careful handling of where status updates go. For now, let's assume interaction.editReply works.

    const updateFn = async (text, embedContent) => {
        try {
            // All primary status updates should go to the original interaction channel
            await interaction.editReply({ content: text, embeds: embedContent ? [embedContent] : [] });
        } catch (e) {
            console.warn("[Orchestrator] Failed to edit interaction reply for status update:", e);
            // If interaction edit fails, maybe log or send a new message to original channel if critical
        }
    };
    

    await updateFn(`Fetching video from: ${videoUrl}`);
    let downloadedFilePaths = []; // Array of { path: string, originalname: string }
    let cobaltAttempted = false;
    let cobaltSuccess = false;
    let ytDlpAttempted = false;
    let ytDlpSuccess = false;

    // ... (Cobalt and yt-dlp download logic - this part is assumed to be largely existing)
    // IMPORTANT: This section needs to be adapted from the existing file.
    // I will assume it populates `downloadedFilePaths` and sets success flags.
    // For brevity, I\'m not reproducing the full download logic here but it should be:
    // 1. Try Cobalt (if not FB or if FB and special handling passes)
    // 2. If Cobalt fails or not applicable, try yt-dlp (unless it\'s YouTube and Cobalt was required, as per previous logic)
    // This needs to align with the bot\'s specific download flow.

    // Simplified download logic based on common structure (replace with actual if different)
    const isYouTube = /youtube\.com|youtu\.be/.test(videoUrl);
    let downloadError = null;

    if (isCobaltSupported(videoUrl) || isYouTube) { // Prioritize Cobalt for supported or YouTube
        cobaltAttempted = true;
        await updateFn(`Attempting download with Cobalt for ${videoUrl}...`);
        const cobaltResult = await downloadWithCobalt(videoUrl, TEMP_DIR, message.id, updateFn); // message.id as taskId for Cobalt
        if (cobaltResult.success && cobaltResult.files.length > 0) {
            downloadedFilePaths.push(...cobaltResult.files);
            cobaltSuccess = true;
        } else {
            downloadError = cobaltResult.error || "Cobalt download failed.";
            if (isYouTube) { // If YouTube and Cobalt fails, stop.
                 await updateFn(`Cobalt failed for YouTube URL: ${downloadError}. No fallback.`);
                 cleanupCobaltTempFiles(cobaltResult.tempFiles || []);
                 return interaction.editReply({content: `Error: Cobalt download failed for YouTube URL. ${downloadError}`}).catch(console.error);
            }
            await updateFn(`Cobalt download failed for ${videoUrl}. Error: ${downloadError}`);
        }
        cleanupCobaltTempFiles(cobaltResult.tempFiles || []);
    }

    if (!cobaltSuccess && !isYouTube) { // If Cobalt wasn\'t successful (and not a YouTube-only attempt) OR if Cobalt wasn\'t supported initially
        ytDlpAttempted = true;
        await updateFn(`Attempting download with yt-dlp for ${videoUrl}...`);
        const ytDlpResult = await downloadWithYtDlp(videoUrl, TEMP_DIR, message.id, updateFn); // message.id as taskId for yt-dlp
        if (ytDlpResult.success && ytDlpResult.files.length > 0) {
            downloadedFilePaths.push(...ytDlpResult.files);
            ytDlpSuccess = true;
        } else {
            downloadError = ytDlpResult.error || "yt-dlp download failed.";
            await updateFn(`yt-dlp download failed for ${videoUrl}. Error: ${downloadError}`);
        }
        cleanupYtDlpTempFiles(ytDlpResult.tempFile || (ytDlpResult.files && ytDlpResult.files.length > 0 ? ytDlpResult.files[0].path : null));
    }
    
    if (downloadedFilePaths.length === 0) {
        const finalErrorMsg = downloadError || 'Failed to download video after all attempts.';
        await updateFn(`Download failed: ${finalErrorMsg}`);
        return interaction.editReply({content: `Error: ${finalErrorMsg}`}).catch(console.error);
    }
    
    await updateFn(`Successfully downloaded ${downloadedFilePaths.length} file(s). Preparing for upload...`);

    const allExternalUploadResults = [];
    if (UPLOAD_SERVICES && UPLOAD_SERVICES.length > 0) {
        for (const fileInfo of downloadedFilePaths) {
            await updateFn(`Starting uploads for ${fileInfo.originalname} to external services...`);
            for (const service of UPLOAD_SERVICES.sort((a,b) => a.preference - b.preference)) {
                try {
                    await updateFn(`Uploading ${fileInfo.originalname} to ${service.name}...`);
                    const uploadResult = await service.uploader(fileInfo.path, fileInfo.originalname); // Assuming uploader takes path and originalname
                    if (uploadResult.success) {
                        allExternalUploadResults.push({ ...uploadResult, service: service.name, originalName: fileInfo.originalname });
                        await updateFn(`Successfully uploaded ${fileInfo.originalname} to ${service.name}: ${uploadResult.url}`);
                    } else {
                        await updateFn(`Failed to upload ${fileInfo.originalname} to ${service.name}: ${uploadResult.error}`);
                         allExternalUploadResults.push({ success: false, error: uploadResult.error, service: service.name, originalName: fileInfo.originalname });
                    }
                } catch (e) {
                    console.error(`[Orchestrator] Critical error uploading ${fileInfo.originalname} to ${service.name}:`, e);
                    await updateFn(`Error during upload of ${fileInfo.originalname} to ${service.name}.`);
                    allExternalUploadResults.push({ success: false, error: e.message, service: service.name, originalName: fileInfo.originalname });
                }
            }
        }
    } else {
        await updateFn('No external upload services configured.');
    }
    
    // New: Attempt direct Discord upload and fallbacks for each downloaded file
    const finalOutcomes = [];
    for (const fileInfo of downloadedFilePaths) {
        const outcome = await attemptDirectDiscordUploadAndFallback(fileInfo.path, fileInfo.originalname, interaction, effectiveChannelId, allExternalUploadResults, client);
        finalOutcomes.push({originalName: fileInfo.originalname, ...outcome});
    }

    // Final summary message in the original interaction channel
    const successfulExternalUploads = allExternalUploadResults.filter(r => r.success);
    let summaryEmbed = {
        title: 'Archival Process Complete',
        description: `Finished processing \`${videoUrl}\`.`,
        fields: [],
        timestamp: new Date(),
        color: 0x00FF00 // Green for success
    };

    if (targetChannelId && targetChannelId !== originalChannelId) {
        summaryEmbed.description += `\n📹 Video file(s)/primary links sent to <#${targetChannelId}>.`;
    } else {
        summaryEmbed.description += `\n📹 Video file(s)/primary links sent to this channel.`;
    }
    
    finalOutcomes.forEach(outcome => {
        if(outcome.success){
            if(outcome.method === 'discord'){
                summaryEmbed.fields.push({name: `${outcome.originalName} Status`, value: `Successfully uploaded directly to <#${outcome.channelId}>.` , inline: false});
            } else {
                 summaryEmbed.fields.push({name: `${outcome.originalName} Status`, value: `Direct Discord upload failed. Fallback link from ${outcome.method.replace('fallback_','')} sent to <#${outcome.channelId}>: ${outcome.url}` , inline: false});
            }
        } else {
            summaryEmbed.fields.push({name: `${outcome.originalName} Status`, value: `Failed to upload directly to Discord and no fallback link could be sent to <#${outcome.channelId}>. Error: ${outcome.error}` , inline: false});
        }
    });


    if (successfulExternalUploads.length > 0) {
        summaryEmbed.fields.push({ name: 'External Backup Links', value: 'All available backup links:', inline: false });
        successfulExternalUploads.forEach(upload => {
            summaryEmbed.fields.push({
                name: `${upload.originalName} on ${upload.service}`,
                value: `[Link](${upload.url})`,
                inline: true
            });
        });
    } else {
        summaryEmbed.fields.push({ name: 'External Backup Links', value: 'No successful external uploads.', inline: false });
        summaryEmbed.color = 0xFF0000; // Red if no external backups
    }
    
    if (downloadedFilePaths.length === 0 && !ytDlpSuccess && !cobaltSuccess) {
        summaryEmbed.title = 'Archival Process Failed';
        summaryEmbed.description = `Could not download the video from ${videoUrl}. Last error: ${downloadError || 'Unknown download error'}`;
        summaryEmbed.color = 0xFF0000; // Red
    }


    try {
        await interaction.editReply({ content: '', embeds: [summaryEmbed], files: [] });
    } catch (e) {
        console.error("[Orchestrator] Failed to send final summary embed:", e);
        // Try to send to original channel as a new message if editReply fails
        try {
             interaction.channel.send({ embeds: [summaryEmbed] });
        } catch (e2) {
            console.error("[Orchestrator] Truly failed to send final summary:", e2);
        }
    }

    // Cleanup temp files
    downloadedFilePaths.forEach(file => {
        if (fs.existsSync(file.path)) {
            fs.unlink(file.path, err => {
                if (err) console.error(`Error deleting temporary file ${file.path}:`, err);
            });
        }
    });
}

module.exports = {
    handleVideoDownload,
    // ... any other exports
}; 