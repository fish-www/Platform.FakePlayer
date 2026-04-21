const Utf8 = require('utf8');
const Base64 = require('base-64');

exports.encode = (data) => {
    return Base64.encode(Utf8.encode(JSON.stringify(data)));
};

exports.decode = (string) => {
    try {
        return JSON.parse(Utf8.decode(Base64.decode(string)));
    } catch (error) {
        console.warn('解码数据时遇到错误：', error);
    }
};

exports.logger = new Proxy(console, {
    get(target, key, receiver) {
        const origin_method = target[key];
        return (...args) => {
            const timestamp = new Date().toISOString();
            const prefix_message = `[${timestamp.replace('T',' ').replace('Z', '')}] [${key.toUpperCase()}]`;
            return origin_method.call(target, prefix_message, ...args);
        };
    }
});

// i18n 翻译器类
class I18nTranslator {
    constructor(i18nDataPath = '../data/zh_cn.json') {
        this.i18nData = {};
        this.i18nCache = new Map();
        this.load_i18n_data(i18nDataPath);
    }

    load_i18n_data(i18nDataPath) {
        try {
            const fullPath = require('path').join(__dirname, i18nDataPath);
            if (require('fs').existsSync(fullPath)) {
                const content = require('fs').readFileSync(fullPath, 'utf-8');
                this.i18nData = JSON.parse(content);
                exports.logger.debug('[I18nTranslator] i18n 数据加载成功');
            } else {
                exports.logger.warn(`[I18nTranslator] i18n 文件不存在：${fullPath}`);
            }
        } catch (error) {
            exports.logger.error(`[I18nTranslator] 加载 i18n 数据失败：${error}`);
        }
    }

    translate(key) {
        if (this.i18nCache.has(key)) {
            return this.i18nCache.get(key);
        }

        let translation = this.i18nData[key];

        if (translation) {
            this.i18nCache.set(key, translation);
            return translation;
        }

        this.i18nCache.set(key, key);
        return key;
    }

    is_i18n_key(text) {
        return /^[\w]+(?:\.[\w]+){2,}$/.test(text.trim());
    }

    replace_i18n_keys(text, mappings = {}) {
        let result = text;

        for (const [key, replacement] of Object.entries(mappings)) {
            if (result.includes(key)) {
                result = result.replace(key, replacement);
                return result;
            }
        }

        if (this.is_i18n_key(result)) {
            return this.translate(result);
        }

        return result;
    }

    translate_all_keys(text) {
        // 使用贪心匹配找到所有 i18n key
        let result = '';
        let i = 0;
        
        while (i < text.length) {
            let matched = false;
            
            // 只在遇到字母/数字/下划线时尝试匹配
            if (/[a-zA-Z0-9_]/.test(text[i])) {
                // 从最长的可能开始尝试（贪心）
                for (let end = text.length; end > i; end--) {
                    const candidate = text.substring(i, end);
                    
                    // 检查候选字符串是否为有效的 i18n key
                    if (this.is_i18n_key(candidate)) {
                        // 候选字符串可能有尾部空格，需要检查真正的 key 长度
                        const trimmedKey = candidate.trim();
                        
                        // 检查 key 是否真的存在于 i18n 数据中（不是由于格式匹配但未定义）
                        if (trimmedKey in this.i18nData) {
                            const keyEnd = i + trimmedKey.length;
                            const nextChar = text[keyEnd];
                            // 允许的结束条件：
                            // 1. 字符串结尾
                            // 2. 后面是非字母/非数字/非下划线/非点的字符
                            // 3. 后面跟着的是另一个 i18n key（连接的 key）
                            let isValidEnd = nextChar === undefined || !/[a-zA-Z0-9_.]/.test(nextChar);
                            
                            // 如果不满足上面的条件，检查是否为连接的 key
                            if (!isValidEnd && /[a-zA-Z0-9_]/.test(nextChar)) {
                                // 检查从 keyEnd 开始的子字符串是否可能是另一个 i18n key
                                for (let checkEnd = text.length; checkEnd > keyEnd; checkEnd--) {
                                    const nextKeyCandidate = text.substring(keyEnd, checkEnd);
                                    if (this.is_i18n_key(nextKeyCandidate) && (nextKeyCandidate.trim() in this.i18nData)) {
                                        isValidEnd = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (isValidEnd) {
                                result += this.translate(trimmedKey);
                                i = keyEnd;
                                matched = true;
                                break;
                            }
                        }
                    }
                }
            }
            
            // 如果没有匹配到 key，就追加当前字符
            if (!matched) {
                result += text[i];
                i++;
            }
        }
        
        return result;
    }

    clear_cache() {
        this.i18nCache.clear();
    }
}

exports.I18nTranslator = I18nTranslator;
