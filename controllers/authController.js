// ===============================
// Authentication Controller
// ===============================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Song = require('../models/Song');
const AuthToken = require('../models/AuthToken');
const DailyChallengeClaim = require('../models/DailyChallengeClaim');
const logger = require('../utils/logger');
const { generateTokens } = require('../utils/tokenUtils');
const {
  toDateKey,
  parseDateKey,
  challengeFromDateKey,
  previousDateKey,
} = require('../utils/dailyChallenge');

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function buildCookieOptions(overrides = {}) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    ...overrides,
  };

  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  return options;
}

function serializeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isEmailVerified: Boolean(user.isEmailVerified),
    gamification: {
      totalXp: user.gamification?.totalXp || 0,
      challengeStreak: user.gamification?.challengeStreak || 0,
      challengesCompleted: user.gamification?.challengesCompleted || 0,
      lastChallengeClaimDate: user.gamification?.lastChallengeClaimDate || null,
    },
  };
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

async function createOneTimeToken(userId, type, ttlMinutes) {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + (ttlMinutes * 60 * 1000));

  await AuthToken.updateMany(
    { user: userId, type, usedAt: null },
    { $set: { usedAt: new Date() } }
  );

  await AuthToken.create({
    user: userId,
    type,
    tokenHash,
    expiresAt,
  });

  return {
    rawToken,
    expiresAt,
  };
}

function buildDevTokenPayload(token, expiresAt) {
  if (process.env.NODE_ENV === 'production') return {};
  return {
    token,
    expiresAt,
    note: 'Dev-only token payload. Configure real email delivery for production.',
  };
}

function buildProgress(challenge, songById, playEvents) {
  const totalPlays = playEvents.length;
  const moodMatches = playEvents.reduce((sum, entry) => {
    const song = songById.get(String(entry.songId));
    if (song?.mood === challenge.targetMood) return sum + 1;
    return sum;
  }, 0);

  const highEnergyPlays = playEvents.reduce((sum, entry) => {
    const song = songById.get(String(entry.songId));
    if (Number(song?.energy) >= 0.75) return sum + 1;
    return sum;
  }, 0);

  const artists = new Set(
    playEvents
      .map((entry) => songById.get(String(entry.songId))?.artist)
      .filter(Boolean)
  ).size;

  const progress = {
    totalPlays,
    artists,
    moodMatches,
    highEnergyPlays,
    playsDone: totalPlays >= challenge.targetPlays,
    artistsDone: artists >= challenge.targetArtists,
    moodDone: moodMatches >= 2,
    energyDone: highEnergyPlays >= challenge.targetHighEnergy,
  };

  progress.complete = progress.playsDone
    && progress.artistsDone
    && progress.moodDone
    && progress.energyDone;

  return progress;
}

async function evaluateChallengeProgress(userId, challengeKey) {
  const challenge = challengeFromDateKey(challengeKey);
  if (!challenge) return null;

  const dayStart = parseDateKey(challengeKey);
  const dayEnd = new Date(dayStart.getTime() + (24 * 60 * 60 * 1000));

  const user = await User.findById(userId).select('listeningHistory gamification isEmailVerified');
  if (!user) return null;

  const playEvents = (user.listeningHistory || []).filter((entry) => {
    const playedAt = entry.playedAt ? new Date(entry.playedAt) : null;
    if (!playedAt || Number.isNaN(playedAt.getTime())) return false;
    return playedAt >= dayStart && playedAt < dayEnd;
  });

  const uniqueSongIds = [...new Set(playEvents.map((entry) => String(entry.songId)).filter(Boolean))];
  const songs = uniqueSongIds.length > 0
    ? await Song.find({ _id: { $in: uniqueSongIds } }).select('artist mood energy')
    : [];
  const songById = new Map(songs.map((song) => [String(song._id), song]));

  const progress = buildProgress(challenge, songById, playEvents);

  const existingClaim = await DailyChallengeClaim.findOne({ user: userId, key: challengeKey })
    .select('_id')
    .lean();
  const claimed = Boolean(existingClaim);

  return {
    challenge,
    progress,
    claimed,
    user,
  };
}

