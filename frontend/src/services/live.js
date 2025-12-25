import api from './api';

/**
 * Start live stream for a camera
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Stream info with playlist URL
 */
export const startLiveStream = async (serial) => {
  const response = await api.get(`/live/${serial}/start`);
  return response.data;
};

/**
 * Stop live stream for a camera
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Success response
 */
export const stopLiveStream = async (serial) => {
  const response = await api.get(`/live/${serial}/stop`);
  return response.data;
};

/**
 * Get stream status for a camera
 * @param {string} serial - Camera serial number
 * @returns {Promise<Object>} - Stream status
 */
export const getStreamStatus = async (serial) => {
  const response = await api.get(`/live/${serial}/status`);
  return response.data;
};

/**
 * Get all active streams
 * @returns {Promise<Array>} - List of active streams
 */
export const getActiveStreams = async () => {
  const response = await api.get('/live/active');
  return response.data;
};
