const fetch = require('node-fetch');

// Environment Variables මඟින් රහස් තොරතුරු ලබා ගැනීම (ආරක්ෂිතයි)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_PATH = 'config.json';
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

async function getGitHubConfig() {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const res = await fetch(url, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Anuki-Love-Bot' }
    });
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { json: JSON.parse(content), sha: data.sha };
}

async function updateGitHubConfig(newConfig, sha, commitMessage) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;
    const contentEncoded = Buffer.from(JSON.stringify(newConfig, null, 2)).toString('base64');
    
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
    return await res.json();
}

async function sendTelegramMessage(chatId, text) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Rivishan & Anuki Bot Server with Env Vars is Running!');
    }

    try {
        const update = req.body;
        if (!update.message || !update.message.text) return res.status(200).send('OK');

        const chatId = update.message.chat.id.toString();
        const text = update.message.text.trim();

        if (chatId !== OWNER_CHAT_ID) {
            await sendTelegramMessage(chatId, "⚠️ Sorry, this bot is strictly for Rivishan only! ❤️");
            return res.status(200).send('Unauthorized');
        }

        const { json: config, sha } = await getGitHubConfig();

        if (text.startsWith('/theme ')) {
            const newTheme = text.split(' ')[1];
            config.theme_engine.mode = newTheme;
            await updateGitHubConfig(config, sha, `Update theme to ${newTheme}`);
            await sendTelegramMessage(chatId, `✅ Theme changed to: *${newTheme}*`);

        } else if (text.startsWith('/note ')) {
            const newNote = text.substring(6);
            config.auto_pilot.daily_note = newNote;
            await updateGitHubConfig(config, sha, `Update daily note`);
            await sendTelegramMessage(chatId, `✅ Daily Note updated successfully! 💌`);

        } else if (text.startsWith('/notify ')) {
            const msg = text.substring(8);
            config.notification.notif_id += 1;
            config.notification.message = msg;
            await updateGitHubConfig(config, sha, `Trigger new notification`);
            await sendTelegramMessage(chatId, `🔔 Notification sent! (ID: ${config.notification.notif_id})`);

        } else {
            await sendTelegramMessage(chatId, `🤖 *Bot Commands:* \n1. \`/theme birthday\` / \`/theme love\` \n2. \`/note [text]\` \n3. \`/notify [text]\``);
        }

        return res.status(200).json({ status: 'success' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
