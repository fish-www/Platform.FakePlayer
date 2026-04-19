# mc-fakeplayer

fork 并修改自 https://github.com/Minecraft-QQBot/Platform.FakePlayer

## 部署

> 需要先部署并启动 [mc-botserver](https://github.com/fish-www/BotServer) 服务（需要在同一个共享网络 mc-bot 下，见 [创建共享网络](#创建共享网络)）

克隆并进入项目目录中的 `FakePlayer` 目录下

### 创建共享网络

当前编排使用外部共享网络 mc-bot，供其他 mc bot 相关容器共同接入

如果首次部署，请先创建网络：

```bash
sudo docker network create mc-bot
```

### 运行

启动

```bash
sudo docker compose up -d
```

查看日志

```bash
sudo docker compose logs -f mc-fakeplayer
```

关闭服务

```bash
sudo docker compose down
```

## 配置

### mc-botserver



### mc-fakeplayer

在 配置文件 `Config.json` 中修改配置：

```json
{
    "reconnect_interval": 8000, // 重连间隔，单位毫秒
    "token": "", // 机器人服务器的 token
    // mc-botserver 服务需要在同一个共享网络 mc-bot 下
    // `mc-botserver` 是网络 mc-bot 中，此容器的名称
    "uri": "ws://mc-botserver:8000/", // 机器人服务器的 WebSocket 地址
    // 以下为假人账号信息
    "account": {
        "auth": "", // 登录方式，正版需改为 microsoft，不填则为离线登录
        "password": "", // 密码，不填则为离线登录
        "username": "QwQ", // 用户名，对于正版请填写邮箱
        "permission": false, // 是否拥有管理员权限
        "execute_commands": [ // 进入服务器后执行的指令，如登录等。
            "l QwQ123"
        ]
    },
    // 以下为要互联的 Minecraft 服务器信息
    "servers": [
        {
            "name": "Survival",
            "host": "locoalhost",
            "port": 25565
        },
        {
            "name": "Creative",
            "host": "locoalhost",
            "port": 25566
        }
    ]
}
```