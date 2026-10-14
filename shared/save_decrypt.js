var SAVE_V18_PLATFORM_KEYS = {
    ios: '3598gjjdtekelaw9',
    android: '3598gjjdtekelad9',
    pre_ios: '3598gjjdbeceead3',
    pre_android: '3598gjjdbeceead3',
    older: '3598gjjdchdidqz2',
    test: 'aaaabbbbccccdddd',
    oversea: '3598gjjdaecjjyc4',
    korea: '3598gjjdd3tczm6d',
    japan: '3598gjjdtekelad9',
    windows: 'windows0'
};
var SAVE_V183_DEVICE_MARKER_PATTERN = /@([A-Za-z0-9]{8})@/g;
var SAVE_V183_TRANSPORT_PREFIX = 'kjie00o0';
var SAVE_V183_INNER_KEY = 'hjo0e3q9po06ewkx';
var SAVE_V19_FILE_PATTERN = /^yanyu-@([A-Za-z0-9]{16})@-(\d{8})-(\d{6})-dat-v1\.9\.db$/;
var SAVE_V19_TRANSPORT_PREFIX = 'js9qf8me';
var SAVE_V19_INNER_KEY = 'jkds85wepo06ewkx';
var SAVE_NESTED_MARKER_MAP = Object.freeze({
    'kjie00o0': { knownVersions: ['00072280'] },
    'js9qf8me': { knownVersions: ['00072288'] },
    'nfidfug8': { knownVersions: ['00072294', '00073288'] },
    'tsidfug8': { knownVersions: ['00073288'] },
    // The exporter supplies the final getTest-derived outer key in the file name.
    // This marker does not imply that the server-issued inner version key is known.
    'cdexdmk5': { knownVersions: ['00073302'] },
    'dnkemiea': { knownVersions: ['00073314', '00073420'] }
});
var SAVE_NESTED_INNER_KEY_MAP = Object.freeze({
    '00072280': 'hjo0e3q9po06ewkx',
    '00072288': 'jkds85wepo06ewkx',
    '00072294': 'juhycd8epo06ewkx',
    '00073288': '90qabeonpo06ewkx',
    // Server m_tKeys[73302], validated against the real 20260908-161433 export.
    '00073302': 'njglp5lvpo06ewkx',
    // Server m_tKeys[73314], strictly validated against the real 20260915-133941 export.
    '00073314': 'jkimeiccpo06ewkx',
    // Server m_tKeys[73420], strictly validated against the real 20260928-110949 export.
    '00073420': 'n0b06b00po06ewkx'
});
var SAVE_V20_CHANNEL_INNER_KEYS = { '先行服': 'jkds85wecgkmi4cq' };
var SAVE_V20_CHANNELS = ['官服', '华为', '小米', '魅族', '九游', '4399', 'OPPO', '荣耀', 'Bilibili', '抖音', '国际服', '葫芦侠', '先行服', 'vivo', '应用宝'];
var SAVE_V20_FILE_PATTERN = /^yanyu-@([A-Za-z0-9]{16})@-@(官服|华为|小米|魅族|九游|4399|OPPO|荣耀|Bilibili|抖音|国际服|葫芦侠|先行服|vivo|应用宝)@-(\d{8})-(\d{6})-v2\.0\.db$/;
var SAVE_V20_FILE_SHAPE_PATTERN = /^yanyu-@([^@]*)@-@([^@]+)@-(\d{8})-(\d{6})-v2\.0\.db$/;
var SAVE_V21_FILE_PATTERN = /^yanyu-@([A-Za-z0-9]{16})@-@(官服|华为|小米|魅族|九游|4399|OPPO|荣耀|Bilibili|抖音|国际服|葫芦侠|先行服|vivo|应用宝)@-(\d{8})-(\d{6})-v2\.1(?:\.0)?\.yanyu$/;
var SAVE_V21_FILE_SHAPE_PATTERN = /^yanyu-@([^@]*)@-@([^@]+)@-(\d{8})-(\d{6})-v2\.1(?:\.0)?\.yanyu$/;
var SAVE_EXPORTER_RELEASES = Object.freeze(['2.1.4', '2.1.6', '2.1.7']);
var SAVE_AUTH_CONTAINER_MAGIC = 'YANYU201';
var SAVE_AUTH_KDF_CONTEXT = 'yanyu-export-v2.0.1';
var SAVE_AUTH_KDF_ITERATIONS = 120000;
var SAVE_AUTH_SALT_BYTES = 16;
var SAVE_AUTH_NONCE_BYTES = 12;

function parseV19SaveFileName(fileName) {
    const match = String(fileName || '').match(SAVE_V19_FILE_PATTERN);
    if (!match) return null;
    return { outerKey: match[1], date: match[2], time: match[3], formatVersion: '1.9' };
}

