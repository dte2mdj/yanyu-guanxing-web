const COLOR_NAMES = (typeof EQUIP_DATA !== 'undefined' && EQUIP_DATA.colorNames) || {
    1: '白', 2: '绿', 3: '蓝', 4: '紫', 5: '橙', 6: '红',
};
const PROP_NAMES = (typeof EQUIP_DATA !== 'undefined' && EQUIP_DATA.propNames) || {};
const TYPE_NAMES = (typeof EQUIP_DATA !== 'undefined' && EQUIP_DATA.typeNames) || {};

let makeRndSnapshot = null;
let saveLoaded = false;
let logLines = [];
let saveMeta = null;
let saveEquips = [];
let saveEquipsSnapshot = [];
let equipRuntime = {};
let equipRuntimeSnapshot = {};
let currentTab = 'make';
let craftedSeq = 900000000;
let makeAdvanceNotice = null;

const PREVIEW_MAX = 5000;
const XILIAN_MAX = 5000;
const LOG_PAGE_SIZE = 40;
const PATH_PAGE_SIZE = 12;
const MAKE_REGION_FILTER_STORAGE_KEY = 'yanyu_utils_equip_make_region_filter_v1';
const MAKE_AUTO_SHENGLIAN_STORAGE_KEY = 'yanyu_utils_equip_make_auto_shenglian_v1';
const CRAFTED_MJ_SEED_PAPER_MULTIPLIER = 198;
const SPECIAL_MATERIAL_PART_OVERRIDES = Object.freeze({
    6884: Object.freeze([7]),
});
const JIANWANG_SWORD_IDS = new Set([5707, 5708, 5709, 5710, 5711, 5712, 5713, 5714, 5715, 5716, 5717]);
const JIANWANG_LEVEL_100_IDS = new Set([5714, 5715, 5716, 5717]);
const JIANWANG_LEVEL_90_IDS = new Set([5710, 5711, 5712, 5713]);
const JIANWANG_GROW_TARGETS = Object.freeze({
    5707: Object.freeze([5708]),
    5708: Object.freeze([5709]),
    5709: Object.freeze([5710, 5711, 5712, 5713]),
});
const JIANWANG_LEVEL_100_TARGETS = Object.freeze({ 5710: 5714, 5711: 5715, 5712: 5716, 5713: 5717 });
const JIANWANG_EXT_PROP_ORDER = Object.freeze([
    'atk_add', 'hit_add', 'def_add', 'hp_add', 'speed_add', 'dodge_add', 'parry_add', 'def_ign',
    'unarmed_add', 'sword_add', 'blade_add', 'stick_add', 'hp_back', 'mp_back', 'mp_f', 'dmg_off',
    'dmg_ref', 'blood', 'renxing', 'po_parry', 'po_dodge', 'atk_extend', 'xx_prob', 'xx_crit',
]);
const JIANWANG_BASE_PROP_ORDER = Object.freeze(['atk', 'def', 'hit', 'hp', 'speed', 'dodge', 'parry', 'neijin', 'gq_base']);
const JIANWANG_COLOR_ROLL_WEIGHTS = Object.freeze([74, 20, 5, 1]);
const JIANWANG_REFORGE_COSTS = Object.freeze([
    Object.freeze([2, 3]), Object.freeze([3, 4]), Object.freeze([4, 4]),
    Object.freeze([6, 5]), Object.freeze([6, 6]),
]);
const JIANWANG_REFORGE_LIMIT = 10;
const JIANWANG_BLANK_ID = 5707;
const JIANWANG_REDSEED_MJ_MULTIPLIER = 123;
const JIANWANG_REDSEED_CZ_MULTIPLIER = 321;
const JIANWANG_SHATTER_ROUTE_IDS = Object.freeze({
    5710: 5710, 5711: 5711, 5712: 5712, 5713: 5713,
    5714: 5710, 5715: 5711, 5716: 5712, 5717: 5713,
});
const JIANWANG_SHATTER_90 = 'shatter:90';
const JIANWANG_SHATTER_100 = 'shatter:100';

let tablePager = {
    mode: null,
    page: 1,
    makeItems: [],
    specialAttachItems: [],
    xilianEntries: [],
    strongItems: [],
    jianwangItems: [],
    jianwangKind: '',
    jianwangCyclePages: [],
    strongMinSet: null,
    strongBestSet: null,
};
let jianwangReforgeCounts = {};
let jianwangReforgeCountsSnapshot = {};
let jianwangRedSeed = null;
let jianwangRedSeedSnapshot = null;
let jianwangRuleDetection = Object.freeze({
    rule: 'patched',
    confidence: 'fallback',
    reason: '没有足够的实物批次 S 可判断，保持二号补丁规则',
});
let logPage = 1;
let pathPages = { min: 1, max: 1 };

function propLabel(key) {
    return PROP_NAMES[key] || key;
}

function truncateAttributeDecimal(value, decimals = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return number;
    const factor = 10 ** decimals;
    return Math.floor(number * factor + 1e-8) / factor;
}

function formatAttributeDecimal(value, decimals = 3) {
    const truncated = truncateAttributeDecimal(value, decimals);
    if (!Number.isFinite(truncated)) return String(value);
    return Number(truncated.toFixed(decimals)).toString();
}

function formatPropValue(prop, v) {
    if (typeof v !== 'number') return String(v);
    const asPct = v < 1 || prop === 'atk_extend';
    if (!asPct) return formatAttributeDecimal(v);
    return `${formatAttributeDecimal(v * 100)}%`;
}

function formatProps(list) {
    if (!list || !list.length) return '—';
    return list.map(p => {
        const shown = formatPropValue(p.prop, p.value);
        return `<span class="prop-line">${propLabel(p.prop)}+${shown}</span>`;
    }).join('');
}

function formatBase(base) {
    if (!base || !Object.keys(base).length) return '—';
    const order = ['atk', 'def', 'hit', 'hp', 'speed', 'dodge', 'parry'];
    const parts = [];
    for (const k of order) {
        if (base[k] != null) parts.push(`${propLabel(k)}${formatAttributeDecimal(base[k])}`);
    }
    for (const [k, v] of Object.entries(base)) {
        if (!order.includes(k)) parts.push(`${propLabel(k)}${formatAttributeDecimal(v)}`);
    }
    return parts.join(' / ');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
}

function getPreviewPageSize() {
    return Number(document.getElementById('previewPageSize')?.value) || 20;
}

function updatePreviewPager(total) {
    const bar = document.getElementById('previewPager');
    const info = document.getElementById('previewPagerInfo');
    if (!bar || !info) return;
    const pagerSize = document.getElementById('previewPageSizeWrap');
    if (pagerSize) pagerSize.hidden = false;
    const pageSize = getPreviewPageSize();
    const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (tablePager.page > pages) tablePager.page = pages;
    if (tablePager.page < 1) tablePager.page = 1;
    bar.hidden = total <= 0;
    info.textContent = total
        ? `第 ${tablePager.page}/${pages} 页 · 共 ${total} 条`
        : '—';
    const prev = document.getElementById('btnPreviewPrev');
    const next = document.getElementById('btnPreviewNext');
    if (prev) prev.disabled = tablePager.page <= 1;
    if (next) next.disabled = tablePager.page >= pages;
}

function updateJianwangCyclePager(totalPages, swordIndex) {
    const bar = document.getElementById('previewPager');
    const info = document.getElementById('previewPagerInfo');
    if (!bar || !info) return;
    const pages = Math.max(1, Number(totalPages) || 1);
    if (tablePager.page > pages) tablePager.page = pages;
    if (tablePager.page < 1) tablePager.page = 1;
    bar.hidden = totalPages <= 0;
    const pagerSize = document.getElementById('previewPageSizeWrap');
    if (pagerSize) pagerSize.hidden = true;
    info.textContent = totalPages
        ? `第 ${tablePager.page}/${pages} 页 · 第 ${swordIndex || tablePager.page} 把剑`
        : '—';
    const prev = document.getElementById('btnPreviewPrev');
    const next = document.getElementById('btnPreviewNext');
    if (prev) prev.disabled = tablePager.page <= 1;
    if (next) next.disabled = tablePager.page >= pages;
}

function hidePreviewPager() {
    const bar = document.getElementById('previewPager');
    if (bar) bar.hidden = true;
    tablePager.mode = null;
    tablePager.page = 1;
}

function renderCurrentPreviewPage() {
    if (tablePager.mode === 'make') renderMakePage();
    else if (tablePager.mode === 'specialAttach') renderSpecialAttachPage();
    else if (tablePager.mode === 'xilian') renderXilianPage();
    else if (tablePager.mode === 'strong') renderStrongPage();
    else if (tablePager.mode === 'jianwang') renderJianwangPage();
}

function updateLogPager() {
    const bar = document.getElementById('logPager');
    const info = document.getElementById('logPagerInfo');
    if (!bar || !info) return;
    const total = logLines.length;
    const pages = Math.max(1, Math.ceil(total / LOG_PAGE_SIZE) || 1);
    if (logPage > pages) logPage = pages;
    if (logPage < 1) logPage = 1;
    bar.hidden = total <= LOG_PAGE_SIZE;
    info.textContent = total
        ? `第 ${logPage}/${pages} 页 · 共 ${total} 条`
        : '—';
    const prev = document.getElementById('btnLogPrev');
    const next = document.getElementById('btnLogNext');
    if (prev) prev.disabled = logPage <= 1;
    if (next) next.disabled = logPage >= pages;
}

function renderLogPage() {
    const el = document.getElementById('makeLog');
    if (!el) return;
    if (!logLines.length) {
        el.textContent = '';
        updateLogPager();
        return;
    }
    const start = (logPage - 1) * LOG_PAGE_SIZE;
    el.textContent = logLines.slice(start, start + LOG_PAGE_SIZE).join('\n');
    updateLogPager();
}

function appendLog(line) {
    logLines.push(line);
    if (logLines.length > 20000) logLines.splice(0, logLines.length - 20000);
    logPage = Math.max(1, Math.ceil(logLines.length / LOG_PAGE_SIZE));
    renderLogPage();
}

function normalizeExts(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.filter(Boolean).map(e => ({
            prop: e.Key || e.prop || e.key,
            value: e.Value != null ? e.Value : e.value,
        })).filter(e => e.prop);
    }
    return [];
}

function normalizeJianwangExts(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.filter(Boolean).map(e => ({
            prop: e.Key || e.prop || e.key,
            value: e.Value != null ? e.Value : e.value,
            S: e.S != null ? e.S : (e.s || 0),
            propCheck: e.PropCheck || e.propCheck || '',
        })).filter(e => e.prop);
    }
    return [];
}

function parseXilianMarks(raw) {
    const data = raw?.ExtsXilianData;
    if (!data || typeof data !== 'object') return [];
    return Object.keys(data)
        .filter(k => data[k])
        .map(Number)
        .filter(n => n >= 1 && n <= 3)
        .sort((a, b) => a - b);
}

function toEquipInstance(raw, source, equipped, owner = '') {
    const id = raw.ID || raw.id;
    const cfg = EQUIP_DATA.equipment[String(id)] || {};
    const marks = parseXilianMarks(raw);
    const exts = JIANWANG_SWORD_IDS.has(Number(id))
        ? normalizeJianwangExts(raw.EnExts || raw.exts)
        : normalizeExts(raw.EnExts || raw.exts);
    const noXilianExts = normalizeExts(raw.EnNoXLExts || raw.en_no_xl_exts);
    const initialExts = noXilianExts.length ? noXilianExts : exts;
    return {
        id,
        only_id: raw.OnlyID || raw.only_id || 0,
        name: cfg.name || String(id),
        need_lv: cfg.lv || 0,
        typ: cfg.type || 0,
        color: raw.Color != null ? raw.Color : (raw.color || 1),
        level: raw.Level != null ? raw.Level : (raw.level || 0),
        lv_prop: raw.LvProp != null ? raw.LvProp : (raw.lv_prop || 0),
        S: raw.S != null ? raw.S : (raw.s || 0),
        MJSeed: raw.MJSeed != null ? raw.MJSeed : (raw.mj_seed || 0),
        CZSeed: raw.CZSeed != null ? raw.CZSeed : (raw.cz_seed || 0),
        XLLevel: raw.XLLevel != null ? raw.XLLevel : (raw.xl_level || 0),
        XLNumber: raw.XLNumber != null ? raw.XLNumber : (raw.xl_number || 0),
        exp: raw.Exp != null ? raw.Exp : (raw.exp || 0),
        base: {
            atk: raw.Atk != null ? raw.Atk : (raw.atk || 0),
            def: raw.Def != null ? raw.Def : (raw.def || 0),
            hit: raw.Hit != null ? raw.Hit : (raw.hit || 0),
            hp: raw.Hp != null ? raw.Hp : (raw.hp || 0),
            speed: raw.Speed != null ? raw.Speed : (raw.speed || 0),
            dodge: raw.Dodge != null ? raw.Dodge : (raw.dodge || 0),
            parry: raw.Parry != null ? raw.Parry : (raw.parry || 0),
            neijin: raw.Neijin != null ? raw.Neijin : (raw.neijin || 0),
            gq_base: raw.Gangqi != null ? raw.Gangqi : (raw.gq_base || 0),
        },
        exts,
        specials: normalizeExts(raw.EnSpecials || raw.specials),
        xilian_marks: marks,
        xilian_accepted: marks.length,
        _source: source,
        _equipped: !!equipped,
        _owner: equipped ? String(owner || source || '').trim() : '',
        _crafted: false,
        _mark: '',
        _initial_exts: initialExts.map(p => ({ ...p })),
    };
}

function canXilian(e) {
    return e.need_lv > 90 && e.color > 1 && e.color < 5 && e.exts.length > 0;
}

function canStrong(e) {
    return e.typ >= 1 && e.typ <= 4 && e.level < 15;
}

function canShengLian(e) {
    if (!e || e.need_lv !== 90 || e.color >= 5) return false;
    const cfg = EQUIP_DATA.equipment[String(e.id)] || {};
    const nextId = cfg.equ_next || 0;
    return nextId > 0 && !!EQUIP_DATA.equipment[String(nextId)];
}

function nextCraftedOnlyId() {
    craftedSeq += 1;
    return craftedSeq;
}

function alignCraftedSeqToEquips() {
    craftedSeq = 900000000;
    for (const eq of saveEquips || []) {
        const onlyId = Number(eq?.only_id);
        if (Number.isSafeInteger(onlyId) && onlyId > craftedSeq) craftedSeq = onlyId;
    }
}

function getSourceFilter(which) {
    const id = which === 'strong'
        ? 'strongSourceFilter'
        : (which === 'shenglian' ? 'shenglianSourceFilter' : 'xilianSourceFilter');
    return document.getElementById(id)?.value || 'all';
}

function getTextFilter(which) {
    const id = which === 'strong'
        ? 'strongTextFilter'
        : (which === 'shenglian' ? 'shenglianTextFilter' : 'xilianTextFilter');
    return (document.getElementById(id)?.value || '').trim().toLowerCase();
}

function passEquipListFilter(e, which) {
    const source = getSourceFilter(which);
    if (source === 'equipped' && !e._equipped) return false;
    if (source === 'crafted' && !e._crafted) return false;

    const q = getTextFilter(which);
    if (!q) return true;
    const hay = [
        e.name,
        e._mark,
        e._source,
        e._owner,
        String(e.only_id || ''),
        COLOR_NAMES[e.color] || e.color,
        TYPE_NAMES[e.typ] || e.typ,
        `${e.need_lv}级`,
        e._crafted ? '模拟打造' : '',
        e._equipped ? '已装备' : '未装备',
    ].join(' ').toLowerCase();
    return hay.includes(q);
}

function getDefaultMakeMark() {
    return (document.getElementById('makeDefaultMark')?.value || '').trim();
}

function craftedMJSeedFromMakeResult(result, paperId) {
    const czSeed = result?.CZSeed != null ? result.CZSeed : result?.cz_seed;
    if (!Number.isSafeInteger(paperId) || paperId <= 0) {
        throw new TypeError(`打造图纸 ID 必须是正安全整数，实际为 ${String(paperId)}`);
    }
    const offset = paperId * CRAFTED_MJ_SEED_PAPER_MULTIPLIER;
    if (!Number.isSafeInteger(czSeed) || czSeed <= offset) {
        throw new TypeError(`打造结果 CZSeed 必须是大于图纸偏移 ${offset} 的安全整数，实际为 ${String(czSeed)}`);
    }
    return czSeed - offset;
}

function addCraftedFromMakeResult(r, mark, paperId) {
    if (!r || r.error || !r.equip_id) return null;
    const cfg = EQUIP_DATA.equipment[String(r.equip_id)] || {};
    const onlyId = nextCraftedOnlyId();
    const markText = (mark != null ? String(mark) : getDefaultMakeMark()).trim();
    const czSeed = r.CZSeed != null ? r.CZSeed : r.cz_seed;
    const initialExts = (r.exts || []).map(p => ({ prop: p.prop, value: p.value }));
    const eq = {
        id: r.equip_id,
        only_id: onlyId,
        name: r.name || cfg.name || String(r.equip_id),
        need_lv: cfg.lv || 0,
        typ: cfg.type || 0,
        color: r.color || 1,
        level: 0,
        lv_prop: 0,
        S: r.S != null ? r.S : (r.s || 0),
        MJSeed: craftedMJSeedFromMakeResult(r, paperId),
        CZSeed: czSeed,
        XLLevel: 0,
        XLNumber: 0,
        exts: initialExts.map(p => ({ ...p })),
        specials: (r.special || []).map(p => ({ prop: p.prop, value: p.value })),
        xilian_marks: [],
        xilian_accepted: 0,
        _source: '模拟打造',
        _equipped: false,
        _crafted: true,
        _mark: markText,
        _initial_exts: initialExts,
        _make_base: r.base || {},
        _make_region: r.region || [],
        _make_special: r.special || [],
        _make_index: r.index || 0,
    };
    saveEquips.push(eq);
    const k = runtimeKey(eq);
    const full = { ...eq, ...toWasmEquip(eq), xilian_marks: [] };
    equipRuntime[k] = JSON.parse(JSON.stringify(full));
    updateCraftedBagHint();
    renderCraftedBagList();
    return eq;
}

function setCraftedMark(onlyId, mark) {
    const text = String(mark || '').trim().slice(0, 40);
    const eq = saveEquips.find(e => e.only_id === onlyId);
    if (eq) {
        eq._mark = text;
        const k = runtimeKey(eq);
        if (equipRuntime[k]) equipRuntime[k]._mark = text;
    }
    fillEquipSelects();
    renderCraftedBagList();
}

function removeCraftedEquip(onlyId) {
    const idx = saveEquips.findIndex(e => e.only_id === onlyId && e._crafted);
    if (idx < 0) return;
    const eq = saveEquips[idx];
    const k = runtimeKey(eq);
    saveEquips.splice(idx, 1);
    delete equipRuntime[k];
    updateCraftedBagHint();
    renderCraftedBagList();
    fillEquipSelects();
}

function formatCraftedBagProps(list) {
    return Array.isArray(list) && list.length
        ? formatProps(list)
        : '<span class="crafted-prop-empty">无</span>';
}

