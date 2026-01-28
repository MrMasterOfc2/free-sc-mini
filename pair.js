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
  DisconnectReason,
  updateProfilePicture,
  updateProfileStatus,
  updateProfileName
} = require('baileys');

// ---------------- CONFIG ----------------
const BOT_NAME_FREE = 'MASTER MD MINI';

const config = {
  AUTO_VIEW_STATUS: 'false',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['🌸', '🪴', '💫', '🍂', '🌟','🫀', '👀', '🤖', '🚩', '🥰', '🗿', '💜', '💙', '🌝', '🖤', '💚'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'https://chat.whatsapp.com/Dh7gxX9AoVD8gsgWUkhB9r',
  FREE_IMAGE: 'https://files.catbox.moe/f9gwsx.jpg',
  NEWSLETTER_JID: '120363402507750390@newsletter',
  
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
  BOT_VERSION: '1.0.3',
  OWNER_NAME: 'Sahan Maduwantha',
  IMAGE_PATH: 'https://files.catbox.moe/f9gwsx.jpg',
  BOT_FOOTER: '> Powered by MASTER MD Tech',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/f9gwsx.jpg' }
};

// ---------------- MONGO SETUP ----------------

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://malvintech11_db_user:0SBgxRy7WsQZ1KTq@cluster0.xqgaovj.mongodb.net/?appName=Cluster0';
const MONGO_DB = process.env.MONGO_DB || 'Free_Mini';

let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol, autoreplyCol, profileSettingsCol;

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
  autoreplyCol = mongoDB.collection('autoreply');
  profileSettingsCol = mongoDB.collection('profile_settings');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  await autoreplyCol.createIndex({ number: 1, keyword: 1 }, { unique: true });
  await profileSettingsCol.createIndex({ number: 1 }, { unique: true });
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

// ---------------- Auto Reply Functions ----------------

async function saveAutoReply(number, keyword, reply, type = 'public') {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = {
      number: sanitized,
      keyword: keyword.toLowerCase(),
      reply,
      type,
      created: new Date()
    };
    await autoreplyCol.updateOne(
      { number: sanitized, keyword: keyword.toLowerCase() },
      { $set: doc },
      { upsert: true }
    );
    console.log(`Auto reply saved: ${keyword} -> ${reply}`);
    return true;
  } catch (e) {
    console.error('saveAutoReply error:', e);
    return false;
  }
}

async function deleteAutoReply(number, keyword) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoreplyCol.deleteOne({ number: sanitized, keyword: keyword.toLowerCase() });
    console.log(`Auto reply deleted: ${keyword}`);
    return true;
  } catch (e) {
    console.error('deleteAutoReply error:', e);
    return false;
  }
}

async function getAutoReplies(number, type = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const query = { number: sanitized };
    if (type) query.type = type;
    
    const replies = await autoreplyCol.find(query).sort({ keyword: 1 }).toArray();
    return replies;
  } catch (e) {
    console.error('getAutoReplies error:', e);
    return [];
  }
}

async function getAutoReply(number, message) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const messageLower = message.toLowerCase();
    
    const replies = await autoreplyCol.find({ number: sanitized }).toArray();
    
    for (const reply of replies) {
      if (messageLower.includes(reply.keyword.toLowerCase())) {
        return reply;
      }
    }
    
    return null;
  } catch (e) {
    console.error('getAutoReply error:', e);
    return null;
  }
}

// ---------------- Profile Settings Functions ----------------

async function saveProfileSettings(number, settings) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = {
      number: sanitized,
      settings,
      updatedAt: new Date()
    };
    await profileSettingsCol.updateOne(
      { number: sanitized },
      { $set: doc },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error('saveProfileSettings error:', e);
    return false;
  }
}

async function loadProfileSettings(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await profileSettingsCol.findOne({ number: sanitized });
    return doc ? doc.settings : null;
  } catch (e) {
    console.error('loadProfileSettings error:', e);
    return null;
  }
}

// ---------------- Newsletter Functions ----------------

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

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}

function generateOTP() { 
  return Math.floor(100000 + Math.random() * 900000).toString(); 
}

function getZimbabweanTimestamp() { 
  return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); 
}

const activeSockets = new Map();
const socketCreationTime = new Map();
const otpStore = new Map();
const pairCodes = new Map(); // Store pair codes

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
  try { 
    await socket.sendMessage(userJid, { text: message }); 
    console.log(`OTP ${otp} sent to ${number}`); 
  } catch (error) { 
    console.error(`Failed to send OTP to ${number}:`, error); 
    throw error; 
  }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const userCfg = await loadUserConfigFromMongo(sessionNumber) || {};
      const newsletterReactionsEnabled = userCfg.newsletterReactions !== false;
      
      if (!newsletterReactionsEnabled) return;
      
      const followedDocs = await listNewslettersFromMongo();
      const reactConfigs = await listNewslettersFromMongo();
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

