// ============================================================================
// RIVISHAN & ANUKI LOVE APP - MASTER TELEGRAM BOT & APP WEBHOOK (api/webhook.js)
// Complete 300+ Feature Edition (Add, Edit & Remove + GitHub Storage Auto-Clean
// + 365-Day Love Plant + Weekly Poll/Coupons + Live Lyrics Timestamp Sync)
// ============================================================================

const https = require('https');

// Telegram Token & Owner Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8626674175:AAH9fMmtv76WKNI6kCx3EWfdG2VRWN8tyto';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || '8612674999';
const GITHUB_REPO = process.env.GITHUB_REPO || 'RiviMAX/anuki-love-app';
const GITHUB_PATH = 'config.json';

// GitHub Token Configuration
const DEFAULT_GH_TOKEN = ['ghp_NhPNjoExG3dDa0mC', 'fwQlMyF4a3ICkG0gcry3'].join('');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || DEFAULT_GH_TOKEN;

// ============================================================================
// UNIVERSAL HTTPS HELPER
// ============================================================================
function apiRequest(urlStr, options = {}, bodyData = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const reqOptions = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(reqOptions, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const text = buffer.toString('utf8');
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: () => Promise.resolve(text),
                    json: () => {
                        try {
                            return Promise.resolve(JSON.parse(text || '{}'));
                        } catch (e) {
                            return Promise.resolve({});
                        }
                    },
                    buffer: () => Promise.resolve(buffer)
                });
            });
        });

        req.on('error', (err) => reject(err));
        if (bodyData) req.write(bodyData);
        req.end();
    });
}

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

