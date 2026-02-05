import api from './api';

/**
 * Get system configuration
 * @returns {Promise} System configuration
 */
export const getSystemConfig = async () => {
  const response = await api.get('/system/config');
  return response.data;
};

/**
 * Update system configuration
 * @param {Object} config - Configuration to update
 * @param {number} config.retentionDays - Retention period in days
 * @param {number} config.maxStoragePercent - Maximum storage percentage
 * @returns {Promise} Updated configuration
 */
export const updateSystemConfig = async (config) => {
  const response = await api.put('/system/config', config);
  return response.data;
};

/**
 * Trigger manual retention cleanup
 * @returns {Promise} Cleanup status
 */
export const triggerCleanup = async () => {
  const response = await api.post('/system/cleanup');
  return response.data;
};
