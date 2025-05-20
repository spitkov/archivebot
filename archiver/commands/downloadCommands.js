const { SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('archive')
        .setDescription('Archives a video from a URL and optionally sends to a specific channel.')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the video to archive')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('target_channel')
                .setDescription('Optional: The channel to send the archived video to.')
                .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const videoUrl = interaction.options.getString('url');
        const targetChannelOption = interaction.options.getChannel('target_channel');
        const targetChannelId = targetChannelOption ? targetChannelOption.id : null;

        const fakeMessage = {
            content: videoUrl,
            author: interaction.user,
            channel: interaction.channel, 
            guild: interaction.guild,
            member: interaction.member,
            client: interaction.client,
            id: interaction.id + '__fakemsg' // Create a unique ID for the fake message
        };

        try {
            // Pass interaction and targetChannelId to handleVideoDownload
            await handleVideoDownload(fakeMessage, videoUrl, interaction, targetChannelId);
        } catch (error) {
            console.error('[ArchiveCommand] Error calling handleVideoDownload:', error);
            try {
                await interaction.editReply({ content: `An error occurred while processing your archive request: ${error.message}`, ephemeral: true });
            } catch (replyError) {
                console.error('[ArchiveCommand] Error sending error reply:', replyError);
            }
        }
    },
}; 