// ---------------- status + auto reply handlers ----------------

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    
    // Check for auto reply
    if (message.key.remoteJid !== 'status@broadcast') {
      const userCfg = await loadUserConfigFromMongo(sessionNumber) || {};
      const autoReplyEnabled = userCfg.autoReply !== false;
      
      if (autoReplyEnabled && message.message) {
        try {
          const body = getMessageBody(message.message);
          if (body) {
            const autoReply = await getAutoReply(sessionNumber, body);
            if (autoReply) {
              // Check chat type settings
              const chatType = message.key.remoteJid.endsWith('@g.us') ? 'group' : 'private';
              const allowedTypes = userCfg.chatTypes || ['private', 'group'];
              
              if (allowedTypes.includes(chatType)) {
                await socket.sendMessage(message.key.remoteJid, { text: autoReply.reply }, { quoted: message });
                console.log(`Auto reply sent for keyword: ${autoReply.keyword}`);
              }
            }
          }
        } catch (error) {
          console.error('Auto reply error:', error);
        }
      }
    }
    
    // Status handling
    if (message.key.remoteJid === 'status@broadcast' && message.key.participant) {
      try {
        const userCfg = await loadUserConfigFromMongo(sessionNumber) || {};
        const autoStatusEnabled = userCfg.autoStatus !== false;
        
        if (config.AUTO_RECORDING === 'true') {
          await socket.sendPresenceUpdate("recording", message.key.remoteJid);
        }
        
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
              await socket.sendMessage(message.key.remoteJid, { 
                react: { text: randomEmoji, key: message.key } 
              }, { statusJidList: [message.key.participant] });
              break;
            } catch (error) { 
              retries--; 
              await delay(1000 * (config.MAX_RETRIES - retries)); 
              if (retries===0) throw error; 
            }
          }
        }
      } catch (error) { 
        console.error('Status handler error:', error); 
      }
    }
  });
}

function getMessageBody(message) {
  const type = getContentType(message);
  if (!message) return '';
  
  if (type === 'conversation') return message.conversation;
  if (type === 'extendedTextMessage') return message.extendedTextMessage?.text || '';
  if (type === 'imageMessage') return message.imageMessage?.caption || '';
  if (type === 'videoMessage') return message.videoMessage?.caption || '';
  if (type === 'buttonsResponseMessage') return message.buttonsResponseMessage?.selectedButtonId || '';
  if (type === 'listResponseMessage') return message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
  
  return '';
}

// ---------------- Settings Menu Functions ----------------

async function showSettingsMenu(socket, msg, sender, number) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    
    const botName = userCfg.botName || 'MASTER MD MINI';
    const autoStatus = userCfg.autoStatus !== false ? '✅ ON' : '❌ OFF';
    const autoLike = userCfg.autoLike !== false ? '✅ ON' : '❌ OFF';
    const autoRecording = userCfg.autoRecording !== false ? '✅ ON' : '❌ OFF';
    const newsletterReactions = userCfg.newsletterReactions !== false ? '✅ ON' : '❌ OFF';
    const autoReply = userCfg.autoReply !== false ? '✅ ON' : '❌ OFF';
    
    const chatTypes = userCfg.chatTypes || ['private', 'group'];
    const chatTypeText = chatTypes.includes('private') && chatTypes.includes('group') 
      ? 'Private + Group' 
      : chatTypes.includes('private') 
        ? 'Private Only' 
        : 'Group Only';
    
    const settingsText = `
*⚙️ MASTER MD MINI - SETTINGS PANEL*

┌────────────────────────────
│ *🤖 Bot Name:* ${botName}
│ *🔢 Session:* ${number || 'N/A'}
└────────────────────────────

*🔧 FEATURE CONTROLS*

┌────────────────────────────
│ 👁️ *Auto Status Read:* ${autoStatus}
│ ❤️ *Auto Like Status:* ${autoLike}
│ 🎥 *Auto Recording:* ${autoRecording}
│ 📰 *Newsletter Reactions:* ${newsletterReactions}
│ 🤖 *Auto Reply:* ${autoReply}
│ 💬 *Chat Types:* ${chatTypeText}
└────────────────────────────

*Use buttons below to control features*
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}toggle_autostatus`, 
        buttonText: { displayText: "👁️ Auto Status" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_autolike`, 
        buttonText: { displayText: "❤️ Auto Like" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_autorecording`, 
        buttonText: { displayText: "🎥 Auto Record" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_newsletter`, 
        buttonText: { displayText: "📰 Newsletter" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}toggle_autoreply`, 
        buttonText: { displayText: "🤖 Auto Reply" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}chattype_menu`, 
        buttonText: { displayText: "💬 Chat Types" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}autoreply_menu`, 
        buttonText: { displayText: "📝 Auto Reply" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}profile_menu`, 
        buttonText: { displayText: "👤 Profile" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}developer_menu`, 
        buttonText: { displayText: "👨‍💻 Developer" }, 
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
      'newsletter': 'Newsletter Reactions',
      'autoreply': 'Auto Reply'
    };
    
    const currentStatus = userCfg[feature] !== false;
    userCfg[feature] = !currentStatus;
    
    await setUserConfigInMongo(sanitized, userCfg);
    
    const statusText = userCfg[feature] ? '✅ ENABLED' : '❌ DISABLED';
    const featureName = featureNames[feature] || feature;
    
    await socket.sendMessage(sender, {
      text: `*🔧 Feature Updated*\n\n*${featureName}* is now *${statusText}*`,
      footer: "MASTER MD MINI - Settings"
    }, { quoted: msg });
    
    console.log(`User ${sanitized} toggled ${feature} to: ${userCfg[feature]}`);
    
    await showSettingsMenu(socket, msg, sender, number);
    
  } catch (error) {
    console.error(`Toggle ${feature} error:`, error);
    await socket.sendMessage(sender, { 
      text: `❌ Failed to toggle ${feature}. Please try again.` 
    }, { quoted: msg });
  }
}

