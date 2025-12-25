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
    this.recordings = new Map(); // Map<cameraId, recordingProcess>
    this.storageBasePath = process.env.STORAGE_PATH || '/tmp/videox-storage';
  }

  /**
   * Initialize recording storage
   */
  async initialize() {
    try {
      await fs.mkdir(this.storageBasePath, { recursive: true });
      logger.info(`Recording storage initialized: ${this.storageBasePath}`);

      // Resume recordings for cameras that were recording before shutdown
      await this.resumeActiveRecordings();
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
      const segmentPattern = path.join(cameraDir, '%Y', '%m', '%d', '%H', 'segment_%Y%m%d_%H%M%S.mp4');

      const ffmpegArgs = [
        '-rtsp_transport', 'tcp',
        '-i', rtspUrl,
        '-c:v', 'copy', // Copy video codec (no re-encoding)
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

      // Track current segment file
      let currentSegmentPath = null;
      let segmentStartTime = null;

      // Handle stdout
      ffmpegProcess.stdout.on('data', (data) => {
        logger.debug(`FFmpeg [${cameraId}] stdout: ${data}`);
      });

      // Handle stderr (FFmpeg outputs progress to stderr)
      ffmpegProcess.stderr.on('data', (data) => {
        const message = data.toString();

        // Detect when a new segment starts
        if (message.includes('Opening') && message.includes('.mp4')) {
          const match = message.match(/Opening '([^']+)'/);
          if (match) {
            currentSegmentPath = match[1];
            segmentStartTime = new Date();
            logger.debug(`New segment started: ${currentSegmentPath}`);
          }
        }

        // Detect when segment is finalized
        if (message.includes('segment:') || message.includes('Closing')) {
          if (currentSegmentPath && segmentStartTime) {
            this.finalizeSegment(camera, currentSegmentPath, segmentStartTime).catch(err => {
              logger.error(`Error finalizing segment ${currentSegmentPath}:`, err);
            });
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

      // Store process reference
      this.recordings.set(cameraId, {
        process: ffmpegProcess,
        camera,
        startTime: new Date(),
      });

      // Update camera status
      await Camera.findByIdAndUpdate(cameraId, {
        'status.recordingState': 'recording',
      });

      logger.info(`Recording started for camera ${cameraId}`);
    } catch (error) {
      logger.error(`Failed to start recording for camera ${cameraId}:`, error);
      throw error;
    }
  }

  /**
   * Finalize a completed segment by creating metadata in MongoDB
   * @param {Object} camera - Camera object
   * @param {string} segmentPath - Full path to segment file
   * @param {Date} startTime - Segment start time
   */
  async finalizeSegment(camera, segmentPath, startTime) {
    try {
      // Check if file exists and get stats
      const stats = await fs.stat(segmentPath);

      if (!stats.isFile()) {
        logger.warn(`Segment path is not a file: ${segmentPath}`);
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

      logger.info(`Segment finalized: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
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
}

// Create singleton instance
const recordingManager = new RecordingManager();

module.exports = recordingManager;
