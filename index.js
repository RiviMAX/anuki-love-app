// ============================================================================
// RIVISHAN & ANUKI LOVE APP - MASTER TELEGRAM BOT & APP WEBHOOK SERVER (100 FEATURES)
// ============================================================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'RiviMAX/anuki-love-app';
const GITHUB_PATH = 'config.json';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID || '8612674999';

// 1. GitHub වෙතින් config.json ලබාගැනීම
async function getGitHubConfig() {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    if (!res.ok) throw new Error(`GitHub Read Error: ${res.status}`);
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { json: JSON.parse(content), sha: data.sha };
}

// 2. GitHub වෙත config.json යාවත්කාලීන කිරීම
async function updateGitHubConfig(newConfig, sha, commitMessage) {
    newConfig.app_version = (newConfig.app_version || 1) + 1;
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const contentEncoded = Buffer.from(JSON.stringify(newConfig, null, 2), 'utf8').toString('base64');

    const res = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: commitMessage,
            content: contentEncoded,
            sha: sha
        })
    });
    if (!res.ok) throw new Error(`GitHub Write Error: ${res.status}`);
    return await res.json();
}

// 3. Telegram වෙතින් එවන Photos/Voice/Music කෙලින්ම GitHub වෙත Upload කිරීම
async function uploadMediaToGitHub(fileId, folder, fileName, commitMsg) {
    const fileInfoRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) throw new Error('Telegram file fetch failed');

    const filePath = fileInfo.result.file_path;
    const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`);
    const arrayBuffer = await fileRes.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');

    const gitPath = `${folder}/${fileName}`;
    const gitUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${gitPath}`;

    // පවතින ගොනුවක් නම් SHA ලබාගැනීම
    let existingSha = undefined;
    const checkRes = await fetch(gitUrl, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Anuki-Love-Bot' }
    });
    if (checkRes.ok) {
        const existingData = await checkRes.json();
        existingSha = existingData.sha;
    }

    const bodyObj = { message: commitMsg, content: base64Content };
    if (existingSha) bodyObj.sha = existingSha;

    const uploadRes = await fetch(gitUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'User-Agent': 'Anuki-Love-Bot',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyObj)
    });

    if (!uploadRes.ok) throw new Error('GitHub Media Upload Failed');
    return `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${gitPath}`;
}

// 4. Telegram වෙත පණිවිඩ සහ බටන් (Inline Keyboards) යැවීම
async function sendTelegram(chatId, text, replyMarkup = null) {
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// 5. ප්‍රධාන Control Panel බටන් මෙනුව
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
            { text: "📖 All 100 Features Commands List", callback_data: "show_help" }
        ]
    ]
};

