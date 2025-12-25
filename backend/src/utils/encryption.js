const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Ensure encryption key is at least 32 bytes
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
}

// Derive a 32-byte key from the encryption key
const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

/**
 * Encrypt a string value using AES-256-CBC
 * @param {string} text - The plain text to encrypt
 * @returns {string} - The encrypted text in format: iv:encryptedData
 */
function encrypt(text) {
  if (!text) {
    throw new Error('Text to encrypt cannot be empty');
  }

  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  // Encrypt the text
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return IV and encrypted data separated by ':'
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string using AES-256-CBC
 * @param {string} encryptedText - The encrypted text in format: iv:encryptedData
 * @returns {string} - The decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) {
    throw new Error('Encrypted text cannot be empty');
  }

  try {
    // Split the IV and encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

module.exports = {
  encrypt,
  decrypt,
};
