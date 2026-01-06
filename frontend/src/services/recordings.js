import api from './api';

const API_URL = '/recordings';

/**
 * Get recordings with filters
 * @param {Object} filters - Filter options (cameraId, startDate, endDate, status, etc.)
 * @returns {Promise<Object>} - Paginated recordings result
 */
export const getRecordings = async (filters = {}) => {
  const response = await api.get(API_URL, { params: filters });
  return response.data;
};

/**
 * Get recording by ID
 * @param {string} id - Recording ID
 * @returns {Promise<Object>} - Recording object
 */
export const getRecording = async (id) => {
  const response = await api.get(`${API_URL}/${id}`);
  return response.data;
};

/**
 * Get stream URL for a recording
 * @param {string} id - Recording ID
 * @returns {string} - Stream URL
 */
export const getRecordingStreamUrl = (id) => {
  return `/api/recordings/${id}/stream`;
};

/**
 * Start recording for a camera
 * @param {string} cameraId - Camera ID
 * @returns {Promise<Object>} - Success response
 */
export const startRecording = async (cameraId) => {
  const response = await api.post(`${API_URL}/${cameraId}/start`);
  return response.data;
};

/**
 * Stop recording for a camera
 * @param {string} cameraId - Camera ID
 * @returns {Promise<Object>} - Success response
 */
export const stopRecording = async (cameraId) => {
  const response = await api.post(`${API_URL}/${cameraId}/stop`);
  return response.data;
};

/**
 * Get recording status for a camera
 * @param {string} cameraId - Camera ID
 * @returns {Promise<Object>} - Recording status
 */
export const getRecordingStatus = async (cameraId) => {
  const response = await api.get(`${API_URL}/${cameraId}/status`);
  return response.data;
};

/**
 * Get all active recordings
 * @returns {Promise<Array>} - List of active recordings
 */
export const getActiveRecordings = async () => {
  const response = await api.get(`${API_URL}/active/list`);
  return response.data;
};

/**
 * Protect a recording from deletion
 * @param {string} id - Recording ID
 * @returns {Promise<Object>} - Updated recording
 */
export const protectRecording = async (id) => {
  const response = await api.put(`${API_URL}/${id}/protect`);
  return response.data;
};

/**
 * Unprotect a recording
 * @param {string} id - Recording ID
 * @returns {Promise<Object>} - Updated recording
 */
export const unprotectRecording = async (id) => {
  const response = await api.put(`${API_URL}/${id}/unprotect`);
  return response.data;
};

/**
 * Delete a recording
 * @param {string} id - Recording ID
 * @returns {Promise<Object>} - Success response
 */
export const deleteRecording = async (id) => {
  const response = await api.delete(`${API_URL}/${id}`);
  return response.data;
};