function parseV20SaveFileName(fileName) {
    const match = String(fileName || '').match(SAVE_V20_FILE_PATTERN);
    if (!match) return null;
    return {
        outerKey: match[1], channel: match[2], date: match[3], time: match[4],
        formatVersion: '2.0'
    };
}

function parseV21SaveFileName(fileName) {
    const match = String(fileName || '').match(SAVE_V21_FILE_PATTERN);
    if (!match) return null;
    return {
        outerKey: match[1], channel: match[2], date: match[3], time: match[4],
        formatVersion: '2.1', container: 'yanyu201'
    };
}

function parseV183SaveFileName(fileName) {
    const name = String(fileName || '');
    if (!/\.db$/i.test(name)) return null;
    if (/-v\d+(?:\.\d+)*\.(?:db|yanyu)$/i.test(name)) return null;
    const matches = Array.from(name.matchAll(SAVE_V183_DEVICE_MARKER_PATTERN));
    if (matches.length !== 1) return null;
    return { deviceCode: matches[0][1], formatVersion: '1.8.3' };
}

function getV20SaveFileNameError(fileName) {
    const match = String(fileName || '').match(SAVE_V20_FILE_SHAPE_PATTERN);
    if (!match) return null;
    if (!SAVE_V20_CHANNELS.includes(match[2])) {
        return '未识别到渠道服。当前支持：' + SAVE_V20_CHANNELS.join('、');
    }
    if (!/^[A-Za-z0-9]{16}$/.test(match[1])) {
        return '存档密钥不对。文件名中的解析码必须是 16 位字母或数字，请重新导出且不要修改文件名';
    }
    return null;
}

function getV21SaveFileNameError(fileName) {
    const match = String(fileName || '').match(SAVE_V21_FILE_SHAPE_PATTERN);
    if (!match) return null;
    if (!SAVE_V20_CHANNELS.includes(match[2])) {
        return '未识别到渠道服。当前支持：' + SAVE_V20_CHANNELS.join('、');
    }
    if (!/^[A-Za-z0-9]{16}$/.test(match[1])) {
        return '存档密钥不对。文件名中的解析码必须是 16 位字母或数字，请重新导出且不要修改文件名';
    }
    return null;
}

function detectSaveFileVersion(fileName) {
    if (parseV21SaveFileName(fileName)) return '2.1';
    if (parseV20SaveFileName(fileName)) return '2.0';
    if (parseV19SaveFileName(fileName)) return '1.9';
    if (parseV183SaveFileName(fileName)) return '1.8.3';
    if (/\.db$/i.test(String(fileName || ''))) return '1.8';
    return null;
}