function renderCraftedBagList() {
    const box = document.getElementById('craftedBagList');
    if (!box) return;
    const list = saveEquips.filter(e => e._crafted);
    if (!list.length) {
        box.classList.add('empty');
        box.textContent = '暂无模拟打造装备';
        return;
    }
    box.classList.remove('empty');
    box.innerHTML = list.map(e => {
        const color = COLOR_NAMES[e.color] || e.color;
        const typ = TYPE_NAMES[e.typ] || e.typ;
        const mark = e._mark || '';
        const current = equipRuntime[runtimeKey(e)] || e;
        return `<div class="crafted-bag-row" data-only-id="${e.only_id}">
            <div class="bag-meta">${escapeHtml(e.name)} · ${e.need_lv}级 · ${escapeHtml(String(color))} · ${escapeHtml(String(typ))} · #${e.only_id}</div>
            <input type="text" class="crafted-mark-input" maxlength="40" value="${escapeHtml(mark)}" placeholder="输入标记">
            <div class="bag-actions">
                <button type="button" class="btn btn-reset btn-row-action" data-act="remove">移除</button>
            </div>
            <div class="crafted-bag-props">
                <div class="crafted-prop-row">
                    <span class="crafted-prop-label">装备词条</span>
                    <span class="crafted-prop-values">${formatCraftedBagProps(current.exts || e.exts)}</span>
                </div>
                <div class="crafted-prop-row">
                    <span class="crafted-prop-label">地区附加</span>
                    <span class="crafted-prop-values">${formatCraftedBagProps(e._make_region)}</span>
                </div>
                <div class="crafted-prop-row">
                    <span class="crafted-prop-label red">红词条</span>
                    <span class="crafted-prop-values">${formatCraftedBagProps(e._make_special)}</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function calcShengLianCost(eq) {
    const cfg = EQUIP_DATA.equipment[String(eq.id)] || {};
    const nextCfg = EQUIP_DATA.equipment[String(cfg.equ_next)] || {};
    const isArmor = eq.typ >= 5 && eq.typ <= 7;
    const matId = isArmor ? 3036 : 3026;
    const matName = isArmor ? '青蝉翼' : '昆吾石';
    const price = nextCfg.price > 0 ? nextCfg.price : (cfg.price || 10000);
    const silver = Math.floor(price * 6);
    return [
        { id: 8801, name: '连金泥', n: 10 },
        { id: matId, name: matName, n: 120 },
        { id: 3001, name: '银两', n: silver },
    ];
}

function applyShengLian(key) {
    const idx = saveEquips.findIndex(e => runtimeKey(e) === key);
    if (idx < 0) return { error: '未找到装备' };
    const cur = saveEquips[idx];
    if (!canShengLian(cur)) return { error: '该装备不可升炼（需 90 级且有下一档）' };
    const cfg = EQUIP_DATA.equipment[String(cur.id)] || {};
    const nextId = cfg.equ_next;
    const nextCfg = EQUIP_DATA.equipment[String(nextId)];
    if (!nextCfg) return { error: `缺少下一档装备 ${nextId}` };

    if (!cur.only_id) cur.only_id = nextCraftedOnlyId();
    const stableKey = runtimeKey(cur);
    const rt = getRuntimeEquip(stableKey) || getRuntimeEquip(key);

    const oldName = cur.name;
    const oldLv = cur.need_lv;
    cur.id = nextId;
    cur.name = nextCfg.name || String(nextId);
    cur.need_lv = nextCfg.lv || 100;
    cur.typ = nextCfg.type || cur.typ;

    if (rt) {
        rt.id = cur.id;
        rt.name = cur.name;
        rt.need_lv = cur.need_lv;
        rt.typ = cur.typ;
        rt.only_id = cur.only_id;
        const newKey = runtimeKey(cur);
        if (key !== newKey) delete equipRuntime[key];
        if (stableKey !== newKey) delete equipRuntime[stableKey];
        equipRuntime[newKey] = { ...rt, ...toWasmEquip(rt), xilian_marks: [...(rt.xilian_marks || [])] };
    }
    return {
        ok: true,
        key: runtimeKey(cur),
        from: `${oldName}(${oldLv})`,
        to: `${cur.name}(${cur.need_lv})`,
        equip: cur,
    };
}

function updateCraftedBagHint() {
    const el = document.getElementById('craftedBagHint');
    if (!el) return;
    const n = saveEquips.filter(e => e._crafted).length;
    const marked = saveEquips.filter(e => e._crafted && e._mark).length;
    const canSl = saveEquips.filter(e => e._crafted && canShengLian(e)).length;
    const canXl = saveEquips.filter(e => e._crafted && canXilian(e)).length;
    const canSt = saveEquips.filter(e => e._crafted && canStrong(e)).length;
    el.textContent = n
        ? `模拟背包：打造 ${n} 件（已标记 ${marked}）· 可升炼 ${canSl} · 可精炼 ${canXl} · 可淬炼 ${canSt}`
        : '推进打造或预测表「推进到此」后进入模拟背包；可写标记便于筛选';
}

function toWasmEquip(eq) {
    const marks = eq.xilian_marks || [];
    return {
        id: eq.id,
        only_id: eq.only_id,
        name: eq.name,
        color: eq.color,
        level: eq.level,
        lv_prop: eq.lv_prop,
        S: eq.S,
        CZSeed: eq.CZSeed,
        MJSeed: eq.MJSeed,
        XLLevel: eq.XLLevel,
        XLNumber: eq.XLNumber,
        exp: eq.exp || 0,
        base: eq.base || {},
        exts: eq.exts,
        xilian_accepted: marks.length || eq.xilian_accepted || 0,
        xilian_marks: marks,
        need_lv: eq.need_lv || 0,
        typ: eq.typ || 0,
    };
}


function xilianCostMult(marksCount) {
    return [1, 2, 4, 8][Math.min(3, Math.max(0, marksCount))] || 8;
}

function formatSilver(wen) {
    const liang = Math.floor(wen / 1000);
    const rest = wen % 1000;
    let s = '';
    if (liang > 0) s += `${liang}两`;
    if (rest > 0 || !s) s += `${rest}文`;
    return s;
}

function calcXilianCost(eq) {
    const marks = (eq.xilian_marks || []).length;
    const mult = xilianCostMult(marks);
    const cfg = EQUIP_DATA.equipment[String(eq.id)] || {};
    const isArmor = eq.typ >= 5 && eq.typ <= 7;
    const matId = isArmor ? 3036 : 3026;
    const matName = isArmor ? '青蝉翼' : '昆吾石';
    const price = cfg.price > 0 ? cfg.price : 10000;
    const silver = Math.floor(price * 1.5);
    return {
        mult,
        mats: [
            { id: matId, name: matName, n: 5 * mult },
            { id: 8801, name: '连金泥', n: mult },
            { id: 3001, name: '银两', n: silver },
        ],
    };
}

function formatCostList(mats) {
    return mats.map(m => {
        if (m.id === 3001) return `${m.name}${formatSilver(m.n)}`;
        return `${m.name}×${m.n}`;
    }).join(' · ');
}

function xlMainBonus(xlLevel, kind) {
    const tiers = kind === 'gq_base'
        ? [[0, 10, 1], [10, 20, 1.5], [20, 30, 2], [30, 40, 2.5], [40, 50, 3],
           [50, 60, 2.5], [60, 70, 2], [70, 80, 1.5], [80, 200, 1]]
        : [[0, 10, 1], [10, 20, 2], [20, 30, 3], [30, 40, 4], [40, 50, 5],
           [50, 60, 4], [60, 70, 3], [70, 80, 2], [80, 300, 1]];
    if (xlLevel <= 0) return 0;
    let sum = 0;
    for (const [lo, hi, rate] of tiers) {
        if (xlLevel >= hi) sum += (hi - lo) * rate;
        else {
            sum += (xlLevel - lo) * rate;
            break;
        }
    }
    return Math.floor(sum);
}

function mainPropDisplay(eq, xlLevel) {
    const cfg = EQUIP_DATA.equipment[String(eq.id)] || {};
    const base = cfg.base || {};
    const out = [];
    if (base.gq_base > 0) {
        const bonus = xlMainBonus(xlLevel, 'gq_base');
        const v = Math.min(200, Math.floor(base.gq_base + bonus));
        out.push({ key: 'gq_base', label: '罡气', base: base.gq_base, value: v, bonus });
    }
    if (base.neijin > 0) {
        const bonus = xlMainBonus(xlLevel, 'neijin');
        const v = Math.min(300, Math.floor(base.neijin + bonus));
        out.push({ key: 'neijin', label: '内劲', base: base.neijin, value: v, bonus });
    }
    return out;
}

let xilianAcceptFlags = [];
let xilianPlanEquipKey = null;
let xilianPlanItems = [];
let xilianAutoPlan = null;

let strongPlanCache = null;

const STONE_NAMES = { 3027: '白炼石', 3028: '绿炼石', 3029: '蓝炼石', 3030: '紫炼石' };
const STONE_WEIGHT = { 3027: 1, 3028: 1e4, 3029: 1e8, 3030: 1e12 };

function resetXilianSession() {
    xilianAcceptFlags = [];
    xilianPlanEquipKey = null;
    xilianPlanItems = [];
    xilianAutoPlan = null;
    const box = document.getElementById('xilianPlanSummary');
    if (box) {
        box.classList.add('empty');
        box.innerHTML = '预测后勾选「保留」查看总花费与最终属性';
    }
    const bar = document.getElementById('xilianFilterBar');
    if (bar) bar.hidden = true;
    const target = document.getElementById('xilianTargetProp');
    if (target) {
        target.innerHTML = '<option value="">请先预测序列</option>';
        target.disabled = true;
    }
    const optimize = document.getElementById('btnXilianOptimize');
    if (optimize) optimize.disabled = true;
}

function qianghuaEqTier(needLv) {
    return Math.min(11, Math.max(1, Math.floor((needLv || 90) / 10) + 1));
}

function strongAttemptCost(needLv, fromLevel) {
    const target = fromLevel + 1;
    const qh = EQUIP_DATA.qianghua?.[String(target)];
    if (!qh) return null;
    const tier = qianghuaEqTier(needLv);
    const row = qh.costs?.[tier] || qh.costs?.[String(tier)];
    if (!row) return null;
    return { mat: row.mat, num: row.num, silver: row.silver, qhcd: qh.qhcd };
}

function costScore(bag) {
    let s = (bag.silver || 0);
    for (const [id, n] of Object.entries(bag.stones || {})) {
        s += (STONE_WEIGHT[id] || 1) * n;
    }
    return s;
}

function formatStoneBag(bag) {
    const parts = [];
    for (const id of [3027, 3028, 3029, 3030]) {
        const n = bag.stones?.[id] || 0;
        if (n) parts.push(`${STONE_NAMES[id]}×${n}`);
    }
    if (bag.silver) parts.push(`银两${formatSilver(bag.silver)}`);
    return parts.join(' · ') || '—';
}

function planStrongPath(grades, startLevel, targetLevel, minGrade, needLv) {
    const need = targetLevel - startLevel;
    if (need <= 0) return { minCost: { ok: false, reason: '已达期望层数' }, maxValue: { ok: false, reason: '已达期望层数' } };
    const n = grades.length;

    const better = (a, b, mode) => {
        if (!a) return true;
        if (mode === 'maxValue') {
            if (b.value !== a.value) return b.value > a.value;
            return b.score < a.score;
        }
        if (b.score !== a.score) return b.score < a.score;
        return b.value > a.value;
    };

    const run = (mode) => {
        const d = Array.from({ length: n + 1 }, () => Array(need + 1).fill(null));
        d[0][0] = { score: 0, value: 0, bag: { stones: {}, silver: 0 }, from: null };

        for (let i = 0; i < n; i++) {
            for (let k = 0; k <= need; k++) {
                const cur = d[i][k];
                if (!cur) continue;

                if (k === need) {
                    const stay = { score: cur.score, value: cur.value, bag: cur.bag, from: { i, k, action: 'done', seq: i } };
                    if (better(d[i + 1][k], stay, mode)) d[i + 1][k] = stay;
                    continue;
                }

                const level = startLevel + k;
                if (level >= 15) continue;
                const c = strongAttemptCost(needLv, level);
                if (!c) continue;

                const nextBag = {
                    stones: { ...cur.bag.stones, [c.mat]: (cur.bag.stones[c.mat] || 0) + c.num },
                    silver: cur.bag.silver + c.silver,
                };
                const sc = costScore(nextBag);
                const grade = grades[i];
                const add = Math.floor([0, 600, 700, 800, 1000][grade] * c.qhcd);

                const skipSt = {
                    score: sc, value: cur.value, bag: nextBag,
                    from: { i, k, action: 'skip', seq: i, level, grade, add },
                };
                if (better(d[i + 1][k], skipSt, mode)) d[i + 1][k] = skipSt;

                if (grade >= minGrade) {
                    const accSt = {
                        score: sc, value: cur.value + add, bag: nextBag,
                        from: { i, k, action: 'accept', seq: i, level, grade, add },
                    };
                    if (better(d[i + 1][k + 1], accSt, mode)) d[i + 1][k + 1] = accSt;
                }
            }
        }

        let best = null;
        let bestI = -1;
        for (let i = 0; i <= n; i++) {
            const st = d[i][need];
            if (!st) continue;
            if (better(best, st, mode)) {
                best = st;
                bestI = i;
            }
        }
        if (!best) {
            let maxK = -1;
            for (let i = 0; i <= n; i++) {
                for (let k = 0; k <= need; k++) {
                    if (d[i][k] && k > maxK) maxK = k;
                }
            }
            return {
                ok: false,
                reason: maxK < 0 ? '无可行路径' : `序列内最多升至 +${startLevel + maxK}（期望 +${targetLevel}），请加长序列或降低档位`,
                reached: startLevel + Math.max(0, maxK),
            };
        }

        const accepts = new Set();
        const steps = [];
        let i = bestI;
        let k = need;
        while (i > 0 || k > 0) {
            const st = d[i][k];
            if (!st || !st.from) break;
            const f = st.from;
            if (f.action === 'accept') {
                accepts.add(f.seq + 1);
                steps.push({ index: f.seq + 1, action: '接受', level: f.level, grade: f.grade, add: f.add });
                i = f.i;
                k = f.k;
            } else if (f.action === 'skip') {
                steps.push({ index: f.seq + 1, action: '取消', level: f.level, grade: f.grade, add: f.add });
                i = f.i;
                k = f.k;
            } else {
                i = f.i;
                k = f.k;
            }
        }
        steps.reverse();
        return {
            ok: true,
            mode,
            accepts,
            steps,
            bag: best.bag,
            value: best.value,
            reached: targetLevel,
            attempts: steps.filter(s => s.action !== 'done').length,
        };
    };

    return { minCost: run('minCost'), maxValue: run('maxValue') };
}

function collectEquipsFromSave(data) {
    const root = Array.isArray(data) ? data[0] : data;
    const out = [];
    const seen = new Set();

    const pushList = (list, src, equipped, owner = '') => {
        if (!list) return;
        const arr = Array.isArray(list) ? list : Object.values(list);
        for (const raw of arr) {
            if (!raw || (raw.ID == null && raw.id == null)) continue;
            const id = raw.ID ?? raw.id;
            if (!EQUIP_DATA.equipment[String(id)]) continue;
            if (raw.CZSeed == null && raw.S == null && !raw.EnExts && raw.Color == null) continue;
            const inst = toEquipInstance(raw, src, equipped, owner);
            const key = inst.only_id || `${src}:${inst.id}:${inst.CZSeed}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(inst);
        }
    };

    const asRoleList = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        if (typeof v === 'object') return Object.values(v);
        return [];
    };

    const mainRoleName = String(root.MainRole?.Name || root.MainRole?.name || '').trim();
    pushList(root.MainRole?.Equips, '主角装备', true, mainRoleName ? `主角 · ${mainRoleName}` : '主角');
    asRoleList(root.Roles).forEach((r, i) => {
        const name = r.Name || r.name || `随从${i + 1}`;
        pushList(r.Equips, name, true, `随从 · ${name}`);
    });
    asRoleList(root.Leavers).forEach((r, i) => {
        const name = r.Name || r.name || `离队${i + 1}`;
        pushList(r.Equips, name, true, `离队 · ${name}`);
    });
    pushList(root.Equips, '背包', false);
    const depots = root.EncryptDepots || root.Depots || {};
    for (const [depotId, depot] of Object.entries(depots)) {
        const list = depot?.Depots || depot?.Items || depot;
        const label = depot?.Name || depot?.name || `仓库:${depotId}`;
        pushList(list, label, false);
    }

    return out;
}

function runtimeKey(eq) {
    return String(eq.only_id || `${eq.id}_${eq.CZSeed}_${eq.S}`);
}

function getRuntimeEquip(selectId) {
    const base = saveEquips.find(e => runtimeKey(e) === selectId);
    if (!base) return null;
    return equipRuntime[selectId] || JSON.parse(JSON.stringify(toWasmEquip(base)));
}

function setRuntimeEquip(selectId, eq) {
    equipRuntime[selectId] = eq;
}


function sortedCraftsmen() {
    return Object.values(EQUIP_DATA.craftsman).sort((a, b) => {
        const pa = a.place || a.name;
        const pb = b.place || b.name;
        if (pa !== pb) return pa.localeCompare(pb, 'zh');
        return a.id - b.id;
    });
}

function papersForNpc(npcId) {
    const cm = EQUIP_DATA.craftsman[String(npcId)];
    if (!cm) return [];
    const list = [];
    const seen = new Set();
    for (const pid of cm.pf || []) {
        const paper = EQUIP_DATA.papers[String(pid)];
        if (!paper) continue;
        const eq = EQUIP_DATA.equipment[String(paper.dz_equip)];
        if (!eq) continue;
        seen.add(paper.id);
        list.push({
            selectId: paper.id,
            equipId: paper.dz_equip,
            label: `${eq.name}（免图纸·${eq.lv}级）`,
            paper,
            equip: eq,
        });
    }
    const zhi = cm.zhi || 'dazao';
    const allow = zhi === 'fengzhi' ? new Set([5, 6, 7]) : new Set([1, 2, 3, 4, 8, 9]);
    for (const paper of Object.values(EQUIP_DATA.papers)) {
        if (seen.has(paper.id)) continue;
        const eq = EQUIP_DATA.equipment[String(paper.dz_equip)];
        if (!eq || !allow.has(eq.type)) continue;
        list.push({
            selectId: paper.id,
            equipId: paper.dz_equip,
            label: `${eq.name}（${paper.name}·${eq.lv}级）`,
            paper,
            equip: eq,
        });
    }
    list.sort((a, b) => (b.equip.lv - a.equip.lv) || a.label.localeCompare(b.label, 'zh'));
    return list;
}

function fillNpcSelect() {
    const sel = document.getElementById('npcSelect');
    sel.innerHTML = '';
    for (const cm of sortedCraftsmen()) {
        const opt = document.createElement('option');
        opt.value = cm.id;
        opt.textContent = `${cm.place || cm.name} · ${cm.name}（${cm.zhi === 'fengzhi' ? '绣' : '铁'}）`;
        sel.appendChild(opt);
    }
    for (const id of ['40520', '32180', '31230', '32256']) {
        if (EQUIP_DATA.craftsman[id]) { sel.value = id; break; }
    }
}

function fillPaperSelect() {
    const npcId = Number(document.getElementById('npcSelect').value);
    const sel = document.getElementById('paperSelect');
    const filter = (document.getElementById('paperFilter')?.value || '').trim().toLowerCase();
    const prev = sel.value;
    sel.innerHTML = '';
    let matched = 0;
    for (const it of papersForNpc(npcId)) {
        if (filter) {
            const hay = `${it.label} ${it.equip?.name || ''}`.toLowerCase();
            if (!hay.includes(filter)) continue;
        }
        const opt = document.createElement('option');
        opt.value = JSON.stringify({
            selectId: it.selectId,
            equipId: it.equipId,
            minColor: it.paper.min_color,
            maxColor: it.paper.max_color,
        });
        opt.textContent = it.label;
        sel.appendChild(opt);
        matched++;
    }
    if (!matched) {
        sel.innerHTML = '<option value="">（无匹配装备）</option>';
    } else if (prev) {
        const still = [...sel.options].some(o => o.value === prev);
        if (still) sel.value = prev;
    }
    fillSpecialSelect();
    updateMakeHints();
}

function fillSpecialSelect() {
    const sel = document.getElementById('specialSelect');
    if (!sel) return;
    const previous = sel.value;
    let meta = null;
    try { meta = JSON.parse(document.getElementById('paperSelect')?.value || ''); }
    catch { }
    const equip = meta ? EQUIP_DATA.equipment[String(meta.equipId)] : null;
    sel.innerHTML = '<option value="0">不加特殊材料</option>';
    const materials = equip ? specialMaterialsForEquip(equip) : [];
    for (const sp of materials) {
        const opt = document.createElement('option');
        opt.value = sp.id;
        opt.textContent = sp.name || String(sp.id);
        sel.appendChild(opt);
    }
    if (previous && [...sel.options].some(option => option.value === previous)) {
        sel.value = previous;
    }
}

function currentMakeRequest() {
    const npcId = Number(document.getElementById('npcSelect').value);
    let meta;
    try { meta = JSON.parse(document.getElementById('paperSelect').value); }
    catch { return null; }
    return {
        npc_id: npcId,
        select_id: meta.selectId,
        equip_id: meta.equipId,
        special_id: Number(document.getElementById('specialSelect').value) || 0,
        min_color: meta.minColor,
        max_color: meta.maxColor,
    };
}

function makeRequestValidationError(req) {
    if (!req) return '请选择目标装备';
    const equip = EQUIP_DATA.equipment[String(req.equip_id)];
    if (!equip) return `目标装备 ${req.equip_id} 不存在`;
    if (!req.special_id) return '';
    const material = EQUIP_DATA.special[String(req.special_id)];
    if (!material) return `特殊材料 ${req.special_id} 不存在`;
    if (!specialMaterialSupportsEquip(material, equip)) {
        return `特殊材料「${material.name || material.id}」不适用于装备「${equip.name || equip.id}」`;
    }
    return '';
}

function requireCurrentMakeRequest() {
    const req = currentMakeRequest();
    const error = makeRequestValidationError(req);
    if (error) {
        alert(error);
        return null;
    }
    return req;
}

function updateMakeAutoShenglianControl(req) {
    const checkbox = document.getElementById('makeAutoShenglian');
    const row = document.getElementById('makeAutoShenglianRow');
    if (!checkbox) return;
    const eq = req ? EQUIP_DATA.equipment[String(req.equip_id)] : null;
    const next = eq?.equ_next ? EQUIP_DATA.equipment[String(eq.equ_next)] : null;
    const available = !!(eq && eq.lv === 90 && next);
    checkbox.disabled = !available;
    if (row) {
        row.title = available
            ? `勾选后，“推进到此”打造的装备会自动升炼为${next.name || '100级装备'}`
            : '当前目标装备不支持90→100升炼';
    }
}

function updateMakeHints() {
    const req = currentMakeRequest();
    const costEl = document.getElementById('costHint');
    const luckyEl = document.getElementById('luckyHint');
    updateMakeAutoShenglianControl(req);
    if (!req) {
        costEl.textContent = '请选择目标装备';
        luckyEl.textContent = '';
        return;
    }
    const paper = EQUIP_DATA.papers[String(req.select_id)];
    const cm = EQUIP_DATA.craftsman[String(req.npc_id)];
    const eq = EQUIP_DATA.equipment[String(req.equip_id)];
    const matName = paper && EQUIP_DATA.itemNames[String(paper.dz_mat)]
        ? EQUIP_DATA.itemNames[String(paper.dz_mat)]
        : (paper ? `材料${paper.dz_mat}` : '');
    const silver = (cm?.cost || 0) + (paper?.cost || 0);
    const freePaper = !!(cm && (cm.pf || []).map(Number).includes(Number(req.select_id)));
    if (paper) {
        const parts = [];
        if (!freePaper) parts.push(`图纸「${paper.name}」×1`);
        parts.push(`${matName}×${paper.dz_num}`);
        const special = req.special_id ? EQUIP_DATA.special[String(req.special_id)] : null;
        if (special) parts.push(`特殊材料「${special.name || special.id}」×1`);
        parts.push(`银两约 ${silver}`);
        costEl.textContent = `若执行将消耗：${parts.join('、')}（仅提示）`;
    } else {
        costEl.textContent = '消耗未知';
    }

    if (!saveLoaded) {
        luckyEl.textContent = '尚未导入存档种子';
        luckyEl.classList.remove('pity');
        return;
    }
    const st = wasmMakeGetState();
    const lucky = st?.MakeLucky?.[String(req.equip_id)]?.value ?? 0;
    const tier = Math.floor((eq?.lv || 0) / 10);
    const bucket = st?.Seeds?.[String(eq?.type)];
    const hasSeed = !!(bucket && typeof bucket === 'object' && bucket[String(tier)] != null);
    if (!hasSeed && (eq?.lv || 0) < 100) {
        luckyEl.textContent = `警告：存档无 Seeds[${eq?.type}][${tier}]，无法预测`;
        luckyEl.classList.add('pity');
    } else if (lucky >= 10) {
        luckyEl.textContent = `保底已触发（MakeLucky=${lucky}）：下一次强制紫装`;
        luckyEl.classList.add('pity');
    } else {
        luckyEl.textContent = `保底 MakeLucky=${lucky}/10 · Seeds[${eq?.type}][${tier}]`;
        luckyEl.classList.remove('pity');
    }
}

function setMakeHead() {
    setPreviewTableKind('make');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>品质</th><th>基础</th><th>蓝词条</th><th>地区附加</th><th>红词条</th><th>种子</th><th>标记</th><th>操作</th>
    </tr>`;
}

function setSpecialAttachHead() {
    setPreviewTableKind('special-attach');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>装备</th><th>材料</th><th>预测红词条</th><th>数值倍率</th><th>MJSeed（前 → 后）</th>
    </tr>`;
}

function setPreviewTableKind(kind) {
    const table = document.getElementById('previewTable');
    if (!table) return;
    table.classList.toggle('jianwang-state-table', kind === 'jianwang-state');
}

