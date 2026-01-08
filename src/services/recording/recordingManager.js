const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const vapixService = require('../camera/vapixService');
const { decrypt } = require('../../utils/encryption');
const Recording = require('../../models/Recording');
const Camera = require('../../models/Camera');

/**
 * Recording Manager
 * Manages continuous recording from RTSP cameras using FFmpeg
 * Records in 60-second MP4 segments
 */
class RecordingManager {
  constructor() {
    this.recordings = new Map(); // Map<cameraId, recordingData>
    this.storageBasePath = process.env.STORAGE_PATH || '/tmp/videox-storage';
    this.monitoringInterval = null;

    // Health monitoring configuration
    this.HEALTH_CHECK_INTERVAL_MS = 30000;      // Check every 30 seconds
    this.ACTIVITY_TIMEOUT_MS = 90000;           // Consider hung if no activity for 90 seconds
    this.SEGMENT_TIMEOUT_MS = 120000;           // Consider hung if no new segment for 120 seconds
  }

  /**
   * Initialize recording storage
   */
  async initialize() {
    try {
      await fs.mkdir(this.storageBasePath, { recursive: true });
      logger.info(`Recording storage initialized: ${this.storageBasePath}`);

      // Recover any orphaned segments from previous runs (async, don't block startup)
      this.recoverOrphanedSegments().catch(err => {
        logger.error('Error recovering orphaned segments:', err);
      });

      // Resume recordings for cameras that were recording before shutdown
      await this.resumeActiveRecordings();

      // Start monitoring for cameras that should be recording
      this.startMonitoring();
    } catch (error) {
      logger.error('Failed to initialize recording storage:', error);
      throw error;
    }
  }