async function decryptAuthenticatedContainer(bytes, fileInfo, fileName) {
    const displayVersion = fileInfo && fileInfo.formatVersion ? fileInfo.formatVersion : '加密版';
    const headerLength = SAVE_AUTH_CONTAINER_MAGIC.length
        + SAVE_AUTH_SALT_BYTES + SAVE_AUTH_NONCE_BYTES;
    if (!bytes || bytes.length < headerLength + 16) {
        throw new Error(displayVersion + ' 加密存档不完整，请重新导出');
    }
    const magic = _bytesToAscii(bytes.slice(0, SAVE_AUTH_CONTAINER_MAGIC.length));
    if (magic !== SAVE_AUTH_CONTAINER_MAGIC) {
        throw new Error('不是有效的 ' + displayVersion + ' 加密存档，请勿修改文件内容或扩展名');
    }
    const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    if (!subtle) {
        throw new Error('当前浏览器不支持本地安全解密，请使用最新版 Chrome 或 Edge');
    }
    const saltStart = SAVE_AUTH_CONTAINER_MAGIC.length;
    const nonceStart = saltStart + SAVE_AUTH_SALT_BYTES;
    const cipherStart = nonceStart + SAVE_AUTH_NONCE_BYTES;
    const salt = bytes.slice(saltStart, nonceStart);
    const nonce = bytes.slice(nonceStart, cipherStart);
    const encrypted = bytes.slice(cipherStart);
    const password = new TextEncoder().encode(
        fileInfo.outerKey + '\0' + SAVE_AUTH_KDF_CONTEXT);
    try {
        const keyMaterial = await subtle.importKey(
            'raw', password, { name: 'PBKDF2' }, false, ['deriveKey']);
        const key = await subtle.deriveKey({
            name: 'PBKDF2', salt, iterations: SAVE_AUTH_KDF_ITERATIONS, hash: 'SHA-256'
        }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        password.fill(0);
        const plain = await subtle.decrypt({
            name: 'AES-GCM', iv: nonce,
            additionalData: new TextEncoder().encode(String(fileName || '')),
            tagLength: 128
        }, key, encrypted);
        return new Uint8Array(plain);
    } catch (error) {
        throw new Error(displayVersion + ' 存档认证失败：文件已被修改、文件名不匹配或存档密钥不正确');
    }
}


function _b64ToBytes(b64) {
    b64 = String(b64).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    if (typeof atob === 'function') {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

function _bytesToAscii(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
}

function _readSaveVersion(bytes) {
    if (!bytes || bytes.length < 8) return null;
    const version = _bytesToAscii(bytes.slice(0, 8));
    return /^\d{8}$/.test(version) ? version : null;
}


function _bytesToUint32LE(bytes) {
    const len = bytes.length;
    const copy = new Uint8Array(Math.ceil(len / 4) * 4);
    copy.set(bytes);
    const v = new Uint32Array(Math.ceil(len / 4));
    const view = new DataView(copy.buffer);
    for (let i = 0; i < v.length; i++) v[i] = view.getUint32(i * 4, true);
    return v;
}

function _uint32ToBytesLE(v) {
    const result = new Uint8Array(v.length * 4);
    const view = new DataView(result.buffer);
    for (let i = 0; i < v.length; i++) view.setUint32(i * 4, v[i], true);
    return result;
}

function _keyToUint32LE(key) {
    const keyBytes = new Uint8Array(16);
    const encoded = new TextEncoder().encode(key);
    for (let i = 0; i < Math.min(encoded.length, 16); i++) keyBytes[i] = encoded[i];
    return _bytesToUint32LE(keyBytes);
}

function decryptXXTEA(data, key) {
    try {
        if (!data || data.length === 0) return null;
        const v = _bytesToUint32LE(data);
        const k = _keyToUint32LE(key);
        const n = v.length;
        if (n < 2) return null;

        const rounds = 6 + Math.floor(52 / n);
        const delta = 0x9E3779B9;
        let sum = (rounds * delta) >>> 0;
        let y = v[0];
        let z, p, e;

        for (let i = 0; i < rounds; i++) {
            e = (sum >>> 2) & 3;
            for (p = n - 1; p > 0; p--) {
                z = v[p - 1];
                const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) >>> 0)
                    ^ ((((sum ^ y) + (k[(p & 3) ^ e] ^ z)) >>> 0));
                v[p] = (v[p] - mx) >>> 0;
                y = v[p];
            }
            z = v[n - 1];
            const mx = ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) >>> 0)
                ^ ((((sum ^ y) + (k[e] ^ z)) >>> 0));
            v[0] = (v[0] - mx) >>> 0;
            y = v[0];
            sum = (sum - delta) >>> 0;
        }

        const resultBytes = _uint32ToBytesLE(v);
        const origLen = new DataView(resultBytes.buffer, (n - 1) * 4, 4).getUint32(0, true);
        const maxLen = (n - 1) * 4;
        if (origLen > maxLen) return null;
        return resultBytes.slice(0, origLen);
    } catch (e) {
        return null;
    }
}


async function _inflateZlib(data) {
    if (typeof DecompressionStream !== 'undefined') {
        try {
            const ds = new DecompressionStream('deflate');
            const stream = new Blob([data]).stream().pipeThrough(ds);
            const buf = await new Response(stream).arrayBuffer();
            return new Uint8Array(buf);
        } catch (e) { }
    }
    if (typeof pako !== 'undefined' && pako.inflate) {
        return pako.inflate(data);
    }
    throw new Error('当前环境不支持 zlib 解压（需 DecompressionStream 或 pako）');
}


