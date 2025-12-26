const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const vapixService = require('../camera/vapixService');
const { decrypt } = require('../../utils/encryption');

/**
 * HLS Stream Manager
 * Manages live HLS streams from RTSP cameras using FFmpeg
 */
class HLSStreamManager {
  constructor() {
    this.streams = new Map(); // Map<cameraId, streamProcess>
    this.streamDir = path.join(process.env.STORAGE_PATH || '/tmp', 'hls');
  }

  /**
   * Initialize stream directory
   */
  async initialize() {
    try {
      await fs.mkdir(this.streamDir, { recursive: true });
      logger.info(`HLS stream directory initialized: ${this.streamDir}`);
    } catch (error) {
      logger.error('Failed to initialize HLS stream directory:', error);
      throw error;
    }
  }

  /**
   * Start HLS stream for a camera
   * @param {Object} camera - Camera object from database
   * @returns {Promise<string>} - Path to HLS playlist
   */
  async startStream(camera) {
    const cameraId = camera._id;

    // Check if stream already exists
    if (this.streams.has(cameraId)) {
      logger.info(`Stream already running for camera: ${cameraId}`);
      return this.getPlaylistPath(cameraId);
    }

    try {
      // Create camera-specific directory
      const cameraStreamDir = path.join(this.streamDir, cameraId);
      await fs.mkdir(cameraStreamDir, { recursive: true });

      // Debug: Log camera object
      logger.info(`Starting HLS stream - camera address: ${camera.address}, port: ${camera.port}`);

      // Decrypt camera password
      const password = decrypt(camera.credentials.password);

      // Build RTSP URL with explicit camera object
      const cameraForUrl = {
        address: camera.address,
        port: camera.port,
        credentials: {
          username: camera.credentials.username,
          password,
        },
        streamSettings: camera.streamSettings || {},
      };

      logger.info(`Building RTSP URL for HLS with: address=${cameraForUrl.address}, port=${cameraForUrl.port}`);
      const rtspUrl = vapixService.buildRTSPUrl(cameraForUrl);

      const playlistPath = path.join(cameraStreamDir, 'playlist.m3u8');
      const segmentPattern = path.join(cameraStreamDir, 'segment_%03d.ts');

      // FFmpeg command for RTSP to HLS conversion
      const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'copy', // Copy video codec (no re-encoding)
        '-c:a', 'aac', // Encode audio to AAC
        '-f', 'hls',
        '-hls_time', '2', // 2-second segments
        '-hls_list_size', '5', // Keep 5 segments in playlist
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', segmentPattern,
        playlistPath,
      ];

      logger.info(`Starting HLS stream for camera ${cameraId}`);
      logger.debug(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      // Handle stdout
      ffmpegProcess.stdout.on('data', (data) => {
        logger.debug(`FFmpeg [${cameraId}] stdout: ${data}`);
      });

      // Handle stderr (FFmpeg outputs to stderr)
      ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('error') || message.includes('Error')) {
          logger.error(`FFmpeg [${cameraId}] error: ${message}`);
        } else {
          logger.debug(`FFmpeg [${cameraId}]: ${message}`);
        }
      });

      // Handle process exit
      ffmpegProcess.on('exit', (code, signal) => {
        logger.warn(`FFmpeg process for camera ${cameraId} exited with code ${code}, signal ${signal}`);
        this.streams.delete(cameraId);

        // Auto-restart on unexpected exit
        if (code !== 0 && signal !== 'SIGTERM') {
          logger.info(`Attempting to restart stream for camera ${cameraId} in 5 seconds`);
          setTimeout(() => {
            this.startStream(camera).catch(err => {
              logger.error(`Failed to restart stream for camera ${cameraId}:`, err);
            });
          }, 5000);
        }
      });

      // Handle errors
      ffmpegProcess.on('error', (error) => {
        logger.error(`FFmpeg process error for camera ${cameraId}:`, error);
        this.streams.delete(cameraId);
      });

      // Store process reference
      this.streams.set(cameraId, {
        process: ffmpegProcess,
        startTime: new Date(),
        camera,
      });

      logger.info(`HLS stream started for camera ${cameraId}`);

      return playlistPath;
    } catch (error) {
      logger.error(`Failed to start HLS stream for camera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Stop HLS stream for a camera
   * @param {string} cameraId - Camera ID
   */
  async stopStream(cameraId) {
    const stream = this.streams.get(cameraId);

    if (!stream) {
      logger.warn(`No active stream found for camera: ${cameraId}`);
      return;
    }

    try {
      logger.info(`Stopping HLS stream for camera: ${cameraId}`);

      // Send SIGTERM to FFmpeg process
      stream.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn(`FFmpeg process for camera ${cameraId} did not exit gracefully, forcing kill`);
          stream.process.kill('SIGKILL');
          resolve();
        }, 5000);

        stream.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.streams.delete(cameraId);

      // Clean up stream files
      const cameraStreamDir = path.join(this.streamDir, cameraId);
      await fs.rm(cameraStreamDir, { recursive: true, force: true });

      logger.info(`HLS stream stopped and cleaned up for camera: ${cameraId}`);
    } catch (error) {
      logger.error(`Error stopping stream for camera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all active streams
   */
  async stopAllStreams() {
    logger.info('Stopping all HLS streams');

    const stopPromises = Array.from(this.streams.keys()).map((cameraId) =>
      this.stopStream(cameraId).catch((err) => {
        logger.error(`Error stopping stream for camera ${cameraId}:`, err);
      })
    );

    await Promise.all(stopPromises);
    logger.info('All HLS streams stopped');
  }

  /**
   * Check if stream is active for a camera
   * @param {string} cameraId - Camera ID
   * @returns {boolean}
   */
  isStreamActive(cameraId) {
    return this.streams.has(cameraId);
  }

  /**
   * Get playlist path for a camera
   * @param {string} cameraId - Camera ID
   * @returns {string} - Relative path to playlist
   */
  getPlaylistPath(cameraId) {
    return `/hls/${cameraId}/playlist.m3u8`;
  }

  /**
   * Get stream info for a camera
   * @param {string} cameraId - Camera ID
   * @returns {Object|null}
   */
  getStreamInfo(cameraId) {
    const stream = this.streams.get(cameraId);
    if (!stream) return null;

    return {
      cameraId,
      startTime: stream.startTime,
      running: true,
      playlistUrl: this.getPlaylistPath(cameraId),
    };
  }

  /**
   * Get all active streams
   * @returns {Array}
   */
  getAllStreams() {
    return Array.from(this.streams.keys()).map((cameraId) => this.getStreamInfo(cameraId));
  }

  /**
   * Get physical file path for serving
   * @param {string} cameraId - Camera ID
   * @param {string} filename - File name (playlist.m3u8 or segment_xxx.ts)
   * @returns {string}
   */
  getFilePath(cameraId, filename) {
    return path.join(this.streamDir, cameraId, filename);
  }
}

// Create singleton instance
const hlsStreamManager = new HLSStreamManager();

module.exports = hlsStreamManager;
