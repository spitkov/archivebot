// Cobalt API configuration
const COBALT_API_URL = "http://c.everypizza.im";
const COBALT_API_ENDPOINT = `${COBALT_API_URL}`; // Potential to simplify this to just COBALT_API_URL if it's always the same.
const COBALT_SUPPORTED_SITES = [
  'youtube.com', 'youtu.be', 'instagram.com', 'twitter.com', 'x.com',
  'tiktok.com', 'facebook.com', 'reddit.com', 'soundcloud.com',
  'spotify.com', 'pinterest.com', 'tumblr.com', 'tiktok.com','www.tiktok.com'
];

// Progress update thresholds
const PROGRESS_UPDATE_TIME_THRESHOLD = 500; // ms
const PROGRESS_PERCENTAGE_CHANGE_THRESHOLD = 5; // % for Cobalt
const YTDLP_PROGRESS_PERCENTAGE_CHANGE_THRESHOLD = 2; // % for yt-dlp
const YTDLP_PROGRESS_UPDATE_TIME_THRESHOLD = 1000; // ms for yt-dlp

// Temp directory name
const TEMP_DIR_NAME = 'temp';

module.exports = {
  COBALT_API_URL,
  COBALT_API_ENDPOINT,
  COBALT_SUPPORTED_SITES,
  PROGRESS_UPDATE_TIME_THRESHOLD,
  PROGRESS_PERCENTAGE_CHANGE_THRESHOLD,
  YTDLP_PROGRESS_PERCENTAGE_CHANGE_THRESHOLD,
  YTDLP_PROGRESS_UPDATE_TIME_THRESHOLD,
  TEMP_DIR_NAME
}; 