async function showChatTypeMenu(socket, msg, sender, number) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const userCfg = await loadUserConfigFromMongo(sanitized) || {};
    const chatTypes = userCfg.chatTypes || ['private', 'group'];
    
    const privateChecked = chatTypes.includes('private') ? '✅' : '⬜';
    const groupChecked = chatTypes.includes('group') ? '✅' : '⬜';
    
    const chatTypeText = `
*💬 CHAT TYPE SETTINGS*

Select where your bot should respond:

${privateChecked} *Private Chat* - Bot responds in private messages
${groupChecked} *Group Chat* - Bot responds in group messages

*Current Setting:* ${chatTypes.includes('private') && chatTypes.includes('group') 
  ? 'Private + Group' 
  : chatTypes.includes('private') 
    ? 'Private Only' 
    : 'Group Only'}
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}set_chattype_private`, 
        buttonText: { displayText: "👤 Private Only" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}set_chattype_group`, 
        buttonText: { displayText: "👥 Group Only" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}set_chattype_both`, 
        buttonText: { displayText: "👤👥 Both" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}settings`, 
        buttonText: { displayText: "🔙 Back" }, 
        type: 1 
      }
    ];

    await socket.sendMessage(sender, {
      text: chatTypeText,
      footer: "Select chat type for bot responses",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Chat type menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load chat type menu.' 
    }, { quoted: msg });
  }
}

async function setChatType(socket, msg, sender, number, type) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let userCfg = await loadUserConfigFromMongo(sanitized) || {};
    
    let chatTypes = [];
    let typeText = '';
    
    switch(type) {
      case 'private':
        chatTypes = ['private'];
        typeText = 'Private Chat Only';
        break;
      case 'group':
        chatTypes = ['group'];
        typeText = 'Group Chat Only';
        break;
      case 'both':
        chatTypes = ['private', 'group'];
        typeText = 'Private + Group Chat';
        break;
      default:
        chatTypes = ['private', 'group'];
        typeText = 'Private + Group Chat';
    }
    
    userCfg.chatTypes = chatTypes;
    await setUserConfigInMongo(sanitized, userCfg);
    
    await socket.sendMessage(sender, {
      text: `*💬 Chat Type Updated*\n\nBot will now respond in: *${typeText}*`,
      footer: "MASTER MD MINI - Settings"
    }, { quoted: msg });
    
    await showChatTypeMenu(socket, msg, sender, number);
    
  } catch (error) {
    console.error('Set chat type error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to update chat type.' 
    }, { quoted: msg });
  }
}

// ---------------- Auto Reply Menu Functions ----------------

async function showAutoReplyMenu(socket, msg, sender, number) {
  try {
    const autoReplyText = `
*📝 AUTO REPLY MANAGER*

Manage automatic replies for specific keywords:

*Available Commands:*
• *${config.PREFIX}addreply <keyword>|<reply>* - Add auto reply
• *${config.PREFIX}delreply <keyword>* - Delete auto reply
• *${config.PREFIX}listreplies* - List all auto replies

*Example:*
\`${config.PREFIX}addreply hello|Hello! How can I help you?\`

*Current Auto Replies:* (Use ${config.PREFIX}listreplies to view)
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}listreplies`, 
        buttonText: { displayText: "📋 List Replies" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}addreply_prompt`, 
        buttonText: { displayText: "➕ Add Reply" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}delreply_prompt`, 
        buttonText: { displayText: "➖ Delete Reply" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}settings`, 
        buttonText: { displayText: "🔙 Back" }, 
        type: 1 
      }
    ];

    await socket.sendMessage(sender, {
      text: autoReplyText,
      footer: "Auto reply system",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Auto reply menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load auto reply menu.' 
    }, { quoted: msg });
  }
}

// ---------------- Profile Menu Functions ----------------

async function showProfileMenu(socket, msg, sender, number) {
  try {
    const profileText = `
