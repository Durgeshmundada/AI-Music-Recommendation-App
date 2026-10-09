const express = require('express');
const {
  register,
  login,
  refresh,
  logout,
  changePassword,
  requestPasswordReset,
  resetPassword,
  requestEmailVerification,
  verifyEmailToken,
  getMe,
  getDailyChallengeStatus,
  getDailyChallengeHistory,
  getChallengeLeaderboard,
  claimDailyChallenge,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/verify-email/request', authenticate, requestEmailVerification);
router.post('/verify-email', verifyEmailToken);
router.get('/me', authenticate, getMe);
router.get('/challenge/status', authenticate, getDailyChallengeStatus);
router.get('/challenge/history', authenticate, getDailyChallengeHistory);
router.get('/challenge/leaderboard', authenticate, getChallengeLeaderboard);
router.post('/challenge/claim', authenticate, claimDailyChallenge);

module.exports = router;
