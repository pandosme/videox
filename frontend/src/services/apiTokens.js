import api from './api';

/**
 * Get user's API tokens
 * @returns {Promise<Array>} - List of API tokens
 */
export const getApiTokens = async () => {
  const response = await api.get('/tokens');
  return response.data;
};

/**
 * Create new API token
 * @param {string} name - Token name
 * @param {number} expiresInDays - Expiration in days (0 = never)
 * @returns {Promise<Object>} - Created token with token value
 */
export const createApiToken = async (name, expiresInDays = 0) => {
  const response = await api.post('/tokens', { name, expiresInDays });
  return response.data;
};

/**
 * Delete API token
 * @param {string} tokenId - Token ID
 * @returns {Promise<Object>} - Success response
 */
export const deleteApiToken = async (tokenId) => {
  const response = await api.delete(`/tokens/${tokenId}`);
  return response.data;
};

/**
 * Toggle API token active status
 * @param {string} tokenId - Token ID
 * @returns {Promise<Object>} - Updated token
 */
export const toggleApiToken = async (tokenId) => {
  const response = await api.patch(`/tokens/${tokenId}/toggle`);
  return response.data;
};

/**
 * Build export URL with API token
 * @param {string} apiToken - API token value
 * @param {string} cameraId - Camera serial number
 * @param {number} startTime - Start time (epoch seconds)
 * @param {number} duration - Duration (seconds)
 * @param {string} type - 'stream' or 'file'
 * @returns {string} - Export URL
 */
export const buildExportUrl = (apiToken, cameraId, startTime, duration, type = 'stream') => {
  const baseUrl = window.location.origin;
  const params = new URLSearchParams({
    cameraId,
    startTime,
    duration,
    type,
  });

  // Note: API token should be passed in Authorization header, not URL
  // This is just for documentation/testing purposes
  return `${baseUrl}/api/export?${params.toString()}`;
};
