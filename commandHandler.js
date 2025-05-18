const { ApplicationCommandOptionType, ChannelType } = require('discord.js');
const { handleAdminCommand } = require('./commands/adminCommands');
const { handleDownloadCommand, downloadCommandSchema } = require('./commands/downloadCommands');

const adminCommandNames = ['listmaps', 'addmap', 'removemap', 'addwatch', 'removewatch', 'listwatch'];
const downloadCommandNames = ['letoltes', 'archive'];

// Define all command schemas here
const allCommandSchemas = [
    ...downloadCommandSchema,
    // Admin Commands
    {
        name: 'addwatch',
        description: 'Add a watch mapping (owner only)',
        options: [
            { name: 'source', description: 'Source channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true },
            { name: 'target', description: 'Target channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true }
        ]
    },
    {
        name: 'listmaps',
        description: 'List all channel mappings (owner only)',
    },
    {
        name: 'addmap',
        description: 'Add a channel mapping (owner only)',
        options: [
            { name: 'source', description: 'Source channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true },
            { name: 'target', description: 'Target channel', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true }
        ]
    },
    {
        name: 'removemap',
        description: 'Remove a channel mapping (owner only)',
        options: [
            { name: 'source', description: 'Source channel to remove mapping', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true }
        ]
    },
    {
        name: 'removewatch',
        description: 'Remove a watch mapping (owner only)',
        options: [
            { name: 'source', description: 'Source channel to remove watch mapping', type: ApplicationCommandOptionType.Channel, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement], required: true }
        ]
    },
    {
        name: 'listwatch',
        description: 'List all watch mappings (owner only)'
    }
];

async function registerCommands(client) {
    try {
        await client.application.commands.set(allCommandSchemas);
        console.log('Slash parancsok sikeresen regisztrálva!');
    } catch (error) {
        console.error('Hiba történt a parancsok regisztrálása során:', error);
    }
}

async function handleInteractionCommand(interaction, client) {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (adminCommandNames.includes(commandName)) {
        await handleAdminCommand(interaction); // client might not be needed by admin commands, but pass for consistency
    } else if (downloadCommandNames.includes(commandName)) {
        await handleDownloadCommand(interaction, client); // client is needed for download orchestrator
    } else {
        console.warn(`[CommandHandler] Received unknown command: ${commandName}`);
        if (!interaction.replied) {
            try {
                await interaction.reply({ content: 'Ismeretlen parancs.', ephemeral: true });
            } catch (e) { console.error("Failed to reply to unknown command", e);}
        }
    }
}

module.exports = {
    registerCommands,
    handleInteractionCommand
}; 