function makeSeedKind(it) {
    if (it.pity) return 'pity';
    if (it.seed_kind === 'lucky') return 'lucky';
    return 'normal';
}

function fillMakePropFilter(items) {
    const sel = document.getElementById('makeFilterProp');
    if (!sel) return;
    const prev = sel.value;
    const keys = new Set();
    for (const it of items || []) {
        for (const list of [it.exts, it.region, it.special]) {
            for (const p of list || []) {
                if (p?.prop) keys.add(p.prop);
            }
        }
    }
    const sorted = [...keys].sort((a, b) => propLabel(a).localeCompare(propLabel(b), 'zh'));
    sel.innerHTML = '<option value="">全部</option>'
        + sorted.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(propLabel(k))}</option>`).join('');
    if (prev && keys.has(prev)) sel.value = prev;
}

function restoreMakeRegionFilter() {
    const select = document.getElementById('makeFilterRegion');
    if (!select) return;
    let value = 'has';
    try {
        const stored = localStorage.getItem(MAKE_REGION_FILTER_STORAGE_KEY);
        if (stored !== null && ['', 'has', 'none'].includes(stored)) value = stored;
    } catch (e) { /* 本地存储不可用时保留默认“有” */ }
    select.value = value;
}

function persistMakeRegionFilter() {
    const value = document.getElementById('makeFilterRegion')?.value;
    if (!['', 'has', 'none'].includes(value)) return;
    try {
        localStorage.setItem(MAKE_REGION_FILTER_STORAGE_KEY, value);
    } catch (e) { /* 当前页面内的选择仍然有效 */ }
}

function restoreMakeAutoShenglian() {
    const checkbox = document.getElementById('makeAutoShenglian');
    if (!checkbox) return;
    try {
        const stored = localStorage.getItem(MAKE_AUTO_SHENGLIAN_STORAGE_KEY);
        if (stored !== null) checkbox.checked = stored === '1';
    } catch (e) { /* 本地存储不可用时保留页面默认值 */ }
}

function persistMakeAutoShenglian() {
    const checkbox = document.getElementById('makeAutoShenglian');
    if (!checkbox) return;
    try {
        localStorage.setItem(MAKE_AUTO_SHENGLIAN_STORAGE_KEY, checkbox.checked ? '1' : '0');
    } catch (e) { /* 当前页面内的选择仍然有效 */ }
}

function makeFilterMatch(it) {
    const color = document.getElementById('makeFilterColor')?.value || '';
    const seed = document.getElementById('makeFilterSeed')?.value || '';
    const prop = document.getElementById('makeFilterProp')?.value || '';
    const region = document.getElementById('makeFilterRegion')?.value || '';
    if (color && String(it.color) !== color) return false;
    if (seed && makeSeedKind(it) !== seed) return false;
    const hasRegion = Array.isArray(it.region) && it.region.length > 0;
    if (region === 'has' && !hasRegion) return false;
    if (region === 'none' && hasRegion) return false;
    if (prop) {
        const has = [...(it.exts || []), ...(it.region || []), ...(it.special || [])]
            .some(p => p?.prop === prop);
        if (!has) return false;
    }
    return true;
}

function applyMakeFilter(resetPage = false) {
    const all = tablePager.makeAllItems || [];
    tablePager.makeItems = all.filter(makeFilterMatch);
    if (resetPage) tablePager.page = 1;
    const metaFilter = document.getElementById('makeFilterMeta');
    if (metaFilter) metaFilter.textContent = `显示 ${tablePager.makeItems.length} / ${all.length} 条`;
    renderMakePage();
}

function renderMakePage() {
    const body = document.getElementById('previewBody');
    if (!body) return;
    const items = tablePager.makeItems || [];
    const pageSize = getPreviewPageSize();
    const start = (tablePager.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    const defaultMark = escapeHtml(getDefaultMakeMark());
    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="9" class="empty-row">无匹配记录</td></tr>`;
        updatePreviewPager(items.length);
        return;
    }
    body.innerHTML = slice.map(it => {
        const seedTxt = it.pity ? '保底' : (it.seed_kind === 'lucky' ? '幸运' : '普通');
        const seedCls = it.seed_kind === 'lucky' || it.pity ? 'seed-tag lucky' : 'seed-tag';
        return `<tr data-make-index="${it.index}">
            <td>${it.index}</td>
            <td class="color-${it.color}">${COLOR_NAMES[it.color] || it.color}</td>
            <td>${formatBase(it.base)}</td>
            <td>${formatProps(it.exts)}</td>
            <td>${formatProps(it.region)}</td>
            <td>${formatProps(it.special)}</td>
            <td><span class="${seedCls}">${seedTxt}</span></td>
            <td><input type="text" class="mark-input make-row-mark" maxlength="40" value="${defaultMark}" placeholder="标记"></td>
            <td><button type="button" class="btn btn-wash btn-row-action btn-make-advance" data-index="${it.index}">推进到此</button></td>
        </tr>`;
    }).join('');
    updatePreviewPager(items.length);
}

function renderMakePreview(resp) {
    setMakeHead();
    const body = document.getElementById('previewBody');
    const meta = document.getElementById('previewMeta');
    const filterBar = document.getElementById('makeFilterBar');
    const xlFilter = document.getElementById('xilianFilterBar');
    if (xlFilter) xlFilter.hidden = true;
    renderMakeAdvanceNotice();
    if (resp.error && (!resp.items || !resp.items.length)) {
        body.innerHTML = `<tr><td colspan="9" class="empty-row">${escapeHtml(resp.error)}</td></tr>`;
        meta.textContent = '';
        if (filterBar) filterBar.hidden = true;
        hidePreviewPager();
        return;
    }
    const items = resp.items || [];
    const purple = items.filter(i => i.color === 4).length;
    const sequenceTip = makeAdvanceNotice ? ' · 下表从推进后的下一件重新编号' : '';
    meta.textContent = `共 ${items.length} 件 · 紫装 ${purple} · 可点「推进到此」直达${sequenceTip}` + (resp.error ? ` · ${resp.error}` : '');
    tablePager.mode = 'make';
    tablePager.page = 1;
    tablePager.makeAllItems = items;
    if (filterBar) {
        filterBar.hidden = false;
        document.getElementById('makeFilterColor').value = '4';
        document.getElementById('makeFilterSeed').value = '';
        fillMakePropFilter(items);
        document.getElementById('makeFilterProp').value = '';
    }
    applyMakeFilter(true);
}

const SPECIAL_QUALITY_WEIGHTS = [5000, 500, 50, 5, 1];
const SPECIAL_QUALITY_RANGES = [[85, 95], [95, 105], [105, 115], [115, 125], [125, 150]];
const WHALE_MULTIPLIER = 245109059551232n;
const WHALE_INCREMENT = 48083817484545n;
const WHALE_MASK = 2147483647n;
const WHALE_REDUCTION_LIMIT = 2047483645n;

function requirePositiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${field}必须是正整数，实际为 ${String(value)}`);
    }
    return value;
}

function drawWhaleInt(seed, maximum) {
    const validSeed = requirePositiveInteger(seed, '随机种子');
    const validMaximum = requirePositiveInteger(maximum, '随机上限');
    const mixed = BigInt.asUintN(
        64,
        (BigInt(validSeed) + BigInt(validMaximum)) * WHALE_MULTIPLIER + WHALE_INCREMENT,
    );
    const raw = (mixed >> 17n) & WHALE_MASK;
    const nextSeed = Number((raw < WHALE_REDUCTION_LIMIT ? raw : raw - WHALE_REDUCTION_LIMIT) + 1n);
    return { seed: nextSeed, value: nextSeed % validMaximum + 1 };
}

function drawWeightedIndex(seed, weights, context) {
    if (!Array.isArray(weights) || !weights.length) {
        throw new TypeError(`${context}权重不能为空`);
    }
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
    const index = validWeights.findIndex((weight) => {
        cumulative += weight;
        return draw.value <= cumulative;
    });
    if (index < 0) throw new RangeError(`${context}随机值 ${draw.value} 超出总权重 ${total}`);
    return { seed: draw.seed, index };
}

function drawJianwangBetween(seed, minimum, maximum, context) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
        throw new TypeError(`${context}区间无效：${minimum}–${maximum}`);
    }
    const draw = drawWhaleInt(seed, maximum - minimum + 1);
    return { seed: draw.seed, value: draw.value - 1 + minimum };
}

const JIANWANG_RULE_PATCHED = 'patched';
const JIANWANG_RULE_STANDARD = 'standard';

function classifyJianwangExtSeedBatch(equip) {
    if (!equip || !isJianwangSword(equip) || !Array.isArray(equip.exts)) return null;
    const seeds = equip.exts.map(ext => Number(ext?.S || 0));
    if (seeds.length < 2 || seeds.some(seed => !Number.isSafeInteger(seed) || seed <= 0)) return null;

    // 游戏保留词条时只覆盖下一批的一号位，不会让新生成词条顺延。
    // 因此 3 条以上时用第 2..N 位判断“本轮新生成批次”；一号位允许保留旧 S。
    const generatedBatch = seeds.length >= 3 ? seeds.slice(1) : seeds;
    if (new Set(generatedBatch).size === 1) return JIANWANG_RULE_PATCHED;

    // 当前已经确认的无保留 70→80 实物中，原项目规则会让两条新词出现不同 S。
    // 2 槽装备无法安全剔除一号位，所以两条不同才作为原项目规则证据。
    if (seeds.length === 2) return JIANWANG_RULE_STANDARD;
    return null;
}

function detectJianwangRuleFromEquips(equips) {
    const evidence = (Array.isArray(equips) ? equips : [])
        .filter(isJianwangSword)
        .map(equip => ({ equip, rule: classifyJianwangExtSeedBatch(equip) }))
        .filter(item => item.rule);
    const patchedCount = evidence.filter(item => item.rule === JIANWANG_RULE_PATCHED).length;
    const standardCount = evidence.filter(item => item.rule === JIANWANG_RULE_STANDARD).length;

    if (standardCount > 0 && patchedCount === 0) {
        return Object.freeze({
            rule: JIANWANG_RULE_STANDARD,
            confidence: standardCount > 1 ? 'batch-consensus' : 'batch-evidence',
            reason: `${standardCount} 把实物的可判定新生成批次的 EnExts.S 不一致，使用原项目规则`,
        });
    }
    if (patchedCount > 0 && standardCount === 0) {
        return Object.freeze({
            rule: JIANWANG_RULE_PATCHED,
            confidence: patchedCount > 1 ? 'batch-consensus' : 'batch-evidence',
            reason: `${patchedCount} 把实物的可判定新生成批次共用 EnExts.S，使用二号补丁规则`,
        });
    }
    if (standardCount > patchedCount) {
        return Object.freeze({
            rule: JIANWANG_RULE_STANDARD,
            confidence: 'batch-majority',
            reason: `实物批次 S 证据冲突（原项目 ${standardCount} / 二号补丁 ${patchedCount}），按多数使用原项目规则`,
        });
    }
    if (patchedCount > standardCount) {
        return Object.freeze({
            rule: JIANWANG_RULE_PATCHED,
            confidence: 'batch-majority',
            reason: `实物批次 S 证据冲突（二号补丁 ${patchedCount} / 原项目 ${standardCount}），按多数使用二号补丁规则`,
        });
    }
    return Object.freeze({
        rule: JIANWANG_RULE_PATCHED,
        confidence: evidence.length ? 'conflict-fallback' : 'fallback',
        reason: evidence.length
            ? '实物批次 S 证据数量相同且互相冲突，保持二号补丁规则'
            : '没有至少两条且带有效 EnExts.S 的剑王阁实物，保持二号补丁规则',
    });
}

function currentJianwangRule() {
    return jianwangRuleDetection?.rule === JIANWANG_RULE_STANDARD
        ? JIANWANG_RULE_STANDARD
        : JIANWANG_RULE_PATCHED;
}

function generateJianwangEquip(targetId, startSeed, rule = JIANWANG_RULE_PATCHED) {
    const cfg = EQUIP_DATA.equipment[String(targetId)];
    if (!cfg || !JIANWANG_SWORD_IDS.has(Number(targetId))) {
        throw new RangeError(`无效的剑王阁目标装备：${targetId}`);
    }
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
    const candidateWeights = candidates.map(prop => Math.max(0, Math.floor(Number(cfg.exts[prop][1]) || 0)));
    const slotCount = Math.max(0, Math.floor(((Number(cfg.lv) || 60) - 60) / 10) + 1);
    const exts = [];
    for (let slot = 0; slot < slotCount; slot++) {
        const propDraw = drawWeightedIndex(seed, candidateWeights, '剑王阁副属性');
        seed = propDraw.seed;
        const prop = candidates[propDraw.index];
        exts.push({
            prop,
            value: Number(cfg.exts[prop][0]),
        });
        if (standard) candidateWeights[propDraw.index] = 0;
    }
    return { id: Number(targetId), seedAfter: seed, base, exts };
}

function validJianwangRedSeed(value) {
    const seed = Number(value);
    return Number.isSafeInteger(seed) && seed > 0;
}

function createJianwangBlankFromRedSeed(redSeed, swordIndex = null) {
    const sourceRedSeed = requirePositiveInteger(Number(redSeed), 'RedSeeds[5707]');
    const sequenceIndex = swordIndex == null ? null : requirePositiveInteger(Number(swordIndex), '模拟背包剑序号');
    const baseSeed = Math.floor(sourceRedSeed / 10);
    const MJSeed = baseSeed + JIANWANG_BLANK_ID * JIANWANG_REDSEED_MJ_MULTIPLIER;
    const CZSeed = baseSeed + JIANWANG_BLANK_ID * JIANWANG_REDSEED_CZ_MULTIPLIER;
    requirePositiveInteger(MJSeed, '新剑胚 MJSeed');
    requirePositiveInteger(CZSeed, '新剑胚 CZSeed');
    const generated = generateJianwangEquip(JIANWANG_BLANK_ID, sourceRedSeed, JIANWANG_RULE_STANDARD);
    const nextRedSeed = drawWhaleInt(sourceRedSeed, SequenceRules.makeMax(saveMeta)).seed;
    const cfg = EQUIP_DATA.equipment[String(JIANWANG_BLANK_ID)] || {};
    const equip = {
        id: JIANWANG_BLANK_ID,
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
        exts: generated.exts.map(item => ({ prop: item.prop, value: item.value })),
        specials: [],
        xilian_marks: [],
        xilian_accepted: 0,
        _source: sequenceIndex ? '模拟背包' : '网页碎剑重铸',
        _equipped: false,
        _crafted: false,
        _mark: '',
        _jianwangRebuilt: true,
        _jianwangSwordIndex: sequenceIndex,
    };
    return {
        redSeedBefore: sourceRedSeed,
        redSeedAfter: nextRedSeed,
        baseSeed,
        MJSeed,
        CZSeed,
        S: generated.seedAfter,
        swordIndex: sequenceIndex,
        base: generated.base,
        exts: generated.exts.map(item => ({ prop: item.prop, value: item.value })),
        equip,
    };
}

function predictJianwangFutureBlanks(startRedSeed, count = 1) {
    const total = Number(count);
    if (!Number.isSafeInteger(total) || total < 1 || total > PREVIEW_MAX) {
        throw new RangeError(`预览把数必须是 1–${PREVIEW_MAX} 的整数`);
    }
    let redSeed = requirePositiveInteger(Number(startRedSeed), 'RedSeeds[5707]');
    const rows = [];
    for (let index = 1; index <= total; index++) {
        const created = createJianwangBlankFromRedSeed(redSeed);
        rows.push({ index, ...created });
        redSeed = created.redSeedAfter;
    }
    return rows;
}

function jianwangShatterRouteId(equip) {
    const routeId = JIANWANG_SHATTER_ROUTE_IDS[Number(equip?.id)];
    if (!routeId) throw new TypeError('只有90级专武或100级神兵可以碎剑重铸');
    return routeId;
}

function predictJianwangShatterRebuild(equip, action, redSeed) {
    if (!equip || !isJianwangSword(equip)) throw new TypeError('请选择存档中的剑王阁实物');
    const id = Number(equip.id);
    const isNinety = action === JIANWANG_SHATTER_90 && JIANWANG_LEVEL_90_IDS.has(id);
    const isHundred = action === JIANWANG_SHATTER_100 && JIANWANG_LEVEL_100_IDS.has(id);
    if (!isNinety && !isHundred) {
        throw new RangeError(action === JIANWANG_SHATTER_90
            ? '90级碎剑只能用于5710～5713'
            : '100级碎神兵只能用于5714～5717');
    }
    const nextSwordIndex = Math.max(0, Math.floor(Number(equip._jianwangSwordIndex) || 0)) + 1;
    const created = createJianwangBlankFromRedSeed(redSeed, nextSwordIndex);
    const fromStage = jianwangStageName(equip);
    return {
        index: 1,
        action,
        routeId: jianwangShatterRouteId(equip),
        fromId: id,
        toId: JIANWANG_BLANK_ID,
        fromName: fromStage,
        toName: jianwangStageName(created.equip),
        shatterLabel: isNinety ? '90级碎剑' : '100级碎神兵',
        cost: '碎剑返还：剑胚6518×1、雪银3024×200、紫金3025×300、青金石2000×10、陨铁2020×2、贡献-500、碎剑计数+1；重新锻造：剑胚6518×1、雪银3024×200、青金石2000×10、贡献-500',
        ...created,
    };
}

function resolveJianwangCycleRouteId(equip, requestedRouteId = null) {
    if (!equip || !isJianwangSword(equip)) throw new TypeError('请选择剑王阁剑胚或专武');
    const id = Number(equip.id);
    const fixedRouteId = JIANWANG_SHATTER_ROUTE_IDS[id];
    if (fixedRouteId) return fixedRouteId;
    if (![5707, 5708, 5709].includes(id)) throw new TypeError('当前剑王阁装备不能进入碎剑预览');
    const routeId = Number(requestedRouteId);
    if (!JIANWANG_LEVEL_90_IDS.has(routeId)) throw new TypeError('请选择90级专武路线');
    return routeId;
}

function prepareJianwangCycleStart(equip, routeId, rule = currentJianwangRule()) {
    let current = JSON.parse(JSON.stringify(equip));
    const rows = [];
    const targets = [];
    if (Number(current.id) === 5707) targets.push(5708, 5709, routeId);
    else if (Number(current.id) === 5708) targets.push(5709, routeId);
    else if (Number(current.id) === 5709) targets.push(routeId);
    for (const targetId of targets) {
        const row = predictJianwangStateSequence(current, `grow:${targetId}`, 1, 0, 0, rule)[0];
        current = JSON.parse(JSON.stringify(row.equip));
        rows.push({ ...row, index: rows.length + 1 });
    }
    return { equip: current, rows };
}

function predictJianwangShatterCycle(equip, startRedSeed, count = 1, rule = currentJianwangRule(), requestedRouteId = null) {
    if (!equip || !isJianwangSword(equip)) {
        throw new TypeError('碎剑预览只能从剑王阁5707～5717实物开始');
    }
    const total = Number(count);
    if (!Number.isSafeInteger(total) || total < 1 || total > PREVIEW_MAX) {
        throw new RangeError(`循环次数必须是 1–${PREVIEW_MAX} 的整数`);
    }
    const initial = JSON.parse(JSON.stringify(equip));
    const routeId = resolveJianwangCycleRouteId(initial, requestedRouteId);
    const prepared = prepareJianwangCycleStart(initial, routeId, rule);
    let current = prepared.equip;
    let redSeed = requirePositiveInteger(Number(startRedSeed), 'RedSeeds[5707]');
    const initialId = Number(initial.id);
    const entryNote = JIANWANG_LEVEL_100_IDS.has(initialId)
        ? `${jianwangStageName(initial)}直接碎神兵进入第1轮`
        : prepared.rows.length
            ? `${jianwangStageName(initial)}先无保留升至${jianwangStageName(current)}后碎剑进入第1轮`
            : `${jianwangStageName(initial)}直接碎剑进入第1轮`;
    const pages = [];
    for (let cycle = 1; cycle <= total; cycle++) {
        const shatterAction = JIANWANG_LEVEL_100_IDS.has(Number(current.id))
            ? JIANWANG_SHATTER_100
            : JIANWANG_SHATTER_90;
        const shatter = predictJianwangShatterRebuild(current, shatterAction, redSeed);
        let stage = JSON.parse(JSON.stringify(shatter.equip));
        const rows = [{
            index: 1,
            action: 'blank',
            fromId: Number(current.id),
            toId: JIANWANG_BLANK_ID,
            fromName: jianwangStageName(current),
            toName: jianwangStageName(stage),
            seedBefore: Number(stage.CZSeed),
            seedAfter: Number(stage.CZSeed),
            base: stage.base || {},
            exts: stage.exts || [],
            kept: null,
            cost: shatter.cost,
            shatterLabel: shatter.shatterLabel,
            equip: JSON.parse(JSON.stringify(stage)),
            redSeedBefore: shatter.redSeedBefore,
            redSeedAfter: shatter.redSeedAfter,
        }];
        const growActions = ['grow:5708', 'grow:5709', `grow:${routeId}`];
        for (const action of growActions) {
            const row = predictJianwangStateSequence(stage, action, 1, 0, 0, rule)[0];
            stage = JSON.parse(JSON.stringify(row.equip));
            rows.push({ ...row, index: rows.length + 1 });
        }
        const reforges = predictJianwangStateSequence(stage, 'reforge', JIANWANG_REFORGE_LIMIT, 0, 0, rule);
        for (const row of reforges) {
            stage = JSON.parse(JSON.stringify(row.equip));
            rows.push({ ...row, index: rows.length + 1 });
        }
        pages.push({
            cycle,
            swordIndex: Number(shatter.equip._jianwangSwordIndex) || cycle,
            routeId,
            name: shatter.equip.name,
            entryNote: cycle === 1 ? entryNote : '',
            initialPreparation: cycle === 1 ? prepared.rows : [],
            shatterLabel: shatter.shatterLabel,
            blank: JSON.parse(JSON.stringify(shatter.equip)),
            finalEquip: JSON.parse(JSON.stringify(stage)),
            redSeedBefore: shatter.redSeedBefore,
            redSeedAfter: shatter.redSeedAfter,
            rows,
        });
        current = stage;
        redSeed = shatter.redSeedAfter;
    }
    return pages;
}

function requireJianwangKeepIndex(equip, action, keepIndex) {
    const index = Number(keepIndex) || 0;
    const limit = jianwangKeepLimit(equip, action);
    if (!Number.isSafeInteger(index) || index < 0 || index > limit) {
        throw new RangeError(`保留槽位必须是 0–${limit} 的整数`);
    }
    return index;
}

function predictJianwangGrow(equip, targetId, keepIndex = 0, rule = currentJianwangRule()) {
    if (!equip || !isJianwangSword(equip)) throw new TypeError('请选择存档中的剑王阁实物');
    if (!validJianwangCZSeed(equip)) throw new TypeError('所选实物缺少有效 CZSeed');
    const fromId = Number(equip.id);
    const target = Number(targetId);
    const action = target === fromId ? 'reforge' : `grow:${target}`;
    const allowed = target === fromId
        ? JIANWANG_LEVEL_90_IDS.has(fromId)
        : (JIANWANG_GROW_TARGETS[fromId] || []).includes(target);
    if (!allowed) throw new RangeError(`不允许从 ${fromId} 成长到 ${target}`);
    const index = requireJianwangKeepIndex(equip, action, keepIndex);
    const generated = generateJianwangEquip(target, Number(equip.CZSeed), rule);
    const exts = generated.exts.map(item => ({ prop: item.prop, value: item.value }));
    if (index > 0) {
        const kept = equip.exts[index - 1];
        exts.splice(0, 1);
        exts.unshift({ prop: kept.prop, value: kept.value });
    }
    const cfg = EQUIP_DATA.equipment[String(target)];
    return {
        ...JSON.parse(JSON.stringify(equip)),
        id: target,
        name: cfg.name,
        need_lv: cfg.lv,
        typ: cfg.type,
        color: 6,
        exp: target === fromId ? Number(equip.exp) || 0 : 0,
        base: generated.base,
        exts,
        CZSeed: generated.seedAfter,
    };
}

function predictJianwangAscend(equip, targetId) {
    if (!equip || !JIANWANG_LEVEL_90_IDS.has(Number(equip.id))) {
        throw new TypeError('只有存档中的90级剑王阁专武可以铸为100级神兵');
    }
    const target = Number(targetId);
    if (JIANWANG_LEVEL_100_TARGETS[Number(equip.id)] !== target) {
        throw new RangeError(`90级专武 ${equip.id} 不能转换为 ${target}`);
    }
    const cfg = EQUIP_DATA.equipment[String(target)];
    return {
        ...JSON.parse(JSON.stringify(equip)),
        id: target,
        name: cfg.name,
        need_lv: cfg.lv,
        typ: cfg.type,
        color: 6,
        exp: 0,
        base: { ...(cfg.base || {}) },
        exts: (equip.exts || []).slice(0, 6).map(item => ({ prop: item.prop, value: item.value })),
        CZSeed: equip.CZSeed,
    };
}

function predictJianwangStateSequence(equip, action, count = 1, keepIndex = 0, completedReforges = 0, rule = currentJianwangRule()) {
    if (!equip) throw new TypeError('请选择存档中的剑王阁实物');
    const total = action === 'reforge' ? Number(count) : 1;
    if (!Number.isSafeInteger(total) || total < 1 || total > PREVIEW_MAX) {
        throw new RangeError(`预测次数必须是 1–${PREVIEW_MAX} 的整数`);
    }
    if (action === 'reforge') {
        const completed = Math.max(0, Math.floor(Number(completedReforges) || 0));
        const remaining = Math.max(0, JIANWANG_REFORGE_LIMIT - completed);
        if (total > remaining) {
            throw new RangeError(remaining > 0
                ? `此流派已重铸 ${completed} 次，仅剩 ${remaining} 次可预览`
                : `此流派已重铸 ${completed} 次，已达 ${JIANWANG_REFORGE_LIMIT} 次上限`);
        }
    }
    let current = JSON.parse(JSON.stringify(equip));
    const rows = [];
    for (let index = 1; index <= total; index++) {
        const before = current;
        if (action === 'reforge') {
            current = predictJianwangGrow(current, current.id, keepIndex, rule);
        } else if (action.startsWith('grow:')) {
            current = predictJianwangGrow(current, Number(action.split(':')[1]), keepIndex, rule);
        } else if (action.startsWith('ascend:')) {
            current = predictJianwangAscend(current, Number(action.split(':')[1]));
        } else {
            throw new RangeError(`不支持的剑王阁流程：${action}`);
        }
        const kept = Number(keepIndex) > 0 ? before.exts?.[Number(keepIndex) - 1] : null;
        rows.push({
            index,
            action,
            fromId: Number(before.id),
            toId: Number(current.id),
            fromName: jianwangStageName(before),
            toName: jianwangStageName(current),
            seedBefore: Number(before.CZSeed),
            seedAfter: Number(current.CZSeed),
            base: current.base || {},
            exts: current.exts || [],
            kept: kept ? { prop: kept.prop, value: kept.value } : null,
            cost: action === 'reforge'
                ? jianwangReforgeCost(Number(completedReforges) + index)
                : jianwangCostText(before, action, index),
            equip: JSON.parse(JSON.stringify(current)),
        });
    }
    return rows;
}

function requireSpecialMaterial(material, equip) {
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
        throw new TypeError('特殊材料必须是对象');
    }
    if (!Number.isSafeInteger(material.id) || typeof material.name !== 'string' || !material.name) {
        throw new TypeError('特殊材料缺少有效的 id 或名称');
    }
    if (!specialMaterialSupportsEquip(material, equip)) {
        throw new RangeError(`特殊材料「${material.name}」不适用于装备「${equip.name}」`);
    }
    if (!Array.isArray(material.prop) || !material.prop.length) {
        throw new TypeError(`特殊材料「${material.name}」缺少属性权重`);
    }
    if (!material.lvs || typeof material.lvs !== 'object' || Array.isArray(material.lvs)) {
        throw new TypeError(`特殊材料「${material.name}」缺少等级数值`);
    }
    return material;
}

function specialMaterialParts(material) {
    if (!Array.isArray(material.part)) {
        throw new TypeError(`特殊材料「${material.name}」的适用部位格式无效`);
    }
    if (material.part.length) return material.part;
    return SPECIAL_MATERIAL_PART_OVERRIDES[String(material.id)] || [];
}

function specialMaterialSupportsEquip(material, equip) {
    const equipType = equip && (equip.typ != null ? equip.typ : equip.type);
    return specialMaterialParts(material).includes(equipType);
}

function clearMakeAdvanceNotice() {
    makeAdvanceNotice = null;
    renderMakeAdvanceNotice();
}

function setMakeAdvanceNotice(result, crafted, advancedCount) {
    const n = Math.max(1, Math.floor(Number(advancedCount) || 1));
    const rawColor = Number(result?.color);
    const color = Number.isSafeInteger(rawColor) && rawColor >= 1 && rawColor <= 6 ? rawColor : 1;
    const rawOnlyId = Number(crafted?.only_id);
    makeAdvanceNotice = {
        advancedCount: n,
        result: {
            name: result?.name || String(result?.equip_id || '装备'),
            color,
            base: result?.base || {},
            exts: result?.exts || [],
            region: result?.region || [],
            special: result?.special || [],
            seed_kind: result?.seed_kind || 'normal',
            pity: !!result?.pity,
        },
        onlyId: Number.isSafeInteger(rawOnlyId) && rawOnlyId > 0 ? rawOnlyId : null,
        mark: crafted?._mark || '',
    };
    renderMakeAdvanceNotice();
}

function renderMakeAdvanceNotice() {
    const box = document.getElementById('makeAdvanceNotice');
    if (!box) return;
    if (!makeAdvanceNotice || currentTab !== 'make') {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    const { advancedCount: n, result, onlyId, mark } = makeAdvanceNotice;
    const color = COLOR_NAMES[result.color] || result.color;
    const seed = result.pity ? '保底' : (result.seed_kind === 'lucky' ? '幸运' : '普通');
    const middle = n > 1 ? `前 ${n - 1} 件只推进、未加入背包；` : '';
    const bag = onlyId ? `已加入模拟背包 #${onlyId}` : '已完成推进';
    const markText = mark ? ` · 标记「${escapeHtml(mark)}」` : '';
    box.innerHTML = `<div class="make-advance-notice-head">
        <span class="make-advance-notice-title">本次推进结果：${escapeHtml(result.name)} · <span class="color-${result.color}">${escapeHtml(String(color))}</span> · ${escapeHtml(seed)}${markText}</span>
        <span class="make-advance-notice-sequence">${middle}第 ${n} 件${bag}；下表从下一件重新编号</span>
    </div>
    <div class="make-advance-notice-details">
        <div class="make-advance-notice-detail"><strong>基础属性</strong>${formatBase(result.base)}</div>
        <div class="make-advance-notice-detail"><strong>蓝/紫词条</strong>${formatProps(result.exts)}</div>
        <div class="make-advance-notice-detail"><strong>地区附加</strong>${formatProps(result.region)}</div>
        <div class="make-advance-notice-detail"><strong>特殊材料</strong>${formatProps(result.special)}</div>
    </div>`;
    box.hidden = false;
}

