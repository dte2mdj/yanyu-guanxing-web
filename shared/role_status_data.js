(function (root) {
    'use strict';

    var GROUPS = Object.freeze([
        Object.freeze({ id: 'hengshan', name: '恒山职务', note: '每日永久培养与任职效果分开计算' }),
        Object.freeze({ id: 'training', name: '门派与地点修炼', note: '按当前角色或主角独立读取' }),
        Object.freeze({ id: 'consumable', name: '丹药与食物', note: '按服用次数或一次性标记计算' }),
        Object.freeze({ id: 'other', name: '其他永久培养', note: '全队共享进度会特别标明' })
    ]);

    var HENGSHAN_POSITIONS = Object.freeze({
        1001: Object.freeze({ name: '刀法教习', effect: '攻击与刀法修为', limits: '攻击 50 · 刀法修为 100' }),
        1002: Object.freeze({ name: '剑法教习', effect: '速度与剑法修为', limits: '速度 100 · 剑法修为 100' }),
        1003: Object.freeze({ name: '长兵教习', effect: '防御与枪棍修为', limits: '防御 150 · 枪棍修为 100' }),
        1004: Object.freeze({ name: '拳脚教习', effect: '招架与拳脚修为', limits: '招架 100 · 拳脚修为 100' }),
        1005: Object.freeze({ name: '内功教习', effect: '气血与内功修为', limits: '气血 500 · 内功修为 100' }),
        1006: Object.freeze({ name: '轻功教习', effect: '闪避与轻功修为', limits: '闪避 100 · 轻功修为 100' }),
        1007: Object.freeze({ name: '总教头', effect: '任职期间气血 +2%', limits: '任职效果，不累计' }),
        1008: Object.freeze({ name: '大护法', effect: '任职期间免伤 +2%', limits: '任职效果，不累计' }),
        1009: Object.freeze({ name: '执法人', effect: '任职期间攻击 +2%', limits: '任职效果，不累计' })
    });

    var PROGRESS_SOURCES = Object.freeze([
        Object.freeze({
            id: 'jhg-hanyuguan', group: 'training', name: '拘魂阁寒玉棺',
            detail: '闭棺永久提升韧性；每次随机获得 5–12 点，按角色分别累计',
            scope: 'role', key: function (roleId) { return 'getRX_HanYuGuan_' + roleId; },
            max: 100, unit: '韧性'
        }),
        Object.freeze({
            id: 'sea-hit', group: 'training', name: '海岛浪涛修炼',
            detail: '踏浪修炼永久提升命中；每次获得 5 点，按角色分别累计',
            scope: 'role', key: function (roleId) { return 'seahit' + roleId; },
            max: 100, unit: '命中'
        }),
        Object.freeze({
            id: 'dali-pool', group: 'training', name: '苍山·蝴蝶泉修炼',
            detail: '温泉修炼永久提升气血；按角色分别累计',
            scope: 'role', key: function (roleId) { return 'dlhp_' + roleId; },
            max: 100, unit: '气血'
        }),
        Object.freeze({
            id: 'liushanmen-room', group: 'training', name: '六扇门闭关室',
            detail: '闭关永久提升命中；按角色分别累计',
            scope: 'role', key: function (roleId) { return 'getMZ_BiGuanShi_' + roleId; },
            max: 100, unit: '命中'
        }),
        Object.freeze({
            id: 'wanshache-room', group: 'training', name: '万蛇窟石室修炼',
            detail: '观摩石刻永久提升防御；按角色分别累计',
            scope: 'role', key: function (roleId) { return 'wscdef' + roleId; },
            max: 100, unit: '防御'
        }),
        Object.freeze({
            id: 'wuchang', group: 'consumable', name: '无常丹',
            detail: '每次随机永久提升一项战斗属性',
            scope: 'role', key: function (roleId) { return '2630_' + roleId; },
            max: 100, unit: '枚'
        }),
        Object.freeze({
            id: 'zhenwu', group: 'consumable', name: '真武丹',
            detail: '每次随机增加 10 点臂力、身法、根骨或内息资质',
            scope: 'role', key: function (roleId) { return '2640_' + roleId; },
            max: 100, unit: '枚'
        }),
        Object.freeze({
            id: 'huangquan', group: 'consumable', name: '黄泉水',
            detail: '每次随机永久增加攻击 3、速度 5 或命中 4',
            scope: 'role', key: function (roleId) { return '2645_' + roleId; },
            max: 3, unit: '份'
        }),
        Object.freeze({
            id: 'jiuyougu', group: 'consumable', name: '九幽菇',
            detail: '每次随机永久增加防御 6、闪避 5 或招架 5',
            scope: 'role', key: function (roleId) { return '2646_' + roleId; },
            max: 3, unit: '份'
        }),
        Object.freeze({
            id: 'taiyi-seven', group: 'consumable', name: '七宝玄丹',
            detail: '七次药力依次衰减，永久增加气血、攻击、速度、闪避与韧性',
            scope: 'role', key: function (roleId) { return '2656_' + roleId; },
            max: 7, unit: '枚'
        }),
        Object.freeze({
            id: 'cuiyuan-jindan', group: 'consumable', name: '淬元金丹',
            detail: '解锁内劲后每枚永久增加 20 点内劲',
            scope: 'role', key: function (roleId) { return '8806_' + roleId; },
            max: 5, unit: '枚', gain: Object.freeze({ label: '内劲', perUse: 20 })
        }),
        Object.freeze({
            id: 'ningtian-yugao', group: 'consumable', name: '凝天玉膏',
            detail: '解锁罡气后每份永久增加 30 点罡气',
            scope: 'role', key: function (roleId) { return '8807_' + roleId; },
            max: 5, unit: '份', gain: Object.freeze({ label: '罡气', perUse: 30 })
        }),
        Object.freeze({
            id: 'mingshe-dan', group: 'consumable', name: '冥蛇丹',
            detail: '解锁内劲后每枚永久增加 20 点内劲',
            scope: 'role', key: function (roleId) { return '8823_' + roleId; },
            max: 5, unit: '枚', gain: Object.freeze({ label: '内劲', perUse: 20 })
        }),
        Object.freeze({
            id: 'yougui-dan', group: 'consumable', name: '幽鬼丹',
            detail: '解锁罡气后每枚永久增加 20 点罡气',
            scope: 'role', key: function (roleId) { return '8824_' + roleId; },
            max: 5, unit: '枚', gain: Object.freeze({ label: '罡气', perUse: 20 })
        }),
        Object.freeze({
            id: 'renqing-dan', group: 'consumable', name: '仁青丹',
            detail: '每枚永久增加 6 点韧性；兼容新旧物品计数',
            scope: 'role', keys: function (roleId) { return ['9279_' + roleId, '9408_' + roleId]; },
            max: 5, unit: '枚', gain: Object.freeze({ label: '韧性', perUse: 6 })
        }),
        Object.freeze({
            id: 'stone-lock', group: 'other', name: '家宅石锁较力',
            detail: '胜者永久增加 1 点韧性；30 次为全队共享总上限',
            scope: 'shared', key: 'home_ssrx_max', max: 30, unit: '次'
        })
    ]);

    var ONE_TIME_SOURCES = Object.freeze([
        Object.freeze({
            id: 'one-hp-pill', group: 'consumable', name: '紫清金丹',
            detail: '按根骨永久增加 100–1000 点气血，单个角色只能服用一次',
            scope: 'role', key: function (roleId) { return '2649_' + roleId; }
        }),
        Object.freeze({
            id: 'ziwu-pill', group: 'consumable', name: '子午淬骨丹',
            detail: '永久增加 100 点韧性；该份机缘为全队一次性',
            scope: 'shared', key: 'first_2650', gain: Object.freeze({ label: '韧性', value: 100 })
        })
    ]);

    function saveRoot(saveData) {
        return Array.isArray(saveData) ? (saveData[0] || {}) : (saveData || {});
    }

    function own(object, key) {
        return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }

    function readNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
        if (value && typeof value === 'object') {
            return readNumber(value.value ?? value.Value ?? value.val ?? value.Val);
        }
        return null;
    }

    function readMap(container, key) {
        if (!container) return undefined;
        if (own(container, key)) return container[key];
        if (own(container, String(key))) return container[String(key)];
        if (Array.isArray(container)) {
            for (var index = 0; index < container.length; index += 1) {
                var entry = container[index];
                if (!entry || typeof entry !== 'object') continue;
                var entryKey = entry.ID ?? entry.Id ?? entry.id ?? entry.Key ?? entry.key;
                if (String(entryKey) === String(key)) return entry;
            }
        }
        return undefined;
    }

    function globalVariables(saveData) {
        var source = saveRoot(saveData);
        return source.globalVariable || source.GlobalVariable || source.P || null;
    }

    function readGlobal(saveData, key) {
        var variables = globalVariables(saveData);
        if (!variables) return null;
        var value = readMap(variables, key);
        return value === undefined ? 0 : readNumber(value);
    }

    function roleIdOf(role, tag) {
        var roleId = role && (role.ID ?? role.Id ?? role.id);
        if (roleId != null) return roleId;
        return tag === '主角' ? 1 : null;
    }

    function statusFor(current, max) {
        if (current === null) return 'unknown';
        if (current >= max) return 'full';
        if (current > 0) return 'progress';
        return 'not-started';
    }

    function evaluateProgressSource(source, saveData, role, tag) {
        var roleId = roleIdOf(role, tag);
        if (source.scope === 'main' && tag !== '主角') return null;
        if (source.scope === 'role' && roleId == null) return null;

        var keys = source.keys
            ? source.keys(roleId)
            : [typeof source.key === 'function' ? source.key(roleId) : source.key];
        var values = keys.map(function (key) { return readGlobal(saveData, key); });
        var current = values.every(function (value) { return value === null; })
            ? null
            : Math.max.apply(null, values.map(function (value) { return value === null ? 0 : value; }));
        if (current !== null) current = Math.max(0, Math.min(source.max, current));

        var gains = source.gain && current !== null ? [{
            label: source.gain.label,
            current: current * source.gain.perUse,
            max: source.max * source.gain.perUse
        }] : null;

        return {
            id: source.id,
            group: source.group,
            name: source.name,
            detail: source.detail,
            scope: source.scope,
            current: current,
            max: source.max,
            unit: source.unit,
            remaining: current === null ? null : Math.max(0, source.max - current),
            status: statusFor(current, source.max),
            progressKind: source.group === 'consumable' ? 'uses' : 'amount',
            gains: gains
        };
    }

    function evaluateOneTimeSource(source, saveData, role, tag) {
        var roleId = roleIdOf(role, tag);
        if (source.scope === 'role' && roleId == null) return null;
        var key = typeof source.key === 'function' ? source.key(roleId) : source.key;
        var raw = readGlobal(saveData, key);
        var used = raw === null ? null : raw > 0;
        var gains = source.gain && used !== null ? [{
            label: source.gain.label,
            current: used ? source.gain.value : 0,
            max: source.gain.value
        }] : null;

        return {
            id: source.id,
            group: source.group,
            name: source.name,
            detail: source.detail,
            scope: source.scope,
            current: used === null ? null : (used ? 1 : 0),
            max: 1,
            unit: '次',
            remaining: used === null ? null : (used ? 0 : 1),
            status: used === null ? 'unknown' : (used ? 'full' : 'not-started'),
            oneTime: true,
            progressKind: 'uses',
            gains: gains
        };
    }

    function bloodPoolMetrics(saveData, role, tag) {
        var roleId = roleIdOf(role, tag);
        var isMain = tag === '主角';
        if (!isMain && roleId == null) return null;
        var fields = isMain ? [
            ['攻击', '2660_atk', 50], ['气血', '2660_hp', 200], ['防御', '2660_def', 100],
            ['闪避', '2660_dodge', 80], ['命中', '2660_hit', 80], ['速度', '2660_speed', 80],
            ['招架', '2660_parry', 80], ['韧性', '2660_renxing', 80]
        ] : [
            ['攻击', '2660_atk_' + roleId, 50], ['气血', '2660_hp_' + roleId, 200],
            ['防御', '2660_def_' + roleId, 100], ['韧性', '2660_renxing_' + roleId, 100]
        ];
        var metrics = fields.map(function (field) {
            var current = readGlobal(saveData, field[1]);
            return {
                label: field[0],
                current: current === null ? null : Math.max(0, Math.min(field[2], current)),
                max: field[2]
            };
        });
        var known = metrics.filter(function (metric) { return metric.current !== null; });
        var full = known.length === metrics.length && known.every(function (metric) { return metric.current >= metric.max; });
        var started = known.some(function (metric) { return metric.current > 0; });
        return {
            id: 'jhg-xuechi', group: 'training', name: '拘魂阁血池淬炼',
            detail: isMain ? '主角八项永久属性分别设有上限' : '伙伴四项永久属性按角色分别设有上限',
            scope: isMain ? 'main' : 'role', metrics: metrics,
            status: known.length !== metrics.length ? 'unknown' : (full ? 'full' : (started ? 'progress' : 'not-started'))
        };
    }

    function dragonFightMetrics(saveData, tag) {
        if (tag !== '主角') return null;
        var fields = [
            ['攻击', '3255_atk', 50], ['气血', '3255_hp', 200], ['防御', '3255_def', 100],
            ['闪避', '3255_dodge', 80], ['命中', '3255_hit', 80], ['速度', '3255_speed', 80],
            ['招架', '3255_parry', 80], ['韧性', '3255_renxing', 80]
        ];
        var metrics = fields.map(function (field) {
            var current = readGlobal(saveData, field[1]);
            return {
                label: field[0],
                current: current === null ? null : Math.max(0, Math.min(field[2], current)),
                max: field[2]
            };
        });
        var known = metrics.filter(function (metric) { return metric.current !== null; });
        var full = known.length === metrics.length && known.every(function (metric) { return metric.current >= metric.max; });
        var started = known.some(function (metric) { return metric.current > 0; });
        return {
            id: 'liushanmen-longdou', group: 'training', name: '六扇门龙斗淬炼',
            detail: '主角八项永久属性分别设有上限', scope: 'main', metrics: metrics,
            status: known.length !== metrics.length ? 'unknown' : (full ? 'full' : (started ? 'progress' : 'not-started'))
        };
    }

    function findDeep(object, keys, depth, visited) {
        if (!object || typeof object !== 'object' || depth > 6 || visited.has(object)) return null;
        visited.add(object);
        for (var index = 0; index < keys.length; index += 1) {
            if (own(object, keys[index])) return object[keys[index]];
        }
        var names = Object.keys(object);
        for (var childIndex = 0; childIndex < names.length; childIndex += 1) {
            var found = findDeep(object[names[childIndex]], keys, depth + 1, visited);
            if (found !== null && found !== undefined) return found;
        }
        return null;
    }

    function hengshanJob(saveData, role, tag) {
        var roleId = roleIdOf(role, tag);
        var aliases = [roleId];
        if (tag === '主角' && String(roleId) !== '101') aliases.push(101);
        var jobs = findDeep(saveRoot(saveData), ['FDJob', 'm_tFDJob'], 0, new Set());
        var record = null;

        if (jobs) {
            for (var index = 0; index < aliases.length && !record; index += 1) {
                record = readMap(jobs, aliases[index]);
            }
            if (!record && typeof jobs === 'object') {
                record = (Array.isArray(jobs) ? jobs : Object.values(jobs)).find(function (item) {
                    if (!item || typeof item !== 'object') return false;
                    var id = item.roleId ?? item.RoleID ?? item.id ?? item.ID ?? item.onlyid;
                    return id != null && aliases.some(function (alias) { return String(alias) === String(id); });
                }) || null;
            }
        }

        var positionId = readNumber(record && (record.job ?? record.Job ?? record.position ?? record.Position ?? record.pos));
        if (positionId === null && record !== null) positionId = readNumber(record);
        var position = positionId !== null ? HENGSHAN_POSITIONS[positionId] : null;
        return {
            id: 'hengshan-job', group: 'hengshan', name: '恒山职务',
            detail: position ? position.effect + '；' + position.limits : '六类教习有永久累计上限；三类高级职务只在任职期间生效',
            scope: 'role', status: jobs ? (position ? 'active' : 'not-started') : 'unknown',
            currentText: position ? position.name : (jobs ? '当前未任职' : '存档未记录职务数据'),
            rules: Object.keys(HENGSHAN_POSITIONS).map(function (key) {
                var item = HENGSHAN_POSITIONS[key];
                return { name: item.name, effect: item.effect, limits: item.limits };
            })
        };
    }

    function evaluate(saveData, role, tag) {
        var entries = [
            hengshanJob(saveData, role, tag),
            bloodPoolMetrics(saveData, role, tag),
            dragonFightMetrics(saveData, tag)
        ];
        PROGRESS_SOURCES.forEach(function (source) {
            entries.push(evaluateProgressSource(source, saveData, role, tag));
        });
        ONE_TIME_SOURCES.forEach(function (source) {
            entries.push(evaluateOneTimeSource(source, saveData, role, tag));
        });
        return GROUPS.map(function (group) {
            return Object.assign({}, group, {
                entries: entries.filter(function (entry) { return entry && entry.group === group.id; })
            });
        }).filter(function (group) { return group.entries.length > 0; });
    }

    root.RoleStatusData = Object.freeze({
        groups: GROUPS,
        positions: HENGSHAN_POSITIONS,
        evaluate: evaluate,
        globalValue: readGlobal
    });
})(typeof window !== 'undefined' ? window : globalThis);