async function decryptSaveContent(contentText, outerKey, formatVersion, channel) {
    const content = String(contentText || '');
    const marker = content.slice(0, 8);
    if (!/^[A-Za-z0-9]{16}$/.test(String(outerKey || ''))
        || !Object.prototype.hasOwnProperty.call(SAVE_NESTED_MARKER_MAP, marker)) {
        return null;
    }

    let outerCipher;
    try {
        outerCipher = _b64ToBytes(content.slice(marker.length));
    } catch (e) {
        if (marker === 'cdexdmk5' || marker === 'dnkemiea') throw _newSaveOuterKeyError(marker);
        return null;
    }
    const outerPlain = decryptXXTEA(outerCipher, outerKey);
    if (!outerPlain) {
        if (marker === 'cdexdmk5' || marker === 'dnkemiea') throw _newSaveOuterKeyError(marker);
        return null;
    }

    const nestedBase64 = _bytesToAscii(outerPlain);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(nestedBase64)) {
        if (marker === 'cdexdmk5' || marker === 'dnkemiea') throw _newSaveOuterKeyError(marker);
        return null;
    }

    let innerEnvelope;
    try {
        innerEnvelope = _b64ToBytes(nestedBase64);
    } catch (e) {
        if (marker === 'cdexdmk5' || marker === 'dnkemiea') throw _newSaveOuterKeyError(marker);
        return null;
    }
    const version = _readSaveVersion(innerEnvelope);
    if ((marker === 'cdexdmk5' || marker === 'dnkemiea')
        && (innerEnvelope.length < 16 || (innerEnvelope.length - 8) % 4 !== 0)) {
        throw _newSaveOuterKeyError(marker);
    }
    if (!version) {
        if (marker === 'cdexdmk5' || marker === 'dnkemiea') throw _newSaveOuterKeyError(marker);
        return null;
    }

    const knownInnerKey = (formatVersion === '2.0' || formatVersion === '2.1')
        && SAVE_V20_CHANNEL_INNER_KEYS[channel]
        ? SAVE_V20_CHANNEL_INNER_KEYS[channel]
        : SAVE_NESTED_INNER_KEY_MAP[version];
    // Preserve the historical fallback, but distinguish an unknown inner
    // version from a bad filename/exporter key once the outer layer is decoded.
    const innerKey = knownInnerKey || SAVE_V19_INNER_KEY;
    const compressed = decryptXXTEA(innerEnvelope.slice(8), innerKey);
    if (!compressed) {
        if (!knownInnerKey) throw _unsupportedSaveInnerVersionError(version, marker);
        return null;
    }

    try {
        const decompressed = await _inflateZlib(compressed);
        const data = JSON.parse(new TextDecoder().decode(decompressed));
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        return {
            data, platform: 'android', version,
            formatVersion: formatVersion || '1.9', channel: channel || null,
            transportMarker: marker,
            outerKeySource: 'file-name'
        };
    } catch (e) {
        if (!knownInnerKey) throw _unsupportedSaveInnerVersionError(version, marker);
        return null;
    }
}

function _newSaveOuterKeyError(marker) {
    const error = new Error('新版存档外层解密失败：导出工具生成的解析码与存档不匹配，或文件已损坏。'
        + (marker === 'dnkemiea' ? '请使用 2.1.7 或后续兼容版本导出工具重新导出，不要手动修改文件名'
            : '请使用支持新版存档格式的导出工具重新导出，不要手动修改文件名'));
    error.code = 'SAVE_OUTER_KEY_MISMATCH';
    error.stage = 'outer';
    error.transportMarker = marker || 'cdexdmk5';
    return error;
}

function _unsupportedSaveInnerVersionError(version, marker) {
    const error = new Error('存档外层已解密成功，但当前模拟器尚未收录游戏存档版本 '
        + version + ' 的内层解密参数。请提供该版本的新导出存档用于适配，无需反复重命名或重新导出');
    error.code = 'SAVE_INNER_VERSION_UNSUPPORTED';
    error.stage = 'inner';
    error.version = version;
    error.transportMarker = marker;
    return error;
}

function _getV18PlatformOrder(version) {
    const versionNum = parseInt(version, 10) || 0;
    if (versionNum > 40318) {
        return ['ios', 'android', 'pre_ios', 'pre_android', 'test', 'oversea', 'korea', 'japan', 'older', 'windows'];
    }
    if (versionNum > 40098) return ['oversea', 'ios', 'android', 'older', 'windows'];
    if (versionNum > 5503) return ['older', 'ios', 'android', 'windows'];
    if (versionNum === 0) return ['windows'];
    return ['ios', 'android', 'pre_ios', 'pre_android', 'test', 'oversea', 'korea', 'japan', 'older', 'windows'];
}

async function _parseLegacyCompressedJson(compressed) {
    try {
        const decompressed = await _inflateZlib(compressed);
        const data = JSON.parse(new TextDecoder().decode(decompressed));
        return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
    } catch (e) {
        return null;
    }
}

async function decryptV18SaveContent(contentText) {
    let envelope;
    try {
        envelope = _b64ToBytes(String(contentText || ''));
    } catch (e) {
        return null;
    }
    const version = _readSaveVersion(envelope);
    if (!version) return null;
    const cipher = envelope.slice(8);
    for (const platform of _getV18PlatformOrder(version)) {
        const compressed = decryptXXTEA(cipher, SAVE_V18_PLATFORM_KEYS[platform]);
        if (!compressed) continue;
        const data = await _parseLegacyCompressedJson(compressed);
        if (data) return { data, platform, version, formatVersion: '1.8' };
    }
    return null;
}