// ============================================================================
// MAIN SERVERLESS HANDLER
// ============================================================================
module.exports = async (req, res) => {
    // Browser එකෙන් පරීක්ෂා කරන විට පෙන්වන පණිවිඩය
    if (req.method !== 'POST') {
        return res.status(200).json({
            status: "Active",
            server: "Rivishan & Anuki 100-Features Master Bot Server",
            repo: GITHUB_REPO
        });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // --------------------------------------------------------------------
        // PART A: ANUKI ගේ ANDROID APP එකෙන් එන LIVE ALERTS සහ REPLIES
        // --------------------------------------------------------------------
        if (body && body.source === 'anuki_app') {
            const event = body.event || 'activity';
            const data = body.data || '';
            const time = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

            let alertMsg = `🌸 <b>Anuki App Live Alert!</b>\n🕒 <i>${time}</i>\n\n`;

            if (event === 'app_opened') {
                alertMsg += `📱 <b>Anuki දැන් App එක Open කළා!</b>`;
            } else if (event === 'wrong_pin') {
                alertMsg += `🔐 <b>වැරදි PIN අංකයක් ඇතුළත් කළා!</b>\nEntered: <code>${data}</code>`;
            } else if (event === 'mood_selected') {
                alertMsg += `💭 <b>Anuki එයාගේ Mood එක තේරුවා:</b> ${data}`;
            } else if (event === 'quick_love') {
                alertMsg += `💝 <b>Anuki ඔයාට Quick Love Alert එකක් එව්වා:</b>\n👉 <b>${data}</b>`;
            } else if (event === 'direct_reply') {
                alertMsg += `💌 <b>Anuki ඔයාට App එකෙන් පණිවිඩයක් එව්වා:</b>\n\n"${data}"`;
            } else if (event === 'coupon_redeemed') {
                alertMsg += `🎟️ <b>Anuki ආදර කූපනයක් (Coupon) පාවිච්චි කළා!</b>\nCoupon: <b>${data}</b>`;
            } else if (event === 'cake_blown') {
                alertMsg += `🎂 <b>Anuki කේක් එකේ ඉටිපන්දම කටින් පිඹලා නිව්වා!</b>`;
            } else if (event === 'envelope_opened') {
                alertMsg += `✉️ <b>Anuki රහස් ලියුම් කවරයක් විවෘත කළා:</b>\n"${data}"`;
            } else if (event === 'poll_answer') {
                alertMsg += `📊 <b>Anuki ඔයාගේ ප්‍රශ්නයට (Poll) පිළිතුරු දුන්නා:</b>\n👉 ${data}`;
            } else if (event === 'touch_link') {
                alertMsg += `💓 <b>Anuki දැන් තිරයේ Heartbeat Touch Link එක අල්ලගෙන ඉන්නවා!</b>`;
            } else if (event === 'battery_low') {
                alertMsg += `🪫 <b>Anuki ගේ දුරකථනයේ බැටරි මට්ටම අඩුයි:</b> ${data}%`;
            } else if (event === 'time_capsule') {
                alertMsg += `⏳ <b>Anuki අනාගත කාල කැප්සියුලයට පණිවිඩයක් ලිව්වා:</b>\n"${data}"`;
            } else {
                alertMsg += `✨ <b>Activity:</b> ${event}\n${data}`;
            }

            await sendTelegram(OWNER_CHAT_ID, alertMsg);
            return res.status(200).json({ ok: true });
        }

        // --------------------------------------------------------------------
        // PART B: TELEGRAM INLINE BUTTON CLICKS (CALLBACK QUERIES)
        // --------------------------------------------------------------------
        if (body && body.callback_query) {
            const cb = body.callback_query;
            const chatId = cb.message.chat.id.toString();
            const action = cb.data;

            if (chatId !== OWNER_CHAT_ID) {
                return res.status(200).send('OK');
            }

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
                    config.theme_engine.header_title = "සුබ අලුත් අවුරුද්දක් වේවා මගේ මැණික!";
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
                await sendTelegram(chatId, `✅ <b>Theme Mode වෙනස් වුණා:</b> <code>${mode.toUpperCase()}</code>`);
            } else if (action === 'lovebomb_on') {
                config.feature_toggles.love_bomb_mode = true;
                config.notification.notif_id += 1;
                config.notification.title = "Rivishan ඔයාට ගොඩක් ආදරෙයි!";
                config.notification.message = config.auto_pilot.love_bomb_message;
                await updateGitHubConfig(config, sha, 'Activate Love Bomb Mode');
                await sendTelegram(chatId, `🚨 <b>Emergency Love Bomb Mode සක්‍රිය කළා!</b> Anuki ගේ හිත හැදෙන පණිවිඩ දැන් App එකේ පෙන්වයි.`);
            } else if (action === 'lovebomb_off') {
                config.feature_toggles.love_bomb_mode = false;
                await updateGitHubConfig(config, sha, 'Deactivate Love Bomb Mode');
                await sendTelegram(chatId, `✅ <b>Love Bomb Mode සාමාන්‍ය තත්ත්වයට පත් කළා.</b>`);
            } else if (action === 'send_pulse') {
                config.live_popup.popup_id += 1;
                config.live_popup.enabled = true;
                config.live_popup.title = "Heartbeat From Rivishan";
                config.live_popup.message = "මේ මොහොතේ මගේ හදවත ගැහෙන්නේ ඔයා වෙනුවෙන්මයි මැණික...";
                config.live_popup.trigger_heartbeat_vibration = true;
                await updateGitHubConfig(config, sha, 'Send Remote Heartbeat Pulse');
                await sendTelegram(chatId, `💓 <b>Heartbeat Vibration & Live Popup එක Anuki ගේ App එකට යැව්වා!</b>`);
            } else if (action === 'app_status') {
                const statusText = `📊 <b>Rivishan & Anuki App Status</b>\n\n` +
                    `• <b>App Config Version:</b> v${config.app_version}\n` +
                    `• <b>Current Theme:</b> ${config.theme_engine.mode}\n` +
                    `• <b>Header:</b> ${config.theme_engine.header_title}\n` +
                    `• <b>Main PIN:</b> <code>${config.security.main_pin}</code>\n` +
                    `• <b>Memories Count:</b> ${config.memories.length}\n` +
                    `• <b>Envelopes Count:</b> ${config.envelopes.length}\n` +
                    `• <b>Coupons Count:</b> ${config.coupons.length}\n` +
                    `• <b>Quiz Count:</b> ${config.quiz.length}\n` +
                    `• <b>Notification ID:</b> ${config.notification.notif_id}`;
                await sendTelegram(chatId, statusText);
            } else if (action === 'show_help') {
                await sendTelegram(chatId, getHelpMessage());
            }

            // Callback acknowledgement
            await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id })
            });
            return res.status(200).send('OK');
        }

        // --------------------------------------------------------------------
        // PART C: TELEGRAM MESSAGES, COMMANDS & MEDIA UPLOADS
        // --------------------------------------------------------------------
        if (!body || !body.message) return res.status(200).send('OK');

        const msg = body.message;
        const chatId = msg.chat.id.toString();

        // ආරක්ෂාව: Rivishan (8612674999) ට පමණක් පාලනය කළ හැක
        if (chatId !== OWNER_CHAT_ID) {
            await sendTelegram(chatId, "⚠️ <b>Access Denied!</b> This private bot belongs to Rivishan (for Anuki).");
            return res.status(200).send('Unauthorized');
        }

        // 1. PHOTO UPLOAD (Memories / Wallpaper / Scratch Card)
        if (msg.photo && msg.photo.length > 0) {
            const bestPhoto = msg.photo[msg.photo.length - 1];
            const caption = (msg.caption || '').trim();
            const fileName = `img_${Date.now()}.jpg`;

            await sendTelegram(chatId, "⏳ <i>Photo එක GitHub වෙත Upload වෙමින් පවතී...</i>");
            const rawUrl = await uploadMediaToGitHub(bestPhoto.file_id, 'images', fileName, 'Upload photo via Telegram Bot');
            const { json: config, sha } = await getGitHubConfig();

            if (caption.toLowerCase().startsWith('wallpaper')) {
                config.theme_engine.custom_wallpaper_url = rawUrl;
                await updateGitHubConfig(config, sha, 'Update custom wallpaper');
                await sendTelegram(chatId, `🖼️ <b>App Background Wallpaper එක සාර්ථකව අලුත් කළා!</b>`);
            } else if (caption.toLowerCase().startsWith('scratch')) {
                const secretText = caption.includes('|') ? caption.split('|')[1].trim() : config.interactive.scratch_card_text;
                config.interactive.scratch_card_image = rawUrl;
                config.interactive.scratch_card_text = secretText;
                await updateGitHubConfig(config, sha, 'Update scratch card photo');
                await sendTelegram(chatId, `🪙 <b>Scratch Card රහස් පින්තූරය සහ පණිවිඩය අලුත් කළා!</b>`);
            } else {
                // Format: Date | Title | Description (හෝ සාමාන්‍ය Caption එකක්)
                const parts = caption.split('|').map(s => s.trim());
                const newMemory = {
                    date: parts.length >= 3 ? parts[0] : new Date().toISOString().split('T')[0],
                    title: parts.length >= 3 ? parts[1] : (parts[0] || "අපේ සුන්දර මතකයක්"),
                    description: parts.length >= 3 ? parts[2] : (parts[1] || caption || "අමතක නොවන ආදරණීය මොහොතක්."),
                    image_url: rawUrl
                };
                config.memories.unshift(newMemory);
                await updateGitHubConfig(config, sha, 'Add new photo memory');
                await sendTelegram(chatId, `📸 <b>අලුත් Memory Photo එකක් App එකට එකතු කළා!</b>\n\n• <b>Date:</b> ${newMemory.date}\n• <b>Title:</b> ${newMemory.title}\n• <b>Desc:</b> ${newMemory.description}`);
            }
            return res.status(200).send('OK');
        }

        // 2. VOICE NOTE OR AUDIO UPLOAD (Voice Message / Background Music)
        if (msg.voice || msg.audio) {
            const isVoice = !!msg.voice;
            const fileId = isVoice ? msg.voice.file_id : msg.audio.file_id;
            const caption = (msg.caption || '').trim();
            const folder = isVoice ? 'voice' : 'music';
            const fileName = `${isVoice ? 'voice' : 'song'}_${Date.now()}.mp3`;

            await sendTelegram(chatId, "⏳ <i>Audio ගොනුව GitHub වෙත Upload වෙමින් පවතී...</i>");
            const rawUrl = await uploadMediaToGitHub(fileId, folder, fileName, 'Upload audio via Telegram Bot');
            const { json: config, sha } = await getGitHubConfig();

            if (isVoice || caption.toLowerCase().startsWith('voice')) {
                config.media.voice_note_url = rawUrl;
                if (caption) config.media.voice_note_title = caption.replace(/^voice\s*\|?\s*/i, '');
                await updateGitHubConfig(config, sha, 'Update voice note');
                await sendTelegram(chatId, `🎙️ <b>ඔයාගේ අලුත් Voice Note එක App එකට ඇතුළත් කළා!</b>`);
            } else if (caption.toLowerCase().startsWith('bday')) {
                config.media.birthday_music_url = rawUrl;
                await updateGitHubConfig(config, sha, 'Update birthday music');
                await sendTelegram(chatId, `🎂 <b>Birthday Background සින්දුව අලුත් කළා!</b>`);
            } else {
                config.media.bg_music_url = rawUrl;
                await updateGitHubConfig(config, sha, 'Update background music');
                await sendTelegram(chatId, `🎵 <b>App එකේ ප්‍රධාන Background සින්දුව අලුත් කළා!</b>`);
            }
            return res.status(200).send('OK');
        }

        // 3. TEXT COMMANDS HANDLING
        const text = (msg.text || '').trim();
        if (!text) return res.status(200).send('OK');

        if (text === '/start' || text === '/menu') {
            await sendTelegram(
                chatId,
                `👑 <b>Welcome Rivishan! (Anuki Love App Master Control)</b>\n\n` +
                `ඔයාගේ Bot දැන් 100%ක් සාර්ථකව GitHub සහ App එක සමඟ සම්බන්ධ වී ඇත.\n` +
                `පහත Buttons වලින් හෝ Commands වලින් මුළු App එකම APK Update නොකර පාලනය කරන්න:`,
                MAIN_MENU_KEYBOARD
            );
            return res.status(200).send('OK');
        }

        if (text === '/help' || text === '/commands') {
            await sendTelegram(chatId, getHelpMessage());
            return res.status(200).send('OK');
        }

        const { json: config, sha } = await getGitHubConfig();

        // --- COMMAND 1: /note [text] ---
        if (text.startsWith('/note ')) {
            const val = text.substring(6).trim();
            config.auto_pilot.daily_note = val;
            await updateGitHubConfig(config, sha, 'Update daily note');
            await sendTelegram(chatId, `💌 <b>Daily Secret Note අලුත් කළා:</b>\n\n"${val}"`);
        }

        // --- COMMAND 2: /notify [Title | Message] or /notify [Message] ---
        else if (text.startsWith('/notify ')) {
            const raw = text.substring(8).trim();
            const parts = raw.split('|').map(s => s.trim());
            config.notification.notif_id += 1;
            if (parts.length >= 2) {
                config.notification.title = parts[0];
                config.notification.message = parts[1];
            } else {
                config.notification.title = "Rivishan ගෙන් පණිවිඩයක් ❤️";
                config.notification.message = raw;
            }
            await updateGitHubConfig(config, sha, 'Send push notification');
            await sendTelegram(chatId, `🔔 <b>Notification එක Anuki ගේ Phone එකට යැව්වා! (ID: #${config.notification.notif_id})</b>\n\n<b>${config.notification.title}</b>\n${config.notification.message}`);
        }

        // --- COMMAND 3: /popup [Title | Message] or /popup [Message] ---
        else if (text.startsWith('/popup ')) {
            const raw = text.substring(7).trim();
            const parts = raw.split('|').map(s => s.trim());
            config.live_popup.popup_id += 1;
            config.live_popup.enabled = true;
            config.live_popup.trigger_heartbeat_vibration = true;
            if (parts.length >= 2) {
                config.live_popup.title = parts[0];
                config.live_popup.message = parts[1];
            } else {
                config.live_popup.title = "Surprise Live Message 💖";
                config.live_popup.message = raw;
            }
            await updateGitHubConfig(config, sha, 'Trigger live popup');
            await sendTelegram(chatId, `✨ <b>Live Popup එක Anuki ගේ තිරයට යැව්වා!</b>\n"${config.live_popup.message}"`);
        }

        // --- COMMAND 4: /theme [mode] ---
        else if (text.startsWith('/theme ')) {
            const mode = text.substring(7).trim().toLowerCase();
            config.theme_engine.mode = mode;
            await updateGitHubConfig(config, sha, `Set theme mode to ${mode}`);
            await sendTelegram(chatId, `🎨 <b>Theme Mode එක <code>${mode}</code> ලෙස වෙනස් කළා!</b>`);
        }

        // --- COMMAND 5: /customtheme #Primary | #Bg | #Card | #Text | particle | Header Title ---
        else if (text.startsWith('/customtheme ')) {
            const parts = text.substring(13).split('|').map(s => s.trim());
            config.theme_engine.mode = 'custom';
            if (parts[0]) config.theme_engine.custom_primary_color = parts[0];
            if (parts[1]) config.theme_engine.custom_bg_color = parts[1];
            if (parts[2]) config.theme_engine.custom_card_color = parts[2];
            if (parts[3]) config.theme_engine.custom_text_color = parts[3];
            if (parts[4]) config.theme_engine.falling_particle_type = parts[4];
            if (parts[5]) config.theme_engine.header_title = parts[5];
            await updateGitHubConfig(config, sha, 'Apply full custom theme');
            await sendTelegram(chatId, `🎨 <b>ඔයාගේ Custom Theme එක සාර්ථකව සක්‍රිය කළා!</b>`);
        }

        // --- COMMAND 6: /header [Title] | [Subtitle] ---
        else if (text.startsWith('/header ')) {
            const parts = text.substring(8).split('|').map(s => s.trim());
            config.theme_engine.header_title = parts[0];
            if (parts[1]) config.theme_engine.header_subtitle = parts[1];
            await updateGitHubConfig(config, sha, 'Update header titles');
            await sendTelegram(chatId, `✨ <b>App Header එක වෙනස් කළා!</b>`);
        }

        // --- COMMAND 7: /pin [MainPIN] | [SafeGuestPIN] ---
        else if (text.startsWith('/pin ')) {
            const parts = text.substring(5).split('|').map(s => s.trim());
            config.security.main_pin = parts[0];
            if (parts[1]) config.security.safe_guest_pin = parts[1];
            await updateGitHubConfig(config, sha, 'Update security PINs');
            await sendTelegram(chatId, `🔐 <b>App PIN අංකය <code>${parts[0]}</code> ලෙස යාවත්කාලීන කළා!</b>`);
        }

        // --- COMMAND 8: /addwrongpin [Cute Message] ---
        else if (text.startsWith('/addwrongpin ')) {
            const msgText = text.substring(13).trim();
            config.security.wrong_pin_messages.push(msgText);
            await updateGitHubConfig(config, sha, 'Add cute wrong PIN message');
            await sendTelegram(chatId, `🔐 <b>PIN එක වැරදුණාම වැටෙන අලුත් Cute පණිවිඩය එකතු කළා!</b>`);
        }

        // --- COMMAND 9: /meal [morning|lunch|night|latenight|missed] | [Message] ---
        else if (text.startsWith('/meal ')) {
            const parts = text.substring(6).split('|').map(s => s.trim());
            const type = (parts[0] || '').toLowerCase();
            const content = parts[1] || '';
            if (type === 'morning') config.auto_pilot.meal_morning = content;
            else if (type === 'lunch') config.auto_pilot.meal_lunch = content;
            else if (type === 'night') config.auto_pilot.meal_night = content;
            else if (type === 'latenight') config.auto_pilot.late_night_msg = content;
            else if (type === 'missed') config.auto_pilot.missed_you_msg = content;
            await updateGitHubConfig(config, sha, `Update auto message ${type}`);
            await sendTelegram(chatId, `🤖 <b>Auto-Pilot (${type}) පණිවිඩය අලුත් කළා!</b>`);
        }

        // --- COMMAND 10: /addthought [Hourly Thought] ---
        else if (text.startsWith('/addthought ')) {
            const thought = text.substring(12).trim();
            config.auto_pilot.hourly_thoughts.unshift(thought);
            await updateGitHubConfig(config, sha, 'Add hourly thought');
            await sendTelegram(chatId, `💭 <b>පැයෙන් පැයට වැටෙන අලුත් Secret Thought එකක් එකතු කළා!</b>`);
        }

        // --- COMMAND 11: /addautopool [Auto Message] ---
        else if (text.startsWith('/addautopool ')) {
            const poolMsg = text.substring(13).trim();
            config.auto_pilot.auto_message_pool.unshift(poolMsg);
            await updateGitHubConfig(config, sha, 'Add auto message to pool');
            await sendTelegram(chatId, `🔄 <b>Auto-Rotating පණිවිඩ ගොනුවට අලුත් වාක්‍යයක් එකතු කළා!</b>`);
        }

        // --- COMMAND 12: /addenvelope [Title] | [Content] ---
        else if (text.startsWith('/addenvelope ')) {
            const parts = text.substring(13).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.envelopes.push({ title: parts[0], content: parts[1] });
                await updateGitHubConfig(config, sha, 'Add Open When envelope');
                await sendTelegram(chatId, `✉️ <b>අලුත් 'Open When' ලියුම් කවරයක් එකතු කළා:</b>\n${parts[0]}`);
            }
        }

        // --- COMMAND 13: /addcoupon [Title] | [Description] ---
        else if (text.startsWith('/addcoupon ')) {
            const parts = text.substring(11).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.coupons.push({ id: `c_${Date.now()}`, title: parts[0], desc: parts[1] });
                await updateGitHubConfig(config, sha, 'Add love coupon');
                await sendTelegram(chatId, `🎟️ <b>අලුත් ආදර කූපනයක් (Love Coupon) එකතු කළා:</b>\n${parts[0]}`);
            }
        }

        // --- COMMAND 14: /addreason [Why I Love You Reason] ---
        else if (text.startsWith('/addreason ')) {
            const reason = text.substring(11).trim();
            config.interactive.love_reasons.push(reason);
            await updateGitHubConfig(config, sha, 'Add love reason');
            await sendTelegram(chatId, `❤️ <b>'Why I Love You' ලැයිස්තුවට අලුත් හේතුවක් එකතු කළා!</b>`);
        }

        // --- COMMAND 15: /addfortune [Fortune Cookie Text] ---
        else if (text.startsWith('/addfortune ')) {
            const fortune = text.substring(12).trim();
            config.interactive.fortune_cookies.push(fortune);
            await updateGitHubConfig(config, sha, 'Add fortune cookie');
            await sendTelegram(chatId, `🥠 <b>අලුත් Fortune Cookie පණිවිඩයක් එකතු කළා!</b>`);
        }

        // --- COMMAND 16: /scratch [Secret Scratch Text] ---
        else if (text.startsWith('/scratch ')) {
            const scratchText = text.substring(9).trim();
            config.interactive.scratch_card_text = scratchText;
            await updateGitHubConfig(config, sha, 'Update scratch card text');
            await sendTelegram(chatId, `🪙 <b>Scratch Card රහස් පණිවිඩය වෙනස් කළා!</b>`);
        }

        // --- COMMAND 17: /poll [Question] | [Opt1, Opt2, Opt3] ---
        else if (text.startsWith('/poll ')) {
            const parts = text.substring(6).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.interactive.live_poll = {
                    question_id: (config.interactive.live_poll.question_id || 1) + 1,
                    question: parts[0],
                    options: parts[1].split(',').map(o => o.trim())
                };
                await updateGitHubConfig(config, sha, 'Create new live poll');
                await sendTelegram(chatId, `📊 <b>Anuki ට පිළිතුරු දෙන්න අලුත් Live Poll එකක් දැම්මා!</b>`);
            }
        }

        // --- COMMAND 18: /addquiz [Question] | [Opt1,Opt2,Opt3] | [AnswerIndex 0-2] ---
        else if (text.startsWith('/addquiz ')) {
            const parts = text.substring(9).split('|').map(s => s.trim());
            if (parts.length >= 3) {
                config.quiz.push({
                    q: parts[0],
                    options: parts[1].split(',').map(o => o.trim()),
                    answer_index: parseInt(parts[2], 10) || 0
                });
                await updateGitHubConfig(config, sha, 'Add quiz question');
                await sendTelegram(chatId, `🎮 <b>Quiz Game එකට අලුත් ප්‍රශ්නයක් එකතු කළා!</b>`);
            }
        }

        // --- COMMAND 19: /addbucket [Future Goal] ---
        else if (text.startsWith('/addbucket ')) {
            const task = text.substring(11).trim();
            config.bucket_list.push({ task: task, done: false });
            await updateGitHubConfig(config, sha, 'Add bucket list item');
            await sendTelegram(chatId, `📝 <b>Our Future Bucket List එකට අලුත් හීනයක් එකතු කළා!</b>`);
        }

        // --- COMMAND 20: /addstory [Chapter Title] | [Story Text] ---
        else if (text.startsWith('/addstory ')) {
            const parts = text.substring(10).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.story_chapters.push({ chapter: parts[0], text: parts[1] });
                await updateGitHubConfig(config, sha, 'Add story chapter');
                await sendTelegram(chatId, `📖 <b>අපේ ආදර කතාවට අලුත් පරිච්ඡේදයක් (Chapter) එකතු කළා!</b>`);
            }
        }

        // --- COMMAND 21: /adddict [Word] | [Meaning] ---
        else if (text.startsWith('/adddict ')) {
            const parts = text.substring(9).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.interactive.private_dictionary.push({ word: parts[0], meaning: parts[1] });
                await updateGitHubConfig(config, sha, 'Add dictionary word');
                await sendTelegram(chatId, `📕 <b>ආදර ශබ්දකෝෂයට අලුත් වචනයක් එකතු කළා:</b> ${parts[0]}`);
            }
        }

        // --- COMMAND 22: /addvault [Title] | [YYYY-MM-DD HH:mm:ss] | [Locked Hint] | [Secret Message] ---
        else if (text.startsWith('/addvault ')) {
            const parts = text.substring(10).split('|').map(s => s.trim());
            if (parts.length >= 4) {
                config.time_vaults.push({
                    id: `vault_${Date.now()}`,
                    title: parts[0],
                    unlock_date: parts[1],
                    locked_hint: parts[2],
                    secret_title: parts[0],
                    secret_message: parts[3],
                    secret_image_url: ""
                });
                await updateGitHubConfig(config, sha, 'Add time-locked vault');
                await sendTelegram(chatId, `🔐 <b>අලුත් Time-Locked Surprise Box එකක් එකතු කළා!</b>\nUnlock Date: <code>${parts[1]}</code>`);
            }
        }

        // --- COMMAND 23: /lyrics [Line 1 | Line 2 | Line 3] ---
        else if (text.startsWith('/lyrics ')) {
            const lines = text.substring(8).split('|').map(s => s.trim());
            config.media.song_lyrics = lines;
            await updateGitHubConfig(config, sha, 'Update song lyrics');
            await sendTelegram(chatId, `🎶 <b>සින්දුවේ Synchronized Lyrics පද පේළි අලුත් කළා!</b>`);
        }

        // --- COMMAND 24: /avurudu [Nekath Text] | [Ganudenu Note] ---
        else if (text.startsWith('/avurudu ')) {
            const parts = text.substring(9).split('|').map(s => s.trim());
            config.interactive.avurudu_special.nekath_text = parts[0];
            if (parts[1]) config.interactive.avurudu_special.ganudenu_note = parts[1];
            await updateGitHubConfig(config, sha, 'Update Avurudu card');
            await sendTelegram(chatId, `🌸 <b>සිංහල අලුත් අවුරුදු විශේෂ පණිවිඩය අලුත් කළා!</b>`);
        }

        // --- COMMAND 25: /nicknames [Boy Nickname] | [Girl Nickname] ---
        else if (text.startsWith('/nicknames ')) {
            const parts = text.substring(11).split('|').map(s => s.trim());
            if (parts.length >= 2) {
                config.couple_info.boy_nickname = parts[0];
                config.couple_info.girl_nickname = parts[1];
                await updateGitHubConfig(config, sha, 'Update couple nicknames');
                await sendTelegram(chatId, `💑 <b>ආදර නාමයන් (Nicknames) යාවත්කාලීන කළා:</b> ${parts[0]} & ${parts[1]}`);
            }
        }

        // --- COMMAND 26: /toggle [section_name] [on|off] ---
        else if (text.startsWith('/toggle ')) {
            const parts = text.substring(8).trim().split(' ');
            const key = `show_${parts[0]}`;
            const state = (parts[1] || 'on').toLowerCase() === 'on';
            if (key in config.feature_toggles) {
                config.feature_toggles[key] = state;
                await updateGitHubConfig(config, sha, `Toggle ${key} to ${state}`);
                await sendTelegram(chatId, `⚙️ <b>Feature <code>${key}</code> = ${state ? 'ON ✅' : 'OFF ❌'}</b>`);
            } else {
                await sendTelegram(chatId, `⚠️ වලංගු කොටසක් නොවේ. භාවිත කළ හැකි නම්:\n<code>birthday_cake, scratch_card, time_vaults, mood_tracker, envelopes, coupons, quiz, love_plant, bucket_list</code>`);
            }
        }

        // --- COMMAND 27: /style [corner_radius] ---
        else if (text.startsWith('/style ')) {
            const radius = parseInt(text.substring(7).trim(), 10) || 24;
            config.theme_engine.card_corner_radius = radius;
            await updateGitHubConfig(config, sha, 'Update UI card corner radius');
            await sendTelegram(chatId, `📐 <b>UI Card Corner Radius එක <code>${radius}dp</code> ලෙස වෙනස් කළා!</b>`);
        }

        // --- COMMAND 28: /status ---
        else if (text === '/status') {
            await sendTelegram(chatId, `✅ <b>App Version:</b> v${config.app_version}\n🎨 <b>Theme:</b> ${config.theme_engine.mode}\n💌 <b>Daily Note:</b> ${config.auto_pilot.daily_note}`, MAIN_MENU_KEYBOARD);
        }

        // --- UNKNOWN COMMAND ---
        else {
            await sendTelegram(
                chatId,
                `🤖 <b>විධානය හඳුනාගත නොහැක!</b>\nපහත මෙනුව භාවිත කරන්න හෝ සියලුම විධාන බැලීමට <code>/help</code> ඔබන්න:`,
                MAIN_MENU_KEYBOARD
            );
        }

        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('Bot Error:', err);
        return res.status(200).json({ error: err.message });
    }
};

