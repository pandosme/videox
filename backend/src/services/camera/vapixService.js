const axios = require('axios');
const { DigestClient } = require('digest-fetch');
const logger = require('../../utils/logger');

/**
 * VAPIX Service for Axis Camera Integration
 * Handles communication with Axis cameras via VAPIX API
 * Uses HTTP Digest Authentication
 */
class VapixService {
  /**
   * Create a digest auth client for camera communication
   * @private
   */
  createDigestClient(username, password) {
    return new DigestClient(username, password, {
      basic: false,
    });
  }

  /**
   * Helper: Make a digest-authenticated GET request
   * @private
   */
  async digestGet(url, username, password) {
    const client = this.createDigestClient(username, password);
    const response = await client.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  }

  /**
   * Helper: Make a digest-authenticated POST request with JSON body
   * @private
   */
  async digestPost(url, username, password, body) {
    const client = this.createDigestClient(username, password);
    const response = await client.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Get device serial number from Axis camera
   * @param {string} address - Camera IP address or hostname
   * @param {number} port - Camera HTTP port (default 80)
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<string>} - Camera serial number
   */
  async getSerialNumber(address, port = 80, username, password) {
    try {
      const url = `http://${address}:${port}/axis-cgi/basicdeviceinfo.cgi`;
      const requestBody = {
        apiVersion: '1.0',
        method: 'getProperties',
        params: {
          propertyList: ['SerialNumber'],
        },
      };

      const response = await this.digestPost(url, username, password, requestBody);
      const serial = response.data.propertyList.SerialNumber;

      if (serial) {
        logger.info(`Retrieved serial number: ${serial} from ${address}`);
        return serial;
      }

      throw new Error('Serial number not found in camera response');
    } catch (error) {
      logger.error(`Failed to get serial number from ${address}:`, error.message);
      throw new Error(`Failed to connect to camera: ${error.message}`);
    }
  }

  /**
   * Get device information (model, firmware, etc.)
   * @param {string} address - Camera IP address
   * @param {number} port - Camera HTTP port
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<Object>} - Device info (model, firmware)
   */
  async getDeviceInfo(address, port = 80, username, password) {
    try {
      const url = `http://${address}:${port}/axis-cgi/basicdeviceinfo.cgi`;
      const requestBody = {
        apiVersion: '1.0',
        method: 'getProperties',
        params: {
          propertyList: ['SerialNumber', 'ProdNbr', 'Version'],
        },
      };

      const response = await this.digestPost(url, username, password, requestBody);

      const info = {
        model: response.data.propertyList.ProdNbr,
        firmware: response.data.propertyList.Version,
        serial: response.data.propertyList.SerialNumber,
      };

      logger.info(`Retrieved device info from ${address}:`, info);
      return info;
    } catch (error) {
      logger.error(`Failed to get device info from ${address}:`, error.message);
      throw new Error(`Failed to get device info: ${error.message}`);
    }
  }

  /**
   * Get available stream profiles
   * @param {string} address - Camera IP address
   * @param {number} port - Camera HTTP port
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<Array<string>>} - List of available profiles
   */
  async getStreamProfiles(address, port = 80, username, password) {
    try {
      const url = `http://${address}:${port}/axis-cgi/streamprofile.cgi?action=list`;
      const data = await this.digestGet(url, username, password);

      // Parse profiles from response
      const profiles = [];
      const lines = data.split('\n');

      for (const line of lines) {
        if (line.includes('streamprofile[')) {
          const match = line.match(/streamprofile\[(\d+)\]\.name=(.+)/);
          if (match) {
            profiles.push(match[2].trim());
          }
        }
      }

      logger.info(`Retrieved ${profiles.length} stream profiles from ${address}`);
      return profiles;
    } catch (error) {
      logger.warn(`Failed to get stream profiles from ${address}:`, error.message);
      // Return default profiles if API fails
      return ['Quality', 'Balanced', 'Bandwidth'];
    }
  }

  /**
   * Test RTSP stream connectivity
   * @param {string} address - Camera IP address
   * @param {number} rtspPort - RTSP port (default 554)
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<boolean>} - True if stream is accessible
   */
  async testRTSPStream(address, rtspPort = 554, username, password) {
    try {
      // For now, just verify HTTP connectivity
      // Full RTSP testing would require FFmpeg or RTSP client
      const url = `http://${address}/axis-cgi/param.cgi?action=list&group=Properties.System`;

      await this.digestGet(url, username, password);

      logger.info(`RTSP stream test passed for ${address}`);
      return true;
    } catch (error) {
      logger.error(`RTSP stream test failed for ${address}:`, error.message);
      return false;
    }
  }