function buildV183OuterKeys(deviceCode, saveRow) {
    const device = String(deviceCode || '');
    const rowId = saveRow && saveRow.id != null ? String(saveRow.id).trim() : '';
    if (!/^[A-Za-z0-9]{8}$/.test(device) || rowId.length < 8) return [];

    const accountParts = [];
    const addAccount = value => {
        if (/^[A-Za-z0-9]{8}$/.test(value) && !accountParts.includes(value)) {
            accountParts.push(value);
        }
    };
    addAccount(rowId.slice(-8));
    addAccount(rowId.slice(0, 8));

    const keys = [];
    const addKey = value => {
        if (value.length === 16 && !keys.includes(value)) keys.push(value);
    };
    if (accountParts[0]) addKey(device + accountParts[0]);
    for (const account of accountParts) {
        addKey(account + device);
        addKey(device + account);
    }
    return keys;
}

async function _decryptV183InnerEnvelope(innerEnvelope) {
    const version = _readSaveVersion(innerEnvelope);
    if (!version) return null;
    const compressed = decryptXXTEA(innerEnvelope.slice(8), SAVE_V183_INNER_KEY);
    if (!compressed) return null;
    const data = await _parseLegacyCompressedJson(compressed);
    return data ? { data, platform: 'android', version, formatVersion: '1.8.3' } : null;
}

async function decryptV183SaveContent(contentText, outerKeys) {
    let content = String(contentText || '');
    if (content.startsWith(SAVE_V183_TRANSPORT_PREFIX)) {
        content = content.slice(SAVE_V183_TRANSPORT_PREFIX.length);
    }
    let outerCipher;
    try {
        outerCipher = _b64ToBytes(content);
    } catch (e) {
        return null;
    }
    for (const outerKey of Array.isArray(outerKeys) ? outerKeys : []) {
        const outerPlain = decryptXXTEA(outerCipher, outerKey);
        if (!outerPlain) continue;
        const nestedBase64 = _bytesToAscii(outerPlain);
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(nestedBase64)) continue;
        let innerEnvelope;
        try {
            innerEnvelope = _b64ToBytes(nestedBase64);
        } catch (e) {
            continue;
        }
        const result = await _decryptV183InnerEnvelope(innerEnvelope);
        if (result) return result;
    }
    return null;
}


function _detectSaveFormat(bytes) {
    if (bytes.length >= 16
        && bytes[0] === 0x53 && bytes[1] === 0x51 && bytes[2] === 0x4C) {
        return 'sqlite';
    }
    if (bytes[0] === 0x7B || bytes[0] === 0xEF) {
        return 'json';
    }
    return 'unknown';
}

async function _extractContentFromSqlite(bytes) {
    if (typeof initSqlJsEmbed !== 'function') {
        throw new Error('SQLite 解析模块未加载（请确认 sql-wasm.js 和 sql-wasm-embed.js 已引入）');
    }
    const SQL = await initSqlJsEmbed();
    const db = new SQL.Database(bytes);
    try {
        let stmt = db.prepare("SELECT content FROM save LIMIT 1");
        let row = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        if (!row || !row.content) {
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            if (tables && tables[0]) {
                const names = tables[0].values.map(v => v[0]).filter(n => !/^sqlite_/i.test(n));
                for (const tname of names) {
                    try {
                        stmt = db.prepare("SELECT content FROM \"" + tname + "\" LIMIT 1");
                        if (stmt.step()) {
                            const r = stmt.getAsObject();
                            if (r.content) { row = r; row.__table = tname; break; }
                        }
                    } catch (e) { }
                    finally { stmt.free(); }
                }
            }
        }
        if (!row || !row.content) {
            throw new Error('SQLite 数据库里没找到 content 字段（save 表为空或不存在）');
        }
        let columns = null;
        let fullRow = null;
        try {
            const info = db.exec("PRAGMA table_info(\"" + (row.__table || 'save') + "\")");
            if (info && info[0]) columns = info[0].values.map(v => v[1]);
            const sel = db.exec("SELECT * FROM \"" + (row.__table || 'save') + "\" LIMIT 1");
            if (sel && sel[0]) {
                fullRow = {};
                const c = sel[0].columns;
                const v = sel[0].values[0];
                for (let i = 0; i < c.length; i++) fullRow[c[i].toLowerCase()] = v[i];
            }
        } catch (e) { }
        return { content: row.content, columns, row: fullRow };
    } finally {
        db.close();
    }
}