function specialMaterialProperties(material) {
    return material.prop.map((entry, index) => {
        if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== 'string' || !entry[0]) {
            throw new TypeError(`特殊材料「${material.name}」第 ${index + 1} 项属性格式无效`);
        }
        if (!Number.isSafeInteger(entry[1]) || entry[1] < 0) {
            throw new TypeError(`特殊材料「${material.name}」第 ${index + 1} 项属性权重无效`);
        }
        return { prop: entry[0], weight: entry[1] };
    });
}

function specialMaterialBaseValue(material, equipLevel, propertyIndex) {
    const level = requirePositiveInteger(equipLevel, '装备等级');
    const raw = material.lvs[`lv${level}`];
    if (raw === undefined) {
        throw new RangeError(`特殊材料「${material.name}」没有 lv${level} 数值`);
    }
    const value = Array.isArray(raw) ? raw[propertyIndex] : raw;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new TypeError(`特殊材料「${material.name}」的 lv${level} 第 ${propertyIndex + 1} 项数值无效`);
    }
    return value;
}

function scaleSpecialMaterialValue(baseValue, factor) {
    if (baseValue < 1) return baseValue * factor / 100;
    return Math.max(1, Math.floor(baseValue * factor / 100));
}

function predictSpecialAttachSequence(equip, material, count) {
    if (!equip || typeof equip !== 'object' || Array.isArray(equip)) {
        throw new TypeError('目标装备必须是对象');
    }
    const validCount = requirePositiveInteger(count, '预测次数');
    const validMaterial = requireSpecialMaterial(material, equip);
    const properties = specialMaterialProperties(validMaterial);
    let seed = requirePositiveInteger(equip.MJSeed, `装备「${equip.name}」的 MJSeed`);
    const items = [];
    for (let index = 1; index <= validCount; index += 1) {
        const seedBefore = seed;
        const propertyDraw = drawWeightedIndex(seed, properties.map(item => item.weight), '材料属性');
        seed = propertyDraw.seed;
        const qualityDraw = drawWeightedIndex(seed, SPECIAL_QUALITY_WEIGHTS, '材料品质');
        seed = qualityDraw.seed;
        const range = SPECIAL_QUALITY_RANGES[qualityDraw.index];
        const factorDraw = drawWhaleInt(seed, range[1] - range[0] + 1);
        seed = factorDraw.seed;
        const factor = range[0] + factorDraw.value - 1;
        const selected = properties[propertyDraw.index];
        const baseValue = specialMaterialBaseValue(validMaterial, equip.need_lv, propertyDraw.index);
        items.push({
            index,
            equipName: equip.name,
            materialName: validMaterial.name,
            prop: selected.prop,
            value: scaleSpecialMaterialValue(baseValue, factor),
            factor,
            factorMin: range[0],
            factorMax: range[1],
            seedBefore,
            seedAfter: seed,
        });
    }
    const maxValue = Math.max(...items.map(item => item.value));
    return items.map(item => ({ ...item, isBest: item.value === maxValue }));
}

