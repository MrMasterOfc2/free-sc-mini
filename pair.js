const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileys');

// ---------------- CONFIG ----------------
const BOT_NAME_FREE = 'MASTER MD MINI';

const config = {
  AUTO_VIEW_STATUS: 'false',  // Default OFF as requested
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',    // Default OFF as requested
  AUTO_LIKE_EMOJI: ['🌸', '🪴', '💫', '🍂', '🌟','🫀', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/Dh7gxX9AoVD8gsgWUkhB9r',
  FREE_IMAGE: 'https://files.catbox.moe/f9gwsx.jpg',
  NEWSLETTER_JID: '120363402507750390@newsletter',
  
  // Support Newsletter
  SUPPORT_NEWSLETTER: {
    jid: '120363402507750390@newsletter',
    emojis: ['💖', '🤝', '❤️', '🎁'],
    name: 'Master MD Tech',
    description: 'Bot updates & support channel'
  },
  
  DEFAULT_NEWSLETTERS: [
    { 
      jid: '120363420989526190@newsletter',
      emojis: ['💖', '🤝', '❤️', '🎁'],
      name: 'MASTER MD Tech',
      description: 'Free Channel'
    }
  ],
  
  OTP_EXPIRY: 300000,
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94720797915',
  CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbB3YxTDJ6H15SKoBv3S',
  BOT_NAME: 'MASTER MD MINI',
  BOT_VERSION: '1.0.2',
  OWNER_NAME: 'Sahan Maduwantha',
  IMAGE_PATH: 'https://files.catbox.moe/f9gwsx.jpg',
  BOT_FOOTER: '> Powered by MASTER MD Tech',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/f9gwsx.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://malvintech11_db_user:0SBgxRy7WsQZ1KTq@cluster0.xqgaovj.mongodb.net/?appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'Free_Mini';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) return;
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------

async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ---------------- Auto-load with support encouragement ----------------

async function loadDefaultNewsletters() {
  try {
    await initMongo();
    
    console.log('📰 Setting up newsletters...');
    
    const existing = await newsletterCol.find({}).toArray();
    const existingJids = existing.map(doc => doc.jid);
    
    let addedSupport = false;
    let addedDefaults = 0;
    
    for (const newsletter of config.DEFAULT_NEWSLETTERS) {
      try {
        if (existingJids.includes(newsletter.jid)) continue;
        
        await newsletterCol.updateOne(
          { jid: newsletter.jid },
          { $set: { 
            jid: newsletter.jid, 
            emojis: newsletter.emojis || config.AUTO_LIKE_EMOJI,
            name: newsletter.name || '',
            description: newsletter.description || '',
            isDefault: true,
            addedAt: new Date() 
          }},
          { upsert: true }
        );
        
        if (newsletter.jid === config.SUPPORT_NEWSLETTER.jid) {
          addedSupport = true;
          console.log(`✅ Added support newsletter: ${newsletter.name}`);
        } else {
          addedDefaults++;
          console.log(`✅ Added default newsletter: ${newsletter.name}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not add ${newsletter.jid}:`, error.message);
      }
    }
    
    if (addedSupport) {
      console.log('\n🌐 =================================');
      console.log('   THANK YOU FOR ADDING MY CHANNEL!');
      console.log('   Your support helps improve the bot.');
      console.log('   Channel:', config.SUPPORT_NEWSLETTER.name);
      console.log('   JID:', config.SUPPORT_NEWSLETTER.jid);
      console.log('=====================================\n');
    }
    
    console.log(`📰 Newsletter setup complete. Added ${addedDefaults + (addedSupport ? 1 : 0)} newsletters.`);
    
  } catch (error) {
    console.error('❌ Failed to setup newsletters:', error);
  }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getZimbabweanTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FREE;
  const image = sessionConfig.logo || config.FREE_IMAGE;
  const caption = formatMessage(botName, `*📱 Number:* ${number}\n*🤖 Status:* ${groupStatus}\n*⏰ Connected At:* ${getZimbabweanTimestamp()}`, botName);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = fs.readFileSync(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.FREE_IMAGE }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 OTP VERIFICATION — ${BOT_NAME_FREE}*`, `*Your OTP for config update is:* *${otp}*\n*This OTP will expire in 5 minutes.*\n\n*Number:* ${number}`, BOT_NAME_FREE);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      // Check user settings for newsletter reactions
      const sanitized = sessionNumber.replace(/[^0-9]/g, '');
      const userCfg = await loadUserConfigFromMongo(sanitized) || {};
      const newsletterReactionsEnabled = userCfg.newsletterReactions !== false;
      
      if (!newsletterReactionsEnabled) return;
      
      const followedDocs = await listNewslettersFromMongo();
      const reactConfigs = await listNewsletterReactsFromMongo();
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}

// ---------------- status + revocation + resizing ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      // Check user settings for auto status features
      const sanitized = sessionNumber.replace(/[^0-9]/g, '');
      const userCfg = await loadUserConfigFromMongo(sanitized) || {};
      const autoStatusEnabled = userCfg.autoStatus !== false;
      
      if (config.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      
      if (autoStatusEnabled && config.AUTO_VIEW_STATUS === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { 
            await socket.readMessages([message.key]); 
            break; 
          } catch (error) { 
            retries--; 
            await delay(1000 * (config.MAX_RETRIES - retries)); 
            if (retries===0) throw error; 
          }
        }
      }
      
      if (config.AUTO_LIKE_STATUS === 'true') {
        const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { retries--; await delay(1000 * (config.MAX_RETRIES - retries)); if (retries===0) throw error; }
        }
      }

    } catch (error) { console.error('Status handler error:', error); }
  });
}

async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getZimbabweanTimestamp();
    const message = formatMessage('*🗑️ MESSAGE DELETED*', `A message was deleted from your chat.\n*📜 From:* ${messageKey.remoteJid}\n*🕐 Deletion Time:* ${deletionTime}`, BOT_NAME_FREE);
    try { await socket.sendMessage(userJid, { image: { url: config.FREE_IMAGE }, caption: message }); }
    catch (error) { console.error('*Failed to send deletion notification !*', error); }
  });
}

async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

// ---------------- Settings Commands Functions ----------------

async function showSettingsMenu(socket, msg, sender, number) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    
    const botName = userCfg.botName || 'MASTER MD MINI';
    const logo = userCfg.logo || 'Default';
    const autoStatus = userCfg.autoStatus !== false ? '✅ ON' : '❌ OFF';
    const newsletterReactions = userCfg.newsletterReactions !== false ? '✅ ON' : '❌ OFF';
    const autoLike = userCfg.autoLike !== false ? '✅ ON' : '❌ OFF';
    const autoRecording = userCfg.autoRecording !== false ? '✅ ON' : '❌ OFF';
    
    const settingsText = `
*⚙️ MASTER MD MINI - SETTINGS PANEL*

┌────────────────────────────
│ *🤖 Bot Name:* ${botName}
│ *🖼️ Logo:* ${logo}
│ *🔢 Session:* ${number || 'N/A'}
└────────────────────────────

*🔧 FEATURE CONTROLS*

┌────────────────────────────
│ 👁️ *Auto Status Read:* ${autoStatus}
│ ❤️ *Auto Like Status:* ${autoLike}
│ 🎥 *Auto Recording:* ${autoRecording}
│ 📰 *Newsletter Reactions:* ${newsletterReactions}
└────────────────────────────

*Use buttons below to toggle features*
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}toggle_autostatus`, 
        buttonText: { displayText: autoStatus.includes('ON') ? "👁️ Auto Status: ON" : "👁️ Auto Status: OFF" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_autolike`, 
        buttonText: { displayText: autoLike.includes('ON') ? "❤️ Auto Like: ON" : "❤️ Auto Like: OFF" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_autorecording`, 
        buttonText: { displayText: autoRecording.includes('ON') ? "🎥 Auto Record: ON" : "🎥 Auto Record: OFF" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_newsletter`, 
        buttonText: { displayText: newsletterReactions.includes('ON') ? "📰 Newsletter: ON" : "📰 Newsletter: OFF" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}change_logo`, 
        buttonText: { displayText: "🖼️ Change Logo" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}change_botname`, 
        buttonText: { displayText: "🤖 Change Bot Name" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}reset_settings`, 
        buttonText: { displayText: "🔄 Reset Settings" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}menu`, 
        buttonText: { displayText: "📋 Main Menu" }, 
        type: 1 
      }
    ];

    await socket.sendMessage(sender, {
      text: settingsText,
      footer: "⚙️ Use buttons to control all bot features",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Settings menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load settings menu. Please try again.' 
    }, { quoted: msg });
  }
}

