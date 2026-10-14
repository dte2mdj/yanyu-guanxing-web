(function (root) {
    'use strict';

    const JIANWANG_SWORD_IDS = new Set([5707, 5708, 5709, 5710, 5711, 5712, 5713, 5714, 5715, 5716, 5717]);
    const JIANWANG_LEVEL_90_IDS = new Set([5710, 5711, 5712, 5713]);
    const JIANWANG_LEVEL_100_IDS = new Set([5714, 5715, 5716, 5717]);
    const JIANWANG_GROW_TARGETS = Object.freeze({
        5707: Object.freeze([5708]),
        5708: Object.freeze([5709]),
        5709: Object.freeze([5710, 5711, 5712, 5713]),
    });
    const JIANWANG_SHATTER_ROUTE_IDS = Object.freeze({
        5710: 5710, 5711: 5711, 5712: 5712, 5713: 5713,
        5714: 5710, 5715: 5711, 5716: 5712, 5717: 5713,
    });
    const JIANWANG_EXT_PROP_ORDER = Object.freeze([
        'atk_add', 'hit_add', 'def_add', 'hp_add', 'speed_add', 'dodge_add', 'parry_add', 'def_ign',
        'unarmed_add', 'sword_add', 'blade_add', 'stick_add', 'hp_back', 'mp_back', 'mp_f', 'dmg_off',
        'dmg_ref', 'blood', 'renxing', 'po_parry', 'po_dodge', 'atk_extend', 'xx_prob', 'xx_crit',
    ]);
    const JIANWANG_BASE_PROP_ORDER = Object.freeze(['atk', 'def', 'hit', 'hp', 'speed', 'dodge', 'parry', 'neijin', 'gq_base']);
    const JIANWANG_COLOR_ROLL_WEIGHTS = Object.freeze([74, 20, 5, 1]);
    const JIANWANG_RULE_PATCHED = 'patched';
    const JIANWANG_RULE_STANDARD = 'standard';
    const JIANWANG_REFORGE_LIMIT = 10;
    const JIANWANG_TARGET_COUNTS = new Set([3, 4]);
    const THREE_TARGET_SUCCESS_LIMIT = 10;
    const JIANWANG_BLANK_ID = 5707;
    const JIANWANG_REDSEED_MJ_MULTIPLIER = 123;
    const JIANWANG_REDSEED_CZ_MULTIPLIER = 321;
    const MAX_SIMULATED_SWORDS = 100000;
    const DEFAULT_BATCH_SIZE = 40;
    const WHALE_MULTIPLIER = 245109059551232n;
    const WHALE_INCREMENT = 48083817484545n;
    const WHALE_MASK = 2147483647n;
    const WHALE_REDUCTION_LIMIT = 2047483645n;

    let firstSwordProvider = null;

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function requirePositiveInteger(value, field) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new TypeError(`${field}必须是正整数，实际为 ${String(value)}`);
        }
        return value;
    }

    function drawWhaleInt(seed, maximum) {
        const validSeed = requirePositiveInteger(Number(seed), '随机种子');
        const validMaximum = requirePositiveInteger(Number(maximum), '随机上限');
        const mixed = BigInt.asUintN(
            64,
            (BigInt(validSeed) + BigInt(validMaximum)) * WHALE_MULTIPLIER + WHALE_INCREMENT,
        );
        const raw = (mixed >> 17n) & WHALE_MASK;
        const nextSeed = Number((raw < WHALE_REDUCTION_LIMIT ? raw : raw - WHALE_REDUCTION_LIMIT) + 1n);
        return { seed: nextSeed, value: nextSeed % validMaximum + 1 };
    }

    function drawWeightedIndex(seed, weights, context) {
        if (!Array.isArray(weights) || !weights.length) throw new TypeError(`${context}权重不能为空`);
        const validWeights = weights.map((weight, index) => {
            if (!Number.isSafeInteger(weight) || weight < 0) {
                throw new TypeError(`${context}第 ${index + 1} 项权重必须是非负整数`);
            }
            return weight;
        });
        const total = validWeights.reduce((sum, weight) => sum + weight, 0);
        requirePositiveInteger(total, `${context}总权重`);
        const draw = drawWhaleInt(seed, total);
        let cumulative = 0;
        const index = validWeights.findIndex(weight => {
            cumulative += weight;
            return draw.value <= cumulative;
        });
        if (index < 0) throw new RangeError(`${context}随机值超出总权重`);
        return { seed: draw.seed, index };
    }

    function drawJianwangBetween(seed, minimum, maximum, context) {
        if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
            throw new TypeError(`${context}区间无效：${minimum}–${maximum}`);
        }
        const draw = drawWhaleInt(seed, maximum - minimum + 1);
        return { seed: draw.seed, value: draw.value - 1 + minimum };
    }

    function normalizeExts(raw) {
        if (!Array.isArray(raw)) return [];
        return raw.filter(Boolean).map(item => ({
            prop: item.Key || item.prop || item.key,
            value: item.Value != null ? item.Value : item.value,
            S: item.S != null ? item.S : (item.s || 0),
            propCheck: item.PropCheck || item.propCheck || '',
        })).filter(item => item.prop);
    }

    function toSwordInstance(raw, source, equipped, equipData) {
        const id = Number(raw && (raw.ID ?? raw.id));
        const cfg = equipData?.equipment?.[String(id)] || {};
        return {
            id,
            only_id: Number(raw?.OnlyID ?? raw?.only_id ?? 0),
            name: cfg.name || raw?.name || String(id),
            need_lv: Number(cfg.lv || raw?.need_lv || 0),
            typ: Number(cfg.type || raw?.typ || 3),
            color: Number(raw?.Color ?? raw?.color ?? 6),
            level: Number(raw?.Level ?? raw?.level ?? 0),
            lv_prop: Number(raw?.LvProp ?? raw?.lv_prop ?? 0),
            S: Number(raw?.S ?? raw?.s ?? 0),
            MJSeed: Number(raw?.MJSeed ?? raw?.mj_seed ?? 0),
            CZSeed: Number(raw?.CZSeed ?? raw?.cz_seed ?? 0),
            XLLevel: Number(raw?.XLLevel ?? raw?.xl_level ?? 0),
            XLNumber: Number(raw?.XLNumber ?? raw?.xl_number ?? 0),
            exp: Number(raw?.Exp ?? raw?.exp ?? 0),
            base: {
                atk: Number(raw?.Atk ?? raw?.atk ?? 0),
                def: Number(raw?.Def ?? raw?.def ?? 0),
                hit: Number(raw?.Hit ?? raw?.hit ?? 0),
                hp: Number(raw?.Hp ?? raw?.hp ?? 0),
                speed: Number(raw?.Speed ?? raw?.speed ?? 0),
                dodge: Number(raw?.Dodge ?? raw?.dodge ?? 0),
                parry: Number(raw?.Parry ?? raw?.parry ?? 0),
                neijin: Number(raw?.Neijin ?? raw?.neijin ?? 0),
                gq_base: Number(raw?.Gangqi ?? raw?.gq_base ?? 0),
            },
            exts: normalizeExts(raw?.EnExts || raw?.exts),
            specials: normalizeExts(raw?.EnSpecials || raw?.specials),
            _source: source,
            _equipped: !!equipped,
            _provider: false,
        };
    }

    function swordKey(sword) {
        return String(sword?.only_id || `${sword?._source || '存档'}:${sword?.id || 0}:${sword?.CZSeed || 0}:${sword?.S || 0}`);
    }

    function collectSwords(saveData, equipData) {
        const rootSave = Array.isArray(saveData) ? saveData[0] : saveData;
        if (!rootSave || !equipData?.equipment) return [];
        const out = [];
        const seen = new Set();
        const pushList = (list, source, equipped) => {
            if (!list) return;
            const items = Array.isArray(list) ? list : Object.values(list);
            for (const raw of items) {
                const id = Number(raw && (raw.ID ?? raw.id));
                if (!JIANWANG_SWORD_IDS.has(id) || !equipData.equipment[String(id)]) continue;
                if (raw?.CZSeed == null && raw?.cz_seed == null && raw?.S == null && raw?.s == null
                    && raw?.EnExts == null && raw?.exts == null && raw?.Color == null && raw?.color == null) continue;
                const sword = toSwordInstance(raw, source, equipped, equipData);
                const key = swordKey(sword);
                if (seen.has(key)) continue;
                seen.add(key);
                sword.key = key;
                out.push(sword);
            }
        };
        const roleList = value => {
            if (!value) return [];
            if (Array.isArray(value)) return value;
            if (typeof value === 'object') return Object.values(value);
            return [];
        };
        pushList(rootSave.MainRole?.Equips, '主角装备', true);
        roleList(rootSave.Roles).forEach((role, index) => {
            pushList(role?.Equips, role?.Name || role?.name || `随从${index + 1}`, true);
        });
        roleList(rootSave.Leavers).forEach((role, index) => {
            pushList(role?.Equips, role?.Name || role?.name || `离队${index + 1}`, true);
        });
        pushList(rootSave.Equips, '背包', false);
        const depots = rootSave.EncryptDepots || rootSave.Depots || {};
        for (const [depotId, depot] of Object.entries(depots)) {
            const list = depot?.Depots || depot?.Items || depot;
            pushList(list, depot?.Name || depot?.name || `仓库:${depotId}`, false);
        }
        return out.sort((a, b) => Number(a.id) - Number(b.id)
            || String(a._source).localeCompare(String(b._source), 'zh')
            || Number(a.only_id) - Number(b.only_id));
    }

    function classifyExtSeedBatch(sword) {
        if (!sword || !JIANWANG_SWORD_IDS.has(Number(sword.id)) || !Array.isArray(sword.exts)) return null;
        const seeds = sword.exts.map(ext => Number(ext?.S || 0));
        if (seeds.length < 2 || seeds.some(seed => !Number.isSafeInteger(seed) || seed <= 0)) return null;
        const generatedBatch = seeds.length >= 3 ? seeds.slice(1) : seeds;
        if (new Set(generatedBatch).size === 1) return JIANWANG_RULE_PATCHED;
        if (seeds.length === 2) return JIANWANG_RULE_STANDARD;
        return null;
    }

    function detectRuleFromSwords(swords) {
        const evidence = (Array.isArray(swords) ? swords : [])
            .map(sword => classifyExtSeedBatch(sword))
            .filter(Boolean);
        const patchedCount = evidence.filter(rule => rule === JIANWANG_RULE_PATCHED).length;
        const standardCount = evidence.filter(rule => rule === JIANWANG_RULE_STANDARD).length;
        if (standardCount > patchedCount) return { rule: JIANWANG_RULE_STANDARD, evidence: evidence.length };
        return { rule: JIANWANG_RULE_PATCHED, evidence: evidence.length };
    }

    function generateEquip(equipData, targetId, startSeed, rule = JIANWANG_RULE_PATCHED) {
        const cfg = equipData?.equipment?.[String(targetId)];
        if (!cfg || !JIANWANG_SWORD_IDS.has(Number(targetId))) throw new RangeError(`无效的剑王阁目标装备：${targetId}`);
        const standard = rule === JIANWANG_RULE_STANDARD;
        let seed = requirePositiveInteger(Number(startSeed), 'CZSeed');
        seed = drawWeightedIndex(seed, JIANWANG_COLOR_ROLL_WEIGHTS, '剑王阁品质占位').seed;
        const base = {};
        for (const prop of JIANWANG_BASE_PROP_ORDER) {
            const raw = Number(cfg.base?.[prop]) || 0;
            if (raw <= 0) continue;
            if (!standard) {
                base[prop] = raw;
                continue;
            }
            const draw = drawJianwangBetween(seed, 100, 100, `剑王阁${prop}`);
            seed = draw.seed;
            base[prop] = Math.floor(raw * draw.value / 100);
        }
        const candidates = JIANWANG_EXT_PROP_ORDER.filter(prop => Number(cfg.exts?.[prop]?.[0]) > 0);
        const weights = candidates.map(prop => Math.max(0, Math.floor(Number(cfg.exts[prop][1]) || 0)));
        const slotCount = Math.max(0, Math.floor(((Number(cfg.lv) || 60) - 60) / 10) + 1);
        const exts = [];
        for (let slot = 0; slot < slotCount; slot++) {
            const draw = drawWeightedIndex(seed, weights, '剑王阁副属性');
            seed = draw.seed;
            const prop = candidates[draw.index];
            exts.push({ prop, value: Number(cfg.exts[prop][0]) });
            if (standard) weights[draw.index] = 0;
        }
        return { id: Number(targetId), seedAfter: seed, base, exts };
    }

    function createBlankFromRedSeed(equipData, redSeed, swordIndex = null, ruleContext = {}) {
        const sourceRedSeed = requirePositiveInteger(Number(redSeed), 'RedSeeds[5707]');
        const baseSeed = Math.floor(sourceRedSeed / 10);
        const MJSeed = baseSeed + JIANWANG_BLANK_ID * JIANWANG_REDSEED_MJ_MULTIPLIER;
        const CZSeed = baseSeed + JIANWANG_BLANK_ID * JIANWANG_REDSEED_CZ_MULTIPLIER;
        requirePositiveInteger(MJSeed, '新剑胚 MJSeed');
        requirePositiveInteger(CZSeed, '新剑胚 CZSeed');
        const generated = generateEquip(equipData, JIANWANG_BLANK_ID, sourceRedSeed, JIANWANG_RULE_STANDARD);
        const nextRedSeed = drawWhaleInt(sourceRedSeed, SequenceRules.makeMax(ruleContext)).seed;
        const cfg = equipData.equipment[String(JIANWANG_BLANK_ID)] || {};
        return {
            redSeedBefore: sourceRedSeed,
            redSeedAfter: nextRedSeed,
            equip: {
                id: JIANWANG_BLANK_ID,
                only_id: 0,
                name: cfg.name || '剑胚',
                need_lv: Number(cfg.lv) || 60,
                typ: Number(cfg.type) || 3,
                color: 6,
                level: 0,
                lv_prop: 0,
                S: generated.seedAfter,
                MJSeed,
                CZSeed,
                XLLevel: 0,
                XLNumber: 0,
                exp: 0,
                base: generated.base,
                exts: generated.exts.map(item => ({ ...item })),
                specials: [],
                _source: '自动模拟',
                _equipped: false,
                _provider: false,
                _jianwangRebuilt: true,
                _jianwangSwordIndex: swordIndex,
            },
        };
    }

    function keepLimit(sword, action) {
        if (!sword || !action) return 0;
        if (action === 'reforge') return Math.min(4, sword.exts?.length || 0);
        if (action === 'grow') {
            const byId = { 5707: 1, 5708: 2, 5709: 3 };
            return Math.min(byId[Number(sword.id)] || 0, sword.exts?.length || 0);
        }
        return 0;
    }

    function targetMinimumValueForRoute(equipData, routeId, targetProp) {
        const raw = equipData?.equipment?.[String(Number(routeId))]?.exts?.[targetProp]?.[0];
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
    }

    function targetExtMeetsMinimum(ext, targetProp, minimumValue) {
        if (ext?.prop !== targetProp) return false;
        if (!Number.isFinite(minimumValue)) return true;
        const value = Number(ext?.value);
        return Number.isFinite(value) && value + 1e-12 >= minimumValue;
    }

    function targetKeepIndex(sword, targetProp, action, minimumValue = null) {
        const limit = keepLimit(sword, action);
        if (action === 'reforge' && Number.isFinite(minimumValue)) {
            for (let index = 0; index < limit; index++) {
                if (targetExtMeetsMinimum(sword.exts?.[index], targetProp, minimumValue)) return index + 1;
            }
        }
        for (let index = 0; index < limit; index++) {
            if (sword.exts?.[index]?.prop === targetProp) return index + 1;
        }
        return 0;
    }

    function growSword(equipData, sword, targetId, targetProp, rule) {
        if (!sword || !JIANWANG_SWORD_IDS.has(Number(sword.id))) throw new TypeError('起始剑无效');
        const fromId = Number(sword.id);
        const target = Number(targetId);
        const allowed = target === fromId
            ? JIANWANG_LEVEL_90_IDS.has(fromId)
            : (JIANWANG_GROW_TARGETS[fromId] || []).includes(target);
        if (!allowed) throw new RangeError(`不允许从 ${fromId} 成长到 ${target}`);
        const action = target === fromId ? 'reforge' : 'grow';
        const minimumValue = action === 'reforge'
            ? targetMinimumValueForRoute(equipData, target, targetProp)
            : null;
        const keepIndex = targetKeepIndex(sword, targetProp, action, minimumValue);
        const generated = generateEquip(equipData, target, Number(sword.CZSeed), rule);
        const exts = generated.exts.map(item => ({ ...item }));
        let kept = null;
        if (keepIndex > 0) {
            kept = clone(sword.exts[keepIndex - 1]);
            exts.splice(0, 1);
            exts.unshift({ prop: kept.prop, value: kept.value });
        }
        const cfg = equipData.equipment[String(target)] || {};
        const next = {
            ...clone(sword),
            id: target,
            name: cfg.name || sword.name,
            need_lv: Number(cfg.lv) || sword.need_lv,
            typ: Number(cfg.type) || sword.typ,
            color: 6,
            exp: target === fromId ? Number(sword.exp) || 0 : 0,
            base: generated.base,
            exts,
            CZSeed: generated.seedAfter,
        };
        return { equip: next, keepIndex, kept };
    }

    function normalizeTargetCount(value) {
        const count = Number(value == null ? 4 : value);
        if (!JIANWANG_TARGET_COUNTS.has(count)) throw new RangeError('同词条目标只能选择3条或4条');
        return count;
    }

    function isTargetReached(sword, targetProp, targetCount = 4) {
        const count = normalizeTargetCount(targetCount);
        if (!Array.isArray(sword?.exts) || sword.exts.length < 4) return false;
        return sword.exts.slice(0, 4).filter(ext => ext?.prop === targetProp).length >= count;
    }

    function isTargetReachedForRoute(equipData, routeId, sword, targetProp, targetCount = 4) {
        const count = normalizeTargetCount(targetCount);
        const minimumValue = targetMinimumValueForRoute(equipData, routeId, targetProp);
        if (!Number.isFinite(minimumValue) || !Array.isArray(sword?.exts) || sword.exts.length < 4) return false;
        return sword.exts.slice(0, 4)
            .filter(ext => targetExtMeetsMinimum(ext, targetProp, minimumValue)).length >= count;
    }

    function isFourTarget(sword, targetProp) {
        return isTargetReached(sword, targetProp, 4);
    }

    function routeForSword(sword) {
        return Number(JIANWANG_SHATTER_ROUTE_IDS[Number(sword?.id)] || 0);
    }

    function routeTargetsFromSword(sword, routeId) {
        const id = Number(sword?.id);
        if (id === 5707) return [5708, 5709, routeId];
        if (id === 5708) return [5709, routeId];
        if (id === 5709) return [routeId];
        return [];
    }

    function routeOptions(equipData) {
        return Array.from(JIANWANG_LEVEL_90_IDS).map(id => ({
            id,
            name: equipData?.equipment?.[String(id)]?.name || String(id),
        }));
    }

    function targetPropertiesForRoute(equipData, routeId) {
        const cfg = equipData?.equipment?.[String(Number(routeId))];
        if (!cfg || !JIANWANG_LEVEL_90_IDS.has(Number(routeId))) return [];
        return JIANWANG_EXT_PROP_ORDER.filter(prop => Number(cfg.exts?.[prop]?.[0]) > 0 && Number(cfg.exts?.[prop]?.[1]) > 0);
    }

    function findSaveScalar(rootSave, wantedKey) {
        const seen = new Set();
        const unwrap = value => {
            if (typeof value === 'number' && Number.isFinite(value)) return value;
            if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
            if (value && typeof value === 'object') {
                for (const key of ['Value', 'value', 'V', 'v', 'Number', 'number']) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        const parsed = unwrap(value[key]);
                        if (parsed != null) return parsed;
                    }
                }
            }
            return null;
        };
        const walk = value => {
            if (!value || typeof value !== 'object' || seen.has(value)) return null;
            seen.add(value);
            if (Object.prototype.hasOwnProperty.call(value, wantedKey)) {
                const direct = unwrap(value[wantedKey]);
                if (direct != null) return direct;
            }
            const items = Array.isArray(value) ? value : Object.values(value);
            for (const item of items) {
                const found = walk(item);
                if (found != null) return found;
            }
            return null;
        };
        return walk(rootSave);
    }

    function extractRedSeed(saveData) {
        const rootSave = Array.isArray(saveData) ? saveData[0] : saveData;
        const makeRnd = rootSave?.MakeRnd || saveData?.MakeRnd || (Array.isArray(saveData) ? saveData[0]?.MakeRnd : null);
        const value = Number(makeRnd?.RedSeeds?.[String(JIANWANG_BLANK_ID)] || 0);
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }

    function extractReforgeCounts(saveData) {
        const rootSave = Array.isArray(saveData) ? saveData[0] : saveData;
        const counts = {};
        for (const id of JIANWANG_LEVEL_90_IDS) {
            const value = findSaveScalar(rootSave, `again_${id}`);
            counts[String(id)] = Math.max(0, Math.min(JIANWANG_REFORGE_LIMIT, Math.floor(Number(value) || 0)));
        }
        return counts;
    }

    function normalizeMaxSwords(value) {
        const count = Math.floor(Number(value));
        if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SIMULATED_SWORDS) {
            throw new RangeError(`最大模拟次数必须是 1–${MAX_SIMULATED_SWORDS} 的整数`);
        }
        return count;
    }

    function propName(equipData, prop) {
        return equipData?.propNames?.[prop] || prop;
    }

    function stageName(equipData, sword) {
        const id = Number(sword?.id);
        const cfg = equipData?.equipment?.[String(id)] || {};
        if (id === 5707) return '60级剑胚';
        if (id === 5708) return '70级剑胚';
        if (id === 5709) return '80级剑胚';
        if (JIANWANG_LEVEL_90_IDS.has(id)) return `90级专武 · ${cfg.name || sword?.name || id}`;
        if (JIANWANG_LEVEL_100_IDS.has(id)) return `100级神兵 · ${cfg.name || sword?.name || id}`;
        return cfg.name || sword?.name || String(id);
    }

    function swordLabel(equipData, sword) {
        const source = sword?._source || '存档';
        const onlyId = Number(sword?.only_id || 0);
        return `${source} · ${stageName(equipData, sword)} · ${onlyId > 0 ? `#${onlyId}` : '无OnlyID'}`;
    }

    function setFirstSwordProvider(provider) {
        if (provider != null && typeof provider !== 'function') throw new TypeError('首剑生成 provider 必须是函数或 null');
        firstSwordProvider = provider || null;
    }

    function hasFirstSwordProvider() {
        return typeof firstSwordProvider === 'function';
    }

    function resolveProviderStart(input, state) {
        if (!hasFirstSwordProvider()) return null;
        const provided = firstSwordProvider({
            saveData: input.saveData,
            equipData: input.equipData,
            routeId: input.routeId,
            targetProp: input.targetProp,
            targetCount: normalizeTargetCount(input.targetCount),
            redSeed: state.redSeed,
            reforgeCounts: clone(state.reforgeCounts),
        });
        if (!provided) return null;
        const sword = clone(provided.sword || provided.equip || provided);
        if (!sword || !JIANWANG_SWORD_IDS.has(Number(sword.id))) {
            throw new TypeError('首剑生成 provider 未返回有效的 5707～5717 起始剑');
        }
        sword._source = sword._source || '首剑生成接口';
        sword._provider = true;
        if (provided.redSeed != null) state.redSeed = Number(provided.redSeed) || null;
        if (provided.reforgeCounts) state.reforgeCounts = { ...state.reforgeCounts, ...clone(provided.reforgeCounts) };
        if (provided.rule === JIANWANG_RULE_STANDARD || provided.rule === JIANWANG_RULE_PATCHED) state.rule = provided.rule;
        return sword;
    }

    function makeMetrics() {
        return { newSwords: 0, shatter90: 0, shatter100: 0, grows: 0, reforges: 0, keeps: 0, actions: 0 };
    }

    function makeStep(equipData, before, after, type, targetProp, kept, extra = {}) {
        return {
            type,
            fromId: Number(before?.id || 0),
            toId: Number(after?.id || 0),
            fromName: before ? stageName(equipData, before) : '',
            toName: after ? stageName(equipData, after) : '',
            seedBefore: Number(before?.CZSeed || 0),
            seedAfter: Number(after?.CZSeed || 0),
            kept: kept ? { prop: kept.prop, value: kept.value } : null,
            targetProp,
            exts: clone(after?.exts || []),
            ...extra,
        };
    }

    function applyGrowStep(state, sword, targetId, path, type) {
        const before = clone(sword);
        const result = growSword(state.equipData, sword, targetId, state.targetProp, state.rule);
        state.metrics.grows += targetId === Number(sword.id) ? 0 : 1;
        state.metrics.reforges += targetId === Number(sword.id) ? 1 : 0;
        state.metrics.actions += 1;
        if (result.keepIndex > 0) state.metrics.keeps += 1;
        path.push(makeStep(state.equipData, before, result.equip, type, state.targetProp, result.kept, {
            keepIndex: result.keepIndex,
        }));
        return result.equip;
    }

    function successResult(state, sword, path, swordOrdinal, finalAction, startedFromCurrent) {
        return {
            status: 'success',
            targetProp: state.targetProp,
            targetName: propName(state.equipData, state.targetProp),
            targetCount: state.targetCount,
            routeId: state.routeId,
            routeName: state.equipData?.equipment?.[String(state.routeId)]?.name || String(state.routeId),
            swordOrdinal,
            startedFromCurrent: !!startedFromCurrent,
            finalAction,
            finalEquip: clone(sword),
            path: clone(path),
            metrics: clone(state.metrics),
            maxSwords: state.maxSwords,
            startSword: clone(state.startSword),
            startSwordLabel: state.startSword ? swordLabel(state.equipData, state.startSword) : '首剑生成接口',
        };
    }

    function multiSuccessResult(state, reason, stopReason) {
        return {
            status: 'multi-success',
            reason,
            stopReason,
            targetProp: state.targetProp,
            targetName: propName(state.equipData, state.targetProp),
            targetCount: state.targetCount,
            routeId: state.routeId,
            routeName: state.equipData?.equipment?.[String(state.routeId)]?.name || String(state.routeId),
            successCount: state.threeMatches.length,
            successLimit: THREE_TARGET_SUCCESS_LIMIT,
            matches: clone(state.threeMatches),
            metrics: clone(state.metrics),
            maxSwords: state.maxSwords,
            startSword: clone(state.startSword),
            startSwordLabel: state.startSword ? swordLabel(state.equipData, state.startSword) : '首剑生成接口',
        };
    }

    function collectTargetHit(state, sword, path, swordOrdinal, finalAction, startedFromCurrent) {
        if (!isTargetReachedForRoute(state.equipData, state.routeId, sword, state.targetProp, state.targetCount)) return null;
        const result = successResult(state, sword, path, swordOrdinal, finalAction, startedFromCurrent);
        if (state.targetCount === 4) return { success: result, threeLimitReached: false };
        state.threeMatches.push(result);
        return { success: null, threeLimitReached: state.threeMatches.length >= THREE_TARGET_SUCCESS_LIMIT };
    }

    function simulateCandidateSword(state, startSword, reforgeCompleted, swordOrdinal, startedFromCurrent) {
        let sword = clone(startSword);
        const path = [];
        const routeTargets = routeTargetsFromSword(sword, state.routeId);
        for (const targetId of routeTargets) {
            sword = applyGrowStep(state, sword, targetId, path, 'grow');
            const hit = collectTargetHit(state, sword, path, swordOrdinal, `升至${stageName(state.equipData, sword)}`, startedFromCurrent);
            if (hit?.success) return { success: hit.success, sword };
            if (hit?.threeLimitReached) return { success: null, threeLimitReached: true, sword, path };
        }
        if (!JIANWANG_LEVEL_90_IDS.has(Number(sword.id)) || Number(sword.id) !== state.routeId) {
            throw new RangeError('候选剑未能进入所选90级路线');
        }
        if (!routeTargets.length) {
            const hit = collectTargetHit(state, sword, path, swordOrdinal, '当前90级状态', startedFromCurrent);
            if (hit?.success) return { success: hit.success, sword };
            if (hit?.threeLimitReached) return { success: null, threeLimitReached: true, sword, path };
        }
        const completed = Math.max(0, Math.min(JIANWANG_REFORGE_LIMIT, Math.floor(Number(reforgeCompleted) || 0)));
        for (let attempt = completed + 1; attempt <= JIANWANG_REFORGE_LIMIT; attempt++) {
            sword = applyGrowStep(state, sword, Number(sword.id), path, 'reforge');
            path[path.length - 1].reforgeAttempt = attempt;
            const hit = collectTargetHit(state, sword, path, swordOrdinal, `第${attempt}次重铸`, startedFromCurrent);
            if (hit?.success) return { success: hit.success, sword };
            if (hit?.threeLimitReached) return { success: null, threeLimitReached: true, sword, path };
        }
        return { success: null, threeLimitReached: false, sword, path };
    }

    function buildState(input) {
        const equipData = input.equipData;
        if (!equipData?.equipment) throw new TypeError('缺少装备数据');
        const routeId = Number(input.routeId);
        if (!JIANWANG_LEVEL_90_IDS.has(routeId)) throw new TypeError('请选择90级镇派路线');
        const targetProp = String(input.targetProp || '');
        if (!targetPropertiesForRoute(equipData, routeId).includes(targetProp)) throw new TypeError('所选词条不属于该90级路线');
        const targetCount = normalizeTargetCount(input.targetCount);
        const swords = collectSwords(input.saveData, equipData);
        const detection = detectRuleFromSwords(swords);
        const state = {
            equipData,
            saveData: input.saveData,
            routeId,
            ruleContext: { save_version: input.saveVersion || '', save_channel: input.saveChannel || '' },
            targetProp,
            targetCount,
            maxSwords: normalizeMaxSwords(input.maxSwords),
            swords,
            rule: detection.rule,
            redSeed: input.redSeed != null ? Number(input.redSeed) : extractRedSeed(input.saveData),
            reforgeCounts: input.reforgeCounts ? clone(input.reforgeCounts) : extractReforgeCounts(input.saveData),
            metrics: makeMetrics(),
            threeMatches: [],
            startSword: null,
            currentForShatter: null,
        };
        let startSword = input.startSword ? clone(input.startSword) : null;
        if (!startSword && input.startSwordKey) startSword = clone(swords.find(sword => sword.key === String(input.startSwordKey)) || null);
        if (!startSword && swords.length === 1 && input.startSwordKey == null) startSword = clone(swords[0]);
        if (!startSword && swords.length === 0) startSword = resolveProviderStart(input, state);
        if (!startSword) {
            const error = new Error(swords.length ? '请选择起始剑' : '当前存档没有剑王阁实物，首剑生成接口尚未启用');
            error.code = swords.length ? 'START_SWORD_REQUIRED' : 'NO_SWORD_PROVIDER';
            throw error;
        }
        if (!JIANWANG_SWORD_IDS.has(Number(startSword.id))) throw new TypeError('起始剑必须是5707～5717剑王阁装备');
        state.startSword = clone(startSword);
        return state;
    }

    function prepareInitial(state) {
        const start = clone(state.startSword);
        const id = Number(start.id);
        const route = routeForSword(start);
        if (state.rule === JIANWANG_RULE_STANDARD) {
            if (JIANWANG_LEVEL_90_IDS.has(id) && route === state.routeId
                && isTargetReachedForRoute(state.equipData, state.routeId, start, state.targetProp, state.targetCount)) {
                const current = successResult(state, start, [], 0, '当前90级状态', true);
                if (state.targetCount === 4) return current;
                state.threeMatches.push(current);
                return multiSuccessResult(state, '当前起始剑已满足三同；后续序列无法继续产生新的三同结果', 'unreachable');
            }
            return {
                status: 'unreachable',
                reason: `当前序列下无法产生${state.targetCount === 4 ? '三' : '两'}条相同的新词条`,
                targetProp: state.targetProp,
                targetName: propName(state.equipData, state.targetProp),
                targetCount: state.targetCount,
                routeId: state.routeId,
                metrics: clone(state.metrics),
                maxSwords: state.maxSwords,
            };
        }
        if (JIANWANG_LEVEL_100_IDS.has(id)) {
            state.currentForShatter = start;
            return null;
        }
        if (JIANWANG_LEVEL_90_IDS.has(id) && route !== state.routeId) {
            state.currentForShatter = start;
            return null;
        }
        const completed = Math.max(0, Math.floor(Number(state.reforgeCounts[String(state.routeId)]) || 0));
        const candidate = simulateCandidateSword(state, start, completed, 0, true);
        if (candidate.success) return candidate.success;
        if (candidate.threeLimitReached) {
            return multiSuccessResult(state, `已找到 ${THREE_TARGET_SUCCESS_LIMIT} 次三同词条结果，提前停止`, 'success-limit');
        }
        state.currentForShatter = candidate.sword;
        return null;
    }

    function generateNextCandidate(state, ordinal) {
        if (!state.currentForShatter) throw new Error('缺少可碎剑状态');
        const fromId = Number(state.currentForShatter.id);
        if (!JIANWANG_LEVEL_90_IDS.has(fromId) && !JIANWANG_LEVEL_100_IDS.has(fromId)) {
            throw new Error('只有90级专武或100级神兵可以进入下一把剑');
        }
        if (!Number.isSafeInteger(Number(state.redSeed)) || Number(state.redSeed) <= 0) {
            const error = new Error('存档缺少有效 MakeRnd.RedSeeds[5707]，无法生成下一把60级剑胚');
            error.code = 'MISSING_REDSEED';
            throw error;
        }
        if (JIANWANG_LEVEL_100_IDS.has(fromId)) state.metrics.shatter100 += 1;
        else state.metrics.shatter90 += 1;
        const created = createBlankFromRedSeed(state.equipData, state.redSeed, ordinal, state.ruleContext);
        state.redSeed = created.redSeedAfter;
        state.metrics.newSwords += 1;
        state.metrics.actions += 1;
        const matchesBefore = state.threeMatches.length;
        const candidate = simulateCandidateSword(state, created.equip, 0, ordinal, false);
        const blankStep = {
            type: 'blank',
            fromId: fromId,
            toId: JIANWANG_BLANK_ID,
            fromName: stageName(state.equipData, state.currentForShatter),
            toName: stageName(state.equipData, created.equip),
            redSeedBefore: created.redSeedBefore,
            redSeedAfter: created.redSeedAfter,
            seedBefore: 0,
            seedAfter: Number(created.equip.CZSeed || 0),
            kept: null,
            targetProp: state.targetProp,
            exts: clone(created.equip.exts || []),
            swordOrdinal: ordinal,
        };
        if (candidate.success) {
            candidate.success.path.unshift(blankStep);
            return candidate.success;
        }
        if (state.targetCount === 3 && state.threeMatches.length > matchesBefore) {
            for (let index = matchesBefore; index < state.threeMatches.length; index++) {
                state.threeMatches[index].path.unshift(clone(blankStep));
            }
        }
        if (candidate.threeLimitReached) {
            return multiSuccessResult(state, `已找到 ${THREE_TARGET_SUCCESS_LIMIT} 次三同词条结果，提前停止`, 'success-limit');
        }
        state.currentForShatter = candidate.sword;
        return null;
    }

    function terminalLimitResult(state) {
        if (state.targetCount === 3 && state.threeMatches.length) {
            return multiSuccessResult(
                state,
                `已模拟 ${state.maxSwords} 把新剑，找到 ${state.threeMatches.length} 次三同词条结果`,
                'max-swords',
            );
        }
        return {
            status: 'limit',
            reason: `已模拟 ${state.maxSwords} 把新剑，未找到${state.targetCount}条目标词条`,
            targetProp: state.targetProp,
            targetName: propName(state.equipData, state.targetProp),
            targetCount: state.targetCount,
            routeId: state.routeId,
            routeName: state.equipData?.equipment?.[String(state.routeId)]?.name || String(state.routeId),
            metrics: clone(state.metrics),
            maxSwords: state.maxSwords,
            startSword: clone(state.startSword),
            startSwordLabel: swordLabel(state.equipData, state.startSword),
        };
    }

    function search(input) {
        const state = buildState(input);
        const initial = prepareInitial(state);
        if (initial) return initial;
        for (let ordinal = 1; ordinal <= state.maxSwords; ordinal++) {
            const success = generateNextCandidate(state, ordinal);
            if (success) return success;
        }
        return terminalLimitResult(state);
    }

    async function searchAsync(input) {
        const state = buildState(input);
        const initial = prepareInitial(state);
        if (initial) return initial;
        const batchSize = Math.max(1, Math.min(500, Math.floor(Number(input.batchSize) || DEFAULT_BATCH_SIZE)));
        const onProgress = typeof input.onProgress === 'function' ? input.onProgress : null;
        const shouldCancel = typeof input.shouldCancel === 'function' ? input.shouldCancel : () => false;
        const yieldControl = typeof input.yieldControl === 'function'
            ? input.yieldControl
            : () => new Promise(resolve => setTimeout(resolve, 0));
        for (let ordinal = 1; ordinal <= state.maxSwords; ordinal++) {
            if (shouldCancel()) {
                return {
                    status: 'cancelled',
                    reason: '用户取消',
                    targetCount: state.targetCount,
                    successCount: state.threeMatches.length,
                    matches: clone(state.threeMatches),
                    metrics: clone(state.metrics),
                    maxSwords: state.maxSwords,
                };
            }
            const success = generateNextCandidate(state, ordinal);
            if (success) {
                if (onProgress) {
                    const message = state.targetCount === 3
                        ? `已找到 ${state.threeMatches.length}/${THREE_TARGET_SUCCESS_LIMIT} 次三同词条结果`
                        : `第 ${ordinal} 把新剑找到结果`;
                    onProgress({ done: ordinal, total: state.maxSwords, metrics: clone(state.metrics), matches: state.threeMatches.length, message });
                }
                return success;
            }
            if (onProgress && (ordinal === 1 || ordinal % batchSize === 0 || ordinal === state.maxSwords)) {
                const matchText = state.targetCount === 3 ? ` · 三同 ${state.threeMatches.length}/${THREE_TARGET_SUCCESS_LIMIT}` : '';
                onProgress({
                    done: ordinal,
                    total: state.maxSwords,
                    metrics: clone(state.metrics),
                    matches: state.threeMatches.length,
                    message: `已检查 ${ordinal} 把新剑 · 重铸 ${state.metrics.reforges} 次${matchText}`,
                });
            }
            if (ordinal % batchSize === 0) await yieldControl();
        }
        return terminalLimitResult(state);
    }

    root.JianwangAutoOptimizer = Object.freeze({
        JIANWANG_RULE_PATCHED,
        JIANWANG_RULE_STANDARD,
        JIANWANG_REFORGE_LIMIT,
        THREE_TARGET_SUCCESS_LIMIT,
        MAX_SIMULATED_SWORDS,
        collectSwords,
        swordKey,
        swordLabel,
        stageName,
        classifyExtSeedBatch,
        detectRuleFromSwords,
        routeOptions,
        targetPropertiesForRoute,
        targetMinimumValueForRoute,
        extractRedSeed,
        extractReforgeCounts,
        generateEquip,
        createBlankFromRedSeed,
        growSword,
        isTargetReached,
        isTargetReachedForRoute,
        isFourTarget,
        targetKeepIndex,
        setFirstSwordProvider,
        hasFirstSwordProvider,
        search,
        searchAsync,
    });
})(typeof window !== 'undefined' ? window : globalThis);
