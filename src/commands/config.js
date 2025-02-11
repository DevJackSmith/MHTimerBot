// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const { isDMChannel } = require('../modules/channel-utils');
const Logger = require('../modules/logger');
const security = require('../modules/security');
const usage = [
    'view - see current settings for this server',
    'modrole - define the role on this server for moderation level',
    'adminrole - define the role on this server for admin level',
    'prefix - change the prefix on this server',
    'timers [add|remove] [<channel>] - add or remove a channel to announce timers in',
    'emoji [remove] [<name>] - removes/unsets the emoji for this server or displays what it currently is',
    'emoji <name> <value> - sets an emoji for this server for that <name> such as power type emoji',
].join('\n\t');

/**
 *
 * @param {Message} message the message that triggered the command
 * @param {string[]} tokens tokenized arguments to the command
 * @returns {Promise<CommandResult>}
 */
async function doSet(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    const guild = message.guild;
    const guildSettings = message.client.settings.guilds[guild.id];
    let reply = '';
    if (!tokens.length)
        tokens = ['view'];
    const action = tokens.shift().toLowerCase();
    if (!security.checkPerms(message.member, 'admin')) {
        reply = 'Just who do you think you are?';
    }
    else if (action === 'view' && guild) {
        // Show current settings.
        reply = `\`adminrole\` - ${guildSettings.adminrole}\n`;
        reply += `\`modrole\` - ${guildSettings.modrole}`;
        if ('emoji' in guildSettings) {
            reply += '\nYou can see your emoji settings with `config emoji`';
        }
    }
    else if (guild && action === 'emoji') {
        // Allow setting for any string, really. But we especially want power types.
        reply = 'I don\'t know what to set here...';
        let guild_emojis = {};
        let action = 'add';
        if (tokens.length > 0) {
            if (tokens[0].toLowerCase() === 'remove') {
                action = 'remove';
                tokens.shift();
            }
        }
        if ('emoji' in guildSettings)
            guild_emojis = guildSettings['emoji'];
        if (tokens.length === 0) {
            // Show off what we have right now.
            const howMany = Object.keys(guild_emojis).length;
            reply = `Currently configured emoji (${howMany}):\n`;
            reply += Object.keys(guild_emojis).map(e => {
                return `${e} - ${guild_emojis[e]}`;
            }).join('\n');
        } else if (tokens.length === 1) {
            const emoji_name = tokens.shift().toLowerCase();
            const current_value = (emoji_name in guild_emojis ? guild_emojis[emoji_name] : 'nothing yet');
            if (action === 'remove') {
                if (current_value === 'nothing yet') {
                    reply = `${emoji_name} is not set and was not unset`;
                } else {
                    delete guild_emojis[emoji_name];
                    guildSettings['emoji'] = guild_emojis;
                    reply = `${emoji_name} was ${current_value}`;
                }
            } else {
                reply = `${emoji_name} is set to ${current_value}`;
            }
        } else if (tokens.length === 2) {
            const emoji_name = tokens.shift().toLowerCase();
            const set_to = tokens.shift();
            reply = `I set ${emoji_name} to ${set_to}`;
            guild_emojis[emoji_name] = set_to;
            guildSettings['emoji'] = guild_emojis;
        }
    }
    else if (action === 'modrole' || action === 'adminrole') {
        // Set the moderator role on this server.
        const newRole = tokens.shift();
        reply = `'${newRole}' not found in this guild.`;
        if (guild.available) {
            const roleKey = guild.roles.cache.findKey(r => r.name === newRole);
            const role = guild.roles.cache.get(roleKey);
            Logger.log(`Received ${role}`);
            if (role && role.name) {
                guildSettings[action] = role.name;
                reply = `${action} set to ${role.name}`;
            }
        }
        Logger.log(`Guild: ${guild.available}\nRole ${newRole}: ${guild.roles.cache.findKey(r => r.name === newRole)}`);
        Logger.log(`Roles: ${[...guild.roles.cache.values()]}`);
    }
    else if (action === 'timers') {
        const subAction = (tokens.length) ? tokens.shift().toLowerCase() : '';
        if (subAction === 'add') {
            // Next argument should be a channel reference, add it to the array of timer channels.
            const [channel] = Array.from(message.mentions.channels.values());
            if (!channel)
                reply = 'I don\'t think you gave me a channel to add';
            else if (!channel.isText())
                reply = `Didn't add ${channel.toString()} because "${channel.type}" is not a text channel`;
            else if (!('name' in channel))
                reply = `Didn't add ${channel.toString()} because it has no name`;
            else if (guildSettings.timedAnnouncementChannels.has(channel.name))
                reply = `Didn't add ${channel.toString()} because it's already in the list`;
            else {
                guildSettings.timedAnnouncementChannels.add(channel.name);
                reply = `I added ${channel.toString()} but because Aard is lazy it won't be used until next restart`;
                Logger.log(`CONFIG: Added channel ${channel.id} (${channel.name}) to timers for guild ${guild.id} (${guild.name})`);
            }
        }
        else if (subAction === 'remove') {
            // Next argument should be a channel reference, remove it from the array of timer channels.
            const [channel] = Array.from(message.mentions.channels.values());
            if (!channel)
                reply = 'I don\'t think you gave me a channel to remove';
            else if (!('name' in channel))
                reply = `Didn't remove ${channel.toString()} because I couldn't figure out its name`;
            else if (guildSettings.timedAnnouncementChannels.has(channel.name)) {
                guildSettings.timedAnnouncementChannels.delete(channel.name);
                reply = `Removed ${channel.toString()} but because Aard is lazy it won't stop being used until next restart`;
                Logger.log(`CONFIG: Removed channel ${channel.id} (${channel.name}) from timers for guild ${guild.id} (${guild.name})`);
            }
            else {
                reply = `I didn't remove ${channel.toString()} because it's not in use`;
            }
        }
        else {
            const timers = Array.from(guildSettings.timedAnnouncementChannels);
            reply = `Timer channels for this server: ${timers.join(', ')}`;
        }
    }
    else if (action === 'prefix') {
        if (tokens.length) {
            guildSettings.newBotPrefix = tokens.shift();
            reply = `New prefix for this server after the bot restarts: \`${guildSettings.newBotPrefix}\``;
        } else {
            reply = `Current prefix for this server: \`${guildSettings.botPrefix}\``;
            if (guildSettings.newBotPrefix) {
                reply += `\nAfter restart the prefix will be \`${guildSettings.newBotPrefix}\``;
            }
        }
    }
    if (reply) {
        try {
            for (const msg of Util.splitMessage(reply)) {
                await message.channel.send(msg);
            }
            theResult.replied = true;
            theResult.sentDm = isDMChannel(message.channel);
            theResult.success = true;
        } catch (err) {
            Logger.error('CONFIG: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

module.exports = {
    name: 'config',
    requiresArgs: true,
    usage: usage,
    description: 'Configure settings per server',
    execute: doSet,
    minPerm: 'admin',
    canDM: false,
};