async function decryptSaveFile(file, requestedFormatVersion) {
    if (!file || typeof file.arrayBuffer !== 'function') {
        throw new Error('需要传入浏览器 File 对象');
    }
    const modernFileInfo = parseV21SaveFileName(file.name)
        || parseV20SaveFileName(file.name) || parseV19SaveFileName(file.name);
    const selectedVersion = requestedFormatVersion == null
        ? getSelectedSaveFormatVersion() : String(requestedFormatVersion);
    let fileInfo = modernFileInfo;
    if (!fileInfo) {
        const v21FileNameError = getV21SaveFileNameError(file.name);
        if (v21FileNameError) throw new Error(v21FileNameError);
        const v20FileNameError = getV20SaveFileNameError(file.name);
        if (v20FileNameError) throw new Error(v20FileNameError);
        if (selectedVersion === '1.8.3') {
            fileInfo = parseV183SaveFileName(file.name);
            if (!fileInfo) {
                throw new Error('1.8.3 存档文件名必须包含一对 8 位 @设备码@，并以 .db 结尾');
            }
        } else if (selectedVersion === '1.8') {
            if (!/\.db$/i.test(String(file.name || ''))) {
                throw new Error('1.8 仅支持直接导入 dat.db 或其他 .db SQLite 存档');
            }
            fileInfo = { formatVersion: '1.8' };
        } else {
            throw new Error('无法识别存档版本或文件名。请选择解析版本 v2.1 的 .yanyu 文件，或未改名的 v2.0 / v1.9 .db 文件；旧 dat.db 请先选择 1.8 或 1.8.3');
        }
    }
    let buf = new Uint8Array(await file.arrayBuffer());
    if (fileInfo.formatVersion === '2.1') {
        buf = await decryptAuthenticatedContainer(buf, fileInfo, file.name);
    }
    const fmt = _detectSaveFormat(buf);

    if (fmt !== 'sqlite') {
        throw new Error(fileInfo.formatVersion === '2.1'
            ? fileInfo.formatVersion + ' 容器解密后不是有效 SQLite 存档'
            : '仅支持导出工具生成的 SQLite 存档');
    }

    let content = null;
    let extra = {};
    const ext = await _extractContentFromSqlite(buf);
    content = ext.content;
    if (['cdexdmk5', 'dnkemiea'].includes(String(content).slice(0, 8))
        && (fileInfo.formatVersion === '1.8' || fileInfo.formatVersion === '1.8.3')) {
        throw new Error('这是新版加密原始存档，不能按 1.8 / 1.8.3 读取。'
            + '请使用支持新版存档格式的导出工具生成 .yanyu 文件，再选择 v2.1 导入');
    }
    extra.format = fileInfo.formatVersion === '2.1'
        ? 'yanyu201' : 'sqlite';
    extra.columns = ext.columns;
    // 只带轻量字段。`ext.row.content` 是整份存档正文（通常 1MB+），
    // 而它已经由 `r.data` 提供了；原样塞进 meta 会被写进
    // localStorage / window.name，把共享存储直接撑爆 —— 表现就是
    // "导入成功但切页后新页面看不到存档"。真正需要 row 的地方
    // （buildV183OuterKeys）只用到 row.id。
    extra.row = ext.row ? { id: ext.row.id, player: ext.row.player } : null;

    let r;
    if (fileInfo.formatVersion === '1.8') {
        r = await decryptV18SaveContent(content);
    } else if (fileInfo.formatVersion === '1.8.3') {
        const outerKeys = buildV183OuterKeys(fileInfo.deviceCode, ext.row || null);
        if (!outerKeys.length) {
            throw new Error('1.8.3 存档缺少有效的 save.id，无法与文件名设备码组合解析');
        }
        r = await decryptV183SaveContent(content, outerKeys);
    } else {
        r = await decryptSaveContent(
            content, fileInfo.outerKey, fileInfo.formatVersion, fileInfo.channel || null);
    }
    if (!r) {
        if (fileInfo.formatVersion === '1.8') {
            throw new Error('1.8 存档解析失败：版本头、历史平台密钥、压缩数据或 JSON 不匹配');
        }
        if (fileInfo.formatVersion === '1.8.3') {
            throw new Error('1.8.3 存档解析失败：文件名设备码与当前 dat.db 不匹配，或存档内容已损坏');
        }
        if (fileInfo.formatVersion === '2.0' || fileInfo.formatVersion === '2.1') {
            throw new Error('存档密钥不对。请重新使用当前渠道的 '
                + fileInfo.formatVersion + ' 导出工具导出，且不要修改文件名');
        }
        throw new Error('存档解密失败：文件名中的 16 位解析码或版本与存档不匹配');
    }
    return Object.assign(r, extra);
}


function compareVersionParts(left, right) {
    const a = String(left).split('.').map(Number);
    const b = String(right).split('.').map(Number);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index++) {
        const difference = (a[index] || 0) - (b[index] || 0);
        if (difference) return difference;
    }
    return 0;
}