// Register new user
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_EXISTS',
        message: 'This email is already registered'
      });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      isEmailVerified: false,
    });

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.cookie('accessToken', accessToken, buildCookieOptions({
      maxAge: 15 * 60 * 1000,
    }));

    res.cookie('refreshToken', refreshToken, buildCookieOptions({
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    }));

    logger.info(`User registered: ${user._id}`);

    let verification = {};
    try {
      const tokenResult = await createOneTimeToken(user._id, 'email_verify', 24 * 60);
      verification = buildDevTokenPayload(tokenResult.rawToken, tokenResult.expiresAt);
    } catch (tokenError) {
      logger.warn(`Verification token creation failed for ${user._id}: ${tokenError.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: accessToken,
      user: serializeUser(user),
      verification,
    });
  } catch (error) {
    logger.error('Registration error:', {
      error: error.message,
      email: req.body.email,
    });

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_EMAIL',
        message: 'Email already in use'
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      code: 'REGISTRATION_FAILED',
      message: 'Failed to complete registration'
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      logger.warn(`Login attempt with non-existent email: ${email}`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      logger.warn(`Login attempt with wrong password for: ${email}`);
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password'
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.cookie('accessToken', accessToken, buildCookieOptions({
      maxAge: 15 * 60 * 1000,
    }));

    res.cookie('refreshToken', refreshToken, buildCookieOptions({
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    }));

    logger.info(`User logged in: ${user._id}`);

    res.json({
      success: true,
      message: 'Login successful',
      token: accessToken,
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error('Login error:', error);

    res.status(500).json({
      success: false,
      code: 'LOGIN_FAILED',
      message: 'Failed to complete login'
    });
  }
};

// Refresh access token
exports.refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      });
    }

    const tokens = generateTokens(user._id);

    res.cookie('accessToken', tokens.accessToken, buildCookieOptions({
      maxAge: 15 * 60 * 1000,
    }));

    res.json({
      success: true,
      message: 'Token refreshed',
      accessToken: tokens.accessToken,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);

    res.status(401).json({
      success: false,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token'
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    res.clearCookie('accessToken', buildCookieOptions());
    res.clearCookie('refreshToken', buildCookieOptions({ path: '/api/auth/refresh' }));

    logger.info(`User logged out: ${req.user?._id}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);

    res.status(500).json({
      success: false,
      code: 'LOGOUT_FAILED',
      message: 'Failed to logout'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user._id}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);

    res.status(500).json({
      success: false,
      code: 'PASSWORD_CHANGE_FAILED',
      message: 'Failed to change password'
    });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'EMAIL_REQUIRED',
        message: 'Email is required',
      });
    }

    const user = await User.findOne({ email });

    let reset = {};
    if (user) {
      const tokenResult = await createOneTimeToken(user._id, 'password_reset', 30);
      reset = buildDevTokenPayload(tokenResult.rawToken, tokenResult.expiresAt);
      logger.info(`Password reset requested for user: ${user._id}`);
    }

    res.json({
      success: true,
      message: 'If that email exists, a reset link has been generated',
      reset,
    });
  } catch (error) {
    logger.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      code: 'RESET_REQUEST_FAILED',
      message: 'Failed to request password reset',
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!rawToken || !newPassword) {
      return res.status(400).json({
        success: false,
        code: 'TOKEN_AND_PASSWORD_REQUIRED',
        message: 'Token and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        code: 'WEAK_PASSWORD',
        message: 'Password must be at least 6 characters',
      });
    }

    const tokenHash = hashToken(rawToken);
    const tokenDoc = await AuthToken.findOne({
      tokenHash,
      type: 'password_reset',
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Reset token is invalid or expired',
      });
    }

    const user = await User.findById(tokenDoc.user).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    user.password = newPassword;
    await user.save();

    tokenDoc.usedAt = new Date();
    await tokenDoc.save();

    await AuthToken.updateMany(
      {
        user: user._id,
        type: 'password_reset',
        usedAt: null,
      },
      { $set: { usedAt: new Date() } }
    );

    res.json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      code: 'RESET_PASSWORD_FAILED',
      message: 'Failed to reset password',
    });
  }
};

