const logger = require('../../utils/logger');

const SERVICE_NAME = 'videox';
const MQTT_BROKER = process.env.NOTIFY_MQTT_BROKER || 'mqtt://mqtt.internal';
const MQTT_TOPIC = process.env.NOTIFY_MQTT_TOPIC || 'avisering';
const HTTP_URL = process.env.NOTIFY_HTTP_URL || 'http://fred.internal/api/aviseringar';
// Minimum ms between repeated notifications for the same key
const DEBOUNCE_MS = parseInt(process.env.NOTIFY_DEBOUNCE_MS || '300000', 10); // 5 min default

class Notifier {
  constructor() {
    this.mqttClient = null;
    this.mqttReady = false;
    this.lastSent = new Map(); // key → timestamp for debouncing
  }

  async initialize() {
    try {
      const mqtt = require('mqtt');
      this.mqttClient = mqtt.connect(MQTT_BROKER, {
        connectTimeout: 5000,
        reconnectPeriod: 30000,
        clientId: `videox-${Math.random().toString(16).slice(2, 8)}`,
      });

      this.mqttClient.on('connect', () => {
        this.mqttReady = true;
        logger.info('Notifier: MQTT connected');
      });

      this.mqttClient.on('error', (err) => {
        this.mqttReady = false;
        logger.warn(`Notifier: MQTT error: ${err.message}`);
      });

      this.mqttClient.on('offline', () => {
        this.mqttReady = false;
      });

      this.mqttClient.on('reconnect', () => {
        logger.debug('Notifier: MQTT reconnecting');
      });
    } catch (err) {
      logger.warn(`Notifier: MQTT init failed: ${err.message}`);
    }
  }

  // Send notification, optionally debounced by key
  async notify(type, titel, message, debounceKey = null) {
    if (debounceKey) {
      const last = this.lastSent.get(debounceKey) || 0;
      if (Date.now() - last < DEBOUNCE_MS) return;
      this.lastSent.set(debounceKey, Date.now());
    }

    const payload = {
      service: SERVICE_NAME,
      type,
      titel,
      message,
      timestamp: new Date().toISOString(),
    };

    if (this.mqttReady && this.mqttClient) {
      try {
        await new Promise((resolve, reject) => {
          this.mqttClient.publish(MQTT_TOPIC, JSON.stringify(payload), { qos: 1 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        logger.debug(`Notifier: MQTT sent [${type}] ${titel}`);
        return;
      } catch (err) {
        logger.warn(`Notifier: MQTT publish failed, falling back to HTTP: ${err.message}`);
      }
    }

    try {
      const axios = require('axios');
      await axios.post(HTTP_URL, payload, { timeout: 5000 });
      logger.debug(`Notifier: HTTP sent [${type}] ${titel}`);
    } catch (err) {
      logger.warn(`Notifier: HTTP notification failed: ${err.message}`);
    }
  }

  // Convenience wrappers
  info(titel, message, key) { return this.notify('Info', titel, message, key); }
  warning(titel, message, key) { return this.notify('Varning', titel, message, key); }
  error(titel, message, key) { return this.notify('Fel', titel, message, key); }

  destroy() {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
      this.mqttReady = false;
    }
  }
}

module.exports = new Notifier();
