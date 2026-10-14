(function (root) {
    'use strict';

    const MAX_RANDOM = 2047483645;
    const WHALE_MASK48 = (1n << 48n) - 1n;
    const WHALE_MULTIPLIER = 0x5deece66dn;
    const WHALE_INCREMENT = 0xbn;
    const QUALITY_WEIGHT = Object.freeze({ 1: 560, 2: 374, 3: 64, 4: 2 });
    const PITY = 900;
    const ZZ_RULES = Object.freeze({
        150: Object.freeze({ slots: 0, baseCost: 1, pity: 0 }),
        151: Object.freeze({ slots: 1, baseCost: 1, pity: 700 }),
        152: Object.freeze({ slots: 2, baseCost: 2, pity: 800 }),
        153: Object.freeze({ slots: 3, baseCost: 3, pity: 850 }),
        154: Object.freeze({ slots: 4, baseCost: 5, pity: 900 }),
    });
    const SLOT_COUNT = 4;

    const APK_TALENT_INSERTION_ORDER = Object.freeze([
        ...range(170, 211), ...range(230, 254), 400, 401, ...range(255, 280),
        ...range(281, 285), ...range(402, 420),
        290, 297, 298, 291, 299, 300, 292, 295, 296, 293, 301, 302, 294,
        ...range(303, 317), 332, ...range(318, 331), ...range(333, 370),
    ].map(String));

    function range(start, end) {
        const result = [];
        for (let value = start; value <= end; value++) result.push(value);
        return result;
    }

    function u32(value) {
        return value >>> 0;
    }

    function rol(value, bits) {
        return u32((value << bits) | (value >>> (32 - bits)));
    }

    function getU32(bytes, start) {
        return u32(bytes[start]
            | (bytes[start + 1] << 8)
            | (bytes[start + 2] << 16)
            | (bytes[start + 3] << 24));
    }

    function stringHash(text) {
        const bytes = new TextEncoder().encode(String(text));
        const length = bytes.length;
        let hash = length;
        let a;
        let b;
        if (length >= 4) {
            a = getU32(bytes, 0);
            hash = u32(hash ^ getU32(bytes, length - 4));
            b = getU32(bytes, (length >>> 1) - 2);
            hash = u32(hash ^ b);
            hash = u32(hash - rol(b, 14));
            b = u32(b + getU32(bytes, (length >>> 2) - 1));
        } else if (length > 0) {
            a = bytes[0];
            hash = u32(hash ^ bytes[length - 1]);
            b = bytes[length >>> 1];
            hash = u32(hash ^ b);
            hash = u32(hash - rol(b, 14));
        } else {
            return 0;
        }
        a = u32(a ^ hash);
        a = u32(a - rol(hash, 11));
        b = u32(b ^ a);
        b = u32(b - rol(a, 25));
        hash = u32(hash ^ b);
        hash = u32(hash - rol(b, 16));
        return hash;
    }

    class LuaNode {
        constructor() {
            this.key = null;
            this.value = false;
            this.next = null;
        }
    }

    class LuaTable {
        constructor() {
            this.nodes = [];
            this.freeTop = 0;
        }

        get mask() {
            return this.nodes.length ? this.nodes.length - 1 : 0;
        }

        main(key) {
            return stringHash(key) & this.mask;
        }

        resizeFor() {
            const keys = this.nodes.filter(node => node.value).map(node => node.key);
            const total = keys.length + 1;
            const bits = total === 1 ? 1 : Math.ceil(Math.log2(total));
            this.nodes = Array.from({ length: 1 << bits }, () => new LuaNode());
            this.freeTop = this.nodes.length;
            keys.forEach(key => this.insert(key));
        }

        insert(key) {
            if (!this.nodes.length) this.resizeFor();
            let index = this.main(key);
            let node = this.nodes[index];
            if (node.value) {
                while (true) {
                    if (this.freeTop === 0) {
                        this.resizeFor();
                        this.insert(key);
                        return;
                    }
                    this.freeTop -= 1;
                    if (this.nodes[this.freeTop].key === null) break;
                }
                const freeIndex = this.freeTop;
                const collideIndex = this.main(node.key);
                if (collideIndex !== index) {
                    let predecessor = collideIndex;
                    while (this.nodes[predecessor].next !== index) predecessor = this.nodes[predecessor].next;
                    this.nodes[predecessor].next = freeIndex;
                    const free = this.nodes[freeIndex];
                    free.value = node.value;
                    free.key = node.key;
                    free.next = node.next;
                    node.next = null;
                    node.value = false;
                    let cursor = freeIndex;
                    while (this.nodes[cursor].next !== null) {
                        const nextIndex = this.nodes[cursor].next;
                        if (this.nodes[nextIndex].value && this.main(this.nodes[nextIndex].key) === index) {
                            this.nodes[cursor].next = this.nodes[nextIndex].next;
                            this.nodes[nextIndex].next = node.next;
                            node.next = nextIndex;
                        } else {
                            cursor = nextIndex;
                        }
                    }
                } else {
                    const free = this.nodes[freeIndex];
                    free.next = node.next;
                    node.next = freeIndex;
                    index = freeIndex;
                    node = free;
                }
            }
            node.key = key;
            node.value = true;
        }

        pairs() {
            return this.nodes.filter(node => node.value).map(node => node.key);
        }
    }

    function apkPairsOrder() {
        const table = new LuaTable();
        APK_TALENT_INSERTION_ORDER.forEach(key => table.insert(key));
        return table.pairs();
    }

    function luaRandom(seed, upper) {
        const limit = BigInt(Math.trunc(Number(upper)));
        if (limit <= 0n) throw new Error('原生随机数上限必须大于 0');
        const seed32 = BigInt.asUintN(32, BigInt(Math.trunc(Number(seed))));
        let state = ((seed32 << 16n) | 0x330en) & WHALE_MASK48;
        state = (state * WHALE_MULTIPLIER + WHALE_INCREMENT) & WHALE_MASK48;
        const raw = state >> 17n;
        return Number(raw % limit) + 1;
    }

    function weightedDraw(seed, weights, roleId, salt) {
        const total = weights.reduce((sum, value) => sum + value, 0);
        const nextSeed = luaRandom(Number(seed) + total + Number(roleId) + Number(salt), MAX_RANDOM);
        const point = nextSeed % total + 1;
        let cumulative = 0;
        for (let index = 0; index < weights.length; index++) {
            cumulative += weights[index];
            if (point <= cumulative) return [index, nextSeed];
        }
        throw new Error('源码权重抽取越界');
    }

    function numeric(value, fallback = 0) {
        const result = Number(value);
        return Number.isFinite(result) ? result : fallback;
    }

    function normalizeLimit(config, name) {
        if (config && config.limits && Object.prototype.hasOwnProperty.call(config.limits, name)) {
            return config.limits[name];
        }
        return config ? config[name] : undefined;
    }

    function allowed(config, source, zi) {
        if (!numeric(config && config.weight)) return false;
        const vipLimit = normalizeLimit(config, 'vip_limit');
        if (vipLimit != null && numeric(vipLimit) > source.vip) return false;
        const charLimit = normalizeLimit(config, 'char_limit');
        if (charLimit != null
            && !(numeric(charLimit) === 101 && source.roleId === 1)
            && numeric(charLimit) !== source.roleId) return false;
        const sexLimit = normalizeLimit(config, 'sex_limit');
        if (sexLimit != null && numeric(sexLimit) !== source.sex) return false;
        const zzLimit = normalizeLimit(config, 'zz_limit');
        if (zzLimit != null) {
            if (Array.isArray(zzLimit)) {
                if (!zzLimit.slice(0, 4).map(Number).includes(zi)) return false;
            } else if (numeric(zzLimit) !== zi) return false;
        }
        const parLimit = normalizeLimit(config, 'par_limit');
        if (Array.isArray(parLimit) && source.globalVars[String(parLimit[0])] !== parLimit[1]) return false;
        const levelLimit = normalizeLimit(config, 'lv_limit');
        if (levelLimit != null && source.roleLevel > numeric(levelLimit)) return false;
        const statLimit = normalizeLimit(config, 'sx_limit');
        if (statLimit != null) {
            const limits = Array.isArray(statLimit) && Array.isArray(statLimit[0])
                ? statLimit
                : [statLimit];
            const aliases = { str: 'str_val', con: 'con', dex: 'dex', int: 'int_val' };
            for (const entry of limits) {
                if (!Array.isArray(entry) || entry.length < 2) return false;
                const rawName = String(entry[0] || '').trim();
                const statName = aliases[rawName] || rawName;
                if (numeric(source.roleStats[statName]) < numeric(entry[1])) return false;
            }
        }
        return true;
    }

    function cloneState(state) {
        return {
            bornSeed: numeric(state.bornSeed),
            luckSeed: state.luckSeed == null ? null : numeric(state.luckSeed),
            bornRC: numeric(state.bornRC),
            talLucky: numeric(state.talLucky),
            zizhi: Math.max(150, Math.min(154, Math.trunc(numeric(state.zizhi, 154)))),
            talents: (state.talents || []).map(Number),
        };
    }

    function stateKey(state) {
        return `${numeric(state.zizhi, 154)}|${state.bornSeed}|${state.luckSeed == null ? '-' : state.luckSeed}|${numeric(state.bornRC)}|${state.talLucky}|${state.talents.join(',')}`;
    }

    class Engine {
        constructor(talentData, initialState, options = {}) {
            this.source = {
                vip: numeric(initialState.vip, 1),
                roleId: numeric(initialState.role_id),
                salt: numeric(initialState.salt) % 1000000,
                sex: numeric(initialState.sex, 1),
                roleLevel: numeric(initialState.role_level, 90),
                roleStats: initialState.role_stats || {},
                globalVars: initialState.global_vars || {},
            };
            const ordered = apkPairsOrder()
                .map(key => talentData[String(key)])
                .filter(item => item && numeric(item.weight));
            if (ordered.length !== 114) {
                throw new Error(`天赋数据快照不一致：预期 114 条，实际 ${ordered.length} 条`);
            }
            this.config = new Map(ordered.map(item => [numeric(item.id), item]));
            this.allIds = ordered.map(item => numeric(item.id));
            this.allWeights = ordered.map(item => QUALITY_WEIGHT[numeric(item.weight)]);
            const purples = ordered.filter(item => numeric(item.weight) === 4);
            this.purpleIds = purples.map(item => numeric(item.id));
            this.purpleWeights = purples.map(() => 2);
            const eligibleTalentIds = Array.isArray(options.eligibleTalentIds)
                ? options.eligibleTalentIds.map(Number).filter(id => id > 0)
                : null;
            this.initialZiZhi = Math.max(150, Math.min(154, Math.trunc(numeric(initialState.zizhi, 154))));
            this.externalAllowed = eligibleTalentIds ? new Set(eligibleTalentIds.filter(id => this.config.has(id))) : null;
            this.allowed = new Set(ordered.filter(item => this.isAllowedAt(item, 154)).map(item => numeric(item.id)));
            this.dlcMode = !!options.dlcMode;
            const channel = String(options.saveChannel || initialState.save_channel || initialState.channel || '').trim().toLowerCase();
            this.international = options.international != null
                ? !!options.international
                : (channel === '国际服' || channel === '國際服' || channel === 'oversea' || channel === 'international');
            this.useBornRC = this.international || SequenceRules.washRC(initialState);
        }

        initialState(raw) {
            const zizhi = Math.max(150, Math.min(154, Math.trunc(numeric(raw.zizhi, this.initialZiZhi || 154))));
            const slots = this.slotCountFor(zizhi);
            return {
                bornSeed: numeric(raw.seed),
                luckSeed: raw.luck_seed_inited ? numeric(raw.luck_seed) : null,
                bornRC: numeric(raw.born_talent_rc != null ? raw.born_talent_rc : raw.bornTalentRC),
                talLucky: numeric(raw.tal_lucky),
                zizhi,
                talents: (raw.talents || []).map(item => numeric(item && item.id != null ? item.id : item)).filter(id => id > 0).slice(0, slots),
            };
        }

        slotCountFor(zizhi) {
            return ZZ_RULES[Math.max(150, Math.min(154, Math.trunc(numeric(zizhi, 154))))]?.slots ?? SLOT_COUNT;
        }

        isAllowedAt(configOrId, zizhi) {
            const config = typeof configOrId === 'object' ? configOrId : this.config.get(numeric(configOrId));
            if (!config) return false;
            const id = numeric(config.id);
            if (this.externalAllowed && this.externalAllowed.has(id)) return true;
            if (!allowed(config, this.source, zizhi)) return false;
            if (!this.externalAllowed) return true;
            return !allowed(config, this.source, this.initialZiZhi) && allowed(config, this.source, zizhi);
        }

        allowedSet(zizhi) {
            return new Set(this.allIds.filter(id => this.isAllowedAt(id, zizhi)));
        }

        upgradeToThree(sourceState) {
            const state = cloneState(sourceState);
            if (state.zizhi >= 153) return state;
            state.zizhi = 153;
            state.talents = state.talents.slice(0, 3);
            return state;
        }

        upgradeToFour(sourceState) {
            const state = cloneState(sourceState);
            if (state.zizhi >= 154) return state;
            state.zizhi = 154;
            state.talents = state.talents.slice(0, SLOT_COUNT);
            return state;
        }

        quality(id) {
            return numeric(this.config.get(numeric(id))?.weight);
        }

        talentType(id) {
            const item = this.config.get(numeric(id));
            return numeric(item && item.type, numeric(id));
        }

        isShenmai(id) {
            const talentId = numeric(id);
            return talentId === 248 || talentId === 249 || talentId === 250
                || this.talentType(talentId) === 248;
        }

        hasOrdinaryPurpleSuccessor(id) {
            const talentId = numeric(id);
            if (this.quality(talentId) === 4 || this.isShenmai(talentId)) return false;
            const type = this.talentType(talentId);
            return this.purpleIds.some(candidate => this.allowed.has(candidate)
                && !this.isShenmai(candidate) && this.talentType(candidate) === type);
        }

        name(id) {
            return this.config.get(numeric(id))?.name || `天赋 #${id}`;
        }

        draw(seed, purple, saltOffset = 0) {
            const ids = purple ? this.purpleIds : this.allIds;
            const weights = purple ? this.purpleWeights : this.allWeights;
            const [index, nextSeed] = weightedDraw(seed, weights, this.source.roleId, this.source.salt + numeric(saltOffset));
            return [ids[index], nextSeed];
        }

        wash(sourceState, keepPositions) {
            const state = cloneState(sourceState);
            const rule = ZZ_RULES[state.zizhi] || ZZ_RULES[154];
            const slotCount = rule.slots;
            if (!slotCount) throw new Error('当前资质没有可洗脉槽位');
            const kept = keepPositions.map(index => state.talents[index]);
            if (kept.length >= slotCount) throw new Error('全部槽位已锁定，无法继续洗脉');
            const need = slotCount - kept.length;
            const talents = kept.slice();
            let born = state.bornSeed;
            let luck = state.luckSeed;
            let bornRC = numeric(state.bornRC);
            let luckyBefore = state.talLucky;
            if (this.dlcMode) luckyBefore += Math.max(1, 3 * kept.length);
            let pityActive = luckyBefore >= (this.dlcMode ? 300 : rule.pity);
            let newPurple = false;
            let draws = 0;
            while (talents.length < slotCount) {
                let candidate;
                if (pityActive) {
                    if (luck == null) luck = born;
                    [candidate, luck] = this.draw(luck, true);
                } else {
                    [candidate, born] = this.draw(born, false, this.useBornRC ? bornRC : 0);
                    if (this.useBornRC) bornRC += 1;
                }
                draws += 1;
                if (draws > 100000) throw new Error('源码洗脉抽取未收敛');
                if (!this.isAllowedAt(candidate, state.zizhi) || talents.includes(candidate)) continue;
                if (this.quality(candidate) === 4 && newPurple) continue;
                talents.push(candidate);
                if (this.quality(candidate) === 4) {
                    newPurple = true;
                    pityActive = false;
                }
            }
            return {
                state: {
                    bornSeed: born,
                    luckSeed: luck,
                    bornRC,
                    talLucky: newPurple ? 0 : luckyBefore + need,
                    zizhi: state.zizhi,
                    talents,
                },
                cost: kept.length ? rule.baseCost + 2 * kept.length - 1 : rule.baseCost,
                draws,
                generatedBars: need,
                keepIds: kept,
            };
        }

        replaceablePositions(state, lockedIds = []) {
            const locked = new Set((lockedIds || []).map(Number));
            const shenmaiPositions = state.talents
                .map((id, index) => ({ id, index }))
                .filter(item => this.isShenmai(item.id))
                .map(item => item.index);
            const multiShenmai = shenmaiPositions.length >= 2;
            const seenType = new Map();
            const result = [];
            state.talents.forEach((id, index) => {
                const type = this.talentType(id);
                if (this.isShenmai(id) && multiShenmai) {
                    result.push(index);
                    if (!seenType.has(type)) seenType.set(type, index);
                    return;
                }
                if (seenType.has(type)) {
                    const earlierId = state.talents[seenType.get(type)];
                    if (this.quality(id) === 4 && !this.isShenmai(id)
                        && this.quality(earlierId) < 4 && locked.has(earlierId)) result.push(index);
                } else {
                    seenType.set(type, index);
                }
            });
            return result;
        }

        replace(sourceState, position, lockedIds = []) {
            const state = cloneState(sourceState);
            if (!this.replaceablePositions(state, lockedIds).includes(position)) {
                throw new Error('置换失败：普通紫脉必须在已锁定的前置非紫冲突脉之后刷出');
            }
            const talents = state.talents.slice();
            const removedId = talents.splice(position, 1)[0];
            let luck = state.luckSeed == null ? state.bornSeed : state.luckSeed;
            let draws = 0;
            while (true) {
                let candidate;
                [candidate, luck] = this.draw(luck, true);
                draws += 1;
                if (draws > 100000) throw new Error('源码置换抽取未收敛');
                if (this.isAllowedAt(candidate, state.zizhi) && !talents.includes(candidate)) {
                    talents.push(candidate);
                    return {
                        state: { bornSeed: state.bornSeed, luckSeed: luck, bornRC: numeric(state.bornRC), talLucky: 0, zizhi: state.zizhi, talents },
                        removedId,
                        addedId: candidate,
                        draws,
                    };
                }
            }
        }
    }

    root.WashSourceEngine = Object.freeze({
        APK_TALENT_INSERTION_ORDER,
        QUALITY_WEIGHT,
        PITY,
        ZZ_RULES,
        SLOT_COUNT,
        apkPairsOrder,
        luaRandom,
        weightedDraw,
        cloneState,
        stateKey,
        Engine,
    });
})(typeof window !== 'undefined' ? window : globalThis);