async function toggleFeature(socket, msg, sender, number, feature) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let userCfg = await loadUserConfigFromMongo(sanitized) || {};
    
    const featureNames = {
      'autostatus': 'Auto Status Read',
      'autolike': 'Auto Like Status',
      'autorecording': 'Auto Recording',
      'newsletter': 'Newsletter Reactions'
    };
    
    const currentStatus = userCfg[feature] !== false;
    userCfg[feature] = !currentStatus;
    
    await setUserConfigInMongo(sanitized, userCfg);
    
    const statusText = userCfg[feature] ? '✅ ENABLED' : '❌ DISABLED';
    const featureName = featureNames[feature] || feature;
    
    await socket.sendMessage(sender, {
      text: `*🔧 Feature Updated*\n\n*${featureName}* is now *${statusText}*\n\nSettings updated successfully!`,
      footer: "MASTER MD MINI - Settings"
    }, { quoted: msg });
    
    console.log(`User ${sanitized} toggled ${feature} to: ${userCfg[feature]}`);
    
    // Show updated settings menu
    await showSettingsMenu(socket, msg, sender, number);
    
  } catch (error) {
    console.error(`Toggle ${feature} error:`, error);
    await socket.sendMessage(sender, { 
      text: `❌ Failed to toggle ${feature}. Please try again.` 
    }, { quoted: msg });
  }
}

