const analyticsService = require('../services/analytics.service');
const { success } = require('../utils/responses');

async function overview(req, res, next) {
  try {
    const data = await analyticsService.getOverview(req.user.id);
    return success(res, data);
  } catch (err) {
    return next(err);
  }
}

async function productivity(req, res, next) {
  try {
    const data = await analyticsService.getProductivityTrend(req.user.id);
    return success(res, data);
  } catch (err) {
    return next(err);
  }
}

async function questProgress(req, res, next) {
  try {
    const data = await analyticsService.getQuestProgress(req.user.id);
    return success(res, data);
  } catch (err) {
    return next(err);
  }
}

async function focus(req, res, next) {
  try {
    const data = await analyticsService.getFocusRatio(req.user.id);
    return success(res, data);
  } catch (err) {
    return next(err);
  }
}

module.exports = { overview, productivity, questProgress, focus };
