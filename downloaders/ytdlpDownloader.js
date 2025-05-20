const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { TEMP_DIR_NAME, YTDLP_PROGRESS_UPDATE_TIME_THRESHOLD, YTDLP_PROGRESS_PERCENTAGE_CHANGE_THRESHOLD } = require('../constants');
const { updateStatusEmbed } = require('../uploaders/uploaderUtils');
const { progressBar } = require('../utils');

async function downloadWithYtDlp(url, statusMessage, timestamp, client) {
  console.log(`[DEBUG] Starting yt-dlp download for: ${url}`);
  const tempDir = path.join(__dirname, '..', TEMP_DIR_NAME);
  let lastYtDlpUpdateTime = 0;
  let lastYtDlpPercentage = 0;
  let totalBytesForFinalUpdate = 0;

  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(tempDir, `video-${timestamp}-%(id)s.%(ext)s`);
    const command = `yt-dlp --cookies cookies.txt --no-warnings -o "${outputTemplate}" "${url}" --progress-template "download:progress:{\\"downloaded_bytes\\":%(progress.downloaded_bytes)s,\\"total_bytes\\":%(progress.total_bytes)s,\\"eta\\":%(progress.eta)s}"`;
    console.log(`[DEBUG] Executing yt-dlp command: ${command}`);

    const ytdlpProcess = exec(command, { maxBuffer: 1024 * 1024 * 10 });

    let finalOutputPath = null;
    let downloadStarted = false;

    const processOutput = async (data, source) => {
      const dataStr = data.toString();
      // console.log(`yt-dlp ${source}:`, dataStr); // Can be very verbose

      const destinationMatch = dataStr.match(/\\[(?:download|Merger|ExtractAudio)\\] Destination: (.*)/i) || dataStr.match(/Merging formats into "(.*)"/i);
      if (destinationMatch && destinationMatch[1]) {
        finalOutputPath = destinationMatch[1].trim().replace(/^"|"$/g, '');
        console.log(`[DEBUG] yt-dlp output indicates final file path: ${finalOutputPath}`);
        if (!downloadStarted) {
            downloadStarted = true;
            await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 yt-dlp Letöltés', 'Letöltés kezdése yt-dlp-vel...', '#ffaa00');
        }
      }

      const jsonProgressMatches = dataStr.matchAll(/download:progress:({.*?})/g);
      for (const match of jsonProgressMatches) {
        try {
          const progressJson = JSON.parse(match[1]);
          const downloadedBytes = parseInt(progressJson.downloaded_bytes);
          const totalBytes = parseInt(progressJson.total_bytes);

          if (!isNaN(downloadedBytes) && !isNaN(totalBytes) && totalBytes > 0) {
            totalBytesForFinalUpdate = totalBytes;
            if (!downloadStarted) {
                downloadStarted = true;
                await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 yt-dlp Letöltés', 'Letöltés kezdése yt-dlp-vel...', '#ffaa00');
            }
            const now = Date.now();
            const percentage = (downloadedBytes / totalBytes) * 100;

            if (now - lastYtDlpUpdateTime > YTDLP_PROGRESS_UPDATE_TIME_THRESHOLD ||
                Math.abs(percentage - lastYtDlpPercentage) > YTDLP_PROGRESS_PERCENTAGE_CHANGE_THRESHOLD ||
                percentage >= 99.5) {

              const downloadedMB = (downloadedBytes / 1024 / 1024).toFixed(2);
              const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
              const percentageFormatted = percentage.toFixed(2);
              const bar = progressBar(percentage);
              const eta = progressJson.eta ? `ETA: ${progressJson.eta}s` : '';

              await updateStatusEmbed(
                client, statusMessage.channelId, statusMessage.id,
                '🔄 yt-dlp Letöltés',
                `Letöltés folyamatban...\n\n${bar} ${percentageFormatted}%\n${downloadedMB}MB / ${totalMB}MB ${eta}\n\nyt-dlp letöltés folyamatban...`,
                '#ffaa00'
              );

              lastYtDlpUpdateTime = now;
              lastYtDlpPercentage = percentage;
            }
          }
        } catch (err) {
           console.warn('[yt-dlp] Failed to parse JSON progress:', err, 'Data:', match[1]);
        }
      }
      
      if (dataStr.includes('[Merger]') && !dataStr.includes('Merging formats into')) {
        await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Előkészítése', 'Formátumok egyesítése (yt-dlp)...', '#ffaa00');
      } else if (dataStr.includes('Extracting URL')) {
        await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Előkészítése', 'URL feldolgozása (yt-dlp)...', '#ffaa00');
      } else if (dataStr.includes('Downloading webpage')) {
        await updateStatusEmbed(client, statusMessage.channelId, statusMessage.id, '🔄 Videó Előkészítése', 'Weboldal betöltése (yt-dlp)...', '#ffaa00');
      }
    };

    ytdlpProcess.stdout.on('data', data => processOutput(data, 'stdout'));
    ytdlpProcess.stderr.on('data', data => processOutput(data, 'stderr'));

    ytdlpProcess.on('error', (error) => {
      console.error('[yt-dlp] Process error:', error);
      reject(error);
    });

    ytdlpProcess.on('exit', async (code) => {
      console.log(`[yt-dlp] Exit code: ${code}`);
      if (code === 0) {
        if (finalOutputPath && fs.existsSync(finalOutputPath)) {
          console.log(`[DEBUG][yt-dlp] Download successful. Output: ${finalOutputPath}`);
          if (lastYtDlpPercentage < 100 && totalBytesForFinalUpdate > 0) {
            const downloadedMB = (totalBytesForFinalUpdate / 1024 / 1024).toFixed(2);
            const bar = progressBar(100);
            await updateStatusEmbed(
              client, statusMessage.channelId, statusMessage.id,
              '🔄 yt-dlp Letöltés',
              `Letöltés befejezve!\n\n${bar} 100.00%\n${downloadedMB}MB / ${downloadedMB}MB`,
              '#00ff00'
            );
            lastYtDlpPercentage = 100;
          }
          resolve({ success: true, files: [finalOutputPath] });
        } else {
          console.log(`[DEBUG][yt-dlp] finalOutputPath not reliably captured or does not exist ('${finalOutputPath}'). Scanning directory.`);
          try {
            const filesInTemp = fs.readdirSync(tempDir);
            const downloadedFile = filesInTemp.find(f => 
                f.startsWith(`video-${timestamp}`) && 
                /\.(mp4|mkv|webm|flv|mov|avi|mpg|mpeg|wmv|m4v|ts)$/i.test(f)
            );
            if (downloadedFile) {
              const foundPath = path.join(tempDir, downloadedFile);
              console.log(`[DEBUG][yt-dlp] Found downloaded file by scanning: ${foundPath}`);
              if (lastYtDlpPercentage < 100 && totalBytesForFinalUpdate > 0) {
                const downloadedMB = (totalBytesForFinalUpdate / 1024 / 1024).toFixed(2);
                const bar = progressBar(100);
                await updateStatusEmbed(
                  client, statusMessage.channelId, statusMessage.id,
                  '🔄 yt-dlp Letöltés',
                  `Letöltés befejezve!\n\n${bar} 100.00%\n${downloadedMB}MB / ${downloadedMB}MB`,
                  '#00ff00'
                );
                lastYtDlpPercentage = 100;
              }
              resolve({ success: true, files: [foundPath] });
            } else {
              console.error('[DEBUG][yt-dlp] Could not find output file after successful exit code and directory scan.');
              reject(new Error('yt-dlp: Could not find output file.'));
            }
          } catch (scanError) {
            console.error('[DEBUG][yt-dlp] Error scanning temp directory:', scanError);
            reject(new Error('yt-dlp: Error finding output file after download.'));
          }
        }
      } else {
        console.error(`[yt-dlp] Process exited with code ${code}.`);
        reject(new Error(`yt-dlp process exited with code ${code}. Check console logs for yt-dlp output.`));
      }
    });
  });
}

module.exports = {
  downloadWithYtDlp
};