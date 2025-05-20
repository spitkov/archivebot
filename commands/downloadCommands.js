const { ApplicationCommandOptionType, ChannelType } = require('discord.js');
const { handleVideoDownload } = require('../downloadOrchestrator');

async function handleDownloadCommand(interaction) {
    const url = interaction.options.getString('url');
    const targetChannelOption = interaction.options.getChannel('target_channel');
    const targetChannelId = targetChannelOption ? targetChannelOption.id : null;

    let finalUrl = url;

    if (!finalUrl) {
        await interaction.reply({ content: 'No URL was provided directly. Please provide a URL or use this command in reply to a message containing a URL.', ephemeral: true });
        return;
    }

    await interaction.deferReply({ephemeral: false}); 

    const fakeMessage = {
        content: `/${interaction.commandName} ${finalUrl}`.trim(),
        author: interaction.user,
        channel: interaction.channel,
        channelId: interaction.channelId,
        guild: interaction.guild,
        guildId: interaction.guildId,
        member: interaction.member,
        client: interaction.client,
        id: interaction.id + '__fakemsg',
    };

    await handleVideoDownload(fakeMessage, finalUrl, interaction, targetChannelId); 
}

const downloadCommandSchema = [
    {
        name: 'letoltes',
        description: 'Videó letöltése és archiválása',
        options: [
            {
                name: 'url',
                description: 'A videó URL-je',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'target_channel',
                description: 'Optional: The channel to send the archived video to.',
                type: ApplicationCommandOptionType.Channel,
                channelTypes: [ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread],
                required: false
            }
        ]
    },
    {
        name: 'archive',
        description: 'Video download and archival, optionally to a specific channel.',
        options: [
            {
                name: 'url',
                description: 'The video URL',
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: 'target_channel',
                description: 'Optional: The channel to send the archived video to.',
                type: ApplicationCommandOptionType.Channel,
                channelTypes: [ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread],
                required: false
            }
        ]
    }
];

module.exports = {
    handleDownloadCommand,
    downloadCommandSchema
}; 