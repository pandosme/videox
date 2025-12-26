const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth/authenticate');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json([]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