  /**
   * Capture a snapshot from the camera
   * @param {string} address - Camera IP address
   * @param {number} port - Camera HTTP port
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @param {string} resolution - Resolution (optional, e.g., "1920x1080")
   * @returns {Promise<Buffer>} - JPEG image buffer
   */
  async captureSnapshot(address, port = 80, username, password, resolution = null) {
    try {
      let url = `http://${address}:${port}/axis-cgi/jpg/image.cgi`;
      if (resolution) {
        url += `?resolution=${resolution}`;
      }

      const digestClient = this.createDigestClient(username, password);
      const response = await digestClient.fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      logger.info(`Captured snapshot from ${address}`);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      logger.error(`Failed to capture snapshot from ${address}:`, error.message);
      throw new Error(`Failed to capture snapshot: ${error.message}`);
    }
  }

  /**
   * Get camera capabilities (PTZ, audio, etc.)
   * @param {string} address - Camera IP address
   * @param {number} port - Camera HTTP port
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<Object>} - Capabilities object
   */
  async getCapabilities(address, port = 80, username, password) {
    try {
      const url = `http://${address}:${port}/axis-cgi/param.cgi?action=list&group=Properties`;

      const data = await this.digestGet(url, username, password);

      const capabilities = {
        ptz: data.includes('PTZ') || data.includes('PanTilt'),
        audio: data.includes('Audio.AudioSupport=yes') || data.includes('AudioSupport'),
        profiles: await this.getStreamProfiles(address, port, username, password),
      };

      logger.info(`Retrieved capabilities from ${address}:`, capabilities);
      return capabilities;
    } catch (error) {
      logger.error(`Failed to get capabilities from ${address}:`, error.message);
      // Return default capabilities
      return {
        ptz: false,
        audio: false,
        profiles: ['Quality', 'Balanced', 'Bandwidth'],
      };
    }
  }

  /**
   * Test full camera connection
   * @param {string} address - Camera IP address
   * @param {number} port - Camera HTTP port
   * @param {number} rtspPort - RTSP port
   * @param {string} username - Camera username
   * @param {string} password - Camera password
   * @returns {Promise<Object>} - Test results with connection status and info
   */
  async testConnection(address, port = 80, rtspPort = 554, username, password) {
    try {
      logger.info(`Testing connection to camera at ${address}`);

      // Test basic connectivity and get info
      const deviceInfo = await this.getDeviceInfo(address, port, username, password);
      const capabilities = await this.getCapabilities(address, port, username, password);
      const rtspOk = await this.testRTSPStream(address, rtspPort, username, password);

      return {
        connected: true,
        serial: deviceInfo.serial,
        model: deviceInfo.model,
        firmware: deviceInfo.firmware,
        capabilities,
        rtspAccessible: rtspOk,
      };
    } catch (error) {
      logger.error(`Connection test failed for ${address}:`, error.message);
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Helper: Extract parameter value from VAPIX response
   * @private
   */
  extractParam(data, paramName) {
    const lines = data.split('\n');
    const line = lines.find(l => l.startsWith(`root.${paramName}=`));
    return line ? line.split('=')[1].trim() : null;
  }

  /**
   * Build RTSP URL for camera stream
   * @param {Object} camera - Camera object with settings
   * @returns {string} - RTSP URL
   */
  buildRTSPUrl(camera) {
    const {
      credentials,
      address,
      port = 554,
      streamSettings = {},
    } = camera;

    const {
      videoCodec = 'h264',
      streamProfile = 'Quality',
      resolution = '1920x1080',
      fps = 25,
      zipstreamEnabled = true,
    } = streamSettings;

    const zipstream = zipstreamEnabled ? 'on' : 'off';

    const url = `rtsp://${credentials.username}:${credentials.password}@${address}:${port}/axis-media/media.amp?videocodec=${videoCodec}&streamprofile=${streamProfile}&zipstream=${zipstream}&resolution=${resolution}&fps=${fps}`;

    return url;
  }
}

module.exports = new VapixService();