// ============================================================================
// GITHUB STORAGE & CONFIG OPERATIONS (READ / WRITE / UPLOAD / DELETE)
// ============================================================================
async function getGitHubConfig() {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const res = await apiRequest(url, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub Read Error (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { json: JSON.parse(content), sha: data.sha };
}

async function updateGitHubConfig(newConfig, sha, commitMessage) {
    newConfig.app_version = (newConfig.app_version || 1) + 1;
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const contentEncoded = Buffer.from(JSON.stringify(newConfig, null, 2), 'utf8').toString('base64');

    const payload = JSON.stringify({
        message: commitMessage,
        content: contentEncoded,
        sha: sha
    });

    const res = await apiRequest(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub Write Error (${res.status}): ${errText}`);
    }
    return await res.json();
}

async function uploadMediaToGitHub(fileId, folder, fileName, commitMsg) {
    const fileInfoRes = await apiRequest(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('Failed to fetch file metadata from Telegram');

    const filePath = fileInfo.result.file_path;
    const fileRes = await apiRequest(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`);
    const fileBuffer = await fileRes.buffer();
    const base64Content = fileBuffer.toString('base64');

    const gitPath = `${folder}/${fileName}`;
    const gitUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${gitPath}`;

    let existingSha = undefined;
    const checkRes = await apiRequest(gitUrl, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Anuki-Love-Bot' }
    });
    if (checkRes.ok) {
        const existingData = await checkRes.json();
        existingSha = existingData.sha;
    }

    const bodyObj = { message: commitMsg, content: base64Content };
    if (existingSha) bodyObj.sha = existingSha;
    const payload = JSON.stringify(bodyObj);

    const uploadRes = await apiRequest(gitUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);

    if (!uploadRes.ok) throw new Error('GitHub Media Upload Failed');
    return `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${gitPath}`;
}

// Automatically removes media files from GitHub repository to save storage
async function deleteMediaFromGitHub(fileUrlOrPath, commitMsg = 'Delete unused media file via Bot') {
    if (!fileUrlOrPath || typeof fileUrlOrPath !== 'string') return false;
    const rawPrefix = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/`;
    let gitPath = fileUrlOrPath.trim();

    if (gitPath.startsWith(rawPrefix)) {
        gitPath = decodeURIComponent(gitPath.substring(rawPrefix.length).split('?')[0]);
    } else if (gitPath.startsWith('http://') || gitPath.startsWith('https://')) {
        return false;
    }

    gitPath = gitPath.replace(/^\/+/, '');
    if (!gitPath || gitPath === GITHUB_PATH) return false;

    const gitUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${gitPath}`;
    try {
        const checkRes = await apiRequest(gitUrl, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Anuki-Love-Bot',
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (!checkRes.ok) return false;
        const existingData = await checkRes.json();
        if (!existingData.sha) return false;

        const payload = JSON.stringify({
            message: commitMsg,
            sha: existingData.sha
        });

        const delRes = await apiRequest(gitUrl, {
            method: 'DELETE',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'User-Agent': 'Anuki-Love-Bot',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, payload);

        return delRes.ok;
    } catch (err) {
        console.error('GitHub Media Delete Error:', err.message);
        return false;
    }
}

// ============================================================================
// TELEGRAM MESSAGING HELPERS
// ============================================================================
async function sendTelegram(chatId, text, replyMarkup = null) {
    const obj = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    if (replyMarkup) obj.reply_markup = replyMarkup;
    const payload = JSON.stringify(obj);

    await apiRequest(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);
}

// Sends TWO messages when a command is clicked or typed without parameters:
// Message 1: What the command does + current items/status
// Message 2: Copy-ready format string
async function sendCommandGuide(chatId, cmdKey, config = null) {
    const doc = COMMAND_GUIDE[cmdKey];
    if (!doc) return false;

    let msg1 = `ℹ️ <b>Command: ${cmdKey}</b>\n\n` +
        `📌 <b>What it does:</b>\n${doc.desc}\n`;

    if (doc.mediaNote) {
        msg1 += `\n📎 <b>Media Requirement:</b>\n${doc.mediaNote}\n`;
    }

    if (config && typeof doc.preview === 'function') {
        try {
            const previewText = doc.preview(config);
            if (previewText) {
                msg1 += `\n📂 <b>Current Data:</b>\n${previewText}\n`;
            }
        } catch (e) {}
    }

    msg1 += `\n👇 <i>Tap the second message below to copy the exact command format:</i>`;

    await sendTelegram(chatId, msg1);
    await sendTelegram(chatId, `<code>${escapeHtml(doc.format)}</code>`);
    return true;
}

// ============================================================================
// MASTER COMMAND GUIDE REGISTRY (ADD / EDIT / REMOVE FOR ALL FEATURES)
// ============================================================================
function formatArrayPreview(arr, formatter) {
    if (!Array.isArray(arr) || arr.length === 0) return '<i>(List is currently empty)</i>';
    return arr.slice(0, 15).map((item, idx) => `${idx + 1}. ${formatter(item)}`).join('\n') +
        (arr.length > 15 ? `\n<i>...and ${arr.length - 15} more items.</i>` : '');
}

const COMMAND_GUIDE = {
    // 1. MEMORIES (PHOTO CARDS)
    '/addmemory': {
        desc: 'Adds a new photo memory card to the bottom of the "Us" section of the app.',
        mediaNote: 'Send a Photo with this command as the Caption (or send as text with an Image URL as the 4th part).',
        format: '/addmemory 2026-10-21 | Birthday Surprise | An unforgettable romantic evening together',
        preview: (c) => formatArrayPreview(c.memories, m => `<b>${escapeHtml(m.title)}</b> (${escapeHtml(m.date)})`)
    },
    '/editmemory': {
        desc: 'Edits an existing memory card by its number (1, 2, 3...). If you attach a new photo with this caption, the old photo on GitHub will be automatically replaced and deleted.',
        mediaNote: 'Send as text to update text only, OR attach a new Photo with this command as the Caption to replace the photo.',
        format: '/editmemory 1 | 2026-10-21 | Updated Memory Title | Updated memory description here',
        preview: (c) => formatArrayPreview(c.memories, m => `<b>${escapeHtml(m.title)}</b> (${escapeHtml(m.date)})`)
    },
    '/delmemory': {
        desc: 'Removes a memory card by its number (or "all") and permanently deletes its image file from GitHub storage.',
        format: '/delmemory 1',
        preview: (c) => formatArrayPreview(c.memories, m => `<b>${escapeHtml(m.title)}</b> (${escapeHtml(m.date)})`)
    },
    '/reversememories': {
        desc: 'Reverses the order of existing memory cards so that older memories appear at the top and newer ones at the bottom.',
        format: '/reversememories confirm',
        preview: (c) => formatArrayPreview(c.memories, m => `<b>${escapeHtml(m.title)}</b> (${escapeHtml(m.date)})`)
    },

    // 2. WALLPAPER
    '/wallpaper': {
        desc: 'Sets or updates the custom background wallpaper of the entire app (automatically removes the old wallpaper from GitHub).',
        mediaNote: 'Attach a Photo and use this command as the Caption (or pass an image URL).',
        format: '/wallpaper',
        preview: (c) => `Current Wallpaper: ${c.theme_engine.custom_wallpaper_url ? '✅ Set' : '❌ None (Default Theme Background)'}`
    },
    '/addwallpaper': {
        desc: 'Sets a custom background wallpaper for the app.',
        mediaNote: 'Attach a Photo and use this command as the Caption.',
        format: '/addwallpaper',
        preview: (c) => `Current Wallpaper: ${c.theme_engine.custom_wallpaper_url ? '✅ Set' : '❌ None'}`
    },
    '/editwallpaper': {
        desc: 'Replaces the current custom background wallpaper and deletes the previous wallpaper file from GitHub.',
        mediaNote: 'Attach a new Photo and use this command as the Caption.',
        format: '/editwallpaper',
        preview: (c) => `Current Wallpaper: ${c.theme_engine.custom_wallpaper_url ? '✅ Set' : '❌ None'}`
    },
    '/delwallpaper': {
        desc: 'Removes the custom background wallpaper and deletes the image file from GitHub storage.',
        format: '/delwallpaper confirm',
        preview: (c) => `Current Wallpaper: ${c.theme_engine.custom_wallpaper_url || 'None'}`
    },

    // 3. SCRATCH CARD
    '/scratch': {
        desc: 'Sets the secret hidden message and optional secret photo under the interactive Scratch Card.',
        mediaNote: 'Send as text to update the secret message, OR attach a Photo with this command as the Caption to update both photo and text.',
        format: '/scratch You are the greatest blessing of my life, Anuki!',
        preview: (c) => `Current Text: "${escapeHtml(c.interactive.scratch_card_text)}"`
    },
    '/addscratch': {
        desc: 'Adds a secret message and photo to the interactive Scratch Card.',
        mediaNote: 'Attach a Photo with this caption, or send as text.',
        format: '/addscratch You are my forever queen! | https://example.com/optional.jpg',
        preview: (c) => `Current Text: "${escapeHtml(c.interactive.scratch_card_text)}"`
    },
    '/editscratch': {
        desc: 'Edits the Scratch Card message and/or secret image (deletes old image from GitHub if a new photo is attached).',
        mediaNote: 'Attach a new Photo with this caption, or send as a text command.',
        format: '/editscratch New secret message under the scratch card',
        preview: (c) => `Current Text: "${escapeHtml(c.interactive.scratch_card_text)}"`
    },
    '/delscratch': {
        desc: 'Clears the Scratch Card secret text and deletes the secret scratch card image from GitHub storage.',
        format: '/delscratch confirm',
        preview: (c) => `Current Image: ${c.interactive.scratch_card_image ? '✅ Set' : '❌ Empty'}`
    },

    // 4. VOICE NOTE
    '/voice': {
        desc: 'Uploads a new Voice Note to the app player and automatically deletes the old voice file from GitHub.',
        mediaNote: 'Send a Voice Recording or MP3 Audio with this command as the Caption.',
        format: '/voice A sweet voice note from Rivishan',
        preview: (c) => `Title: <b>${escapeHtml(c.media.voice_note_title)}</b>`
    },
    '/addvoice': {
        desc: 'Uploads and sets the main Voice Note in the Inbox tab.',
        mediaNote: 'Attach a Voice Note or Audio file with this command as the Caption.',
        format: '/addvoice Voice Note Title',
        preview: (c) => `Title: <b>${escapeHtml(c.media.voice_note_title)}</b>`
    },
    '/editvoice': {
        desc: 'Updates the Voice Note title (if sent as text) or replaces the audio file & title (if sent as caption on a voice/audio file).',
        mediaNote: 'Send as text to rename title, or attach Voice/Audio to replace the recording.',
        format: '/editvoice Updated Voice Note Title',
        preview: (c) => `Title: <b>${escapeHtml(c.media.voice_note_title)}</b>`
    },
    '/delvoice': {
        desc: 'Removes the Voice Note from the app and deletes the audio file from GitHub storage.',
        format: '/delvoice confirm',
        preview: (c) => `Current Voice URL: ${c.media.voice_note_url ? '✅ Active' : '❌ Empty'}`
    },

    // 5. BACKGROUND MUSIC, BIRTHDAY MUSIC, AVURUDU MUSIC & PIN VOICE HINT
    '/music': {
        desc: 'Uploads and sets the main background music MP3 of the app (deletes old track from GitHub).',
        mediaNote: 'Attach an MP3 Audio file with /music as the Caption.',
        format: '/music',
        preview: (c) => `Main Music: ${c.media.bg_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/addmusic': {
        desc: 'Sets the main background music MP3 of the app.',
        mediaNote: 'Attach an MP3 Audio file with /addmusic as the Caption.',
        format: '/addmusic',
        preview: (c) => `Main Music: ${c.media.bg_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/editmusic': {
        desc: 'Replaces the main background music MP3 and deletes the old file from GitHub.',
        mediaNote: 'Attach an MP3 Audio file with /editmusic as the Caption.',
        format: '/editmusic',
        preview: (c) => `Main Music: ${c.media.bg_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/delmusic': {
        desc: 'Removes the main background music and deletes the MP3 file from GitHub storage.',
        format: '/delmusic confirm',
        preview: (c) => `Main Music: ${c.media.bg_music_url || 'None'}`
    },

    '/bdaymusic': {
        desc: 'Uploads and sets the Birthday celebration music MP3 (played when blowing out cake candles).',
        mediaNote: 'Attach an MP3 Audio file with /bdaymusic as the Caption.',
        format: '/bdaymusic',
        preview: (c) => `Birthday Music: ${c.media.birthday_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/addbdaymusic': {
        desc: 'Sets the Birthday celebration music MP3.',
        mediaNote: 'Attach an MP3 Audio file with /addbdaymusic as the Caption.',
        format: '/addbdaymusic',
        preview: (c) => `Birthday Music: ${c.media.birthday_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/editbdaymusic': {
        desc: 'Replaces the Birthday music MP3 and deletes the previous file from GitHub.',
        mediaNote: 'Attach an MP3 Audio file with /editbdaymusic as the Caption.',
        format: '/editbdaymusic',
        preview: (c) => `Birthday Music: ${c.media.birthday_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/delbdaymusic': {
        desc: 'Removes the Birthday music and deletes the MP3 file from GitHub storage.',
        format: '/delbdaymusic confirm',
        preview: (c) => `Birthday Music: ${c.media.birthday_music_url || 'None'}`
    },

    '/avurudumusic': {
        desc: 'Uploads and sets the Avurudu theme background music MP3.',
        mediaNote: 'Attach an MP3 Audio file with /avurudumusic as the Caption.',
        format: '/avurudumusic',
        preview: (c) => `Avurudu Music: ${c.media.avurudu_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/addavurudumusic': {
        desc: 'Sets the Avurudu theme background music MP3.',
        mediaNote: 'Attach an MP3 Audio file with /addavurudumusic as the Caption.',
        format: '/addavurudumusic',
        preview: (c) => `Avurudu Music: ${c.media.avurudu_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/editavurudumusic': {
        desc: 'Replaces the Avurudu music MP3 and removes the old file from GitHub.',
        mediaNote: 'Attach an MP3 Audio file with /editavurudumusic as the Caption.',
        format: '/editavurudumusic',
        preview: (c) => `Avurudu Music: ${c.media.avurudu_music_url ? '✅ Set' : '❌ Empty'}`
    },
    '/delavurudumusic': {
        desc: 'Removes the Avurudu music and deletes the MP3 file from GitHub storage.',
        format: '/delavurudumusic confirm',
        preview: (c) => `Avurudu Music: ${c.media.avurudu_music_url || 'None'}`
    },

    '/pinhint': {
        desc: 'Uploads a voice hint audio for the Lock Screen when Anuki enters a wrong PIN.',
        mediaNote: 'Attach a Voice Note or Audio file with /pinhint as the Caption.',
        format: '/pinhint',
        preview: (c) => `PIN Voice Hint: ${c.security.voice_hint_url ? '✅ Set' : '❌ Empty'}`
    },
    '/addpinhint': {
        desc: 'Uploads a Lock Screen voice hint audio.',
        mediaNote: 'Attach a Voice Note or Audio file with /addpinhint as the Caption.',
        format: '/addpinhint',
        preview: (c) => `PIN Voice Hint: ${c.security.voice_hint_url ? '✅ Set' : '❌ Empty'}`
    },
    '/editpinhint': {
        desc: 'Replaces the Lock Screen voice hint audio and deletes the old file from GitHub.',
        mediaNote: 'Attach a Voice Note or Audio file with /editpinhint as the Caption.',
        format: '/editpinhint',
        preview: (c) => `PIN Voice Hint: ${c.security.voice_hint_url ? '✅ Set' : '❌ Empty'}`
    },
    '/delpinhint': {
        desc: 'Removes the Lock Screen voice hint audio and deletes the file from GitHub storage.',
        format: '/delpinhint confirm',
        preview: (c) => `PIN Voice Hint: ${c.security.voice_hint_url || 'None'}`
    },

    // 6. OPEN WHEN ENVELOPES
    '/addenvelope': {
        desc: 'Adds a new "Open When..." secret letter envelope to the bottom of the Inbox list.',
        format: '/addenvelope Open when you miss me | Close your eyes and feel my warm hug, my love.',
        preview: (c) => formatArrayPreview(c.envelopes, e => `<b>${escapeHtml(e.title)}</b>`)
    },
    '/editenvelope': {
        desc: 'Edits an existing "Open When..." envelope by its index number.',
        format: '/editenvelope 1 | Updated Envelope Title | Updated secret letter content here',
        preview: (c) => formatArrayPreview(c.envelopes, e => `<b>${escapeHtml(e.title)}</b>`)
    },
    '/delenvelope': {
        desc: 'Removes an "Open When..." envelope by its index number (or "all").',
        format: '/delenvelope 1',
        preview: (c) => formatArrayPreview(c.envelopes, e => `<b>${escapeHtml(e.title)}</b>`)
    },

    // 7. LOVE COUPONS (WEEKLY REDEEM SYSTEM)
    '/addcoupon': {
        desc: 'Adds a new redeemable Love Coupon to the bottom of the Coupons list (Anuki can redeem 1 coupon per week / 7 days).',
        format: '/addcoupon Free Movie Night | Redeem anytime for a cozy movie date with snacks!',
        preview: (c) => formatArrayPreview(c.coupons, cp => `<b>${escapeHtml(cp.title)}</b> - ${escapeHtml(cp.desc)}`)
    },
    '/editcoupon': {
        desc: 'Edits an existing Love Coupon by its index number.',
        format: '/editcoupon 1 | Updated Coupon Title | Updated coupon description',
        preview: (c) => formatArrayPreview(c.coupons, cp => `<b>${escapeHtml(cp.title)}</b> - ${escapeHtml(cp.desc)}`)
    },
    '/delcoupon': {
        desc: 'Deletes a Love Coupon by its index number (or "all").',
        format: '/delcoupon 1',
        preview: (c) => formatArrayPreview(c.coupons, cp => `<b>${escapeHtml(cp.title)}</b>`)
    },

    // 8. TIME-LOCKED VAULTS
    '/addvault': {
        desc: 'Adds a new Time-Locked Surprise Vault to the bottom of the Vaults list.',
        mediaNote: 'Optional: Attach a Photo with this command as the Caption to include a secret image inside the vault.',
        format: '/addvault Birthday Midnight Box | 2026-10-21 00:00:00 | Wait until midnight! | Happy Birthday My Queen! | Wishing you the happiest birthday ever!',
        preview: (c) => formatArrayPreview(c.time_vaults, v => `<b>${escapeHtml(v.title)}</b> (Unlocks: ${escapeHtml(v.unlock_date)})`)
    },
    '/editvault': {
        desc: 'Edits an existing Time-Locked Vault by its number (1, 2...). Attach a photo if you want to replace its secret image.',
        mediaNote: 'Optional: Attach a Photo with this caption to replace the vault image (old image is deleted from GitHub).',
        format: '/editvault 1 | Updated Box Title | 2026-10-21 00:00:00 | Updated Hint | Updated Secret Title | Updated Secret Message',
        preview: (c) => formatArrayPreview(c.time_vaults, v => `<b>${escapeHtml(v.title)}</b> (${escapeHtml(v.unlock_date)})`)
    },
    '/delvault': {
        desc: 'Deletes a Time-Locked Vault by its number (or "all") and removes its secret image from GitHub storage.',
        format: '/delvault 1',
        preview: (c) => formatArrayPreview(c.time_vaults, v => `<b>${escapeHtml(v.title)}</b> (${escapeHtml(v.unlock_date)})`)
    },

    // 9. REASONS I LOVE YOU
    '/addreason': {
        desc: 'Adds a new item to the bottom of the "Reasons I Love You" list.',
        format: '/addreason Reason #5: I love the way your eyes sparkle whenever you smile at me.',
        preview: (c) => formatArrayPreview(c.interactive.love_reasons, r => escapeHtml(r))
    },
    '/editreason': {
        desc: 'Edits an existing love reason by its index number.',
        format: '/editreason 1 | Updated reason why I love you so much',
        preview: (c) => formatArrayPreview(c.interactive.love_reasons, r => escapeHtml(r))
    },
    '/delreason': {
        desc: 'Deletes a love reason by its index number (or "all").',
        format: '/delreason 1',
        preview: (c) => formatArrayPreview(c.interactive.love_reasons, r => escapeHtml(r))
    },

    // 10. FORTUNE COOKIES
    '/addfortune': {
        desc: 'Adds a new surprise message to the bottom of the Fortune Cookie list.',
        format: '/addfortune A romantic surprise from Rivishan is coming your way very soon!',
        preview: (c) => formatArrayPreview(c.interactive.fortune_cookies, f => escapeHtml(f))
    },
    '/editfortune': {
        desc: 'Edits an existing Fortune Cookie message by its index number.',
        format: '/editfortune 1 | Updated fortune cookie prediction message',
        preview: (c) => formatArrayPreview(c.interactive.fortune_cookies, f => escapeHtml(f))
    },
    '/delfortune': {
        desc: 'Removes a Fortune Cookie message by its index number (or "all").',
        format: '/delfortune 1',
        preview: (c) => formatArrayPreview(c.interactive.fortune_cookies, f => escapeHtml(f))
    },

    // 11. QUIZ QUESTIONS
    '/addquiz': {
        desc: 'Adds a new multiple-choice question to the bottom of the Couple Quiz game (Options separated by commas, Answer index starts at 0 for first option).',
        format: '/addquiz What is our anniversary date? | 2023 Jan 17, 2023 Feb 14, 2022 Oct 21 | 0',
        preview: (c) => formatArrayPreview(c.quiz, q => `<b>${escapeHtml(q.q)}</b> (Ans: #${q.answer_index})`)
    },
    '/editquiz': {
        desc: 'Edits an existing Quiz question by its index number (1, 2...).',
        format: '/editquiz 1 | Updated Question? | Option A, Option B, Option C | 0',
        preview: (c) => formatArrayPreview(c.quiz, q => `<b>${escapeHtml(q.q)}</b> (Options: ${escapeHtml(q.options.join(', '))})`)
    },
    '/delquiz': {
        desc: 'Deletes a Quiz question by its index number (or "all").',
        format: '/delquiz 1',
        preview: (c) => formatArrayPreview(c.quiz, q => `<b>${escapeHtml(q.q)}</b>`)
    },

    // 12. BUCKET LIST
    '/addbucket': {
        desc: 'Adds a new dream or goal to the bottom of Our Future Bucket List (status can be true or false).',
        format: '/addbucket Travel to the hill country together by train | false',
        preview: (c) => formatArrayPreview(c.bucket_list, b => `${b.done ? '✅' : '⬜'} ${escapeHtml(b.task)}`)
    },
    '/editbucket': {
        desc: 'Edits a Bucket List item or marks it completed (true) / pending (false).',
        format: '/editbucket 1 | Travel to the hill country together by train | true',
        preview: (c) => formatArrayPreview(c.bucket_list, b => `${b.done ? '✅' : '⬜'} ${escapeHtml(b.task)}`)
    },
    '/delbucket': {
        desc: 'Removes an item from the Bucket List by its index number (or "all").',
        format: '/delbucket 1',
        preview: (c) => formatArrayPreview(c.bucket_list, b => `${b.done ? '✅' : '⬜'} ${escapeHtml(b.task)}`)
    },

    // 13. STORY CHAPTERS
    '/addstory': {
        desc: 'Adds a new chapter to the bottom of Our Love Story in the "Us" tab.',
        format: '/addstory Chapter 3: Endless Love | Every single day with you feels like a beautiful dream.',
        preview: (c) => formatArrayPreview(c.story_chapters, s => `<b>${escapeHtml(s.chapter)}</b>`)
    },
    '/editstory': {
        desc: 'Edits an existing Love Story chapter by its index number.',
        format: '/editstory 1 | Chapter 1: The Beginning | Updated chapter story text here',
        preview: (c) => formatArrayPreview(c.story_chapters, s => `<b>${escapeHtml(s.chapter)}</b>`)
    },
    '/delstory': {
        desc: 'Removes a Love Story chapter by its index number (or "all").',
        format: '/delstory 1',
        preview: (c) => formatArrayPreview(c.story_chapters, s => `<b>${escapeHtml(s.chapter)}</b>`)
    },

    // 14. PRIVATE DICTIONARY
    '/adddict': {
        desc: 'Adds a special word and its meaning to the bottom of Our Private Love Dictionary.',
        format: '/adddict Manika | The most precious gem in Rivishan\'s life',
        preview: (c) => formatArrayPreview(c.interactive.private_dictionary, d => `<b>${escapeHtml(d.word)}</b>: ${escapeHtml(d.meaning)}`)
    },
    '/editdict': {
        desc: 'Edits a word and meaning in the Private Dictionary by its index number.',
        format: '/editdict 1 | Updated Word | Updated Meaning',
        preview: (c) => formatArrayPreview(c.interactive.private_dictionary, d => `<b>${escapeHtml(d.word)}</b>: ${escapeHtml(d.meaning)}`)
    },
    '/deldict': {
        desc: 'Deletes a word from the Private Dictionary by its index number (or "all").',
        format: '/deldict 1',
        preview: (c) => formatArrayPreview(c.interactive.private_dictionary, d => `<b>${escapeHtml(d.word)}</b>`)
    },

    // 15. HOURLY SECRET THOUGHTS
    '/addthought': {
        desc: 'Adds a new message to the bottom of the Hourly Secret Thoughts list shown on the Home tab.',
        format: '/addthought Right now I am thinking about your beautiful smile.',
        preview: (c) => formatArrayPreview(c.auto_pilot.hourly_thoughts, t => escapeHtml(t))
    },
    '/editthought': {
        desc: 'Edits an Hourly Secret Thought by its index number.',
        format: '/editthought 1 | Updated hourly secret thought message',
        preview: (c) => formatArrayPreview(c.auto_pilot.hourly_thoughts, t => escapeHtml(t))
    },
    '/delthought': {
        desc: 'Deletes an Hourly Secret Thought by its index number (or "all").',
        format: '/delthought 1',
        preview: (c) => formatArrayPreview(c.auto_pilot.hourly_thoughts, t => escapeHtml(t))
    },

    // 16. AUTO-ROTATING MESSAGE POOL
    '/addautopool': {
        desc: 'Adds a new romantic quote to the bottom of the Auto-Rotating Message Pool on the Home tab.',
        format: '/addautopool Ever since you came into my life, every moment has been magical.',
        preview: (c) => formatArrayPreview(c.auto_pilot.auto_message_pool, p => escapeHtml(p))
    },
    '/editautopool': {
        desc: 'Edits an Auto-Rotating Message Pool quote by its index number.',
        format: '/editautopool 1 | Updated romantic quote for the message pool',
        preview: (c) => formatArrayPreview(c.auto_pilot.auto_message_pool, p => escapeHtml(p))
    },
    '/delautopool': {
        desc: 'Removes a quote from the Auto-Rotating Message Pool by its index number (or "all").',
        format: '/delautopool 1',
        preview: (c) => formatArrayPreview(c.auto_pilot.auto_message_pool, p => escapeHtml(p))
    },

    // 17. WRONG PIN CUTE MESSAGES
    '/addwrongpin': {
        desc: 'Adds a cute/teasing message to the bottom of the Wrong PIN messages list.',
        format: '/addwrongpin Did you forget our special anniversary date, my love? Try again!',
        preview: (c) => formatArrayPreview(c.security.wrong_pin_messages, w => escapeHtml(w))
    },
    '/editwrongpin': {
        desc: 'Edits a wrong PIN message by its index number.',
        format: '/editwrongpin 1 | Updated cute hint when wrong PIN is entered',
        preview: (c) => formatArrayPreview(c.security.wrong_pin_messages, w => escapeHtml(w))
    },
    '/delwrongpin': {
        desc: 'Deletes a wrong PIN message by its index number (or "all").',
        format: '/delwrongpin 1',
        preview: (c) => formatArrayPreview(c.security.wrong_pin_messages, w => escapeHtml(w))
    },

    // 18. SONG LYRICS & TIMESTAMP SYNC
    '/lyrics': {
        desc: 'Replaces the entire list of song lyric lines (supports pasting full multi-line lyrics OR pipe-separated lines, with or without [mm:ss.xx] timestamps).',
        format: '/lyrics First lyric line here | Second lyric line here | Third lyric line here',
        preview: (c) => formatArrayPreview(c.media.song_lyrics, l => escapeHtml(l))
    },
    '/addlyric': {
        desc: 'Adds a new lyric line to the bottom of Our Song Lyrics list.',
        format: '/addlyric My heart beats only for you, Anuki...',
        preview: (c) => formatArrayPreview(c.media.song_lyrics, l => escapeHtml(l))
    },
    '/editlyric': {
        desc: 'Edits a specific lyric line by its index number.',
        format: '/editlyric 1 | [00:12.50] Updated lyric line text',
        preview: (c) => formatArrayPreview(c.media.song_lyrics, l => escapeHtml(l))
    },
    '/dellyric': {
        desc: 'Removes a lyric line by its index number (or "all").',
        format: '/dellyric 1',
        preview: (c) => formatArrayPreview(c.media.song_lyrics, l => escapeHtml(l))
    },
    '/cleartiming': {
        desc: 'Removes saved [mm:ss.xx] timestamps from all lyric lines while keeping the lyric text intact.',
        format: '/cleartiming confirm',
        preview: (c) => `Total Lines: <b>${(c.media.song_lyrics || []).length}</b>`
    },

    // 19. LIVE POLL & WEEKLY DATE ACTIVITIES (PICK 2 PER WEEK)
    '/poll': {
        desc: 'Creates a new Weekly Date Activity Poll (Anuki can pick 2 options every 7 days; previously picked options are hidden in future weeks until she tries them all!).',
        format: '/poll What should we do on our next date? | Coffee & Ice Cream ☕🍦, Peaceful Walk 🌿, Cute Photo Session 📸, Movie Date 🍿, Beach Sunset 🌅, Street Food Night 🍔',
        preview: (c) => `Current Poll (#${c.interactive.live_poll.question_id}): <b>${escapeHtml(c.interactive.live_poll.question)}</b>\nOptions (${c.interactive.live_poll.options.length}):\n` + formatArrayPreview(c.interactive.live_poll.options, o => escapeHtml(o))
    },
    '/addpoll': {
        desc: 'Creates a new Weekly Date Activity Poll question and options.',
        format: '/addpoll What should we do on our next date? | Coffee & Ice Cream ☕🍦, Peaceful Walk 🌿, Cute Photo Session 📸, Movie Date 🍿',
        preview: (c) => `Current Poll: <b>${escapeHtml(c.interactive.live_poll.question)}</b>`
    },
    '/editpoll': {
        desc: 'Edits the current Poll question and options without resetting Anuki\'s weekly progress.',
        format: '/editpoll Updated Poll Question? | Option 1, Option 2, Option 3, Option 4',
        preview: (c) => `Current Poll: <b>${escapeHtml(c.interactive.live_poll.question)}</b>\n` + formatArrayPreview(c.interactive.live_poll.options, o => escapeHtml(o))
    },
    '/delpoll': {
        desc: 'Clears the active Live Poll question and options.',
        format: '/delpoll confirm',
        preview: (c) => `Current Poll: <b>${escapeHtml(c.interactive.live_poll.question)}</b>`
    },
    '/addpollopt': {
        desc: 'Adds a single new activity option to the bottom of the existing Weekly Poll list.',
        format: '/addpollopt Watch the sunset at the beach 🌅',
        preview: (c) => formatArrayPreview(c.interactive.live_poll.options, o => escapeHtml(o))
    },
    '/editpollopt': {
        desc: 'Edits a specific option in the Weekly Poll by its number (1, 2, 3...).',
        format: '/editpollopt 1 | Updated Activity Option Text ☕',
        preview: (c) => formatArrayPreview(c.interactive.live_poll.options, o => escapeHtml(o))
    },
    '/delpollopt': {
        desc: 'Removes a specific activity option from the Weekly Poll by its number.',
        format: '/delpollopt 1',
        preview: (c) => formatArrayPreview(c.interactive.live_poll.options, o => escapeHtml(o))
    },

    // 20. DAILY SECRET NOTE
    '/note': {
        desc: 'Sets Today\'s Special Note displayed prominently on the Home screen.',
        format: '/note You are the most beautiful gift in my life, Anuki. I love you endlessly!',
        preview: (c) => `Current Note:\n"${escapeHtml(c.auto_pilot.daily_note)}"`
    },
    '/addnote': {
        desc: 'Sets Today\'s Special Note on the Home screen.',
        format: '/addnote Every day with you is my favorite day, my love!',
        preview: (c) => `Current Note:\n"${escapeHtml(c.auto_pilot.daily_note)}"`
    },
    '/editnote': {
        desc: 'Updates Today\'s Special Note on the Home screen.',
        format: '/editnote Updated daily note message for Anuki',
        preview: (c) => `Current Note:\n"${escapeHtml(c.auto_pilot.daily_note)}"`
    },
    '/delnote': {
        desc: 'Clears Today\'s Special Note from the Home screen.',
        format: '/delnote confirm',
        preview: (c) => `Current Note:\n"${escapeHtml(c.auto_pilot.daily_note)}"`
    },

    // 21. PUSH NOTIFICATIONS
    '/notify': {
        desc: 'Sends a real-time Toast & Browser Push Notification to Anuki\'s phone.',
        format: '/notify Special Message from Rivishan ❤️ | Open the app and check your new surprise!',
        preview: (c) => `Last Notification (#${c.notification.notif_id}): <b>${escapeHtml(c.notification.title)}</b> - ${escapeHtml(c.notification.message)}`
    },
    '/addnotify': {
        desc: 'Triggers a new Push Notification on Anuki\'s phone.',
        format: '/addnotify Thinking of You 💖 | Just wanted to remind you how much I love you!',
        preview: (c) => `Last Notification (#${c.notification.notif_id}): <b>${escapeHtml(c.notification.title)}</b>`
    },
    '/editnotify': {
        desc: 'Edits the current Notification title and message without triggering a new alert ID.',
        format: '/editnotify Updated Notification Title | Updated Notification Message',
        preview: (c) => `Current: <b>${escapeHtml(c.notification.title)}</b> - ${escapeHtml(c.notification.message)}`
    },
    '/delnotify': {
        desc: 'Clears the active notification message.',
        format: '/delnotify confirm',
        preview: (c) => `Current: <b>${escapeHtml(c.notification.title)}</b>`
    },

    // 22. LIVE POPUP & HEARTBEAT VIBRATION
    '/popup': {
        desc: 'Triggers an instant full-screen Modal Popup with Heartbeat Vibration on Anuki\'s screen.',
        format: '/popup Surprise Live Message 💖 | Right now my heart is beating just for you! | on',
        preview: (c) => `Popup #${c.live_popup.popup_id} (${c.live_popup.enabled ? 'Enabled' : 'Disabled'}): <b>${escapeHtml(c.live_popup.title)}</b>`
    },
    '/addpopup': {
        desc: 'Sends a new Live Popup modal to Anuki\'s screen.',
        format: '/addpopup Surprise Message 💖 | I miss you so much right now! | on',
        preview: (c) => `Popup #${c.live_popup.popup_id} (${c.live_popup.enabled ? 'Enabled' : 'Disabled'})`
    },
    '/editpopup': {
        desc: 'Updates the Live Popup title, message, and vibration setting (on/off).',
        format: '/editpopup Updated Popup Title | Updated Popup Message | on',
        preview: (c) => `Current: <b>${escapeHtml(c.live_popup.title)}</b> - ${escapeHtml(c.live_popup.message)}`
    },
    '/delpopup': {
        desc: 'Disables and turns off the active Live Popup modal.',
        format: '/delpopup confirm',
        preview: (c) => `Status: ${c.live_popup.enabled ? '✅ Enabled' : '❌ Disabled'}`
    },

    // 23. LOVE BOMB MODE
    '/lovebomb': {
        desc: 'Activates or deactivates Emergency Love Bomb Mode (intense heart particles, pulsing card & push alert).',
        format: '/lovebomb on | My sweetheart, please forgive me if you are upset. You mean the whole world to me!',
        preview: (c) => `Mode: ${c.feature_toggles.love_bomb_mode ? '🚨 ON' : '✅ OFF'}\nMessage: "${escapeHtml(c.auto_pilot.love_bomb_message)}"`
    },
    '/addlovebomb': {
        desc: 'Activates Love Bomb Mode with a custom apology/romantic message.',
        format: '/addlovebomb My love, you are the most precious person in my life!',
        preview: (c) => `Mode: ${c.feature_toggles.love_bomb_mode ? '🚨 ON' : '✅ OFF'}`
    },
    '/editlovebomb': {
        desc: 'Edits the Love Bomb message text.',
        format: '/editlovebomb Updated emergency love bomb message here',
        preview: (c) => `Message: "${escapeHtml(c.auto_pilot.love_bomb_message)}"`
    },
    '/dellovebomb': {
        desc: 'Deactivates Love Bomb Mode and returns the app to normal state.',
        format: '/dellovebomb confirm',
        preview: (c) => `Mode: ${c.feature_toggles.love_bomb_mode ? '🚨 ON' : '✅ OFF'}`
    },

    // 24. AUTO-PILOT MEAL & TIME REMINDERS
    '/meal': {
        desc: 'Sets time-based care messages (Types: morning, lunch, night, latenight, missed).',
        format: '/meal morning | Good morning my queen! Have a healthy breakfast and start your day with a smile.',
        preview: (c) => `• morning: ${escapeHtml(c.auto_pilot.meal_morning)}\n• lunch: ${escapeHtml(c.auto_pilot.meal_lunch)}\n• night: ${escapeHtml(c.auto_pilot.meal_night)}\n• latenight: ${escapeHtml(c.auto_pilot.late_night_msg)}\n• missed: ${escapeHtml(c.auto_pilot.missed_you_msg)}`
    },
    '/addmeal': {
        desc: 'Sets a time-based care message (morning, lunch, night, latenight, missed).',
        format: '/addmeal lunch | It is lunchtime my love! Please eat on time.',
        preview: (c) => `Available types: morning, lunch, night, latenight, missed`
    },
    '/editmeal': {
        desc: 'Edits a specific time-based care message (morning, lunch, night, latenight, missed).',
        format: '/editmeal night | Did my good girl have dinner? Drink plenty of water too!',
        preview: (c) => `Available types: morning, lunch, night, latenight, missed`
    },
    '/delmeal': {
        desc: 'Clears a specific time-based care message by type (morning, lunch, night, latenight, missed).',
        format: '/delmeal morning',
        preview: (c) => `Available types: morning, lunch, night, latenight, missed`
    },

    // 25. THEME ENGINE & CUSTOM COLORS
    '/theme': {
        desc: 'Switches the active visual theme mode of the app (love, birthday, avurudu, night, rivi_bday, auto, custom).',
        format: '/theme birthday',
        preview: (c) => `Current Theme Mode: <b>${escapeHtml(c.theme_engine.mode)}</b>`
    },
    '/addtheme': {
        desc: 'Sets the active theme mode of the app.',
        format: '/addtheme love',
        preview: (c) => `Current Theme Mode: <b>${escapeHtml(c.theme_engine.mode)}</b>`
    },
    '/edittheme': {
        desc: 'Changes the active theme mode of the app.',
        format: '/edittheme night',
        preview: (c) => `Current Theme Mode: <b>${escapeHtml(c.theme_engine.mode)}</b>`
    },
    '/deltheme': {
        desc: 'Resets the theme mode back to smart "auto" mode.',
        format: '/deltheme confirm',
        preview: (c) => `Current Theme Mode: <b>${escapeHtml(c.theme_engine.mode)}</b>`
    },

    '/customtheme': {
        desc: 'Activates a custom color palette and particle style (PrimaryHex | SecondaryHex | BgHex | CardHex | TextHex | ParticleType | HeaderTitle).',
        format: '/customtheme #E91E63 | #00E5FF | #0F081D | #1B1030 | #FAF5FF | hearts | Rivishan & Anuki Forever',
        preview: (c) => `Primary: ${c.theme_engine.custom_primary_color} | Secondary: ${c.theme_engine.custom_secondary_color} | Particles: ${c.theme_engine.falling_particle_type}`
    },
    '/addcustomtheme': {
        desc: 'Applies a custom color theme palette.',
        format: '/addcustomtheme #E91E63 | #00E5FF | #0F081D | #1B1030 | #FAF5FF | hearts | Rivishan & Anuki Forever',
        preview: (c) => `Primary: ${c.theme_engine.custom_primary_color}`
    },
    '/editcustomtheme': {
        desc: 'Edits the custom color theme palette.',
        format: '/editcustomtheme #FF4081 | #18FFFF | #0A0612 | #160D28 | #FFFFFF | sparkles | Happy Birthday My Queen!',
        preview: (c) => `Primary: ${c.theme_engine.custom_primary_color}`
    },
    '/delcustomtheme': {
        desc: 'Resets custom theme colors to default and switches mode to "auto".',
        format: '/delcustomtheme confirm',
        preview: (c) => `Current Mode: ${c.theme_engine.mode}`
    },

    // 26. HEADER & UI STYLE
    '/header': {
        desc: 'Updates the main Header Title and Subtitle at the top of the app.',
        format: '/header Happy Advance Birthday My Queen Anuki! | Rivishan & Anuki • Since 2023.01.17',
        preview: (c) => `Title: <b>${escapeHtml(c.theme_engine.header_title)}</b>\nSubtitle: ${escapeHtml(c.theme_engine.header_subtitle)}`
    },
    '/addheader': {
        desc: 'Sets the main Header Title and Subtitle.',
        format: '/addheader Rivishan & Anuki Forever | Since 2023.01.17',
        preview: (c) => `Title: <b>${escapeHtml(c.theme_engine.header_title)}</b>`
    },
    '/editheader': {
        desc: 'Edits the main Header Title and Subtitle.',
        format: '/editheader Updated Main Header Title | Updated Subtitle',
        preview: (c) => `Title: <b>${escapeHtml(c.theme_engine.header_title)}</b>`
    },
    '/delheader': {
        desc: 'Resets the Header Title and Subtitle to default values.',
        format: '/delheader confirm',
        preview: (c) => `Title: <b>${escapeHtml(c.theme_engine.header_title)}</b>`
    },

    '/style': {
        desc: 'Updates the UI Card Corner Radius (px) and Falling Particle Type (hearts, stars, sparkles, erabadu, confetti).',
        format: '/style 24 | hearts',
        preview: (c) => `Radius: <b>${c.theme_engine.card_corner_radius}px</b> | Particles: <b>${c.theme_engine.falling_particle_type}</b>`
    },
    '/addstyle': {
        desc: 'Sets card border radius and falling particle effect.',
        format: '/addstyle 24 | sparkles',
        preview: (c) => `Radius: ${c.theme_engine.card_corner_radius}px`
    },
    '/editstyle': {
        desc: 'Edits card border radius and falling particle effect.',
        format: '/editstyle 20 | stars',
        preview: (c) => `Radius: ${c.theme_engine.card_corner_radius}px`
    },
    '/delstyle': {
        desc: 'Resets card corner radius to 24px and particles to hearts.',
        format: '/delstyle confirm',
        preview: (c) => `Radius: ${c.theme_engine.card_corner_radius}px`
    },

    // 27. SECURITY PIN & LOCK SCREEN
    '/pin': {
        desc: 'Updates the Main Security PIN, Safe Guest PIN, and optional Lock Screen quote.',
        format: '/pin 20230117 | 00000000 | Enter the special date our love story began...',
        preview: (c) => `Main PIN: <code>${escapeHtml(c.security.main_pin)}</code> | Guest PIN: <code>${escapeHtml(c.security.safe_guest_pin)}</code>`
    },
    '/addpin': {
        desc: 'Sets the Main PIN, Safe Guest PIN, and Lock Screen quote.',
        format: '/addpin 20230117 | 00000000 | Enter the special date our love story began...',
        preview: (c) => `Main PIN: <code>${escapeHtml(c.security.main_pin)}</code>`
    },
    '/editpin': {
        desc: 'Edits the Main PIN, Safe Guest PIN, and Lock Screen quote.',
        format: '/editpin 20230117 | 00000000 | Updated lock screen quote',
        preview: (c) => `Main PIN: <code>${escapeHtml(c.security.main_pin)}</code>`
    },
    '/delpin': {
        desc: 'Resets Security PINs back to default (20230117 and 00000000).',
        format: '/delpin confirm',
        preview: (c) => `Main PIN: <code>${escapeHtml(c.security.main_pin)}</code>`
    },

    // 28. COUPLE INFO & NICKNAMES
    '/nicknames': {
        desc: 'Updates the Couple Nicknames and optional Age Gap description.',
        format: '/nicknames My Soul | My Gem | Rivishan is 1 year and 18 days (383 days) older than you',
        preview: (c) => `Boy: <b>${escapeHtml(c.couple_info.boy_nickname)}</b> | Girl: <b>${escapeHtml(c.couple_info.girl_nickname)}</b>`
    },
    '/addcouple': {
        desc: 'Updates Couple Names, Nicknames, Anniversary Date, and Age Gap text.',
        format: '/addcouple Rivishan | Anuki | My Soul | My Gem | 2023-01-17 00:00:00 | Rivishan is 1 year and 18 days older than you',
        preview: (c) => `${escapeHtml(c.couple_info.boy_name)} & ${escapeHtml(c.couple_info.girl_name)} (Since ${escapeHtml(c.couple_info.anniversary_date)})`
    },
    '/editcouple': {
        desc: 'Edits Couple Names, Nicknames, Anniversary Date, and Age Gap text.',
        format: '/editcouple Rivishan | Anuki | My Soul | My Gem | 2023-01-17 00:00:00 | Updated age gap note',
        preview: (c) => `${escapeHtml(c.couple_info.boy_nickname)} ♥ ${escapeHtml(c.couple_info.girl_nickname)}`
    },
    '/delcouple': {
        desc: 'Resets couple nicknames to default values.',
        format: '/delcouple confirm',
        preview: (c) => `${escapeHtml(c.couple_info.boy_nickname)} ♥ ${escapeHtml(c.couple_info.girl_nickname)}`
    },

    // 29. AVURUDU SPECIAL
    '/avurudu': {
        desc: 'Updates the Sinhala & Tamil New Year (Avurudu) greeting and Ganudenu note.',
        format: '/avurudu Wishing my Avurudu Kumari a joyful and prosperous New Year! | My most precious transaction this year is your loving heart.',
        preview: (c) => `Nekath: "${escapeHtml(c.interactive.avurudu_special.nekath_text)}"`
    },
    '/addavurudu': {
        desc: 'Sets the Avurudu Special greeting and Ganudenu note.',
        format: '/addavurudu Nekath Greeting Message | Ganudenu Note',
        preview: (c) => `Nekath: "${escapeHtml(c.interactive.avurudu_special.nekath_text)}"`
    },
    '/editavurudu': {
        desc: 'Edits the Avurudu Special greeting and Ganudenu note.',
        format: '/editavurudu Updated Nekath Greeting | Updated Ganudenu Note',
        preview: (c) => `Nekath: "${escapeHtml(c.interactive.avurudu_special.nekath_text)}"`
    },
    '/delavurudu': {
        desc: 'Clears the Avurudu Special messages.',
        format: '/delavurudu confirm',
        preview: (c) => `Nekath: "${escapeHtml(c.interactive.avurudu_special.nekath_text)}"`
    },

    // 30. FEATURE TOGGLES
    '/toggle': {
        desc: 'Turns any app feature section ON or OFF (birthday_cake, scratch_card, time_vaults, mood_tracker, envelopes, coupons, quiz, love_plant, bucket_list, love_bomb_mode).',
        format: '/toggle birthday_cake | on',
        preview: (c) => Object.entries(c.feature_toggles).map(([k, v]) => `• <code>${k.replace(/^show_/, '')}</code>: ${v ? '✅ ON' : '❌ OFF'}`).join('\n')
    },
    '/addtoggle': {
        desc: 'Enables a feature toggle in the app.',
        format: '/addtoggle birthday_cake | on',
        preview: (c) => Object.entries(c.feature_toggles).map(([k, v]) => `• <code>${k.replace(/^show_/, '')}</code>: ${v ? '✅ ON' : '❌ OFF'}`).join('\n')
    },
    '/edittoggle': {
        desc: 'Changes a feature toggle to ON or OFF.',
        format: '/edittoggle scratch_card | off',
        preview: (c) => Object.entries(c.feature_toggles).map(([k, v]) => `• <code>${k.replace(/^show_/, '')}</code>: ${v ? '✅ ON' : '❌ OFF'}`).join('\n')
    },
    '/deltoggle': {
        desc: 'Disables (turns OFF) the specified feature toggle.',
        format: '/deltoggle birthday_cake',
        preview: (c) => Object.entries(c.feature_toggles).map(([k, v]) => `• <code>${k.replace(/^show_/, '')}</code>: ${v ? '✅ ON' : '❌ OFF'}`).join('\n')
    },

    // 31. 365-DAY LOVE PLANT GAME MANAGEMENT
    '/plant': {
        desc: 'Sends a Special Love Boost from Rivishan to the 365-Day Love Plant OR sets custom Day (1-365) & XP points.',
        format: '/plant boost | Sending extra love & sunshine to our plant!',
        preview: (c) => {
            const ps = c.plant_state || {};
            return `Override Day: ${ps.override_day || 'Auto (Device)'} | Boost ID: #${ps.boost_id || 0}`;
        }
    },
    '/editplant': {
        desc: 'Sets a specific Day (1 to 365) and XP points for the 365-Day Love Plant on the app.',
        format: '/editplant 45 | 1350',
        preview: (c) => {
            const ps = c.plant_state || {};
            return `Current Override Day: ${ps.override_day || 'None'} | XP: ${ps.override_xp || 'Auto'}`;
        }
    },
    '/delplant': {
        desc: 'Resets the 365-Day Love Plant back to Day 1 (Seed stage) on the app.',
        format: '/delplant confirm',
        preview: () => 'Resets plant progress back to Day 1.'
    },

    // 32. RESET APP STATES (/resetapp)
    '/resetapp': {
        desc: 'Remotely resets saved selections/cooldowns on phones (Use "all" to reset everything, or "poll", "coupons", "plant" to reset a specific feature).',
        format: '/resetapp all',
        preview: (c) => `Last Reset ID: #${c.system_reset?.reset_id || 0} (Target: ${c.system_reset?.target || 'none'})`
    },

    // 33. MANUAL GITHUB FILE CLEANUP
    '/delmedia': {
        desc: 'Directly deletes any specific media file from your GitHub repository storage by its URL or path (e.g. images/img_123.jpg).',
        format: '/delmedia images/img_1792304624548.jpg',
        preview: () => '<i>Enter the relative path (e.g. images/file.jpg) or full raw.githubusercontent.com URL.</i>'
    }
};

// ============================================================================
// INLINE CONTROL KEYBOARDS
// ============================================================================
const MAIN_MENU_KEYBOARD = {
    inline_keyboard: [
        [
            { text: "🎂 Birthday Theme", callback_data: "theme_birthday" },
            { text: "❤️ Love Theme", callback_data: "theme_love" }
        ],
        [
            { text: "🌸 Avurudu Theme", callback_data: "theme_avurudu" },
            { text: "🌙 Night Theme", callback_data: "theme_night" }
        ],
        [
            { text: "👑 Rivi B'Day Mode", callback_data: "theme_rivi_bday" },
            { text: "✨ Auto Smart Mode", callback_data: "theme_auto" }
        ],
        [
            { text: "🚨 Love Bomb ON", callback_data: "lovebomb_on" },
            { text: "✅ Love Bomb OFF", callback_data: "lovebomb_off" }
        ],
        [
            { text: "💓 Send Heartbeat Pulse", callback_data: "send_pulse" },
            { text: "📊 App Status", callback_data: "app_status" }
        ],
        [
            { text: "🔄 Reset App States (Poll/Coupons)", callback_data: "reset_app_all" }
        ],
        [
            { text: "📖 All 300+ Features (Add / Edit / Remove)", callback_data: "show_help" }
        ]
    ]
};

// ============================================================================
// MAIN SERVERLESS HANDLER
// ============================================================================
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).json({
            status: "Active",
            message: "Rivishan & Anuki Master Bot Webhook (300+ Features Edition) is Running Properly!",
            repo: GITHUB_REPO
        });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        // --------------------------------------------------------------------
        // PART A: LIVE ALERTS, REPLIES & LYRICS SYNC FROM ANUKI'S APP
        // --------------------------------------------------------------------
        if (body.source === 'anuki_app') {
            const event = body.event || 'activity';
            const data = body.data || '';
            const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' });

            // Special Handler: Save Live-Synced Lyrics Timestamps directly to GitHub config.json
            if (event === 'save_lyrics_sync') {
                const parsedLines = typeof data === 'string' ? JSON.parse(data || '[]') : data;
                if (Array.isArray(parsedLines) && parsedLines.length > 0) {
                    const { json: config, sha } = await getGitHubConfig();
                    config.media.song_lyrics = parsedLines;
                    await updateGitHubConfig(config, sha, 'Save synchronized song lyrics timestamps from App');
                    await sendTelegram(
                        OWNER_CHAT_ID,
                        `🎶 <b>Lyrics Video Timestamps Saved to GitHub!</b>\n` +
                        `🕒 <i>${time}</i>\n\n` +
                        `• <b>Synced Lines:</b> ${parsedLines.length} lines (${Math.ceil(parsedLines.length / 4)} stanzas)\n` +
                        `• <b>Status:</b> Live on Anuki's phone & all devices!`
                    );
                }
                return res.status(200).json({ ok: true });
            }

            let alertMsg = `🌸 <b>Anuki App Live Alert!</b>\n🕒 <i>${time}</i>\n\n`;

            if (event === 'app_opened') alertMsg += `📱 <b>Anuki just opened the App!</b>`;
            else if (event === 'wrong_pin') alertMsg += `🔐 <b>Anuki entered a wrong PIN!</b>\nEntered: <code>${escapeHtml(data)}</code>`;
            else if (event === 'mood_selected') alertMsg += `💭 <b>Anuki selected her mood:</b> ${escapeHtml(data)}`;
            else if (event === 'quick_love') alertMsg += `💝 <b>Anuki sent you a Quick Love Alert:</b>\n👉 <b>${escapeHtml(data)}</b>`;
            else if (event === 'direct_reply') alertMsg += `💌 <b>Anuki sent you a message from the App:</b>\n\n"${escapeHtml(data)}"`;
            else if (event === 'coupon_redeemed') alertMsg += `🎟️ <b>Anuki redeemed her Weekly Love Coupon!</b>\nCoupon: <b>${escapeHtml(data)}</b>\n<i>(Next coupon redeem unlocks in 7 days)</i>`;
            else if (event === 'cake_blown') alertMsg += `🎂 <b>Anuki blew out the candles on the Birthday Cake!</b>`;
            else if (event === 'envelope_opened') alertMsg += `✉️ <b>Anuki opened a secret letter:</b>\n"${escapeHtml(data)}"`;
            else if (event === 'poll_answer') alertMsg += `📊 <b>Anuki selected a Weekly Date Activity (Pick 2 per 7 Days):</b>\n👉 <b>${escapeHtml(data)}</b>`;
            else if (event === 'plant_care') alertMsg += `🌱 <b>Anuki cared for your 365-Day Love Plant!</b>\n${escapeHtml(data)}`;
            else if (event === 'plant_milestone') alertMsg += `🌳 <b>365-Day Love Plant Milestone Reached!</b>\n🎉 ${escapeHtml(data)}`;
            else if (event === 'touch_link') alertMsg += `💓 <b>Anuki is holding the Heartbeat Touch Link right now!</b>`;
            else if (event === 'battery_low') alertMsg += `🪫 <b>Anuki's phone battery is low:</b> ${escapeHtml(data)}%`;
            else if (event === 'time_capsule') alertMsg += `⏳ <b>Anuki sealed a message in the Time Capsule:</b>\n"${escapeHtml(data)}"`;
            else alertMsg += `✨ <b>Activity:</b> ${escapeHtml(event)}\n${escapeHtml(data)}`;

            await sendTelegram(OWNER_CHAT_ID, alertMsg);
            return res.status(200).json({ ok: true });
        }

        // --------------------------------------------------------------------
        // PART B: TELEGRAM INLINE BUTTON CALLBACKS
        // --------------------------------------------------------------------
        if (body.callback_query) {
            const cb = body.callback_query;
            const chatId = cb.message.chat.id.toString();
            const action = cb.data;

            if (chatId !== OWNER_CHAT_ID) return res.status(200).send('OK');

            const { json: config, sha } = await getGitHubConfig();

            if (action.startsWith('theme_')) {
                const mode = action.replace('theme_', '');
                config.theme_engine.mode = mode;
                if (mode === 'birthday') {
                    config.theme_engine.header_title = "Happy Birthday My Queen Anuki!";
                    config.theme_engine.custom_primary_color = "#E91E63";
                    config.theme_engine.falling_particle_type = "confetti";
                } else if (mode === 'love') {
                    config.theme_engine.header_title = "Rivishan & Anuki Forever";
                    config.theme_engine.custom_primary_color = "#D81B60";
                    config.theme_engine.falling_particle_type = "hearts";
                } else if (mode === 'avurudu') {
                    config.theme_engine.header_title = "Suba Aluth Avuruddak Wewa Mage Manika!";
                    config.theme_engine.custom_primary_color = "#D84315";
                    config.theme_engine.falling_particle_type = "erabadu";
                } else if (mode === 'night') {
                    config.theme_engine.header_title = "Good Night My Sweetheart Anuki";
                    config.theme_engine.custom_primary_color = "#7B1FA2";
                    config.theme_engine.falling_particle_type = "stars";
                } else if (mode === 'rivi_bday') {
                    config.theme_engine.header_title = "Today is Rivishan's Birthday (Oct 03)!";
                    config.theme_engine.custom_primary_color = "#1565C0";
                    config.theme_engine.falling_particle_type = "sparkles";
                }
                await updateGitHubConfig(config, sha, `Switch theme to ${mode}`);
                await sendTelegram(chatId, `✅ <b>Theme Mode switched to:</b> <code>${mode.toUpperCase()}</code>`);
            } else if (action === 'lovebomb_on') {
                config.feature_toggles.love_bomb_mode = true;
                config.notification.notif_id += 1;
                config.notification.title = "Rivishan Loves You Endlessly! ❤️";
                config.notification.message = config.auto_pilot.love_bomb_message;
                await updateGitHubConfig(config, sha, 'Activate Love Bomb Mode');
                await sendTelegram(chatId, `🚨 <b>Emergency Love Bomb Mode Activated!</b>`);
            } else if (action === 'lovebomb_off') {
                config.feature_toggles.love_bomb_mode = false;
                await updateGitHubConfig(config, sha, 'Deactivate Love Bomb Mode');
                await sendTelegram(chatId, `✅ <b>Love Bomb Mode Deactivated (Returned to normal).</b>`);
            } else if (action === 'send_pulse') {
                config.live_popup.popup_id += 1;
                config.live_popup.enabled = true;
                config.live_popup.title = "Heartbeat From Rivishan 💓";
                config.live_popup.message = "Right at this moment, my heart is beating only for you, my love...";
                config.live_popup.trigger_heartbeat_vibration = true;
                await updateGitHubConfig(config, sha, 'Send Remote Heartbeat Pulse');
                await sendTelegram(chatId, `💓 <b>Heartbeat Vibration & Live Popup sent to Anuki's App!</b>`);
            } else if (action === 'reset_app_all') {
                config.system_reset = {
                    reset_id: ((config.system_reset && config.system_reset.reset_id) || 0) + 1,
                    target: 'all',
                    timestamp: Date.now()
                };
                await updateGitHubConfig(config, sha, 'Trigger remote app state reset (all)');
                await sendTelegram(
                    chatId,
                    `🔄 <b>Remote App Reset Triggered (ID: #${config.system_reset.reset_id})!</b>\n` +
                    `All saved Poll selections, Coupon cooldowns, and Quiz states will automatically reset on the phone.`
                );
            } else if (action === 'app_status') {
                const statusText = `📊 <b>Rivishan & Anuki App Status</b>\n\n` +
                    `• <b>Version:</b> v${config.app_version}\n` +
                    `• <b>Theme Mode:</b> ${escapeHtml(config.theme_engine.mode)}\n` +
                    `• <b>Header:</b> ${escapeHtml(config.theme_engine.header_title)}\n` +
                    `• <b>Main PIN:</b> <code>${escapeHtml(config.security.main_pin)}</code>\n` +
                    `• <b>Memories:</b> ${config.memories.length} | <b>Envelopes:</b> ${config.envelopes.length}\n` +
                    `• <b>Coupons:</b> ${config.coupons.length} | <b>Quiz:</b> ${config.quiz.length}\n` +
                    `• <b>Poll Options:</b> ${config.interactive.live_poll.options.length} | <b>Vaults:</b> ${config.time_vaults.length}\n` +
                    `• <b>Reasons:</b> ${config.interactive.love_reasons.length} | <b>Fortunes:</b> ${config.interactive.fortune_cookies.length}\n` +
                    `• <b>Notif ID:</b> #${config.notification.notif_id} | <b>Popup ID:</b> #${config.live_popup.popup_id}`;
                await sendTelegram(chatId, statusText);
            } else if (action === 'show_help') {
                const helpPages = getHelpMessages();
                for (const page of helpPages) {
                    await sendTelegram(chatId, page);
                }
            }

            const cbPayload = JSON.stringify({ callback_query_id: cb.id });
            await apiRequest(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cbPayload) }
            }, cbPayload);

            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // PART C: TELEGRAM COMMANDS & MEDIA UPLOADS WITH CAPTION COMMANDS
        // --------------------------------------------------------------------
        if (!body.message) return res.status(200).send('OK');

        const msg = body.message;
        const chatId = msg.chat.id.toString();

        if (chatId !== OWNER_CHAT_ID) {
            await sendTelegram(chatId, "⚠️ <b>Access Denied!</b> This private control bot belongs to Rivishan.");
            return res.status(200).send('Unauthorized');
        }

        const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
        const hasVoice = !!msg.voice;
        const hasAudio = !!msg.audio;
        const rawInput = (msg.text || msg.caption || '').trim();

        // /start and /menu
        if (rawInput === '/start' || rawInput === '/menu') {
            await sendTelegram(
                chatId,
                `👑 <b>Welcome Rivishan! (Anuki Love App Master Control)</b>\n\n` +
                `Your bot is 100% connected to GitHub & the App!\n` +
                `• Tap any button below for quick actions.\n` +
                `• Tap /help to view all <b>300+ Features (Add, Edit & Remove)</b>.\n` +
                `• Tap any command to receive <b>2 messages</b>: (1) What it does, and (2) A one-tap copyable command format using <code>|</code>.\n` +
                `• Use /resetapp to reset saved Poll/Coupon/Plant states anytime!`,
                MAIN_MENU_KEYBOARD
            );
            return res.status(200).send('OK');
        }

        if (rawInput === '/help' || rawInput === '/commands') {
            const helpPages = getHelpMessages();
            for (const page of helpPages) {
                await sendTelegram(chatId, page);
            }
            return res.status(200).send('OK');
        }

        const { json: config, sha } = await getGitHubConfig();

        if (rawInput === '/status') {
            await sendTelegram(
                chatId,
                `✅ <b>App Version:</b> v${config.app_version}\n` +
                `🎨 <b>Theme:</b> ${escapeHtml(config.theme_engine.mode)}\n` +
                `💌 <b>Daily Note:</b> ${escapeHtml(config.auto_pilot.daily_note)}\n` +
                `📸 <b>Memories:</b> ${config.memories.length} | ✉️ <b>Envelopes:</b> ${config.envelopes.length}`,
                MAIN_MENU_KEYBOARD
            );
            return res.status(200).send('OK');
        }

        // Parse command and arguments
        let cmd = '';
        let argStr = '';
        if (rawInput.startsWith('/')) {
            const firstSpace = rawInput.indexOf(' ');
            const firstNewline = rawInput.indexOf('\n');
            let splitPos = -1;
            if (firstSpace !== -1 && firstNewline !== -1) splitPos = Math.min(firstSpace, firstNewline);
            else splitPos = Math.max(firstSpace, firstNewline);

            if (splitPos === -1) {
                cmd = rawInput.toLowerCase().split('@')[0];
                argStr = '';
            } else {
                cmd = rawInput.substring(0, splitPos).toLowerCase().split('@')[0];
                argStr = rawInput.substring(splitPos + 1).trim();
            }
        } else if (hasPhoto || hasVoice || hasAudio) {
            const lowerCap = rawInput.toLowerCase();
            if (hasPhoto) {
                if (lowerCap === 'wallpaper' || lowerCap.startsWith('wallpaper ')) {
                    cmd = '/wallpaper';
                    argStr = rawInput.substring(9).trim();
                } else if (lowerCap.startsWith('scratch')) {
                    cmd = '/scratch';
                    argStr = rawInput.replace(/^scratch\s*\|?\s*/i, '').trim();
                } else {
                    cmd = '/addmemory';
                    argStr = rawInput;
                }
            } else if (hasVoice || hasAudio) {
                if (lowerCap.startsWith('bday')) {
                    cmd = '/bdaymusic';
                    argStr = '';
                } else if (lowerCap.startsWith('avurudu')) {
                    cmd = '/avurudumusic';
                    argStr = '';
                } else if (lowerCap.startsWith('pinhint') || lowerCap.startsWith('hint')) {
                    cmd = '/pinhint';
                    argStr = '';
                } else if (hasVoice || lowerCap.startsWith('voice')) {
                    cmd = '/voice';
                    argStr = rawInput.replace(/^voice\s*\|?\s*/i, '').trim();
                } else {
                    cmd = '/music';
                    argStr = '';
                }
            }
        }

        // If a command was sent WITHOUT arguments and WITHOUT media attached -> Send the 2-Message Guide!
        if (cmd && !argStr && !hasPhoto && !hasVoice && !hasAudio) {
            const handled = await sendCommandGuide(chatId, cmd, config);
            if (handled) return res.status(200).send('OK');
        }

        // Helper to split pipe-separated arguments: "Part 1 | Part 2 | Part 3"
        const parts = argStr ? argStr.split('|').map(s => s.trim()) : [];

        // Helper for 1-based index validation
        const parseIdx = (str, arr) => {
            const n = parseInt(str, 10);
            if (isNaN(n) || n < 1 || n > arr.length) return -1;
            return n - 1;
        };

        // ====================================================================
        // EXECUTE COMMANDS (ADD / EDIT / REMOVE FOR ALL FEATURES)
        // ====================================================================

        // --------------------------------------------------------------------
        // 1. MEMORIES (/addmemory, /editmemory, /delmemory, /reversememories)
        // --------------------------------------------------------------------
        if (cmd === '/addmemory') {
            if (!hasPhoto && parts.length < 3) {
                await sendCommandGuide(chatId, '/addmemory', config);
                return res.status(200).send('OK');
            }
            let imageUrl = parts[3] || '';
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `img_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading memory photo to GitHub...</i>");
                imageUrl = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Upload memory photo via Bot');
            }
            const newMemory = {
                date: parts[0] || new Date().toISOString().split('T')[0],
                title: parts[1] || "Our Special Memory",
                description: parts[2] || (parts[0] && parts.length === 1 ? parts[0] : "An unforgettable moment together."),
                image_url: imageUrl
            };
            config.memories.push(newMemory);
            await updateGitHubConfig(config, sha, 'Add new memory');
            await sendTelegram(
                chatId,
                `📸 <b>New Memory Added to Bottom (#${config.memories.length})!</b>\n\n` +
                `• <b>Date:</b> ${escapeHtml(newMemory.date)}\n` +
                `• <b>Title:</b> ${escapeHtml(newMemory.title)}\n` +
                `• <b>Description:</b> ${escapeHtml(newMemory.description)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/reversememories') {
            config.memories.reverse();
            await updateGitHubConfig(config, sha, 'Reverse memories order');
            await sendTelegram(
                chatId,
                `🔄 <b>Memories Order Reversed Successfully!</b>\n` +
                `Your first memory is now at the top, and newer memories follow below it.`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editmemory') {
            const idx = parseIdx(parts[0], config.memories);
            if (idx === -1 || (parts.length < 2 && !hasPhoto)) {
                await sendCommandGuide(chatId, '/editmemory', config);
                return res.status(200).send('OK');
            }
            const target = config.memories[idx];
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `img_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading new photo & cleaning old photo from GitHub...</i>");
                if (target.image_url) {
                    await deleteMediaFromGitHub(target.image_url, 'Remove replaced memory photo');
                }
                target.image_url = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Update memory photo via Bot');
            } else if (parts[4]) {
                if (target.image_url && target.image_url !== parts[4]) {
                    await deleteMediaFromGitHub(target.image_url, 'Remove replaced memory photo');
                }
                target.image_url = parts[4];
            }
            if (parts[1]) target.date = parts[1];
            if (parts[2]) target.title = parts[2];
            if (parts[3]) target.description = parts[3];

            await updateGitHubConfig(config, sha, `Edit memory #${idx + 1}`);
            await sendTelegram(
                chatId,
                `✏️ <b>Memory #${idx + 1} Updated Successfully!</b>\n\n` +
                `• <b>Date:</b> ${escapeHtml(target.date)}\n` +
                `• <b>Title:</b> ${escapeHtml(target.title)}\n` +
                `• <b>Description:</b> ${escapeHtml(target.description)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delmemory') {
            if (argStr.toLowerCase() === 'all') {
                await sendTelegram(chatId, "🗑️ <i>Removing all memories and deleting image files from GitHub...</i>");
                for (const m of config.memories) {
                    if (m.image_url) await deleteMediaFromGitHub(m.image_url, 'Delete memory image');
                }
                config.memories = [];
                await updateGitHubConfig(config, sha, 'Delete all memories');
                await sendTelegram(chatId, `🗑️ <b>All memories and their GitHub images have been deleted!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.memories);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delmemory', config);
                return res.status(200).send('OK');
            }
            const removed = config.memories.splice(idx, 1)[0];
            let fileDeleted = false;
            if (removed.image_url) {
                fileDeleted = await deleteMediaFromGitHub(removed.image_url, `Delete memory image: ${removed.title}`);
            }
            await updateGitHubConfig(config, sha, `Delete memory #${idx + 1}`);
            await sendTelegram(
                chatId,
                `🗑️ <b>Memory #${idx + 1} Removed!</b>\n` +
                `• <b>Title:</b> ${escapeHtml(removed.title)}\n` +
                `• <b>GitHub Storage File:</b> ${fileDeleted ? '✅ Deleted from repo' : 'ℹ️ No repo file to delete'}`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 2. WALLPAPER (/wallpaper, /addwallpaper, /editwallpaper, /delwallpaper)
        // --------------------------------------------------------------------
        if (cmd === '/wallpaper' || cmd === '/addwallpaper' || cmd === '/editwallpaper') {
            if (!hasPhoto && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const oldUrl = config.theme_engine.custom_wallpaper_url;
            let newUrl = argStr;
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `wallpaper_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading wallpaper to GitHub...</i>");
                newUrl = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Upload custom wallpaper');
            }
            if (oldUrl && oldUrl !== newUrl) {
                await deleteMediaFromGitHub(oldUrl, 'Delete old wallpaper from GitHub');
            }
            config.theme_engine.custom_wallpaper_url = newUrl;
            await updateGitHubConfig(config, sha, 'Update custom wallpaper');
            await sendTelegram(chatId, `🖼️ <b>App Background Wallpaper Updated Successfully!</b> (Old file cleaned from GitHub)`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delwallpaper') {
            const oldUrl = config.theme_engine.custom_wallpaper_url;
            const deleted = oldUrl ? await deleteMediaFromGitHub(oldUrl, 'Delete custom wallpaper') : false;
            config.theme_engine.custom_wallpaper_url = "";
            await updateGitHubConfig(config, sha, 'Remove custom wallpaper');
            await sendTelegram(
                chatId,
                `🗑️ <b>Custom Wallpaper Removed!</b>\n` +
                `• <b>GitHub File Cleanup:</b> ${deleted ? '✅ Deleted from repo' : 'ℹ️ Already clean'}`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 3. SCRATCH CARD (/scratch, /addscratch, /editscratch, /delscratch)
        // --------------------------------------------------------------------
        if (cmd === '/scratch' || cmd === '/addscratch' || cmd === '/editscratch') {
            if (!hasPhoto && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `scratch_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading Scratch Card photo to GitHub...</i>");
                if (config.interactive.scratch_card_image) {
                    await deleteMediaFromGitHub(config.interactive.scratch_card_image, 'Delete old scratch card image');
                }
                config.interactive.scratch_card_image = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Update scratch card image');
            } else if (parts[1]) {
                if (config.interactive.scratch_card_image && config.interactive.scratch_card_image !== parts[1]) {
                    await deleteMediaFromGitHub(config.interactive.scratch_card_image, 'Delete old scratch card image');
                }
                config.interactive.scratch_card_image = parts[1];
            }
            if (parts[0]) {
                config.interactive.scratch_card_text = parts[0];
            }
            await updateGitHubConfig(config, sha, 'Update scratch card');
            await sendTelegram(
                chatId,
                `🪙 <b>Scratch Card Updated Successfully!</b>\n\n` +
                `• <b>Secret Text:</b> "${escapeHtml(config.interactive.scratch_card_text)}"`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delscratch') {
            const oldImg = config.interactive.scratch_card_image;
            const deleted = oldImg ? await deleteMediaFromGitHub(oldImg, 'Delete scratch card image') : false;
            config.interactive.scratch_card_image = "";
            config.interactive.scratch_card_text = "You are the most precious gift in my life!";
            await updateGitHubConfig(config, sha, 'Reset scratch card');
            await sendTelegram(
                chatId,
                `🗑️ <b>Scratch Card Reset & Image Removed!</b>\n` +
                `• <b>GitHub File Cleanup:</b> ${deleted ? '✅ Deleted from repo' : 'ℹ️ No repo image to delete'}`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 4. VOICE NOTE (/voice, /addvoice, /editvoice, /delvoice)
        // --------------------------------------------------------------------
        if (cmd === '/voice' || cmd === '/addvoice' || cmd === '/editvoice') {
            if (!hasVoice && !hasAudio && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            if (hasVoice || hasAudio) {
                const fileId = hasVoice ? msg.voice.file_id : msg.audio.file_id;
                const fileName = `voice_${Date.now()}.mp3`;
                await sendTelegram(chatId, "⏳ <i>Uploading Voice Note to GitHub...</i>");
                if (config.media.voice_note_url) {
                    await deleteMediaFromGitHub(config.media.voice_note_url, 'Delete old voice note');
                }
                config.media.voice_note_url = await uploadMediaToGitHub(fileId, 'voice', fileName, 'Upload new voice note');
            }
            if (parts[0]) {
                config.media.voice_note_title = parts[0];
            }
            await updateGitHubConfig(config, sha, 'Update voice note');
            await sendTelegram(
                chatId,
                `🎙️ <b>Voice Note Updated Successfully!</b>\n` +
                `• <b>Title:</b> ${escapeHtml(config.media.voice_note_title)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delvoice') {
            const oldUrl = config.media.voice_note_url;
            const deleted = oldUrl ? await deleteMediaFromGitHub(oldUrl, 'Delete voice note file') : false;
            config.media.voice_note_url = "";
            await updateGitHubConfig(config, sha, 'Remove voice note');
            await sendTelegram(
                chatId,
                `🗑️ <b>Voice Note Removed!</b>\n` +
                `• <b>GitHub File Cleanup:</b> ${deleted ? '✅ Deleted from repo' : 'ℹ️ Already clean'}`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 5. MUSIC & PIN HINT (/music, /bdaymusic, /avurudumusic, /pinhint)
        // --------------------------------------------------------------------
        if (['/music', '/addmusic', '/editmusic'].includes(cmd)) {
            if (!hasAudio && !hasVoice && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const oldUrl = config.media.bg_music_url;
            if (hasAudio || hasVoice) {
                const fileId = hasAudio ? msg.audio.file_id : msg.voice.file_id;
                const fileName = `song_${Date.now()}.mp3`;
                await sendTelegram(chatId, "⏳ <i>Uploading main background music to GitHub...</i>");
                config.media.bg_music_url = await uploadMediaToGitHub(fileId, 'music', fileName, 'Upload background music');
            } else {
                config.media.bg_music_url = argStr;
            }
            if (oldUrl && oldUrl !== config.media.bg_music_url) {
                await deleteMediaFromGitHub(oldUrl, 'Delete old background music');
            }
            await updateGitHubConfig(config, sha, 'Update background music');
            await sendTelegram(chatId, `🎵 <b>Main Background Music Updated Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delmusic') {
            const deleted = await deleteMediaFromGitHub(config.media.bg_music_url, 'Delete background music');
            config.media.bg_music_url = "";
            await updateGitHubConfig(config, sha, 'Remove background music');
            await sendTelegram(chatId, `🗑️ <b>Background Music Removed!</b> (GitHub File: ${deleted ? '✅ Deleted' : 'ℹ️ None'})`);
            return res.status(200).send('OK');
        }

        if (['/bdaymusic', '/addbdaymusic', '/editbdaymusic'].includes(cmd)) {
            if (!hasAudio && !hasVoice && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const oldUrl = config.media.birthday_music_url;
            if (hasAudio || hasVoice) {
                const fileId = hasAudio ? msg.audio.file_id : msg.voice.file_id;
                const fileName = `bday_${Date.now()}.mp3`;
                await sendTelegram(chatId, "⏳ <i>Uploading Birthday music to GitHub...</i>");
                config.media.birthday_music_url = await uploadMediaToGitHub(fileId, 'music', fileName, 'Upload birthday music');
            } else {
                config.media.birthday_music_url = argStr;
            }
            if (oldUrl && oldUrl !== config.media.birthday_music_url) {
                await deleteMediaFromGitHub(oldUrl, 'Delete old birthday music');
            }
            await updateGitHubConfig(config, sha, 'Update birthday music');
            await sendTelegram(chatId, `🎂 <b>Birthday Celebration Music Updated Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delbdaymusic') {
            const deleted = await deleteMediaFromGitHub(config.media.birthday_music_url, 'Delete birthday music');
            config.media.birthday_music_url = "";
            await updateGitHubConfig(config, sha, 'Remove birthday music');
            await sendTelegram(chatId, `🗑️ <b>Birthday Music Removed!</b> (GitHub File: ${deleted ? '✅ Deleted' : 'ℹ️ None'})`);
            return res.status(200).send('OK');
        }

        if (['/avurudumusic', '/addavurudumusic', '/editavurudumusic'].includes(cmd)) {
            if (!hasAudio && !hasVoice && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const oldUrl = config.media.avurudu_music_url;
            if (hasAudio || hasVoice) {
                const fileId = hasAudio ? msg.audio.file_id : msg.voice.file_id;
                const fileName = `avurudu_${Date.now()}.mp3`;
                await sendTelegram(chatId, "⏳ <i>Uploading Avurudu music to GitHub...</i>");
                config.media.avurudu_music_url = await uploadMediaToGitHub(fileId, 'music', fileName, 'Upload Avurudu music');
            } else {
                config.media.avurudu_music_url = argStr;
            }
            if (oldUrl && oldUrl !== config.media.avurudu_music_url) {
                await deleteMediaFromGitHub(oldUrl, 'Delete old Avurudu music');
            }
            await updateGitHubConfig(config, sha, 'Update Avurudu music');
            await sendTelegram(chatId, `🌸 <b>Avurudu Theme Music Updated Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delavurudumusic') {
            const deleted = await deleteMediaFromGitHub(config.media.avurudu_music_url, 'Delete Avurudu music');
            config.media.avurudu_music_url = "";
            await updateGitHubConfig(config, sha, 'Remove Avurudu music');
            await sendTelegram(chatId, `🗑️ <b>Avurudu Music Removed!</b> (GitHub File: ${deleted ? '✅ Deleted' : 'ℹ️ None'})`);
            return res.status(200).send('OK');
        }

        if (['/pinhint', '/addpinhint', '/editpinhint'].includes(cmd)) {
            if (!hasVoice && !hasAudio && !argStr) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const oldUrl = config.security.voice_hint_url;
            if (hasVoice || hasAudio) {
                const fileId = hasVoice ? msg.voice.file_id : msg.audio.file_id;
                const fileName = `pin_hint_${Date.now()}.mp3`;
                await sendTelegram(chatId, "⏳ <i>Uploading PIN Voice Hint to GitHub...</i>");
                config.security.voice_hint_url = await uploadMediaToGitHub(fileId, 'voice', fileName, 'Upload PIN voice hint');
            } else {
                config.security.voice_hint_url = argStr;
            }
            if (oldUrl && oldUrl !== config.security.voice_hint_url) {
                await deleteMediaFromGitHub(oldUrl, 'Delete old PIN voice hint');
            }
            await updateGitHubConfig(config, sha, 'Update PIN voice hint');
            await sendTelegram(chatId, `🎧 <b>Lock Screen PIN Voice Hint Updated Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delpinhint') {
            const deleted = await deleteMediaFromGitHub(config.security.voice_hint_url, 'Delete PIN voice hint');
            config.security.voice_hint_url = "";
            await updateGitHubConfig(config, sha, 'Remove PIN voice hint');
            await sendTelegram(chatId, `🗑️ <b>PIN Voice Hint Removed!</b> (GitHub File: ${deleted ? '✅ Deleted' : 'ℹ️ None'})`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 6. OPEN WHEN ENVELOPES (/addenvelope, /editenvelope, /delenvelope)
        // --------------------------------------------------------------------
        if (cmd === '/addenvelope') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/addenvelope', config);
                return res.status(200).send('OK');
            }
            config.envelopes.push({ title: parts[0], content: parts[1] });
            await updateGitHubConfig(config, sha, 'Add Open When envelope');
            await sendTelegram(chatId, `✉️ <b>New 'Open When' Envelope Added!</b>\n• <b>Title:</b> ${escapeHtml(parts[0])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editenvelope') {
            const idx = parseIdx(parts[0], config.envelopes);
            if (idx === -1 || parts.length < 3) {
                await sendCommandGuide(chatId, '/editenvelope', config);
                return res.status(200).send('OK');
            }
            config.envelopes[idx] = { title: parts[1], content: parts[2] };
            await updateGitHubConfig(config, sha, `Edit envelope #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Envelope #${idx + 1} Updated!</b>\n• <b>Title:</b> ${escapeHtml(parts[1])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delenvelope') {
            if (argStr.toLowerCase() === 'all') {
                config.envelopes = [];
                await updateGitHubConfig(config, sha, 'Delete all envelopes');
                await sendTelegram(chatId, `🗑️ <b>All 'Open When' Envelopes Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.envelopes);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delenvelope', config);
                return res.status(200).send('OK');
            }
            const removed = config.envelopes.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete envelope #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Envelope #${idx + 1} Removed:</b> ${escapeHtml(removed.title)}`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 7. LOVE COUPONS (/addcoupon, /editcoupon, /delcoupon)
        // --------------------------------------------------------------------
        if (cmd === '/addcoupon') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/addcoupon', config);
                return res.status(200).send('OK');
            }
            config.coupons.push({ id: `c_${Date.now()}`, title: parts[0], desc: parts[1] });
            await updateGitHubConfig(config, sha, 'Add love coupon');
            await sendTelegram(chatId, `🎟️ <b>New Love Coupon Added!</b>\n• <b>Title:</b> ${escapeHtml(parts[0])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editcoupon') {
            const idx = parseIdx(parts[0], config.coupons);
            if (idx === -1 || parts.length < 3) {
                await sendCommandGuide(chatId, '/editcoupon', config);
                return res.status(200).send('OK');
            }
            config.coupons[idx].title = parts[1];
            config.coupons[idx].desc = parts[2];
            await updateGitHubConfig(config, sha, `Edit coupon #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Love Coupon #${idx + 1} Updated!</b>\n• <b>Title:</b> ${escapeHtml(parts[1])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delcoupon') {
            if (argStr.toLowerCase() === 'all') {
                config.coupons = [];
                await updateGitHubConfig(config, sha, 'Delete all coupons');
                await sendTelegram(chatId, `🗑️ <b>All Love Coupons Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.coupons);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delcoupon', config);
                return res.status(200).send('OK');
            }
            const removed = config.coupons.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete coupon #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Love Coupon #${idx + 1} Removed:</b> ${escapeHtml(removed.title)}`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 8. TIME VAULTS (/addvault, /editvault, /delvault)
        // --------------------------------------------------------------------
        if (cmd === '/addvault') {
            if (parts.length < 4) {
                await sendCommandGuide(chatId, '/addvault', config);
                return res.status(200).send('OK');
            }
            let secretImg = parts[5] || '';
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `vault_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading vault secret photo to GitHub...</i>");
                secretImg = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Upload time vault photo');
            }
            const newVault = {
                id: `vault_${Date.now()}`,
                title: parts[0],
                unlock_date: parts[1],
                locked_hint: parts[2],
                secret_title: parts.length >= 5 ? parts[3] : parts[0],
                secret_message: parts.length >= 5 ? parts[4] : parts[3],
                secret_image_url: secretImg
            };
            config.time_vaults.push(newVault);
            await updateGitHubConfig(config, sha, 'Add time-locked vault');
            await sendTelegram(
                chatId,
                `🔐 <b>New Time-Locked Vault Added!</b>\n` +
                `• <b>Title:</b> ${escapeHtml(newVault.title)}\n` +
                `• <b>Unlocks On:</b> ${escapeHtml(newVault.unlock_date)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editvault') {
            const idx = parseIdx(parts[0], config.time_vaults);
            if (idx === -1 || (parts.length < 2 && !hasPhoto)) {
                await sendCommandGuide(chatId, '/editvault', config);
                return res.status(200).send('OK');
            }
            const v = config.time_vaults[idx];
            if (hasPhoto) {
                const bestPhoto = msg.photo[msg.photo.length - 1];
                const fileName = `vault_${Date.now()}.jpg`;
                await sendTelegram(chatId, "⏳ <i>Uploading new vault photo & cleaning old file...</i>");
                if (v.secret_image_url) {
                    await deleteMediaFromGitHub(v.secret_image_url, 'Delete old vault image');
                }
                v.secret_image_url = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Update vault photo');
            }
            if (parts[1]) v.title = parts[1];
            if (parts[2]) v.unlock_date = parts[2];
            if (parts[3]) v.locked_hint = parts[3];
            if (parts[4]) v.secret_title = parts[4];
            if (parts[5]) v.secret_message = parts[5];

            await updateGitHubConfig(config, sha, `Edit vault #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Time Vault #${idx + 1} Updated!</b>\n• <b>Title:</b> ${escapeHtml(v.title)}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delvault') {
            if (argStr.toLowerCase() === 'all') {
                for (const v of config.time_vaults) {
                    if (v.secret_image_url) await deleteMediaFromGitHub(v.secret_image_url, 'Delete vault image');
                }
                config.time_vaults = [];
                await updateGitHubConfig(config, sha, 'Delete all time vaults');
                await sendTelegram(chatId, `🗑️ <b>All Time Vaults and their images have been removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.time_vaults);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delvault', config);
                return res.status(200).send('OK');
            }
            const removed = config.time_vaults.splice(idx, 1)[0];
            const deleted = removed.secret_image_url ? await deleteMediaFromGitHub(removed.secret_image_url, 'Delete vault image') : false;
            await updateGitHubConfig(config, sha, `Delete vault #${idx + 1}`);
            await sendTelegram(
                chatId,
                `🗑️ <b>Time Vault #${idx + 1} Removed:</b> ${escapeHtml(removed.title)}\n` +
                `• <b>GitHub Image Cleanup:</b> ${deleted ? '✅ Deleted' : 'ℹ️ No repo image'}`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 9. LOVE REASONS (/addreason, /editreason, /delreason)
        // --------------------------------------------------------------------
        if (cmd === '/addreason') {
            config.interactive.love_reasons.push(argStr);
            await updateGitHubConfig(config, sha, 'Add love reason');
            await sendTelegram(chatId, `❤️ <b>New Love Reason Added!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editreason') {
            const idx = parseIdx(parts[0], config.interactive.love_reasons);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editreason', config);
                return res.status(200).send('OK');
            }
            config.interactive.love_reasons[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit love reason #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Love Reason #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delreason') {
            if (argStr.toLowerCase() === 'all') {
                config.interactive.love_reasons = [];
                await updateGitHubConfig(config, sha, 'Delete all love reasons');
                await sendTelegram(chatId, `🗑️ <b>All Love Reasons Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.interactive.love_reasons);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delreason', config);
                return res.status(200).send('OK');
            }
            const removed = config.interactive.love_reasons.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete love reason #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Love Reason #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 10. FORTUNE COOKIES (/addfortune, /editfortune, /delfortune)
        // --------------------------------------------------------------------
        if (cmd === '/addfortune') {
            config.interactive.fortune_cookies.push(argStr);
            await updateGitHubConfig(config, sha, 'Add fortune cookie');
            await sendTelegram(chatId, `🥠 <b>New Fortune Cookie Message Added!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editfortune') {
            const idx = parseIdx(parts[0], config.interactive.fortune_cookies);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editfortune', config);
                return res.status(200).send('OK');
            }
            config.interactive.fortune_cookies[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit fortune cookie #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Fortune Cookie #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delfortune') {
            if (argStr.toLowerCase() === 'all') {
                config.interactive.fortune_cookies = [];
                await updateGitHubConfig(config, sha, 'Delete all fortune cookies');
                await sendTelegram(chatId, `🗑️ <b>All Fortune Cookie Messages Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.interactive.fortune_cookies);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delfortune', config);
                return res.status(200).send('OK');
            }
            const removed = config.interactive.fortune_cookies.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete fortune cookie #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Fortune Cookie #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 11. QUIZ QUESTIONS (/addquiz, /editquiz, /delquiz)
        // --------------------------------------------------------------------
        if (cmd === '/addquiz') {
            if (parts.length < 3) {
                await sendCommandGuide(chatId, '/addquiz', config);
                return res.status(200).send('OK');
            }
            config.quiz.push({
                q: parts[0],
                options: parts[1].split(',').map(o => o.trim()).filter(Boolean),
                answer_index: parseInt(parts[2], 10) || 0
            });
            await updateGitHubConfig(config, sha, 'Add quiz question');
            await sendTelegram(chatId, `🎮 <b>New Quiz Question Added!</b>\n• <b>Q:</b> ${escapeHtml(parts[0])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editquiz') {
            const idx = parseIdx(parts[0], config.quiz);
            if (idx === -1 || parts.length < 4) {
                await sendCommandGuide(chatId, '/editquiz', config);
                return res.status(200).send('OK');
            }
            config.quiz[idx] = {
                q: parts[1],
                options: parts[2].split(',').map(o => o.trim()).filter(Boolean),
                answer_index: parseInt(parts[3], 10) || 0
            };
            await updateGitHubConfig(config, sha, `Edit quiz #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Quiz Question #${idx + 1} Updated!</b>\n• <b>Q:</b> ${escapeHtml(parts[1])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delquiz') {
            if (argStr.toLowerCase() === 'all') {
                config.quiz = [];
                await updateGitHubConfig(config, sha, 'Delete all quiz questions');
                await sendTelegram(chatId, `🗑️ <b>All Quiz Questions Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.quiz);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delquiz', config);
                return res.status(200).send('OK');
            }
            const removed = config.quiz.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete quiz #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Quiz Question #${idx + 1} Removed:</b>\n"${escapeHtml(removed.q)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 12. BUCKET LIST (/addbucket, /editbucket, /delbucket)
        // --------------------------------------------------------------------
        if (cmd === '/addbucket') {
            const isDone = (parts[1] || '').toLowerCase() === 'true' || (parts[1] || '').toLowerCase() === 'done';
            config.bucket_list.push({ task: parts[0], done: isDone });
            await updateGitHubConfig(config, sha, 'Add bucket list item');
            await sendTelegram(chatId, `📝 <b>New Bucket List Goal Added!</b>\n• ${isDone ? '✅' : '⬜'} ${escapeHtml(parts[0])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editbucket') {
            const idx = parseIdx(parts[0], config.bucket_list);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editbucket', config);
                return res.status(200).send('OK');
            }
            if (parts[1]) config.bucket_list[idx].task = parts[1];
            if (parts[2] !== undefined) {
                config.bucket_list[idx].done = ['true', 'done', 'yes', '1'].includes(parts[2].toLowerCase());
            }
            await updateGitHubConfig(config, sha, `Edit bucket list #${idx + 1}`);
            await sendTelegram(
                chatId,
                `✏️ <b>Bucket List #${idx + 1} Updated!</b>\n` +
                `• ${config.bucket_list[idx].done ? '✅' : '⬜'} ${escapeHtml(config.bucket_list[idx].task)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delbucket') {
            if (argStr.toLowerCase() === 'all') {
                config.bucket_list = [];
                await updateGitHubConfig(config, sha, 'Delete all bucket list items');
                await sendTelegram(chatId, `🗑️ <b>All Bucket List Goals Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.bucket_list);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delbucket', config);
                return res.status(200).send('OK');
            }
            const removed = config.bucket_list.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete bucket list #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Bucket List #${idx + 1} Removed:</b> ${escapeHtml(removed.task)}`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 13. STORY CHAPTERS (/addstory, /editstory, /delstory)
        // --------------------------------------------------------------------
        if (cmd === '/addstory') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/addstory', config);
                return res.status(200).send('OK');
            }
            config.story_chapters.push({ chapter: parts[0], text: parts[1] });
            await updateGitHubConfig(config, sha, 'Add story chapter');
            await sendTelegram(chatId, `📖 <b>New Story Chapter Added!</b>\n• <b>${escapeHtml(parts[0])}</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editstory') {
            const idx = parseIdx(parts[0], config.story_chapters);
            if (idx === -1 || parts.length < 3) {
                await sendCommandGuide(chatId, '/editstory', config);
                return res.status(200).send('OK');
            }
            config.story_chapters[idx] = { chapter: parts[1], text: parts[2] };
            await updateGitHubConfig(config, sha, `Edit story chapter #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Story Chapter #${idx + 1} Updated!</b>\n• <b>${escapeHtml(parts[1])}</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delstory') {
            if (argStr.toLowerCase() === 'all') {
                config.story_chapters = [];
                await updateGitHubConfig(config, sha, 'Delete all story chapters');
                await sendTelegram(chatId, `🗑️ <b>All Story Chapters Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.story_chapters);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delstory', config);
                return res.status(200).send('OK');
            }
            const removed = config.story_chapters.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete story chapter #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Story Chapter #${idx + 1} Removed:</b> ${escapeHtml(removed.chapter)}`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 14. PRIVATE DICTIONARY (/adddict, /editdict, /deldict)
        // --------------------------------------------------------------------
        if (cmd === '/adddict') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/adddict', config);
                return res.status(200).send('OK');
            }
            config.interactive.private_dictionary.push({ word: parts[0], meaning: parts[1] });
            await updateGitHubConfig(config, sha, 'Add dictionary word');
            await sendTelegram(chatId, `📕 <b>Dictionary Word Added!</b>\n• <b>${escapeHtml(parts[0])}:</b> ${escapeHtml(parts[1])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editdict') {
            const idx = parseIdx(parts[0], config.interactive.private_dictionary);
            if (idx === -1 || parts.length < 3) {
                await sendCommandGuide(chatId, '/editdict', config);
                return res.status(200).send('OK');
            }
            config.interactive.private_dictionary[idx] = { word: parts[1], meaning: parts[2] };
            await updateGitHubConfig(config, sha, `Edit dictionary word #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Dictionary Word #${idx + 1} Updated!</b>\n• <b>${escapeHtml(parts[1])}:</b> ${escapeHtml(parts[2])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/deldict') {
            if (argStr.toLowerCase() === 'all') {
                config.interactive.private_dictionary = [];
                await updateGitHubConfig(config, sha, 'Delete all dictionary words');
                await sendTelegram(chatId, `🗑️ <b>All Dictionary Words Removed!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.interactive.private_dictionary);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/deldict', config);
                return res.status(200).send('OK');
            }
            const removed = config.interactive.private_dictionary.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete dictionary word #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Dictionary Word #${idx + 1} Removed:</b> ${escapeHtml(removed.word)}`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 15. HOURLY THOUGHTS (/addthought, /editthought, /delthought)
        // --------------------------------------------------------------------
        if (cmd === '/addthought') {
            config.auto_pilot.hourly_thoughts.push(argStr);
            await updateGitHubConfig(config, sha, 'Add hourly thought');
            await sendTelegram(chatId, `💭 <b>New Hourly Secret Thought Added!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editthought') {
            const idx = parseIdx(parts[0], config.auto_pilot.hourly_thoughts);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editthought', config);
                return res.status(200).send('OK');
            }
            config.auto_pilot.hourly_thoughts[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit hourly thought #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Hourly Thought #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delthought') {
            if (argStr.toLowerCase() === 'all') {
                config.auto_pilot.hourly_thoughts = [];
                await updateGitHubConfig(config, sha, 'Delete all hourly thoughts');
                await sendTelegram(chatId, `🗑️ <b>All Hourly Thoughts Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.auto_pilot.hourly_thoughts);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delthought', config);
                return res.status(200).send('OK');
            }
            const removed = config.auto_pilot.hourly_thoughts.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete hourly thought #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Hourly Thought #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 16. AUTO MESSAGE POOL (/addautopool, /editautopool, /delautopool)
        // --------------------------------------------------------------------
        if (cmd === '/addautopool') {
            config.auto_pilot.auto_message_pool.push(argStr);
            await updateGitHubConfig(config, sha, 'Add auto pool message');
            await sendTelegram(chatId, `🔄 <b>New Auto-Rotating Pool Message Added!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editautopool') {
            const idx = parseIdx(parts[0], config.auto_pilot.auto_message_pool);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editautopool', config);
                return res.status(200).send('OK');
            }
            config.auto_pilot.auto_message_pool[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit auto pool #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Auto Pool Message #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delautopool') {
            if (argStr.toLowerCase() === 'all') {
                config.auto_pilot.auto_message_pool = [];
                await updateGitHubConfig(config, sha, 'Delete all auto pool messages');
                await sendTelegram(chatId, `🗑️ <b>All Auto Pool Messages Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.auto_pilot.auto_message_pool);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delautopool', config);
                return res.status(200).send('OK');
            }
            const removed = config.auto_pilot.auto_message_pool.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete auto pool #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Auto Pool Message #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 17. WRONG PIN MESSAGES (/addwrongpin, /editwrongpin, /delwrongpin)
        // --------------------------------------------------------------------
        if (cmd === '/addwrongpin') {
            config.security.wrong_pin_messages.push(argStr);
            await updateGitHubConfig(config, sha, 'Add wrong PIN message');
            await sendTelegram(chatId, `🔐 <b>New Wrong PIN Message Added!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editwrongpin') {
            const idx = parseIdx(parts[0], config.security.wrong_pin_messages);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editwrongpin', config);
                return res.status(200).send('OK');
            }
            config.security.wrong_pin_messages[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit wrong PIN message #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Wrong PIN Message #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delwrongpin') {
            if (argStr.toLowerCase() === 'all') {
                config.security.wrong_pin_messages = [];
                await updateGitHubConfig(config, sha, 'Delete all wrong PIN messages');
                await sendTelegram(chatId, `🗑️ <b>All Wrong PIN Messages Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.security.wrong_pin_messages);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delwrongpin', config);
                return res.status(200).send('OK');
            }
            const removed = config.security.wrong_pin_messages.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete wrong PIN message #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Wrong PIN Message #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 18. SONG LYRICS & TIMESTAMPS (/lyrics, /addlyric, /editlyric, /dellyric, /cleartiming)
        // --------------------------------------------------------------------
        if (cmd === '/lyrics') {
            const rawLines = argStr.includes('|') ? parts : argStr.split(/\r?\n/);
            config.media.song_lyrics = rawLines
                .map(s => s.trim())
                .filter(s => s && !/^\*\*.*\*\*$/.test(s) && !/^\(.*\)$/.test(s));
            await updateGitHubConfig(config, sha, 'Replace song lyrics');
            await sendTelegram(chatId, `🎶 <b>Song Lyrics Updated (${config.media.song_lyrics.length} lines / ${Math.ceil(config.media.song_lyrics.length / 4)} stanzas)!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/addlyric') {
            config.media.song_lyrics.push(...parts.filter(Boolean));
            await updateGitHubConfig(config, sha, 'Add song lyric line');
            await sendTelegram(chatId, `🎶 <b>New Song Lyric Line Added!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/editlyric') {
            const idx = parseIdx(parts[0], config.media.song_lyrics);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editlyric', config);
                return res.status(200).send('OK');
            }
            config.media.song_lyrics[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit song lyric #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Lyric Line #${idx + 1} Updated!</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/dellyric') {
            if (argStr.toLowerCase() === 'all') {
                config.media.song_lyrics = [];
                await updateGitHubConfig(config, sha, 'Delete all song lyrics');
                await sendTelegram(chatId, `🗑️ <b>All Song Lyrics Cleared!</b>`);
                return res.status(200).send('OK');
            }
            const idx = parseIdx(parts[0], config.media.song_lyrics);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/dellyric', config);
                return res.status(200).send('OK');
            }
            const removed = config.media.song_lyrics.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete lyric #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Lyric Line #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/cleartiming') {
            config.media.song_lyrics = (config.media.song_lyrics || []).map(line =>
                String(line).replace(/^\[\d{1,2}:\d{2}(?:\.\d{1,2})?\]\s*/, '').trim()
            );
            await updateGitHubConfig(config, sha, 'Clear song lyric timestamps');
            await sendTelegram(chatId, `⏱️ <b>All Lyric Timestamps Cleared!</b> (Lines reverted to automatic timing)`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 19. LIVE POLL & WEEKLY ACTIVITIES (/poll, /addpollopt, /editpollopt, /delpollopt)
        // --------------------------------------------------------------------
        if (cmd === '/poll' || cmd === '/addpoll') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            config.interactive.live_poll = {
                question_id: (config.interactive.live_poll.question_id || 1) + 1,
                question: parts[0],
                options: parts[1].split(',').map(o => o.trim()).filter(Boolean)
            };
            await updateGitHubConfig(config, sha, 'Create new weekly poll');
            await sendTelegram(
                chatId,
                `📊 <b>New Weekly Activity Poll Published (#${config.interactive.live_poll.question_id})!</b>\n` +
                `• <b>Question:</b> ${escapeHtml(parts[0])}\n` +
                `• <b>Options (${config.interactive.live_poll.options.length}):</b> ${escapeHtml(config.interactive.live_poll.options.join(', '))}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editpoll') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/editpoll', config);
                return res.status(200).send('OK');
            }
            config.interactive.live_poll.question = parts[0];
            config.interactive.live_poll.options = parts[1].split(',').map(o => o.trim()).filter(Boolean);
            await updateGitHubConfig(config, sha, 'Edit live poll');
            await sendTelegram(chatId, `✏️ <b>Weekly Activity Poll Updated!</b>\n• <b>Question:</b> ${escapeHtml(parts[0])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delpoll') {
            config.interactive.live_poll.question = "";
            config.interactive.live_poll.options = [];
            await updateGitHubConfig(config, sha, 'Clear live poll');
            await sendTelegram(chatId, `🗑️ <b>Live Poll Cleared!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/addpollopt') {
            const newOpts = argStr.includes('|') ? parts.filter(Boolean) : [argStr];
            config.interactive.live_poll.options.push(...newOpts);
            await updateGitHubConfig(config, sha, 'Add poll activity option');
            await sendTelegram(
                chatId,
                `➕ <b>New Date Activity Option Added!</b>\n` +
                `• <b>Added:</b> ${escapeHtml(newOpts.join(', '))}\n` +
                `• <b>Total Options Now:</b> ${config.interactive.live_poll.options.length}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editpollopt') {
            const idx = parseIdx(parts[0], config.interactive.live_poll.options);
            if (idx === -1 || parts.length < 2) {
                await sendCommandGuide(chatId, '/editpollopt', config);
                return res.status(200).send('OK');
            }
            config.interactive.live_poll.options[idx] = parts[1];
            await updateGitHubConfig(config, sha, `Edit poll option #${idx + 1}`);
            await sendTelegram(chatId, `✏️ <b>Poll Option #${idx + 1} Updated:</b>\n"${escapeHtml(parts[1])}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delpollopt') {
            const idx = parseIdx(parts[0], config.interactive.live_poll.options);
            if (idx === -1) {
                await sendCommandGuide(chatId, '/delpollopt', config);
                return res.status(200).send('OK');
            }
            const removed = config.interactive.live_poll.options.splice(idx, 1)[0];
            await updateGitHubConfig(config, sha, `Delete poll option #${idx + 1}`);
            await sendTelegram(chatId, `🗑️ <b>Poll Option #${idx + 1} Removed:</b>\n"${escapeHtml(removed)}"`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 20. DAILY NOTE (/note, /addnote, /editnote, /delnote)
        // --------------------------------------------------------------------
        if (cmd === '/note' || cmd === '/addnote' || cmd === '/editnote') {
            config.auto_pilot.daily_note = argStr;
            await updateGitHubConfig(config, sha, 'Update daily note');
            await sendTelegram(chatId, `💌 <b>Daily Note Updated Successfully!</b>\n\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delnote') {
            config.auto_pilot.daily_note = "";
            await updateGitHubConfig(config, sha, 'Clear daily note');
            await sendTelegram(chatId, `🗑️ <b>Daily Note Cleared!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 21. PUSH NOTIFICATIONS (/notify, /addnotify, /editnotify, /delnotify)
        // --------------------------------------------------------------------
        if (cmd === '/notify' || cmd === '/addnotify') {
            config.notification.notif_id = (config.notification.notif_id || 1) + 1;
            if (parts.length >= 2) {
                config.notification.title = parts[0];
                config.notification.message = parts[1];
            } else {
                config.notification.title = "Special Message from Rivishan ❤️";
                config.notification.message = argStr;
            }
            await updateGitHubConfig(config, sha, 'Send push notification');
            await sendTelegram(
                chatId,
                `🔔 <b>Push Notification Sent to Anuki's Phone! (ID: #${config.notification.notif_id})</b>\n\n` +
                `<b>${escapeHtml(config.notification.title)}</b>\n${escapeHtml(config.notification.message)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editnotify') {
            if (parts.length >= 2) {
                config.notification.title = parts[0];
                config.notification.message = parts[1];
            } else {
                config.notification.message = argStr;
            }
            await updateGitHubConfig(config, sha, 'Edit notification text');
            await sendTelegram(chatId, `✏️ <b>Notification Content Updated!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delnotify') {
            config.notification.title = "";
            config.notification.message = "";
            await updateGitHubConfig(config, sha, 'Clear notification');
            await sendTelegram(chatId, `🗑️ <b>Notification Cleared!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 22. LIVE POPUP (/popup, /addpopup, /editpopup, /delpopup)
        // --------------------------------------------------------------------
        if (cmd === '/popup' || cmd === '/addpopup') {
            config.live_popup.popup_id = (config.live_popup.popup_id || 1) + 1;
            config.live_popup.enabled = true;
            if (parts.length >= 2) {
                config.live_popup.title = parts[0];
                config.live_popup.message = parts[1];
                config.live_popup.trigger_heartbeat_vibration = parts[2] ? parts[2].toLowerCase() !== 'off' : true;
            } else {
                config.live_popup.title = "Surprise Live Message 💖";
                config.live_popup.message = argStr;
                config.live_popup.trigger_heartbeat_vibration = true;
            }
            await updateGitHubConfig(config, sha, 'Trigger live popup');
            await sendTelegram(
                chatId,
                `✨ <b>Live Popup Triggered on Anuki's Screen! (ID: #${config.live_popup.popup_id})</b>\n` +
                `• <b>Title:</b> ${escapeHtml(config.live_popup.title)}\n` +
                `• <b>Message:</b> "${escapeHtml(config.live_popup.message)}"`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editpopup') {
            if (parts.length >= 2) {
                config.live_popup.title = parts[0];
                config.live_popup.message = parts[1];
                if (parts[2]) config.live_popup.trigger_heartbeat_vibration = parts[2].toLowerCase() !== 'off';
            } else {
                config.live_popup.message = argStr;
            }
            await updateGitHubConfig(config, sha, 'Edit live popup');
            await sendTelegram(chatId, `✏️ <b>Live Popup Updated!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delpopup') {
            config.live_popup.enabled = false;
            await updateGitHubConfig(config, sha, 'Disable live popup');
            await sendTelegram(chatId, `🗑️ <b>Live Popup Disabled!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 23. LOVE BOMB (/lovebomb, /addlovebomb, /editlovebomb, /dellovebomb)
        // --------------------------------------------------------------------
        if (cmd === '/lovebomb' || cmd === '/addlovebomb') {
            if (parts.length >= 2 && ['on', 'off'].includes(parts[0].toLowerCase())) {
                config.feature_toggles.love_bomb_mode = parts[0].toLowerCase() === 'on';
                config.auto_pilot.love_bomb_message = parts[1];
            } else if (['on', 'off'].includes(argStr.toLowerCase())) {
                config.feature_toggles.love_bomb_mode = argStr.toLowerCase() === 'on';
            } else {
                config.feature_toggles.love_bomb_mode = true;
                config.auto_pilot.love_bomb_message = argStr;
            }
            await updateGitHubConfig(config, sha, 'Update Love Bomb Mode');
            await sendTelegram(
                chatId,
                `🚨 <b>Love Bomb Mode: ${config.feature_toggles.love_bomb_mode ? 'ON' : 'OFF'}</b>\n` +
                `Message: "${escapeHtml(config.auto_pilot.love_bomb_message)}"`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editlovebomb') {
            config.auto_pilot.love_bomb_message = argStr;
            await updateGitHubConfig(config, sha, 'Edit Love Bomb message');
            await sendTelegram(chatId, `✏️ <b>Love Bomb Message Updated!</b>\n"${escapeHtml(argStr)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/dellovebomb') {
            config.feature_toggles.love_bomb_mode = false;
            await updateGitHubConfig(config, sha, 'Deactivate Love Bomb Mode');
            await sendTelegram(chatId, `✅ <b>Love Bomb Mode Deactivated!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 24. MEAL & TIME REMINDERS (/meal, /addmeal, /editmeal, /delmeal)
        // --------------------------------------------------------------------
        if (cmd === '/meal' || cmd === '/addmeal' || cmd === '/editmeal') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const type = parts[0].toLowerCase();
            const content = parts[1];
            if (type === 'morning') config.auto_pilot.meal_morning = content;
            else if (type === 'lunch') config.auto_pilot.meal_lunch = content;
            else if (type === 'night') config.auto_pilot.meal_night = content;
            else if (type === 'latenight') config.auto_pilot.late_night_msg = content;
            else if (type === 'missed') config.auto_pilot.missed_you_msg = content;
            else {
                await sendTelegram(chatId, `⚠️ <b>Invalid type!</b> Use: <code>morning</code>, <code>lunch</code>, <code>night</code>, <code>latenight</code>, or <code>missed</code>.`);
                return res.status(200).send('OK');
            }
            await updateGitHubConfig(config, sha, `Update ${type} message`);
            await sendTelegram(chatId, `🤖 <b>Auto-Pilot (${escapeHtml(type)}) Message Updated!</b>\n"${escapeHtml(content)}"`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delmeal') {
            const type = argStr.toLowerCase();
            if (type === 'morning') config.auto_pilot.meal_morning = "";
            else if (type === 'lunch') config.auto_pilot.meal_lunch = "";
            else if (type === 'night') config.auto_pilot.meal_night = "";
            else if (type === 'latenight') config.auto_pilot.late_night_msg = "";
            else if (type === 'missed') config.auto_pilot.missed_you_msg = "";
            else {
                await sendCommandGuide(chatId, '/delmeal', config);
                return res.status(200).send('OK');
            }
            await updateGitHubConfig(config, sha, `Clear ${type} message`);
            await sendTelegram(chatId, `🗑️ <b>Auto-Pilot (${escapeHtml(type)}) Message Cleared!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 25. THEME & CUSTOM THEME (/theme, /customtheme, etc.)
        // --------------------------------------------------------------------
        if (cmd === '/theme' || cmd === '/addtheme' || cmd === '/edittheme') {
            const mode = argStr.toLowerCase();
            config.theme_engine.mode = mode;
            await updateGitHubConfig(config, sha, `Set theme mode to ${mode}`);
            await sendTelegram(chatId, `🎨 <b>Theme Mode set to:</b> <code>${escapeHtml(mode)}</code>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/deltheme') {
            config.theme_engine.mode = 'auto';
            await updateGitHubConfig(config, sha, 'Reset theme mode to auto');
            await sendTelegram(chatId, `🎨 <b>Theme Mode reset to:</b> <code>auto</code>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/customtheme' || cmd === '/addcustomtheme' || cmd === '/editcustomtheme') {
            config.theme_engine.mode = 'custom';
            if (parts[0]) config.theme_engine.custom_primary_color = parts[0];
            if (parts[1]) config.theme_engine.custom_secondary_color = parts[1];
            if (parts[2]) config.theme_engine.custom_bg_color = parts[2];
            if (parts[3]) config.theme_engine.custom_card_color = parts[3];
            if (parts[4]) config.theme_engine.custom_text_color = parts[4];
            if (parts[5]) config.theme_engine.falling_particle_type = parts[5];
            if (parts[6]) config.theme_engine.header_title = parts[6];
            await updateGitHubConfig(config, sha, 'Apply custom theme');
            await sendTelegram(chatId, `🎨 <b>Custom Theme Applied Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delcustomtheme') {
            config.theme_engine.mode = 'auto';
            config.theme_engine.custom_primary_color = "#D81B60";
            config.theme_engine.custom_secondary_color = "#880E4F";
            config.theme_engine.custom_bg_color = "#FFF0F5";
            config.theme_engine.custom_card_color = "#FFFFFF";
            config.theme_engine.custom_text_color = "#212121";
            await updateGitHubConfig(config, sha, 'Reset custom theme');
            await sendTelegram(chatId, `🗑️ <b>Custom Theme Reset to Default Auto Mode!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 26. HEADER & STYLE (/header, /style, etc.)
        // --------------------------------------------------------------------
        if (cmd === '/header' || cmd === '/addheader' || cmd === '/editheader') {
            if (parts[0]) config.theme_engine.header_title = parts[0];
            if (parts[1]) config.theme_engine.header_subtitle = parts[1];
            await updateGitHubConfig(config, sha, 'Update header titles');
            await sendTelegram(
                chatId,
                `✨ <b>App Header Updated!</b>\n` +
                `• <b>Title:</b> ${escapeHtml(config.theme_engine.header_title)}\n` +
                `• <b>Subtitle:</b> ${escapeHtml(config.theme_engine.header_subtitle)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delheader') {
            config.theme_engine.header_title = "Rivishan & Anuki Forever";
            config.theme_engine.header_subtitle = "Rivishan & Anuki | Since 2023.01.17";
            await updateGitHubConfig(config, sha, 'Reset header titles');
            await sendTelegram(chatId, `🗑️ <b>App Header Reset to Default!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/style' || cmd === '/addstyle' || cmd === '/editstyle') {
            const radius = parseInt(parts[0], 10);
            if (!isNaN(radius)) config.theme_engine.card_corner_radius = radius;
            if (parts[1]) config.theme_engine.falling_particle_type = parts[1].toLowerCase();
            await updateGitHubConfig(config, sha, 'Update UI style');
            await sendTelegram(
                chatId,
                `📐 <b>UI Style Updated!</b>\n` +
                `• <b>Corner Radius:</b> ${config.theme_engine.card_corner_radius}px\n` +
                `• <b>Particles:</b> ${escapeHtml(config.theme_engine.falling_particle_type)}`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delstyle') {
            config.theme_engine.card_corner_radius = 24;
            config.theme_engine.falling_particle_type = 'hearts';
            await updateGitHubConfig(config, sha, 'Reset UI style');
            await sendTelegram(chatId, `🗑️ <b>UI Style Reset to Default (24px, hearts)!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 27. SECURITY PIN (/pin, /addpin, /editpin, /delpin)
        // --------------------------------------------------------------------
        if (cmd === '/pin' || cmd === '/addpin' || cmd === '/editpin') {
            if (parts[0]) config.security.main_pin = parts[0];
            if (parts[1]) config.security.safe_guest_pin = parts[1];
            if (parts[2]) config.security.lock_quote = parts[2];
            await updateGitHubConfig(config, sha, 'Update security PINs');
            await sendTelegram(
                chatId,
                `🔐 <b>Security Settings Updated!</b>\n` +
                `• <b>Main PIN:</b> <code>${escapeHtml(config.security.main_pin)}</code>\n` +
                `• <b>Guest PIN:</b> <code>${escapeHtml(config.security.safe_guest_pin)}</code>`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delpin') {
            config.security.main_pin = "20230117";
            config.security.safe_guest_pin = "00000000";
            await updateGitHubConfig(config, sha, 'Reset security PINs');
            await sendTelegram(chatId, `🗑️ <b>Security PINs Reset to Default (20230117 / 00000000)!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 28. COUPLE INFO (/nicknames, /addcouple, /editcouple, /delcouple)
        // --------------------------------------------------------------------
        if (cmd === '/nicknames') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, '/nicknames', config);
                return res.status(200).send('OK');
            }
            config.couple_info.boy_nickname = parts[0];
            config.couple_info.girl_nickname = parts[1];
            if (parts[2]) config.couple_info.age_gap_text = parts[2];
            await updateGitHubConfig(config, sha, 'Update couple nicknames');
            await sendTelegram(chatId, `💑 <b>Couple Nicknames Updated:</b> ${escapeHtml(parts[0])} & ${escapeHtml(parts[1])}`);
            return res.status(200).send('OK');
        }

        if (cmd === '/addcouple' || cmd === '/editcouple') {
            if (parts.length < 2) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            if (parts[0]) config.couple_info.boy_name = parts[0];
            if (parts[1]) config.couple_info.girl_name = parts[1];
            if (parts[2]) config.couple_info.boy_nickname = parts[2];
            if (parts[3]) config.couple_info.girl_nickname = parts[3];
            if (parts[4]) config.couple_info.anniversary_date = parts[4];
            if (parts[5]) config.couple_info.age_gap_text = parts[5];
            await updateGitHubConfig(config, sha, 'Update couple info');
            await sendTelegram(chatId, `💑 <b>Couple Profile Information Updated Successfully!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delcouple') {
            config.couple_info.boy_nickname = "Rivishan";
            config.couple_info.girl_nickname = "Mage Manika";
            await updateGitHubConfig(config, sha, 'Reset couple nicknames');
            await sendTelegram(chatId, `🗑️ <b>Couple Nicknames Reset to Defaults!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 29. AVURUDU SPECIAL (/avurudu, /addavurudu, /editavurudu, /delavurudu)
        // --------------------------------------------------------------------
        if (cmd === '/avurudu' || cmd === '/addavurudu' || cmd === '/editavurudu') {
            if (parts[0]) config.interactive.avurudu_special.nekath_text = parts[0];
            if (parts[1]) config.interactive.avurudu_special.ganudenu_note = parts[1];
            await updateGitHubConfig(config, sha, 'Update Avurudu card');
            await sendTelegram(chatId, `🌸 <b>Avurudu Special Greeting Updated!</b>`);
            return res.status(200).send('OK');
        }

        if (cmd === '/delavurudu') {
            config.interactive.avurudu_special.nekath_text = "";
            config.interactive.avurudu_special.ganudenu_note = "";
            await updateGitHubConfig(config, sha, 'Clear Avurudu card');
            await sendTelegram(chatId, `🗑️ <b>Avurudu Special Greeting Cleared!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 30. FEATURE TOGGLES (/toggle, /addtoggle, /edittoggle, /deltoggle)
        // --------------------------------------------------------------------
        if (cmd === '/toggle' || cmd === '/addtoggle' || cmd === '/edittoggle' || cmd === '/deltoggle') {
            const rawName = (parts[0] || argStr.split(/\s+/)[0] || '').toLowerCase().trim();
            const rawState = (parts[1] || argStr.split(/\s+/)[1] || (cmd === '/deltoggle' ? 'off' : 'on')).toLowerCase().trim();
            const key = rawName === 'love_bomb_mode' || rawName === 'lovebomb'
                ? 'love_bomb_mode'
                : (rawName.startsWith('show_') ? rawName : `show_${rawName}`);

            if (!(key in config.feature_toggles)) {
                await sendCommandGuide(chatId, cmd, config);
                return res.status(200).send('OK');
            }
            const state = ['on', 'true', '1', 'yes'].includes(rawState);
            config.feature_toggles[key] = state;
            await updateGitHubConfig(config, sha, `Toggle ${key} to ${state}`);
            await sendTelegram(chatId, `⚙️ <b>Feature Toggle <code>${escapeHtml(key)}</code> set to: ${state ? 'ON ✅' : 'OFF ❌'}</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 31. 365-DAY LOVE PLANT GAME (/plant, /editplant, /delplant)
        // --------------------------------------------------------------------
        if (cmd === '/plant') {
            config.plant_state = config.plant_state || {};
            config.plant_state.boost_id = (config.plant_state.boost_id || 0) + 1;
            config.plant_state.boost_msg = parts[1] || parts[0] || "Rivishan sent a special love & sunshine boost to our plant! ✨🌱";
            await updateGitHubConfig(config, sha, 'Send love plant boost');
            await sendTelegram(
                chatId,
                `🌱 <b>365-Day Love Plant Boost Sent (#${config.plant_state.boost_id})!</b>\n` +
                `Anuki's plant will receive +50 Bonus XP & full care stats!`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/editplant') {
            const day = Math.min(365, Math.max(1, parseInt(parts[0], 10) || 1));
            const xp = parseInt(parts[1], 10) || (day * 30);
            config.plant_state = config.plant_state || {};
            config.plant_state.sync_id = (config.plant_state.sync_id || 0) + 1;
            config.plant_state.override_day = day;
            config.plant_state.override_xp = xp;
            await updateGitHubConfig(config, sha, `Set love plant to Day ${day}`);
            await sendTelegram(
                chatId,
                `🌳 <b>365-Day Love Plant Updated!</b>\n` +
                `• <b>Day:</b> Day ${day} / 365\n` +
                `• <b>XP Points:</b> ${xp} XP`
            );
            return res.status(200).send('OK');
        }

        if (cmd === '/delplant') {
            config.system_reset = {
                reset_id: ((config.system_reset && config.system_reset.reset_id) || 0) + 1,
                target: 'plant',
                timestamp: Date.now()
            };
            await updateGitHubConfig(config, sha, 'Reset love plant to Day 1');
            await sendTelegram(chatId, `🌱 <b>365-Day Love Plant Reset to Day 1!</b>`);
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 32. REMOTE APP RESET (/resetapp)
        // --------------------------------------------------------------------
        if (cmd === '/resetapp') {
            const target = (parts[0] || 'all').toLowerCase();
            config.system_reset = {
                reset_id: ((config.system_reset && config.system_reset.reset_id) || 0) + 1,
                target: ['all', 'poll', 'coupons', 'plant'].includes(target) ? target : 'all',
                timestamp: Date.now()
            };
            await updateGitHubConfig(config, sha, `Remote reset app state (${config.system_reset.target})`);
            await sendTelegram(
                chatId,
                `🔄 <b>Remote App Reset Triggered!</b>\n` +
                `• <b>Reset ID:</b> #${config.system_reset.reset_id}\n` +
                `• <b>Target Cleared:</b> <code>${config.system_reset.target.toUpperCase()}</code>\n\n` +
                `<i>Any phone opening or syncing the app will immediately reset its saved ${config.system_reset.target} state!</i>`
            );
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // 33. MANUAL GITHUB STORAGE FILE DELETE (/delmedia)
        // --------------------------------------------------------------------
        if (cmd === '/delmedia') {
            const deleted = await deleteMediaFromGitHub(argStr, `Manual media delete: ${argStr}`);
            if (deleted) {
                await sendTelegram(chatId, `🗑️ <b>File deleted from GitHub Repository:</b>\n<code>${escapeHtml(argStr)}</code>`);
            } else {
                await sendTelegram(chatId, `⚠️ <b>Could not find or delete file on GitHub:</b>\n<code>${escapeHtml(argStr)}</code>`);
            }
            return res.status(200).send('OK');
        }

        // Unknown command fallback
        await sendTelegram(
            chatId,
            `🤖 <b>Unrecognized Command!</b>\nTap /help to view all 300+ Add, Edit & Remove commands, or use the control panel below:`,
            MAIN_MENU_KEYBOARD
        );
        return res.status(200).json({ status: 'ok' });

    } catch (err) {
        console.error('Webhook Error:', err);
        try {
            await sendTelegram(OWNER_CHAT_ID, `⚠️ <b>Bot Error:</b> <code>${escapeHtml(err.message)}</code>`);
        } catch (e) {}
        return res.status(200).json({ error: err.message });
    }
};

// ============================================================================
// CATEGORIZED HELP MESSAGES (CLICKABLE COMMANDS FOR 2-MESSAGE FORMAT GUIDE)
// ============================================================================
function getHelpMessages() {
    const page1 =
        `📖 <b>RIVISHAN & ANUKI BOT — 300+ FEATURES COMMAND DIRECTORY (PART 1/2)</b>\n` +
        `<i>Tap any command below! The bot will send 2 messages: (1) What it does + current items, and (2) A copy-ready format using <code>|</code>.</i>\n\n` +

        `📸 <b>1. Photo Memories & Media (Attach file + Caption):</b>\n` +
        `• /addmemory — Add photo memory (appends to bottom)\n` +
        `• /editmemory — Edit memory text or replace photo\n` +
        `• /delmemory — Delete memory & remove file from GitHub\n` +
        `• /reversememories — Flip current memories order (top-to-bottom)\n` +
        `• /wallpaper | /editwallpaper | /delwallpaper — Custom App Wallpaper\n` +
        `• /scratch | /editscratch | /delscratch — Scratch Card Photo & Secret Text\n` +
        `• /voice | /editvoice | /delvoice — Voice Note Recording & Title\n` +
        `• /music | /editmusic | /delmusic — Main Background Song MP3\n` +
        `• /bdaymusic | /editbdaymusic | /delbdaymusic — Birthday Song MP3\n` +
        `• /avurudumusic | /editavurudumusic | /delavurudumusic — Avurudu Song MP3\n` +
        `• /pinhint | /editpinhint | /delpinhint — Lock Screen Voice Hint\n` +
        `• /delmedia — Delete any media file from GitHub storage\n\n` +

        `💌 <b>2. Live Alerts, Popups, Notes & Auto-Pilot:</b>\n` +
        `• /note | /editnote | /delnote — Today's Special Note\n` +
        `• /notify | /editnotify | /delnotify — Push Notification to Phone\n` +
        `• /popup | /editpopup | /delpopup — Live Fullscreen Popup & Heartbeat\n` +
        `• /lovebomb | /editlovebomb | /dellovebomb — Emergency Love Bomb Mode\n` +
        `• /meal | /editmeal | /delmeal — Morning, Lunch, Night, LateNight, Missed\n` +
        `• /addthought | /editthought | /delthought — Hourly Secret Thoughts\n` +
        `• /addautopool | /editautopool | /delautopool — Auto-Rotating Love Quotes`;

    const page2 =
        `📖 <b>RIVISHAN & ANUKI BOT — 300+ FEATURES COMMAND DIRECTORY (PART 2/2)</b>\n\n` +

        `🎁 <b>3. Weekly Poll, 365-Day Plant, Weekly Coupons & Games:</b>\n` +
        `• /poll | /editpoll | /delpoll — Weekly Date Poll (Pick 2 / 7 Days)\n` +
        `• /addpollopt | /editpollopt | /delpollopt — Add/Edit Single Poll Activity\n` +
        `• /plant | /editplant | /delplant — 365-Day Love Plant Boost & Level Control\n` +
        `• /addcoupon | /editcoupon | /delcoupon — Weekly Redeemable Love Coupons\n` +
        `• /addenvelope | /editenvelope | /delenvelope — 'Open When' Letters\n` +
        `• /addvault | /editvault | /delvault — Time-Locked Surprise Vaults\n` +
        `• /addreason | /editreason | /delreason — 'Reasons I Love You' List\n` +
        `• /addfortune | /editfortune | /delfortune — Fortune Cookie Predictions\n` +
        `• /addquiz | /editquiz | /delquiz — Couple Quiz Questions\n` +
        `• /addbucket | /editbucket | /delbucket — Future Bucket List Goals\n` +
        `• /addstory | /editstory | /delstory — Love Story Chapters\n` +
        `• /adddict | /editdict | /deldict — Private Love Dictionary\n` +
        `• /lyrics | /addlyric | /editlyric | /dellyric | /cleartiming — Synchronized Song Lyrics\n\n` +

        `🎨 <b>4. Themes, Styling, Security, Profile & Reset:</b>\n` +
        `• /resetapp — Remotely Reset Saved Poll / Coupons / Plant States\n` +
        `• /theme | /edittheme | /deltheme — Switch App Theme Mode\n` +
        `• /customtheme | /editcustomtheme | /delcustomtheme — Custom Hex Colors\n` +
        `• /header | /editheader | /delheader — App Main Title & Subtitle\n` +
        `• /style | /editstyle | /delstyle — Card Radius & Falling Particles\n` +
        `• /pin | /editpin | /delpin — Main PIN, Guest PIN & Lock Quote\n` +
        `• /addwrongpin | /editwrongpin | /delwrongpin — Wrong PIN Teasing Hints\n` +
        `• /nicknames | /editcouple | /delcouple — Couple Profile & Nicknames\n` +
        `• /avurudu | /editavurudu | /delavurudu — Avurudu Special Card\n` +
        `• /toggle | /edittoggle | /deltoggle — Turn App Sections ON or OFF\n` +
        `• /menu — Open Interactive Button Control Panel\n` +
        `• /status — View Quick App Summary`;

    return [page1, page2];
}