function getHelpMessage() {
    return `📖 <b>RIVISHAN & ANUKI BOT - MASTER COMMANDS (100 FEATURES)</b>\n\n` +
        `🎨 <b>1. Themes & Customization:</b>\n` +
        `• <code>/menu</code> - බටන් සහිත ප්‍රධාන පාලන මෙනුව\n` +
        `• <code>/theme birthday</code> (හෝ love, avurudu, night, rivi_bday, auto)\n` +
        `• <code>/customtheme #E91E63 | #FFF0F5 | #FFFFFF | #212121 | hearts | Title</code>\n` +
        `• <code>/header Main Title | Subtitle</code>\n` +
        `• <code>/style 28</code> - Card රවුම් හැඩය වෙනස් කිරීම\n\n` +
        `💌 <b>2. Live Messages, Popups & Notifications:</b>\n` +
        `• <code>/note ඔයාට පණ වගේ ආදරෙයි</code> - Daily Note වෙනස් කිරීම\n` +
        `• <code>/notify Title | Message</code> - Anuki ට Notification යැවීම\n` +
        `• <code>/popup Title | Message</code> - තිරය මැද ක්ෂණික Popup පෙන්වීම\n` +
        `• <code>/meal morning | උදේට කෑවද මැණික?</code> (morning, lunch, night, latenight, missed)\n` +
        `• <code>/addthought පැයෙන් පැයට වැටෙන අදහසක්</code>\n` +
        `• <code>/addautopool ස්වයංක්‍රීය පණිවිඩ ගොනුවට අලුත් වැකියක්</code>\n\n` +
        `📸 <b>3. Direct Media Uploads (කෙලින්ම Bot ට එවන්න):</b>\n` +
        `• <b>Photo + Caption:</b> <code>2026 Oct 21 | Title | විස්තරය</code> (Memories වලට වැටේ)\n` +
        `• <b>Photo + Caption:</b> <code>wallpaper</code> (Background Wallpaper වෙනස් වේ)\n` +
        `• <b>Photo + Caption:</b> <code>scratch | රහස් පණිවිඩය</code> (Scratch Card වෙනස් වේ)\n` +
        `• <b>Voice Note එවන්න:</b> කෙලින්ම ඔයාගේ Voice Player එකට වැටේ\n` +
        `• <b>MP3 Audio එවන්න:</b> Background සින්දුව වෙනස් වේ\n\n` +
        `🎁 <b>4. Surprises, Vaults & Interactive:</b>\n` +
        `• <code>/addenvelope Title | ලියුමේ අන්තර්ගතය</code>\n` +
        `• <code>/addcoupon Title | විස්තරය</code>\n` +
        `• <code>/addreason මම ඔයාට ආදරේ කරන හේතුවක්</code>\n` +
        `• <code>/addfortune Fortune Cookie පණිවිඩයක්</code>\n` +
        `• <code>/scratch හූරන කාඩ්පතේ රහස් පණිවිඩය</code>\n` +
        `• <code>/poll ප්‍රශ්නය | උත්තර1, උත්තර2, උත්තර3</code>\n` +
        `• <code>/addquiz ප්‍රශ්නය | Opt1,Opt2,Opt3 | 0</code>\n` +
        `• <code>/addbucket අපේ අනාගත හීනයක්</code>\n` +
        `• <code>/addstory පරිච්ඡේදය | කතාව</code>\n` +
        `• <code>/adddict වචනය | තේරුම</code>\n` +
        `• <code>/addvault Title | 2026-10-21 00:00:00 | Hint | Secret Msg</code>\n` +
        `• <code>/avurudu නැකැත් සුබපැතුම | ගනුදෙනු පණිවිඩය</code>\n` +
        `• <code>/lyrics පේළිය 1 | පේළිය 2 | පේළිය 3</code>\n` +
        `• <code>/pin 20230117 | 00000000</code>\n` +
        `• <code>/addwrongpin PIN වැරදුණාම වැටෙන හුරතල් පණිවිඩයක්</code>\n` +
        `• <code>/toggle birthday_cake on</code> (හෝ off)`;
}