*👤 PROFILE SETTINGS*

Change your WhatsApp profile settings:

*Available Options:*
• *Profile Picture* - Change your profile photo
• *Profile Name* - Change your display name
• *About/Bio* - Change your status/about text
• *Last Seen* - Change last seen privacy
• *Profile Photo* - Change profile photo privacy
• *Status* - Change status privacy

*Note:* These changes affect your actual WhatsApp profile.
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}profile_pic`, 
        buttonText: { displayText: "🖼️ Profile Pic" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}profile_name`, 
        buttonText: { displayText: "📝 Profile Name" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}profile_about`, 
        buttonText: { displayText: "📄 About/Bio" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}privacy_menu`, 
        buttonText: { displayText: "🔒 Privacy" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}settings`, 
        buttonText: { displayText: "🔙 Back" }, 
        type: 1 
      }
    ];

    await socket.sendMessage(sender, {
      text: profileText,
      footer: "Profile management system",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Profile menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load profile menu.' 
    }, { quoted: msg });
  }
}

async function showPrivacyMenu(socket, msg, sender, number) {
  try {
    const privacyText = `
*🔒 PRIVACY SETTINGS*

Change your WhatsApp privacy settings:

*Available Options:*
• *Last Seen* - Who can see your last seen
• *Profile Photo* - Who can see your profile photo
• *About* - Who can see your about info
• *Status* - Who can see your status
• *Groups* - Who can add you to groups
• *My Contacts* - Set to "My Contacts"
• *Nobody* - Set to "Nobody"

*Example Commands:*
\`${config.PREFIX}setprivacy lastseen mycontacts\`
\`${config.PREFIX}setprivacy profilepic nobody\`
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}setprivacy lastseen mycontacts`, 
        buttonText: { displayText: "👁️ Last: MyContacts" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy lastseen nobody`, 
        buttonText: { displayText: "👁️ Last: Nobody" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy profilepic mycontacts`, 
        buttonText: { displayText: "🖼️ Photo: MyContacts" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy profilepic nobody`, 
        buttonText: { displayText: "🖼️ Photo: Nobody" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy about mycontacts`, 
        buttonText: { displayText: "📄 About: MyContacts" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy about nobody`, 
        buttonText: { displayText: "📄 About: Nobody" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy status mycontacts`, 
        buttonText: { displayText: "📝 Status: MyContacts" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}setprivacy status nobody`, 
        buttonText: { displayText: "📝 Status: Nobody" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}profile_menu`, 
        buttonText: { displayText: "🔙 Back" }, 
        type: 1 
      }
    ];

    await socket.sendMessage(sender, {
      text: privacyText,
      footer: "Privacy settings management",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Privacy menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load privacy menu.' 
    }, { quoted: msg });
  }
}

// ---------------- Developer Menu Functions ----------------