exports.requestEmailVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (user.isEmailVerified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Email is already verified',
      });
    }

    const tokenResult = await createOneTimeToken(user._id, 'email_verify', 24 * 60);
    const verification = buildDevTokenPayload(tokenResult.rawToken, tokenResult.expiresAt);

    res.json({
      success: true,
      message: 'Verification token generated',
      verification,
    });
  } catch (error) {
    logger.error('Request email verification error:', error);
    res.status(500).json({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUEST_FAILED',
      message: 'Failed to request email verification',
    });
  }
};

exports.verifyEmailToken = async (req, res) => {
  try {
    const rawToken = String(req.body?.token || req.query?.token || '').trim();
    if (!rawToken) {
      return res.status(400).json({
        success: false,
        code: 'TOKEN_REQUIRED',
        message: 'Verification token is required',
      });
    }

    const tokenHash = hashToken(rawToken);
    const tokenDoc = await AuthToken.findOne({
      tokenHash,
      type: 'email_verify',
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!tokenDoc) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Verification token is invalid or expired',
      });
    }

    const user = await User.findByIdAndUpdate(
      tokenDoc.user,
      { $set: { isEmailVerified: true } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    tokenDoc.usedAt = new Date();
    await tokenDoc.save();

    res.json({
      success: true,
      message: 'Email verified successfully',
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error('Verify email token error:', error);
    res.status(500).json({
      success: false,
      code: 'EMAIL_VERIFICATION_FAILED',
      message: 'Failed to verify email',
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user: serializeUser(user),
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      code: 'PROFILE_FETCH_FAILED',
      message: 'Failed to load user profile',
    });
  }
};

exports.getDailyChallengeStatus = async (req, res) => {
  try {
    const requestedKey = typeof req.query.key === 'string' ? req.query.key : toDateKey();
    const challengeKey = requestedKey.trim();
    const evaluated = await evaluateChallengeProgress(req.user._id, challengeKey);

    if (!evaluated) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CHALLENGE_KEY',
        message: 'Invalid challenge date key',
      });
    }

    res.json({
      success: true,
      challenge: evaluated.challenge,
      progress: evaluated.progress,
      claimed: evaluated.claimed,
      timezone: 'UTC',
      gamification: serializeUser(evaluated.user).gamification,
    });
  } catch (error) {
    logger.error('Daily challenge status error:', error);
    res.status(500).json({
      success: false,
      code: 'CHALLENGE_STATUS_FAILED',
      message: 'Failed to load challenge status',
    });
  }
};

exports.getDailyChallengeHistory = async (req, res) => {
  try {
    const days = toBoundedInt(req.query.days, 7, 1, 30);
    const claims = await DailyChallengeClaim.find({ user: req.user._id })
      .sort({ key: -1 })
      .limit(days)
      .lean();

    res.json({
      success: true,
      timezone: 'UTC',
      count: claims.length,
      history: claims.map((claim) => ({
        key: claim.key,
        xp: claim.xp,
        claimedAt: claim.claimedAt,
      })),
    });
  } catch (error) {
    logger.error('Daily challenge history error:', error);
    res.status(500).json({
      success: false,
      code: 'CHALLENGE_HISTORY_FAILED',
      message: 'Failed to load challenge history',
    });
  }
};

