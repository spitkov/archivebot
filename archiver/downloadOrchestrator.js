async function handleVideoDownload(message, videoUrl, interaction, targetChannelId) {
    const { author, client } = message; // Assuming message is the fakeMessage
    const originalChannelId = interaction.channelId;
    const effectiveChannelId = targetChannelId || originalChannelId;

    // Log the URL we are definitely going to use:
    console.log(`[Orchestrator] Effective URL for processing: ${videoUrl}`);

    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim() === '') {
        console.error('[Orchestrator] No valid video URL received by handleVideoDownload.');
        try {
            return await interaction.editReply({ content: 'Error: No valid video URL was found to process.', ephemeral: true });
        } catch (e) { return console.error("Failed to send error reply for missing URL", e); }
    }

    // The problematic line 62 was likely trying to .replace() on an undefined URL.
    // Now, `videoUrl` is the one taken directly from the parameter.
    // Any .replace() calls should be on this `videoUrl`.
    // For example, if there was a cleanup step:
    const cleanedUrl = videoUrl.replace(/<|>/g, ''); // Ensure this is what line 62 might have been doing or similar

    let statusMessage = await interaction.editReply({ content: 'Starting download process...', embeds: [], files: [] }).catch(e => {
        console.error("Failed to send initial status message:", e);
        return interaction.channel.send("Starting download process...").catch(e2 => console.error("Really failed to send status:", e2));
    });

    const updateFn = async (text, embedContent) => {
        try {
            await interaction.editReply({ content: text, embeds: embedContent ? [embedContent] : [] });
        } catch (e) {
            console.warn("[Orchestrator] Failed to edit interaction reply for status update:", e);
        }
    };
    
    // Use cleanedUrl or videoUrl directly as appropriate from here onwards
    await updateFn(`Fetching video from: ${cleanedUrl}`); 
    let downloadedFilePaths = []; 

    // ... (rest of the function, including download logic, calls to attemptDirectDiscordUploadAndFallback, and final embed) ...
} 