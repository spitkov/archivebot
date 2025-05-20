async function handleVideoDownload(message, videoUrl, interaction, targetChannelId) {
    const { author, client } = message; // Assuming message is the fakeMessage
    const originalChannelId = interaction.channelId;
    const effectiveChannelId = targetChannelId || originalChannelId;

    // Centralized logging for the URL being processed.
    console.log(`[Orchestrator] Processing URL: ${videoUrl} for original channel ${originalChannelId}, effective video channel ${effectiveChannelId}`);

    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
        console.error('[Orchestrator] Critical: No valid video URL provided to handleVideoDownload.');
        try {
            // interaction was already deferred in command file
            return await interaction.editReply({ content: 'Error: No video URL was specified or found.', ephemeral: true });
        } catch (e) {
            console.error("[Orchestrator] Failed to send error reply for missing URL:", e);
            return; // Stop execution
        }
    }

    // Remove any surrounding < > from the URL (common with Discord embeds)
    const cleanedUrl = videoUrl.replace(/<|>/g, '');
    const actualUrlToProcess = cleanedUrl; // Use this variable consistently hereafter

    let statusMessage = await interaction.editReply({ content: 'Starting download process...', embeds: [], files: [] }).catch(e => {
        console.error("Failed to send initial status message:", e);
        return interaction.channel.send("Starting download process...").catch(e2 => console.error("Really failed to send status:", e2));
    });

    const updateFn = async (text, embedContent) => {
        try {
            await interaction.editReply({ content: text, embeds: embedContent ? [embedContent] : [], files: [] });
        } catch (e) {
            console.warn("[Orchestrator] Failed to edit interaction reply for status update:", e);
        }
    };
    
    // Initial status update (interaction already deferred)
    // This replaces any earlier separate interaction.editReply for starting the process
    await updateFn(`Fetching video from: ${actualUrlToProcess}`);

    let downloadedFilePaths = []; 
    let cobaltAttempted = false;
    let cobaltSuccess = false;
    let ytDlpAttempted = false;
    let ytDlpSuccess = false;
    let downloadError = null;

    const isYouTube = /youtube\.com|youtu\.be/.test(actualUrlToProcess);

    if (isCobaltSupported(actualUrlToProcess) || isYouTube) { 
        cobaltAttempted = true;
        await updateFn(`Attempting download with Cobalt for ${actualUrlToProcess}...`);
        // Assuming message.id from fakeMessage is a suitable unique ID for downloader tasks
        const cobaltResult = await downloadWithCobalt(actualUrlToProcess, TEMP_DIR, message.id, updateFn);
        if (cobaltResult.success && cobaltResult.files.length > 0) {
            downloadedFilePaths.push(...cobaltResult.files);
            cobaltSuccess = true;
        } else {
            downloadError = cobaltResult.error || "Cobalt download failed.";
            if (isYouTube) { 
                 await updateFn(`Cobalt failed for YouTube URL: ${downloadError}. No fallback.`);
                 if (cobaltResult.tempFiles) cleanupCobaltTempFiles(cobaltResult.tempFiles);
                 return interaction.editReply({content: `Error: Cobalt download failed for YouTube URL. ${downloadError}`}).catch(console.error);
            }
            await updateFn(`Cobalt download failed for ${actualUrlToProcess}. Error: ${downloadError}`);
        }
        if (cobaltResult.tempFiles) cleanupCobaltTempFiles(cobaltResult.tempFiles);
    }

    if (!cobaltSuccess && !isYouTube) { 
        ytDlpAttempted = true;
        await updateFn(`Attempting download with yt-dlp for ${actualUrlToProcess}...`);
        const ytDlpResult = await downloadWithYtDlp(actualUrlToProcess, TEMP_DIR, message.id, updateFn); 
        if (ytDlpResult.success && ytDlpResult.files.length > 0) {
            downloadedFilePaths.push(...ytDlpResult.files);
            ytDlpSuccess = true;
        } else {
            downloadError = ytDlpResult.error || "yt-dlp download failed.";
            await updateFn(`yt-dlp download failed for ${actualUrlToProcess}. Error: ${downloadError}`);
        }
        // Ensure cleanup function is robust
        const pathForYtdlpCleanup = ytDlpResult.tempFile || (ytDlpResult.files && ytDlpResult.files.length > 0 ? ytDlpResult.files[0].path : null);
        if (pathForYtdlpCleanup) cleanupYtDlpTempFiles(pathForYtdlpCleanup);
    }
    
    if (downloadedFilePaths.length === 0) {
        const finalErrorMsg = downloadError || 'Failed to download video after all attempts.';
        // No need for updateFn here, as we are directly ending the interaction.
        return interaction.editReply({content: `Download failed: ${finalErrorMsg}`}).catch(console.error);
    }
    
    // ... (The rest of the upload logic, Discord fallback, and summary embed remains largely the same,
    //      but ensure `actualUrlToProcess` is used if the original URL needs to be referenced in embeds/messages,
    //      and `videoUrl` (the original parameter) if you need the exact original input for some reason)
    //      For example, in the summary embed: description: `Finished processing \`${actualUrlToProcess}\`.`

    // Make sure the final summary embed references `actualUrlToProcess` for clarity
    // ...
    // summaryEmbed.description = `Finished processing \`${actualUrlToProcess}\`.`;
    // ...

} 