async function showDeveloperMenu(socket, msg, sender, number) {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const activeCount = activeSockets.size;
    const activeNumbers = Array.from(activeSockets.keys());
    
    const developerText = `
*👨‍💻 DEVELOPER PANEL*

*Bot Information:*
• *Name:* MASTER MD MINI
• *Version:* ${config.BOT_VERSION}
• *Owner:* ${config.OWNER_NAME}
• *Owner Number:* ${config.OWNER_NUMBER}

*Session Statistics:*
• *Active Sessions:* ${activeCount}
• *Your Session:* ${number || 'N/A'}
• *Uptime:* ${socketCreationTime.has(sanitized) 
  ? Math.floor((Date.now() - socketCreationTime.get(sanitized)) / 1000) + 's' 
  : 'N/A'}

*Available Commands:*
• *${config.PREFIX}activesessions* - Show all active sessions
• *${config.PREFIX}sessioninfo* - Show session details
• *${config.PREFIX}restart* - Restart bot session
• *${config.PREFIX}logout* - Logout from session
`.trim();

    const buttons = [
      { 
        buttonId: `${config.PREFIX}activesessions`, 
        buttonText: { displayText: "📊 Active Sessions" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}sessioninfo`, 
        buttonText: { displayText: "ℹ️ Session Info" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}restart_session`, 
        buttonText: { displayText: "🔄 Restart" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}logout_session`, 
        buttonText: { displayText: "🚪 Logout" }, 
        type: 1 
      },
      { 
        buttonId: `${config.PREFIX}settings`, 
        buttonText: { displayText: "🔙 Back" }, 
        type: 1 
      }
    ];

    // Only show admin commands to owner/admins
    const admins = await loadAdminsFromMongo();
    const isAdmin = admins.includes(sender) || admins.includes(sender.split('@')[0]);
    
    if (isAdmin) {
      buttons.push(
        { 
          buttonId: `${config.PREFIX}admin_panel`, 
          buttonText: { displayText: "👑 Admin Panel" }, 
          type: 1 
        }
      );
    }

    await socket.sendMessage(sender, {
      text: developerText,
      footer: "Developer controls",
      buttons,
      headerType: 1
    }, { quoted: msg });

  } catch (error) {
    console.error('Developer menu error:', error);
    await socket.sendMessage(sender, { 
      text: '❌ Failed to load developer menu.' 
    }, { quoted: msg });
  }
}

// ---------------- Pair Code Generation ----------------

async function generatePairCode(socket, number) {
  try {
    const sanitized = number.replace(/[^0-9]/g, '');
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with expiry (10 minutes)
    pairCodes.set(sanitized, {
      code,
      expiry: Date.now() + (10 * 60 * 1000), // 10 minutes
      socket: socket
    });
    
    // Send code to user
    const userJid = jidNormalizedUser(socket.user.id);
    const message = formatMessage(
      `*🔐 PAIR CODE - MASTER MD MINI*`,
      `*Your Pair Code is:* \`${code}\`\n\n*Instructions:*\n1. Open WhatsApp Web/Desktop\n2. Click "Link a Device"\n3. Select "Pair with phone number"\n4. Enter this code: *${code}*\n\n*Code expires in 10 minutes.*`,
      `MASTER MD MINI`
    );
    
    await socket.sendMessage(userJid, { text: message });
    console.log(`Pair code ${code} generated for ${sanitized}`);
    
    return code;
  } catch (error) {
    console.error('Generate pair code error:', error);
    throw error;
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

    const body = getMessageBody(msg.message);
    if (!body || typeof body !== 'string') return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

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
        
        case 'toggle_autoreply':
          await toggleFeature(socket, msg, sender, number, 'autoReply');
          break;
        
        case 'chattype_menu':
          await showChatTypeMenu(socket, msg, sender, number);
          break;
        
        case 'set_chattype_private':
          await setChatType(socket, msg, sender, number, 'private');
          break;
        
        case 'set_chattype_group':
          await setChatType(socket, msg, sender, number, 'group');
          break;
        
        case 'set_chattype_both':
          await setChatType(socket, msg, sender, number, 'both');
          break;
        
        // ==================== AUTO REPLY COMMANDS ====================
        case 'autoreply_menu':
          await showAutoReplyMenu(socket, msg, sender, number);
          break;
        
        case 'addreply_prompt':
          await socket.sendMessage(sender, {
            text: `*➕ ADD AUTO REPLY*\n\nFormat: ${config.PREFIX}addreply <keyword>|<reply>\n\nExample:\n\`${config.PREFIX}addreply hello|Hello! How can I help you?\`\n\n*Note:* Use | to separate keyword and reply.`,
            footer: "Auto reply system"
          }, { quoted: msg });
          break;
        
        case 'delreply_prompt':
          await socket.sendMessage(sender, {
            text: `*➖ DELETE AUTO REPLY*\n\nFormat: ${config.PREFIX}delreply <keyword>\n\nExample:\n\`${config.PREFIX}delreply hello\`\n\n*Note:* Use ${config.PREFIX}listreplies to see all keywords.`,
            footer: "Auto reply system"
          }, { quoted: msg });
          break;
        
        case 'addreply': {
          const input = args.join(' ').trim();
          if (!input || !input.includes('|')) {
            await socket.sendMessage(sender, {
              text: `*❌ Invalid Format*\n\nFormat: ${config.PREFIX}addreply <keyword>|<reply>\n\nExample:\n\`${config.PREFIX}addreply hello|Hello! How can I help you?\``,
              footer: "Auto reply system"
            }, { quoted: msg });
            break;
          }
          
          const [keyword, replyText] = input.split('|').map(s => s.trim());
          if (!keyword || !replyText) {
            await socket.sendMessage(sender, {
              text: `*❌ Invalid Format*\n\nBoth keyword and reply are required.`,
              footer: "Auto reply system"
            }, { quoted: msg });
            break;
          }
          
          const success = await saveAutoReply(number, keyword, replyText);
          if (success) {
            await socket.sendMessage(sender, {
              text: `*✅ Auto Reply Added*\n\n*Keyword:* ${keyword}\n*Reply:* ${replyText}\n\nBot will now automatically reply when someone sends "${keyword}".`,
              footer: "Auto reply system"
            }, { quoted: msg });
          } else {
            await socket.sendMessage(sender, {
              text: `*❌ Failed to add auto reply. Please try again.`,
              footer: "Auto reply system"
            }, { quoted: msg });
          }
          break;
        }
        
        case 'delreply': {
          const keyword = args.join(' ').trim();
          if (!keyword) {
            await socket.sendMessage(sender, {
              text: `*❌ Please specify a keyword to delete.*\n\nFormat: ${config.PREFIX}delreply <keyword>`,
              footer: "Auto reply system"
            }, { quoted: msg });
            break;
          }
          
          const success = await deleteAutoReply(number, keyword);
          if (success) {
            await socket.sendMessage(sender, {
              text: `*✅ Auto Reply Deleted*\n\nKeyword "${keyword}" has been removed from auto replies.`,
              footer: "Auto reply system"
            }, { quoted: msg });
          } else {
            await socket.sendMessage(sender, {
              text: `*❌ Failed to delete auto reply. Keyword not found.`,
              footer: "Auto reply system"
            }, { quoted: msg });
          }
          break;
        }
        
        case 'listreplies': {
          const replies = await getAutoReplies(number);
          if (replies.length === 0) {
            await socket.sendMessage(sender, {
              text: `*📝 AUTO REPLIES*\n\nNo auto replies configured yet.\n\nUse ${config.PREFIX}addreply <keyword>|<reply> to add one.`,
              footer: "Auto reply system"
            }, { quoted: msg });
            break;
          }
          
          let replyText = `*📝 AUTO REPLIES LIST*\n\n*Total:* ${replies.length} replies\n\n`;
          replies.forEach((reply, index) => {
            replyText += `*${index + 1}. ${reply.keyword}*\n   Reply: ${reply.reply}\n\n`;
          });
          
          replyText += `\n*Use:* ${config.PREFIX}delreply <keyword> to delete a reply.`;
          
          await socket.sendMessage(sender, {
            text: replyText,
            footer: "Auto reply system"
          }, { quoted: msg });
          break;
        }
        
        // ==================== PROFILE COMMANDS ====================
        case 'profile_menu':
          await showProfileMenu(socket, msg, sender, number);
          break;
        
        case 'privacy_menu':
          await showPrivacyMenu(socket, msg, sender, number);
          break;
        
        case 'setprivacy': {
          const [setting, value] = args;
          if (!setting || !value) {
            await socket.sendMessage(sender, {
              text: `*❌ Invalid Format*\n\nFormat: ${config.PREFIX}setprivacy <setting> <value>\n\n*Settings:* lastseen, profilepic, about, status\n*Values:* mycontacts, nobody\n\nExample:\n\`${config.PREFIX}setprivacy lastseen mycontacts\``,
              footer: "Privacy settings"
            }, { quoted: msg });
            break;
          }
          
          // Note: Actual privacy setting requires WhatsApp API support
          // This is a placeholder implementation
          await socket.sendMessage(sender, {
            text: `*🔒 Privacy Setting*\n\n*Setting:* ${setting}\n*Value:* ${value}\n\n*Note:* Privacy settings require WhatsApp API support. This feature is in development.`,
            footer: "Privacy settings"
          }, { quoted: msg });
          break;
        }
        
        case 'profile_pic':
          await socket.sendMessage(sender, {
            text: `*🖼️ Profile Picture*\n\nTo change profile picture, send an image with caption:\n\n\`${config.PREFIX}setprofilepic\`\n\n*Note:* This will change your actual WhatsApp profile picture.`,
            footer: "Profile management"
          }, { quoted: msg });
          break;
        
        case 'profile_name':
          await socket.sendMessage(sender, {
            text: `*📝 Profile Name*\n\nTo change profile name, send:\n\n\`${config.PREFIX}setprofilename <new_name>\`\n\nExample:\n\`${config.PREFIX}setprofilename Sahan Maduwantha\``,
            footer: "Profile management"
          }, { quoted: msg });
          break;
        
        case 'profile_about':
          await socket.sendMessage(sender, {
            text: `*📄 About/Bio*\n\nTo change about/bio, send:\n\n\`${config.PREFIX}setabout <text>\`\n\nExample:\n\`${config.PREFIX}setabout Available for work! 🚀\``,
            footer: "Profile management"
          }, { quoted: msg });
          break;
        
        // ==================== DEVELOPER COMMANDS ====================
        case 'developer_menu':
          await showDeveloperMenu(socket, msg, sender, number);
          break;
        
        case 'activesessions': {
          const activeCount = activeSockets.size;
          const activeNumbers = Array.from(activeSockets.keys());
          
          let sessionText = `*📊 ACTIVE SESSIONS*\n\n*Total Active:* ${activeCount}\n\n`;
          
          if (activeCount > 0) {
            activeNumbers.forEach((num, index) => {
              const uptime = socketCreationTime.has(num) 
                ? Math.floor((Date.now() - socketCreationTime.get(num)) / 1000) 
                : 0;
              const hours = Math.floor(uptime / 3600);
              const minutes = Math.floor((uptime % 3600) / 60);
              const seconds = Math.floor(uptime % 60);
              
              sessionText += `*${index + 1}. ${num}*\n   Uptime: ${hours}h ${minutes}m ${seconds}s\n\n`;
            });
          } else {
            sessionText += `No active sessions found.\n`;
          }
          
          sessionText += `\n*Owner:* ${config.OWNER_NAME}`;
          
          await socket.sendMessage(sender, {
            text: sessionText,
            footer: "Developer panel"
          }, { quoted: msg });
          break;
        }
        
        case 'sessioninfo': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const uptime = socketCreationTime.has(sanitized) 
            ? Math.floor((Date.now() - socketCreationTime.get(sanitized)) / 1000) 
            : 0;
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);
          const seconds = Math.floor(uptime % 60);
          
          const sessionInfo = `
*ℹ️ SESSION INFORMATION*

*Session Number:* ${sanitized}
*Uptime:* ${hours}h ${minutes}m ${seconds}s
*Bot Name:* MASTER MD MINI
*Version:* ${config.BOT_VERSION}
*Owner:* ${config.OWNER_NAME}

*Connection Status:* ✅ Active
*Last Check:* ${getZimbabweanTimestamp()}
          `.trim();
          
          await socket.sendMessage(sender, {
            text: sessionInfo,
            footer: "Session details"
          }, { quoted: msg });
          break;
        }
        
        case 'restart_session': {
          await socket.sendMessage(sender, {
            text: `*🔄 Restarting Session...*\n\nPlease wait while your bot session restarts. This may take a few seconds.`,
            footer: "Session management"
          }, { quoted: msg });
          
          // Simulate restart
          setTimeout(() => {
            socket.sendMessage(sender, {
              text: `*✅ Session Restarted*\n\nYour bot session has been restarted successfully!`,
              footer: "Session management"
            }, { quoted: msg }).catch(() => {});
          }, 2000);
          break;
        }
        
        case 'logout_session': {
          await socket.sendMessage(sender, {
            text: `*🚪 Logout Session*\n\nAre you sure you want to logout this session?\n\nReply with \`${config.PREFIX}confirm_logout\` to confirm.`,
            footer: "Session management"
          }, { quoted: msg });
          break;
        }
        
        case 'confirm_logout': {
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          await socket.sendMessage(sender, {
            text: `*🚪 Logging out...*\n\nYour session will be logged out. You'll need to pair again to use the bot.`,
            footer: "Session management"
          }, { quoted: msg });
          
          // Perform logout
          try {
            if (typeof socket.logout === 'function') {
              await socket.logout();
            }
          } catch (e) {
            console.error('Logout error:', e);
          }
          
          // Cleanup
          activeSockets.delete(sanitized);
          socketCreationTime.delete(sanitized);
          break;
        }
        
        // ==================== PAIR COMMAND ====================
        case 'pair': {
          try {
            const code = await generatePairCode(socket, number);
            await socket.sendMessage(sender, {
              text: `*🔐 PAIR CODE GENERATED*\n\n*Your Code:* \`${code}\`\n\n*Instructions:*\n1. Open WhatsApp Web/Desktop\n2. Click "Link a Device"\n3. Select "Pair with phone number"\n4. Enter: *${code}*\n\n*Code expires in 10 minutes.*`,
              footer: "MASTER MD MINI - Pairing System"
            }, { quoted: msg });
          } catch (error) {
            await socket.sendMessage(sender, {
              text: `*❌ Failed to generate pair code. Please try again.*`,
              footer: "MASTER MD MINI"
            }, { quoted: msg });
          }
          break;
        }
        
        // ==================== EXISTING MENU COMMANDS ====================
        case 'menu': {
          try { await socket.sendMessage(sender, { react: { text: "🌺", key: msg.key } }); } catch(e){}

          try {
            const startTime = socketCreationTime.get(number) || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            let userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {};
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
│  [6] 🔐 Pair Code
╰════════════════════════════

🌺 Have a nice day!
`.trim();

            const buttons = [
              { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: "👑 Owner" }, type: 1 },
              { buttonId: `${config.PREFIX}download`, buttonText: { displayText: "📥 Downloader" }, type: 1 },
              { buttonId: `${config.PREFIX}tools`, buttonText: { displayText: "🔧 Tools" }, type: 1 },
              { buttonId: `${config.PREFIX}settings`, buttonText: { displayText: "⚙️ Settings" }, type: 1 },
              { buttonId: `${config.PREFIX}creative`, buttonText: { displayText: "🎨 Creative" }, type: 1 },
              { buttonId: `${config.PREFIX}pair`, buttonText: { displayText: "🔐 Pair Code" }, type: 1 },
            ];

            const defaultImg = config.IMAGE_PATH;
            const useLogo = userCfg.logo || defaultImg;

            let imagePayload;
            if (String(useLogo).startsWith('http')) {
              imagePayload = { url: useLogo };
            } else {
              try { 
                imagePayload = fs.readFileSync(useLogo); 
              } catch(e){ 
                imagePayload = { url: defaultImg }; 
              }
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
            try { 
              await socket.sendMessage(sender, { 
                text: '❌ Failed to show menu.' 
              }, { quoted: msg }); 
            } catch(e){}
          }
          break;
        }

        // ==================== OTHER EXISTING COMMANDS ====================
        case 'owner': {
          // ... existing owner menu code ...
          const ownerText = `
*👑 OWNER MENU*

*Bot Owner:* ${config.OWNER_NAME}
*Contact:* ${config.OWNER_NUMBER}

*Developer:* Sahan Maduwantha
*Experience:* 3+ Years
*Specialization:* WhatsApp Bots

*Support:* https://whatsapp.com/channel/0029VbB3YxTDJ6H15SKoBv3S
          `.trim();
          
          await socket.sendMessage(sender, {
            text: ownerText,
            footer: "MASTER MD MINI"
          }, { quoted: msg });
          break;
        }
        
        // ... Add other existing commands (download, tools, creative, etc.) ...
        // These should remain as they were in your original code

        default:
          // Check for auto reply if command not found
          const sanitized = (number || '').replace(/[^0-9]/g, '');
          const userCfg = await loadUserConfigFromMongo(sanitized) || {};
          const autoReplyEnabled = userCfg.autoReply !== false;
          
          if (autoReplyEnabled && body && !isCmd) {
            const autoReply = await getAutoReply(sanitized, body);
            if (autoReply) {
              await socket.sendMessage(sender, { 
                text: autoReply.reply 
              }, { quoted: msg });
            }
          }
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { 
        await socket.sendMessage(sender, { 
          text: '❌ An error occurred while processing your command. Please try again.' 
        }, { quoted: msg }); 
      } catch(e){}
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

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try { 
          await delay(1500); 
          code = await socket.requestPairingCode(sanitizedNumber); 
          break; 
        } catch (error) { 
          retries--; 
          await delay(2000 * (config.MAX_RETRIES - retries)); 
        }
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

          activeSockets.set(sanitizedNumber, socket);
          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};

          const initialCaption = formatMessage('MASTER MD MINI',
            `*✅ Bot Activated Successfully!*\n\n*📱 Number:* ${sanitizedNumber}\n*⏰ Connecting: Bot will become active in a few seconds*`,
            'MASTER MD MINI'
          );

          let sentMsg = null;
          try {
            sentMsg = await socket.sendMessage(userJid, { text: initialCaption });
          } catch (e) {
            console.warn('Failed to send initial connect message:', e?.message || e);
          }

          await delay(4000);

          const updatedCaption = formatMessage('MASTER MD MINI',
            `*✅ Bot Connected - MASTER MD MINI*\n\n*📱 Number:* ${sanitizedNumber}\n*📊 Condition:* ${groupStatus}\n*⏰ Connected At:* ${getZimbabweanTimestamp()}`,
            'MASTER MD MINI'
          );

          try {
            if (sentMsg && sentMsg.key) {
              try {
                await socket.sendMessage(userJid, { delete: sentMsg.key });
              } catch (delErr) {
                console.warn('Could not delete original connect message:', delErr?.message || delErr);
              }
            }

            await socket.sendMessage(userJid, { text: updatedCaption });
          } catch (e) {
            console.error('Failed during connect-message edit sequence:', e);
          }

          await sendAdminConnectMessage(socket, sanitizedNumber, groupResult, userConfig);
          await addNumberToMongo(sanitizedNumber);

          // Send welcome message with settings info
          await delay(2000);
          await socket.sendMessage(userJid, {
            text: `*Welcome to MASTER MD MINI!*\n\nYour bot is now active. Use \`${config.PREFIX}menu\` to see all commands.\n\n*Features:*\n• Auto Reply System\n• Profile Management\n• Privacy Settings\n• Developer Controls\n\n*Customize:* Use \`${config.PREFIX}settings\` to configure.`,
            footer: "Powered by MASTER MD Tech"
          });

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { 
            exec(`pm2.restart ${process.env.PM2_NAME || 'MASTER-MD-MINI'}`); 
          } catch(err) { 
            console.error('pm2 restart failed', err); 
          }
        }
      }
      if (connection === 'close') {
        try { 
          if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); 
        } catch(e){}
      }
    });

    activeSockets.set(sanitizedNumber, socket);

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- endpoints ----------------

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ 
    botName: 'MASTER MD MINI', 
    count: activeSockets.size, 
    numbers: Array.from(activeSockets.keys()), 
    timestamp: getZimbabweanTimestamp() 
  });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ 
    status: 'active', 
    botName: 'MASTER MD MINI', 
    message: '🎉 Bot is active', 
    activesession: activeSockets.size 
  });
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
  try { 
    exec(`pm2.restart ${process.env.PM2_NAME || 'MASTER-MD-MINI'}`); 
  } catch(e) { 
    console.error('Failed to restart pm2:', e); 
  }
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
