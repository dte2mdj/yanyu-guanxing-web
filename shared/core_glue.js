let wasmExports = null;
let wasmReady = false;
let wasmMakeTables = null;
let wasmMakeRuleContext = {};


let cachedDataViewMemory0 = null;
let cachedUint8ArrayMemory0 = null;
let WASM_VECTOR_LEN = 0;

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;

const cachedTextEncoder = new TextEncoder();
if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return { read: arg.length, written: buf.length };
    };
}

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true ||
        (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasmExports.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasmExports.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasmExports.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) arg = arg.slice(offset);
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);
        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function base64ToUint8Array(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function isWasmBinary(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return view.length >= 4 &&
        view[0] === 0x00 && view[1] === 0x61 &&
        view[2] === 0x73 && view[3] === 0x6d;
}


async function initWasm() {
    try {
        const imports = {
            './wasm_core_bg.js': {
                __wbg_random_95ef1cd58b1a3d73: function() {
                    return Math.random();
                },
            },
        };

        let bytes = null;

        if (location.protocol !== 'file:') {
            try {
                const response = await fetch('pkg/wasm_core_bg.wasm');
                if (response.ok) {
                    const fetchedBytes = await response.arrayBuffer();
                    if (isWasmBinary(fetchedBytes)) {
                        bytes = fetchedBytes;
                    } else {
                        console.warn('HTTP 返回的 WASM 数据无效，降级使用内嵌 Base64。');
                    }
                }
            } catch (e) {
                console.warn('HTTP fetch WASM 失败，降级使用内嵌 Base64:', e);
            }
        }

        if (!bytes && typeof EMBEDDED_WASM_B64 !== 'undefined' && EMBEDDED_WASM_B64) {
            bytes = base64ToUint8Array(EMBEDDED_WASM_B64);
        }

        if (!bytes) {
            throw new Error('无法获取 WASM 模块数据。请检查 WASM 文件或内嵌数据是否完整。');
        }

        const { instance } = await WebAssembly.instantiate(SequenceRules.prepareWasm(bytes), imports);

        wasmExports = instance.exports;
        cachedDataViewMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        wasmReady = true;
        return true;
    } catch (e) {
        console.error('WASM 加载失败:', e);
        return false;
    }
}


function _callStringReturn(fn) {
    let d0, d1;
    try {
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        fn(retptr);
        const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
        const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
        d0 = r0; d1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasmExports.__wbindgen_add_to_stack_pointer(16);
        wasmExports.__wbindgen_export3(d0, d1, 1);
    }
}

function wasmInitEngine(talentData, zzData) {
    if (!wasmReady) return false;
    const tj = JSON.stringify(talentData);
    const zj = JSON.stringify(zzData);
    const ptr0 = passStringToWasm0(tj, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(zj, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    return wasmExports.init_engine(ptr0, len0, ptr1, len1) !== 0;
}

function wasmSetState(stateObj) {
    if (!wasmReady) return false;
    const json = JSON.stringify(stateObj);
    const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
    const len = WASM_VECTOR_LEN;
    return wasmExports.set_state(ptr, len) !== 0;
}

function wasmGetState() {
    if (!wasmReady) return null;
    try {
        return JSON.parse(_callStringReturn(r => wasmExports.get_state(r)));
    } catch { return null; }
}

function wasmDoWash() {
    if (!wasmReady) return null;
    try {
        const json = _callStringReturn(r => wasmExports.do_wash(r));
        return json === 'null' ? null : JSON.parse(json);
    } catch { return null; }
}

function wasmWashMulti(times) {
    if (!wasmReady) return [];
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            wasmExports.wash_multi(retptr, times);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch { return []; }
}

function wasmWashUntilGold(maxIterations) {
    if (!wasmReady) return [];
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            wasmExports.wash_until_gold(retptr, maxIterations);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch { return []; }
}

function wasmWashUntilTalentName(name, maxIterations) {
    if (!wasmReady) return [];
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const ptr = passStringToWasm0(String(name || ''), wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const len = WASM_VECTOR_LEN;
            wasmExports.wash_until_talent_name(retptr, ptr, len, maxIterations >>> 0);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error('wash_until_talent_name failed', e);
        return [];
    }
}

function wasmPreviewSequence(maxWashes) {
    if (!wasmReady) return [];
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            wasmExports.preview_sequence(retptr, maxWashes);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch { return []; }
}

function wasmPreviewExchangePads(targets, maxPad) {
    if (!wasmReady) return [];
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const json = JSON.stringify(targets || []);
            const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const len = WASM_VECTOR_LEN;
            wasmExports.preview_exchange_pads(retptr, ptr, len, maxPad >>> 0);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error('preview_exchange_pads failed', e);
        return [];
    }
}

function wasmExchangeTalent(index) {
    if (!wasmReady) return null;
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            wasmExports.exchange_talent(retptr, index);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch { return null; }
}

function wasmDecryptSave(b64Text) {
    if (!wasmReady) throw new Error('WASM 未加载');
    let d0, d1;
    const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
    try {
        const ptr = passStringToWasm0(b64Text, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
        const len = WASM_VECTOR_LEN;
        wasmExports.decrypt_save(retptr, ptr, len);
        const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
        const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
        d0 = r0; d1 = r1;
        const result = getStringFromWasm0(r0, r1);
        const parsed = JSON.parse(result);
        if (parsed && parsed.error) throw new Error(parsed.error);
        return parsed;
    } finally {
        wasmExports.__wbindgen_add_to_stack_pointer(16);
        wasmExports.__wbindgen_export3(d0, d1, 1);
    }
}

function wasmGetAvailableTalents() {
    if (!wasmReady) return [];
    try {
        return JSON.parse(_callStringReturn(r => wasmExports.get_available_talents(r)));
    } catch { return []; }
}

function wasmGetConflicts() {
    if (!wasmReady) return [];
    try {
        return JSON.parse(_callStringReturn(r => wasmExports.get_conflicts(r)));
    } catch { return []; }
}


const FIXED_ORANGE_EXT_PROP_ORDER = Object.freeze([
    'atk_add', 'hit_add', 'def_add', 'hp_add', 'speed_add', 'dodge_add', 'parry_add',
    'def_ign', 'unarmed_add', 'sword_add', 'blade_add', 'stick_add', 'hp_back',
    'mp_back', 'mp_f', 'dmg_off', 'dmg_ref', 'blood', 'renxing', 'po_parry',
    'po_dodge', 'atk_extend', 'xx_prob', 'xx_crit', 'gangqi', 'neij',
]);
const FIXED_ORANGE_EXT_SLOT_COUNT = 3;

function correctFixedOrangeExtsFromSource(req, result) {
    if (!req || !result || Number(req.min_color) !== 5 || Number(req.max_color) !== 5 || Number(result.color) !== 5) {
        return result;
    }
    const equip = wasmMakeTables?.equipment?.[String(req.equip_id)];
    const configured = equip?.exts;
    if (!configured || typeof configured !== 'object') return result;

    const ordered = FIXED_ORANGE_EXT_PROP_ORDER
        .filter(prop => Object.prototype.hasOwnProperty.call(configured, prop))
        .map(prop => ({ prop, value: Array.isArray(configured[prop]) ? configured[prop][0] : configured[prop] }))
        .filter(item => typeof item.value === 'number' && Number.isFinite(item.value));
    result.exts = ordered.slice(0, FIXED_ORANGE_EXT_SLOT_COUNT);
    return result;
}

function correctMakeResultFromSource(req, response) {
    if (Array.isArray(response?.items)) {
        for (const item of response.items) correctFixedOrangeExtsFromSource(req, item);
        return response;
    }
    return correctFixedOrangeExtsFromSource(req, response);
}

function wasmMakeInitTables(tablesObj) {
    if (!wasmReady) return false;
    wasmMakeTables = null;
    try {
        const json = JSON.stringify(tablesObj);
        const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
        const len = WASM_VECTOR_LEN;
        const initialized = wasmExports.make_init_tables(ptr, len) !== 0;
        if (initialized) wasmMakeTables = tablesObj;
        return initialized;
    } catch (e) {
        console.error('make_init_tables failed', e);
        return false;
    }
}

function wasmMakeSetState(stateObj) {
    if (!wasmReady) return false;
    try {
        const json = JSON.stringify(stateObj);
        const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
        const len = WASM_VECTOR_LEN;
        const accepted = wasmExports.make_set_state(ptr, len) !== 0;
        if (accepted) {
            wasmExports.__make_draw_max.value = BigInt(SequenceRules.makeMax(stateObj));
            wasmMakeRuleContext = { save_version: SequenceRules.version(stateObj), save_channel: SequenceRules.channel(stateObj) };
        }
        return accepted;
    } catch (e) {
        console.error('make_set_state failed', e);
        return false;
    }
}

function wasmMakeGetState() {
    if (!wasmReady) return null;
    try {
        return { ...JSON.parse(_callStringReturn(r => wasmExports.make_get_state(r))), ...wasmMakeRuleContext };
    } catch { return null; }
}

function wasmMakePreview(req, n) {
    if (!wasmReady) return { items: [], error: 'WASM 未加载' };
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const json = JSON.stringify(req || {});
            const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const len = WASM_VECTOR_LEN;
            wasmExports.make_preview(retptr, ptr, len, n >>> 0);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return correctMakeResultFromSource(req, JSON.parse(getStringFromWasm0(r0, r1)));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error('make_preview failed', e);
        return { items: [], error: String(e) };
    }
}

function wasmMakeOnce(req) {
    if (!wasmReady) return { error: 'WASM 未加载' };
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const json = JSON.stringify(req || {});
            const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const len = WASM_VECTOR_LEN;
            wasmExports.make_once(retptr, ptr, len);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return correctMakeResultFromSource(req, JSON.parse(getStringFromWasm0(r0, r1)));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error('make_once failed', e);
        return { error: String(e) };
    }
}

function _callJsonInOut(fnName, obj, extraArg) {
    if (!wasmReady) return { error: 'WASM 未加载' };
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const json = JSON.stringify(obj || {});
            const ptr = passStringToWasm0(json, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const len = WASM_VECTOR_LEN;
            if (extraArg === undefined) {
                wasmExports[fnName](retptr, ptr, len);
            } else {
                wasmExports[fnName](retptr, ptr, len, extraArg >>> 0);
            }
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error(fnName + ' failed', e);
        return { error: String(e) };
    }
}

function wasmXilianPreview(equip, n) {
    return _callJsonInOut('xilian_preview', equip, n);
}

function wasmXilianOnce(equip) {
    return _callJsonInOut('xilian_once', equip);
}

function wasmXilianPlan(equip, accepts) {
    if (!wasmReady) return { error: 'WASM 未加载' };
    try {
        let d0, d1;
        const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
        try {
            const j0 = JSON.stringify(equip || {});
            const p0 = passStringToWasm0(j0, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const l0 = WASM_VECTOR_LEN;
            const j1 = JSON.stringify(accepts || []);
            const p1 = passStringToWasm0(j1, wasmExports.__wbindgen_export, wasmExports.__wbindgen_export2);
            const l1 = WASM_VECTOR_LEN;
            wasmExports.xilian_plan(retptr, p0, l0, p1, l1);
            const r0 = getDataViewMemory0().getInt32(retptr + 0, true);
            const r1 = getDataViewMemory0().getInt32(retptr + 4, true);
            d0 = r0; d1 = r1;
            return JSON.parse(getStringFromWasm0(r0, r1));
        } finally {
            wasmExports.__wbindgen_add_to_stack_pointer(16);
            wasmExports.__wbindgen_export3(d0, d1, 1);
        }
    } catch (e) {
        console.error('xilian_plan failed', e);
        return { error: String(e) };
    }
}

function wasmStrongPreview(equip, n) {
    return _callJsonInOut('strong_preview', equip, n);
}

function wasmStrongOnce(equip) {
    return _callJsonInOut('strong_once', equip);
}


function syncStateToWasm(jsState) {
    const ws = {
        mode: jsState.mode,
        zizhi: jsState.zizhi,
        sex: jsState.sex,
        vip: jsState.vip,
        seed: jsState.seed,
        luck_seed: jsState.luckSeed,
        luck_seed_inited: jsState.luckSeedInited,
        role_id: jsState.roleId,
        salt: jsState.salt,
        talents: jsState.talents,
        tal_lucky: jsState.talLucky,
        total_wash: jsState.totalWash,
        total_talent_bars: jsState.totalTalentBars || 0,
        total_pills: jsState.totalPills,
        bag_pills: jsState.bagPills,
        has_bag_pills: jsState.hasBagPills,
        gold_count: jsState.goldCount,
        pity_count: jsState.pityCount,
        quality_counts: jsState.qualityCounts,
        last_purple_total_pills: jsState.lastPurpleTotalPills,
        exchange_count: jsState.exchangeCount,
        str_gift: jsState.strGift,
        con_gift: jsState.conGift,
        dex_gift: jsState.dexGift,
        int_gift: jsState.intGift,
        role_level: jsState.roleLevel,
        role_stats: jsState.roleStats || { str_val: 0, dex: 0, con: 0, int_val: 0 },
        global_vars: jsState.globalVars || {},
        born_talent_rc: Number(jsState.bornTalentRC) || 0,
        save_channel: jsState.saveChannel || '',
        save_version: jsState.saveVersion || '',
    };
    return wasmSetState(ws);
}

function syncStateFromWasm(jsState) {
    const ws = wasmGetState();
    if (!ws) return;
    jsState.mode = ws.mode;
    jsState.zizhi = ws.zizhi;
    jsState.sex = ws.sex;
    jsState.vip = ws.vip;
    jsState.seed = ws.seed;
    jsState.luckSeed = ws.luck_seed;
    jsState.luckSeedInited = ws.luck_seed_inited;
    jsState.roleId = ws.role_id;
    jsState.salt = ws.salt;
    jsState.talents = ws.talents;
    jsState.talLucky = ws.tal_lucky;
    jsState.totalWash = ws.total_wash;
    jsState.totalTalentBars = ws.total_talent_bars || 0;
    jsState.totalPills = ws.total_pills;
    jsState.bagPills = ws.bag_pills;
    jsState.hasBagPills = ws.has_bag_pills;
    jsState.goldCount = ws.gold_count;
    jsState.pityCount = ws.pity_count;
    jsState.qualityCounts = ws.quality_counts;
    jsState.lastPurpleTotalPills = ws.last_purple_total_pills;
    jsState.exchangeCount = ws.exchange_count;
    jsState.strGift = ws.str_gift;
    jsState.conGift = ws.con_gift;
    jsState.dexGift = ws.dex_gift;
    jsState.intGift = ws.int_gift;
    jsState.roleLevel = ws.role_level;
    if (ws.born_talent_rc !== undefined) jsState.bornTalentRC = Number(ws.born_talent_rc) || 0;
    if (ws.save_channel !== undefined) jsState.saveChannel = String(ws.save_channel || '');
    if (ws.save_version !== undefined) jsState.saveVersion = String(ws.save_version || '');
}

function convertWashResult(wr) {
    if (!wr) return null;
    return {
        washNo: wr.wash_no,
        talents: wr.talents,
        gotGold: wr.got_gold,
        pillsUsed: wr.pills_used,
        totalPills: wr.total_pills,
        bagPills: wr.bag_pills,
        wasPity: wr.was_pity,
        pityArmed: wr.pity_armed,
        talLucky: wr.tal_lucky,
        purpleGapPills: wr.purple_gap_pills,
        isFirstPurple: wr.is_first_purple,
        startS: wr.start_s,
        endS: wr.end_s,
        luckSeed: wr.luck_seed,
        roleId: wr.role_id,
    };
}

function convertExchangeResult(er) {
    if (!er) return null;
    return {
        success: er.success,
        error: er.error,
        washNo: er.wash_no,
        exchangeNo: er.exchange_no,
        talents: er.talents,
        gotGold: er.got_gold,
        isExchange: er.is_exchange,
        exchangedFrom: er.exchanged_from,
        exchangedTo: er.exchanged_to,
        pillsUsed: er.pills_used,
        totalPills: er.total_pills,
        bagPills: er.bag_pills,
        wasPity: er.was_pity,
        pityArmed: er.pity_armed,
        talLucky: er.tal_lucky,
        purpleGapPills: er.purple_gap_pills,
        isFirstPurple: er.is_first_purple,
        startS: er.start_s,
        endS: er.end_s,
        luckSeed: er.luck_seed,
        roleId: er.role_id,
    };
}