function renderSpecialAttachPage() {
    const body = document.getElementById('previewBody');
    if (!body) return;
    const items = tablePager.specialAttachItems || [];
    const pageSize = getPreviewPageSize();
    const start = (tablePager.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    if (!slice.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty-row">无预测记录</td></tr>';
        updatePreviewPager(items.length);
        return;
    }
    body.innerHTML = slice.map(item => `<tr class="${item.isBest ? 'special-attach-best' : ''}">
        <td>${item.index}</td>
        <td>${escapeHtml(item.equipName)}</td>
        <td>${escapeHtml(item.materialName)}</td>
        <td class="special-attach-value">${escapeHtml(propLabel(item.prop))}+${formatPropValue(item.prop, item.value)}</td>
        <td>${item.factor}% · 区间 ${item.factorMin}–${item.factorMax}%${item.isBest ? ' · 最高' : ''}</td>
        <td>${item.seedBefore} → ${item.seedAfter}</td>
    </tr>`).join('');
    updatePreviewPager(items.length);
}

function renderSpecialAttachPreview(items) {
    setSpecialAttachHead();
    const meta = document.getElementById('previewMeta');
    const makeFilter = document.getElementById('makeFilterBar');
    const xilianFilter = document.getElementById('xilianFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    if (xilianFilter) xilianFilter.hidden = true;
    const bestIndexes = items.filter(item => item.isBest).map(item => item.index).join('、');
    tablePager.mode = 'specialAttach';
    tablePager.page = 1;
    tablePager.specialAttachItems = items;
    if (meta) meta.textContent = `连续附加 ${items.length} 次 · 最高值位于第 ${bestIndexes} 次 · 只读预测，不推进 MJSeed`;
    renderSpecialAttachPage();
}

function setJianwangCycleHead() {
    setPreviewTableKind('jianwang-state');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>结果</th><th>基础属性</th><th>副属性</th><th>种子 / 消耗</th>
    </tr>`;
}

function renderJianwangCyclePage() {
    const body = document.getElementById('previewBody');
    const meta = document.getElementById('previewMeta');
    const pages = tablePager.jianwangCyclePages || [];
    if (!body) return;
    const page = pages[tablePager.page - 1];
    if (!page) {
        body.innerHTML = '<tr><td colspan="5" class="empty-row">无碎剑循环记录</td></tr>';
        if (meta) meta.textContent = '';
        updateJianwangCyclePager(0, 0);
        return;
    }
    setJianwangCycleHead();
    const blankName = page.blank?.name || '剑胚';
    if (meta) {
        const entryText = page.entryNote ? ` · ${page.entryNote}` : '';
        meta.textContent = `模拟背包 · ${blankName} · 第 ${page.swordIndex} 把剑 · 碎剑预览${entryText} · 本页含60→90与10次不保留重铸 · 预览不推进状态`;
    }
    body.innerHTML = page.rows.map((item, rowIndex) => {
        const blank = item.action === 'blank';
        const fromCfg = EQUIP_DATA.equipment[String(item.fromId)] || {};
        const toCfg = EQUIP_DATA.equipment[String(item.toId)] || {};
        const fromLevel = Number(fromCfg.lv) || '?';
        const toLevel = Number(toCfg.lv) || '?';
        const resultName = escapeHtml(toCfg.name || item.toName || item.equip?.name || '剑胚');
        let resultLabel;
        if (blank) {
            resultLabel = `${item.shatterLabel || '碎剑'} → ${toLevel}级 · ${resultName}`;
        } else if (item.action === 'reforge') {
            const reforgeIndex = rowIndex - 3;
            resultLabel = `${toLevel}级重铸 第${reforgeIndex}次 · ${resultName}`;
        } else {
            resultLabel = `${fromLevel}→${toLevel} · ${resultName}`;
        }
        const base = escapeHtml(formatBase(item.base || item.equip?.base || {}));
        const props = (item.exts || item.equip?.exts || []).length
            ? (item.exts || item.equip.exts).map(prop => `<span class="jianwang-prop-token">${escapeHtml(propLabel(prop.prop))}+${formatPropValue(prop.prop, prop.value)}</span>`).join('')
            : '<span class="muted">无</span>';
        const seedText = blank
            ? `RedSeed ${item.redSeedBefore} → ${item.redSeedAfter}<br>CZSeed ${item.seedAfter}`
            : `CZSeed ${item.seedBefore} → ${item.seedAfter}${item.seedBefore === item.seedAfter ? ' · 不推进' : ''}`;
        const costs = String(item.cost || '—').split(/[、；]/)
            .filter(Boolean)
            .map(cost => `<span class="jianwang-cost-token">${escapeHtml(cost)}</span>`).join('');
        return `<tr>
            <td>${item.index}</td>
            <td class="jianwang-result-cell"><strong>${resultLabel}</strong></td>
            <td>${base}</td>
            <td><div class="jianwang-token-list">${props}</div></td>
            <td class="jianwang-result-cell"><span class="jianwang-seed">${seedText}</span><div class="jianwang-token-list jianwang-cost-list">${costs}</div></td>
        </tr>`;
    }).join('');
    updateJianwangCyclePager(pages.length, page.swordIndex);
}

function renderJianwangCyclePreview(pages) {
    const makeFilter = document.getElementById('makeFilterBar');
    const xilianFilter = document.getElementById('xilianFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    if (xilianFilter) xilianFilter.hidden = true;
    tablePager.mode = 'jianwang';
    tablePager.page = 1;
    tablePager.jianwangKind = 'cycle';
    tablePager.jianwangItems = [];
    tablePager.jianwangCyclePages = Array.isArray(pages) ? pages : [];
    renderJianwangCyclePage();
}

function renderJianwangPage() {
    if (tablePager.jianwangKind === 'cycle') {
        renderJianwangCyclePage();
        return;
    }
    const body = document.getElementById('previewBody');
    if (!body) return;
    const items = tablePager.jianwangItems || [];
    const pageSize = getPreviewPageSize();
    const start = (tablePager.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    const blankKind = tablePager.jianwangKind === 'blanks' || tablePager.jianwangKind === 'shatter';
    if (!slice.length) {
        const columns = tablePager.jianwangKind === 'mangjing' ? 6 : (blankKind ? 6 : 4);
        body.innerHTML = `<tr><td colspan="${columns}" class="empty-row">无专武序列记录</td></tr>`;
        updatePreviewPager(items.length);
        return;
    }
    if (tablePager.jianwangKind === 'mangjing') {
        body.innerHTML = slice.map(item => `<tr class="${item.isBest ? 'jianwang-best' : ''}">
            <td>${item.index}</td>
            <td>${escapeHtml(item.equipName)}</td>
            <td>${escapeHtml(item.materialName)}</td>
            <td class="special-attach-value">${escapeHtml(propLabel(item.prop))}+${formatPropValue(item.prop, item.value)}</td>
            <td>${item.factor}% · 区间 ${item.factorMin}–${item.factorMax}%${item.isBest ? ' · 最高' : ''}</td>
            <td>${item.seedBefore} → ${item.seedAfter}</td>
        </tr>`).join('');
    } else if (blankKind) {
        body.innerHTML = slice.map(item => {
            const resultLabel = item.shatterLabel
                ? `${escapeHtml(item.shatterLabel)} → 60级剑胚`
                : `第 ${item.index} 把后续60级剑胚`;
            const base = escapeHtml(formatBase(item.base));
            const props = (item.exts || []).length
                ? item.exts.map(prop => `<span class="jianwang-prop-token">${escapeHtml(propLabel(prop.prop))}+${formatPropValue(prop.prop, prop.value)}</span>`).join('')
                : '<span class="muted">无</span>';
            const seeds = `CZSeed ${item.CZSeed}<br>MJSeed ${item.MJSeed}<br>S ${item.S}`;
            const redSeed = `${item.redSeedBefore} → ${item.redSeedAfter}`;
            const resources = item.cost
                ? String(item.cost).split('；').map(part => `<span class="jianwang-cost-token">${escapeHtml(part)}</span>`).join('')
                : '<span class="muted">只读预览</span>';
            return `<tr>
                <td>${item.index}</td>
                <td class="jianwang-result-cell"><strong>${resultLabel}</strong><span class="jianwang-seed">${item.shatterLabel ? escapeHtml(item.fromName) : '源码首次生成规则'}</span></td>
                <td>${base}</td>
                <td><div class="jianwang-token-list">${props}</div></td>
                <td class="jianwang-result-cell"><span class="jianwang-seed">${seeds}</span></td>
                <td class="jianwang-result-cell"><span class="jianwang-seed">RedSeed ${redSeed}</span><div class="jianwang-token-list jianwang-cost-list">${resources}</div></td>
            </tr>`;
        }).join('');
    } else {
        body.innerHTML = slice.map(item => {
            const kept = item.kept
                ? `保留 ${propLabel(item.kept.prop)}+${formatPropValue(item.kept.prop, item.kept.value)}`
                : (item.action.startsWith('ascend:') ? '固定保留现有六条' : '不保留旧词条');
            const fromCfg = EQUIP_DATA.equipment[String(item.fromId)] || {};
            const toCfg = EQUIP_DATA.equipment[String(item.toId)] || {};
            const fromLevel = Number(fromCfg.lv) || '?';
            const toLevel = Number(toCfg.lv) || '?';
            const resultName = escapeHtml(toCfg.name || item.toName);
            const resultLabel = item.action === 'reforge'
                ? `${toLevel}级重铸 · ${resultName}`
                : `${fromLevel}→${toLevel} · ${resultName}`;
            const seedStatus = item.seedBefore === item.seedAfter ? ' · 不推进' : '';
            const props = (item.exts || []).length
                ? item.exts.map(prop => `<span class="jianwang-prop-token">${escapeHtml(propLabel(prop.prop))}+${formatPropValue(prop.prop, prop.value)}</span>`).join('')
                : '<span class="muted">无</span>';
            const costs = String(item.cost || '—').split('、')
                .map(cost => `<span class="jianwang-cost-token">${escapeHtml(cost)}</span>`).join('');
            return `<tr>
                <td>${item.index}</td>
                <td class="jianwang-result-cell"><strong>${resultLabel}</strong><span class="jianwang-seed">CZSeed ${item.seedBefore} → ${item.seedAfter}${seedStatus}</span></td>
                <td><div class="jianwang-token-list">${props}</div></td>
                <td><span class="jianwang-keep">${escapeHtml(kept)}</span><div class="jianwang-token-list jianwang-cost-list">${costs}</div></td>
            </tr>`;
        }).join('');
    }
    updatePreviewPager(items.length);
}

function setJianwangStateHead() {
    setPreviewTableKind('jianwang-state');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>结果</th><th>副属性</th><th>选择与消耗</th>
    </tr>`;
}

function setJianwangBlankHead() {
    setPreviewTableKind('jianwang-state');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>结果</th><th>基础属性</th><th>副属性</th><th>实例种子</th><th>RedSeed / 资源</th>
    </tr>`;
}

function renderJianwangPreview(items, kind = 'state') {
    if (kind === 'mangjing') setSpecialAttachHead();
    else if (kind === 'blanks' || kind === 'shatter') setJianwangBlankHead();
    else setJianwangStateHead();
    const meta = document.getElementById('previewMeta');
    const makeFilter = document.getElementById('makeFilterBar');
    const xilianFilter = document.getElementById('xilianFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    if (xilianFilter) xilianFilter.hidden = true;
    tablePager.mode = 'jianwang';
    tablePager.page = 1;
    tablePager.jianwangItems = items;
    tablePager.jianwangKind = kind;
    if (meta) {
        if (kind === 'mangjing') {
            const bestIndexes = items.filter(item => item.isBest).map(item => item.index).join('、');
            meta.textContent = `剑王阁芒晶洗练 ${items.length} 次 · 最高值位于第 ${bestIndexes} 次 · 每次芒晶×10 · 只读预测`;
        } else if (kind === 'blanks') {
            meta.textContent = `后续60级剑胚 ${items.length} 把 · 从当前 RedSeeds[5707] 顺序推演 · 预览不推进页面内状态`;
        } else if (kind === 'shatter') {
            meta.textContent = `${items[0]?.shatterLabel || '碎剑'} → 重铸下一把60级剑胚 · 预览不推进页面内状态`;
        } else {
            meta.textContent = `从所选存档实物起步 · ${items.length} 步 · 预览不推进页面内状态`;
        }
    }
    renderJianwangPage();
}


function equipOptionLabel(e, mode) {
    const owner = String(e._owner || e._source || '').trim();
    const wear = e._crafted ? '模拟打造' : (e._equipped ? `已装备${owner ? `：${owner}` : ''}` : '未装备');
    const color = COLOR_NAMES[e.color] || e.color;
    const mark = e._mark ? `「${e._mark}」` : '';
    if (mode === 'strong') {
        return `${mark}${e.name} · 淬炼${e.level} · LvProp${e.lv_prop} · ${wear}`;
    }
    if (mode === 'shenglian') {
        const cfg = EQUIP_DATA.equipment[String(e.id)] || {};
        const next = EQUIP_DATA.equipment[String(cfg.equ_next)] || {};
        const typ = TYPE_NAMES[e.typ] || e.typ;
        return `${mark}${e.name} · ${e.need_lv}→${next.lv || 100} · ${color} · ${typ} · ${wear}`;
    }
    return `${mark}${e.name} · ${e.need_lv}级 · ${color} · 词条${e.exts.length} · ${wear}`;
}

function canPredictSpecialAttach(equip) {
    return Number.isSafeInteger(equip.MJSeed)
        && equip.MJSeed > 0
        && Object.values(EQUIP_DATA.special).some(material => specialMaterialSupportsEquip(material, equip));
}

function specialAttachEquipLabel(equip) {
    const source = equip._crafted ? '模拟打造' : (equip._equipped ? equip._source : '未装备');
    const base = equip.exts.length
        ? equip.exts.map(item => `${propLabel(item.prop)}+${formatPropValue(item.prop, item.value)}`).join(' / ')
        : '无基础词条';
    const current = equip.specials.length
        ? equip.specials.map(item => `${propLabel(item.prop)}+${formatPropValue(item.prop, item.value)}`).join(' / ')
        : '当前无红词条';
    return `${source} · ${equip.name} · ${base} · ${current} · #${equip.only_id}`;
}

function specialMaterialsForEquip(equip) {
    return Object.values(EQUIP_DATA.special)
        .filter(material => specialMaterialSupportsEquip(material, equip))
        .sort((left, right) => left.id - right.id);
}

function fillSpecialAttachMaterialSelect(preserveSelection) {
    const equipSelect = document.getElementById('specialAttachEquipSelect');
    const materialSelect = document.getElementById('specialAttachMaterialSelect');
    if (!equipSelect || !materialSelect) return;
    const previous = preserveSelection ? materialSelect.value : '';
    const equip = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    materialSelect.innerHTML = '';
    if (!equip) {
        materialSelect.innerHTML = '<option value="">（请先选择可预测装备）</option>';
        return;
    }
    const materials = specialMaterialsForEquip(equip);
    for (const material of materials) {
        const option = document.createElement('option');
        option.value = String(material.id);
        option.textContent = material.name;
        materialSelect.appendChild(option);
    }
    if (previous && [...materialSelect.options].some(option => option.value === previous)) {
        materialSelect.value = previous;
    }
}

function fillSpecialAttachEquipSelect(preserveSelection) {
    const select = document.getElementById('specialAttachEquipSelect');
    if (!select) return;
    const previous = preserveSelection ? select.value : '';
    const equips = saveEquips.filter(canPredictSpecialAttach);
    select.innerHTML = '';
    if (!equips.length) {
        select.innerHTML = '<option value="">（没有带有效 MJSeed 的适用装备）</option>';
    } else {
        for (const equip of equips) {
            const option = document.createElement('option');
            option.value = runtimeKey(equip);
            option.textContent = specialAttachEquipLabel(equip);
            select.appendChild(option);
        }
        if (previous && [...select.options].some(option => option.value === previous)) {
            select.value = previous;
        }
    }
    fillSpecialAttachMaterialSelect(preserveSelection);
    updateSpecialAttachHint();
}

function updateSpecialAttachHint() {
    const hint = document.getElementById('specialAttachHint');
    const equipSelect = document.getElementById('specialAttachEquipSelect');
    const materialSelect = document.getElementById('specialAttachMaterialSelect');
    if (!hint || !equipSelect || !materialSelect) return;
    const equip = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const material = EQUIP_DATA.special[String(materialSelect.value)];
    if (!equip || !material) {
        hint.textContent = '导入存档后选择同一件装备和材料，预测连续覆盖红词条的结果';
        return;
    }
    const current = equip.specials.length
        ? equip.specials.map(item => `${propLabel(item.prop)}+${formatPropValue(item.prop, item.value)}`).join(' / ')
        : '无';
    hint.textContent = `当前红词条：${current} · 起始 MJSeed=${equip.MJSeed} · 预测不会修改存档或种子`;
}

function isJianwangSword(equip) {
    return !!equip && JIANWANG_SWORD_IDS.has(Number(equip.id));
}

function collectJianwangSwords() {
    return saveEquips
        .filter(isJianwangSword)
        .sort((a, b) => Number(a.id) - Number(b.id) || String(a._source).localeCompare(String(b._source), 'zh'));
}

function validJianwangCZSeed(equip) {
    return isJianwangSword(equip)
        && Number.isSafeInteger(Number(equip.CZSeed))
        && Number(equip.CZSeed) > 0;
}

function canPredictJianwangMangjing(equip) {
    return isJianwangSword(equip)
        && JIANWANG_LEVEL_100_IDS.has(Number(equip.id))
        && Number(equip.color) === 6
        && Array.isArray(equip.specials)
        && equip.specials.length > 0
        && Number.isSafeInteger(equip.MJSeed)
        && equip.MJSeed > 0;
}

function jianwangStageName(equip) {
    const cfg = EQUIP_DATA.equipment[String(equip?.id)] || {};
    const lv = Number(cfg.lv) || Number(equip?.need_lv) || 0;
    if (Number(equip?.id) === 5707) return '60级剑胚';
    if (Number(equip?.id) === 5708) return '70级剑胚';
    if (Number(equip?.id) === 5709) return '80级剑胚';
    if (JIANWANG_LEVEL_90_IDS.has(Number(equip?.id))) return `90级专武 · ${cfg.name || equip.name}`;
    if (JIANWANG_LEVEL_100_IDS.has(Number(equip?.id))) return `100级神兵 · ${cfg.name || equip.name}`;
    return `${lv}级`;
}

function jianwangSwordLabel(equip) {
    const key = runtimeKey(equip);
    const current = getRuntimeEquip(key) || equip;
    const seed = JIANWANG_LEVEL_100_IDS.has(Number(current.id))
        ? `MJSeed ${current.MJSeed || '无效'}`
        : `CZSeed ${current.CZSeed || '无效'}`;
    if (current._jianwangRebuilt) {
        const swordIndex = Math.max(1, Math.floor(Number(current._jianwangSwordIndex) || 1));
        const name = current.name || EQUIP_DATA.equipment[String(current.id)]?.name || jianwangStageName(current);
        return `模拟背包 · ${name} · 第 ${swordIndex} 把剑`;
    }
    return `${current._source || equip._source || '未知来源'} · ${jianwangStageName(current)} · #${equip.only_id || '无OnlyID'} · ${seed}`;
}

function jianwangActionOptions(equip) {
    if (!equip) return [];
    const id = Number(equip.id);
    if (JIANWANG_GROW_TARGETS[id]) {
        return JIANWANG_GROW_TARGETS[id].map(targetId => ({
            value: `grow:${targetId}`,
            label: `${jianwangStageName(equip)} → ${jianwangStageName({ id: targetId })}`,
        }));
    }
    if (JIANWANG_LEVEL_90_IDS.has(id)) {
        return [
            { value: 'reforge', label: `重铸 ${jianwangStageName(equip)}` },
            { value: `ascend:${JIANWANG_LEVEL_100_TARGETS[id]}`, label: `铸为100级神兵（固定保留六条）` },
            { value: JIANWANG_SHATTER_90, label: '90级碎剑 → 重铸下一把60级剑胚' },
        ];
    }
    if (JIANWANG_LEVEL_100_IDS.has(id)) {
        return [
            { value: 'mangjing', label: '查看芒晶洗练序列' },
            { value: JIANWANG_SHATTER_100, label: '100级碎神兵 → 重铸下一把60级剑胚' },
        ];
    }
    return [];
}

function jianwangKeepLimit(equip, action) {
    if (!equip || !action) return 0;
    if (action === 'reforge') return Math.min(4, equip.exts?.length || 0);
    if (action.startsWith('grow:')) {
        const byId = { 5707: 1, 5708: 2, 5709: 3 };
        return Math.min(byId[Number(equip.id)] || 0, equip.exts?.length || 0);
    }
    return 0;
}

function fillJianwangActionSelect(preserveSelection = true) {
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const actionSelect = document.getElementById('jianwangActionSelect');
    if (!equipSelect || !actionSelect) return;
    const previous = preserveSelection ? actionSelect.value : '';
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    const actions = jianwangActionOptions(equip);
    actionSelect.innerHTML = '';
    if (!actions.length) {
        actionSelect.innerHTML = '<option value="">（当前实物没有可用流程）</option>';
    } else {
        for (const action of actions) {
            const option = document.createElement('option');
            option.value = action.value;
            option.textContent = action.label;
            actionSelect.appendChild(option);
        }
        if (previous && [...actionSelect.options].some(option => option.value === previous)) {
            actionSelect.value = previous;
        }
    }
    fillJianwangKeepSelect(preserveSelection);
    fillJianwangMaterialSelect(preserveSelection);
    updateJianwangControls();
}

function fillJianwangCycleRouteSelect(preserveSelection = true) {
    const routeSelect = document.getElementById('jianwangCycleRouteSelect');
    const equipSelect = document.getElementById('jianwangEquipSelect');
    if (!routeSelect || !equipSelect) return;
    const previous = preserveSelection ? routeSelect.value : '';
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    const fixedRouteId = equip ? JIANWANG_SHATTER_ROUTE_IDS[Number(equip.id)] : null;
    routeSelect.innerHTML = '';
    if (!equip) {
        routeSelect.innerHTML = '<option value="">（请先选择剑王阁实物）</option>';
        routeSelect.disabled = true;
        return;
    }
    if (fixedRouteId) {
        const option = document.createElement('option');
        option.value = String(fixedRouteId);
        option.textContent = jianwangStageName({ id: fixedRouteId });
        routeSelect.appendChild(option);
        routeSelect.disabled = true;
        return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '请选择90级专武路线';
    routeSelect.appendChild(placeholder);
    for (const routeId of JIANWANG_GROW_TARGETS[5709]) {
        const option = document.createElement('option');
        option.value = String(routeId);
        option.textContent = jianwangStageName({ id: routeId });
        routeSelect.appendChild(option);
    }
    routeSelect.disabled = false;
    if (previous && [...routeSelect.options].some(option => option.value === previous)) {
        routeSelect.value = previous;
    }
}

function fillJianwangKeepSelect(preserveSelection = true) {
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const actionSelect = document.getElementById('jianwangActionSelect');
    const keepSelect = document.getElementById('jianwangKeepSelect');
    if (!equipSelect || !actionSelect || !keepSelect) return;
    const previous = preserveSelection ? keepSelect.value : '';
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    const limit = jianwangKeepLimit(equip, actionSelect.value);
    keepSelect.innerHTML = '<option value="0">不保留</option>';
    for (let i = 0; i < limit; i++) {
        const prop = equip.exts[i];
        const option = document.createElement('option');
        option.value = String(i + 1);
        option.textContent = `槽 ${i + 1} · ${propLabel(prop.prop)}+${formatPropValue(prop.prop, prop.value)}`;
        keepSelect.appendChild(option);
    }
    if (previous && [...keepSelect.options].some(option => option.value === previous)) keepSelect.value = previous;
}

function jianwangMaterialsForEquip(equip) {
    const materials = specialMaterialsForEquip(equip);
    const currentProps = new Set((equip?.specials || []).map(item => item.prop));
    const matched = materials.filter(material => material.prop.some(entry => currentProps.has(entry[0])));
    return matched.length ? matched : materials;
}

function fillJianwangMaterialSelect(preserveSelection = true) {
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const materialSelect = document.getElementById('jianwangMaterialSelect');
    if (!equipSelect || !materialSelect) return;
    const previous = preserveSelection ? materialSelect.value : '';
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    materialSelect.innerHTML = '';
    if (!equip) {
        materialSelect.innerHTML = '<option value="">（请先选择已铸进专武）</option>';
        return;
    }
    for (const material of jianwangMaterialsForEquip(equip)) {
        const option = document.createElement('option');
        option.value = String(material.id);
        option.textContent = `${material.name} · ${material.prop.map(entry => propLabel(entry[0])).join('/')}`;
        materialSelect.appendChild(option);
    }
    if (previous && [...materialSelect.options].some(option => option.value === previous)) {
        materialSelect.value = previous;
    }
}

function fillJianwangEquipSelect(preserveSelection = true) {
    const select = document.getElementById('jianwangEquipSelect');
    if (!select) return;
    const previous = preserveSelection ? select.value : '';
    const swords = collectJianwangSwords();
    select.innerHTML = '';
    if (!swords.length) {
        select.innerHTML = '<option value="">（存档中没有剑王阁剑胚或专武）</option>';
    } else {
        for (const sword of swords) {
            const option = document.createElement('option');
            option.value = runtimeKey(sword);
            option.textContent = jianwangSwordLabel(sword);
            select.appendChild(option);
        }
        if (previous && [...select.options].some(option => option.value === previous)) {
            select.value = previous;
        }
    }
    fillJianwangActionSelect(preserveSelection);
    fillJianwangCycleRouteSelect(preserveSelection);
    updateJianwangHint();
    updateJianwangCycleHint();
}

function updateJianwangControls() {
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const action = document.getElementById('jianwangActionSelect')?.value || '';
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect?.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    const keepGroup = document.getElementById('jianwangKeepGroup');
    const countGroup = document.getElementById('jianwangCountGroup');
    const materialGroup = document.getElementById('jianwangMaterialGroup');
    const countInput = document.getElementById('jianwangCount');
    if (keepGroup) keepGroup.hidden = !(action === 'reforge' || action.startsWith('grow:'));
    if (countGroup) countGroup.hidden = !(action === 'reforge' || action === 'mangjing');
    if (materialGroup) materialGroup.hidden = action !== 'mangjing';
    const completedReforges = Math.max(0, Math.floor(Number(
        jianwangReforgeCounts[String(Number(equip?.id))],
    ) || 0));
    const remainingReforges = Math.max(0, JIANWANG_REFORGE_LIMIT - completedReforges);
    const reforgeExhausted = action === 'reforge' && remainingReforges === 0;
    if (countInput) {
        countInput.disabled = reforgeExhausted;
        countInput.min = '1';
        countInput.max = String(action === 'reforge' ? remainingReforges : PREVIEW_MAX);
        if (action === 'reforge') {
            const current = Number(countInput.value);
            if (!Number.isSafeInteger(current) || current < 1 || current > remainingReforges) {
                countInput.value = '1';
            }
        }
    }
    const previewButton = document.getElementById('btnJianwangPreview');
    if (previewButton) {
        const shatter = action === JIANWANG_SHATTER_90 || action === JIANWANG_SHATTER_100;
        previewButton.disabled = reforgeExhausted || (shatter && !validJianwangRedSeed(jianwangRedSeed));
    }
    const applyButton = document.getElementById('btnJianwangApply');
    if (applyButton) {
        const shatter = action === JIANWANG_SHATTER_90 || action === JIANWANG_SHATTER_100;
        const deterministic = action === 'reforge' || action.startsWith('grow:') || action.startsWith('ascend:') || shatter;
        applyButton.disabled = !equip || !deterministic || reforgeExhausted
            || (shatter ? !validJianwangRedSeed(jianwangRedSeed)
                : (action !== '' && !action.startsWith('ascend:') && !validJianwangCZSeed(equip)));
    }
}

function findSaveScalar(root, wantedKey) {
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
            const found = unwrap(value[wantedKey]);
            if (found != null) return found;
        }
        for (const child of Object.values(value)) {
            const found = walk(child);
            if (found != null) return found;
        }
        return null;
    };
    return walk(root);
}

function jianwangReforgeCost(attemptNumber) {
    const index = Math.min(JIANWANG_REFORGE_COSTS.length - 1, Math.max(0, Number(attemptNumber) - 1));
    const [coreA, coreB] = JIANWANG_REFORGE_COSTS[index];
    return `真气×500、剑芯6516×${coreA}、剑芯6517×${coreB}`;
}

function jianwangCostText(equip, action, sequenceIndex = 1) {
    if (!equip) return '';
    const id = Number(equip.id);
    if (action === 'reforge') {
        const completed = Number(jianwangReforgeCounts[String(Number(equip.id))]) || 0;
        return jianwangReforgeCost(completed + sequenceIndex);
    }
    if (action === 'grow:5708') return '剑意150、雪银×400、青金石×20、贡献×1200';
    if (action === 'grow:5709') return '剑意300、紫金×200、陨铁×1、贡献×2000';
    if (action.startsWith('grow:') && id === 5709) return '剑意600、紫金×400、陨铁×2、贡献×4000';
    if (action.startsWith('ascend:')) return '昆吾石×100、陨铁×2、连金泥×10、内力×1000、铸炼进度×10';
    if (action === 'mangjing') return '芒晶×10 / 次';
    if (action === JIANWANG_SHATTER_90) return '90级碎剑后重新锻造60级剑胚';
    if (action === JIANWANG_SHATTER_100) return '100级碎神兵后重新锻造60级剑胚';
    return '';
}

function updateJianwangHint() {
    const hint = document.getElementById('jianwangHint');
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const materialSelect = document.getElementById('jianwangMaterialSelect');
    if (!hint || !equipSelect || !materialSelect) return;
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    const action = document.getElementById('jianwangActionSelect')?.value || '';
    const material = EQUIP_DATA.special[String(materialSelect.value)];
    if (!equip) {
        hint.textContent = saveLoaded
            ? '当前存档没有 5707～5717 剑王阁实物，无法开始专武流程预览'
            : '导入存档后自动扫描主角、随从、离队角色、背包和仓库中的剑王阁实物';
        return;
    }
    if (action === 'mangjing') {
        if (!canPredictJianwangMangjing(equip)) {
            hint.textContent = `${equip._source || base?._source || '存档'} · ${jianwangStageName(equip)} 已列出，但缺少有效 MJSeed 或已铸进特殊词条，不能伪造芒晶序列`;
            return;
        }
        const materialText = material ? `按「${material.name}」属性池` : '请选择游戏中实际铸进的材料';
        hint.textContent = `${equip._source || base?._source || '存档'} · ${materialText} · 起始 MJSeed=${equip.MJSeed} · ${jianwangCostText(equip, action)}`;
        return;
    }
    if (action === JIANWANG_SHATTER_90 || action === JIANWANG_SHATTER_100) {
        if (!validJianwangRedSeed(jianwangRedSeed)) {
            hint.textContent = `${jianwangStageName(equip)} · 存档缺少有效 MakeRnd.RedSeeds[5707]，不能预测下一把60级剑胚`;
            return;
        }
        const next = createJianwangBlankFromRedSeed(jianwangRedSeed);
        const actionLabel = action === JIANWANG_SHATTER_90 ? '90级碎剑' : '100级碎神兵';
        hint.textContent = `${actionLabel} · RedSeed ${next.redSeedBefore} → ${next.redSeedAfter} · 新60级剑胚 CZSeed=${next.CZSeed} · MJSeed=${next.MJSeed} · 仅网页模拟`;
        return;
    }
    if ((action === 'reforge' || action.startsWith('grow:')) && !validJianwangCZSeed(equip)) {
        hint.textContent = `${base?._source || '存档'} · ${jianwangStageName(equip)} 已列出，但 CZSeed 无效，不能生成替代序列`;
        return;
    }
    if (action === 'reforge') {
        const completed = Math.max(0, Math.floor(Number(
            jianwangReforgeCounts[String(Number(equip.id))],
        ) || 0));
        const remaining = Math.max(0, JIANWANG_REFORGE_LIMIT - completed);
        if (remaining === 0) {
            hint.textContent = `${base?._source || '存档'} · ${jianwangStageName(equip)} · 已重铸 ${completed} 次，已达 ${JIANWANG_REFORGE_LIMIT} 次上限`;
            return;
        }
        hint.textContent = `${base?._source || '存档'} · ${jianwangStageName(equip)} · 起始 CZSeed=${equip.CZSeed} · 已重铸 ${completed}/${JIANWANG_REFORGE_LIMIT} 次，剩余 ${remaining} 次 · ${jianwangCostText(equip, action)}`;
        return;
    }
    const seedText = action.startsWith('ascend:') ? `CZSeed=${equip.CZSeed}（固定转换不推进）` : `起始 CZSeed=${equip.CZSeed}`;
    hint.textContent = `${base?._source || '存档'} · ${jianwangStageName(equip)} · ${seedText} · ${jianwangCostText(equip, action)}`;
}

function updateJianwangCycleHint() {
    const hint = document.getElementById('jianwangCycleHint');
    const button = document.getElementById('btnJianwangCyclePreview');
    const equipSelect = document.getElementById('jianwangEquipSelect');
    const routeSelect = document.getElementById('jianwangCycleRouteSelect');
    const base = saveEquips.find(item => runtimeKey(item) === equipSelect?.value);
    const equip = base ? (getRuntimeEquip(runtimeKey(base)) || base) : null;
    if (!hint) return;
    const id = Number(equip?.id);
    const needsRoute = [5707, 5708, 5709].includes(id);
    const routeId = Number(routeSelect?.value);
    const routeReady = !needsRoute || JIANWANG_LEVEL_90_IDS.has(routeId);
    const startSeedReady = !needsRoute || validJianwangCZSeed(equip);
    const available = saveLoaded && !!equip && isJianwangSword(equip)
        && routeReady && startSeedReady && validJianwangRedSeed(jianwangRedSeed);
    if (button) button.disabled = !available;
    if (!saveLoaded) {
        hint.textContent = '导入存档并选择剑王阁剑胚或专武后，可按每把新剑一页预览完整循环';
    } else if (!equip || !isJianwangSword(equip)) {
        hint.textContent = '请选择剑王阁5707～5717实物';
    } else if (!validJianwangRedSeed(jianwangRedSeed)) {
        hint.textContent = '存档缺少有效 MakeRnd.RedSeeds[5707]，无法进行碎剑预览';
    } else if (needsRoute && !validJianwangCZSeed(equip)) {
        hint.textContent = `${jianwangStageName(equip)}缺少有效 CZSeed，无法先推到90级`;
    } else if (needsRoute && !routeReady) {
        hint.textContent = `${jianwangStageName(equip)}尚未到90级，请先选择最终90级专武路线`;
    } else if (JIANWANG_LEVEL_100_IDS.has(id)) {
        hint.textContent = '以当前选择之剑胚开始进行模拟。若剑胚已百级或重铸十次，则直接碎剑进入下一轮模拟。模拟结果均以不保留任何词条为主';
    } else if (needsRoute) {
        hint.textContent = `${jianwangStageName(equip)}会先无保留推到所选90级路线再碎剑；之后每把新剑独立一页`;
    } else {
        hint.textContent = '当前90级专武直接碎剑进入第1轮；每把新剑独立一页并预览60→90与10次不保留重铸';
    }
}

function emptyEquipTip(which) {
    const source = getSourceFilter(which);
    if (source === 'crafted') return '（无匹配的模拟打造装备；可改来源或文本筛选）';
    if (source === 'equipped') return '（无已装备匹配项；可改「仅模拟打造」或「全部」）';
    if (which === 'shenglian') return '（无 90 级可升炼装备）';
    if (which === 'strong') return '（无可淬炼武器）';
    return '（无 100 级可精炼装备；90 级请先升炼）';
}

function fillEquipSelects(preserveSelection = true) {
    const configs = [
        { which: 'xilian', selId: 'xilianEquipSelect', pred: canXilian },
        { which: 'strong', selId: 'strongEquipSelect', pred: canStrong },
        { which: 'shenglian', selId: 'shenglianEquipSelect', pred: canShengLian },
    ];
    for (const { which, selId, pred } of configs) {
        const sel = document.getElementById(selId);
        if (!sel) continue;
        const prev = preserveSelection ? sel.value : '';
        const list = saveEquips.filter(e => pred(e) && passEquipListFilter(e, which));
        sel.innerHTML = '';
        if (!list.length) {
            sel.innerHTML = `<option value="">${emptyEquipTip(which)}</option>`;
        } else {
            for (const e of list) {
                const opt = document.createElement('option');
                opt.value = runtimeKey(e);
                opt.textContent = equipOptionLabel(e, which);
                sel.appendChild(opt);
            }
            if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
        }
    }
    fillSpecialAttachEquipSelect(preserveSelection);
    fillJianwangEquipSelect(preserveSelection);
    updateXilianHint();
    updateStrongHint();
    updateShenglianHint();
    updateJianwangHint();
    updateCraftedBagHint();
}

function updateShenglianHint() {
    const el = document.getElementById('shenglianHint');
    const box = document.getElementById('shenglianPreview');
    const sel = document.getElementById('shenglianEquipSelect');
    if (!el || !sel) return;
    const key = sel.value;
    const base = key ? saveEquips.find(e => runtimeKey(e) === key) : null;
    if (!base) {
        el.textContent = '90 级非橙红装且存在下一档（equ_next）可升炼至 100 级，之后才能精炼';
        if (box) {
            box.classList.add('empty');
            box.textContent = '选择装备后显示 90→100 对照';
        }
        return;
    }
    const cfg = EQUIP_DATA.equipment[String(base.id)] || {};
    const next = EQUIP_DATA.equipment[String(cfg.equ_next)] || {};
    const cost = calcShengLianCost(base);
    el.textContent = `消耗提示：${formatCostList(cost)}（仅提示，不扣背包）`;
    if (box) {
        box.classList.remove('empty');
        const typ = TYPE_NAMES[base.typ] || base.typ;
        const mark = base._mark ? ` · 标记「${escapeHtml(base._mark)}」` : '';
        box.innerHTML = `
            <div><strong>当前</strong>：${escapeHtml(base.name)} · ${base.need_lv}级 · ${COLOR_NAMES[base.color] || base.color} · ${escapeHtml(String(typ))} · 词条${base.exts.length}${mark}</div>
            <div><strong>升炼后</strong>：${escapeHtml(next.name || '?')} · ${next.lv || 100}级 · 表ID ${cfg.equ_next}</div>
            <div class="warn">词条 / 淬炼等级 / S / CZSeed / 标记 保留；升炼后可在精炼页用来源「仅模拟打造」筛选</div>
        `;
    }
}

function updateXilianInitialExts(key) {
    const el = document.getElementById('xilianInitialExts');
    if (!el) return;
    const baseEq = key ? saveEquips.find(e => runtimeKey(e) === key) : null;
    if (!baseEq) {
        el.classList.add('empty');
        el.innerHTML = '<span class="xilian-initial-label">打造时初始词条</span><span class="xilian-initial-values">请选择装备</span>';
        return;
    }
    const initialExts = baseEq._initial_exts?.length ? baseEq._initial_exts : (baseEq.exts || []);
    el.classList.remove('empty');
    el.innerHTML = `<span class="xilian-initial-label">打造时初始词条</span><span class="xilian-initial-values">${formatProps(initialExts)}</span>`;
}

function updateXilianHint() {
    const el = document.getElementById('xilianHint');
    const key = document.getElementById('xilianEquipSelect').value;
    const eq = key ? getRuntimeEquip(key) : null;
    updateXilianInitialExts(key);
    if (!eq) {
        el.textContent = '仅 100 级绿/蓝/紫装可精炼；90 级请先升炼；来源可选「仅模拟打造」，支持按标记筛选';
        return;
    }
    const marks = eq.xilian_marks || [];
    const cost = calcXilianCost(eq);
    const slots = (eq.exts || []).map((p, i) => {
        const marked = marks.includes(i + 1) ? '🔒' : '';
        return `${i + 1}:${propLabel(p.prop)}${marked}`;
    }).join(' · ');
    const main = mainPropDisplay(eq, eq.XLLevel || 0)
        .map(m => `${m.label}${m.value}`)
        .join(' · ');
    const baseEq = saveEquips.find(e => runtimeKey(e) === key);
    const userMark = baseEq?._mark ? ` · 标记「${baseEq._mark}」` : '';
    el.textContent = `CZSeed=${eq.CZSeed} · XLLevel=${eq.XLLevel} · 已标记槽[${marks.join(',') || '无'}] · 下次消耗 ${formatCostList(cost.mats)} · ${main || '无罡气/内劲'} · 词条 ${slots || '—'}${userMark}`;
}

function updateStrongHint() {
    const el = document.getElementById('strongHint');
    const key = document.getElementById('strongEquipSelect').value;
    const eq = key ? getRuntimeEquip(key) : null;
    if (!eq) {
        el.textContent = '仅武器可淬炼；来源选「仅模拟打造」可专看打造武器，支持按标记筛选';
        return;
    }
    fillStrongTargetLevels(eq);
    const next = eq.level + 1;
    const c = strongAttemptCost(eq.need_lv || 90, eq.level);
    const stone = c ? `${STONE_NAMES[c.mat] || c.mat}×${c.num}` : '?';
    const baseEq = saveEquips.find(e => runtimeKey(e) === key);
    const userMark = baseEq?._mark ? ` · 标记「${baseEq._mark}」` : '';
    el.textContent = `S=${eq.S} · 当前 +${eq.level}/15 · 下一级消耗 ${stone} · LvProp=${eq.lv_prop}${userMark}`;
}

function setXilianHead() {
    setPreviewTableKind('xilian');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>保留</th><th>#</th><th>槽</th><th>原→新</th><th>倍率</th><th>XLLevel</th>
    </tr>`;
}

function fillXilianPropFilter(items) {
    const sel = document.getElementById('xilianFilterProp');
    if (!sel) return;
    const prev = sel.value;
    const props = [...new Set((items || []).map(it => it.prop?.prop).filter(Boolean))].sort((a, b) => {
        return propLabel(a).localeCompare(propLabel(b), 'zh');
    });
    sel.innerHTML = '<option value="">全部</option>' + props.map(p =>
        `<option value="${escapeHtml(p)}">${escapeHtml(propLabel(p))}</option>`
    ).join('');
    if (prev && props.includes(prev)) sel.value = prev;
}

function fillXilianTargetProps(eq, items) {
    const sel = document.getElementById('xilianTargetProp');
    const btn = document.getElementById('btnXilianOptimize');
    if (!sel) return;
    const prev = sel.value;
    const props = [...new Set([
        ...(eq?.exts || []).map(p => p?.prop),
        ...(items || []).map(it => it.prop?.prop),
    ].filter(Boolean))].sort((a, b) => propLabel(a).localeCompare(propLabel(b), 'zh'));
    sel.innerHTML = '<option value="">选择目标属性</option>' + props.map(p =>
        `<option value="${escapeHtml(p)}">${escapeHtml(propLabel(p))}</option>`
    ).join('');
    if (prev && props.includes(prev)) sel.value = prev;
    sel.disabled = !props.length;
    if (btn) btn.disabled = !props.length;
}

function xilianMarkMask(marks) {
    let mask = 0;
    for (const raw of marks || []) {
        const slot = Number(raw);
        if (slot >= 1 && slot <= 3) mask |= 1 << (slot - 1);
    }
    return mask;
}

function xilianMaskMult(mask) {
    const count = ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);
    return xilianCostMult(count);
}

function xilianTargetValues(exts, target, slotCount) {
    const out = [];
    for (let i = 0; i < slotCount; i++) {
        const prop = exts?.[i];
        out.push(prop?.prop === target && Number.isFinite(Number(prop.value)) ? Number(prop.value) : 0);
    }
    return out;
}

function xilianTargetTotal(exts, target) {
    return (exts || []).reduce((sum, prop) => {
        return sum + (prop?.prop === target && Number.isFinite(Number(prop.value)) ? Number(prop.value) : 0);
    }, 0);
}

function compareXilianPlanMeta(a, b) {
    if (a.cutoffLianjin !== b.cutoffLianjin) return a.cutoffLianjin - b.cutoffLianjin;
    if (a.lastStep !== b.lastStep) return a.lastStep - b.lastStep;
    return a.keepCount - b.keepCount;
}

function xilianLinkedSteps(node) {
    const out = [];
    while (node) {
        out.push(node.step);
        node = node.prev;
    }
    return out.reverse();
}

/**
 * 精确搜索指定属性在最终各词条中的合计最大值。
 * 枚举最终新增标记的槽位，并在各分支中保留目标属性的新高值。
 */
function buildXilianMaxPlan(eq, count, target) {
    const slotCount = Math.min(3, Math.max(1, eq.exts?.length || 0));
    const initialXl = Number(eq.XLLevel) || 0;
    const initialMask = xilianMarkMask(eq.xilian_marks || []);
    const initialValues = xilianTargetValues(eq.exts, target, slotCount);

    const basePlan = wasmXilianPlan(toWasmEquip(eq), Array(count).fill(false));
    if (basePlan.error || !basePlan.items?.length) throw new Error(basePlan.error || '无法生成精炼序列');

    const seedBefore = [];
    let seedProbe = JSON.parse(JSON.stringify(toWasmEquip(eq)));
    for (let i = 0; i < count; i++) {
        seedBefore.push(seedProbe.CZSeed);
        const once = wasmXilianOnce(seedProbe);
        if (once.error || !once.equip) throw new Error(once.error || `无法生成第 ${i + 1} 次精炼种子`);
        seedProbe = once.equip;
    }

    const offerCache = new Map();
    function offerAt(step, effectiveLevel) {
        const level = Math.min(100, effectiveLevel);
        const key = `${step}|${level}`;
        if (offerCache.has(key)) return offerCache.get(key);
        const probe = {
            ...toWasmEquip(eq),
            CZSeed: seedBefore[step - 1],
            XLLevel: level,
            XLNumber: (Number(eq.XLNumber) || 0) + step - 1,
            xilian_marks: [],
            xilian_accepted: 0,
        };
        const once = wasmXilianOnce(probe);
        if (once.error || !once.result) throw new Error(once.error || `无法计算第 ${step} 次精炼结果`);
        offerCache.set(key, once.result);
        return once.result;
    }

    const candidates = [];
    const allMask = (1 << slotCount) - 1;
    for (let addedMask = 0; addedMask <= allMask; addedMask++) {
        if (addedMask & initialMask) continue;
        const enabledMask = initialMask | addedMask;
        let mask = initialMask;
        let xlLevel = initialXl;
        const values = initialValues.slice();
        const firstSteps = Array(slotCount).fill(0);
        const bestSteps = Array(slotCount).fill(0);
        const xlAfter = Array(count + 1).fill(initialXl);

        for (let step = 1; step <= count; step++) {
            const costMult = xilianMaskMult(mask);
            const offer = offerAt(step, xlLevel);
            xlLevel += costMult;
            xlAfter[step] = xlLevel;
            const slotIndex = Number(offer.slot) - 1;
            if (slotIndex < 0 || slotIndex >= slotCount || !(enabledMask & (1 << slotIndex))) continue;

            if (!(mask & (1 << slotIndex))) {
                mask |= 1 << slotIndex;
                firstSteps[slotIndex] = step;
                values[slotIndex] = offer.prop?.prop === target ? Number(offer.prop.value) || 0 : 0;
                if (offer.prop?.prop === target) bestSteps[slotIndex] = step;
            } else if (offer.prop?.prop === target && Number(offer.prop.value) > values[slotIndex]) {
                values[slotIndex] = Number(offer.prop.value);
                bestSteps[slotIndex] = step;
            }
        }

        const stepSet = new Set([...firstSteps, ...bestSteps].filter(Boolean));
        const steps = [...stepSet].sort((a, b) => a - b);
        const lastStep = steps.at(-1) || 0;
        candidates.push({
            enabledMask,
            values,
            steps,
            keepCount: stepSet.size,
            lastStep,
            cutoffLianjin: lastStep ? xlAfter[lastStep] - initialXl : 0,
        });
    }

    candidates.sort((a, b) => {
        const totalA = a.values.reduce((sum, v) => sum + v, 0);
        const totalB = b.values.reduce((sum, v) => sum + v, 0);
        if (Math.abs(totalA - totalB) > 1e-12) return totalB - totalA;
        return compareXilianPlanMeta(a, b);
    });
    if (!candidates.length) throw new Error('没有找到可用的精炼规划');
    const maxTotal = candidates[0].values.reduce((sum, v) => sum + v, 0);

    function minimizeTargetPath(targetValues, enabledMask) {
        let achieved = 0;
        for (let slot = 0; slot < slotCount; slot++) {
            if (initialValues[slot] >= targetValues[slot] - 1e-12) achieved |= 1 << slot;
        }
        if (achieved === allMask) {
            return { enabledMask, values: targetValues, steps: [], keepCount: 0, lastStep: 0, cutoffLianjin: 0 };
        }

        let states = new Map();
        states.set(`${initialMask}|${Math.min(100, initialXl)}|${achieved}`, {
            mask: initialMask,
            xlLevel: initialXl,
            achieved,
            keepCount: 0,
            path: null,
        });
        let best = null;

        function addState(next, state) {
            const key = `${state.mask}|${Math.min(100, state.xlLevel)}|${state.achieved}`;
            const old = next.get(key);
            if (!old || state.xlLevel < old.xlLevel ||
                (state.xlLevel === old.xlLevel && state.keepCount < old.keepCount)) next.set(key, state);
        }

        for (let step = 1; step <= count && states.size; step++) {
            const next = new Map();
            for (const state of states.values()) {
                const offer = offerAt(step, state.xlLevel);
                const nextXl = state.xlLevel + xilianMaskMult(state.mask);
                addState(next, { ...state, xlLevel: nextXl });

                const slotIndex = Number(offer.slot) - 1;
                if (slotIndex < 0 || slotIndex >= slotCount || !(enabledMask & (1 << slotIndex))) continue;
                const bit = 1 << slotIndex;
                const unmarked = !(state.mask & bit);
                const reachesTarget = offer.prop?.prop === target &&
                    Number(offer.prop.value) >= targetValues[slotIndex] - 1e-12;
                if (!unmarked && (!reachesTarget || (state.achieved & bit))) continue;

                let nextAchieved = state.achieved;
                if (reachesTarget) nextAchieved |= bit;
                else if (unmarked) nextAchieved &= ~bit;
                const accepted = {
                    mask: state.mask | bit,
                    xlLevel: nextXl,
                    achieved: nextAchieved,
                    keepCount: state.keepCount + 1,
                    path: { step, prev: state.path },
                };
                if (accepted.achieved === allMask) {
                    const done = {
                        enabledMask,
                        values: targetValues,
                        steps: xilianLinkedSteps(accepted.path),
                        keepCount: accepted.keepCount,
                        lastStep: step,
                        cutoffLianjin: nextXl - initialXl,
                    };
                    if (!best || compareXilianPlanMeta(done, best) < 0) best = done;
                } else addState(next, accepted);
            }
            states = next;
        }
        return best;
    }

    const refined = candidates
        .filter(candidate => Math.abs(candidate.values.reduce((sum, v) => sum + v, 0) - maxTotal) <= 1e-12)
        .map(candidate => minimizeTargetPath(candidate.values, candidate.enabledMask) || candidate)
        .sort(compareXilianPlanMeta);
    const best = refined[0];
    const accepts = Array(count).fill(false);
    for (const step of best.steps) accepts[step - 1] = true;
    return {
        target,
        total: best.values.reduce((sum, v) => sum + v, 0),
        values: best.values,
        steps: best.steps,
        accepts,
        cutoffLianjin: best.cutoffLianjin,
        lastStep: best.lastStep,
        keepCount: best.keepCount,
    };
}

async function optimizeXilianPlan() {
    const button = document.getElementById('btnXilianOptimize');
    const target = document.getElementById('xilianTargetProp')?.value || '';
    const key = document.getElementById('xilianEquipSelect')?.value || '';
    const eq = getRuntimeEquip(key);
    if (!eq || !xilianAcceptFlags.length) { alert('请先预测精炼序列'); return; }
    if (!target) { alert('请选择目标属性'); return; }

    const oldText = button?.textContent || '规划合计最大';
    if (button) {
        button.disabled = true;
        button.textContent = '规划中…';
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
        const result = buildXilianMaxPlan(eq, xilianAcceptFlags.length, target);
        const verified = wasmXilianPlan(toWasmEquip(eq), result.accepts);
        if (verified.error || !verified.equip) throw new Error(verified.error || '规划复算失败');
        const actualTotal = xilianTargetTotal(verified.equip.exts, target);
        if (Math.abs(actualTotal - result.total) > 1e-9) {
            throw new Error(`规划校验不一致：计算 ${result.total}，复算 ${actualTotal}`);
        }
        xilianAcceptFlags = result.accepts;
        xilianAutoPlan = { ...result, total: actualTotal, equipKey: key };
        refreshXilianPlan();
        const propFilter = document.getElementById('xilianFilterProp');
        if (propFilter) {
            if (![...propFilter.options].some(option => option.value === target)) {
                const option = document.createElement('option');
                option.value = target;
                option.textContent = propLabel(target);
                propFilter.appendChild(option);
            }
            propFilter.value = target;
            renderXilianRows(xilianPlanItems, xilianAcceptFlags, true);
        }
    } catch (err) {
        xilianAutoPlan = null;
        alert(`自动规划失败：${err.message || err}`);
    } finally {
        if (button) {
            button.textContent = oldText;
            button.disabled = false;
        }
    }
}

function xilianFilterMatch(it) {
    const slot = document.getElementById('xilianFilterSlot')?.value || '';
    const prop = document.getElementById('xilianFilterProp')?.value || '';
    if (slot && String(it.slot) !== slot) return false;
    if (prop && it.prop?.prop !== prop) return false;
    return true;
}

function bindXilianKeepChecks() {
    document.querySelectorAll('#previewBody input.xl-keep').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = Number(cb.dataset.idx);
            if (Number.isFinite(idx)) xilianAcceptFlags[idx] = cb.checked;
            xilianAutoPlan = null;
            refreshXilianPlan();
        });
    });
}

function buildXilianEntries(items) {
    const out = [];
    (items || []).forEach((it, idx) => {
        if (xilianFilterMatch(it)) out.push({ it, idx });
    });
    return out;
}

function renderXilianPage() {
    const body = document.getElementById('previewBody');
    const metaFilter = document.getElementById('xilianFilterMeta');
    if (!body) return;
    const entries = tablePager.xilianEntries || [];
    const accepts = xilianAcceptFlags;
    const pageSize = getPreviewPageSize();
    const start = (tablePager.page - 1) * pageSize;
    const slice = entries.slice(start, start + pageSize);
    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">无匹配记录</td></tr>`;
    } else {
        body.innerHTML = slice.map(({ it, idx }) => {
            const oldTxt = it.old_prop
                ? `${propLabel(it.old_prop.prop)}+${formatPropValue(it.old_prop.prop, it.old_prop.value)}`
                : '—';
            const newTxt = `${propLabel(it.prop.prop)}+${formatPropValue(it.prop.prop, it.prop.value)}`;
            const kept = !!accepts[idx];
            return `<tr class="${kept ? 'row-keep' : ''}" data-idx="${idx}">
                <td><input type="checkbox" class="xl-keep" data-idx="${idx}" ${kept ? 'checked' : ''}></td>
                <td>${it.index}</td>
                <td>槽 ${it.slot}</td>
                <td>${oldTxt} → ${newTxt}</td>
                <td>×${it.cost_mult}</td>
                <td>${it.xl_level_before}→${it.xl_level}</td>
            </tr>`;
        }).join('');
        bindXilianKeepChecks();
    }
    if (metaFilter) {
        metaFilter.textContent = `显示 ${entries.length} / ${(xilianPlanItems || []).length} 条`;
    }
    updatePreviewPager(entries.length);
}

