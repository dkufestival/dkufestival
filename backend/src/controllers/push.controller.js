const pushService = require('../services/push.service');

async function getPublicKey(req, res, next) {
  try {
    res.json({ data: { publicKey: pushService.publicKey() } });
  } catch (error) {
    next(error);
  }
}

async function createSubscription(req, res, next) {
  try {
    const subscription = await pushService.upsertSubscription(req.user, req.body, req.get('user-agent'));
    res.status(201).json({ data: subscription });
  } catch (error) {
    next(error);
  }
}

async function deleteSubscription(req, res, next) {
  try {
    await pushService.deleteSubscription(req.user, req.body?.endpoint);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { getPublicKey, createSubscription, deleteSubscription };
