const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { EventEmitter } = require('events');
const logger = require('../../utils/logger');
const vapixService = require('../camera/vapixService');
const { decrypt } = require('../../utils/encryption');

/**
 * HLS Stream Manager
 * Manages live HLS streams from RTSP cameras using FFmpeg
 */
class HLSStreamManager {
  constructor() {
    this.streams = new Map();          // Map<cameraId, streamData>
    this.streamDir = path.join(process.env.STORAGE_PATH || '/tmp', 'hls');
    this.playlistEmitters = new Map(); // Map<cameraId, EventEmitter> – LL-HLS blocking requests
    this.playlistCache = new Map();    // Map<cameraId, { msn, part, content }>
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
      const segmentPattern = path.join(cameraStreamDir, 'seg_%04d.m4s');
      const initFilename = 'init.mp4';

      // LL-HLS FFmpeg command: fMP4 segments with 500ms parts (~1s latency)
      // -c:v copy preserves H.264/Zipstream from camera – no re-encoding
      const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'copy',                          // Copy H.264 directly – no re-encoding
        '-c:a', 'copy',                          // Copy AAC audio from camera
        '-f', 'hls',
        '-hls_time', '2',                        // Target segment duration (seconds)
        '-hls_list_size', '6',                   // Segments to keep in playlist
        '-hls_flags', 'low_latency+delete_segments+append_list+independent_segments',
        '-hls_part_duration', '0.5',             // 500ms parts (LL-HLS)
        '-hls_segment_type', 'fmp4',             // fMP4 required for LL-HLS
        '-hls_fmp4_init_filename', initFilename,
        '-hls_segment_filename', segmentPattern,
        playlistPath,
      ];

      // Set up EventEmitter for LL-HLS blocking playlist requests (HLS spec §6.2.5.2)
      const emitter = new EventEmitter();
      emitter.setMaxListeners(100);
      this.playlistEmitters.set(cameraId, emitter);

      logger.info(`Starting LL-HLS stream for camera ${cameraId}`);
      logger.debug(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      // Watch the stream directory so blocked clients are notified on each playlist write
      let playlistWatcher = null;
      try {
        playlistWatcher = fsSync.watch(cameraStreamDir, (event, filename) => {
          if (filename === 'playlist.m3u8') {
            this.handlePlaylistUpdate(cameraId, playlistPath).catch(() => {});
          }
        });
      } catch (watchErr) {
        logger.warn(`Could not watch playlist for camera ${cameraId}: ${watchErr.message}`);
      }

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
        watcher: playlistWatcher,
        startTime: new Date(),
        camera,
      });

      logger.info(`LL-HLS stream started for camera ${cameraId}`);

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

      // Clean up LL-HLS resources
      if (stream.watcher) stream.watcher.close();
      const emitter = this.playlistEmitters.get(cameraId);
      if (emitter) {
        emitter.removeAllListeners();
        this.playlistEmitters.delete(cameraId);
      }
      this.playlistCache.delete(cameraId);

      this.streams.delete(cameraId);

      // Clean up stream files
      const cameraStreamDir = path.join(this.streamDir, cameraId);
      await fs.rm(cameraStreamDir, { recursive: true, force: true });

      logger.info(`LL-HLS stream stopped and cleaned up for camera: ${cameraId}`);
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

  /**
   * Read updated playlist, refresh cache, and notify any blocked clients
   */
  async handlePlaylistUpdate(cameraId, playlistPath) {
    try {
      const content = await fs.readFile(playlistPath, 'utf8');
      const { msn, part } = this.parsePlaylistInfo(content);
      this.playlistCache.set(cameraId, { msn, part, content });
      const emitter = this.playlistEmitters.get(cameraId);
      if (emitter) emitter.emit('update', { msn, part });
    } catch {
      // Playlist may not exist yet or be mid-write – ignore
    }
  }

  /**
   * Parse EXT-X-MEDIA-SEQUENCE and the latest part index from an LL-HLS playlist
   */
  parsePlaylistInfo(content) {
    const msnMatch = content.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    const msn = msnMatch ? parseInt(msnMatch[1], 10) : 0;

    // Count EXT-X-PART entries that appear after the last complete segment (#EXTINF)
    const lastInfIndex = content.lastIndexOf('#EXTINF:');
    const tail = lastInfIndex >= 0 ? content.slice(lastInfIndex) : content;
    const partMatches = tail.match(/#EXT-X-PART:/g);
    const part = partMatches ? partMatches.length - 1 : -1;

    return { msn, part };
  }

  /**
   * Check whether a cached state satisfies an LL-HLS blocking request
   */
  isSatisfied(cached, targetMsn, targetPart) {
    if (!cached) return false;
    if (cached.msn > targetMsn) return true;
    if (cached.msn === targetMsn) {
      if (targetPart === -1) return true;
      if (cached.part >= targetPart) return true;
    }
    return false;
  }

  /**
   * Block until the playlist reaches the requested MSN/part (LL-HLS spec §6.2.5.2)
   * @param {string} cameraId
   * @param {number} targetMsn  - Target EXT-X-MEDIA-SEQUENCE number
   * @param {number} targetPart - Target part index (-1 = any part of that segment)
   * @param {number} timeout    - Maximum wait in milliseconds
   * @returns {Promise<string>} Playlist content
   */
  async waitForPlaylist(cameraId, targetMsn, targetPart, timeout = 10000) {
    const cached = this.playlistCache.get(cameraId);
    if (this.isSatisfied(cached, targetMsn, targetPart)) return cached.content;

    const emitter = this.playlistEmitters.get(cameraId);
    if (!emitter) throw new Error('No active stream for this camera');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        emitter.removeListener('update', onUpdate);
        reject(new Error('Timeout waiting for playlist part'));
      }, timeout);

      const onUpdate = () => {
        const latest = this.playlistCache.get(cameraId);
        if (this.isSatisfied(latest, targetMsn, targetPart)) {
          clearTimeout(timer);
          emitter.removeListener('update', onUpdate);
          resolve(latest.content);
        }
      };

      emitter.on('update', onUpdate);
    });
  }

  /**
   * Return the latest cached playlist (for non-blocking requests)
   * @param {string} cameraId
   * @returns {string|null}
   */
  getLatestPlaylist(cameraId) {
    return this.playlistCache.get(cameraId)?.content ?? null;
  }
}

// Create singleton instance
const hlsStreamManager = new HLSStreamManager();

module.exports = hlsStreamManager;
