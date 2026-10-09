jest.mock('../models/User', () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/Song', () => ({
  find: jest.fn(),
}));

jest.mock('../models/DailyChallengeClaim', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../utils/dailyChallenge', () => ({
  toDateKey: jest.fn(() => '2026-02-13'),
  parseDateKey: jest.fn(() => new Date('2026-02-13T00:00:00.000Z')),
  challengeFromDateKey: jest.fn(() => ({
    key: '2026-02-13',
    targetMood: 'energetic',
    targetPlays: 2,
    targetArtists: 2,
    targetHighEnergy: 1,
    rewardXp: 120,
  })),
  previousDateKey: jest.fn(() => '2026-02-12'),
}));

const User = require('../models/User');
const Song = require('../models/Song');
const DailyChallengeClaim = require('../models/DailyChallengeClaim');
const authController = require('../controllers/authController');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
}

describe('auth challenge controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getDailyChallengeStatus returns progress and UTC timezone', async () => {
    const userDoc = {
      _id: 'u1',
      name: 'User',
      email: 'u@example.com',
      role: 'user',
      gamification: {
        totalXp: 50,
        challengeStreak: 1,
        challengesCompleted: 1,
        lastChallengeClaimDate: '2026-02-12',
      },
      listeningHistory: [
        { songId: 's1', playedAt: new Date('2026-02-13T02:00:00.000Z') },
        { songId: 's2', playedAt: new Date('2026-02-13T03:00:00.000Z') },
      ],
    };

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });

    Song.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        { _id: 's1', artist: 'A1', mood: 'energetic', energy: 0.8 },
        { _id: 's2', artist: 'A2', mood: 'calm', energy: 0.5 },
      ]),
    });

    DailyChallengeClaim.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const req = { user: { _id: 'u1' }, query: { key: '2026-02-13' } };
    const res = makeRes();

    await authController.getDailyChallengeStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      claimed: false,
      timezone: 'UTC',
      progress: expect.objectContaining({
        totalPlays: 2,
        artists: 2,
      }),
    }));
  });

  test('claimDailyChallenge increments streak when previous day was claimed', async () => {
    const userDoc = {
      _id: 'u1',
      name: 'User',
      email: 'u@example.com',
      role: 'user',
      gamification: {
        totalXp: 200,
        challengeStreak: 2,
        challengesCompleted: 3,
        lastChallengeClaimDate: '2026-02-12',
      },
      listeningHistory: [
        { songId: 's1', playedAt: new Date('2026-02-13T02:00:00.000Z') },
        { songId: 's2', playedAt: new Date('2026-02-13T03:00:00.000Z') },
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });

    Song.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        { _id: 's1', artist: 'A1', mood: 'energetic', energy: 0.9 },
        { _id: 's2', artist: 'A2', mood: 'energetic', energy: 0.4 },
      ]),
    });

    DailyChallengeClaim.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    DailyChallengeClaim.create.mockResolvedValue({ _id: 'claim1' });

    const req = { user: { _id: 'u1' }, body: { key: '2026-02-13' } };
    const res = makeRes();

    await authController.claimDailyChallenge(req, res);

    expect(userDoc.gamification.challengeStreak).toBe(3);
    expect(userDoc.gamification.totalXp).toBe(320);
    expect(userDoc.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      timezone: 'UTC',
    }));
  });

  test('claimDailyChallenge returns alreadyClaimed on duplicate create', async () => {
    const userDoc = {
      _id: 'u1',
      name: 'User',
      email: 'u@example.com',
      role: 'user',
      gamification: {
        totalXp: 200,
        challengeStreak: 2,
        challengesCompleted: 3,
        lastChallengeClaimDate: '2026-02-11',
      },
      listeningHistory: [
        { songId: 's1', playedAt: new Date('2026-02-13T02:00:00.000Z') },
        { songId: 's2', playedAt: new Date('2026-02-13T03:00:00.000Z') },
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(userDoc),
    });

    Song.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        { _id: 's1', artist: 'A1', mood: 'energetic', energy: 0.9 },
        { _id: 's2', artist: 'A2', mood: 'energetic', energy: 0.4 },
      ]),
    });

    DailyChallengeClaim.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    const duplicateError = new Error('duplicate');
    duplicateError.code = 11000;
    DailyChallengeClaim.create.mockRejectedValue(duplicateError);

    const req = { user: { _id: 'u1' }, body: { key: '2026-02-13' } };
    const res = makeRes();

    await authController.claimDailyChallenge(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      alreadyClaimed: true,
    }));
    expect(userDoc.save).not.toHaveBeenCalled();
  });

  test('getDailyChallengeHistory returns recent claim rows', async () => {
    DailyChallengeClaim.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { key: '2026-02-13', xp: 120, claimedAt: new Date('2026-02-13T05:00:00.000Z') },
          ]),
        }),
      }),
    });

    const req = { user: { _id: 'u1' }, query: { days: '7' } };
    const res = makeRes();

    await authController.getDailyChallengeHistory(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      timezone: 'UTC',
      count: 1,
      history: expect.any(Array),
    }));
  });

  test('getChallengeLeaderboard returns ranks and current user stats', async () => {
    DailyChallengeClaim.aggregate.mockResolvedValue([
      { _id: 'u1', xp: 280, claims: 2, lastClaimAt: new Date('2026-02-13T05:00:00.000Z') },
      { _id: 'u2', xp: 220, claims: 2, lastClaimAt: new Date('2026-02-13T06:00:00.000Z') },
    ]);

    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'u1', name: 'Alpha', email: 'a@example.com' },
          { _id: 'u2', name: 'Beta', email: 'b@example.com' },
        ]),
      }),
    });

    const req = { user: { _id: 'u2' }, query: { days: '7', limit: '8' } };
    const res = makeRes();

    await authController.getChallengeLeaderboard(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      timezone: 'UTC',
      leaderboard: expect.arrayContaining([
        expect.objectContaining({ rank: 1, name: 'Alpha', xp: 280 }),
        expect.objectContaining({ rank: 2, name: 'Beta', xp: 220 }),
      ]),
      currentUser: expect.objectContaining({ rank: 2, xp: 220 }),
    }));
  });
});