function getLatestExporterVersion(parseVersion) {
    const selected = String(parseVersion || '');
    const releases = SAVE_EXPORTER_RELEASES.filter(version =>
        version === selected || version.startsWith(selected + '.'));
    releases.sort(compareVersionParts);
    return releases.length ? releases[releases.length - 1] : null;
}

function setSaveFormatVersion(version) {
    const requested = String(version);
    const normalized = requested === '2.1.0' ? '2.1' : requested;
    const allowed = ['1.8', '1.8.3', '1.9', '2.0', '2.1'];
    const selected = allowed.includes(normalized) ? normalized : '2.1';
    const isLegacy = selected === '1.8' || selected === '1.8.3';
    const exporterVersion = getLatestExporterVersion(selected);
    const selector = document.getElementById('saveFormatVersion');
    const download = document.getElementById('saveExporterDownload');
    const exporter = document.getElementById('saveExporterVersion');
    const hint = document.getElementById('saveVersionHint');
    if (selector) selector.value = selected;
    if (download) {
        download.hidden = isLegacy || !exporterVersion;
        if (exporterVersion) {
            download.href = 'downloads/yanyu-save-exporter-v' + exporterVersion + '.zip';
        } else if (typeof download.removeAttribute === 'function') {
            download.removeAttribute('href');
        } else {
            download.href = '';
        }
    }
    if (exporter) exporter.textContent = exporterVersion ? 'v' + exporterVersion : '无（仅解析）';
    if (hint) {
        hint.textContent = selected === '1.8'
            ? '仅解析：直接选择旧版 dat.db，不需要文件名设备码'
            : (selected === '1.8.3'
                ? '仅解析：文件名须包含一对 8 位 @设备码@'
                : (selected === '2.1'
                    ? '支持解析版本 v2.1 的只读加密 .yanyu 文件（默认）'
                    : (selected === '2.0'
                        ? '兼容 v2.0 工具导出的渠道命名 .db 文件'
                        : '兼容 v1.9 工具导出的 -dat-v1.9.db 文件')));
    }
}

function getSelectedSaveFormatVersion() {
    if (typeof document === 'undefined') return '';
    const selector = document.getElementById('saveFormatVersion');
    return selector ? String(selector.value || '') : '';
}

function initializeSaveVersionSelector() {
    const selector = document.getElementById('saveFormatVersion');
    const input = document.getElementById('saveFileInput');
    if (selector) selector.addEventListener('change', function () {
        setSaveFormatVersion(selector.value);
    });
    if (input) input.addEventListener('change', function () {
        const file = input.files && input.files[0];
        const detected = file ? detectSaveFileVersion(file.name) : null;
        if (detected) setSaveFormatVersion(detected);
    });
    setSaveFormatVersion('2.1');
}

if (typeof document !== 'undefined') initializeSaveVersionSelector();


var SAVE_SHARE_KEY = 'yyjh_share_save_v1';
var SAVE_SHARE_META_KEY = 'yyjh_share_save_meta_v1';
// window.name：同一个标签页内跨页面导航会保留，是 file:// 下
// Web Storage 被浏览器拒掉时的最后一道兵。
var SAVE_SHARE_WN_MAGIC = '__YYJH_SHARE_V1__';
var SAVE_SHARE_WN_MAX = 6 * 1024 * 1024;

function _webStores() {
    const out = [];
    try { if (window.localStorage) out.push(window.localStorage); } catch (e) { }
    try { if (window.sessionStorage) out.push(window.sessionStorage); } catch (e) { }
    return out;
}

function _storeGet(key) {
    for (const store of _webStores()) {
        try {
            const value = store.getItem(key);
            if (value != null) return value;
        } catch (e) { }
    }
    return null;
}

function _storeSet(key, value) {
    let ok = false;
    for (const store of _webStores()) {
        try { store.setItem(key, value); ok = true; } catch (e) { }
    }
    return ok;
}

function _storeRemove(key) {
    for (const store of _webStores()) {
        try { store.removeItem(key); } catch (e) { }
    }
}

function _nameRead() {
    try {
        const value = String(window.name || '');
        return value.indexOf(SAVE_SHARE_WN_MAGIC) === 0
            ? value.slice(SAVE_SHARE_WN_MAGIC.length) : null;
    } catch (e) { return null; }
}

function _nameWrite(text) {
    try {
        if (text.length > SAVE_SHARE_WN_MAX) return false;
        window.name = SAVE_SHARE_WN_MAGIC + text;
        return true;
    } catch (e) { return false; }
}

function _nameClear() {
    try { if (_nameRead() !== null) window.name = ''; } catch (e) { }
}