  /**
   * Resume recordings for cameras that were actively recording
   * or have continuous recording enabled
   */
  async resumeActiveRecordings() {
    try {
      // Find cameras that:
      // 1. Were actively recording when server stopped, OR
      // 2. Have continuous recording mode enabled
      const cameras = await Camera.find({
        active: true,
        $or: [
          { 'status.recordingState': 'recording' },
          { 'recordingSettings.mode': 'continuous' },
        ],
      });

      logger.info(`Resuming/starting ${cameras.length} recordings`);

      for (const camera of cameras) {
        try {
          // Only start if not already recording
          if (!this.recordings.has(camera._id)) {
            await this.startRecording(camera);
            logger.info(`Auto-started recording for camera ${camera._id} (mode: ${camera.recordingSettings?.mode || 'default'})`);
          }
        } catch (error) {
          logger.error(`Failed to resume recording for camera ${camera._id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error resuming recordings:', error);
    }
  }

  /**
   * Recover orphaned segments from previous runs
   * Scans the recordings directory for .mp4 files not in the database and imports them
   */
  async recoverOrphanedSegments() {
    try {
      const recordingsPath = path.join(this.storageBasePath, 'recordings');

      // Check if recordings directory exists
      try {
        await fs.access(recordingsPath);
      } catch {
        logger.info('No recordings directory found, skipping orphan recovery');
        return;
      }

      // Get all cameras
      const cameras = await Camera.find({ active: true });

      let recoveredCount = 0;
      let errorCount = 0;

      // Scan each camera's directory
      for (const camera of cameras) {
        const cameraDir = path.join(recordingsPath, camera._id.toString());

        try {
          await fs.access(cameraDir);
        } catch {
          continue; // Camera directory doesn't exist
        }

        // Recursively find all .mp4 files
        const mp4Files = await this.findMp4Files(cameraDir);

        for (const filePath of mp4Files) {
          try {
            // Check if already in database
            const existing = await Recording.findOne({ filePath });
            if (existing) {
              continue;
            }

            // Parse timestamp from filename (format: <cameraId>_segment_YYYYMMDD_HHMMSS.mp4)
            const filename = path.basename(filePath);
            const match = filename.match(/segment_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp4$/);

            if (!match) {
              logger.warn(`Cannot parse timestamp from orphaned file: ${filename}`);
              continue;
            }

            const [, year, month, day, hour, minute, second] = match;
            const startTime = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hour),
              parseInt(minute),
              parseInt(second)
            );

            // Get file stats
            const stats = await fs.stat(filePath);

            if (stats.size < 1024) {
              logger.warn(`Skipping small orphaned file (${stats.size} bytes): ${filename}`);
              continue;
            }

            // Create recording entry
            const recording = new Recording({
              cameraId: camera._id,
              filename,
              filePath,
              startTime,
              endTime: new Date(startTime.getTime() + 60000),
              duration: 60,
              size: stats.size,
              status: 'completed',
              metadata: {
                resolution: camera.streamSettings?.resolution || camera.recordingSettings?.resolution,
                codec: 'h264',
                recovered: true, // Mark as recovered for tracking
              },
            });

            recording.calculateRetentionDate(camera.retentionDays || 30);
            await recording.save();

            recoveredCount++;
            logger.info(`Recovered orphaned segment: ${filename}`);
          } catch (err) {
            errorCount++;
            logger.error(`Error recovering segment ${filePath}:`, err);
          }
        }
      }

      if (recoveredCount > 0 || errorCount > 0) {
        logger.info(`Orphan recovery complete: ${recoveredCount} recovered, ${errorCount} errors`);
      }
    } catch (error) {
      logger.error('Error in orphan recovery:', error);
    }
  }

  /**
   * Recursively find all .mp4 files in a directory
   * @param {string} dir - Directory to search
   * @returns {Promise<string[]>} Array of file paths
   */
  async findMp4Files(dir) {
    const files = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findMp4Files(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.mp4')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      logger.debug(`Error reading directory ${dir}: ${err.message}`);
    }

    return files;
  }

  /**
   * Start recording for a camera
   * @param {Object} camera - Camera object from database
   */
  async startRecording(camera) {
    const cameraId = camera._id;

    // Check if already recording
    if (this.recordings.has(cameraId)) {
      logger.info(`Recording already active for camera: ${cameraId}`);
      return;
    }

    try {
      // Debug: Log camera object
      logger.info(`Starting recording - camera address: ${camera.address}, port: ${camera.port}`);

      // Create camera storage directory structure
      const cameraDir = path.join(this.storageBasePath, 'recordings', cameraId);
      await fs.mkdir(cameraDir, { recursive: true });

      // Decrypt camera password
      const password = decrypt(camera.credentials.password);

      // Build RTSP URL
      const cameraForUrl = {
        address: camera.address,
        port: camera.port,
        credentials: {
          username: camera.credentials.username,
          password,
        },
        streamSettings: camera.streamSettings || {},
      };

      logger.info(`Building RTSP URL with: address=${cameraForUrl.address}, port=${cameraForUrl.port}`);
      const rtspUrl = vapixService.buildRTSPUrl(cameraForUrl);

      // Create directory structure for current time
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const currentHourDir = path.join(cameraDir, String(year), month, day, hour);
      await fs.mkdir(currentHourDir, { recursive: true });

      // Build FFmpeg command for segmented recording
      // Include camera ID (serial number) in filename to ensure uniqueness across cameras
      const segmentPattern = path.join(cameraDir, '%Y', '%m', '%d', '%H', `${camera._id}_segment_%Y%m%d_%H%M%S.mp4`);

      const ffmpegArgs = [
        // RTSP connection settings with timeouts to detect disconnected cameras
        '-rtsp_transport', 'tcp',
        '-stimeout', '10000000',     // Socket timeout: 10 seconds (in microseconds)
        '-timeout', '10000000',      // I/O timeout: 10 seconds (in microseconds)
        '-reconnect', '1',           // Enable automatic reconnection
        '-reconnect_streamed', '1',  // Reconnect even on streamed sources
        '-reconnect_delay_max', '5', // Max delay between reconnection attempts: 5 seconds
        '-i', rtspUrl,
        '-c:v', 'libx264', // Re-encode video to control keyframes
        '-preset', 'ultrafast', // Fastest encoding for real-time recording
        '-tune', 'zerolatency', // Low-latency tuning for live streaming
        '-g', '60', // Keyframe interval: 1 keyframe every 60 frames (2 sec at 30fps)
        '-keyint_min', '60', // Minimum keyframe interval
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // Force keyframe every 2 seconds
        '-sc_threshold', '0', // Disable scene change detection (consistent keyframes)
        '-c:a', 'aac', // Encode audio to AAC
        '-f', 'segment',
        '-segment_time', '60', // 60-second segments
        '-segment_format', 'mp4',
        '-segment_atclocktime', '1', // Align segments with clock time
        '-strftime', '1', // Enable strftime in filename
        '-reset_timestamps', '1',
        '-movflags', '+faststart', // Enable streaming-friendly MP4
        segmentPattern,
      ];

      logger.info(`Starting recording for camera ${cameraId}`);
      logger.debug(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

      // Track current segment file (will be stored in recordingData after it's created)
      let currentSegmentPath = null;
      let segmentStartTime = null;

      // Handle stdout
      ffmpegProcess.stdout.on('data', (data) => {
        logger.debug(`FFmpeg [${cameraId}] stdout: ${data}`);
        // Update activity timestamp
        const recordingData = this.recordings.get(cameraId);
        if (recordingData) {
          recordingData.lastActivityTime = new Date();
        }
      });

      // Handle stderr (FFmpeg outputs progress to stderr)
      ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();

        // Update activity timestamp on any FFmpeg output
        const recordingData = this.recordings.get(cameraId);
        if (recordingData) {
          recordingData.lastActivityTime = new Date();
        }

        // Detect when a new segment starts
        if (message.includes('Opening') && message.includes('.mp4')) {
          const match = message.match(/Opening '([^']+)'/);
          if (match) {
            const newSegmentPath = match[1];
            const newSegmentStartTime = new Date();

            // When a new segment starts, finalize the PREVIOUS segment
            // This is more reliable than trying to detect segment completion
            if (currentSegmentPath && segmentStartTime) {
              logger.info(`New segment detected, finalizing previous: ${currentSegmentPath}`);
              this.finalizeSegment(camera, currentSegmentPath, segmentStartTime).catch(err => {
                logger.error(`Error finalizing segment ${currentSegmentPath}:`, err);
              });
            }

            // Update current segment tracking
            currentSegmentPath = newSegmentPath;
            segmentStartTime = newSegmentStartTime;

            // Store in recording data for health monitoring and recovery
            if (recordingData) {
              recordingData.currentSegmentPath = newSegmentPath;
              recordingData.segmentStartTime = newSegmentStartTime;
              recordingData.lastSegmentTime = new Date();
            }

            logger.debug(`New segment started: ${currentSegmentPath}`);
          }
        }

        if (message.includes('error') || message.includes('Error')) {
          logger.error(`FFmpeg [${cameraId}] error: ${message}`);
        } else {
          logger.debug(`FFmpeg [${cameraId}]: ${message}`);
        }
      });

      // Handle process exit
      ffmpegProcess.on('exit', async (code, signal) => {
        logger.warn(`Recording process for camera ${cameraId} exited with code ${code}, signal ${signal}`);

        // Finalize the last segment if it exists
        if (currentSegmentPath && segmentStartTime) {
          logger.info(`Recording stopped, finalizing last segment: ${currentSegmentPath}`);
          try {
            await this.finalizeSegment(camera, currentSegmentPath, segmentStartTime);
          } catch (err) {
            logger.error(`Error finalizing last segment ${currentSegmentPath}:`, err);
          }
        }

        this.recordings.delete(cameraId);

        // Update camera status
        try {
          await Camera.findByIdAndUpdate(cameraId, {
            'status.recordingState': 'stopped',
          });
        } catch (error) {
          logger.error(`Error updating camera status for ${cameraId}:`, error);
        }

        // Auto-restart on unexpected exit (but not on SIGTERM)
        if (code !== 0 && signal !== 'SIGTERM') {
          logger.info(`Attempting to restart recording for camera ${cameraId} in 10 seconds`);
          setTimeout(async () => {
            try {
              const cam = await Camera.findById(cameraId);
              if (cam && cam.active && cam.status.recordingState !== 'stopped') {
                await this.startRecording(cam);
              }
            } catch (err) {
              logger.error(`Failed to restart recording for camera ${cameraId}:`, err);
            }
          }, 10000);
        }
      });

      // Handle errors
      ffmpegProcess.on('error', (error) => {
        logger.error(`FFmpeg process error for camera ${cameraId}:`, error);
        this.recordings.delete(cameraId);
      });

      // Store process reference with health monitoring data
      const recordingData = {
        process: ffmpegProcess,
        camera,
        startTime: new Date(),
        lastActivityTime: new Date(),  // Track last FFmpeg activity
        lastSegmentTime: null,         // Track when last segment was created
        currentSegmentPath: null,      // Track current segment for recovery
        segmentStartTime: null,        // Track current segment start time
      };
      this.recordings.set(cameraId, recordingData);

      // Update camera status
      await Camera.findByIdAndUpdate(cameraId, {
        'status.recordingState': 'recording',
        'status.connectionState': 'online',
        'status.lastSeen': new Date(),
      });

      logger.info(`Recording started for camera ${cameraId}`);
    } catch (error) {
      logger.error(`Failed to start recording for camera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Finalize a completed segment by creating metadata in MongoDB
   * Includes retry logic for transient database errors
   * @param {Object} camera - Camera object
   * @param {string} segmentPath - Full path to segment file
   * @param {Date} startTime - Segment start time
   * @param {number} retryCount - Current retry attempt (internal use)
   */
  async finalizeSegment(camera, segmentPath, startTime, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000;

    try {
      // Check if this segment is already in the database
      const existingRecording = await Recording.findOne({ filePath: segmentPath });
      if (existingRecording) {
        logger.debug(`Segment already exists in database: ${segmentPath}`);
        return;
      }

      // Check if file exists and get stats
      let stats;
      try {
        stats = await fs.stat(segmentPath);
      } catch (err) {
        if (err.code === 'ENOENT') {
          logger.warn(`Segment file does not exist (may still be writing): ${segmentPath}`);
          // File might still be writing, retry after a delay
          if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2));
            return this.finalizeSegment(camera, segmentPath, startTime, retryCount + 1);
          }
          return;
        }
        throw err;
      }

      if (!stats.isFile()) {
        logger.warn(`Segment path is not a file: ${segmentPath}`);
        return;
      }

      // Skip very small files (likely incomplete)
      if (stats.size < 1024) {
        logger.warn(`Segment file too small (${stats.size} bytes), skipping: ${segmentPath}`);
        return;
      }

      // Extract filename
      const filename = path.basename(segmentPath);

      // Calculate end time (60 seconds after start)
      const endTime = new Date(startTime.getTime() + 60000);

      // Create recording metadata in MongoDB
      const recording = new Recording({
        cameraId: camera._id,
        filename,
        filePath: segmentPath,
        startTime,
        endTime,
        duration: 60,
        size: stats.size,
        status: 'completed',
        metadata: {
          resolution: camera.streamSettings?.resolution || camera.recordingSettings?.resolution,
          codec: 'h264',
          bitrate: camera.recordingSettings?.bitrate,
          fps: camera.recordingSettings?.fps,
        },
      });

      // Calculate retention date
      recording.calculateRetentionDate(camera.retentionDays || 30);

      await recording.save();

      // Update camera's lastSeen to indicate it's actively recording
      await Camera.findByIdAndUpdate(camera._id, {
        'status.lastSeen': new Date(),
        'status.connectionState': 'online',
      });

      logger.info(`Segment finalized: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      // Retry on transient database errors
      if (retryCount < MAX_RETRIES && (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError')) {
        logger.warn(`Transient error finalizing segment ${segmentPath}, retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
        return this.finalizeSegment(camera, segmentPath, startTime, retryCount + 1);
      }
      logger.error(`Error finalizing segment ${segmentPath}:`, error);
    }
  }

  /**
   * Stop recording for a camera
   * @param {string} cameraId - Camera ID
   */
  async stopRecording(cameraId) {
    const recording = this.recordings.get(cameraId);

    if (!recording) {
      logger.warn(`No active recording found for camera: ${cameraId}`);
      return;
    }

    try {
      logger.info(`Stopping recording for camera: ${cameraId}`);

      // Send SIGTERM to FFmpeg process
      recording.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn(`FFmpeg process for camera ${cameraId} did not exit gracefully, forcing kill`);
          recording.process.kill('SIGKILL');
          resolve();
        }, 5000);

        recording.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.recordings.delete(cameraId);

      // Update camera status
      await Camera.findByIdAndUpdate(cameraId, {
        'status.recordingState': 'stopped',
      });

      logger.info(`Recording stopped for camera: ${cameraId}`);
    } catch (error) {
      logger.error(`Error stopping recording for camera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Stop all active recordings
   */
  async stopAllRecordings() {
    logger.info('Stopping all recordings');

    const stopPromises = Array.from(this.recordings.keys()).map((cameraId) =>
      this.stopRecording(cameraId).catch((err) => {
        logger.error(`Error stopping recording for camera ${cameraId}:`, err);
      })
    );

    await Promise.all(stopPromises);
    logger.info('All recordings stopped');
  }

  /**
   * Check if recording is active for a camera
   * @param {string} cameraId - Camera ID
   * @returns {boolean}
   */
  isRecording(cameraId) {
    return this.recordings.has(cameraId);
  }

  /**
   * Get recording info for a camera
   * @param {string} cameraId - Camera ID
   * @returns {Object|null}
   */
  getRecordingInfo(cameraId) {
    const recording = this.recordings.get(cameraId);
    if (!recording) return null;

    return {
      cameraId,
      startTime: recording.startTime,
      running: true,
    };
  }

  /**
   * Get all active recordings
   * @returns {Array}
   */
  getAllRecordings() {
    return Array.from(this.recordings.keys()).map((cameraId) => this.getRecordingInfo(cameraId));
  }

  /**
   * Check recording health and restart if needed
   * Detects hung processes and cameras that should be recording but aren't
   * @private
   */
  async checkRecordingHealth() {
    try {
      const now = new Date();

      // First, check for hung processes in active recordings
      for (const [cameraId, recordingData] of this.recordings.entries()) {
        const timeSinceActivity = now - recordingData.lastActivityTime;
        const timeSinceSegment = recordingData.lastSegmentTime
          ? now - recordingData.lastSegmentTime
          : now - recordingData.startTime;

        // Check if process is hung (no activity for too long)
        if (timeSinceActivity > this.ACTIVITY_TIMEOUT_MS) {
          logger.warn(`Camera ${cameraId}: FFmpeg appears hung (no activity for ${Math.round(timeSinceActivity / 1000)}s). Killing and restarting...`);
          await this.killAndRestartRecording(cameraId, recordingData);
          continue;
        }

        // Check if no segments are being created (RTSP might be connected but not streaming data)
        if (timeSinceSegment > this.SEGMENT_TIMEOUT_MS) {
          logger.warn(`Camera ${cameraId}: No new segments for ${Math.round(timeSinceSegment / 1000)}s. Killing and restarting...`);
          await this.killAndRestartRecording(cameraId, recordingData);
          continue;
        }
      }

      // Find all cameras that should be recording (continuous mode, active)
      const cameras = await Camera.find({
        active: true,
        'recordingSettings.mode': 'continuous',
      });

      for (const camera of cameras) {
        const cameraId = camera._id;
        const isRecording = this.recordings.has(cameraId);

        // If camera should be recording but isn't, start it
        if (!isRecording) {
          logger.warn(`Camera ${cameraId} should be recording but isn't. Auto-starting...`);
          try {
            await this.startRecording(camera);
            logger.info(`Auto-started recording for camera ${cameraId}`);
          } catch (error) {
            logger.error(`Failed to auto-start recording for camera ${cameraId}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error during recording health check:', error);
    }
  }

  /**
   * Kill a hung recording process and restart it
   * @param {string} cameraId - Camera ID
   * @param {Object} recordingData - Recording data from recordings Map
   * @private
   */
  async killAndRestartRecording(cameraId, recordingData) {
    try {
      // Try to finalize any current segment before killing
      if (recordingData.currentSegmentPath && recordingData.segmentStartTime) {
        logger.info(`Attempting to finalize segment before restart: ${recordingData.currentSegmentPath}`);
        try {
          await this.finalizeSegment(recordingData.camera, recordingData.currentSegmentPath, recordingData.segmentStartTime);
        } catch (err) {
          logger.error(`Error finalizing segment during restart: ${err.message}`);
        }
      }

      // Force kill the process
      try {
        recordingData.process.kill('SIGKILL');
      } catch (err) {
        logger.debug(`Error killing process: ${err.message}`);
      }

      // Remove from recordings map
      this.recordings.delete(cameraId);

      // Update camera status to reflect the issue
      await Camera.findByIdAndUpdate(cameraId, {
        'status.recordingState': 'error',
        'status.lastError': 'Recording process hung - restarting',
        'status.lastErrorTime': new Date(),
      });

      // Wait briefly before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Restart recording
      const camera = await Camera.findById(cameraId);
      if (camera && camera.active) {
        await this.startRecording(camera);
        logger.info(`Successfully restarted recording for camera ${cameraId}`);
      }
    } catch (error) {
      logger.error(`Error during kill and restart for camera ${cameraId}:`, error);
    }
  }

  /**
   * Start monitoring for cameras that should be recording
   * Checks every 30 seconds for hung processes and missing recordings
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      logger.warn('Monitoring already started');
      return;
    }

    logger.info(`Starting recording health monitoring (${this.HEALTH_CHECK_INTERVAL_MS / 1000} second interval)`);

    // Run health check at configured interval
    this.monitoringInterval = setInterval(() => {
      this.checkRecordingHealth().catch((err) => {
        logger.error('Error in monitoring interval:', err);
      });
    }, this.HEALTH_CHECK_INTERVAL_MS);

    // Also run immediately on startup
    this.checkRecordingHealth().catch((err) => {
      logger.error('Error in initial health check:', err);
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Recording health monitoring stopped');
    }
  }
}

// Create singleton instance
const recordingManager = new RecordingManager();

module.exports = recordingManager;
