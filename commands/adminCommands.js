const { EmbedBuilder } = require('discord.js');
const { getConfig, saveConfig, config: currentConfig } = require('../configManager'); // Import config directly for modification
const { isOwner } = require('../utils');

// It's generally better to pass the interaction to each function 
// rather than relying on a higher-level deferral if specific interactions are needed.

async function handleListWatch(interaction) {
    const config = getConfig();
    const watchMappingsList = Object.entries(config.watchMappings || {})
        .map(([source, target]) => `<#${source}> → <#${target}>`)
        .join('\n') || 'Nincsenek beállított watch mappelések';

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('👁️ Watch Mappelések')
            .setDescription(watchMappingsList)
            .setColor('#00aaff')]
    });
}

async function handleListMaps(interaction) {
    const config = getConfig();
    const regularMappings = Object.entries(config.channelMappings || {})
        .map(([source, target]) => `<#${source}> → <#${target}> (Regular)`)
        .join('\n');
    const watchMappings = Object.entries(config.watchMappings || {})
        .map(([source, target]) => `<#${source}> → <#${target}> (Watch)`)
        .join('\n');
    
    const allMappings = [regularMappings, watchMappings].filter(Boolean).join('\n\n') || 'Nincsenek beállított mappelések';

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('📋 Csatorna Mappelések')
            .setDescription(allMappings)
            .setColor('#00ff00')]
    });
}

async function handleAddWatch(interaction) {
    const sourceChannel = interaction.options.getChannel('source');
    const targetChannel = interaction.options.getChannel('target');

    if (!currentConfig.watchMappings) {
        currentConfig.watchMappings = {};
    }
    currentConfig.watchMappings[sourceChannel.id] = targetChannel.id;

    if (!saveConfig(currentConfig)) { // Pass the modified currentConfig
        await interaction.editReply({ content: '❌ Hiba történt a konfiguráció mentése közben!', ephemeral: true });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('✅ Watch Mappelés Hozzáadva')
            .setDescription(`${sourceChannel} → ${targetChannel}\nA bot most automatikusan archivál minden linket a forrás csatornából a cél csatornába.\nKonfiguráció mentve!`)
            .setColor('#00ff00')]
    });
}

async function handleAddMap(interaction) {
    const sourceChannel = interaction.options.getChannel('source');
    const targetChannel = interaction.options.getChannel('target');

    console.log(`[AdminCommands][AddMap] Source: ${sourceChannel.id}, Target: ${targetChannel.id}`);

    if (!currentConfig.channelMappings) {
        currentConfig.channelMappings = {};
    }
    currentConfig.channelMappings[sourceChannel.id] = targetChannel.id;
    console.log('[AdminCommands][AddMap] currentConfig modified:', JSON.stringify(currentConfig.channelMappings));

    if (!saveConfig(currentConfig)) { // Pass the modified currentConfig
        console.error('[AdminCommands][AddMap] saveConfig returned false.');
        await interaction.editReply({ content: '❌ Hiba történt a konfiguráció mentése közben!', ephemeral: true });
        return;
    }
    console.log('[AdminCommands][AddMap] saveConfig returned true. Attempting to send success embed.');

    const description = `${sourceChannel} → ${targetChannel}\nKonfiguráció mentve!`;
    console.log(`[AdminCommands][AddMap] Embed description to be sent: "${description}"`);

    try {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('✅ Mappelés Hozzáadva')
                .setDescription(description)
                .setColor('#00ff00')]
        });
        console.log('[AdminCommands][AddMap] Success embed sent.');
    } catch (e) {
        console.error('[AdminCommands][AddMap] Error sending success embed:', e);
        // If this fails, the interaction might remain "thinking"
        // Try a plain text reply as a fallback if the embed fails for some reason
        if (!interaction.replied) { // Check if we haven't already replied somehow
            await interaction.editReply({ content: 'Mappelés hozzáadva, de a megerősítő üzenet nem tudott megjelenni.', ephemeral: true }).catch(finalErr => {
                console.error('[AdminCommands][AddMap] Error sending fallback text reply:', finalErr);
            });
        }
    }
}

async function handleRemoveMap(interaction) {
    const channelToRemove = interaction.options.getChannel('source');

    if (!currentConfig.channelMappings || !currentConfig.channelMappings[channelToRemove.id]) {
        await interaction.editReply({ content: '❌ Nem található mappelés ehhez a csatornához!', ephemeral: true });
        return;
    }

    delete currentConfig.channelMappings[channelToRemove.id];
    if (!saveConfig(currentConfig)) { // Pass the modified currentConfig
        await interaction.editReply({ content: '❌ Hiba történt a konfiguráció mentése közben!', ephemeral: true });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('✅ Mappelés Törölve')
            .setDescription(`Törölve: ${channelToRemove}\nKonfiguráció mentve!`)
            .setColor('#00ff00')]
    });
}

async function handleRemoveWatch(interaction) {
    const channelToRemove = interaction.options.getChannel('source');

    if (!currentConfig.watchMappings || !currentConfig.watchMappings[channelToRemove.id]) {
        await interaction.editReply({ content: '❌ Nem található watch mappelés ehhez a csatornához!', ephemeral: true });
        return;
    }

    delete currentConfig.watchMappings[channelToRemove.id];
    if (!saveConfig(currentConfig)) { // Pass the modified currentConfig
        await interaction.editReply({ content: '❌ Hiba történt a konfiguráció mentése közben!', ephemeral: true });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle('✅ Watch Mappelés Törölve')
            .setDescription(`Törölve: ${channelToRemove}\nA csatorna már nem lesz automatikusan megfigyelés alatt.\nKonfiguráció mentve!`)
            .setColor('#00ff00')]
    });
}

// Main router for admin commands
async function handleAdminCommand(interaction) {
    if (!isOwner(interaction.user.id)) {
        await interaction.reply({ content: '❌ Nincs jogosultságod ehhez a parancshoz!', ephemeral: true });
        return;
    }

    // Defer reply for all admin commands to prevent timeout, as it was in the original code.
    // Individual handlers will use editReply.
    await interaction.deferReply({ ephemeral: true }); 

    const { commandName } = interaction;

    try {
        switch (commandName) {
            case 'listwatch':
                await handleListWatch(interaction);
                break;
            case 'listmaps':
                await handleListMaps(interaction);
                break;
            case 'addwatch':
                await handleAddWatch(interaction);
                break;
            case 'addmap':
                await handleAddMap(interaction);
                break;
            case 'removemap':
                await handleRemoveMap(interaction);
                break;
            case 'removewatch':
                await handleRemoveWatch(interaction);
                break;
            default:
                await interaction.editReply({ content: 'Ismeretlen adminisztrációs parancs.', ephemeral: true });
        }
    } catch (error) {
        console.error(`[AdminCommands] Error handling '${commandName}':`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Hiba történt a parancs feldolgozása közben.', ephemeral: true }).catch(() => {});
        } else {
            await interaction.editReply({ content: 'Hiba történt a parancs feldolgozása közben.', ephemeral: true }).catch(() => {});
        }
    }
}

module.exports = {
    handleAdminCommand,
    // Export individual handlers if they need to be called separately, though not typical for this structure
    // handleListWatch, 
    // handleListMaps,
    // handleAddWatch,
    // handleAddMap,
    // handleRemoveMap,
    // handleRemoveWatch
}; 