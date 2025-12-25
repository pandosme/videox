import api from './api';

/**
 * Get storage statistics
 * @returns {Promise<Object>} - Storage stats
 */
export const getStorageStats = async () => {
  const response = await api.get('/storage/stats');
  return response.data;
};

/**
 * Get current storage path
 * @returns {Promise<Object>} - Storage path info
 */
export const getStoragePath = async () => {
  const response = await api.get('/storage/path');
  return response.data;
};

/**
 * Update storage path (requires restart)
 * @param {string} newPath - New storage path
 * @returns {Promise<Object>} - Update result
 */
export const updateStoragePath = async (newPath) => {
  const response = await api.post('/storage/path', { newPath });
  return response.data;
};

/**
 * Preview cleanup (what would be deleted)
 * @returns {Promise<Object>} - Cleanup preview
 */
export const previewCleanup = async () => {
  const response = await api.get('/storage/cleanup/preview');
  return response.data;
};
