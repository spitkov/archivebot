const { EmbedBuilder } = require('discord.js');

// Helper function for updating status messages (embeds)
async function updateStatusEmbed(client, channelId, messageId, title, description, color) {
  // Log received parameters
  console.log(`[DEBUG][uploaderUtils.updateStatusEmbed][Entry] Received: client=${client ? 'Exists' : 'N/A'}, channelId=${channelId || 'N/A'}, messageId=${messageId || 'N/A'}`);
  console.log(`[DEBUG][uploaderUtils.updateStatusEmbed][Entry] title=${title}, description=${description ? description.substring(0,30) + '...' : 'N/A'}, color=${color}`);

  try {
    if (!client || !channelId || !messageId) {
        console.error('[uploaderUtils.updateStatusEmbed] Client, channelId, or messageId is missing.');
        return;
    }

    const channel = await client.channels.fetch(channelId).catch(err => {
        console.error(`[uploaderUtils.updateStatusEmbed] Failed to fetch channel ${channelId}:`, err);
        return null;
    });

    if (!channel) return;

    const messageToEdit = await channel.messages.fetch(messageId).catch(err => {
        console.error(`[uploaderUtils.updateStatusEmbed] Failed to fetch message ${messageId} in channel ${channelId}:`, err);
        return null;
    });

    if (!messageToEdit) return;
    
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setFooter({ text: 'Videó Archíváló Bot' });
    
    await messageToEdit.edit({ embeds: [embed] });

  } catch (error) {
    // Ignore common errors like "Unknown Message" if the original status message was deleted.
    if (error.code === 10008) { // DiscordAPIError: Unknown Message
        console.warn(`[uploaderUtils.updateStatusEmbed] Failed to update status message (it might have been deleted): ${error.message}`);
    } else if (error.code === 50001) { // DiscordAPIError: Missing Access
        console.warn(`[uploaderUtils.updateStatusEmbed] Missing access to edit message ${messageId} in ${channelId}: ${error.message}`);
    } else {
        console.error(`[uploaderUtils.updateStatusEmbed] Failed to update status message ${messageId} in ${channelId}:`, error);
    }
  }
}

module.exports = {
  updateStatusEmbed
}; 