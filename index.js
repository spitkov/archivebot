const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load structured components
const { config, saveConfig, getConfig } = require('./configManager'); // Manages config.json
const { TEMP_DIR_NAME } = require('./constants');
const { registerCommands, handleInteractionCommand } = require('./commandHandler');
const messageHandler = require('./messageHandler'); // Import the whole module
const { isOwner } = require('./utils'); // Utility functions like isOwner, progressBar

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers // Keep GuildMembers if owner checks or other member-specific logic needs it broadly
  ]
});

// Ensure the temporary directory for downloads exists
const tempDirPath = path.join(__dirname, TEMP_DIR_NAME);
if (!fs.existsSync(tempDirPath)) {
  fs.mkdirSync(tempDirPath, { recursive: true });
  console.log(`Temporary directory created: ${tempDirPath}`);
} else {
  console.log(`Temporary directory already exists: ${tempDirPath}`);
}

// Client Ready Event
client.on('ready', async () => {
  console.log(`Bot elindult mint ${client.user.tag}!`);
  await registerCommands(client);
  
  // Optional: A startup message or status update
  // client.user.setActivity('Archiválja a videókat', { type: 'WATCHING' });
});

// Interaction Create Event (for slash commands)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return; // Only handle command interactions
  await handleInteractionCommand(interaction, client);
});

// Message Create Event (for DMs, watched/monitored channels, legacy commands)
client.on('messageCreate', async (message) => {
  // Ensure the event name matches if your handler is structured for specific event names
  if (messageHandler.name === 'messageCreate' || messageHandler.name === 'message_create' || messageHandler.name === require('discord.js').Events.MessageCreate) { 
    await messageHandler.execute(message, client);
  } else {
      // Fallback or error if the event name doesn't match, though for direct client.on it should be fine
      console.warn('[Index] messageHandler was not executed because event name did not match.')
  }
});

// Error handling for unhandled rejections and uncaught exceptions
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
    // Consider more sophisticated error reporting here (e.g., to a Discord channel)
});
process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    // Optional: Graceful shutdown or attempt to restart
});

// Login to Discord
if (config.token && config.token !== 'YOUR_BOT_TOKEN_HERE') {
  client.login(config.token);
} else {
  console.error('*********************************************************************');
  console.error('Hiba: A bot token nincs beállítva a config.json fájlban!');
  console.error('Kérlek add meg a bot tokenedet a config.json fájlban a futtatás előtt.');
  console.error('Példa: { "token": "ABC123XYZ789...", ... }');
  console.error('*********************************************************************');
  process.exit(1); // Exit if no token is found
} 