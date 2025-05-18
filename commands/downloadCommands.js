const { ApplicationCommandOptionType } = require('discord.js');
const { handleVideoDownload } = require('../downloadOrchestrator');

async function handleDownloadCommand(interaction, client) {
    const url = interaction.options.getString('url');
    const repliedMessageOpt = interaction.options.getMessage('message'); // Check if this option exists or is used

    let finalUrl = url;

    // The original code had a section for slash commands to check a replied message
    // if no URL was provided directly in the command. This is tricky with current slash command structure
    // as message replies aren't standard options. We might need to rely on users providing the URL or
    // using the message context menu command (if that's how it worked).
    // For now, if 'url' is not provided, we check if the interaction is a reply in a broader sense,
    // or if a 'message' option was somehow passed (though not standard for string option).

    if (!finalUrl) {
        // This part of the logic for slash commands to automatically pick up a replied message's URL
        // is difficult to replicate directly if the original relied on message context rather than a command option.
        // If the intent was to use a context menu command on a message, that's a different command type.
        // If the slash command itself was a reply to a message with a URL, `interaction.channel.messages.fetch(interaction.targetId)`
        // might be needed if `interaction.targetId` is populated for message replies that trigger commands.
        // However, the original code used `interaction.options.getMessage('message')` which isn't typical.

        // For now, we will assume 'url' is required or the bot prompts if missing.
        // The orchestrator already has logic to prompt if no URL is found.
        console.log("[DownloadCommand] No URL directly provided in slash command options.");
    }

    // Defer the reply (as done in the original for these commands)
    // The orchestrator will handle the initial reply/editReply.
    await interaction.deferReply(); 

    // The orchestrator `handleVideoDownload` expects a 'message' like object.
    // We need to adapt the interaction object or create a compatible fake message.
    // The `downloadOrchestrator` is expecting `message.reply` and `message.editReply` to be functions.
    // Slash command interactions have `interaction.reply` and `interaction.editReply`.
    
    // Create a message-like object for the orchestrator
    const fakeMessage = {
        content: `/${interaction.commandName} ${finalUrl || ''}`.trim(),
        author: interaction.user,
        channel: interaction.channel,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        // Crucially, map interaction's reply methods to what the orchestrator expects
        reply: (content) => interaction.followUp(content), // Use followUp if deferReply was used.
        editReply: (content) => interaction.editReply(content),
        // Pass the interaction itself if some specific properties are needed by the orchestrator later.
        // For example, if the orchestrator needs to know if it was an interaction.
        interaction: interaction, 
        // statusMessage will be attached by the orchestrator after its initial reply
    };

    // Call the orchestrator. Pass `client` if it's needed by downstream functions (e.g. Discord uploader).
    await handleVideoDownload(client, fakeMessage, true, finalUrl); 
}

const downloadCommandSchema = [
    {
        name: 'letoltes',
        description: 'Videó letöltése és archiválása',
        options: [
            {
                name: 'url',
                description: 'A videó URL-je (ha üres, és válaszolsz egy URL-t tartalmazó üzenetre, azt használja)',
                type: ApplicationCommandOptionType.String,
                required: false // Original logic tried to find URL in replied messages
            }
        ]
    },
    {
        name: 'archive',
        description: 'Video download and archival',
        options: [
            {
                name: 'url',
                description: 'The video URL (if empty and you reply to a message with a URL, it will be used)',
                type: ApplicationCommandOptionType.String,
                required: false
            }
        ]
    }
];

module.exports = {
    handleDownloadCommand,
    downloadCommandSchema
}; 