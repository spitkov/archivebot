const { ChannelType, EmbedBuilder, Events } = require('discord.js');
const { getConfig } = require('./configManager');
const { handleVideoDownload } = require('./downloadOrchestrator');
const { TEMP_DIR_NAME } = require('./constants'); // Not used here directly, but good to keep track
const path = require('path');
const fs = require('fs');

// Ensure the temporary directory exists (moved from orchestrator to ensure it's ready early)
// Though orchestrator also does this, it's fine to have it here too for safety.
const tempDir = path.join(__dirname, TEMP_DIR_NAME);
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Temp directory created at: ${tempDir}`);
}

async function handleMessageCreate(message, client) {
    if (message.author.id === client.user.id) return; // MODIFIED: Ignore messages from the bot itself

    const config = getConfig();
    const { content, channelId, channel, author } = message;

    console.log(`[DEBUG][MessageHandler] Received message in channel ${channelId} from ${author.tag}: "${content}"`);

    // Check if the message is a command (starts with /letoltes or /archive)
    // This is a simple check; slash commands are handled by interactionCreate.
    // This primarily catches legacy text commands if you still want to support them or if users type them out.
    const isLegacyTextCommand = content.startsWith('/letoltes') || content.startsWith('/archive');

    const isDM = channel.type === ChannelType.DM;
    const isMonitoredChannel = !!config.channelMappings?.[channelId];
    const isWatchedChannel = !!config.watchMappings?.[channelId];

    console.log(`[DEBUG][MessageHandler] LegacyCmd: ${isLegacyTextCommand}, DM: ${isDM}, Monitored: ${isMonitoredChannel}, Watched: ${isWatchedChannel}`);

    // If it's a watched channel and not a command, look for URLs to auto-archive.
    if (isWatchedChannel && !isLegacyTextCommand) {
        console.log(`[DEBUG][MessageHandler] Processing message in watched channel ${channelId}.`);
        const urlMatch = content.match(/https?:\/\/[^\s<>"]+/g);
        if (!urlMatch) {
            console.log(`[DEBUG][MessageHandler] No URL found in watched channel message, ignoring.`);
            return;
        }

        const targetChannelId = config.watchMappings[channelId];
        try {
            const targetChannel = await client.channels.fetch(targetChannelId);
            if (!targetChannel) {
                console.error(`[DEBUG][MessageHandler] Could not find target channel ${targetChannelId} for watched channel ${channelId}`);
                return;
            }

            const notificationEmbed = new EmbedBuilder()
                .setTitle('🔍 Talált Link (Auto-Watch)')
                .setDescription(`Link találva a <#${channelId}> csatornában.\nEredeti üzenet: ${message.url}\nSzerző: ${author.tag}\nTartalom: ${content.substring(0, 1000) + (content.length > 1000 ? '...' : '')}\n\nAutomatikus archiválás kezdése ide: <#${targetChannelId}>`)
                .setColor('#0099ff')
                .setFooter({ text: 'Videó Archíváló Bot - Auto Watch' });
            
            // Send notification and then use that message for status updates
            const notificationMessage = await targetChannel.send({ embeds: [notificationEmbed] });

            // Create a message-like object for the orchestrator that points to the target channel for replies
            const fakeMessageForOrchestrator = {
                ...message, // Spread original message properties
                content: urlMatch[0], // Provide only the URL to the orchestrator for watched links
                author: message.author, // Preserve original author for context
                channel: targetChannel, // CRITICAL: Operations happen in the target channel
                channelId: targetChannel.id,
                // Reply and editReply should operate on the notificationMessage in the target channel
                reply: async (options) => notificationMessage.reply(options),
                editReply: async (options) => notificationMessage.edit(options), // .edit() for messages
                statusMessage: notificationMessage, // Pre-assign status message
                url: message.url, // Original message URL for reference
                guildId: targetChannel.guildId || message.guildId, // Ensure guildId is present
                reference: null // Auto-watched messages aren't direct replies in the target channel
            };

            console.log(`[DEBUG][MessageHandler] Processing watched channel URL ${urlMatch[0]} in target channel ${targetChannel.id}`);
            await handleVideoDownload(client, fakeMessageForOrchestrator, false, urlMatch[0]);
            return; // Handled as a watched link

        } catch (error) {
            console.error(`[DEBUG][MessageHandler] Error processing watched channel message:`, error);
            return;
        }
    }

    // Process for DMs (if it contains a URL and isn't a legacy command already)
    // or monitored channels (if it contains a URL and isn't a legacy command)
    // or if it IS a legacy text command.
    if (isLegacyTextCommand || ((isDM || isMonitoredChannel) && content.match(/https?:\/\/[^\s<>"]+/g))) {
        console.log(`[DEBUG][MessageHandler] URL detected in DM, monitored channel, or it's a legacy text command. Processing for download.`);
        // For legacy commands or general URL messages in DMs/monitored channels,
        // the orchestrator will handle URL extraction from message.content.
        // The `isSlashCommand` flag is false here.
        await handleVideoDownload(client, message, false); 
        return; // Handled
    }

    console.log(`[DEBUG][MessageHandler] Message did not meet criteria for download processing, ignoring.`);
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.id === client.user.id) return;

        // Initial entry log
        console.log(`[MessageHandler][ExecuteEntry] MsgID: ${message.id} from ${message.author.tag} (UID:${message.author.id}) in ChID: ${message.channel.id} (${message.channel.name || 'DM'}). Content: "${message.content.substring(0, 70).replace(/\\n/g, ' ')}..."`);

        const config = getConfig();
        // const { watchMappings, monitoredChannels, DMs, channelMappings } = config; // Get channelMappings
        // It's better to access properties directly from config in case some are optional
        const watchMappings = config.watchMappings || {};
        const channelMappings = config.channelMappings || {};
        const monitoredChannelsArray = config.monitoredChannels || []; // If you still use a separate monitoredChannels array
        const DMsEnabled = config.DMs === true;


        const isWatchedChannel = watchMappings && watchMappings[message.channel.id];
        // A "regular map" source channel is now defined as a key in channelMappings
        const isRegularMapSourceChannel = channelMappings.hasOwnProperty(message.channel.id);
        // For the old logic if needed: const isMonitoredFromArray = monitoredChannelsArray.includes(message.channel.id);
        
        const isDM = message.channel.type === ChannelType.DM && DMsEnabled;

        console.log(`[MessageHandler][Checks] MsgID: ${message.id}. IsWatched: ${!!isWatchedChannel}, IsRegularMapSource: ${isRegularMapSourceChannel}, IsDM: ${isDM}`);

        if (isWatchedChannel) {
            const targetChannelId = watchMappings[message.channel.id];
            const sourceChannelName = message.channel.name || 'DM';
            let itemsToProcess = [];

            console.log(`[Watch][Enter] MsgID: ${message.id} in watched channel ${sourceChannelName} (ID: ${message.channel.id}). Target: ${targetChannelId}`);

            const urlPattern = /https?:\/\/[^\s<>'"()]+/g;
            const urlsInContent = message.content ? message.content.match(urlPattern) : null;

            if (urlsInContent && urlsInContent.length > 0) {
                console.log(`[Watch][ContentURLs] MsgID: ${message.id}. Found ${urlsInContent.length} URLs in content.`);
                urlsInContent.forEach(url => itemsToProcess.push({ type: 'url', value: url, originalMessage: message }));
            }

            if (message.attachments && message.attachments.size > 0) {
                console.log(`[Watch][Attachments] MsgID: ${message.id}. Found ${message.attachments.size} attachments.`);
                message.attachments.forEach(attachment => {
                    const contentType = attachment.contentType || '';
                    if (contentType.startsWith('video/') || contentType.startsWith('image/')) {
                        itemsToProcess.push({ type: 'attachment', value: attachment.url, name: attachment.name, contentType: contentType, originalMessage: message });
                    }
                });
            }

            if (itemsToProcess.length === 0) {
                console.log(`[Watch][NoItems] MsgID: ${message.id}. No processable items found.`);
                return;
            }

            let targetChannel;
            try {
                targetChannel = await client.channels.fetch(targetChannelId);
                if (!targetChannel) {
                    console.error(`[Watch][Error] MsgID: ${message.id}. Could not find target channel ${targetChannelId}.`);
                    return;
                }
            } catch (fetchError) {
                console.error(`[Watch][Error] MsgID: ${message.id}. Error fetching target channel ${targetChannelId}:`, fetchError);
                return;
            }
            
            console.log(`[Watch][Processing] MsgID: ${message.id}. Processing ${itemsToProcess.length} item(s) for target channel ${targetChannel.name}.`);

            for (const item of itemsToProcess) {
                const itemTypeDisplay = item.type === 'url' ? `URL: ${item.value}` : `Attachment (${item.contentType}): ${item.name}`;
                const initialEmbed = new EmbedBuilder()
                    .setTitle('🆕 Új Elem Észlelve (Auto-Watch)')
                    .setDescription(`Eredeti üzenet: ${item.originalMessage.url}\nSzerző: ${item.originalMessage.author.tag}\nÉszlelt elem: ${itemTypeDisplay}\n\nArchiválás indítása...`)
                    .setColor('#0099ff')
                    .setTimestamp()
                    .setFooter({ text: 'Videó Archíváló Bot - Auto Watch' });

                let notificationMessage;
                try {
                    notificationMessage = await targetChannel.send({ embeds: [initialEmbed] });
                } catch (sendError) {
                    console.error(`[Watch][NotificationError] OrigMsgID: ${item.originalMessage.id}. Failed to send initial notification to target channel ${targetChannelId}:`, sendError);
                    continue; 
                }

                const fakeMessageForOrchestrator = {
                    content: item.value, 
                    author: item.originalMessage.author,
                    channel: targetChannel, 
                    channelId: targetChannel.id,
                    guild: targetChannel.guild, 
                    guildId: targetChannel.guildId,
                    id: notificationMessage.id, 
                    reply: async (options) => notificationMessage.reply(options).catch(e => console.error('[Watch] FakeReply to notification failed:', e)),
                    editReply: async (options) => notificationMessage.edit(options).catch(e => console.error('[Watch] FakeEditReply to notification failed:', e)),
                    statusMessage: notificationMessage, 
                    reference: { 
                        messageId: item.originalMessage.id,
                        channelId: item.originalMessage.channelId, // Original source channel ID
                        guildId: item.originalMessage.guildId,
                        messageUrl: item.originalMessage.url,
                        isWatchedCallback: true 
                    }
                };
                
                console.log(`[Watch][OrchestratorCall] OrigMsgID: ${item.originalMessage.id}. NotifMsgID: ${notificationMessage.id}. Value: "${item.value.substring(0,50)}..."`);
                handleVideoDownload(client, fakeMessageForOrchestrator, false, item.value, targetChannel.id).catch(err => {
                     console.error(`[Watch][OrchestratorError] OrigMsgID: ${item.originalMessage.id} for "${item.value.substring(0,50)}...":`, err);
                     const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Hiba az Archiválás Során (Auto-Watch)')
                        .setDescription(`Hiba történt az alábbi elem feldolgozása közben:\nEredeti üzenet: ${item.originalMessage.url}\nElem: ${itemTypeDisplay}\n\nHiba: ${err.message}`)
                        .setColor('#ff0000');
                     notificationMessage.edit({ embeds: [errorEmbed], components: [] }).catch(e => console.error('[Watch] Failed to edit notification with error:', e));
                });
            }

        } else if (isRegularMapSourceChannel || isDM || message.content.startsWith('/letoltes') || message.content.startsWith('/archive')) {
            const urlPattern = /https?:\/\/[^\s<>'"()]+/g;
            const isLegacyCommand = message.content.startsWith('/letoltes') || message.content.startsWith('/archive');
            let urlToProcess = null;

            console.log(`[MessageHandler][RegularOrDMBlock] MsgID: ${message.id}. IsRegularMap: ${isRegularMapSourceChannel}, IsDM: ${isDM}, IsLegacy: ${isLegacyCommand}`);

            if (isLegacyCommand) {
                const parts = message.content.split(/\\s+/);
                if (parts.length > 1 && parts[1].match(urlPattern)) {
                    urlToProcess = parts[1];
                }
                console.log(`[MessageHandler][LegacyCommand] MsgID: ${message.id}. URL to process: ${urlToProcess}`);
            } else if (isRegularMapSourceChannel || isDM) { // This is the path for a link in a mapped/DM channel
                const urlsInContent = message.content ? message.content.match(urlPattern) : null;
                console.log(`[MessageHandler][URLSearch] MsgID: ${message.id}. Content: "${message.content.substring(0, 70).replace(/\\n/g, ' ')}...". URLs found: ${urlsInContent ? urlsInContent.length : '0'}.`);
                if (urlsInContent && urlsInContent.length > 0) {
                    urlToProcess = urlsInContent[0];
                }
                console.log(`[MessageHandler][RegularOrDMResult] MsgID: ${message.id}. URL to process: ${urlToProcess}`);
            }

            // For legacy commands, allow proceeding even if urlToProcess is null initially, as orchestrator handles replies.
            // For non-legacy (regular map / DM), urlToProcess must be found.
            if (urlToProcess || (isLegacyCommand && (message.reference || message.content.split(/\\s+/).length > 1))) {
                 console.log(`[MessageHandler][OrchestratorCall] MsgID: ${message.id}. For RegularMap/DM/Legacy. URL: "${urlToProcess || '(via reply or legacy command without explicit URL)'}"`);
                // For regular mapped channels, explicitTargetChannelId is null.
                // downloadOrchestrator will use config.channelMappings[message.channel.id] for the target.
                handleVideoDownload(client, message, false, urlToProcess, null).catch(err => {
                    console.error(`[MessageHandler][OrchestratorError] MsgID: ${message.id} for URL "${urlToProcess}":`, err);
                    // Optionally send a reply about the error if it's a direct command or in a mapped channel
                    const replyContentOnError = 'Hiba történt a feldolgozás közben: ' + (err.message || 'Ismeretlen hiba');
                    message.reply(replyContentOnError).catch(e => console.error("[MessageHandler] Failed to send error reply:", e));
                });
            } else {
                console.log(`[MessageHandler][NoAction] MsgID: ${message.id}. No URL processed for RegularMap/DM. URLtoProcess: ${urlToProcess}, IsLegacy: ${isLegacyCommand}. This message will be ignored.`);
            }
        } else {
             console.log(`[MessageHandler][Ignored] MsgID: ${message.id} from ${message.author.tag} did not match any processing criteria (Not Watched, Not RegularMap, Not DM, Not Legacy Command).`);
        }
    },
}; 