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

/**
 * Check storage integrity
 * @returns {Promise<Object>} - Integrity check results
 */
export const checkIntegrity = async () => {
  const response = await api.get('/storage/integrity');
  return response.data;
};

/**
 * Import orphaned files into database
 * @returns {Promise<Object>} - Import results
 */
export const importOrphanedFiles = async () => {
  const response = await api.post('/storage/integrity/import-orphaned');
  return response.data;
};

/**
 * Remove orphaned files from filesystem
 * @returns {Promise<Object>} - Removal results
 */
export const removeOrphanedFiles = async () => {
  const response = await api.delete('/storage/integrity/remove-orphaned');
  return response.data;
};

/**
 * Flush all recordings - delete all database records and files
 * @returns {Promise<Object>} - Flush results
 */
export const flushAllRecordings = async () => {
  const response = await api.delete('/storage/flush-all');
  return response.data;
};