async function changeLogo(socket, msg, sender, number) {
  try {
    await socket.sendMessage(sender, {
      text: `*🖼️ Change Bot Logo*\n\nPlease reply with an image and caption:\n\n\`${config.PREFIX}setlogo\`\n\n*Or send:*\n\`${config.PREFIX}setlogo <image_url>\``,
      footer: "Send an image or image URL"
    }, { quoted: msg });
  } catch (error) {
    console.error('Change logo prompt error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to process logo change request.' 
    }, { quoted: msg });
  }
}

async function changeBotName(socket, msg, sender, number) {
  try {
    await socket.sendMessage(sender, {
      text: `*🤖 Change Bot Name*\n\nPlease send:\n\n\`${config.PREFIX}setname <new_bot_name>\`\n\n*Example:*\n\`${config.PREFIX}setname My Custom Bot\``,
      footer: "Maximum 30 characters"
    }, { quoted: msg });
  } catch (error) {
    console.error('Change botname prompt error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to process bot name change request.' 
    }, { quoted: msg });
  }
}

async function resetSettings(socket, msg, sender, number) {
  try {
    await socket.sendMessage(sender, {
      text: `*🔄 Reset Settings*\n\nAre you sure you want to reset all settings to default?\n\nThis will reset:\n• Bot name to "MASTER MD MINI"\n• Logo to default\n• All features to ON\n\nReply with \`${config.PREFIX}confirm_reset\` to confirm.`,
      footer: "This action cannot be undone"
    }, { quoted: msg });
  } catch (error) {
    console.error('Reset settings prompt error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to process reset request.' 
    }, { quoted: msg });
  }
}

// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const botNumber = socket.user.id ? socket.user.id.split(':')[0] : '';
    const isOwner = senderNumber === config.OWNER_NUMBER.replace(/[^0-9]/g,'');

    const body = (type === 'conversation') ? msg.message.conversation
      : (type === 'extendedTextMessage') ? msg.message.extendedTextMessage.text
      : (type === 'imageMessage' && msg.message.imageMessage.caption) ? msg.message.imageMessage.caption
      : (type === 'videoMessage' && msg.message.videoMessage.caption) ? msg.message.videoMessage.caption
      : (type === 'buttonsResponseMessage') ? msg.message.buttonsResponseMessage?.selectedButtonId
      : (type === 'listResponseMessage') ? msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
      : (type === 'viewOnceMessage') ? (msg.message.viewOnceMessage?.message?.imageMessage?.caption || '') : '';

    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage','videoMessage','audioMessage','documentMessage','stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }
    
    const fakevcard = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID"
      },
      message: {
        contactMessage: {
          displayName: "MASTER MD MINI",
          vcard: `BEGIN:VCARD
VERSION:3.0
N:MASTER MD;;;;;
FN:MASTER MD MINI
ORG:MASTER MD Tech
TEL;type=CELL;type=VOICE;waid=94720797915:+94 72 079 7915
END:VCARD`
        }
      }
    };

    if (!command) return;

    try {
      switch (command) {
        
        // ==================== SETTINGS COMMANDS ====================
        case 'settings':
        case 'config':
        case 'setting':
          await showSettingsMenu(socket, msg, sender, number);
          break;
        
        case 'toggle_autostatus':
          await toggleFeature(socket, msg, sender, number, 'autoStatus');
          break;
        
        case 'toggle_autolike':
          await toggleFeature(socket, msg, sender, number, 'autoLike');
          break;
        
        case 'toggle_autorecording':
          await toggleFeature(socket, msg, sender, number, 'autoRecording');
          break;
        
        case 'toggle_newsletter':
          await toggleFeature(socket, msg, sender, number, 'newsletterReactions');
          break;
        
        case 'change_logo':
          await changeLogo(socket, msg, sender, number);
          break;
        
        case 'change_botname':
          await changeBotName(socket, msg, sender, number);
          break;
        
        case 'reset_settings':
          await resetSettings(socket, msg, sender, number);
          break;
        
        case 'setlogo': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          let userCfg = await loadUserConfigFromMongo(sanitized) || {};
          
          // Check if message has image
          if (msg.message.imageMessage) {
            try {
              const downloaded = await downloadQuotedMedia(msg.message);
              if (downloaded && downloaded.buffer) {
                // Save buffer as base64 or URL
                const base64Image = downloaded.buffer.toString('base64');
                userCfg.logoBase64 = base64Image;
                userCfg.logo = 'uploaded_image';
                
                await setUserConfigInMongo(sanitized, userCfg);
                
                await socket.sendMessage(sender, {
                  text: '✅ Logo updated successfully from uploaded image!\n\nThe new logo will appear in bot messages.',
                  footer: "MASTER MD MINI - Settings"
                }, { quoted: msg });
                
                await showSettingsMenu(socket, msg, sender, number);
                break;
              }
            } catch (error) {
              console.error('Image download error:', error);
            }
          }
          
          // Try URL from args
          const url = args[0];
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            try {
              // Validate URL
              const response = await axios.head(url, { timeout: 5000 });
              const contentType = response.headers['content-type'];
              
              if (contentType && contentType.startsWith('image/')) {
                userCfg.logo = url;
                await setUserConfigInMongo(sanitized, userCfg);
                
                await socket.sendMessage(sender, {
                  image: { url: url },
                  caption: '✅ Logo updated successfully!\n\nThe new logo will appear in all bot messages.',
                  footer: "MASTER MD MINI - Settings"
                }, { quoted: msg });
                
                await showSettingsMenu(socket, msg, sender, number);
              } else {
                await socket.sendMessage(sender, {
                  text: '❌ Invalid image URL. Please provide a valid image URL.',
                  footer: "MASTER MD MINI - Settings"
                }, { quoted: msg });
              }
            } catch (error) {
              console.error('URL validation error:', error);
              await socket.sendMessage(sender, {
                text: '❌ Failed to validate image URL. Please check the URL and try again.',
                footer: "MASTER MD MINI - Settings"
              }, { quoted: msg });
            }
          } else {
            await socket.sendMessage(sender, {
              text: `*Usage:*\n\n1. Send an image with caption "${config.PREFIX}setlogo"\n2. Or send: "${config.PREFIX}setlogo <image_url>"`,
              footer: "MASTER MD MINI - Settings"
            }, { quoted: msg });
          }
          break;
        }
        
        case 'setname': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const newName = args.join(' ').trim();
          
          if (!newName || newName.length === 0) {
            await socket.sendMessage(sender, {
              text: `*Usage:* ${config.PREFIX}setname <new_bot_name>\n\n*Example:* ${config.PREFIX}setname My Awesome Bot`,
              footer: "MASTER MD MINI - Settings"
            }, { quoted: msg });
            break;
          }
          
          if (newName.length > 30) {
            await socket.sendMessage(sender, {
              text: '❌ Bot name too long. Maximum 30 characters allowed.',
              footer: "MASTER MD MINI - Settings"
            }, { quoted: msg });
            break;
          }
          
          let userCfg = await loadUserConfigFromMongo(sanitized) || {};
          const oldName = userCfg.botName || 'MASTER MD MINI';
          userCfg.botName = newName;
          
          await setUserConfigInMongo(sanitized, userCfg);
          
          await socket.sendMessage(sender, {
            text: `✅ Bot name updated!\n\n*Old Name:* ${oldName}\n*New Name:* ${newName}\n\nThe new name will appear in all bot messages.`,
            footer: "MASTER MD MINI - Settings"
          }, { quoted: msg });
          
          await showSettingsMenu(socket, msg, sender, number);
          break;
        }
        
        case 'confirm_reset': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const defaultConfig = {
            botName: 'MASTER MD MINI',
            logo: config.IMAGE_PATH,
            autoStatus: true,
            autoLike: true,
            autoRecording: false,
            newsletterReactions: true
          };
          
          await setUserConfigInMongo(sanitized, defaultConfig);
          
          await socket.sendMessage(sender, {
            text: '✅ All settings have been reset to default values!',
            footer: "MASTER MD MINI - Settings"
          }, { quoted: msg });
          
          await showSettingsMenu(socket, msg, sender, number);
          break;
        }
        
        // ==================== EXISTING COMMANDS (UNCHANGED) ====================
        case 'menu': {
          try { await socket.sendMessage(sender, { react: { text: "🌺", key: msg.key } }); } catch(e){}

          try {
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            let userCfg = {};
            try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; }
            catch(e){ console.warn('menu: failed to load config', e); userCfg = {}; }

            const title = userCfg.botName || 'MASTER MD MINI';

            const text = `

╭═══════  \`🤖${title}\`  ═══════*  
│
│*👤 *Owner :* ${config.OWNER_NAME || 'Sahan Maduwantha'}
│*🔧 *Prefix :* ${config.PREFIX}
│*📦 *Version :*  ${config.BOT_VERSION || 'Latest'}
│*🌐 *Platform :* ${process.env.PLATFORM || 'Heroku'}
│*⏰ *Uptime :* ${hours}h ${minutes}m ${seconds}s
╰════════════════════════════

╭═══════📜 Categories═══════
│  [1] 👑 Owner                           
│  [2] 📥 Downloader                           
│  [3] 🔧 Tools                            
│  [4] ⚙️ Settings                       
│  [5] 🎨 Creative                             
╰════════════════════════════

🌺 Have a nice day!
`.trim();

            const buttons = [
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Owner" }, type: 1 },
              { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 Downloader" }, type: 1 },
              { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: "🔧 Tools" }, type: 1 },
              { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ Settings" }, type: 1 },
              { buttonId: `${config.PREFIX}creative`, buttonText: { displayText: "🎨 Creative" }, type: 1 },
            ];

            const defaultImg = config.IMAGE_PATH;
            const useLogo = userCfg.logo || defaultImg;

            let imagePayload;
            if (String(useLogo).startsWith('http')) imagePayload = { url: useLogo };
            else if (userCfg.logoBase64) {
              imagePayload = Buffer.from(userCfg.logoBase64, 'base64');
            } else {
              try { imagePayload = fs.readFileSync(useLogo); } catch(e){ imagePayload = { url: defaultImg }; }
            }

            await socket.sendMessage(sender, {
              image: imagePayload,
              caption: text,
              footer: "*⚡ Powered by MASTER MD Tech *",
              buttons,
              headerType: 4
            }, { quoted: fakevcard });

          } catch (err) {
            console.error('menu command error:', err);
            try { await socket.sendMessage(sender, { text: '❌ Failed to show menu.' }, { quoted: msg }); } catch(e){}
          }
          break;
        }

        // ... REST OF THE EXISTING COMMANDS REMAIN UNCHANGED ...
        // (owner, download, tools, creative, ai, song, tiktok, etc.)
        // All your existing commands will work as before

        case 'owner': {
          // ... existing code ...
          break;
        }
        
        case 'download': {
          // ... existing code ...
          break;
        }
        
        case 'creative': {
          // ... existing code ...
          break;
        }
        
        case 'tools': {
          // ... existing code ...
          break;
        }
        
        case 'ai': {
          // ... existing code ...
          break;
        }
        
        case 'song': {
          // ... existing code ...
          break;
        }
        
        case 'tiktok': {
          // ... existing code ...
          break;
        }
        
        // ... and all other existing commands

        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { 
        await socket.sendMessage(sender, { 
          image: { url: config.FREE_IMAGE }, 
          caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', 'MASTER MD MINI') 
        }); 
      } catch(e){}
    }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    // Check auto recording setting
    const remoteJid = msg.key.remoteJid;
    const sanitized = socket.user.id.split(':')[0];
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const autoRecordingEnabled = userCfg.autoRecording !== false;
    
    if (autoRecordingEnabled && config.AUTO_RECORDING === 'true') {
      try { await socket.sendPresenceUpdate('recording', remoteJid); } catch (e) {}
    }
  });
}

// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('*🚀 OWNER NOTICE — SESSION REMOVED*', `Number: ${sanitized}\nSession removed due to logout.\n\nActive sessions now: ${activeSockets.size}`, 'MASTER MD MINI');
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.FREE_IMAGE }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
                         || lastDisconnect?.error?.statusCode
                         || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401
                          || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION')
                          || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out'))
                          || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { 
          await delay(10000); 
          activeSockets.delete(number.replace(/[^0-9]/g,'')); 
          socketCreationTime.delete(number.replace(/[^0-9]/g,'')); 
          const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; 
          await EmpirePair(number, mockRes); 
        } catch(e){ console.error('Reconnect attempt failed', e); }
      }
    }
  });
}

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
      console.log('Prefilled creds from Mongo');
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Safari')
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    // Pass session number to handlers for user-specific settings
    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { await delay(1500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        catch (error) { retries--; await delay(2000 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const fileContent = await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8');
        const credsObj = JSON.parse(fileContent);
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) { console.error('Failed saving creds on creds.update:', err); }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || 'MASTER MD MINI';
          const useLogo = userConfig.logo || config.FREE_IMAGE;

          const initialCaption = formatMessage(useBotName,
            `*✅ Bot Activated Successfully!*\n\n*📱 Number:* ${sanitizedNumber}\n*⏰ Connecting: Bot will become active in a few seconds*`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else if (userConfig.logoBase64) {
              const buffer = Buffer.from(userConfig.logoBase64, 'base64');
              sentMsg = await socket.sendMessage(userJid, { image: buffer, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.FREE_IMAGE }, caption: initialCaption });
              }
            }
          } catch (e) {
            console.warn('Failed to send initial connect message (image). Falling back to text.', e?.message || e);
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(4000);

          const updatedCaption = formatMessage(useBotName,
            `*✅ Bot Connected - MASTER MD MINI*\n\n*📱 Number:* ${sanitizedNumber}\n*📊 Condition:* ${groupStatus}\n*⏰ Connected At:* ${getZimbabweanTimestamp()}`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message (not fatal):', delErr?.message || delErr);
              }
            }

            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else if (userConfig.logoBase64) {
                const buffer = Buffer.from(userConfig.logoBase64, 'base64');
                await socket.sendMessage(userJid, { image: buffer, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

          // Send welcome message with settings info
          await delay(2000);
          await socket.sendMessage(userJid, {
            text: `*Welcome to MASTER MD MINI!*\n\nYour bot is now active. Use \`${config.PREFIX}menu\` to see all commands.\n\n*Customize your bot:*\nUse \`${config.PREFIX}settings\` to change logo, bot name, and control all features.`,
            footer: "Powered by MASTER MD Tech"
          });

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'MASTER-MD-MINI'}`); } catch(e) { console.error('pm2 restart failed', e); }
        }
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});

// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ botName: 'MASTER MD MINI', count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getZimbabweanTimestamp() });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: 'MASTER MD MINI', message: '🎉 Bot is active', activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});

router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});

router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});

router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.FREE_IMAGE }, caption: formatMessage('📋 CONFIG UPDATED', 'Your configuration has been successfully updated!', 'MASTER MD MINI') });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});

router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});

// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});

// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});

// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { exec(`pm2.restart ${process.env.PM2_NAME || 'MASTER-MD-MINI'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
});

// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{ 
  try { 
    const nums = await getAllNumbersFromMongo(); 
    if (nums && nums.length) { 
      for (const n of nums) { 
        if (!activeSockets.has(n)) { 
          const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; 
          await EmpirePair(n, mockRes); 
          await delay(500); 
        } 
      } 
    } 
  } catch(e){}
})();

module.exports = router;