// 大字符串压成 base64（复用已有的 pako）
function _packText(text) {
    if (typeof pako !== 'undefined' && typeof pako.deflate === 'function'
        && typeof btoa === 'function') {
        try { return btoa(_bytesToAscii(pako.deflate(new TextEncoder().encode(text)))); } catch (e) { }
    }
    return null;
}

function _unpackText(raw) {
    // 未压缩的 JSON 对象一定以 '{' 开头（旧格式的兼容判据，保留）
    if (raw.charCodeAt(0) === 123) return raw;
    if (typeof pako === 'undefined' || typeof atob !== 'function') return null;
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(pako.inflate(bytes));
}

function saveShareStore(data, meta) {
    meta = Object.assign({}, meta || {});
    if (!Number.isFinite(Number(meta.importedAt))) meta.importedAt = Date.now();

    let serialized, serializedMeta;
    try {
        serialized = JSON.stringify(data);
        serializedMeta = JSON.stringify(meta);
    } catch (e) { return false; }

    // 两边都可能在 2MB 上下，任何一边太大都压缩（以前只压 data，meta 不压）
    if (serialized.length + serializedMeta.length > 2 * 1024 * 1024) {
        const packed = _packText(serialized);
        if (packed) serialized = packed;
        if (serializedMeta.length > 512 * 1024) {
            const packedMeta = _packText(serializedMeta);
            if (packedMeta) serializedMeta = packedMeta;
        }
    }

    let ok = _storeSet(SAVE_SHARE_KEY, serialized);
    ok = _storeSet(SAVE_SHARE_META_KEY, serializedMeta) || ok;
    // 无论 Web Storage 成不成功，都往 window.name 写一份
    _nameWrite(JSON.stringify({ d: serialized, m: serializedMeta }));
    return ok || _nameRead() !== null;
}

function loadShareStore() {
    try {
        let serialized = _storeGet(SAVE_SHARE_KEY);
        let serializedMeta = _storeGet(SAVE_SHARE_META_KEY) || '{}';

        if (!serialized) {                    // 兵式：从 window.name 恢复
            const packed = _nameRead();
            if (!packed) return null;
            const envelope = JSON.parse(packed);
            serialized = envelope.d;
            serializedMeta = envelope.m || '{}';
        }

        const rawData = _unpackText(serialized);
        if (rawData == null) return null;
        const rawMeta = _unpackText(serializedMeta) || '{}';
        return { data: JSON.parse(rawData), meta: JSON.parse(rawMeta) };
    } catch (e) {
        return null;
    }
}

function clearShareStore() {
    _storeRemove(SAVE_SHARE_KEY);
    _storeRemove(SAVE_SHARE_META_KEY);
    _nameClear();
}

// ---- 供 page_bridge.js 使用的原始读写口 ----
// 直接搬字符串，避免把 3.4MB 的存档再 JSON.parse / stringify 一遍。

function shareStoreRaw() {
    let d = _storeGet(SAVE_SHARE_KEY);
    let m = _storeGet(SAVE_SHARE_META_KEY) || '{}';
    if (!d) {
        const packed = _nameRead();
        if (packed) {
            try { const env = JSON.parse(packed); d = env.d; m = env.m || '{}'; } catch (e) { }
        }
    }
    return d ? { d: d, m: m } : null;
}

function shareStoreApplyRaw(d, m) {
    if (typeof d !== 'string' || !d) return false;
    _storeSet(SAVE_SHARE_KEY, d);
    _storeSet(SAVE_SHARE_META_KEY, m || '{}');
    // 顺手也写一份 window.name：Chrome 下同标签页跳转还能继续兜底
    _nameWrite(JSON.stringify({ d: d, m: m || '{}' }));
    return true;
}


function markNavTransition() {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('yyjh_nav_transition', '1');
    } catch (e) { }
}

function consumeNavTransition() {
    try {
        if (typeof sessionStorage === 'undefined') return false;
        const v = sessionStorage.getItem('yyjh_nav_transition') === '1';
        sessionStorage.removeItem('yyjh_nav_transition');
        return v;
    } catch (e) {
        return false;
    }
}

function _importFeedback(on) {
    try {
        var input = document.getElementById('saveFileInput');
        if (!input) return;
        var label = input.closest ? input.closest('label') : null;
        if (!label) label = input.parentNode;
        if (!label) return;
        var txt = label.querySelector ? label.querySelector('.import-txt') : null;
        if (!txt) return;
        if (on) {
            if (!txt.dataset.importTxt) txt.dataset.importTxt = txt.textContent;
            txt.textContent = '解密中…';
        } else {
            if (txt.dataset.importTxt) txt.textContent = txt.dataset.importTxt;
        }
    } catch (e) { }
}
