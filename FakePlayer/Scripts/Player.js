const mineflayer = require('mineflayer');

const { logger, I18nTranslator } = require('./Utils');
const WebsocketSender = require('./Websocket/Sender');
const WebsocketListener = require('./Websocket/Listener');

class Player {
    name = null;
    account = null;
    account_config = null;

    sender = null;
    listener = null;

    connected = false;
    already_connecting = false;
    
    // i18n 翻译器
    i18n = null;
    // 玩家名处理缓存：原始玩家名 -> 处理后的玩家名
    player_name_cache = new Map();

    constructor(account, server) {
        this.account = {
            version: false,
            host: server.host,
            port: server.port,
            auth: account.auth,
            username: account.username,
            password: account.password,
            logErrors: false,
            hideErrors: true,
        };

        this.name = server.name;
        this.account_config = account;
        this.sender = new WebsocketSender(server.name);
        this.listener = new WebsocketListener(server.name);
        this.listener.on('message', this.broadcast_message.bind(this));
        this.listener.on('player_list', this.get_player_list.bind(this));
        this.listener.on('command', this.execute_command.bind(this));
        this.listener.on('mcdr_command', this.execute_mcdr_command.bind(this));

        // 初始化 i18n 翻译器
        this.i18n = new I18nTranslator();

        this.sender.connect();
        this.listener.connect();
    }

    close_connection() {
        this.bot.quit();
        this.sender.close();
        this.listener.close();
    }

    create_connection() {
        logger.info(`[${this.name}] [Player] 正在连接到服务器 [${this.name}]……`);
        this.bot = mineflayer.createBot(this.account);

        // 处理 Forge 服务器的握手
        var forgeHandshake3 = require('minecraft-protocol-forge/src/client/forgeHandshake3');
        forgeHandshake3(this.bot._client, {});

        this.listener.player = this.bot;

        this.bot.on('error', (error) => {
            logger.error(`[${this.name}] [Player] 遇到错误：${error}`);
            this.connected = false;
            this.schedule_reconnect();
        });
        this.bot.on('death', () => {
            logger.warn(`[${this.name}] [Player] 假人死亡，正在重生……`);
            setTimeout(this.bot.respawn, 1000);
        });

        this.bot.on('kicked', this.on_kicked.bind(this));
        this.bot.on('end', this.on_end.bind(this));
        this.bot.on('message', this.on_message.bind(this));

        this.bot.once('login', this.on_login.bind(this));
        this.bot.once('spawn', this.on_spawn.bind(this));

    }

    schedule_reconnect() {
        if (this.already_connecting) return;
        this.already_connecting = true;
        setTimeout(() => {
            this.already_connecting = false;
            this.create_connection();
        }, 10000);
    }

    async on_spawn() {
        await this.sender.send_startup();
    }

    async on_login() {
        const execute_command = (index) => {
            if (index >= this.account_config.execute_commands.length || (!this.connected)) return;
            logger.debug(`[${this.name}] [Player] 执行命令：${this.account_config.execute_commands[index]}`)
            this.bot.chat('/' + this.account_config.execute_commands[index]);
            setTimeout(execute_command.bind(this, (index + 1)), 1000);
        }

        this.already_connecting = false;
        this.connected = true;
        logger.info(`[${this.name}] [Player] 已连接到服务器 [${this.name}]！`);
        setTimeout(execute_command.bind(this, 0), 2000);
    }

    async on_kicked(reason) {
        const was_connected = this.connected;
        this.connected = false;
        if (was_connected) await this.sender.send_shutdown();
        logger.warn(`[${this.name}] [Player] 被踢出服务器：${reason}`);
        this.schedule_reconnect();
    }

    async on_end(reason) {
        const was_connected = this.connected;
        this.connected = false;
        if (was_connected) await this.sender.send_shutdown();
        logger.warn(`[${this.name}] [Player] 与服务器连接断开：${reason}`);
        this.schedule_reconnect();
    }

    normalize_player_name(rawPlayerName) {
        if (this.player_name_cache.has(rawPlayerName)) {
            return this.player_name_cache.get(rawPlayerName);
        }

        const normalized = this.i18n.translate_all_keys(rawPlayerName);

        // 控制缓存规模，避免长期运行时无界增长
        if (this.player_name_cache.size >= 2048) {
            this.player_name_cache.clear();
        }

        this.player_name_cache.set(rawPlayerName, normalized);
        return normalized;
    }

    async on_message(message) {
        const type = message.translate;
        if (!(type && message.with)) {
            // tellraw 等系统消息，过滤掉来自 QQ 同步的消息（避免回环）
            const text = message.toString();
            // 过滤 Forge 模组的 i18n 翻译键
            if (text && text.trim() && !text.startsWith('[QQ]') && !this.i18n.is_i18n_key(text)) {
                logger.debug(`[${this.name}] [Player] 收到系统消息：${text}`);
                await this.sender.send_synchronous_message(`[${this.name}] ${text}`);
            }
            return;
        }
        const rawPlayerName = message.with[0].toString();
        // 直接做 i18n 直译，并缓存玩家名处理结果
        const player = this.normalize_player_name(rawPlayerName);

        if (player == this.bot.username) return;
        if (type.startsWith('death'))
            await this.sender.send_player_death(player, type);
        else if (type === 'multiplayer.player.left')
            await this.sender.send_player_left(player);
        else if (type === 'multiplayer.player.joined')
            await this.sender.send_player_joined(player);
        else if (type === 'chat.type.text')
            await this.sender.send_player_chat(player, message.with[1].toString());
        else if (type === 'commands.message.display.incoming') {
            const message_text = message.with[1].toString();
            if (await this.sender.send_synchronous_message(`[${this.name}] <${player}> ${message_text}`))
                this.send_message(player, [{text: '发送消息成功！', color: 'green'}]);
            else this.send_message(player, [{text: '发送消息失败！', color:'red'}]);
        }
    }

    execute_command (data, resolve) {
        if (!this.connected) return resolve('机器人未连接到服务器！');
        this.bot.chat(data.startsWith('/') ? data : `/${data}`);
        resolve('目前不支持获取执行命令的返回值！');
    }

    execute_mcdr_command (data, resolve) {
        if (!this.connected) return resolve('机器人未连接到服务器！');
        this.bot.chat(data.startsWith('!!') ? data : `!!${data}`);
        resolve('目前不支持获取执行命令的返回值！');
    }

    get_player_list(data, resolve) {
        if (!this.connected) return resolve([]);
        let players = [];
        for (const player_name of Object.keys(this.bot.players))
            if (player_name != this.bot.username)
                players.push(player_name);
        resolve(players);
    }

    send_message(player, message) {
        if (!this.connected) return;
        if (this.account_config.permission) {
            this.bot.chat(`/tellraw ${player} ${JSON.stringify(message)}`);
            return;
        }
        let text_message = '';
        for (const segment of message) text_message += segment.text;
        this.bot.whisper(player, text_message);
    }

    broadcast_message(data, resolve) {
        if (!this.connected) return resolve(undefined);
        if (this.account_config.permission) {
            this.bot.chat(`/tellraw @a ${JSON.stringify(data)}`);
            return resolve(undefined);
        }
        let text_message = '';
        for (const segment of data) text_message += segment.text;
        this.bot.chat(text_message);
        resolve(undefined);
    }
}

module.exports = Player;

