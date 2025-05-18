const { getConfig } = require('./configManager');

// Helper function to check if user is an owner
function isOwner(userId) {
  const config = getConfig();
  // Make sure config.owners exists and is an array
  if (!Array.isArray(config.owners)) {
    console.warn('Warning: config.owners is not an array or is missing in config.json. Defaulting to no owners.');
    return false;
  }
  return config.owners.includes(userId);
}

// Helper function for progress bar
function progressBar(percentage, length = 20) {
  if (percentage === undefined || percentage === null || isNaN(percentage)) {
    percentage = 0; // Default to 0 if undefined or NaN
  }
  const filledLength = Math.round((percentage / 100) * length);
  const cappedFilledLength = Math.min(length, Math.max(0, filledLength)); // Ensure within bounds
  return '█'.repeat(cappedFilledLength) + '░'.repeat(length - cappedFilledLength);
}

module.exports = {
  isOwner,
  progressBar
}; 