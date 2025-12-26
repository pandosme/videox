const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth/authenticate');
const authorize = require('../middleware/auth/authorize');

// All user management routes require admin role
router.use(authenticate);
router.use(authorize(['admin']));

router.get('/', async (req, res, next) => {
  try {
    res.json([]);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(501).json({
      error: { code: 'NOT_IMPLEMENTED', message: 'User creation not yet implemented' },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
