import api from './api';

const API_URL = '/cameras';

/**
 * Get all cameras
 * @param {Object} filters - Optional filters (status, tags, limit, offset)
 * @returns {Promise<Array>} - List of cameras
 */
export const getCameras = async (filters = {}) => {
  const response = await api.get(API_URL, { params: filters });
  return response.data;
};

/**
 * Get camera by serial number
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Camera object
 */
export const getCamera = async (serial) => {
  const response = await api.get(`${API_URL}/${serial}`);
  return response.data;
};

/**
 * Add a new camera
 * @param {Object} cameraData - Camera configuration
 * @returns {Promise<Object>} - Created camera object
 */
export const addCamera = async (cameraData) => {
  const response = await api.post(API_URL, cameraData);
  return response.data;
};

/**
 * Update camera settings
 * @param {string} serial - Camera serial number
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated camera object
 */
export const updateCamera = async (serial, updates) => {
  const response = await api.put(`${API_URL}/${serial}`, updates);
  return response.data;
};

/**
 * Delete a camera
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Success response
 */
export const deleteCamera = async (serial) => {
  const response = await api.delete(`${API_URL}/${serial}`);
  return response.data;
};

/**
 * Test camera connection
 * @param {Object} connectionData - { address, port, credentials }
 * @returns {Promise<Object>} - Test results
 */
export const testCameraConnection = async (connectionData) => {
  const response = await api.post(`${API_URL}/test`, connectionData);
  return response.data;
};

/**
 * Capture snapshot from camera
 * @param {string} serial - Camera serial number
 * @returns {Promise<Blob>} - Image blob
 */
export const captureSnapshot = async (serial) => {
  const response = await api.post(`${API_URL}/${serial}/snapshot`, null, {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * Get camera status
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Camera status
 */
export const getCameraStatus = async (serial) => {
  const response = await api.get(`${API_URL}/${serial}/status`);
  return response.data;
};

/**
 * Get supported resolutions from a camera
 * @param {Object} connectionData - { address, port, credentials }
 * @returns {Promise<Object>} - { resolutions: Array<string> }
 */
export const getSupportedResolutions = async (connectionData) => {
  const response = await api.post(`${API_URL}/resolutions`, connectionData);
  return response.data;
};