function renderXilianRows(items, accepts, resetPage = false) {
    tablePager.mode = 'xilian';
    if (resetPage) tablePager.page = 1;
    tablePager.xilianEntries = buildXilianEntries(items);
    void accepts;
    renderXilianPage();
}

function sumXilianCosts(eq, items, untilIdx) {
    const end = untilIdx == null ? items.length - 1 : untilIdx;
    const total = {};
    const isArmor = eq.typ >= 5 && eq.typ <= 7;
    const matName = isArmor ? '青蝉翼' : '昆吾石';
    const price = (EQUIP_DATA.equipment[String(eq.id)]?.price) || 10000;
    const silverOnce = Math.floor(price * 1.5);
    for (let i = 0; i <= end && i < items.length; i++) {
        const mult = items[i].cost_mult;
        total[matName] = (total[matName] || 0) + 5 * mult;
        total['连金泥'] = (total['连金泥'] || 0) + mult;
        total['银两'] = (total['银两'] || 0) + silverOnce;
    }
    return total;
}

function formatXilianCostText(total) {
    return Object.entries(total).map(([name, n]) => {
        if (name === '银两') return `${name}${formatSilver(n)}`;
        return `${name}×${n}`;
    }).join(' · ') || '—';
}

function refreshXilianPlan() {
    const key = document.getElementById('xilianEquipSelect').value;
    const eq = getRuntimeEquip(key);
    const box = document.getElementById('xilianPlanSummary');
    if (!eq || !xilianAcceptFlags.length) {
        if (box) {
            box.classList.add('empty');
            box.innerHTML = '预测后勾选「保留」查看总花费与最终属性';
        }
        return;
    }
    const accepts = xilianAcceptFlags.slice();
    const plan = wasmXilianPlan(toWasmEquip(eq), accepts);
    if (plan.error && !plan.items?.length) {
        box.classList.remove('empty');
        box.textContent = plan.error;
        return;
    }

    xilianPlanItems = plan.items || [];

    let marks = new Set(eq.xilian_marks || []);
    let simMarks = marks.size;
    for (const it of xilianPlanItems) {
        if (it.accepted) {
            marks.add(it.slot);
            simMarks = marks.size;
        }
    }

    const total = sumXilianCosts(eq, xilianPlanItems);
    const keepN = accepts.filter(Boolean).length;
    let lastKeepIdx = -1;
    for (let i = accepts.length - 1; i >= 0; i--) {
        if (accepts[i]) {
            lastKeepIdx = i;
            break;
        }
    }
    const cutoffTotal = lastKeepIdx >= 0
        ? sumXilianCosts(eq, xilianPlanItems, lastKeepIdx)
        : null;
    const lastKeepNo = lastKeepIdx >= 0
        ? (xilianPlanItems[lastKeepIdx]?.index ?? lastKeepIdx + 1)
        : 0;

    const finalEq = plan.equip || eq;
    const xl = finalEq.XLLevel ?? finalEq.xl_level ?? 0;
    const main = mainPropDisplay(eq, xl);
    const exts = finalEq.exts || [];

    const costTxt = formatXilianCostText(total);
    const cutoffTxt = cutoffTotal ? formatXilianCostText(cutoffTotal) : '';

    const extTxt = exts.length
        ? exts.map((p, i) => {
            const mk = (finalEq.xilian_marks || []).includes(i + 1) || (finalEq.xilian_marks || []).includes(String(i + 1));
            return `${i + 1}.${propLabel(p.prop)}+${formatPropValue(p.prop, p.value)}${mk ? '🔒' : ''}`;
        }).join(' · ')
        : '—';

    const lianjinTotal = plan.total_lianjin != null ? plan.total_lianjin : (total['连金泥'] || 0);
    const mainTxt = main.map(m => m.label + m.value).join(' · ') || '无罡气/内劲基础';
    const cutoffLine = cutoffTotal
        ? `<div><strong>截止花费</strong>（至第 ${lastKeepNo} 次，含此前共 ${lastKeepIdx + 1} 次精炼，保留 ${keepN} 次）：${cutoffTxt}</div>`
        : '';
    let autoLine = '';
    if (xilianAutoPlan && xilianAutoPlan.equipKey === key) {
        const target = xilianAutoPlan.target;
        const naturalSteps = xilianAutoPlan.steps.map(step => xilianPlanItems[step - 1]?.index ?? step);
        const pathText = naturalSteps.length ? naturalSteps.map(no => `第 ${no} 次`).join(' → ') : '无需新增保留';
        const targetSlots = exts.map((p, i) => {
            const value = p?.prop === target ? Number(p.value) || 0 : 0;
            return `槽 ${i + 1}=${formatPropValue(target, value)}`;
        }).join(' · ');
        autoLine = `
            <div class="xilian-opt-total"><strong>${escapeHtml(propLabel(target))}合计最大</strong>：${formatPropValue(target, xilianAutoPlan.total)}（${targetSlots || '无词条'}）</div>
            <div><strong>自动保留路径</strong>：${pathText}</div>
        `;
    }

    box.classList.remove('empty');
    box.innerHTML = `
        ${autoLine}
        <div><strong>总花费</strong>（完整序列共 ${accepts.length} 次精炼）：${costTxt}</div>
        ${cutoffLine}
        <div>连金泥合计 ${lianjinTotal} · 最终 XLLevel=${xl} · 标记槽数 ${simMarks}</div>
        <div>${mainTxt}</div>
        <div class="swap-line"><strong>最终附加</strong>：${extTxt}</div>
        <div class="warn">※ 每次精炼均消耗；仅勾选「保留」的结果会替换对应槽并标记（后续消耗翻倍）。勾选后「截止花费」按最后一条保留记录统计。</div>
    `;

    fillXilianPropFilter(xilianPlanItems);
    renderXilianRows(xilianPlanItems, accepts, false);
}

