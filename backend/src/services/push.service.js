const webpush = require('web-push');
const env = require('../config/env');
const { PushSubscription, Participant } = require('../models');
const AppError = require('../errors/AppError');

function configured() {
  return Boolean(env.vapid.publicKey && env.vapid.privateKey);
}

function configureWebPush() {
  if (!configured()) return false;
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
  return true;
}

function publicKey() {
  if (!configured()) throw new AppError(503, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured.');
  return env.vapid.publicKey;
}

async function upsertSubscription(user, data, userAgent) {
  if (!configured()) throw new AppError(503, 'PUSH_NOT_CONFIGURED', 'Web Push is not configured.');
  const participant = await Participant.findOne({ where: { id: user.participantId, tableSessionId: user.sessionId } });
  if (!participant) throw new AppError(403, 'PARTICIPANT_FORBIDDEN', 'Participant not found for this session.');
  const keys = data.keys || {};
  if (!data.endpoint || !keys.p256dh || !keys.auth) {
    throw new AppError(400, 'INVALID_PUSH_SUBSCRIPTION', 'Invalid push subscription.');
  }
  const [subscription] = await PushSubscription.findOrCreate({
    where: { endpoint: data.endpoint },
    defaults: {
      participantId: participant.id,
      endpoint: data.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    },
  });
  if (subscription.participantId !== participant.id || subscription.p256dh !== keys.p256dh || subscription.auth !== keys.auth) {
    await subscription.update({
      participantId: participant.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    });
  }
  return subscription;
}

async function deleteSubscription(user, endpoint) {
  const where = { participantId: user.participantId };
  if (endpoint) where.endpoint = endpoint;
  return PushSubscription.destroy({ where });
}

async function sendToParticipant(participantId, payload) {
  if (!configureWebPush()) return { sent: 0, skipped: true };
  const subscriptions = await PushSubscription.findAll({ where: { participantId } });
  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await sub.destroy();
      } else {
        console.warn('Push delivery failed', error.statusCode || error.message);
      }
    }
  }
  return { sent };
}

module.exports = {
  configured,
  publicKey,
  upsertSubscription,
  deleteSubscription,
  sendToParticipant,
};
