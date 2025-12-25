const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth/authenticate');

router.use(authenticate);

router.get('/stats', async (req, res, next) => {
  try {
    res.json({ totalGB: 0, usedGB: 0, availableGB: 0, usagePercent: 0, perCamera: [] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
