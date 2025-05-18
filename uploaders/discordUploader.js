const path = require('path');
const { updateStatusEmbed } = require('./uploaderUtils'); // Assuming uploaderUtils is in the same directory

async function uploadToDiscord(client, targetChannelId, originalMessage, filePath, fileIndexStr, uploadResultsForCurrentFile) {
    console.log(`[DEBUG][DiscordUploader] Starting Discord upload for: ${filePath}`);
    let targetChannel;
    if (targetChannelId) {
        try {
            targetChannel = await client.channels.fetch(targetChannelId);
        } catch (fetchError) {
            console.error(`[DEBUG][DiscordUploader] Could not fetch target Discord channel ${targetChannelId}:`, fetchError.message);
            return { success: false, error: `Failed to fetch target channel: ${fetchError.message}` };
        }
    }

    if (!targetChannel) {
        console.warn('[DEBUG][DiscordUploader] No target channel for Discord upload, skipping.');
        return { success: false, error: 'No target channel specified or found for Discord upload.', skipped: true };
    }

    try {
        // Ensure originalMessage.statusMessage is the message object to edit for status updates.
        // This might need to be passed more explicitly if originalMessage is not always the right one.
        const statusMessageToEdit = originalMessage.statusMessage || originalMessage; // Fallback if statusMessage isn't nested

        await updateStatusEmbed(client, statusMessageToEdit.channelId, statusMessageToEdit.id, '🔄 Videó Feltöltése',
            `Feltöltés folyamatban...\n\nDiscord archiválás${fileIndexStr}...`, '#ffaa00');
        
        const fileName = path.basename(filePath);
        console.log(`[DEBUG][DiscordUploader] Uploading ${fileName} to Discord channel ${targetChannel.name}`);

        const archiveUpload = await targetChannel.send({
            content: `Eredeti üzenet: ${originalMessage.url || `https://discord.com/channels/${originalMessage.guildId}/${originalMessage.channelId}/${originalMessage.id}`}${fileIndexStr}`,
            files: [{
                attachment: filePath,
                name: fileName
            }]
        });

        if (archiveUpload && archiveUpload.attachments.size > 0) {
            const attachment = archiveUpload.attachments.first();
            console.log(`[DEBUG][DiscordUploader] Discord upload successful: ${archiveUpload.url} (Attachment: ${attachment.url})`);
            return { success: true, url: archiveUpload.url, attachmentUrl: attachment.url, service: `Discord${fileIndexStr || ''}` };
        } else {
            console.warn('[DEBUG][DiscordUploader] Discord upload completed but no attachment found in response. Trying fallback link.');
            return attemptDiscordFallbackLink(targetChannel, originalMessage, fileIndexStr, uploadResultsForCurrentFile);
        }
    } catch (discordError) {
        console.error(`[DEBUG][DiscordUploader] Discord upload failed for file ${path.basename(filePath)}:`, discordError.message);
        console.log('[DEBUG][DiscordUploader] Attempting fallback link due to Discord upload error.');
        return attemptDiscordFallbackLink(targetChannel, originalMessage, fileIndexStr, uploadResultsForCurrentFile, discordError.message);
    }
}

async function attemptDiscordFallbackLink(targetChannel, originalMessage, fileIndexStr, uploadResultsForCurrentFile, previousError = null) {
    const successfulExternalUploads = uploadResultsForCurrentFile.filter(
        result => result.success && 
                  result.url && 
                  result.service && 
                  !result.service.startsWith('Discord') && 
                  !result.service.toLowerCase().startsWith('fileditch') // Exclude Fileditch, case-insensitive
    );
    
    if (successfulExternalUploads.length > 0) {
        const fallbackUpload = successfulExternalUploads[0]; // Use the first successful external upload (respecting orchestrator order)
        const fallbackUrl = fallbackUpload.url;
        const fallbackService = fallbackUpload.service.replace(/\s*\(\d+\/\d+\)$/, '').trim(); 
        console.log(`[DEBUG][DiscordUploader] Using fallback URL from ${fallbackService}: ${fallbackUrl}`);
        try {
            const prevErrorMessage = previousError ? (typeof previousError === 'string' ? previousError : previousError.message) : '' ;
            const archiveMessage = await targetChannel.send(
                `Eredeti üzenet: ${originalMessage.url || `https://discord.com/channels/${originalMessage.guildId}/${originalMessage.channelId}/${originalMessage.id}`}${fileIndexStr}\nSikertelen Discord feltöltés${prevErrorMessage ? ` (${prevErrorMessage})` : ''}. Alternatív link (${fallbackService}): ${fallbackUrl}`
            );
            console.log(`[DEBUG][DiscordUploader] Fallback link posted to Discord: ${archiveMessage.url}`);
            return { success: true, url: archiveMessage.url, usedFallback: true, fallbackService: fallbackService, service: `Discord (fallback ${fallbackService})${fileIndexStr || ''}` };
        } catch (fallbackError) {
            console.error(`[DEBUG][DiscordUploader] Failed to send fallback link to Discord:`, fallbackError.message);
            return { success: false, error: `Discord upload failed and fallback link also failed: ${fallbackError.message}`, service: `Discord${fileIndexStr || ''}` };
        }
    } else {
        console.error('[DEBUG][DiscordUploader] Discord upload failed and no alternative links available for fallback.');
        return { success: false, error: `Discord upload failed and no alternative links were available. ${previousError || ''}`.trim(), service: `Discord${fileIndexStr || ''}` };
    }
}

module.exports = {
    uploadToDiscord
};