function renderXilianPreview(n) {
    setXilianHead();
    const body = document.getElementById('previewBody');
    const meta = document.getElementById('previewMeta');
    const key = document.getElementById('xilianEquipSelect').value;
    const eq = getRuntimeEquip(key);
    const filterBar = document.getElementById('xilianFilterBar');
    const makeFilter = document.getElementById('makeFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    if (!eq) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">请选择装备</td></tr>`;
        if (filterBar) filterBar.hidden = true;
        hidePreviewPager();
        return;
    }
    xilianPlanEquipKey = key;
    xilianAutoPlan = null;
    xilianAcceptFlags = Array(n).fill(false);
    const plan = wasmXilianPlan(toWasmEquip(eq), xilianAcceptFlags);
    if (plan.error && !plan.items?.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(plan.error)}</td></tr>`;
        meta.textContent = '';
        if (filterBar) filterBar.hidden = true;
        hidePreviewPager();
        return;
    }
    xilianPlanItems = plan.items || [];
    meta.textContent = `共 ${xilianPlanItems.length} 次 · 勾选「保留」后自动统计花费与最终属性`;
    fillXilianTargetProps(eq, xilianPlanItems);
    if (filterBar) {
        filterBar.hidden = false;
        document.getElementById('xilianFilterSlot').value = '';
        fillXilianPropFilter(xilianPlanItems);
        document.getElementById('xilianFilterProp').value = '';
    }
    tablePager.page = 1;
    refreshXilianPlan();
}

function setStrongHead() {
    setPreviewTableKind('strong');
    document.getElementById('previewHead').innerHTML = `<tr>
        <th>#</th><th>档位</th><th>淬炼度</th><th>消耗最少</th><th>数值最优</th>
    </tr>`;
}

function strongMinGrade() {
    return Number(document.getElementById('strongMinGrade')?.value) || 3;
}

function fillStrongTargetLevels(eq) {
    const sel = document.getElementById('strongTargetLevel');
    if (!sel) return;
    const cur = eq?.level || 0;
    const prev = Number(sel.value) || 0;
    sel.innerHTML = '';
    for (let lv = cur + 1; lv <= 15; lv++) {
        const opt = document.createElement('option');
        opt.value = lv;
        opt.textContent = `+${lv}`;
        sel.appendChild(opt);
    }
    if (!sel.options.length) {
        sel.innerHTML = '<option value="">已满 +15</option>';
        return;
    }
    const prefer = prev > cur ? prev : Math.min(15, cur + 3);
    sel.value = String(prefer);
}

function formatCostChips(bag) {
    const chips = [];
    for (const id of [3027, 3028, 3029, 3030]) {
        const n = bag?.stones?.[id] || 0;
        if (n) chips.push(`<span class="cost-chip">${STONE_NAMES[id]}×${n}</span>`);
    }
    if (bag?.silver) chips.push(`<span class="cost-chip">银两${formatSilver(bag.silver)}</span>`);
    return chips.join('') || '<span class="cost-chip">—</span>';
}

function renderPathChipsHtml(accepts, names, which) {
    const total = accepts.length;
    if (!total) return '<div class="advice-path">—</div>';
    const pages = Math.max(1, Math.ceil(total / PATH_PAGE_SIZE));
    let page = pathPages[which] || 1;
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    pathPages[which] = page;
    const start = (page - 1) * PATH_PAGE_SIZE;
    const slice = accepts.slice(start, start + PATH_PAGE_SIZE);
    const path = slice.map(st => {
        const nextLv = (st.level || 0) + 1;
        return `<span class="path-chip">
            <span class="lv">+${st.level}→+${nextLv}</span>
            <span class="idx">#${st.index}</span>
            <span class="grade-${st.grade}">${names[st.grade] || ''}</span>
        </span>`;
    }).join('');
    const pager = total > PATH_PAGE_SIZE
        ? `<div class="path-pager" data-which="${which}">
            <button type="button" class="btn btn-reset path-prev" ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <span>第 ${page}/${pages} 页 · 共 ${total} 次</span>
            <button type="button" class="btn btn-reset path-next" ${page >= pages ? 'disabled' : ''}>下一页</button>
           </div>`
        : '';
    return `<div class="advice-path">${path}</div>${pager}`;
}

function formatPlanCard(title, plan, names, tag, which) {
    if (!plan?.ok) {
        return `<article class="advice-card fail">
            <div class="advice-card-head"><h3>${title}</h3></div>
            <div>${escapeHtml(plan?.reason || '不可用')}</div>
        </article>`;
    }
    const deg = plan.value / 2;
    const atk = formatAttributeDecimal(plan.value / 10);
    const accepts = plan.steps.filter(s => s.action === '接受');
    plan._acceptSteps = accepts;
    plan._names = names;
    return `<article class="advice-card" data-plan="${which}">
        <div class="advice-card-head">
            <h3>${title}</h3>
            <span class="tag">${tag}</span>
        </div>
        <div class="advice-metrics">
            <div class="advice-metric"><span class="v">${plan.attempts}</span><span class="k">尝试次数</span></div>
            <div class="advice-metric"><span class="v">+${deg}%</span><span class="k">淬炼度</span></div>
            <div class="advice-metric"><span class="v">+${atk}%</span><span class="k">约属性</span></div>
        </div>
        <div class="advice-costs">${formatCostChips(plan.bag)}</div>
        <div class="advice-path-label">接受路径（共 ${accepts.length} 次升层）</div>
        <div class="advice-path-wrap">${renderPathChipsHtml(accepts, names, which)}</div>
    </article>`;
}

function bindPathPagers() {
    document.querySelectorAll('.path-pager').forEach(bar => {
        const which = bar.dataset.which;
        bar.querySelector('.path-prev')?.addEventListener('click', () => {
            pathPages[which] = (pathPages[which] || 1) - 1;
            refreshPathSection(which);
        });
        bar.querySelector('.path-next')?.addEventListener('click', () => {
            pathPages[which] = (pathPages[which] || 1) + 1;
            refreshPathSection(which);
        });
    });
}

function refreshPathSection(which) {
    if (!strongPlanCache) return;
    const plan = which === 'min' ? strongPlanCache.minCost : strongPlanCache.maxValue;
    const card = document.querySelector(`.advice-card[data-plan="${which}"]`);
    const wrap = card?.querySelector('.advice-path-wrap');
    if (!wrap || !plan?._acceptSteps) return;
    wrap.innerHTML = renderPathChipsHtml(plan._acceptSteps, plan._names || {}, which);
    bindPathPagers();
}

function highlightStrongPlan(which) {
    if (!strongPlanCache) return;
    const plan = which === 'min' ? strongPlanCache.minCost : strongPlanCache.maxValue;
    const set = plan?.ok ? plan.accepts : new Set();
    document.querySelectorAll('#previewBody tr[data-idx]').forEach(tr => {
        const idx = Number(tr.dataset.idx);
        tr.classList.toggle('row-keep', set.has(idx));
    });
}

function renderStrongPage() {
    const body = document.getElementById('previewBody');
    if (!body) return;
    const items = tablePager.strongItems || [];
    const minSet = tablePager.strongMinSet || new Set();
    const bestSet = tablePager.strongBestSet || new Set();
    const pageSize = getPreviewPageSize();
    const start = (tablePager.page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    if (!slice.length) {
        body.innerHTML = `<tr><td colspan="5" class="empty-row">无数据</td></tr>`;
    } else {
        body.innerHTML = slice.map(it => {
            const deg = it.add_lv_prop / 2;
            return `<tr data-idx="${it.index}">
                <td>${it.index}</td>
                <td class="grade-${it.grade}">${it.grade_name}</td>
                <td>+${deg}%（同层参考）</td>
                <td class="${minSet.has(it.index) ? 'advice-yes' : 'advice-no'}">${minSet.has(it.index) ? '接受' : '—'}</td>
                <td class="${bestSet.has(it.index) ? 'advice-yes' : 'advice-no'}">${bestSet.has(it.index) ? '接受' : '—'}</td>
            </tr>`;
        }).join('');
    }
    updatePreviewPager(items.length);
}

function renderStrongPreview(resp, eq) {
    setStrongHead();
    const body = document.getElementById('previewBody');
    const meta = document.getElementById('previewMeta');
    const advice = document.getElementById('strongAdvice');
    const xlFilter = document.getElementById('xilianFilterBar');
    if (xlFilter) xlFilter.hidden = true;
    const makeFilter = document.getElementById('makeFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    if (resp.error && (!resp.items || !resp.items.length)) {
        body.innerHTML = `<tr><td colspan="5" class="empty-row">${escapeHtml(resp.error)}</td></tr>`;
        meta.textContent = '';
        if (advice) advice.innerHTML = '';
        strongPlanCache = null;
        hidePreviewPager();
        return;
    }
    const items = resp.items || [];
    const grades = items.map(i => i.grade);
    const startLevel = eq.level || 0;
    const target = Number(document.getElementById('strongTargetLevel')?.value) || Math.min(15, startLevel + 3);
    const minG = strongMinGrade();
    const names = { 1: '一般', 2: '良好', 3: '优秀', 4: '完美' };

    const plans = planStrongPath(grades, startLevel, target, minG, eq.need_lv || 90);
    strongPlanCache = plans;
    strongPlanCache.items = items;
    pathPages = { min: 1, max: 1 };

    const perfect = items.filter(i => i.grade === 4).length;
    meta.textContent = `序列 ${items.length} · 完美 ${perfect} · 当前 +${startLevel} → 期望 +${target} · 最低 ${names[minG]}`;

    advice.innerHTML = [
        formatPlanCard('消耗最少', plans.minCost, names, '优先省稀有炼石', 'min'),
        formatPlanCard('数值最优', plans.maxValue, names, '优先高淬炼度', 'max'),
        '<div class="advice-note">※ 取消也耗炼石；同结果尽量把尝试留在更便宜的层。稀有度：紫＞蓝＞绿＞白。点下方按钮可高亮对应接受行。</div>',
    ].join('');
    bindPathPagers();

    const minSet = plans.minCost?.ok ? plans.minCost.accepts : new Set();
    const bestSet = plans.maxValue?.ok ? plans.maxValue.accepts : new Set();

    tablePager.mode = 'strong';
    tablePager.page = 1;
    tablePager.strongItems = items;
    tablePager.strongMinSet = minSet;
    tablePager.strongBestSet = bestSet;
    renderStrongPage();
}


function extractMakeRnd(data) {
    if (!data) return null;
    if (data.MakeRnd) return data.MakeRnd;
    if (Array.isArray(data) && data[0]?.MakeRnd) return data[0].MakeRnd;
    if (data.Seeds || data.LuckySeeds) return data;
    return null;
}

function loadSaveData(json) {
    const makeRnd = extractMakeRnd(json);
    if (!makeRnd) throw new Error('存档中未找到 MakeRnd');
    const state = {
        save_version: saveMeta?.version || '',
        save_channel: saveMeta?.channel || saveMeta?.platform || '',
        Seeds: makeRnd.Seeds || {},
        LuckySeeds: makeRnd.LuckySeeds || {},
        IDSeeds: makeRnd.IDSeeds || {},
        MakeLucky: makeRnd.MakeLucky || {},
    };
    if (!wasmMakeSetState(state)) throw new Error('MakeRnd 注入失败');
    makeRndSnapshot = JSON.parse(JSON.stringify(state));

    saveEquips = collectEquipsFromSave(json);
    alignCraftedSeqToEquips();
    saveEquipsSnapshot = JSON.parse(JSON.stringify(saveEquips));
    equipRuntime = {};
    equipRuntimeSnapshot = {};
    jianwangRuleDetection = detectJianwangRuleFromEquips(saveEquips);
    jianwangRedSeed = validJianwangRedSeed(makeRnd.RedSeeds?.[String(JIANWANG_BLANK_ID)])
        ? Number(makeRnd.RedSeeds[String(JIANWANG_BLANK_ID)])
        : null;
    jianwangRedSeedSnapshot = jianwangRedSeed;
    jianwangReforgeCounts = {};
    const saveRoot = Array.isArray(json) ? json[0] : json;
    for (const id of JIANWANG_LEVEL_90_IDS) {
        const savedCount = findSaveScalar(saveRoot, `again_${id}`);
        jianwangReforgeCounts[String(id)] = Math.max(0, Math.floor(Number(savedCount) || 0));
    }
    for (const e of saveEquips) {
        const k = runtimeKey(e);
        const full = { ...e, ...toWasmEquip(e), xilian_marks: [...(e.xilian_marks || [])] };
        equipRuntime[k] = JSON.parse(JSON.stringify(full));
        equipRuntimeSnapshot[k] = JSON.parse(JSON.stringify(full));
    }
    jianwangReforgeCountsSnapshot = { ...jianwangReforgeCounts };

    saveLoaded = true;
    clearMakeAdvanceNotice();
    resetXilianSession();
    document.getElementById('saveStatus').textContent = '导入成功';
    if (typeof renderArchiveState === 'function') renderArchiveState(json);
    fillEquipSelects();
    renderCraftedBagList();
    updateMakeHints();
    updateCraftedBagHint();
    updateJianwangCycleHint();
}

async function handleSaveFile(file) {
    if (typeof _importFeedback === 'function') _importFeedback(true);
    let json;
    try {
        if (typeof decryptSaveFile === 'function') {
            const r = await decryptSaveFile(file);
            json = r.data;
            saveMeta = {
                version: r.version || '',
                channel: r.channel || '',
                platform: r.platform || '',
                columns: r.columns || null,
                row: r.row || null,
            };
            if (typeof saveShareStore === 'function') {
                saveShareStore(json, {
                    version: r.version, platform: r.platform,
                    channel: r.channel || (String(r.platform || '').toLowerCase() === 'oversea' ? '国际服' : ''),
                    format: r.format || 'json', columns: r.columns || null, row: r.row || null,
                });
            }
        } else {
            const text = await file.text();
            const raw = JSON.parse(text);
            const entry = Array.isArray(raw) ? raw[0] : raw;
            if (entry && (entry.content || entry.encrypted)) {
                json = wasmDecryptSave(entry.content || entry.encrypted);
            } else {
                json = raw;
            }
        }
    } catch (e) {
        if (typeof _importFeedback === 'function') _importFeedback(false);
        throw new Error('存档解析失败: ' + e.message);
    }
    if (typeof _importFeedback === 'function') _importFeedback(false);
    loadSaveData(json);
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.getElementById('panelMake').hidden = tab !== 'make';
    const sl = document.getElementById('panelShenglian');
    if (sl) sl.hidden = tab !== 'shenglian';
    document.getElementById('panelXilian').hidden = tab !== 'xilian';
    document.getElementById('panelStrong').hidden = tab !== 'strong';
    const jwg = document.getElementById('panelJianwang');
    if (jwg) jwg.hidden = tab !== 'jianwang';
    renderMakeAdvanceNotice();
    if (tab === 'shenglian') {
        fillEquipSelects();
        updateShenglianHint();
        clearPreview('升炼无需预测序列，选择装备后点击「执行升炼」');
    } else if (tab === 'jianwang') {
        fillJianwangEquipSelect(true);
        updateJianwangHint();
        clearPreview('选择存档中的剑胚 / 专武和流程后，点击「预览当前流程」');
    } else {
        clearPreview('点击预测查看结果');
    }
}

function doMakePreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const req = requireCurrentMakeRequest();
    if (!req) return;
    const n = Math.max(1, Math.min(PREVIEW_MAX, Number(document.getElementById('previewCount').value) || 20));
    renderMakePreview(wasmMakePreview(req, n));
    updateMakeHints();
}

function doSpecialAttachPreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const equipKey = document.getElementById('specialAttachEquipSelect')?.value || '';
    const materialId = document.getElementById('specialAttachMaterialSelect')?.value || '';
    const equip = saveEquips.find(item => runtimeKey(item) === equipKey);
    const material = EQUIP_DATA.special[String(materialId)];
    if (!equip) { alert('请选择要连续附加材料的装备'); return; }
    if (!material) { alert('请选择要重复附加的特殊材料'); return; }
    const count = Number(document.getElementById('specialAttachCount')?.value);
    try {
        if (!Number.isSafeInteger(count) || count < 1 || count > PREVIEW_MAX) {
            throw new RangeError(`预测次数必须是 1–${PREVIEW_MAX} 的整数`);
        }
        renderSpecialAttachPreview(predictSpecialAttachSequence(equip, material, count));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        clearPreview(`连续附加预测失败：${message}`);
        alert(`连续附加预测失败：${message}`);
    }
}

function doMakeOnce() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const req = requireCurrentMakeRequest();
    if (!req) return;
    const r = wasmMakeOnce(req);
    if (r.error) { alert(r.error); return; }
    r.index = 1;
    const mark = getDefaultMakeMark();
    const crafted = addCraftedFromMakeResult(r, mark, req.select_id);
    setMakeAdvanceNotice(r, crafted, 1);
    const markTip = crafted?._mark ? ` · 标记「${crafted._mark}」` : '';
    const bagTip = crafted
        ? ` · 已入模拟背包(#${crafted.only_id})${markTip}`
        : '';
    appendLog(`[打造] ${r.name} · ${COLOR_NAMES[r.color] || r.color} · ${r.pity ? '保底' : r.seed_kind}${bagTip} · S=${r.S ?? r.s ?? '?'} · CZSeed=${r.CZSeed ?? r.cz_seed ?? '?'}`);
    fillEquipSelects();
    updateMakeHints();
    doMakePreview();
}

function doMakeAdvanceTo(targetIndex, mark) {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const req = requireCurrentMakeRequest();
    if (!req) return;
    const autoShenglianCheckbox = document.getElementById('makeAutoShenglian');
    const autoShenglian = autoShenglianCheckbox?.checked === true && !autoShenglianCheckbox.disabled;
    const n = Math.floor(Number(targetIndex));
    if (!(n >= 1 && n <= PREVIEW_MAX)) {
        alert(`目标序号无效（1–${PREVIEW_MAX}）`);
        return;
    }
    let last = null;
    for (let i = 1; i <= n; i++) {
        const r = wasmMakeOnce(req);
        if (r.error) {
            alert(`推进至第 ${i} 次失败：${r.error}`);
            updateMakeHints();
            return;
        }
        r.index = i;
        last = r;
    }
    const crafted = addCraftedFromMakeResult(last, mark != null ? mark : getDefaultMakeMark(), req.select_id);
    setMakeAdvanceNotice(last, crafted, n);
    const markTip = crafted?._mark ? ` · 标记「${crafted._mark}」` : '';
    let shenglianTip = '';
    if (autoShenglian && crafted) {
        const result = applyShengLian(runtimeKey(crafted));
        if (result.error) {
            shenglianTip = ` · 自动升炼失败：${result.error}`;
            alert(`装备已打造并加入模拟背包，但自动升炼失败：${result.error}`);
        } else {
            shenglianTip = ` · 已自动升炼 ${result.from} → ${result.to}`;
            renderCraftedBagList();
        }
    }
    appendLog(`[打造·推进到#${n}] ${last.name} · ${COLOR_NAMES[last.color] || last.color} · ${last.pity ? '保底' : last.seed_kind} · 入包#${crafted?.only_id || '?'}${markTip}${shenglianTip}`);
    fillEquipSelects();
    updateMakeHints();
    doMakePreview();
}

function doShengLianOnce() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const sel = document.getElementById('shenglianEquipSelect');
    const key = sel?.value;
    if (!key) { alert('请选择可升炼装备'); return; }
    const result = applyShengLian(key);
    if (result.error) { alert(result.error); return; }
    const markTip = result.equip?._mark ? ` · 标记「${result.equip._mark}」` : '';
    appendLog(`[升炼] ${result.from} → ${result.to}${markTip}`);
    fillEquipSelects();
    renderCraftedBagList();
    if (sel) sel.value = '';
    updateShenglianHint();
    if (result.equip && canXilian(result.equip)) {
        const xl = document.getElementById('xilianEquipSelect');
        const src = document.getElementById('xilianSourceFilter');
        if (result.equip._crafted && src) {
            src.value = 'crafted';
            fillEquipSelects(false);
        }
        if (xl) {
            const nk = runtimeKey(result.equip);
            if ([...xl.options].some(o => o.value === nk)) xl.value = nk;
        }
        clearPreview(`升炼完成：${result.to}，已可在精炼页选用`);
    } else {
        clearPreview(`升炼完成：${result.to}`);
    }
}

function doXilianPreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const key = document.getElementById('xilianEquipSelect').value;
    const eq = getRuntimeEquip(key);
    if (!eq) { alert('请选择装备'); return; }
    const n = Math.max(1, Math.min(XILIAN_MAX, Number(document.getElementById('xilianCount').value) || 20));
    renderXilianPreview(n);
    updateXilianHint();
}

function doStrongPreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const key = document.getElementById('strongEquipSelect').value;
    const eq = getRuntimeEquip(key);
    if (!eq) { alert('请选择装备'); return; }
    fillStrongTargetLevels(eq);
    const n = Math.max(5, Math.min(PREVIEW_MAX, Number(document.getElementById('strongCount').value) || 60));
    renderStrongPreview(wasmStrongPreview(toWasmEquip(eq), n), eq);
    updateStrongHint();
}

function clearPreview(msg) {
    const body = document.getElementById('previewBody');
    const meta = document.getElementById('previewMeta');
    const head = document.getElementById('previewHead');
    if (head) head.innerHTML = '';
    if (meta) meta.textContent = '';
    if (body) {
        body.innerHTML = `<tr><td class="empty-row">${escapeHtml(msg || '点击预测查看结果')}</td></tr>`;
    }
    const advice = document.getElementById('strongAdvice');
    if (advice) advice.innerHTML = '';
    const xlFilter = document.getElementById('xilianFilterBar');
    if (xlFilter) xlFilter.hidden = true;
    const makeFilter = document.getElementById('makeFilterBar');
    if (makeFilter) makeFilter.hidden = true;
    xilianPlanItems = [];
    tablePager.makeAllItems = [];
    tablePager.makeItems = [];
    tablePager.jianwangCyclePages = [];
    strongPlanCache = null;
    hidePreviewPager();
}

function resetAll() {
    const clearCrafted = document.getElementById('resetClearCrafted')?.checked !== false;
    const craftedEquips = clearCrafted
        ? []
        : JSON.parse(JSON.stringify(saveEquips.filter(e => e._crafted)));
    const craftedRuntime = {};
    if (!clearCrafted) {
        for (const eq of craftedEquips) {
            const key = runtimeKey(eq);
            if (equipRuntime[key]) craftedRuntime[key] = JSON.parse(JSON.stringify(equipRuntime[key]));
        }
    }
    if (makeRndSnapshot) wasmMakeSetState(makeRndSnapshot);
    saveEquips = JSON.parse(JSON.stringify(saveEquipsSnapshot));
    equipRuntime = JSON.parse(JSON.stringify(equipRuntimeSnapshot));
    jianwangReforgeCounts = { ...jianwangReforgeCountsSnapshot };
    jianwangRedSeed = jianwangRedSeedSnapshot;
    if (clearCrafted) {
        alignCraftedSeqToEquips();
    } else {
        saveEquips.push(...craftedEquips);
        Object.assign(equipRuntime, craftedRuntime);
    }
    resetXilianSession();
    strongPlanCache = null;
    fillEquipSelects();
    renderCraftedBagList();
    clearMakeAdvanceNotice();
    clearPreview(clearCrafted
        ? '已重置，模拟背包已清空，请重新点击预测'
        : `已重置，模拟背包已保留 ${craftedEquips.length} 件，请重新点击预测`);
    updateMakeHints();
    updateXilianHint();
    updateStrongHint();
    updateShenglianHint();
    updateCraftedBagHint();
    updateJianwangCycleHint();
    appendLog(clearCrafted
        ? '— 已重置为导入时状态（模拟背包已清空，升炼/精炼/淬炼/剑王阁进度已回滚）—'
        : `— 已重置为导入时状态（模拟背包已保留 ${craftedEquips.length} 件，其运行时状态未变；其他进度已回滚）—`);
}

function doJianwangCyclePreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const equipKey = document.getElementById('jianwangEquipSelect')?.value || '';
    const base = saveEquips.find(item => runtimeKey(item) === equipKey);
    const equip = base ? (getRuntimeEquip(equipKey) || base) : null;
    try {
        if (!equip || !isJianwangSword(equip)) {
            throw new TypeError('请选择剑王阁5707～5717实物');
        }
        if (!validJianwangRedSeed(jianwangRedSeed)) {
            throw new TypeError('存档缺少有效 MakeRnd.RedSeeds[5707]');
        }
        const count = Number(document.getElementById('jianwangCycleCount')?.value);
        const routeId = Number(document.getElementById('jianwangCycleRouteSelect')?.value || 0);
        renderJianwangCyclePreview(predictJianwangShatterCycle(
            equip,
            jianwangRedSeed,
            count,
            currentJianwangRule(),
            routeId || null,
        ));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        clearPreview(`碎剑预览失败：${message}`);
        alert(`碎剑预览失败：${message}`);
    }
}

function doJianwangPreview() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const equipKey = document.getElementById('jianwangEquipSelect')?.value || '';
    const action = document.getElementById('jianwangActionSelect')?.value || '';
    const materialId = document.getElementById('jianwangMaterialSelect')?.value || '';
    const base = saveEquips.find(item => runtimeKey(item) === equipKey);
    const equip = base ? (getRuntimeEquip(equipKey) || base) : null;
    const material = EQUIP_DATA.special[String(materialId)];
    if (!equip || !action) {
        alert('请选择存档中的剑王阁剑胚或专武');
        return;
    }
    try {
        const count = Number(document.getElementById('jianwangCount')?.value);
        if (!Number.isSafeInteger(count) || count < 1 || count > PREVIEW_MAX) {
            throw new RangeError(`预测次数必须是 1–${PREVIEW_MAX} 的整数`);
        }
        if (action === 'mangjing') {
            if (!canPredictJianwangMangjing(equip)) {
                throw new TypeError('所选100级实物缺少有效 MJSeed 或已铸进特殊词条');
            }
            if (!material) throw new TypeError('请选择游戏中实际铸进的特殊材料');
            renderJianwangPreview(predictSpecialAttachSequence(equip, material, count), 'mangjing');
            return;
        }
        if (action === JIANWANG_SHATTER_90 || action === JIANWANG_SHATTER_100) {
            renderJianwangPreview([predictJianwangShatterRebuild(equip, action, jianwangRedSeed)], 'shatter');
            return;
        }
        const keepIndex = Number(document.getElementById('jianwangKeepSelect')?.value || 0);
        const rows = predictJianwangStateSequence(
            equip,
            action,
            count,
            keepIndex,
            Number(jianwangReforgeCounts[String(Number(equip.id))]) || 0,
        );
        renderJianwangPreview(rows, 'state');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        clearPreview(`剑王阁专武序列预测失败：${message}`);
        alert(`剑王阁专武序列预测失败：${message}`);
    }
}

function doJianwangApplyOnce() {
    if (!saveLoaded) { alert('请先导入存档'); return; }
    const equipKey = document.getElementById('jianwangEquipSelect')?.value || '';
    const action = document.getElementById('jianwangActionSelect')?.value || '';
    const base = saveEquips.find(item => runtimeKey(item) === equipKey);
    const equip = base ? (getRuntimeEquip(equipKey) || base) : null;
    if (!equip || !action) { alert('请选择存档中的剑王阁剑胚或专武'); return; }
    if (action === 'mangjing') { alert('芒晶序列只读，不在网页内推进 MJSeed'); return; }
    try {
        if (action === JIANWANG_SHATTER_90 || action === JIANWANG_SHATTER_100) {
            const result = predictJianwangShatterRebuild(equip, action, jianwangRedSeed);
            setRuntimeEquip(equipKey, result.equip);
            jianwangRedSeed = result.redSeedAfter;
            jianwangReforgeCounts[String(result.routeId)] = 0;
            appendLog(`[剑王阁·${result.shatterLabel}] ${result.fromName} → ${result.toName} · RedSeed ${result.redSeedBefore}→${result.redSeedAfter} · 新CZSeed ${result.CZSeed}`);
            fillJianwangEquipSelect(true);
            renderJianwangPreview([result], 'shatter');
            updateJianwangHint();
            updateJianwangCycleHint();
            return;
        }
        const keepIndex = Number(document.getElementById('jianwangKeepSelect')?.value || 0);
        const rows = predictJianwangStateSequence(
            equip,
            action,
            1,
            keepIndex,
            Number(jianwangReforgeCounts[String(Number(equip.id))]) || 0,
        );
        const result = rows[0];
        setRuntimeEquip(equipKey, result.equip);
        if (action === 'reforge') {
            const idKey = String(Number(equip.id));
            jianwangReforgeCounts[idKey] = (Number(jianwangReforgeCounts[idKey]) || 0) + 1;
        }
        appendLog(`[剑王阁·${action === 'reforge' ? '重铸' : (action.startsWith('ascend:') ? '神兵' : '成长')}] ${result.fromName} → ${result.toName} · CZSeed ${result.seedBefore}→${result.seedAfter}`);
        fillJianwangEquipSelect(true);
        renderJianwangPreview(rows, 'state');
        updateJianwangHint();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        alert(`剑王阁专武执行失败：${message}`);
    }
}

async function initApp() {
    restoreMakeRegionFilter();
    restoreMakeAutoShenglian();
    if (typeof markNavTransition === 'function') {
        document.querySelectorAll('header a[href*=".html"]').forEach(a => {
            a.addEventListener('click', () => markNavTransition());
        });
    }

    const ok = await initWasm();
    if (!ok) { alert('WASM 加载失败：装备模拟不可用（存档导入与解密不受影响）'); return; }
    if (!wasmMakeInitTables(EQUIP_DATA)) { alert('装备表注入失败'); return; }

    if (typeof loadShareStore === 'function') {
        const shared = loadShareStore();
        if (shared && shared.data) {
            try {
                saveMeta = {
                    version: (shared.meta && shared.meta.version) || '',
                    channel: (shared.meta && shared.meta.channel) || '',
                    platform: (shared.meta && shared.meta.platform) || '',
                    columns: (shared.meta && shared.meta.columns) || null,
                    row: (shared.meta && shared.meta.row) || null,
                };
                loadSaveData(shared.data);
            } catch (e) {
                console.warn('自动加载共享存档失败:', e);
            }
        }
    }

    fillNpcSelect();
    fillPaperSelect();
    renderCraftedBagList();

    document.getElementById('tabBar').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) switchTab(btn.dataset.tab);
    });

    document.getElementById('npcSelect').addEventListener('change', () => {
        const filter = document.getElementById('paperFilter');
        if (filter) filter.value = '';
        fillPaperSelect();
        clearPreview('目标已变更，请点击「预测序列」');
    });
    document.getElementById('paperFilter')?.addEventListener('input', fillPaperSelect);
    document.getElementById('paperSelect').addEventListener('change', () => {
        fillSpecialSelect();
        updateMakeHints();
        clearPreview('目标已变更，请点击「预测序列」');
    });
    document.getElementById('specialSelect').addEventListener('change', () => {
        updateMakeHints();
        clearPreview('材料已变更，请点击「预测序列」');
    });
    document.getElementById('specialAttachEquipSelect')?.addEventListener('change', () => {
        fillSpecialAttachMaterialSelect(false);
        updateSpecialAttachHint();
        clearPreview('目标装备已变更，请点击「预测连续附加」');
    });
    document.getElementById('specialAttachMaterialSelect')?.addEventListener('change', () => {
        updateSpecialAttachHint();
        clearPreview('附加材料已变更，请点击「预测连续附加」');
    });
    document.getElementById('btnJianwangCyclePreview')?.addEventListener('click', doJianwangCyclePreview);
    document.getElementById('jianwangCycleCount')?.addEventListener('change', () => {
        clearPreview('循环次数已变更，请重新进行碎剑预览');
    });
    document.getElementById('jianwangCycleRouteSelect')?.addEventListener('change', () => {
        updateJianwangCycleHint();
        clearPreview('90级路线已变更，请重新进行碎剑预览');
    });
    document.getElementById('jianwangEquipSelect')?.addEventListener('change', () => {
        fillJianwangActionSelect(false);
        fillJianwangCycleRouteSelect(false);
        updateJianwangHint();
        updateJianwangCycleHint();
        clearPreview('存档实物已变更，请点击「预览当前流程」');
    });
    document.getElementById('jianwangActionSelect')?.addEventListener('change', () => {
        fillJianwangKeepSelect(false);
        fillJianwangMaterialSelect(false);
        updateJianwangControls();
        updateJianwangHint();
        clearPreview('流程已变更，请点击「预览当前流程」');
    });
    document.getElementById('jianwangKeepSelect')?.addEventListener('change', () => {
        updateJianwangHint();
        clearPreview('保留槽位已变更，请重新预览');
    });
    document.getElementById('jianwangMaterialSelect')?.addEventListener('change', () => {
        updateJianwangHint();
        clearPreview('铸进材料已变更，请点击「查看专武序列」');
    });
    document.getElementById('xilianEquipSelect').addEventListener('change', () => {
        resetXilianSession();
        updateXilianHint();
        clearPreview('装备已变更，请点击「预测序列」');
    });
    document.getElementById('strongEquipSelect').addEventListener('change', () => {
        strongPlanCache = null;
        updateStrongHint();
        clearPreview('装备已变更，请点击「预测并生成建议」');
    });
    document.getElementById('shenglianEquipSelect')?.addEventListener('change', () => {
        updateShenglianHint();
    });
    const onEquipFilterChange = () => fillEquipSelects(true);
    document.getElementById('xilianSourceFilter')?.addEventListener('change', onEquipFilterChange);
    document.getElementById('strongSourceFilter')?.addEventListener('change', onEquipFilterChange);
    document.getElementById('shenglianSourceFilter')?.addEventListener('change', onEquipFilterChange);
    document.getElementById('xilianTextFilter')?.addEventListener('input', onEquipFilterChange);
    document.getElementById('strongTextFilter')?.addEventListener('input', onEquipFilterChange);
    document.getElementById('shenglianTextFilter')?.addEventListener('input', onEquipFilterChange);
    document.getElementById('strongMinGrade')?.addEventListener('change', () => {
        clearPreview('条件已变更，请重新点击「预测并生成建议」');
        updateStrongHint();
    });
    document.getElementById('strongTargetLevel')?.addEventListener('change', () => {
        clearPreview('期望层数已变更，请重新点击「预测并生成建议」');
        updateStrongHint();
    });

    document.getElementById('btnPreview').addEventListener('click', doMakePreview);
    document.getElementById('btnSpecialAttachPreview')?.addEventListener('click', doSpecialAttachPreview);
    document.getElementById('btnJianwangPreview')?.addEventListener('click', doJianwangPreview);
    document.getElementById('btnJianwangApply')?.addEventListener('click', doJianwangApplyOnce);
    document.getElementById('btnMakeOnce').addEventListener('click', doMakeOnce);

    document.getElementById('previewBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-make-advance');
        if (!btn || tablePager.mode !== 'make') return;
        const idx = Number(btn.dataset.index);
        const row = btn.closest('tr');
        const mark = row?.querySelector('.make-row-mark')?.value ?? getDefaultMakeMark();
        const autoShenglianCheckbox = document.getElementById('makeAutoShenglian');
        const autoShenglian = autoShenglianCheckbox?.checked === true && !autoShenglianCheckbox.disabled;
        const autoTip = autoShenglian ? '\n目标装备加入背包后会自动升炼至100级。' : '';
        if (!confirm(`将连续推进 ${idx} 次，并把第 ${idx} 件加入模拟背包？\n（中间结果只推进种子，不入包）${autoTip}`)) return;
        doMakeAdvanceTo(idx, mark);
    });

    document.getElementById('craftedBagList')?.addEventListener('change', (e) => {
        const input = e.target.closest('.crafted-mark-input');
        if (!input) return;
        const row = input.closest('[data-only-id]');
        const onlyId = Number(row?.dataset.onlyId);
        if (onlyId) setCraftedMark(onlyId, input.value);
    });
    document.getElementById('craftedBagList')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act="remove"]');
        if (!btn) return;
        const row = btn.closest('[data-only-id]');
        const onlyId = Number(row?.dataset.onlyId);
        if (!onlyId) return;
        if (!confirm('从模拟背包移除该打造装备？')) return;
        removeCraftedEquip(onlyId);
    });
    document.getElementById('btnShenglianOnce')?.addEventListener('click', doShengLianOnce);
    document.getElementById('btnXilianPreview').addEventListener('click', doXilianPreview);
    document.getElementById('btnXilianOptimize')?.addEventListener('click', optimizeXilianPlan);
    document.getElementById('xilianTargetProp')?.addEventListener('change', () => {
        if (!xilianAutoPlan) return;
        xilianAutoPlan = null;
        refreshXilianPlan();
    });
    document.getElementById('btnStrongPreview').addEventListener('click', doStrongPreview);
    document.getElementById('btnStrongShowMin')?.addEventListener('click', () => highlightStrongPlan('min'));
    document.getElementById('btnStrongShowBest')?.addEventListener('click', () => highlightStrongPlan('best'));
    document.getElementById('xilianFilterSlot')?.addEventListener('change', () => {
        if (xilianPlanItems.length) renderXilianRows(xilianPlanItems, xilianAcceptFlags, true);
    });
    document.getElementById('xilianFilterProp')?.addEventListener('change', () => {
        if (xilianPlanItems.length) renderXilianRows(xilianPlanItems, xilianAcceptFlags, true);
    });
    const onMakeFilterChange = () => {
        if ((tablePager.makeAllItems || []).length) applyMakeFilter(true);
    };
    document.getElementById('makeFilterColor')?.addEventListener('change', onMakeFilterChange);
    document.getElementById('makeFilterSeed')?.addEventListener('change', onMakeFilterChange);
    document.getElementById('makeFilterProp')?.addEventListener('change', onMakeFilterChange);
    document.getElementById('makeFilterRegion')?.addEventListener('change', () => {
        persistMakeRegionFilter();
        onMakeFilterChange();
    });
    document.getElementById('makeAutoShenglian')?.addEventListener('change', persistMakeAutoShenglian);
    document.getElementById('btnResetAll')?.addEventListener('click', () => {
        if (!saveLoaded) { alert('请先导入存档'); return; }
        resetAll();
    });
    document.getElementById('btnPreviewPrev')?.addEventListener('click', () => {
        if (tablePager.page > 1) {
            tablePager.page -= 1;
            renderCurrentPreviewPage();
        }
    });
    document.getElementById('btnPreviewNext')?.addEventListener('click', () => {
        tablePager.page += 1;
        renderCurrentPreviewPage();
    });
    document.getElementById('previewPageSize')?.addEventListener('change', () => {
        tablePager.page = 1;
        renderCurrentPreviewPage();
    });
    document.getElementById('btnLogPrev')?.addEventListener('click', () => {
        if (logPage > 1) {
            logPage -= 1;
            renderLogPage();
        }
    });
    document.getElementById('btnLogNext')?.addEventListener('click', () => {
        logPage += 1;
        renderLogPage();
    });
    document.getElementById('btnClearLog').addEventListener('click', () => {
        logLines = [];
        logPage = 1;
        renderLogPage();
    });
}

document.addEventListener('DOMContentLoaded', initApp);
setTimeout(function () { if (typeof prewarmSql === 'function') prewarmSql(); }, 200);
