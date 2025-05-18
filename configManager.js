const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, './config.json');

let config = {};

// Load config initially
try {
  if (fs.existsSync(CONFIG_PATH)) {
    const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf-8');
    config = JSON.parse(rawConfig);
    console.log('Configuration loaded successfully.');
  } else {
    // Create a default config if it doesn't exist
    console.warn('config.json not found. Creating a default config. Please fill in your token and owner IDs.');
    config = {
      token: "YOUR_BOT_TOKEN_HERE",
      owners: ["YOUR_USER_ID_HERE"],
      channelMappings: {},
      watchMappings: {}
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log('Default config.json created. Please edit it with your bot token and owner ID(s).');
    // It might be better to exit here and ask the user to configure first, 
    // but for now, we'll proceed with a potentially non-functional bot.
  }
} catch (error) {
  console.error('Failed to load or create config.json:', error);
  // If config loading fails, it's critical. We should probably exit or use a very minimal default.
  // For now, exiting to prevent further issues.
  process.exit(1);
}

function getConfig() {
  return config;
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig || config, null, 2));
    if (newConfig) config = newConfig; // Update in-memory config if newConfig is passed
    return true;
  } catch (error) {
    console.error('Failed to save config:', error);
    return false;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  // Exporting the config object directly for convenience in other modules, though using getConfig() is cleaner.
  // Be cautious when modifying this directly from other modules; prefer using saveConfig after modifications.
  config 
}; 