exports.getChallengeLeaderboard = async (req, res) => {
  try {
    const days = toBoundedInt(req.query.days, 7, 1, 30);
    const limit = toBoundedInt(req.query.limit, 10, 1, 50);
    const windowStart = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const rows = await DailyChallengeClaim.aggregate([
      { $match: { claimedAt: { $gte: windowStart } } },
      {
        $group: {
          _id: '$user',
          xp: { $sum: '$xp' },
          claims: { $sum: 1 },
          lastClaimAt: { $max: '$claimedAt' },
        },
      },
      { $sort: { xp: -1, claims: -1, lastClaimAt: 1 } },
    ]);

    const ranked = rows.map((row, index) => ({
      rank: index + 1,
      userId: String(row._id),
      xp: row.xp || 0,
      claims: row.claims || 0,
      lastClaimAt: row.lastClaimAt || null,
    }));

    const top = ranked.slice(0, limit);
    const userIds = top.map((item) => item.userId);
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('name email').lean()
      : [];
    const userMap = new Map(users.map((user) => [String(user._id), user]));

    const leaderboard = top.map((item) => {
      const user = userMap.get(item.userId);
      return {
        rank: item.rank,
        userId: item.userId,
        name: user?.name || 'Unknown User',
        email: user?.email || '',
        xp: item.xp,
        claims: item.claims,
        lastClaimAt: item.lastClaimAt,
      };
    });

    const currentUserRank = ranked.find((item) => item.userId === String(req.user._id)) || null;

    res.json({
      success: true,
      timezone: 'UTC',
      days,
      count: leaderboard.length,
      leaderboard,
      currentUser: currentUserRank
        ? {
          rank: currentUserRank.rank,
          xp: currentUserRank.xp,
          claims: currentUserRank.claims,
        }
        : null,
    });
  } catch (error) {
    logger.error('Challenge leaderboard error:', error);
    res.status(500).json({
      success: false,
      code: 'CHALLENGE_LEADERBOARD_FAILED',
      message: 'Failed to load challenge leaderboard',
    });
  }
};

exports.claimDailyChallenge = async (req, res) => {
  try {
    const challengeKey = typeof req.body?.key === 'string' ? req.body.key.trim() : toDateKey();
    const evaluated = await evaluateChallengeProgress(req.user._id, challengeKey);

    if (!evaluated) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_CHALLENGE_KEY',
        message: 'Invalid challenge date key',
      });
    }

    if (!evaluated.progress.complete) {
      return res.status(400).json({
        success: false,
        code: 'CHALLENGE_INCOMPLETE',
        message: 'Complete all challenge goals before claiming reward',
        progress: evaluated.progress,
      });
    }

    const user = evaluated.user;
    if (!user.gamification) {
      user.gamification = {
        totalXp: 0,
        challengeStreak: 0,
        challengesCompleted: 0,
        lastChallengeClaimDate: null,
      };
    }

    const previousKey = previousDateKey(challengeKey);
    const lastKey = user.gamification.lastChallengeClaimDate;
    const nextStreak = lastKey === previousKey ? (user.gamification.challengeStreak || 0) + 1 : 1;

    if (evaluated.claimed) {
      return res.json({
        success: true,
        alreadyClaimed: true,
        message: 'Reward already claimed for this date',
        challenge: evaluated.challenge,
        gamification: serializeUser(user).gamification,
      });
    }

    try {
      await DailyChallengeClaim.create({
        user: user._id,
        key: challengeKey,
        xp: evaluated.challenge.rewardXp,
      });
    } catch (createErr) {
      if (createErr?.code === 11000) {
        return res.json({
          success: true,
          alreadyClaimed: true,
          message: 'Reward already claimed for this date',
          challenge: evaluated.challenge,
          gamification: serializeUser(user).gamification,
        });
      }
      throw createErr;
    }

    user.gamification.totalXp = (user.gamification.totalXp || 0) + evaluated.challenge.rewardXp;
    user.gamification.challengesCompleted = (user.gamification.challengesCompleted || 0) + 1;
    user.gamification.challengeStreak = nextStreak;
    user.gamification.lastChallengeClaimDate = challengeKey;
    await user.save();

    res.json({
      success: true,
      message: `Challenge reward claimed (+${evaluated.challenge.rewardXp} XP)`,
      challenge: evaluated.challenge,
      progress: evaluated.progress,
      timezone: 'UTC',
      gamification: serializeUser(user).gamification,
    });
  } catch (error) {
    logger.error('Daily challenge claim error:', error);
    res.status(500).json({
      success: false,
      code: 'CHALLENGE_CLAIM_FAILED',
      message: 'Failed to claim challenge reward',
    });
  }
};
