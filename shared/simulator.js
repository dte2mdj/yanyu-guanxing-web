var state = {
    mode: 'seed',
    zizhi: 153,
    sex: 1,
    vip: 1,
    seed: 2000548318,
    luckSeed: 0,
    luckSeedInited: false,
    roleId: 10044,
    salt: 278440,
    talents: [],
    talLucky: 0,
    dlcMode: false,
    totalWash: 0,
    totalTalentBars: 0,
    totalPills: 0,
    bagPills: 0,
    hasBagPills: false,
    goldCount: 0,
    pityCount: 0,
    qualityCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
    washHistory: [],
    lastPurpleTotalPills: null,
    exchangeCount: 0,
    saveData: null,
    strGift: 0,
    conGift: 0,
    dexGift: 0,
    intGift: 0,
    roleLevel: 90,
    roleRaw: null,
    saveRoles: [],
    roleStats: { str_val: 0, dex: 0, con: 0, int_val: 0 },
    globalVars: {},
};


function pushStateToWasm() {
    syncStateToWasm(state);
}

function pullStateFromWasm() {
    const bagPills = state.bagPills;
    const hasBagPills = state.hasBagPills;
    syncStateFromWasm(state);
    state.bagPills = bagPills;
    state.hasBagPills = hasBagPills;
}

function computeRoleStats() {
    const role = state.roleRaw;
    if (!role) {
        state.roleStats = { str_val: 0, dex: 0, con: 0, int_val: 0 };
        return;
    }
    const GIFT_COEF = 0.00006;
    function baseAttr(key) {
        const cap = key.charAt(0).toUpperCase() + key.slice(1);
        const raw = Number(role[cap === 'Str' ? 'Str' : cap] || 0);
        const born = Number(role[`Born${cap}`] || 0);
        const gift = Number(role[`${cap}Gift`] || 0);
        return Math.floor((raw + born) * (1.0 + GIFT_COEF * gift));
    }
    state.roleStats = {
        str_val: baseAttr('str'),
        dex: baseAttr('dex'),
        con: baseAttr('con'),
        int_val: baseAttr('int'),
    };
}

function extractGlobalVars() {
    const gv = state.saveData && state.saveData.globalVariable;
    state.globalVars = gv || {};
}

function getZZConfig() {
    const zz = ZZ_DATA[String(state.zizhi)] || ZZ_DATA["153"];
    if (state.dlcMode) return { ...zz, zz_name: zz.zz_name || zz.name, bd_zz: 300 };
    return { ...zz, zz_name: zz.zz_name || zz.name };
}


function _buildZZDataForWasm() {
    if (!state.dlcMode) return ZZ_DATA;
    const out = {};
    for (const k of Object.keys(ZZ_DATA)) {
        out[k] = { ...ZZ_DATA[k], bd_zz: 300 };
    }
    return out;
}

function applyDlcMode(checked) {
    state.dlcMode = !!checked;
    if (typeof wasmInitEngine === 'function') {
        wasmInitEngine(TALENT_DATA, _buildZZDataForWasm());
        if (typeof pushStateToWasm === 'function') pushStateToWasm();
    }
    if (typeof invalidatePurpleCache === 'function') invalidatePurpleCache();
    renderPityBar();
    renderCostInfo();
}

function _applyDlcByPlatform(platform) {
    const isTest = platform === 'test';
    const row = document.getElementById('dlcRow');
    const check = document.getElementById('dlcModeCheck');
    if (row) row.style.display = isTest ? '' : 'none';
    if (check) check.checked = isTest;
    applyDlcMode(isTest);
}

function _dlcLuckyBonus() {
    if (!state.dlcMode) return 0;
    const locked = state.talents.filter(t => t.locked).length;
    return Math.max(1, 3 * locked);
}

function doWash() {
    const zzConfig = getZZConfig();
    if (zzConfig.num_talent === 0) return null;

    const lockedCount = state.talents.filter(t => t.locked).length;
    if (zzConfig.num_talent <= lockedCount) return null;

    const dlcBonus = _dlcLuckyBonus();
    if (dlcBonus > 0) state.talLucky += dlcBonus;

    pushStateToWasm();

    const raw = wasmDoWash();
    if (!raw) return null;

    pullStateFromWasm();

    return convertWashResult(raw);
}

function exchangeTalent(index) {
    pushStateToWasm();

    const raw = wasmExchangeTalent(index);
    if (!raw) return;

    const result = convertExchangeResult(raw);
    if (!result.success) {
        alert(result.error || '置换失败');
        return;
    }

    pullStateFromWasm();
    addLogEntry(result);
    updateAll();
}


function getQualityClass(weight) {
    return `q${weight}`;
}

function isShenmaiTalentData(talent) {
    if (!talent) return false;
    const id = Number(talent.id);
    return id === 248 || id === 249 || id === 250 || Number(talent.type) === 248;
}

function analyzeTalentConflicts() {
    const shenmaiIdxs = [];
    state.talents.forEach((slot, index) => {
        const talent = TALENT_DATA[String(slot.id)];
        if (isShenmaiTalentData(talent)) shenmaiIdxs.push(index);
    });
    const multiShenmai = shenmaiIdxs.length >= 2;

    const seenType = {};
    const conflicts = [];

    state.talents.forEach((slot, index) => {
        const talent = TALENT_DATA[String(slot.id)];
        if (!talent || talent.type == null) {
            conflicts.push(null);
            return;
        }
        const typ = talent.type;

        if (isShenmaiTalentData(talent) && multiShenmai) {
            const partner = shenmaiIdxs.find(i => i !== index) ?? index;
            const partnerTalent = TALENT_DATA[String(state.talents[partner].id)];
            conflicts.push({
                index,
                earlierIndex: partner,
                earlierName: partnerTalent ? partnerTalent.name : '神脉',
                canExchange: true,
                shenmaiMutual: true,
            });
            if (seenType[typ] === undefined) seenType[typ] = index;
            return;
        }

        if (seenType[typ] !== undefined) {
            const earlier = seenType[typ];
            const earlierTalent = TALENT_DATA[String(state.talents[earlier].id)];
            const isPurple = (talent.weight >= 4 || talent.pinzhi >= 4);
            const earlierIsPurple = earlierTalent
                ? (earlierTalent.weight >= 4 || earlierTalent.pinzhi >= 4)
                : false;
            const earlierLocked = !!state.talents[earlier]?.locked;
            const canExchange = isPurple
                && (isShenmaiTalentData(talent) || (!earlierIsPurple && earlierLocked));
            conflicts.push({
                index,
                earlierIndex: earlier,
                earlierName: earlierTalent ? earlierTalent.name : '未知',
                canExchange,
                shenmaiMutual: false,
            });
        } else {
            seenType[typ] = index;
            conflicts.push(null);
        }
    });
    return conflicts;
}

function renderTalents() {
    const container = document.getElementById('talentSlots');
    const zzConfig = getZZConfig();
    const maxSlots = zzConfig.num_talent;

    if (maxSlots === 0) {
        container.innerHTML = '<div class="talent-card empty"><span style="color:var(--text-muted)">此资质无天赋槽位</span></div>';
        return;
    }

    const shown = state.talents.slice(0, maxSlots);
    const conflicts = analyzeTalentConflicts();
    let html = '';

    for (let i = 0; i < shown.length; i++) {
        const t = shown[i];
        const talent = TALENT_DATA[String(t.id)];
        const qClass = talent ? getQualityClass(talent.weight) : 'q1';
        const lockedClass = t.locked ? 'locked' : '';
        const lockBtnClass = t.locked ? 'locked' : '';
        const lockText = t.locked ? '已锁定' : '锁定';
        const name = talent ? talent.name : '未知天赋';
        const desc = talent ? talent.desc : '数据表中无此天赋';
        const conflict = conflicts[i];
        const conflictClass = conflict ? ' conflict' : '';

        let conflictHtml = '';
        if (conflict) {
            conflictHtml = conflict.shenmaiMutual
                ? `<span class="talent-conflict" title="多神脉互冲：槽内每条神脉都可置换">互冲 · 另有${conflict.earlierName}</span>`
                : `<span class="talent-conflict" title="与「${conflict.earlierName}」同类型，本条不生效">冲突 · 前有${conflict.earlierName}</span>`;
        }

        let exchangeBtn = '';
        if (conflict && conflict.canExchange && state.mode === 'seed') {
            exchangeBtn = `<button class="talent-exchange-btn" type="button" onclick="exchangeTalent(${i})">置换</button>`;
        }

        html += `
            <div class="talent-card ${qClass} ${lockedClass}${conflictClass} animate-in" style="animation-delay: ${i * 0.08}s">
                <div class="talent-main">
                    <span class="talent-name ${qClass}">${name}${conflict ? '<i class="talent-bang">!</i>' : ''}</span>
                    ${conflictHtml}
                    <span class="talent-desc">${desc}</span>
                </div>
                <div class="talent-actions">
                    ${exchangeBtn}
                    <button class="talent-lock-btn ${lockBtnClass}" type="button" onclick="toggleLock(${i})">${lockText}</button>
                </div>
            </div>
        `;
    }

    for (let i = shown.length; i < maxSlots; i++) {
        html += '<div class="talent-card empty">空槽位</div>';
    }

    container.innerHTML = html;
}

function renderAptitudePanel() {
    document.getElementById('zzStr').textContent = state.strGift.toLocaleString();
    document.getElementById('zzCon').textContent = state.conGift.toLocaleString();
    document.getElementById('zzDex').textContent = state.dexGift.toLocaleString();
    document.getElementById('zzInt').textContent = state.intGift.toLocaleString();

    const total = state.strGift + state.conGift + state.dexGift + state.intGift;
    document.getElementById('zzTotal').textContent = total.toLocaleString();

    const upgradeBtn = document.getElementById('btnUpgradeZiZhi');
    const zzConfig = getZZConfig();
    
    if (state.zizhi >= 154) {
        upgradeBtn.textContent = '资质已满';
        upgradeBtn.disabled = true;
    } else {
        const nextId = state.zizhi + 1;
        const nextConfig = ZZ_DATA[String(nextId)] || { num_talent: 4 };
        upgradeBtn.textContent = `提升资质（${nextConfig.num_talent} 槽）`;
        upgradeBtn.disabled = false;
    }
}

function renderStats() {
    document.getElementById('statTotalWash').textContent = state.totalWash.toLocaleString();
    document.getElementById('statTotalPills').textContent = state.totalPills.toLocaleString();
    document.getElementById('statGoldCount').textContent = state.goldCount.toLocaleString();
    document.getElementById('statPityCount').textContent = state.pityCount.toLocaleString();

    const totalTalents = Object.values(state.qualityCounts).reduce((a, b) => a + b, 0);
    for (let q = 1; q <= 4; q++) {
        const count = state.qualityCounts[q] || 0;
        const pct = totalTalents > 0 ? (count / totalTalents * 100) : 0;
        document.getElementById(`barQ${q}`).style.width = `${pct}%`;
        document.getElementById(`countQ${q}`).textContent = `${count} (${pct.toFixed(1)}%)`;
    }

    if (state.mode === 'seed') {
        document.getElementById('seedInput').value = state.seed;
    }

    if (state.hasBagPills) {
        document.getElementById('bagPillDisplay').textContent = `${state.bagPills.toLocaleString()} 颗`;
        const autoPills = document.getElementById('autoWashBagPillDisplay');
        if (autoPills) autoPills.textContent = `${state.bagPills.toLocaleString()} 颗`;
    }
}

function renderPityBar() {
    const zzConfig = getZZConfig();
    const threshold = zzConfig.bd_zz;
    const pct = threshold > 0 ? Math.min(100, state.talLucky / threshold * 100) : 0;
    
    document.getElementById('pityFill').style.width = `${pct}%`;
    document.getElementById('pityText').textContent = `${state.talLucky} / ${threshold}`;
}

function renderCostInfo() {
    const zzConfig = getZZConfig();
    const lockedCount = state.talents.filter(t => t.locked).length;
    let eatCount = zzConfig.eat_xisui;
    if (lockedCount > 0) {
        eatCount = eatCount + 2 * lockedCount - 1;
    }
    let text = `当前资质：${zzConfig.zz_name || zzConfig.name}（${zzConfig.num_talent} 槽） · 每次消耗洗髓丹 ×${eatCount}`;
    if (lockedCount > 0) {
        text += `（锁定加价 ${lockedCount}）`;
    }
    document.getElementById('costInfo').textContent = text;
}

let historyPage = 1;

function getHistoryPageSize() {
    return Number(document.getElementById('historyPageSize')?.value) || 50;
}

function recordWash(result) {
    const names = [];
    const ids = [];
    for (const t of result.talents) {
        ids.push(Number(t.id));
        const talent = TALENT_DATA[String(t.id)];
        names.push(talent ? talent.name : '未知');
    }
    state.washHistory.push({
        ...result,
        talentIds: ids,
        talentNames: names,
    });
}

function buildLogEntryEl(result) {
    const entry = document.createElement('div');
    entry.className = 'log-entry'
        + (result.gotGold || result.isExchange ? ' log-purple' : '')
        + (result.wasPity && !result.isExchange ? ' log-pity-hit' : '')
        + (result.isExchange ? ' log-exchange' : '');

    let talentsHtml = '';
    for (const t of result.talents) {
        const talent = TALENT_DATA[String(t.id)];
        const name = talent ? talent.name : '未知';
        const qClass = talent ? getQualityClass(talent.weight) : 'q1';
        const lockMark = t.locked ? '[锁]' : '';
        talentsHtml += `<span class="log-talent ${qClass}">${lockMark}${name}</span>`;
    }

    const tags = [];
    if (result.isExchange) {
        tags.push('<span class="log-tag pity">置换</span>');
        if (result.exchangedFrom && result.exchangedTo) {
            tags.push(`<span class="log-tag gap">${result.exchangedFrom}→${result.exchangedTo}</span>`);
        }
    } else if (result.wasPity) {
        tags.push('<span class="log-tag pity">保底</span>');
    } else if (result.gotGold) {
        tags.push('<span class="log-tag purple">出紫</span>');
    }

    if (result.gotGold && !result.isExchange) {
        if (result.isFirstPurple) {
            tags.push(`<span class="log-tag gap">首次 · 累计${result.purpleGapPills}丹</span>`);
        } else if (result.purpleGapPills != null) {
            tags.push(`<span class="log-tag gap">间隔${result.purpleGapPills}丹</span>`);
        }
    }

    if (!result.isExchange) {
        tags.push(`<span class="log-tag meta">×${result.pillsUsed}</span>`);
    }
    tags.push(`<span class="log-tag meta">累${result.totalPills}</span>`);

    const numLabel = result.isExchange ? `换${result.exchangeNo || ''}` : `#${result.washNo}`;
    entry.innerHTML = `
        <span class="log-num">${numLabel}</span>
        <span class="log-talents">${talentsHtml}</span>
        <span class="log-tags">${tags.join('')}</span>
    `;
    return entry;
}

function updateHistoryPager(total) {
    const bar = document.getElementById('historyPager');
    const info = document.getElementById('historyPagerInfo');
    if (!bar || !info) return;
    const pageSize = getHistoryPageSize();
    const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (historyPage > pages) historyPage = pages;
    if (historyPage < 1) historyPage = 1;
    bar.hidden = total <= 0;
    info.textContent = total
        ? `第 ${historyPage}/${pages} 页 · 共 ${total} 条`
        : '—';
    const prev = document.getElementById('btnHistoryPrev');
    const next = document.getElementById('btnHistoryNext');
    if (prev) prev.disabled = historyPage <= 1;
    if (next) next.disabled = historyPage >= pages;
}

function renderHistoryPage() {
    const log = document.getElementById('historyLog');
    if (!log) return;
    const hist = state.washHistory;
    const total = hist.length;
    if (!total) {
        log.innerHTML = '<div class="log-empty">尚未开始洗髓</div>';
        updateHistoryPager(0);
        return;
    }
    const pageSize = getHistoryPageSize();
    const pages = Math.max(1, Math.ceil(total / pageSize));
    if (historyPage > pages) historyPage = pages;
    const end = total - (historyPage - 1) * pageSize;
    const start = Math.max(0, end - pageSize);
    const slice = hist.slice(start, end);
    const frag = document.createDocumentFragment();
    for (let i = slice.length - 1; i >= 0; i--) {
        frag.appendChild(buildLogEntryEl(slice[i]));
    }
    log.innerHTML = '';
    log.appendChild(frag);
    updateHistoryPager(total);
}

function addLogEntries(results) {
    if (!results || !results.length) return;
    for (const r of results) recordWash(r);
    historyPage = 1;
    renderHistoryPage();
}

function addLogEntry(result) {
    addLogEntries([result]);
}

function clearWashHistory() {
    state.washHistory = [];
    historyPage = 1;
    renderHistoryPage();
}

function exportWashHistory() {
    if (!state.washHistory.length) {
        alert('暂无洗髓记录');
        return;
    }
    const lines = state.washHistory.map(r => {
        const names = (r.talentNames || []).join('+');
        let flag = '-';
        if (r.isExchange) flag = '置换';
        else if (r.wasPity) flag = '保底';
        else if (r.gotGold) flag = '出紫';
        let gap = '';
        if (r.isExchange) {
            gap = `${r.exchangedFrom || ''}→${r.exchangedTo || ''}`;
        } else if (r.gotGold) {
            gap = r.isFirstPurple ? `首次(${r.purpleGapPills})` : String(r.purpleGapPills ?? '');
        }
        return [
            r.isExchange ? `换` : r.washNo,
            flag,
            names,
            r.pillsUsed,
            r.totalPills,
            gap,
            r.talLucky,
        ].join('\t');
    });
    const header = ['序号', '标记', '天赋', '本次丹', '累计丹', '紫脉间隔/置换', '保底进度'].join('\t');
    const text = header + '\n' + lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `洗髓记录_${state.washHistory.length}次.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function updateAll(result) {
    invalidatePurpleCache();
    renderTalents();
    renderAptitudePanel();
    renderStats();
    renderPityBar();
    renderCostInfo();
    if (result) addLogEntry(result);
}


function asRoleList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return Object.values(value);
    return [];
}

function collectSaveRoles(saveData) {
    const out = [];
    const seen = new Set();

    function push(tag, role, keyPrefix) {
        if (!role || typeof role !== 'object' || role.ID == null) return;
        const key = `${keyPrefix}:${role.ID}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ key, tag, role });
    }

    push('主角', saveData.MainRole, 'main');
    asRoleList(saveData.Roles).forEach(r => push('随从', r, 'role'));
    asRoleList(saveData.Leavers).forEach(r => push('离队', r, 'leave'));
    return out;
}

function selectRoleFromSave(roleKey) {
    const list = state.saveRoles || [];
    let entry = list.find(e => e.key === String(roleKey));
    if (!entry && roleKey !== undefined && roleKey !== null && roleKey !== '') {
        const id = Number(roleKey);
        entry = list.find(e => e.role.ID === id);
    }
    if (!entry) return;

    const role = entry.role;
    const bt = role.BornTalent || {};

    state.seed = bt.S !== undefined ? Number(bt.S) : 0;
    state.bornTalentRC = Number(bt.RC) || 0;
    const lt = role.LuckTalent || {};
    if (lt.S !== undefined && lt.S !== null) {
        state.luckSeed = Number(lt.S);
        state.luckSeedInited = true;
    } else {
        state.luckSeed = 0;
        state.luckSeedInited = false;
    }
    state.roleId = Number(role.ID) || 0;
    state.talLucky = Number(role.TalLucky) || 0;
    state.zizhi = Number(role.ZiZhi) || 153;
    state.sex = Number(role.Sex) || 1;
    state.roleLevel = Number(role.Level) || 90;
    state.roleRaw = role;

    const rawTalents = Array.isArray(role.Talents) ? role.Talents : [];
    state.talents = rawTalents.map(t => ({
        id: Number(t.ID != null ? t.ID : t.id),
        locked: !!(t.Lock != null ? t.Lock : t.lock)
    })).filter(t => Number.isFinite(t.id) && t.id > 0);

    state.strGift = Number(role.StrGift) || 0;
    state.conGift = Number(role.ConGift) || 0;
    state.dexGift = Number(role.DexGift) || 0;
    state.intGift = Number(role.IntGift) || 0;

    computeRoleStats();
    extractGlobalVars();

    state.totalWash = 0;
    state.totalTalentBars = 0;
    state.totalPills = 0;
    state.goldCount = 0;
    state.pityCount = 0;
    state.qualityCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    state.lastPurpleTotalPills = null;
    state.exchangeCount = 0;
    invalidatePurpleCache();
    clearWashHistory();

    const zizhiEl = document.getElementById('zizhiSelect');
    const sexEl = document.getElementById('sexSelect');
    const seedEl = document.getElementById('seedInput');
    const luckEl = document.getElementById('luckSeedInput');
    const roleEl = document.getElementById('roleIdInput');
    if (zizhiEl) zizhiEl.value = String(state.zizhi);
    if (sexEl) sexEl.value = String(state.sex);
    if (seedEl) seedEl.value = String(state.seed);
    if (luckEl) luckEl.value = state.luckSeedInited ? String(state.luckSeed) : '';
    if (roleEl) roleEl.value = String(state.roleId);

    const roleSelect = document.getElementById('saveRoleSelect');
    if (roleSelect && entry.key) roleSelect.value = entry.key;

    pushStateToWasm();
    updateAll();
    renderAiTalentChoices();
    renderAutoWashSaveGate();
}

function loadParsedSaveData(saveData, silent) {
    state.saveData = saveData;
    state.bagPills = 0;
    state.hasBagPills = false;
    autoWashSelectedRoleKey = '';
    aiSelectedTalentIds = [];
    invalidateAiPrediction();

    const saveRoles = collectSaveRoles(saveData);
    state.saveRoles = saveRoles;
    if (saveRoles.length === 0) {
        alert("存档中未找到角色数据（MainRole / Roles / Leavers）！");
        return;
    }

    const items = Array.isArray(saveData.Items)
        ? saveData.Items
        : (saveData.Items && typeof saveData.Items === 'object' ? Object.values(saveData.Items) : []);
    let pillCount = 0;
    for (const item of items) {
        if (item.ID === 2601) {
            pillCount += (item.Num || 0);
        }
    }
    state.bagPills = pillCount;
    state.hasBagPills = true;

    if (saveData.CenterID) {
        state.salt = Number(saveData.CenterID) % 1000000;
        document.getElementById('saltInput').value = state.salt;
    }

    const roleSelect = document.getElementById('saveRoleSelect');
    roleSelect.innerHTML = '';

    saveRoles.forEach(entry => {
        const role = entry.role;
        const opt = document.createElement('option');
        opt.value = entry.key;
        opt.textContent = `${entry.tag} · ${role.Name || '无名'}`;
        roleSelect.appendChild(opt);
    });

    const preferred =
        saveRoles.find(e => e.role.ID === 10044) ||
        saveRoles.find(e => e.tag === '主角') ||
        saveRoles[0];
    roleSelect.value = preferred.key;

    const roleRow = document.getElementById('saveRoleRow');
    roleRow.hidden = false;
    roleRow.style.display = 'flex';
    document.getElementById('bagPillDisplay').textContent = `${pillCount.toLocaleString()} 颗`;

    state.mode = 'seed';
    document.getElementById('modeSelect').value = 'seed';

    selectRoleFromSave(preferred.key);
    renderAutoWashSaveGate();

    const nMain = saveRoles.filter(e => e.tag === '主角').length;
    const nRole = saveRoles.filter(e => e.tag === '随从').length;
    const nLeave = saveRoles.filter(e => e.tag === '离队').length;
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) {
        saveStatus.textContent = '导入成功';
    }
    if (typeof renderArchiveState === 'function') renderArchiveState(saveData);
    if (typeof invalidateEquipAutoPrediction === 'function') {
        invalidateEquipAutoPrediction('已载入新的原始存档，可开始装备自动模拟。');
    }
    if (typeof invalidateJianwangAutoPrediction === 'function') {
        invalidateJianwangAutoPrediction('已载入新的原始存档，可开始剑王阁自动模拟。');
        refreshJianwangAutoSwords(false);
    }
    if (!silent) {
        alert(
            `成功载入存档！\n` +
            `- 主角 ${nMain} / 随从 ${nRole} / 离队 ${nLeave}\n` +
            `- 背包洗髓丹: ${pillCount.toLocaleString()} 颗`
        );
    }
}

function handleSaveFileImport(file) {
    (async () => {
        if (typeof _importFeedback === 'function') _importFeedback(true);
        try {
            let json;
            if (typeof decryptSaveFile === 'function') {
                const r = await decryptSaveFile(file);
                json = r.data;
                state.saveVersion = r.version;
                state.saveChannel = r.channel || (r.platform === 'oversea' ? '国际服' : '');
                state.savePlatform = r.platform;
                if (typeof _applyDlcByPlatform === 'function') _applyDlcByPlatform(r.platform);
                state.saveFormat = r.format || 'json';
                state.saveColumns = r.columns || null;
                state.saveRow = r.row || null;
                if (typeof saveShareStore === 'function') {
                    saveShareStore(json, {
                        version: r.version, platform: r.platform,
                        channel: state.saveChannel,
                        format: r.format || 'json', columns: r.columns || null, row: r.row || null,
                    });
                }
            } else {
                const text = await file.text();
                const obj = JSON.parse(text.replace(/^\uFEFF/, '').trim());
                const entry = Array.isArray(obj) ? obj[0] : obj;
                const b64 = entry && (entry.content || entry.encrypted);
                if (b64) json = wasmDecryptSave(b64);
                else json = obj;
            }
            if (typeof _importFeedback === 'function') _importFeedback(false);
            loadParsedSaveData(json);
        } catch (err) {
            console.error(err);
            alert("读取存档失败: " + (err.message || err));
        } finally {
            if (typeof _importFeedback === 'function') _importFeedback(false);
        }
    })();
}

function upgradeZiZhi() {
    if (state.zizhi >= 154) {
        alert("资质已达到最高阶段【空前绝后】，已解锁全部 4 个天赋槽！");
        return;
    }

    state.zizhi += 1;
    const zzConfig = getZZConfig();
    document.getElementById('zizhiSelect').value = String(state.zizhi);

    state.strGift += 100;
    state.conGift += 100;

    updateAll();
    alert(`资质提升至【${zzConfig.zz_name}】！成功开启 ${zzConfig.num_talent} 个天赋槽位！`);
}


function toggleLock(index) {
    if (index >= 0 && index < state.talents.length) {
        state.talents[index].locked = !state.talents[index].locked;
        invalidatePurpleCache();
        renderTalents();
        renderCostInfo();
    }
}

window.exchangeTalent = exchangeTalent;
window.toggleLock = toggleLock;

function washOnce() {
    const result = doWash();
    if (result) updateAll(result);
}

function washMulti(times) {
    const zzConfig = getZZConfig();
    if (zzConfig.num_talent === 0) return;
    const lockedCount = state.talents.filter(t => t.locked).length;
    if (zzConfig.num_talent <= lockedCount) return;

    if (state.dlcMode) {
        const batch = [];
        for (let i = 0; i < times; i++) {
            const r = doWash();
            if (!r) break;
            batch.push(r);
        }
        if (!batch.length) return;
        addLogEntries(batch);
        updateAll();
        return;
    }

    pushStateToWasm();
    const rawBatch = wasmWashMulti(times);
    if (!rawBatch || !rawBatch.length) return;
    pullStateFromWasm();

    const batch = rawBatch.map(convertWashResult);
    addLogEntries(batch);
    updateAll();
}

function washUntilGold() {
    const zzConfig = getZZConfig();
    if (zzConfig.num_talent === 0) return;
    const lockedCount = state.talents.filter(t => t.locked).length;
    if (zzConfig.num_talent <= lockedCount) return;

    if (state.dlcMode) {
        const batch = [];
        for (let i = 0; i < 10000; i++) {
            const r = doWash();
            if (!r) break;
            batch.push(r);
            if (r.wasPity || (r.talents || []).some(t => t.weight === 4)) break;
        }
        if (!batch.length) return;
        addLogEntries(batch);
        updateAll();
        return;
    }

    pushStateToWasm();
    const rawBatch = wasmWashUntilGold(10000);
    if (!rawBatch || !rawBatch.length) return;
    pullStateFromWasm();

    const batch = rawBatch.map(convertWashResult);
    addLogEntries(batch);
    updateAll();
}

function onModeChange() {
    state.mode = document.getElementById('modeSelect').value;
    invalidatePurpleCache();
    renderTalents();
    renderCostInfo();
}

function onSeedChange() {
    state.seed = Number(document.getElementById('seedInput').value) || 0;
    invalidatePurpleCache();
    renderCostInfo();
}

function onLuckSeedChange() {
    const el = document.getElementById('luckSeedInput');
    if (!el) return;
    const raw = String(el.value || '').trim();
    if (raw === '') {
        state.luckSeedInited = false;
        state.luckSeed = 0;
        invalidatePurpleCache();
        return;
    }
    state.luckSeed = Number(raw) || 0;
    state.luckSeedInited = true;
    invalidatePurpleCache();
}

function onRoleIdChange() {
    state.roleId = Number(document.getElementById('roleIdInput').value) || 10044;
    invalidatePurpleCache();
}

function onSaltChange() {
    state.salt = Number(document.getElementById('saltInput').value) || 278440;
    invalidatePurpleCache();
}

function onZizhiChange() {
    state.zizhi = parseInt(document.getElementById('zizhiSelect').value);
    invalidatePurpleCache();
    renderTalents();
    renderAptitudePanel();
    renderPityBar();
    renderCostInfo();
    renderAiTalentChoices();
}

function onSexChange() {
    state.sex = parseInt(document.getElementById('sexSelect').value);
    invalidatePurpleCache();
    renderAiTalentChoices();
}

function normalizeVipLevel(value) {
    const vip = parseInt(value, 10);
    if (!Number.isFinite(vip) || vip <= 0) return 0;
    return vip >= 2 ? 2 : 1;
}

function vipImpactText(value) {
    const vip = normalizeVipLevel(value);
    if (vip === 0) {
        return '无 VIP：排除全部 VIP 限定脉；VIP 不改变丹耗或保底。';
    }
    if (vip === 1) {
        return 'VIP 1+：开放九阴鬼脉、玄阳神脉、混元奇脉、一心两用等；仍需满足角色类别、资质等其他条件；VIP 不改变丹耗或保底。';
    }
    return 'VIP 2+：包含 VIP 1+ 候选，并额外开放赴汤蹈火；仍需满足角色类别、资质等其他条件；VIP 不改变丹耗或保底。';
}

function syncVipControls() {
    ['vipSelect', 'autoWashVipSelect'].forEach(id => {
        const control = document.getElementById(id);
        if (control) control.value = String(state.vip);
    });
    const impact = vipImpactText(state.vip);
    ['vipImpactHint', 'autoWashVipImpactHint'].forEach(id => {
        const hint = document.getElementById(id);
        if (hint) hint.textContent = impact;
    });
}

function onVipChange(event) {
    const value = event?.target?.value ?? document.getElementById('vipSelect')?.value ?? state.vip;
    state.vip = normalizeVipLevel(value);
    syncVipControls();
    invalidatePurpleCache();
    invalidateAiPrediction();
    renderAiTalentChoices();
    renderAutoWashSaveGate();
}

function clearLog() {
    clearWashHistory();
}

function washCustom() {
    const input = document.getElementById('customWashInput');
    let count = parseInt(input ? input.value : 500);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 1000) {
        count = 1000;
        if (input) input.value = 1000;
    }
    washMulti(count);
}

const EXCHANGE_SEQUENCE_SHENMAI_IDS = new Set([248, 249, 250]);
const EXCHANGE_SEQUENCE_SHENMAI_MAX_GAP = 850;
const EXCHANGE_SEQUENCE_PRIOR_PITY_MESSAGE = '此前存在过保底紫，该处序列固定，只依赖于之前所锁定的序列';
const EXCHANGE_SEQUENCE_DIRECT_PITY_MESSAGE = '首个紫脉为保底紫，仅可选择该保底位置';

let exchangeSequenceDataset = { roles: [], globalVars: {} };
let exchangeSequenceCandidateLoadToken = 0;
let exchangeSequenceRunning = false;

function cloneExchangeSequenceValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function exchangeSequenceTalentByName(name) {
    return Object.values(TALENT_DATA).find(item => item.name === name);
}

function exchangeSequenceRoleStats(role) {
    const coefficient = 0.00006;
    function attribute(name) {
        const raw = Number(role[name] || 0);
        const born = Number(role[`Born${name}`] || 0);
        const gift = Number(role[`${name}Gift`] || 0);
        return Math.floor((raw + born) * (1 + coefficient * gift));
    }
    return {
        str_val: attribute('Str'),
        dex: attribute('Dex'),
        con: attribute('Con'),
        int_val: attribute('Int'),
    };
}

function buildExchangeSequenceWasmState(role) {
    const born = role.BornTalent || {};
    const luck = role.LuckTalent || {};
    const luckInited = luck.S !== undefined && luck.S !== null;
    const effectiveZizhi = Math.max(Number(role.ZiZhi) || 153, 153);
    return {
        mode: 'seed',
        zizhi: effectiveZizhi,
        sex: Number(role.Sex) || 1,
        vip: normalizeVipLevel(state.vip),
        seed: born.S !== undefined ? Number(born.S) : 0,
        born_talent_rc: Number(born.RC) || 0,
        save_version: state.saveVersion || '',
        save_channel: state.saveChannel || '',
        luck_seed: luckInited ? Number(luck.S) : 0,
        luck_seed_inited: luckInited,
        role_id: Number(role.ID) || 0,
        salt: Number(state.saveData?.CenterID || state.salt || 278440) % 1000000,
        talents: asRoleList(role.Talents)
            .map(talent => ({
                id: Number(talent.ID != null ? talent.ID : talent.id),
                locked: !!(talent.Lock != null ? talent.Lock : talent.lock),
            }))
            .filter(talent => Number.isFinite(talent.id) && talent.id > 0),
        tal_lucky: Number(role.TalLucky) || 0,
        total_wash: 0,
        total_talent_bars: 0,
        total_pills: 0,
        bag_pills: Number(state.bagPills) || 0,
        has_bag_pills: true,
        gold_count: 0,
        pity_count: 0,
        quality_counts: { 1: 0, 2: 0, 3: 0, 4: 0 },
        last_purple_total_pills: null,
        exchange_count: 0,
        str_gift: Number(role.StrGift) || 0,
        con_gift: Number(role.ConGift) || 0,
        dex_gift: Number(role.DexGift) || 0,
        int_gift: Number(role.IntGift) || 0,
        role_level: Number(role.Level) || 90,
        role_stats: exchangeSequenceRoleStats(role),
        global_vars: state.saveData?.globalVariable || {},
    };
}

function buildExchangeSequenceDataset() {
    const roles = (state.saveRoles || []).map(entry => {
        const wasmState = buildExchangeSequenceWasmState(entry.role);
        const slotInfo = ZZ_DATA[String(wasmState.zizhi)] || {};
        const slotCount = Number(slotInfo.num_talent || 0);
        return {
            key: entry.key,
            roleName: entry.role.Name || '无名',
            roleKind: entry.tag,
            seedStatus: wasmState.luck_seed_inited ? 'fixed_luck_seed' : 'mutable_born_seed',
            currentSeed: wasmState.luck_seed_inited ? wasmState.luck_seed : wasmState.seed,
            slotCount,
            candidates: [],
            candidatesReady: slotCount < 3,
            directPitySequence: false,
            wasmState,
        };
    });
    return {
        roles,
        globalVars: state.saveData?.globalVariable || {},
    };
}

function selectedExchangeSequenceRole() {
    const select = document.getElementById('exchangeSequenceRoleSelect');
    if (!select || select.value === '') return null;
    return exchangeSequenceDataset.roles.find(role => role.key === select.value) || null;
}

function selectedExchangeSequenceCandidate(role = selectedExchangeSequenceRole()) {
    const select = document.getElementById('exchangeSequencePurpleSelect');
    if (!role || !select || select.value === '') return null;
    return role.candidates[Number(select.value)] || null;
}

function isExchangeSequenceFourSlotRole(role) {
    return Number(role?.slotCount) >= 4;
}

function activeExchangeSequencePadInput(role) {
    return document.getElementById(isExchangeSequenceFourSlotRole(role)
        ? 'exchangeSequenceFourPadInput'
        : 'exchangeSequenceThreePadInput');
}

function readExchangeSequencePadValue(role) {
    const input = activeExchangeSequencePadInput(role);
    const fallback = isExchangeSequenceFourSlotRole(role) ? 0 : 1;
    const raw = Number(input?.value);
    const value = Number.isFinite(raw) ? Math.trunc(raw) : fallback;
    const normalized = Math.max(0, Math.min(200, value));
    if (input) input.value = String(normalized);
    return normalized;
}

function setExchangeSequenceSlotPanels(role) {
    const threeGroup = document.getElementById('exchangeSequenceThreePadGroup');
    const fourGroup = document.getElementById('exchangeSequenceFourPadGroup');
    const panel = document.getElementById('exchangeSequenceModePanel');
    const hasRole = !!role;
    const directPity = !!role?.directPitySequence;
    const fourSlot = hasRole && isExchangeSequenceFourSlotRole(role);
    if (threeGroup) threeGroup.hidden = !hasRole || fourSlot || directPity;
    if (fourGroup) fourGroup.hidden = !hasRole || !fourSlot || directPity;
    if (!panel) return;
    panel.hidden = !hasRole;
    if (!hasRole) {
        panel.textContent = '';
    } else if (directPity) {
        panel.innerHTML = '<strong>首位保底紫</strong>：当前欧气种子已由该保底位置固定，无需设置 n。';
    } else if (fourSlot) {
        panel.innerHTML = '<strong>四脉状态</strong>：所选首紫及其后续每一条脉对应一个置换种子；若实际结果偏移，可在 n 附近调整。';
    } else {
        panel.innerHTML = '<strong>三脉状态</strong>：所选首紫及其后续每一条脉对应一个置换种子，n 同时等于额外刷新次数。';
    }
}

function clearExchangeSequenceResults(message = '等待选择参数') {
    const grid = document.getElementById('exchangeSequenceGrid');
    const empty = document.getElementById('exchangeSequenceEmpty');
    const meta = document.getElementById('exchangeSequenceResultMeta');
    const seed = document.getElementById('exchangeSequenceInitialSeed');
    if (grid) {
        grid.innerHTML = '';
        grid.hidden = true;
    }
    if (empty) {
        empty.hidden = false;
        empty.textContent = message;
    }
    if (meta) meta.textContent = '尚未生成';
    if (seed) seed.textContent = '等待生成';
}

function appendExchangeSequenceOption(select, value, text, { disabled = false, className = '' } = {}) {
    if (!select) return;
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = text;
    option.disabled = disabled;
    option.className = className;
    select.appendChild(option);
}

function isExchangeSequenceShenmaiRecord(record) {
    return EXCHANGE_SEQUENCE_SHENMAI_IDS.has(Number(record?.talent_id));
}

function exchangeSequenceHasPriorPity(record) {
    return !!(record && (record.has_prior_pity || record.shenmai_has_prior_pity));
}

function isExchangeSequenceOrdinaryTargetWithoutPriorPity(record) {
    return !!record?.can_exchange && !!record?.earlier_conflict_name
        && !record?.was_pity && !isExchangeSequenceShenmaiRecord(record);
}

function isExchangeSequenceShenmaiTargetWithoutPriorPity(record) {
    const gap = Number(record?.shenmai_gap);
    return isExchangeSequenceShenmaiRecord(record)
        && !record?.was_pity
        && !!record?.shenmai_conflict_name
        && Number.isFinite(gap)
        && gap >= 0
        && gap <= EXCHANGE_SEQUENCE_SHENMAI_MAX_GAP;
}

function exchangeSequenceCandidateUnavailableReason(record) {
    if (record?.was_pity) return '保底脉，无法固定定向冲突';
    if (isExchangeSequenceShenmaiRecord(record) && !isExchangeSequenceShenmaiTargetWithoutPriorPity(record)) {
        return '无法冲突';
    }
    if (!isExchangeSequenceShenmaiRecord(record)) {
        if (!record?.earlier_conflict_name) return '无冲突脉可进行置换';
        if (!record?.can_exchange) return record?.block_reason || '当前无法按锁冲突流程置换';
    }
    if (exchangeSequenceHasPriorPity(record)) return EXCHANGE_SEQUENCE_PRIOR_PITY_MESSAGE;
    return '当前紫脉不适用置换初始化';
}

function exchangeSequenceCandidateDisplayReason(record, showPriorPityNotice = true) {
    if (record?.was_pity) return '保底脉，无法固定定向冲突';
    if (isExchangeSequenceShenmaiRecord(record) && isExchangeSequenceShenmaiTargetWithoutPriorPity(record)) {
        const conflict = `神脉冲突：${record.shenmai_conflict_name}`;
        return showPriorPityNotice && exchangeSequenceHasPriorPity(record)
            ? `${conflict}；${EXCHANGE_SEQUENCE_PRIOR_PITY_MESSAGE}`
            : conflict;
    }
    if (!isExchangeSequenceShenmaiRecord(record) && record?.can_exchange && record?.earlier_conflict_name) {
        const conflict = `首紫冲突：${record.earlier_conflict_name}`;
        return showPriorPityNotice && exchangeSequenceHasPriorPity(record)
            ? `${conflict}；${EXCHANGE_SEQUENCE_PRIOR_PITY_MESSAGE}`
            : conflict;
    }
    return exchangeSequenceCandidateUnavailableReason(record);
}

function annotateExchangeSequenceShenmaiPairs(purples, initialTalents) {
    const history = asRoleList(initialTalents)
        .map((slot, index) => {
            const talent = TALENT_DATA[String(slot?.id)];
            if (!talent || !EXCHANGE_SEQUENCE_SHENMAI_IDS.has(Number(talent.id))) return null;
            return {
                talent_id: Number(talent.id),
                talent_name: talent.name,
                wash_no: 0,
                wash_times: 0,
                initial_index: index,
                is_initial: true,
            };
        })
        .filter(Boolean);
    const ordered = purples
        .map((item, index) => ({ item, index }))
        .sort((left, right) => Number(left.item.wash_no) - Number(right.item.wash_no) || left.index - right.index);
    let hasPriorPity = false;

    for (const { item } of ordered) {
        item.has_prior_pity = hasPriorPity;
        if (isExchangeSequenceShenmaiRecord(item)) {
            const partner = [...history].reverse().find(previous =>
                String(previous.talent_name) !== String(item.talent_name));
            const gap = partner ? Number(item.wash_no) - Number(partner.wash_no) : NaN;
            item.shenmai_conflict_name = partner ? partner.talent_name : '';
            item.shenmai_conflict_wash_no = partner ? Number(partner.wash_no) : 0;
            item.shenmai_conflict_wash_times = partner
                ? (Number.isFinite(Number(partner.wash_times)) ? Number(partner.wash_times) : Number(partner.wash_no))
                : 0;
            item.shenmai_gap = Number.isFinite(gap) ? gap : null;
            item.shenmai_has_prior_pity = hasPriorPity;

            const duplicateInitial = Number(item.wash_no) === 0 && history.some(previous =>
                previous.is_initial && Number(previous.talent_id) === Number(item.talent_id));
            if (!duplicateInitial) history.push(item);
        }
        if (item.was_pity) hasPriorPity = true;
    }
}

function runExchangeSequenceWasmSandbox(callback) {
    try {
        if (!wasmInitEngine(TALENT_DATA, ZZ_DATA)) throw new Error('置换脉序引擎初始化失败');
        return callback();
    } finally {
        wasmInitEngine(TALENT_DATA, _buildZZDataForWasm());
        pushStateToWasm();
    }
}

function analyzeExchangeSequenceCandidates(role) {
    if (!role || role.candidatesReady !== false) return;
    runExchangeSequenceWasmSandbox(() => {
        const source = cloneExchangeSequenceValue(role.wasmState);
        source.global_vars = exchangeSequenceDataset.globalVars;
        source.talents = (source.talents || []).map(talent => ({ ...talent, locked: false }));
        if (!wasmSetState(source)) throw new Error(`角色「${role.roleName}」的种子状态写入失败`);
        const preview = wasmPreviewSequence(10000) || {};
        const purples = Array.isArray(preview.purples) ? preview.purples : [];
        annotateExchangeSequenceShenmaiPairs(purples, source.talents);
        const ordered = purples
            .map((item, index) => ({ item, index }))
            .sort((left, right) => Number(left.item.wash_no) - Number(right.item.wash_no) || left.index - right.index);
        const firstPurple = ordered[0]?.item;
        const directPity = !!(firstPurple && firstPurple.was_pity);
        role.directPitySequence = directPity;
        role.candidates = ordered.map(({ item }) => {
            const isShenmai = isExchangeSequenceShenmaiRecord(item);
            const isDirectPity = directPity && item === firstPurple;
            const normalAvailable = isShenmai
                ? isExchangeSequenceShenmaiTargetWithoutPriorPity(item) && !exchangeSequenceHasPriorPity(item)
                : isExchangeSequenceOrdinaryTargetWithoutPriorPity(item) && !exchangeSequenceHasPriorPity(item);
            const canInitialize = directPity ? isDirectPity : normalAvailable;
            return {
                name: item.talent_name,
                talentId: Number(item.talent_id),
                washNo: Number(item.wash_no),
                conflictName: isShenmai ? item.shenmai_conflict_name : item.earlier_conflict_name,
                conflictWashNo: isShenmai
                    ? Number(item.shenmai_conflict_wash_no || 0)
                    : Number(item.earlier_conflict_wash_no || 0),
                conflictWashTimes: isShenmai
                    ? Number(item.shenmai_conflict_wash_times || 0)
                    : Number(item.earlier_conflict_wash_times || 0),
                isShenmai,
                hasPriorPity: !!item.has_prior_pity,
                shenmaiGap: isShenmai ? item.shenmai_gap : null,
                wasPity: !!item.was_pity,
                isDirectPity,
                canInitialize,
                unavailableReason: canInitialize
                    ? ''
                    : (directPity ? EXCHANGE_SEQUENCE_DIRECT_PITY_MESSAGE : exchangeSequenceCandidateUnavailableReason(item)),
                displayReason: isDirectPity
                    ? '首位保底紫：当前种子已固定'
                    : exchangeSequenceCandidateDisplayReason(item, !directPity),
            };
        });
        role.candidatesReady = true;
    });
}

function updateExchangeSequenceGenerateButton(role = selectedExchangeSequenceRole(), candidate = selectedExchangeSequenceCandidate(role)) {
    const button = document.getElementById('btnGenerateExchangeSequence');
    if (button) button.disabled = exchangeSequenceRunning || state.dlcMode || !role || !candidate?.canInitialize;
}

function updateExchangeSequenceSelection() {
    const role = selectedExchangeSequenceRole();
    const candidate = selectedExchangeSequenceCandidate(role);
    const seedSource = document.getElementById('exchangeSequenceSeedSource');
    const selectedLabel = document.getElementById('exchangeSequenceSelectedPurpleLabel');
    const selectedPurple = document.getElementById('exchangeSequenceSelectedPurple');
    const initialLabel = document.getElementById('exchangeSequenceInitialSeedLabel');
    setExchangeSequenceSlotPanels(role);
    updateExchangeSequenceGenerateButton(role, candidate);
    if (!role) {
        if (seedSource) seedSource.textContent = '—';
        if (selectedPurple) selectedPurple.textContent = '—';
        return;
    }
    const fixed = role.seedStatus === 'fixed_luck_seed';
    if (seedSource) {
        seedSource.innerHTML = `<code>${role.currentSeed}</code> · ${fixed ? '欧气种子已固定' : '洗髓种子未固定'}`;
    }
    if (selectedLabel) selectedLabel.textContent = role.directPitySequence ? '所选首位保底紫' : '所选置换首紫';
    if (initialLabel) initialLabel.textContent = role.directPitySequence ? '当前种子' : '初始化欧气种子';
    if (selectedPurple) selectedPurple.textContent = candidate ? `#${candidate.washNo} ${candidate.name}` : '无可选首紫';
}

function renderExchangeSequencePurpleOptions(role) {
    const select = document.getElementById('exchangeSequencePurpleSelect');
    if (!select) return;
    select.innerHTML = '';
    if (role?.candidates.length) {
        role.candidates.forEach((candidate, index) => {
            appendExchangeSequenceOption(
                select,
                index,
                `#${candidate.washNo} ${candidate.name}（${candidate.displayReason || candidate.unavailableReason}）`,
                { disabled: !candidate.canInitialize, className: candidate.wasPity ? 'pity-purple-option' : '' },
            );
        });
        const firstAvailable = role.candidates.findIndex(candidate => candidate.canInitialize);
        if (firstAvailable >= 0) select.value = String(firstAvailable);
        select.disabled = firstAvailable < 0;
    } else {
        appendExchangeSequenceOption(select, '', '该角色当前没有可初始化的首紫');
        select.disabled = true;
    }
    updateExchangeSequenceSelection();
}

async function populateExchangeSequencePurples() {
    const token = ++exchangeSequenceCandidateLoadToken;
    const role = selectedExchangeSequenceRole();
    const select = document.getElementById('exchangeSequencePurpleSelect');
    const status = document.getElementById('exchangeSequenceStatus');
    clearExchangeSequenceResults();
    setExchangeSequenceSlotPanels(role);
    if (!role || !select) return;
    if (state.dlcMode) {
        select.innerHTML = '';
        appendExchangeSequenceOption(select, '', '测试服暂不支持');
        select.disabled = true;
        if (status) {
            status.className = 'exchange-sequence-status is-error';
            status.textContent = '测试服含额外保底累计规则，当前暂不支持置换脉序生成。';
        }
        updateExchangeSequenceGenerateButton(role, null);
        return;
    }
    if (role.candidatesReady === false) {
        select.innerHTML = '';
        appendExchangeSequenceOption(select, '', '正在分析置换首紫…');
        select.disabled = true;
        updateExchangeSequenceGenerateButton(role, null);
        if (status) {
            status.className = 'exchange-sequence-status';
            status.textContent = `正在分析「${role.roleName}」的置换首紫…`;
        }
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        if (token !== exchangeSequenceCandidateLoadToken || role !== selectedExchangeSequenceRole()) return;
        try {
            analyzeExchangeSequenceCandidates(role);
        } catch (error) {
            if (status) {
                status.className = 'exchange-sequence-status is-error';
                status.textContent = error?.message || String(error);
            }
            return;
        }
        if (token !== exchangeSequenceCandidateLoadToken || role !== selectedExchangeSequenceRole()) return;
    }
    renderExchangeSequencePurpleOptions(role);
    if (status) {
        status.className = 'exchange-sequence-status';
        status.textContent = role.candidates.length ? '' : '该角色当前没有可初始化的置换首紫。';
    }
}

function populateExchangeSequenceRoles() {
    const select = document.getElementById('exchangeSequenceRoleSelect');
    const purpleSelect = document.getElementById('exchangeSequencePurpleSelect');
    const status = document.getElementById('exchangeSequenceStatus');
    if (!select || !purpleSelect) return;
    select.innerHTML = '';
    if (!exchangeSequenceDataset.roles.length) {
        appendExchangeSequenceOption(select, '', '请先导入共享存档');
        select.disabled = true;
        purpleSelect.innerHTML = '';
        appendExchangeSequenceOption(purpleSelect, '', '请先导入共享存档');
        purpleSelect.disabled = true;
        setExchangeSequenceSlotPanels(null);
        updateExchangeSequenceGenerateButton(null, null);
        clearExchangeSequenceResults('请先导入共享存档');
        if (status) {
            status.className = 'exchange-sequence-status is-error';
            status.textContent = '请先在首页导入存档，再生成置换脉序。';
        }
        updateExchangeSequenceSelection();
        return;
    }
    select.disabled = false;
    exchangeSequenceDataset.roles.forEach(role => {
        appendExchangeSequenceOption(select, role.key, `${role.roleKind} · ${role.roleName}`);
    });
    const currentRoleKey = document.getElementById('saveRoleSelect')?.value;
    const preferred = exchangeSequenceDataset.roles.find(role => role.key === currentRoleKey)
        || exchangeSequenceDataset.roles.find(role => role.roleKind === '主角')
        || exchangeSequenceDataset.roles[0];
    select.value = preferred.key;
    void populateExchangeSequencePurples();
}

function openExchangeSequenceFinderModal() {
    const modal = document.getElementById('exchangeSequenceModal');
    if (!modal) return;
    modal.hidden = false;
    document.body?.classList.add('modal-open');
    exchangeSequenceDataset = buildExchangeSequenceDataset();
    exchangeSequenceCandidateLoadToken += 1;
    exchangeSequenceRunning = false;
    clearExchangeSequenceResults();
    populateExchangeSequenceRoles();
}

function closeExchangeSequenceFinderModal() {
    const modal = document.getElementById('exchangeSequenceModal');
    if (modal) modal.hidden = true;
    exchangeSequenceCandidateLoadToken += 1;
    document.body?.classList.remove('modal-open');
    pushStateToWasm();
}

function initializeExchangeSequenceSeed(role, candidate, n) {
    if (!candidate?.canInitialize) throw new Error(candidate?.unavailableReason || '所选紫脉不可进行置换');
    const directPity = !!candidate.isDirectPity;
    const base = cloneExchangeSequenceValue(role.wasmState);
    base.global_vars = exchangeSequenceDataset.globalVars;
    base.talents = (base.talents || []).map(item => ({ ...item, locked: false }));
    base.bag_pills = 999999999;
    base.has_bag_pills = true;
    if (base.luck_seed_inited) {
        const luckSeed = Number(base.luck_seed);
        if (!Number.isFinite(luckSeed)) throw new Error('无法读取当前欧气种子');
        return { base, luckSeed, fixed: true, directPity };
    }
    if (!wasmSetState(base)) throw new Error('真实种子初始化状态写入失败');

    const hasTalent = name => {
        const target = exchangeSequenceTalentByName(name);
        const current = wasmGetState();
        return !!(target && current && current.talents.some(item => Number(item.id) === Number(target.id)));
    };
    const targetTalent = exchangeSequenceTalentByName(candidate.name);
    const targetId = Number(candidate.talentId || targetTalent?.id);
    const isTargetTalent = slot => Number(slot?.id) === targetId;
    if (!Number.isFinite(targetId)) throw new Error(`未找到所选首紫「${candidate.name}」的数据`);

    const lockTalent = name => {
        const target = exchangeSequenceTalentByName(name);
        const current = wasmGetState();
        const slot = target && current?.talents.find(item => Number(item.id) === Number(target.id));
        if (!slot) throw new Error(`洗脉结果中未找到「${name}」`);
        slot.locked = true;
        current.bag_pills = 999999999;
        current.has_bag_pills = true;
        if (!wasmSetState(current)) throw new Error(`锁定「${name}」失败`);
    };

    const findTargetPurpleSnapshot = maxWashes => {
        let remaining = maxWashes;
        while (remaining > 0) {
            const beforeBatch = cloneExchangeSequenceValue(wasmGetState());
            const batchSize = Math.min(128, remaining);
            const batch = wasmWashMulti(batchSize) || [];
            const targetIndex = batch.findIndex(row => (row.talents || []).some(isTargetTalent));
            if (targetIndex >= 0) {
                if (!wasmSetState(beforeBatch)) throw new Error('紫脉定位前状态恢复失败');
                if (targetIndex > 0 && (wasmWashMulti(targetIndex) || []).length !== targetIndex) {
                    throw new Error('紫脉定位前刷新未完整重放');
                }
                const beforeTarget = cloneExchangeSequenceValue(wasmGetState());
                const targetWash = wasmDoWash();
                const targetState = wasmGetState();
                if (!targetWash || !targetState?.talents.some(isTargetTalent)) {
                    throw new Error(`未洗到所选首紫「${candidate.name}」`);
                }
                return { beforeTarget, targetState, targetWash };
            }
            if (batch.length !== batchSize) break;
            remaining -= batchSize;
        }
        throw new Error(`未洗到所选首紫「${candidate.name}」`);
    };

    if (directPity) {
        const { targetState, targetWash } = findTargetPurpleSnapshot(20000);
        if (!targetWash.was_pity) throw new Error('首位保底紫定位结果不是保底脉');
        const luckSeed = Number(targetState?.luck_seed);
        if (!targetState?.luck_seed_inited || !Number.isFinite(luckSeed)) {
            throw new Error('无法读取首位保底紫触发后留存的欧气种子');
        }
        return { base, luckSeed, fixed: false, directPity: true };
    }

    const normalizeConflictToFirstSlot = () => {
        const current = wasmGetState();
        const conflict = exchangeSequenceTalentByName(candidate.conflictName);
        const conflictIndex = current && conflict
            ? current.talents.findIndex(item => Number(item.id) === Number(conflict.id))
            : -1;
        if (!current || conflictIndex < 0) throw new Error(`未找到已锁定的首紫冲突脉「${candidate.conflictName}」`);
        const [lockedConflict] = current.talents.splice(conflictIndex, 1);
        lockedConflict.locked = true;
        current.talents = [lockedConflict, ...current.talents.map(item => ({ ...item, locked: false }))];
        current.bag_pills = 999999999;
        current.has_bag_pills = true;
        if (!wasmSetState(current)) throw new Error('首紫冲突脉定位状态写入失败');
    };

    const initializeThreeSlotShenmaiPair = () => {
        const conflictTalent = exchangeSequenceTalentByName(candidate.conflictName);
        const conflictId = Number(conflictTalent?.id);
        if (!Number.isFinite(conflictId)) throw new Error(`未找到神脉冲突「${candidate.conflictName}」的数据`);
        const writeInitializedState = (source, totalTalentBars, targetPosition = null) => {
            const initialized = cloneExchangeSequenceValue(source);
            initialized.talents = [
                { id: conflictId, locked: true },
                { id: 0, locked: false },
                { id: targetId, locked: true },
            ];
            const bars = Number(totalTalentBars);
            if (Number.isFinite(bars)) initialized.total_talent_bars = bars;
            initialized.bag_pills = 999999999;
            initialized.has_bag_pills = true;
            if (!wasmSetState(initialized)) throw new Error('三脉神脉空脉状态写入失败');
            const check = wasmGetState();
            const lockCount = check?.talents.filter(item => item.locked).length || 0;
            if (lockCount !== 2
                || Number(check?.talents[0]?.id) !== conflictId
                || Number(check?.talents[1]?.id) !== 0
                || Number(check?.talents[2]?.id) !== targetId) {
                throw new Error('三脉神脉空脉初始化校验失败');
            }
            return { padLockedCount: lockCount, targetPosition };
        };
        const current = wasmGetState();
        if (current?.talents.some(isTargetTalent)) {
            return writeInitializedState(current, current.total_talent_bars);
        }
        const { beforeTarget, targetState } = findTargetPurpleSnapshot(20000);
        const rawSlots = targetState.talents.filter(item => !item.locked);
        const targetPosition = rawSlots.findIndex(isTargetTalent);
        if (rawSlots.length !== 2 || targetPosition < 0) throw new Error('无法定位所选神脉在三脉刷新批次中的位置');
        const targetPrefix = rawSlots.slice(0, targetPosition + 1).map(item => Number(item.id));
        if (!wasmSetState(beforeTarget)) throw new Error('神脉截断前状态恢复失败');
        const truncated = wasmGetState();
        const requiredLocks = 3 - targetPrefix.length;
        const unlockedIndexes = truncated.talents
            .map((item, index) => (!item.locked ? index : -1))
            .filter(index => index >= 0);
        for (const index of unlockedIndexes) {
            if (truncated.talents.filter(item => item.locked).length >= requiredLocks) break;
            truncated.talents[index] = { id: 0, locked: true };
        }
        truncated.bag_pills = 999999999;
        truncated.has_bag_pills = true;
        if (!wasmSetState(truncated)) throw new Error('三脉神脉截断状态写入失败');
        const truncatedWash = wasmDoWash();
        const truncatedState = wasmGetState();
        const generated = (truncatedState?.talents || []).filter(item => !item.locked).map(item => Number(item.id));
        if (!truncatedWash || generated.length !== targetPrefix.length
            || generated.some((id, index) => id !== targetPrefix[index])) {
            throw new Error('三脉神脉空脉截断未保留所选神脉的原始顺序');
        }
        const startBars = Number(beforeTarget.total_talent_bars) || 0;
        const endBars = Number(truncatedState.total_talent_bars) || 0;
        if (endBars !== startBars + targetPrefix.length || Number(truncatedWash.end_s) !== Number(truncatedState.seed)) {
            throw new Error('三脉神脉空脉截断后的种子游标校验失败');
        }
        return writeInitializedState(truncatedState, targetState.total_talent_bars, targetPosition);
    };

    const initializeFourSlotEmptyPredecessor = () => {
        const current = wasmGetState();
        if (current?.talents.some(isTargetTalent)) throw new Error('所选首紫已与冲突脉同屏，无法定位紫脉前一条');
        const { beforeTarget, targetState } = findTargetPurpleSnapshot(20000);
        const rawSlots = targetState.talents.filter(item => !item.locked);
        const targetPosition = rawSlots.findIndex(isTargetTalent);
        if (rawSlots.length !== 3 || targetPosition < 0) throw new Error('无法定位所选首紫在四脉刷新批次中的位置');
        const targetPrefix = rawSlots.slice(0, targetPosition + 1).map(item => Number(item.id));
        const previousSlots = beforeTarget.talents.filter(item => !item.locked);
        const secondBefore = targetPosition >= 2
            ? rawSlots[targetPosition - 2]
            : previousSlots[previousSlots.length + targetPosition - 2];
        if (!secondBefore || !Number.isFinite(Number(secondBefore.id))) throw new Error('无法读取所选首紫前第二条脉');
        if (!wasmSetState(beforeTarget)) throw new Error('紫脉截断前状态恢复失败');
        const truncated = wasmGetState();
        const requiredLocks = 4 - targetPrefix.length;
        const unlockedIndexes = truncated.talents
            .map((item, index) => (!item.locked ? index : -1))
            .filter(index => index >= 0);
        const preserveIndex = targetPosition === 0 ? unlockedIndexes[unlockedIndexes.length - 2] : -1;
        for (const index of unlockedIndexes) {
            if (truncated.talents.filter(item => item.locked).length >= requiredLocks) break;
            if (index === preserveIndex) continue;
            truncated.talents[index] = { id: 0, locked: true };
        }
        truncated.bag_pills = 999999999;
        truncated.has_bag_pills = true;
        if (!wasmSetState(truncated)) throw new Error('四脉空脉截断状态写入失败');
        const truncatedWash = wasmDoWash();
        const truncatedState = wasmGetState();
        const generated = (truncatedState?.talents || []).filter(item => !item.locked).map(item => Number(item.id));
        if (!truncatedWash || generated.length !== targetPrefix.length
            || generated.some((id, index) => id !== targetPrefix[index])) {
            throw new Error('四脉空脉截断未保留所选首紫的原始顺序');
        }
        const startBars = Number(beforeTarget.total_talent_bars) || 0;
        const endBars = Number(truncatedState.total_talent_bars) || 0;
        if (endBars !== startBars + targetPrefix.length || Number(truncatedWash.end_s) !== Number(truncatedState.seed)) {
            throw new Error('四脉空脉截断后的种子游标校验失败');
        }
        const conflict = targetState.talents.find(item => item.locked && Number(item.id) !== 0);
        if (!conflict) throw new Error('四脉空脉定位后丢失首紫冲突脉');
        const initialized = cloneExchangeSequenceValue(truncatedState);
        initialized.talents = [
            { id: Number(conflict.id), locked: true },
            { id: Number(secondBefore.id), locked: false },
            { id: 0, locked: true },
            { id: targetId, locked: true },
        ];
        initialized.total_talent_bars = Number(targetState.total_talent_bars) || initialized.total_talent_bars;
        initialized.bag_pills = 999999999;
        initialized.has_bag_pills = true;
        if (!wasmSetState(initialized)) throw new Error('紫脉前空脉状态写入失败');
        const check = wasmGetState();
        const lockCount = check?.talents.filter(item => item.locked).length || 0;
        if (lockCount !== 3 || Number(check?.talents[3]?.id) !== targetId
            || Number(check?.talents[2]?.id) !== 0 || !check?.talents[2]?.locked) {
            throw new Error('四脉紫脉前空脉初始化校验失败');
        }
        return { extraLockName: '空脉', padLockedCount: lockCount, targetPosition };
    };

    const conflictLimit = Math.max(200, Number(candidate.conflictWashTimes || 0) + 100);
    if (!hasTalent(candidate.conflictName)) wasmWashUntilTalentName(candidate.conflictName, conflictLimit);
    if (!hasTalent(candidate.conflictName)) throw new Error(`未洗到首紫冲突脉「${candidate.conflictName}」`);
    lockTalent(candidate.conflictName);
    const fourSlot = isExchangeSequenceFourSlotRole(role);
    let extraLockName = null;
    let padLockedCount = null;
    let targetPosition = null;
    if (fourSlot) {
        normalizeConflictToFirstSlot();
        ({ extraLockName, padLockedCount, targetPosition } = initializeFourSlotEmptyPredecessor());
    } else if (candidate.isShenmai) {
        ({ padLockedCount, targetPosition } = initializeThreeSlotShenmaiPair());
    } else {
        if (!hasTalent(candidate.name)) wasmWashUntilTalentName(candidate.name, 20000);
        if (!hasTalent(candidate.name)) throw new Error(`未洗到所选首紫「${candidate.name}」`);
        lockTalent(candidate.name);
    }
    const padState = wasmGetState();
    const expectedLocks = fourSlot ? 3 : 2;
    const actualLocks = padState?.talents.filter(item => item.locked).length || 0;
    if (actualLocks !== expectedLocks) throw new Error(`首紫定位前锁定数错误：需要 ${expectedLocks}，实际 ${actualLocks}`);
    if (n > 0 && (wasmWashMulti(n) || []).length !== n) throw new Error(`首紫锁定后未完成 ${n} 次刷新`);
    const initializedState = wasmGetState();
    const luckSeed = Number(initializedState?.seed);
    if (!Number.isFinite(luckSeed)) throw new Error('无法读取该首紫与 n 对应的欧气种子');
    return {
        base,
        luckSeed,
        fixed: false,
        extraLockName,
        padLockedCount: padLockedCount || actualLocks,
        targetPosition,
    };
}

function previewExchangeSequence(base, luckSeed, count) {
    const previewState = cloneExchangeSequenceValue(base);
    previewState.seed = luckSeed;
    previewState.luck_seed = luckSeed;
    previewState.luck_seed_inited = true;
    previewState.talents = (previewState.talents || []).map(item => ({ ...item, locked: false }));
    previewState.total_wash = 0;
    previewState.total_talent_bars = 0;
    previewState.total_pills = 0;
    previewState.pity_count = 0;
    previewState.last_purple_total_pills = null;
    previewState.exchange_count = 0;
    previewState.bag_pills = 999999999;
    previewState.has_bag_pills = true;
    previewState.global_vars = exchangeSequenceDataset.globalVars;
    if (!wasmSetState(previewState)) throw new Error('置换序列状态写入失败');
    let scanLimit = Math.max(20000, count * 3200);
    let pityRows = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const preview = wasmPreviewSequence(scanLimit) || {};
        pityRows = (Array.isArray(preview.purples) ? preview.purples : []).filter(item => item.was_pity);
        if (pityRows.length >= count) break;
        scanLimit = Math.ceil(scanLimit * 1.75);
    }
    if (pityRows.length < count) throw new Error(`只生成 ${pityRows.length}/${count} 条保底紫脉，请减少生成项数`);
    return pityRows.slice(0, count).map((item, index) => ({
        index: index + 1,
        name: item.talent_name,
        talentId: Number(item.talent_id),
        sourceWashNo: Number(item.wash_no),
    }));
}

function buildExchangeSequence(role, candidate, n, count) {
    const initialized = initializeExchangeSequenceSeed(role, candidate, n);
    return {
        outputs: previewExchangeSequence(initialized.base, initialized.luckSeed, count),
        luckSeed: initialized.luckSeed,
        fixed: initialized.fixed,
        directPity: !!initialized.directPity,
        extraLockName: initialized.extraLockName || null,
        padLockedCount: initialized.padLockedCount || null,
    };
}

function renderExchangeSequence(role, candidate, n, result) {
    const initialSeed = document.getElementById('exchangeSequenceInitialSeed');
    const grid = document.getElementById('exchangeSequenceGrid');
    const empty = document.getElementById('exchangeSequenceEmpty');
    const meta = document.getElementById('exchangeSequenceResultMeta');
    if (initialSeed) {
        initialSeed.innerHTML = result.directPity
            ? `<code>${result.luckSeed}</code>（当前种子已固定）`
            : `<code>${result.luckSeed}</code>${result.fixed ? '（已固定，n 不改变种子）' : ''}`;
    }
    if (grid) {
        grid.innerHTML = result.outputs.map(item =>
            `<li data-index="${item.index}" data-source-wash-no="${item.sourceWashNo}" title="第 ${item.index} 条保底紫脉"><strong>${item.name}</strong></li>`
        ).join('');
        grid.hidden = false;
    }
    if (empty) empty.hidden = true;
    const extraLock = result.extraLockName ? `（${result.extraLockName}）` : '';
    const lockMode = result.padLockedCount ? ` · ${role.slotCount}脉锁${result.padLockedCount}${extraLock}` : '';
    if (meta) {
        meta.textContent = result.directPity
            ? `${role.roleName} · 首位保底紫 ${candidate.name} · 当前种子已固定 · 前 ${result.outputs.length} 条`
            : `${role.roleName} · 置换首紫 ${candidate.name} · 紫后第 ${n} 条脉${lockMode} · 前 ${result.outputs.length} 条`;
    }
}

function generateExchangeSequence() {
    if (exchangeSequenceRunning || state.dlcMode) return;
    const role = selectedExchangeSequenceRole();
    const candidate = selectedExchangeSequenceCandidate(role);
    const status = document.getElementById('exchangeSequenceStatus');
    const countInput = document.getElementById('exchangeSequenceCountInput');
    if (!role || !candidate?.canInitialize) {
        if (status) {
            status.className = 'exchange-sequence-status is-error';
            status.textContent = candidate?.unavailableReason || '请先选择可初始化的置换首紫。';
        }
        return;
    }
    const n = candidate.isDirectPity ? 0 : readExchangeSequencePadValue(role);
    const count = Math.max(20, Math.min(1000, Math.trunc(Number(countInput?.value) || 20)));
    if (countInput) countInput.value = String(count);
    exchangeSequenceRunning = true;
    updateExchangeSequenceGenerateButton(role, candidate);
    clearExchangeSequenceResults('正在生成置换脉序…');
    if (status) {
        status.className = 'exchange-sequence-status';
        status.textContent = candidate.isDirectPity ? '正在生成固定种子序列…' : '正在生成保底紫脉序列…';
    }
    requestAnimationFrame(() => {
        try {
            const result = runExchangeSequenceWasmSandbox(() => buildExchangeSequence(role, candidate, n, count));
            renderExchangeSequence(role, candidate, n, result);
            if (status) status.textContent = '';
        } catch (error) {
            if (status) {
                status.className = 'exchange-sequence-status is-error';
                status.textContent = error?.message || String(error);
            }
            clearExchangeSequenceResults('置换脉序生成失败');
        } finally {
            exchangeSequenceRunning = false;
            updateExchangeSequenceGenerateButton();
        }
    });
}

let cachedPurpleData = { purples: [], luck_pool: [] };
let cachedPurpleKey = '';
let currentMaxWashes = 3000;
let routeWashNos = [];
let routePadCount = 0;

function washPredictionStateSnapshot() {
    return {
        saveVersion: state.saveVersion || '',
        saveChannel: state.saveChannel || '',
        bornTalentRC: Number(state.bornTalentRC) || 0,
        dlcMode: state.dlcMode,
        mode: state.mode,
        zizhi: state.zizhi,
        sex: state.sex,
        vip: state.vip,
        seed: state.seed,
        luckSeed: state.luckSeed,
        luckSeedInited: state.luckSeedInited,
        roleId: state.roleId,
        salt: state.salt,
        talents: state.talents.map(t => ({ id: t.id, locked: !!t.locked })),
        talLucky: state.talLucky,
        totalWash: state.totalWash,
        totalTalentBars: state.totalTalentBars,
        totalPills: state.totalPills,
        bagPills: state.bagPills,
        hasBagPills: state.hasBagPills,
        goldCount: state.goldCount,
        pityCount: state.pityCount,
        qualityCounts: state.qualityCounts,
        lastPurpleTotalPills: state.lastPurpleTotalPills,
        exchangeCount: state.exchangeCount,
        gifts: [state.strGift, state.conGift, state.dexGift, state.intGift],
        roleLevel: state.roleLevel,
        roleStats: state.roleStats,
        globalVars: state.globalVars,
    };
}

function purpleCacheKey() {
    return JSON.stringify({
        max: currentMaxWashes,
        state: washPredictionStateSnapshot(),
    });
}

function invalidatePurpleCache() {
    cachedPurpleKey = '';
    cachedPurpleData = { purples: [], luck_pool: [] };
    cachedExchangePadKey = '';
    cachedExchangePadResults = null;
    if (typeof invalidateAiPrediction === 'function') invalidateAiPrediction();
}

function ensurePurpleSequenceCache({ force = false } = {}) {
    const key = purpleCacheKey();
    if (!force && cachedPurpleKey === key && cachedPurpleData.purples) {
        return cachedPurpleData;
    }
    pushStateToWasm();
    const rawRes = wasmPreviewSequence(currentMaxWashes);
    cachedPurpleData = rawRes || { purples: [], luck_pool: [] };
    cachedPurpleKey = key;
    return cachedPurpleData;
}

function openPurpleAnalysisModal() {
    currentMaxWashes = 3000;
    const modal = document.getElementById('purpleModal');
    if (modal) {
        modal.hidden = false;
        document.body?.classList.add('modal-open');
    }
    const tbody = document.getElementById('purpleTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-td">正在分析推演脉序中...</td></tr>`;
    requestAnimationFrame(() => {
        ensurePurpleSequenceCache({ force: true });
        paintPurpleForecastTable();
        renderExchangeAnalysisBlock();
    });
}

function closePurpleAnalysisModal() {
    const modal = document.getElementById('purpleModal');
    if (modal) modal.hidden = true;
    document.body?.classList.remove('modal-open');
}

function loadMoreSequence() {
    currentMaxWashes += 3000;
    const tbody = document.getElementById('purpleTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-td">正在扩展脉序至 ${currentMaxWashes}...</td></tr>`;
    requestAnimationFrame(() => {
        ensurePurpleSequenceCache({ force: true });
        paintPurpleForecastTable();
        renderExchangeAnalysisBlock();
    });
}

function renderPurpleForecastTable() {
    ensurePurpleSequenceCache();
    paintPurpleForecastTable();
    renderExchangeAnalysisBlock();
}

function paintPurpleForecastTable() {
    const tbody = document.getElementById('purpleTableBody');
    if (!tbody) return;

    const purples = cachedPurpleData.purples || [];

    const searchKeyword = (document.getElementById('purpleSearchInput')?.value || '').trim().toLowerCase();
    const exchangeOnly = document.getElementById('filterExchangeOnly')?.checked || false;
    const pityOnly = document.getElementById('filterPityOnly')?.checked || false;

    let filtered = purples.filter(item => {
        if (exchangeOnly && !item.can_exchange) return false;
        if (pityOnly && !item.was_pity) return false;
        if (searchKeyword) {
            const nameMatch = item.talent_name.toLowerCase().includes(searchKeyword);
            const conflictMatch = (item.earlier_conflict_name || '').toLowerCase().includes(searchKeyword);
            if (!nameMatch && !conflictMatch) return false;
        }
        return true;
    });

    const totalPurples = purples.length;
    const exchangeableTotal = purples.filter(i => i.can_exchange).length;

    const elMax = document.getElementById('currentMaxWashesDisplay');
    const elTotal = document.getElementById('purpleCount');
    const elEx = document.getElementById('exchangeableCount');
    if (elMax) elMax.textContent = currentMaxWashes;
    if (elTotal) elTotal.textContent = totalPurples;
    if (elEx) elEx.textContent = exchangeableTotal;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-td">未找到符合条件的紫脉（已预测 ${currentMaxWashes} 次洗髓 / 脉序按天赋条数）</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach((item, idx) => {
        const pityTag = item.was_pity
            ? '<span class="tag-pity" title="未锁定连洗下的保底预测；中途锁脉后保底紫可能换成别的（与游戏一致）">保底</span>'
            : '-';

        let conflictText = '-';
        if (item.earlier_conflict_name) {
            const prevWashStr = item.earlier_conflict_wash_no === 0 ? '初始槽位' : `#${item.earlier_conflict_wash_no}`;
            const gapStr = item.earlier_conflict_gap != null ? `相距 ${item.earlier_conflict_gap} 条` : '';
            const purpleTag = item.earlier_conflict_is_purple ? ' · 紫' : '';
            conflictText = `<span class="conflict-cell">前有「${item.earlier_conflict_name}」<span class="conflict-wash-no">(${prevWashStr}，${gapStr}${purpleTag})</span></span>`;
        } else if (item.block_reason) {
            conflictText = `<span class="text-muted">${item.block_reason}</span>`;
        }

        let actionBtn = '-';
        if (item.can_exchange) {
            const isSelected = routeWashNos.includes(item.wash_no);
            actionBtn = `
                <button class="btn-select-exchange ${isSelected ? 'active' : ''}" data-washno="${item.wash_no}">
                    ${isSelected ? '已选推演' : '选择推演'}
                </button>
            `;
        }

        html += `
            <tr data-washno="${item.wash_no}">
                <td>#${idx + 1}</td>
                <td><b>#${item.wash_no}</b><div class="conflict-wash-no">洗${item.wash_times || '-'}次</div></td>
                <td><b class="purple-bright">${item.talent_name}</b></td>
                <td>${pityTag}</td>
                <td>${conflictText}</td>
                <td>${actionBtn}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.btn-select-exchange').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const washNo = parseInt(e.target.getAttribute('data-washno'));
            const idx = routeWashNos.indexOf(washNo);
            if (idx >= 0) {
                routeWashNos.splice(idx, 1);
            } else {
                routeWashNos.push(washNo);
                routeWashNos.sort((a, b) => a - b);
            }
            cachedExchangePadKey = '';
            const maxPad = getRouteMaxPad();
            if (routePadCount > maxPad) routePadCount = maxPad;
            paintPurpleForecastTable();
            renderExchangeAnalysisBlock();
        });
    });
}

function findNextPurpleAfter(afterSeq) {
    const purples = cachedPurpleData.purples || [];
    const after = Math.max(0, Number(afterSeq) || 0);
    return purples.find(p => p.wash_no > after) || null;
}

function hasLockableNonPurpleConflict(item) {
    return !!(item && item.can_exchange && item.earlier_conflict_name && !item.earlier_conflict_is_purple);
}

function highlightPurpleRow(washNo, { conflict = false } = {}) {
    const tbody = document.getElementById('purpleTableBody');
    if (!tbody) return;
    tbody.querySelectorAll('tr.row-highlight').forEach(tr => {
        tr.classList.remove('row-highlight', 'row-highlight-conflict');
    });
    const row = tbody.querySelector(`tr[data-washno="${washNo}"]`);
    if (!row) return;
    row.classList.add('row-highlight');
    if (conflict) row.classList.add('row-highlight-conflict');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function findTalentSlotIndexByName(name) {
    if (!name) return -1;
    return state.talents.findIndex(t => {
        const td = TALENT_DATA[String(t.id)];
        return td && td.name === name;
    });
}

function lockTalentByName(name) {
    const idx = findTalentSlotIndexByName(name);
    if (idx < 0) return false;
    state.talents[idx].locked = true;
    return true;
}

function canContinueWash() {
    const zzConfig = getZZConfig();
    if (zzConfig.num_talent === 0) return false;
    const lockedCount = state.talents.filter(t => t.locked).length;
    return zzConfig.num_talent > lockedCount;
}

function batchWashTimes(times) {
    if (times <= 0 || !canContinueWash()) return 0;
    if (state.dlcMode) {
        const batch = [];
        for (let i = 0; i < times; i++) {
            const result = doWash();
            if (!result) break;
            batch.push(result);
        }
        if (batch.length) addLogEntries(batch);
        return batch.length;
    }
    pushStateToWasm();
    const rawBatch = wasmWashMulti(times);
    if (!rawBatch || !rawBatch.length) return 0;
    pullStateFromWasm();
    addLogEntries(rawBatch.map(convertWashResult));
    return rawBatch.length;
}

function batchWashUntilName(name, maxWashes = 5000) {
    if (!name) return { washed: 0, found: false };
    if (findTalentSlotIndexByName(name) >= 0) return { washed: 0, found: true };
    if (!canContinueWash()) return { washed: 0, found: false };
    if (state.dlcMode) {
        const batch = [];
        let found = false;
        for (let i = 0; i < maxWashes; i++) {
            const result = doWash();
            if (!result) break;
            batch.push(result);
            found = findTalentSlotIndexByName(name) >= 0;
            if (found) break;
        }
        if (batch.length) addLogEntries(batch);
        return { washed: batch.length, found };
    }
    pushStateToWasm();
    const rawBatch = wasmWashUntilTalentName(name, maxWashes);
    if (!rawBatch || !rawBatch.length) {
        pullStateFromWasm();
        return { washed: 0, found: findTalentSlotIndexByName(name) >= 0 };
    }
    pullStateFromWasm();
    addLogEntries(rawBatch.map(convertWashResult));
    return { washed: rawBatch.length, found: findTalentSlotIndexByName(name) >= 0 };
}

function washToConflictAndLock(item) {
    if (!item || !item.earlier_conflict_name) {
        alert('该紫脉没有可锁定的前置冲突脉');
        return;
    }
    if (item.earlier_conflict_is_purple) {
        alert(`冲突「${item.earlier_conflict_name}」为紫脉/神脉，请改在「紫脉脉序与置换推演」中操作神脉互冲`);
        return;
    }
    const conflictTimes = item.earlier_conflict_wash_times || 0;
    const conflictSeq = item.earlier_conflict_wash_no || 0;
    if (conflictTimes > 0 && state.totalWash > conflictTimes) {
        alert(`当前已洗 ${state.totalWash} 次（超过冲突脉洗髓次数 ${conflictTimes}，脉序 #${conflictSeq}）。请重置网页后重试。`);
        return;
    }
    if (conflictTimes > state.totalWash) {
        const need = conflictTimes - state.totalWash;
        const n = batchWashTimes(need);
        if (n < need && state.totalWash < conflictTimes) {
            updateAll();
            alert('未能洗到冲突脉');
            return;
        }
    }
    if (findTalentSlotIndexByName(item.earlier_conflict_name) < 0) {
        const r = batchWashUntilName(item.earlier_conflict_name, 80);
        if (!r.found) {
            updateAll();
            alert(`脉序 #${conflictSeq || '-'}（洗${conflictTimes || state.totalWash}次）附近未出现「${item.earlier_conflict_name}」`);
            return;
        }
    }
    lockTalentByName(item.earlier_conflict_name);
    updateAll();
    findAndShowNextConflict(state.totalTalentBars);
}

function washToPurpleTalent(item) {
    if (!item) return;
    if (findTalentSlotIndexByName(item.talent_name) >= 0) {
        updateAll();
        findAndShowNextConflict(state.totalTalentBars);
        return;
    }
    const r = batchWashUntilName(item.talent_name, 5000);
    updateAll();
    if (!r.found) {
        alert(r.washed > 0
            ? `连洗 ${r.washed} 次仍未出现「${item.talent_name}」，请确认已锁定冲突脉`
            : '未能洗到紫脉');
    }
    findAndShowNextConflict(state.totalTalentBars);
}

function washConflictThenPurple(item) {
    washToConflictAndLock(item);
    if (findTalentSlotIndexByName(item.earlier_conflict_name) < 0) return;
    washToPurpleTalent(item);
}

function findAndShowNextConflict(afterSeq) {
    const box = document.getElementById('nextConflictResult');
    const afterEl = document.getElementById('nextConflictAfterWash');
    const after = afterSeq != null ? afterSeq : (state.totalTalentBars || 0);
    if (afterEl) afterEl.value = String(after);

    ensurePurpleSequenceCache();

    const item = findNextPurpleAfter(after);
    if (!box) return item;

    if (!item) {
        box.innerHTML = `<span class="text-muted">脉序 #${after} 之后未找到紫脉（可先打开「紫脉脉序与置换推演」加载更多；脉序=天赋条数）</span>`;
        return null;
    }

    if (!hasLockableNonPurpleConflict(item)) {
        const reason = item.block_reason
            || (!item.earlier_conflict_name
                ? `下一紫「${item.talent_name}」无同类冲突，无法置换`
                : (item.earlier_conflict_is_purple
                    ? `下一紫「${item.talent_name}」冲突为紫脉/神脉「${item.earlier_conflict_name}」，无非紫脉冲突可锁定（神脉可在脉序推演中互冲）`
                    : `下一紫「${item.talent_name}」不可按锁冲突流程置换`));
        box.innerHTML = `
            <div class="nc-steps" style="color:var(--red)">查询不到可锁定的非紫冲突脉</div>
            <div>下一紫：<b class="purple-bright">#${item.wash_no} ${item.talent_name}</b>${item.was_pity ? ' · 保底' : ''}</div>
            <div class="nc-steps">${reason}</div>
            <div class="nc-actions">
                <button type="button" class="btn btn-wash-custom" id="btnNcFindAfter" data-after="${item.wash_no}">再查其后下一紫</button>
            </div>
        `;
        const afterBtn = box.querySelector('#btnNcFindAfter');
        if (afterBtn) {
            afterBtn.addEventListener('click', () => {
                findAndShowNextConflict(parseInt(afterBtn.getAttribute('data-after'), 10));
            });
        }
        return null;
    }

    const curBars = state.totalTalentBars || 0;
    const curWash = state.totalWash || 0;
    const conflictSeq = item.earlier_conflict_wash_no || 0;
    const conflictTimes = item.earlier_conflict_wash_times || 0;
    const prevWashStr = conflictSeq === 0 ? '初始槽位' : `#${conflictSeq}`;
    const gapStr = item.earlier_conflict_gap != null ? `相距 ${item.earlier_conflict_gap} 条` : '';
    const pity = item.was_pity ? ' · 保底' : '';

    const toConflictWash = conflictTimes > curWash ? conflictTimes - curWash : 0;
    const toPurpleWash = (item.wash_times || 0) > curWash ? (item.wash_times - curWash) : 0;
    const hasConflictNow = findTalentSlotIndexByName(item.earlier_conflict_name) >= 0;
    const conflictLocked = hasConflictNow && state.talents[findTalentSlotIndexByName(item.earlier_conflict_name)]?.locked;
    const hasPurpleNow = findTalentSlotIndexByName(item.talent_name) >= 0;

    let statusHtml = `<div class="nc-steps">当前：脉序 <b>#${curBars}</b>（已洗 ${curWash} 次）`;
    if (hasPurpleNow) {
        statusHtml += ` · 已刷出「${item.talent_name}」，可直接置换`;
    } else if (conflictLocked) {
        statusHtml += ` · 已锁定「${item.earlier_conflict_name}」，约再洗 <b>${toPurpleWash}</b> 次到紫`;
    } else if (hasConflictNow) {
        statusHtml += ` · 槽内已有「${item.earlier_conflict_name}」，请锁定后继续洗`;
    } else if (conflictTimes > 0 && curWash < conflictTimes) {
        statusHtml += ` · 约再洗 <b>${toConflictWash}</b> 次到冲突，再到紫约 <b>${toPurpleWash}</b> 次`;
    } else if (conflictTimes > 0 && curWash > conflictTimes) {
        statusHtml += ` · 已过冲突洗髓次数 ${conflictTimes}（脉序 #${conflictSeq}），此条需回档/重置`;
    }
    statusHtml += '</div>';

    const stepsHtml = `
        <div class="nc-steps">
            洗脉步骤：洗到 <b>${prevWashStr}</b> 锁定「<b>${item.earlier_conflict_name}</b>」
            → 继续洗到「<b class="purple-bright">${item.talent_name}</b>」（脉序 #${item.wash_no}）后点置换
            ${gapStr ? `（${gapStr}）` : ''}
        </div>
    `;

    const pastConflict = conflictTimes > 0 && curWash > conflictTimes && !hasConflictNow;
    box.innerHTML = `
        <div>
            下一紫：<b class="purple-bright">#${item.wash_no} ${item.talent_name}</b>${pity}
            <span class="text-muted">（洗髓第 ${item.wash_times || '-'} 次）</span>
        </div>
        <div>
            最近冲突脉：
            「<b style="color:var(--red)">${item.earlier_conflict_name}</b>」(${prevWashStr}${gapStr ? '，' + gapStr : ''})
        </div>
        ${statusHtml}
        ${stepsHtml}
        <div class="nc-actions">
            ${!pastConflict ? `
                <button type="button" class="btn btn-wash-gold" id="btnNcWashLock">洗到冲突并锁定</button>
                <button type="button" class="btn btn-wash-custom" id="btnNcWashPurple">继续洗到紫脉</button>
                <button type="button" class="btn btn-wash" id="btnNcWashAll">一键锁冲突洗到紫</button>
            ` : ''}
            ${hasConflictNow && !conflictLocked ? `
                <button type="button" class="btn btn-wash-gold" id="btnNcLockOnly">锁定「${item.earlier_conflict_name}」</button>
            ` : ''}
            <button type="button" class="btn btn-wash-custom" id="btnNcFindAfter" data-after="${item.wash_no}">再查其后下一紫</button>
        </div>
    `;

    const btnLockWash = box.querySelector('#btnNcWashLock');
    if (btnLockWash) btnLockWash.addEventListener('click', () => washToConflictAndLock(item));
    const btnPurple = box.querySelector('#btnNcWashPurple');
    if (btnPurple) btnPurple.addEventListener('click', () => washToPurpleTalent(item));
    const btnAll = box.querySelector('#btnNcWashAll');
    if (btnAll) btnAll.addEventListener('click', () => washConflictThenPurple(item));
    const btnLockOnly = box.querySelector('#btnNcLockOnly');
    if (btnLockOnly) {
        btnLockOnly.addEventListener('click', () => {
            lockTalentByName(item.earlier_conflict_name);
            updateAll();
            findAndShowNextConflict(state.totalTalentBars);
        });
    }
    const afterBtn = box.querySelector('#btnNcFindAfter');
    if (afterBtn) {
        afterBtn.addEventListener('click', () => {
            findAndShowNextConflict(parseInt(afterBtn.getAttribute('data-after'), 10));
        });
    }

    return item;
}

function formatExchangeChainHtml(chain) {
    if (!chain || !chain.length) return '<span class="text-muted">-</span>';
    if (chain.length === 1) {
        const only = chain[0];
        if (/跳过|锁留/.test(only)) return `<span class="text-muted">${only}</span>`;
        return `<b class="purple-bright">${only}</b>`;
    }
    const head = chain.slice(0, -1).map(n => `${n}<span class="reconflict-tag">(再冲突)</span>`).join(' ➔ ');
    return `${head} ➔ <b class="purple-bright">${chain[chain.length - 1]}</b>`;
}

function formatShenmaiForkLine(fork) {
    if (!fork) return '';
    const from = fork.exchange_from || '?';
    const chain = fork.chain || [];
    const rolls = Number(fork.pity_rolls_first) || 0;
    const seedHint = rolls > 0
        ? `<span class="shenmai-roll-hint">首抽${rolls}次→seed ${fork.luck_seed_after_first}</span>`
        : '';
    if (!chain.length) {
        return `<div class="shenmai-fork"><span class="text-muted">换「${from}」</span> ➔ - ${seedHint}</div>`;
    }
    if (/失败/.test(chain[0] || '')) {
        return `<div class="shenmai-fork"><span class="text-muted">换「${from}」</span> ➔ <span class="text-muted">${chain[0]}</span></div>`;
    }
    return `<div class="shenmai-fork"><span class="text-muted">换「${from}」</span> ➔ ${formatExchangeChainHtml(chain)} ${seedHint}</div>`;
}

function formatShenmaiForkNote(forks) {
    const finals = forks.map(f => f.final_name || '');
    const finalsSame = finals.every(n => n && n === finals[0]);
    const afterSeeds = forks.map(f => String(f.luck_seed_after_first ?? ''));
    const seedsSame = afterSeeds.every(s => s === afterSeeds[0]);
    const rolls = forks.map(f => Number(f.pity_rolls_first) || 0);
    const rollsSame = rolls.every(r => r === rolls[0]);
    const chainsSame = forks.every(f => JSON.stringify(f.chain || []) === JSON.stringify(forks[0].chain || []));

    if (!finalsSame) {
        return `<div class="shenmai-fork-note text-muted">换不同神脉结果不同（欧气跳过仍持有的神脉 ID，首抽序列会分叉）</div>`;
    }
    if (chainsSame && seedsSame && rollsSame) {
        return `<div class="shenmai-fork-note text-muted">本步路径相同：首次欧气接受的不是「对方神脉 ID」，换哪条都走同一抽序 → 结果必然一样</div>`;
    }
    return `<div class="shenmai-fork-note text-muted">终局碰巧相同：首抽链/欧气抽次已分叉（见各行「首抽N次→seed」），不是「换哪条都必然一样」</div>`;
}

function formatFollowingNodesBrief(following) {
    if (!following || !following.length) return '<span class="text-muted">（无后续目标）</span>';
    return following.map(n => {
        const name = n.purple_name || '?';
        if (n.shenmai_forks && n.shenmai_forks.length >= 2) {
            const forks = n.shenmai_forks.map(f => `换${f.exchange_from}→${f.final_name || '?'}`).join('；');
            return `<span class="chain-follow-item"><b>${name}</b>：${forks}</span>`;
        }
        const c0 = (n.chain && n.chain[0]) || n.final_name || '-';
        if (/跳过|锁留/.test(c0)) {
            return `<span class="chain-follow-item"><b>${name}</b>：${c0}</span>`;
        }
        const fin = n.final_name || c0;
        const mid = (n.chain && n.chain.length > 1)
            ? `${n.chain.slice(0, -1).join('→')}→${fin}`
            : fin;
        return `<span class="chain-follow-item"><b>${name}</b>→${mid}</span>`;
    }).join('<span class="text-muted"> ｜ </span>');
}

function formatChainStopAltsHtml(node) {
    const alts = node.chain_stop_alts || [];
    if (alts.length < 2) return '';
    const rows = alts.map(alt => {
        const tag = alt.is_full_chain
            ? '<span class="reconflict-tag">打满</span>'
            : `<span class="reconflict-tag">第${Number(alt.stop_at) + 1}环停</span>`;
        return `<div class="chain-stop-row">
            保留「<b class="purple-bright">${alt.keep_name}</b>」${tag}
            → 后续 ${formatFollowingNodesBrief(alt.following_nodes)}
        </div>`;
    }).join('');
    return `
        <details class="chain-stop-alts">
            <summary>展开：中途保留时后续脉结果（${alts.length} 种停法）</summary>
            <div class="chain-stop-body">${rows}</div>
        </details>
    `;
}

function formatNodeExchangeResult(node) {
    if (!node) return '<span class="text-muted">-</span>';
    const forks = node.shenmai_forks || [];
    if (forks.length >= 2) {
        return `<div class="shenmai-forks">${forks.map(formatShenmaiForkLine).join('')}${formatShenmaiForkNote(forks)}</div>`;
    }
    const chain = node.chain || [];
    if (!chain.length) return '<span class="text-muted">-</span>';
    if (/跳过|锁留/.test(chain[0] || '')) return formatExchangeChainHtml(chain);
    const from = node.purple_name || '';
    const conf = node.conflict_name && node.conflict_name !== '—'
        ? `<span class="reconflict-tag">←${node.conflict_name}</span>`
        : '';
    let main;
    if (chain.length === 1 && from && chain[0] !== from) {
        main = `<span class="text-muted">置换「${from}」${conf}</span> ➔ <b class="purple-bright">${chain[0]}</b>`;
    } else {
        main = `<span class="text-muted">置换「${from}」${conf}</span> ➔ ${formatExchangeChainHtml(chain)}`;
    }
    return `${main}${formatChainStopAltsHtml(node)}`;
}

function getRouteMaxPad() {
    if (routeWashNos.length >= 2) {
        const gap = routeWashNos[1] - routeWashNos[0];
        return Math.max(0, Math.min(200, Math.max(0, gap - 1)));
    }
    return 30;
}

function isShenmaiTalentId(id) {
    return id === 248 || id === 249 || id === 250;
}

function buildExchangeRouteTargets() {
    const purples = cachedPurpleData.purples || [];
    return routeWashNos.map((wn, idx) => {
        const item = purples.find(p => p.wash_no === wn);
        if (!item) return null;
        const shenmai = isShenmaiTalentId(item.talent_id);
        if (!item.earlier_conflict_name && !shenmai) return null;
        const lockOnly = shenmai && !item.earlier_conflict_name;
        return {
            purple_name: item.talent_name,
            conflict_name: item.earlier_conflict_name || '',
            conflict_wash_no: (!lockOnly && idx === 0) ? (item.earlier_conflict_wash_times || 0) : 0,
            lock_only: lockOnly,
        };
    }).filter(Boolean);
}

let cachedExchangePadResults = null;
let cachedExchangePadKey = '';

function getExchangePadResults(maxPad) {
    const targets = buildExchangeRouteTargets();
    const key = JSON.stringify({
        targets,
        maxPad,
        washNos: routeWashNos.slice(),
        state: washPredictionStateSnapshot(),
    });
    if (cachedExchangePadKey === key && cachedExchangePadResults) {
        return cachedExchangePadResults;
    }
    pushStateToWasm();
    const results = wasmPreviewExchangePads(targets, maxPad) || [];
    cachedExchangePadKey = key;
    cachedExchangePadResults = results;
    return results;
}

function renderExchangeAnalysisBlock() {
    const container = document.getElementById('exchangeBlockContent');
    if (!container) return;

    const purples = cachedPurpleData.purples || [];

    if (!routeWashNos.length) {
        container.innerHTML = `<div class="block-empty">尚未选择可置换紫脉。请在上方表格点击「选择推演」（建议选 2~3 条，共同推演置换脉序）</div>`;
        return;
    }

    const routeItems = routeWashNos.map(wn => purples.find(p => p.wash_no === wn)).filter(Boolean);
    if (!routeItems.length) {
        container.innerHTML = `<div class="block-empty">所选脉序已不在当前预测范围内，请重新选择</div>`;
        return;
    }
    if (routeItems.some(i => !i.earlier_conflict_name && !isShenmaiTalentId(i.talent_id))) {
        container.innerHTML = `<div class="block-empty">所选紫脉缺少冲突脉信息，无法推演置换</div>`;
        return;
    }

    const maxPad = getRouteMaxPad();
    if (routePadCount > maxPad) routePadCount = maxPad;
    if (routePadCount < 0) routePadCount = 0;

    const previewPads = Math.min(maxPad, Math.max(8, routePadCount + 3));
    const padResults = getExchangePadResults(previewPads);
    const selected = padResults.find(r => r.pad === routePadCount) || padResults[0];

    const luckInited = !!state.luckSeedInited;
    const mechTip = luckInited
        ? '当前欧气种子已初始化（存档已有 LuckTalent 或已置换过）：垫洗不再改变首紫置换起点，下表主要反映已固定的欧气序列。'
        : '欧气种子尚未初始化：锁冲突→开≥3 槽→洗出首紫后，每多洗 1 次再置换 = 新置换脉序（首次置换时用当时的主种子初始化欧气池）。首紫锁定后，后续紫脉置换结果固定。';

    let nodesSummaryHtml = routeItems.map((item, idx) => {
        const nodeSim = selected && selected.nodes ? selected.nodes[idx] : null;
        const resultHtml = nodeSim ? formatNodeExchangeResult(nodeSim) : '-';
        const lastHint = nodeSim && nodeSim.last_slot_name
            ? `<span class="card-last-slot">末格：${nodeSim.last_slot_name}</span>`
            : '';
        const roleLabel = idx === 0 ? '首紫（可垫洗）' : `第${idx + 1}紫（锁定后固定）`;
        let conflictHtml;
        if (nodeSim && nodeSim.conflict_name) {
            conflictHtml = `冲突：${nodeSim.conflict_name}`;
        } else if (item.earlier_conflict_name) {
            const prevWashStr = item.earlier_conflict_wash_no === 0 ? '初始槽位' : `#${item.earlier_conflict_wash_no}`;
            const gapStr = item.earlier_conflict_gap != null ? `相距 ${item.earlier_conflict_gap} 条` : '';
            conflictHtml = `冲突：「${item.earlier_conflict_name}」(${prevWashStr}${gapStr ? '，' + gapStr : ''})`;
        } else if (isShenmaiTalentId(item.talent_id)) {
            conflictHtml = '冲突：锁留（前序若已有神脉则自动互冲置换）';
        } else {
            conflictHtml = '冲突：-';
        }
        return `
            <div class="selected-exchange-card ${idx === 0 ? '' : 'fixed-node'}">
                <div class="card-header">
                    <span class="card-title">#${idx + 1} ${roleLabel}：<b>#${item.wash_no} ${item.talent_name}</b></span>
                    <span class="card-conflict">${conflictHtml}</span>
                    ${lastHint}
                    <button class="btn-remove-route-item btn-reset-role" data-washno="${item.wash_no}">移除</button>
                </div>
                <div class="exchange-stepper">
                    <span class="step-result">置换结果：${resultHtml}</span>
                </div>
            </div>
        `;
    }).join('');

    let tableHead = '<th>置换脉序</th><th>垫洗</th><th>末格</th>';
    routeItems.forEach((item, idx) => {
        tableHead += `<th>#${item.wash_no} ${item.talent_name}${idx === 0 ? '' : ' <span class="th-fixed">固定</span>'}</th>`;
    });

    let tableBody = '';
    for (let pad = 0; pad <= previewPads; pad++) {
        const row = padResults.find(r => r.pad === pad) || { nodes: [], error: '无数据' };
        const isSel = pad === routePadCount;
        const lastSlot = row.nodes && row.nodes[0] ? (row.nodes[0].last_slot_name || '-') : '-';
        let cells = '';
        if (row.error && (!row.nodes || !row.nodes.length)) {
            cells = `<td colspan="${routeItems.length}" class="loading-td">${row.error}</td>`;
        } else {
            for (let i = 0; i < routeItems.length; i++) {
                const n = row.nodes[i];
                cells += `<td>${n ? formatNodeExchangeResult(n) : '-'}</td>`;
            }
        }
        const padLabel = pad === 0 ? '直接置换' : `锁紫再洗 ${pad} 次`;
        tableBody += `
            <tr class="route-pad-row ${isSel ? 'current-step' : ''}" data-pad="${pad}">
                <td><b>第 ${pad + 1} 条</b></td>
                <td>${padLabel}</td>
                <td>${lastSlot}</td>
                ${cells}
            </tr>
        `;
    }
    if (maxPad > previewPads) {
        tableBody += `<tr><td colspan="${3 + routeItems.length}" class="loading-td">… 另有更靠后的脉序，用上方跳转加载（每次最多模拟到当前选中附近）</td></tr>`;
    }

    const errBanner = selected && selected.error
        ? `<p class="modal-tip" style="color:var(--red)">推演警告：${selected.error}</p>`
        : '';

    container.innerHTML = `
        <div class="route-joint-panel">
            <p class="modal-tip"><b>真实路径推演</b>：${mechTip}</p>
            ${errBanner}

            <div class="exchange-stepper route-pad-stepper">
                <span>当前置换脉序：</span>
                <button class="step-btn" id="btnRoutePadMinus" type="button">-</button>
                <span class="step-val">第 ${routePadCount + 1} 条</span>
                <button class="step-btn" id="btnRoutePadPlus" type="button">+</button>
                <span class="pad-jump">
                    跳转垫洗
                    <input type="number" id="routePadInput" min="0" max="${maxPad}" value="${routePadCount}" />
                    发
                </span>
                <span class="step-result">（${routePadCount === 0 ? '直接置换' : '锁紫再洗 ' + routePadCount + ' 次'}）</span>
            </div>

            <div class="route-nodes-summary">${nodesSummaryHtml}</div>

            <div class="multi-exchange-section">
                <p class="modal-tip">点击下表切换脉序。末格为置换前最后一格天赋（社区常用来标记序列）。多环再冲突时可「展开」查看<b>中途保留某一环</b>时后续目标紫的置换结果（默认主列为打满再冲突）。神脉并存时列出各神脉置换；前序已获同名显示「跳过」。</p>
                <div class="route-pad-table-wrap">
                    <table class="route-pad-table">
                        <thead><tr>${tableHead}</tr></thead>
                        <tbody>${tableBody}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('.btn-remove-route-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const washNo = parseInt(e.currentTarget.getAttribute('data-washno'));
            const idx = routeWashNos.indexOf(washNo);
            if (idx >= 0) routeWashNos.splice(idx, 1);
            cachedExchangePadKey = '';
            const newMax = getRouteMaxPad();
            if (routePadCount > newMax) routePadCount = newMax;
            renderPurpleForecastTable();
        });
    });

    const minusBtn = container.querySelector('#btnRoutePadMinus');
    const plusBtn = container.querySelector('#btnRoutePadPlus');
    const padInput = container.querySelector('#routePadInput');

    if (minusBtn) {
        minusBtn.addEventListener('click', () => {
            if (routePadCount > 0) {
                routePadCount--;
                renderExchangeAnalysisBlock();
            }
        });
    }
    if (plusBtn) {
        plusBtn.addEventListener('click', () => {
            if (routePadCount < maxPad) {
                routePadCount++;
                renderExchangeAnalysisBlock();
            }
        });
    }
    if (padInput) {
        padInput.addEventListener('change', () => {
            let v = parseInt(padInput.value, 10);
            if (Number.isNaN(v)) v = 0;
            routePadCount = Math.max(0, Math.min(maxPad, v));
            renderExchangeAnalysisBlock();
        });
    }

    container.querySelectorAll('.route-pad-row').forEach(row => {
        row.addEventListener('click', () => {
            const pad = parseInt(row.getAttribute('data-pad'), 10);
            if (!Number.isNaN(pad)) {
                routePadCount = pad;
                renderExchangeAnalysisBlock();
            }
        });
    });
    container.querySelectorAll('.chain-stop-alts').forEach(el => {
        el.addEventListener('click', (e) => e.stopPropagation());
    });
}

let aiSelectedTalentIds = [];
let aiAvailableTalentIds = [];
const AI_COMMON_TRIPLE_IDS = Object.freeze([250, 271, 272]);
let aiSearchToken = 0;
let aiCancelRequested = false;
let aiSearchRunning = false;
let aiLastPrediction = null;
let autoWashSelectedRoleKey = '';
let aiSearchWorkerControl = null;

function finishAiSearchWorker(control, result, error) {
    if (!control || control.settled) return;
    control.settled = true;
    if (aiSearchWorkerControl === control) aiSearchWorkerControl = null;
    control.worker.onmessage = null;
    control.worker.onerror = null;
    control.worker.terminate();
    if (error) control.reject(error);
    else control.resolve(result);
}

function stopAiSearchWorker(reason = 'cancelled') {
    const control = aiSearchWorkerControl;
    if (!control) return false;
    finishAiSearchWorker(control, { cancelled: true, reason }, null);
    return true;
}

function startAiSearchWorker(input, onProgress, onCandidate) {
    if (typeof Worker !== 'function') {
        return Promise.reject(new Error('当前浏览器不支持后台计算线程，请通过网站或 HTTP 服务使用自动洗脉。'));
    }
    stopAiSearchWorker('replaced');
    return new Promise((resolve, reject) => {
        let worker;
        try {
            const workerUrl = new URL('../shared/wash_route_worker.js', window.location.href);
            worker = new Worker(workerUrl);
        } catch (error) {
            reject(new Error(`后台计算线程创建失败：${error && error.message ? error.message : error}`));
            return;
        }
        const requestId = `wash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const control = { worker, requestId, resolve, reject, settled: false };
        aiSearchWorkerControl = control;
        worker.onmessage = event => {
            const message = event && event.data || {};
            if (message.requestId !== requestId || control.settled) return;
            if (message.type === 'progress') {
                if (typeof onProgress === 'function') onProgress(message.progress || {});
                return;
            }
            if (message.type === 'candidate') {
                if (typeof onCandidate === 'function') onCandidate(message.result || { routes: [] });
                return;
            }
            if (message.type === 'result') {
                finishAiSearchWorker(control, message.result || { routes: [] }, null);
                return;
            }
            if (message.type === 'error') {
                finishAiSearchWorker(control, null, new Error(message.error || '后台搜索失败'));
            }
        };
        worker.onerror = event => {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            const detail = event && (event.message || event.error && event.error.message);
            finishAiSearchWorker(control, null, new Error(`后台计算线程加载失败${detail ? `：${detail}` : '，请通过网站或 HTTP 服务使用自动洗脉。'}`));
        };
        try {
            worker.postMessage({ type: 'start', requestId, input });
        } catch (error) {
            finishAiSearchWorker(control, null, new Error(`后台搜索参数发送失败：${error && error.message ? error.message : error}`));
        }
    });
}

function isAutoSimulatorView() {
    return document.documentElement.classList.contains('auto-simulator-view');
}

function selectedAutoWashRoleEntry() {
    if (!autoWashSelectedRoleKey) return null;
    return (state.saveRoles || []).find(entry => entry.key === autoWashSelectedRoleKey) || null;
}

function renderAutoWashSaveGate() {
    const select = document.getElementById('autoWashRoleSelect');
    const vipSelect = document.getElementById('autoWashVipSelect');
    const status = document.getElementById('autoWashSaveStatus');
    const pills = document.getElementById('autoWashBagPillDisplay');
    const summary = document.getElementById('autoWashRoleSummary');
    if (!select && !vipSelect && !status && !pills && !summary) return;

    const roles = state.saveRoles || [];
    const hasSave = !!state.saveData && roles.length > 0;
    const selected = selectedAutoWashRoleEntry();
    if (select) {
        const placeholder = hasSave ? '请选择人物' : '暂无可选人物';
        select.innerHTML = `<option value="">${placeholder}</option>` + roles.map(entry => (
            `<option value="${escapeAiHtml(entry.key)}">${escapeAiHtml(`${entry.tag} · ${entry.role.Name || '无名'}`)}</option>`
        )).join('');
        select.disabled = !hasSave;
        select.value = selected ? selected.key : '';
    }
    if (vipSelect) vipSelect.value = String(normalizeVipLevel(state.vip));
    if (status) {
        status.textContent = !hasSave
            ? '尚未导入存档'
            : (selected ? `已选择 · ${selected.tag} · ${selected.role.Name || '无名'}` : `已导入 ${roles.length} 名人物，请继续选择`);
    }
    if (pills) pills.textContent = state.hasBagPills ? `${state.bagPills.toLocaleString()} 颗` : '--';
    if (summary) {
        if (!hasSave) {
            summary.textContent = '请先使用导出工具取得存档并导入；自动洗脉不接受手动种子。';
        } else if (!selected) {
            summary.textContent = '存档已导入。必须明确选择一名人物，才能读取其资质、天赋和洗脉状态。';
        } else {
            const zz = ZZ_DATA[String(state.zizhi)] || {};
            const zeroSlotPlan = Number(state.zizhi) <= 152
                ? ' · 自动模拟将先提升到三槽，洗出第一条目标紫后再开启第四槽'
                : '';
            summary.textContent = `${selected.role.Name || '无名'} · ${zz.zz_name || zz.name || `资质 ${state.zizhi}`}（${Number(zz.num_talent || 0)} 槽） · 当前 ${state.talents.length} 条天赋${zeroSlotPlan}`;
        }
    }
}

function selectAutoWashRole(roleKey) {
    const key = String(roleKey || '');
    autoWashSelectedRoleKey = (state.saveRoles || []).some(entry => entry.key === key) ? key : '';
    aiSelectedTalentIds = [];
    invalidateAiPrediction();
    if (autoWashSelectedRoleKey) {
        state.mode = 'seed';
        const mode = document.getElementById('modeSelect');
        if (mode) mode.value = 'seed';
        selectRoleFromSave(autoWashSelectedRoleKey);
    } else {
        aiAvailableTalentIds = [];
        renderAiTalentChoices();
        renderAutoWashSaveGate();
    }
}

function escapeAiHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clampAiNumber(id, min, max, fallback) {
    const el = document.getElementById(id);
    let value = parseInt(el?.value || String(fallback), 10);
    if (Number.isNaN(value)) value = fallback;
    value = Math.max(min, Math.min(max, value));
    if (el) el.value = String(value);
    return value;
}

const AI_COST_BUCKET_LABELS = Object.freeze({
    oneUnlocked: '一脉未锁',
    twoUnlocked: '二脉未锁',
    threeUnlocked: '三脉未锁',
    fourUnlocked: '四脉未锁',
    lock1: '锁 1',
    lock2: '锁 2',
    lock3: '锁 3',
});

function validateAiTargetSet(targetIds, talentData, slotCount = 4) {
    const ids = Array.from(new Set((targetIds || []).map(Number).filter(id => id > 0)));
    const errors = [];
    if (!ids.length) errors.push('请至少选择一条目标紫脉');
    if (ids.length > slotCount) errors.push(`目标脉数量不能超过 ${slotCount} 条`);
    const seenTypes = new Map();
    for (const id of ids) {
        const item = talentData?.[String(id)];
        if (!item) {
            errors.push(`未找到天赋 ID ${id}`);
            continue;
        }
        if (Number(item.pinzhi ?? item.weight) !== 4) errors.push(`「${item.name}」不是紫脉`);
        if (item.type == null) continue;
        const type = String(item.type);
        if (seenTypes.has(type)) {
            errors.push(`「${seenTypes.get(type)}」与「${item.name}」同类型，不能作为最终有效脉同时保留`);
        } else {
            seenTypes.set(type, item.name);
        }
    }
    return { valid: errors.length === 0, errors, ids };
}

function formatAiRouteMarkdown(result, route, rank = 1) {
    if (!route) return '';
    const lines = [
        `# 自动模拟洗脉路线 #${rank}`,
        '',
        `- 结论：${result?.strength || '候选路线'}`,
        `- 目标脉：${result?.targetNames?.join('、') || ''}`,
        `- 路线：${route.branchLabel} · ${route.strategyLabel}`,
        `- 槽位路径：${(route.slotPath || []).join('→')} 槽`,
        `- 总丹耗：${route.totalPills} 颗`,
        `- 总洗髓次数：${route.totalWashes} 次`,
        `- 天赋条数脉序：${route.totalTalentBars} 条`,
        `- 置换：${route.exchangeCount} 次`,
    ];
    if (route.inventory?.available != null) {
        lines.push(`- 背包：${route.inventory.available} 颗；${route.inventory.enough
            ? `执行后剩余 ${route.inventory.remaining} 颗`
            : `还缺 ${route.inventory.shortfall} 颗`}`);
    }
    lines.push('', '## 详细操作', '');
    (route.steps || []).forEach((step, index) => {
        const cost = step.pills > 0 ? `本步 ${step.pills} 丹，累计 ${step.cumulativePills} 丹` : '本步 0 丹';
        const wash = step.washes > 0 ? `，洗 ${step.washes} 次` : '';
        lines.push(`${index + 1}. **${step.label}**：${step.detail}${wash}；${cost}；累计脉序 ${step.cumulativeTalentBars} 条。`);
    });
    lines.push('', `最终槽位：${(route.finalTalents || []).map(item => `${item.name}${item.locked ? '（锁）' : ''}`).join('、')}`);
    return lines.join('\n');
}

function invalidateAiPrediction() {
    if (aiSearchRunning) {
        aiCancelRequested = true;
        stopAiSearchWorker('state-changed');
        aiLastPrediction = null;
        const predict = document.getElementById('btnAiPredict');
        const cancel = document.getElementById('btnAiCancel');
        const results = document.getElementById('aiPredictionResults');
        if (predict) {
            predict.disabled = true;
            predict.textContent = '正在停止当前搜索…';
        }
        if (cancel) {
            cancel.hidden = false;
            cancel.disabled = true;
            cancel.textContent = '正在停止…';
        }
        if (results) {
            results.dataset.hasResult = 'false';
            results.innerHTML = '<div class="ai-result-empty">当前洗脉状态已变化，正在停止当前搜索并恢复状态…</div>';
        }
        return;
    }

    aiSearchToken += 1;
    aiCancelRequested = true;
    aiLastPrediction = null;
    const predict = document.getElementById('btnAiPredict');
    const cancel = document.getElementById('btnAiCancel');
    const progress = document.getElementById('aiSearchProgress');
    if (predict) {
        predict.disabled = false;
        predict.textContent = '开始筛选最佳路线';
    }
    if (cancel) cancel.hidden = true;
    if (progress) progress.hidden = true;
    const results = document.getElementById('aiPredictionResults');
    if (results && results.dataset.hasResult === 'true') {
        results.dataset.hasResult = 'false';
        results.innerHTML = '<div class="ai-result-empty">当前洗脉状态已变化，请重新预测路线。</div>';
    }
}

function getAiAvailablePurpleIds() {
    if (!window.WashSourceEngine || typeof wasmGetState !== 'function') return [];
    pushStateToWasm();
    const original = wasmGetState();
    if (!original) return [];
    const planning = JSON.parse(JSON.stringify(original));
    planning.zizhi = 154;
    const engine = new WashSourceEngine.Engine(TALENT_DATA, planning, { dlcMode: state.dlcMode });
    return engine.purpleIds.filter(id => engine.allowed.has(id));
}

function validateAiTargetSelection({ showMessage = true } = {}) {
    const message = document.getElementById('aiSelectionMessage');
    const prerequisiteErrors = [];
    if (isAutoSimulatorView()) {
        if (!state.saveData || !(state.saveRoles || []).length) prerequisiteErrors.push('请选择人物');
        else if (!selectedAutoWashRoleEntry()) prerequisiteErrors.push('请选择人物');
    }
    if (selectedAutoWashRoleEntry() && ![150, 151, 152, 153, 154].includes(Number(state.zizhi))) {
        prerequisiteErrors.push('自动洗脉仅支持 0–4 槽资质');
    }
    if (prerequisiteErrors.length) {
        if (showMessage && message) {
            message.textContent = prerequisiteErrors[0];
            message.classList.add('is-error');
        }
        return { valid: false, errors: prerequisiteErrors, ids: [] };
    }
    if (!window.WashSourceEngine) {
        const error = '源码洗脉状态机未加载';
        if (showMessage && message) {
            message.textContent = error;
            message.classList.add('is-error');
        }
        return { valid: false, errors: [error], ids: [] };
    }
    const result = validateAiTargetSet(aiSelectedTalentIds, TALENT_DATA, 4);
    const unavailable = result.ids.filter(id => !aiAvailableTalentIds.includes(id));
    if (unavailable.length) {
        result.valid = false;
        result.errors.push(`当前角色或四脉资质不可用：${unavailable.map(id => TALENT_DATA[String(id)]?.name || id).join('、')}`);
    }
    if (showMessage && message) {
        message.classList.toggle('is-error', !result.valid);
        message.textContent = result.valid
            ? `将筛选最终同时包含「${result.ids.map(id => TALENT_DATA[String(id)].name).join('、')}」的路线。`
            : (result.errors[0] || '请选择目标紫脉');
    }
    return result;
}

function updateAiTargetChoiceState() {
    const count = document.getElementById('aiTargetCount');
    if (count) count.textContent = `已选 ${aiSelectedTalentIds.length} / 4`;
    document.querySelectorAll('#aiTalentChoices .ai-talent-choice').forEach(label => {
        const id = Number(label.dataset.talentId);
        const checked = aiSelectedTalentIds.includes(id);
        label.classList.toggle('is-selected', checked);
        const input = label.querySelector('input');
        if (input) input.checked = checked;
    });
    validateAiTargetSelection();
}

function filterAiTalentChoices() {
    const keyword = (document.getElementById('aiTalentSearch')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#aiTalentChoices .ai-talent-choice').forEach(label => {
        const name = (label.dataset.talentName || '').toLowerCase();
        label.classList.toggle('is-hidden', !!keyword && !name.includes(keyword));
    });
}

async function runAiCommonTriplePlan() {
    const message = document.getElementById('aiSelectionMessage');
    if (aiSearchRunning) {
        if (message) {
            message.textContent = '路线搜索进行中；如需切换到通用三紫，请先取消当前搜索。';
            message.classList.add('is-error');
        }
        return;
    }
    if (isAutoSimulatorView() && !selectedAutoWashRoleEntry()) {
        if (message) {
            message.textContent = '请先选择要规划通用三紫的人物。';
            message.classList.add('is-error');
        }
        return;
    }
    const unavailable = AI_COMMON_TRIPLE_IDS.filter(id => !aiAvailableTalentIds.includes(id));
    if (unavailable.length) {
        if (message) {
            const names = unavailable.map(id => TALENT_DATA[String(id)]?.name || `天赋 #${id}`).join('、');
            const vipHint = unavailable.includes(250) && normalizeVipLevel(state.vip) < 1
                ? '；混元奇脉需要先选择 VIP 1+'
                : '';
            message.textContent = `当前人物不可用：${names}${vipHint}`;
            message.classList.add('is-error');
        }
        return;
    }

    aiSelectedTalentIds = AI_COMMON_TRIPLE_IDS.slice();
    const search = document.getElementById('aiTalentSearch');
    if (search) search.value = '';
    aiLastPrediction = null;
    updateAiTargetChoiceState();
    filterAiTalentChoices();
    const results = document.getElementById('aiPredictionResults');
    if (results) {
        results.dataset.hasResult = 'false';
        results.innerHTML = '<div class="ai-result-empty">已套用通用三紫，正在按下方搜索范围启动本地路线规划…</div>';
    }
    await runAiPrediction();
}

function renderAiTalentChoices() {
    const container = document.getElementById('aiTalentChoices');
    if (!container || !wasmReady) return;
    if (isAutoSimulatorView() && !selectedAutoWashRoleEntry()) {
        aiAvailableTalentIds = [];
        aiSelectedTalentIds = [];
        container.innerHTML = '<span class="text-muted">选择人物后，才会显示该人物可用的目标紫脉。</span>';
        updateAiTargetChoiceState();
        return;
    }
    aiAvailableTalentIds = getAiAvailablePurpleIds().sort((a, b) => {
        const an = TALENT_DATA[String(a)]?.name || '';
        const bn = TALENT_DATA[String(b)]?.name || '';
        return an.localeCompare(bn, 'zh-CN');
    });
    aiSelectedTalentIds = aiSelectedTalentIds.filter(id => aiAvailableTalentIds.includes(id));
    if (!aiAvailableTalentIds.length) {
        container.innerHTML = '<span class="text-muted">当前角色状态下没有可选紫脉，请检查资质、角色条件和 VIP。</span>';
        updateAiTargetChoiceState();
        return;
    }
    container.innerHTML = aiAvailableTalentIds.map(id => {
        const name = TALENT_DATA[String(id)]?.name || `天赋 #${id}`;
        return `<label class="ai-talent-choice" data-talent-id="${id}" data-talent-name="${escapeAiHtml(name)}">
            <input type="checkbox" value="${id}">
            <span>${escapeAiHtml(name)}</span>
        </label>`;
    }).join('');
    container.querySelectorAll('.ai-talent-choice').forEach(label => {
        label.addEventListener('click', event => {
            event.preventDefault();
            if (aiSearchRunning) {
                const message = document.getElementById('aiSelectionMessage');
                if (message) {
                    message.textContent = '路线搜索进行中；如需修改目标，请先取消搜索。';
                    message.classList.add('is-error');
                }
                return;
            }
            const id = Number(label.dataset.talentId);
            const index = aiSelectedTalentIds.indexOf(id);
            if (index >= 0) {
                aiSelectedTalentIds.splice(index, 1);
            } else if (aiSelectedTalentIds.length >= 4) {
                const message = document.getElementById('aiSelectionMessage');
                if (message) {
                    message.textContent = '最终最多只能选择 4 条目标脉。';
                    message.classList.add('is-error');
                }
                return;
            } else {
                aiSelectedTalentIds.push(id);
            }
            aiLastPrediction = null;
            const results = document.getElementById('aiPredictionResults');
            if (results) {
                results.dataset.hasResult = 'false';
                results.innerHTML = '<div class="ai-result-empty">目标已更新，点击“开始筛选最佳路线”。</div>';
            }
            updateAiTargetChoiceState();
        });
    });
    updateAiTargetChoiceState();
    filterAiTalentChoices();
}

function aiProgressPercent(progress) {
    if (progress.phase === 'complete') return 100;
    if (progress.phase === 'bounded-search') {
        const ceiling = Math.max(1, Number(progress.activePillCeiling || progress.maxTotalPills || 1));
        return Math.max(3, Math.min(96, Math.round(Number(progress.currentPillCost || 0) / ceiling * 96)));
    }
    return 0;
}

function renderAiSearchProgress(progress) {
    const box = document.getElementById('aiSearchProgress');
    const text = document.getElementById('aiProgressText');
    const percent = document.getElementById('aiProgressPercent');
    const fill = document.getElementById('aiProgressFill');
    const rawValue = aiProgressPercent(progress || {});
    if (box && progress?.phase === 'worker-start') {
        box.dataset.progressValue = '0';
    }
    const previousValue = Number(box?.dataset.progressValue || 0);
    const value = progress?.phase === 'complete' ? 100 : Math.max(previousValue, rawValue);
    if (box) {
        box.hidden = false;
        box.dataset.progressValue = String(value);
    }
    if (text) text.textContent = progress?.message || '正在搜索…';
    if (percent) percent.textContent = progress?.phase === 'worker-start'
        ? '后台线程'
        : (progress?.phase === 'bounded-search'
            ? `当前分支 ${Number(progress.currentPillCost || 0).toLocaleString()} / ${Number(progress.activePillCeiling || progress.maxTotalPills || 0).toLocaleString()} 丹 · 关键事件 ${Number(progress.expandedNodes || 0).toLocaleString()} · 模拟洗脉 ${Number(progress.rawWashesSimulated || 0).toLocaleString()}`
            : (progress?.phase === 'complete' ? '完成' : '正在初始化'));
    if (fill) fill.style.width = `${value}%`;
}

function aiCostBreakdownHtml(route) {
    const labels = AI_COST_BUCKET_LABELS;
    const entries = Object.entries(route.costBreakdown || {}).filter(([, value]) => Number(value) > 0);
    if (!entries.length) return '<div class="ai-result-empty">本路线不需要消耗洗髓丹</div>';
    const total = Math.max(1, Number(route.totalPills) || 1);
    const segments = entries.map(([key, value]) => {
        const width = Math.max(4, Number(value) / total * 100);
        return `<div class="ai-cost-segment" style="flex-basis:${width}%" title="${escapeAiHtml(labels[key] || key)}：${Number(value).toLocaleString()} 丹">
            ${escapeAiHtml(labels[key] || key)} ${Number(value).toLocaleString()}
        </div>`;
    }).join('');
    const legend = entries.map(([key, value]) => `<span>${escapeAiHtml(labels[key] || key)}：<b>${Number(value).toLocaleString()}</b> 丹</span>`).join('');
    return `<div class="ai-cost-bar" role="img" aria-label="丹耗分解：${escapeAiHtml(entries.map(([key, value]) => `${labels[key] || key}${value}丹`).join('，'))}">${segments}</div>
        <div class="ai-cost-legend">${legend}<span>开四脉 / 置换：<b>0</b> 丹</span></div>`;
}

function aiRouteTimelineHtml(route) {
    return `<div class="ai-route-timeline" role="list" aria-label="路线操作时间轴">${(route.steps || []).map((step, index) => {
        const detail = step.washes > 0
            ? `洗 ${step.washes} 次 · 本步 ${step.pills} 丹`
            : `本步 ${step.pills} 丹`;
        return `<div class="ai-route-step-node is-${escapeAiHtml(step.type)}" role="listitem">
            <b>${index + 1}. ${escapeAiHtml(step.label)}</b>
            <span>${escapeAiHtml(detail)}</span>
            <span class="ai-route-step-cost">累计 ${Number(step.cumulativePills).toLocaleString()} 丹</span>
        </div>`;
    }).join('')}</div>`;
}

function aiOperationTableHtml(route) {
    const rows = (route.steps || []).map((step, index) => {
        const afterNames = (step.after?.talents || []).map(t => `${t.name}${t.locked ? '（锁）' : ''}`).join('、');
        const verify = step.type === 'verify' ? '最终目标已回放验证' : (step.expectedName ? `应出现「${step.expectedName}」` : afterNames);
        return `<tr>
            <td>${index + 1}</td>
            <td><b>${escapeAiHtml(step.label)}</b></td>
            <td>${escapeAiHtml(step.detail)}</td>
            <td>${Number(step.washes).toLocaleString()}</td>
            <td>${step.unitCost == null ? '—' : Number(step.unitCost).toLocaleString()}</td>
            <td>${Number(step.pills).toLocaleString()}</td>
            <td>${Number(step.cumulativePills).toLocaleString()}</td>
            <td>${Number(step.cumulativeWashes).toLocaleString()}</td>
            <td>${Number(step.cumulativeTalentBars).toLocaleString()}</td>
            <td class="ai-operation-verify">${escapeAiHtml(verify || '状态已记录')}</td>
        </tr>`;
    }).join('');
    return `<div class="ai-operation-wrap"><table class="ai-operation-table">
        <thead><tr><th>#</th><th>操作</th><th>玩家照做步骤</th><th>洗数</th><th>单次丹</th><th>本步丹</th><th>累计丹</th><th>累计洗</th><th>脉序(条)</th><th>操作后验证</th></tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}

function aiRouteResultHtml(route, index) {
    const inventory = route.inventory || {};
    const inventoryLabel = inventory.available == null
        ? '库存未读取'
        : (inventory.enough ? `余 ${Number(inventory.remaining).toLocaleString()} 丹` : `缺 ${Number(inventory.shortfall).toLocaleString()} 丹`);
    const upgradeLabel = Array.isArray(route.slotPath) && route.slotPath.length
        ? `${route.slotPath.join('→')} 槽`
        : '保持当前槽位';
    const finalNames = (route.finalTalents || []).map(item => `${item.name}${item.locked ? '（锁）' : ''}`).join('、');
    return `<details class="ai-route-result" ${index === 0 ? 'open' : ''}>
        <summary>
            <span class="ai-route-rank">${index + 1}</span>
            <span class="ai-route-name"><b>${escapeAiHtml(route.branchLabel)} · ${escapeAiHtml(route.strategyLabel)}</b><span>${escapeAiHtml(finalNames)}</span></span>
            <span class="ai-route-total">${Number(route.totalPills).toLocaleString()} 丹<small>${Number(route.totalWashes).toLocaleString()} 次洗脉</small></span>
        </summary>
        <div class="ai-route-body">
            <div class="ai-route-metrics">
                <div class="ai-route-metric"><b>${Number(route.totalPills).toLocaleString()}</b><span>总丹耗</span></div>
                <div class="ai-route-metric"><b>${Number(route.totalWashes).toLocaleString()}</b><span>洗髓次数</span></div>
                <div class="ai-route-metric"><b>${Number(route.totalTalentBars).toLocaleString()}</b><span>天赋条数脉序</span></div>
                <div class="ai-route-metric"><b>${Number(route.exchangeCount).toLocaleString()}</b><span>置换次数</span></div>
                <div class="ai-route-metric ${inventory.enough === false ? 'is-short' : ''}"><b>${escapeAiHtml(inventoryLabel)}</b><span>背包可执行性</span></div>
            </div>
            <p class="ai-visual-heading">路线图 · ${escapeAiHtml(upgradeLabel)}</p>
            ${aiRouteTimelineHtml(route)}
            <p class="ai-visual-heading">洗髓丹消耗分解 · 合计 ${Number(route.totalPills).toLocaleString()} 丹</p>
            ${aiCostBreakdownHtml(route)}
            <p class="ai-visual-heading">详细路线与操作</p>
            ${aiOperationTableHtml(route)}
            <div class="ai-route-footer">
                <span class="ai-final-talents">最终槽位：${escapeAiHtml(finalNames)}</span>
                <button type="button" class="btn btn-reset ai-copy-route" data-route-index="${index}">复制 Markdown 路线</button>
            </div>
        </div>
    </details>`;
}

function renderAiPrediction(result) {
    const container = document.getElementById('aiPredictionResults');
    if (!container) return;
    aiLastPrediction = result;
    container.dataset.hasResult = 'true';
    if (!result || !result.routes || !result.routes.length) {
        container.innerHTML = `<div class="ai-result-error">${escapeAiHtml(result?.noResultReason || '搜索范围内没有找到可回放路线，请扩大范围或调整目标脉。')}</div>`;
        return;
    }
    const maxPills = Math.max(...result.routes.map(route => Number(route.totalPills) || 0), 1);
    const comparison = result.routes.map((route, index) => `<div class="ai-compare-row">
        <span>路线 ${index + 1}</span>
        <span class="ai-compare-track"><span class="ai-compare-bar" style="display:block;width:${Math.max(2, route.totalPills / maxPills * 100)}%"></span></span>
        <span class="ai-compare-value">${Number(route.totalPills).toLocaleString()} 丹</span>
    </div>`).join('');
    const scope = result.searchScope || {};
    container.innerHTML = `<div class="ai-result-summary">
        <span class="ai-route-strength">${escapeAiHtml(result.strength)}</span>
        <span>目标：<strong>${escapeAiHtml((result.targetNames || []).join('、'))}</strong></span>
        <span>关键事件 A*：展开 <strong>${Number(scope.expandedNodes || 0).toLocaleString()}</strong> · 模拟洗脉 <strong>${Number(scope.rawWashesSimulated || 0).toLocaleString()}</strong> · 生成事件 <strong>${Number(scope.generatedNodes || 0).toLocaleString()}</strong></span>
        <span>队列峰值 <strong>${Number(scope.frontierPeak || 0).toLocaleString()}</strong> / ${Number(scope.frontierLimit || 0).toLocaleString()} · 权重剪枝 <strong>${Number(scope.prunedByFrontier || 0).toLocaleString()}</strong> · 支配剪枝 <strong>${Number(scope.dominatedNodes || 0).toLocaleString()}</strong></span>
        <span>冲突入口 <strong>${Number(scope.conflictAnchors || 0).toLocaleString()}</strong> · 目标暂时置换 <strong>${Number(scope.targetSacrificeBranches || 0).toLocaleString()}</strong> 个 · 首次置换垫洗 <strong>${Number(scope.firstExchangePadsChecked || 0).toLocaleString()}</strong> 个</span>
        <span>丹耗超限剪枝 <strong>${Number(scope.prunedByPills || 0).toLocaleString()}</strong> 个</span>
        <span>整条路线 ≤ ${Number(scope.maxTotalPills || 0).toLocaleString()} 丹 · 找到路线后继续搜索更低丹耗分支</span>
        ${scope.initialLuckSeedInited ? '<span>欧气种子已初始化：首次置换垫洗不会改变既有序列</span>' : ''}
        <span>结论仅覆盖：${escapeAiHtml(scope.strategyGraph || '固定四槽战术动作图')}</span>
    </div>
    <div class="ai-route-comparison" role="img" aria-label="前三条路线总丹耗对比">
        <h3>候选路线总丹耗对比</h3>${comparison}
    </div>
    ${result.routes.map(aiRouteResultHtml).join('')}`;

    container.querySelectorAll('.ai-copy-route').forEach(button => {
        button.addEventListener('click', async () => {
            const index = Number(button.dataset.routeIndex);
            const route = result.routes[index];
            const markdown = formatAiRouteMarkdown(result, route, index + 1);
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(markdown);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = markdown;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    textarea.remove();
                }
                button.textContent = '已复制';
                setTimeout(() => { button.textContent = '复制 Markdown 路线'; }, 1600);
            } catch (error) {
                alert('复制失败，请展开详细操作后手动复制。');
            }
        });
    });
}

async function runAiPrediction() {
    if (aiSearchRunning) return;
    const validation = validateAiTargetSelection();
    if (!validation.valid) return;

    aiCancelRequested = false;
    aiSearchRunning = true;
    const runToken = ++aiSearchToken;
    const predict = document.getElementById('btnAiPredict');
    const cancel = document.getElementById('btnAiCancel');
    const commonTriple = document.getElementById('btnAiCommonTriple');
    const results = document.getElementById('aiPredictionResults');
    if (predict) {
        predict.disabled = true;
        predict.textContent = '正在筛选路线…';
    }
    if (cancel) {
        cancel.hidden = false;
        cancel.disabled = false;
        cancel.textContent = '取消搜索';
    }
    if (commonTriple) commonTriple.disabled = true;
    if (results) {
        results.dataset.hasResult = 'false';
        results.innerHTML = '<div class="ai-result-empty">后台线程正在搜索并回放候选路线；计算期间页面可以正常滚动和操作。</div>';
    }
    renderAiSearchProgress({ phase: 'worker-start', done: 0, total: 1, message: '正在保存当前状态并建立固定四槽搜索副本' });

    pushStateToWasm();
    const initialState = wasmGetState();
    try {
        const result = await startAiSearchWorker({
            initialState,
            targetIds: validation.ids,
            dlcMode: state.dlcMode,
            bagPills: state.bagPills,
            hasBagPills: state.hasBagPills,
            options: {
                maxTotalPills: clampAiNumber('aiMaxTotalPills', 0, 100000, 3000),
            },
        }, progress => {
            if (runToken === aiSearchToken) renderAiSearchProgress(progress);
        }, candidate => {
            if (runToken !== aiSearchToken) return;
            renderAiPrediction(candidate);
        });
        if (runToken !== aiSearchToken) return;
        if (result.cancelled) {
            if (results && result.reason !== 'state-changed' && !(aiLastPrediction?.routes || []).length) {
                results.innerHTML = '<div class="ai-result-empty">搜索已取消，当前模拟状态未改变。</div>';
            }
            if ((aiLastPrediction?.routes || []).length) {
                renderAiSearchProgress({ phase: 'complete', done: 1, total: 1, message: '已停止继续搜索，保留当前最低候选路线' });
            }
            return;
        }
        renderAiSearchProgress({ phase: 'complete', done: 1, total: 1, message: '关键事件加权 A* 搜索完成' });
        renderAiPrediction(result);
    } catch (error) {
        console.error('自动模拟洗脉路线失败:', error);
        if (runToken === aiSearchToken && results) {
            results.dataset.hasResult = 'true';
            results.innerHTML = `<div class="ai-result-error">预测失败：${escapeAiHtml(error?.message || error)}</div>`;
        }
    } finally {
        pushStateToWasm();
        if (runToken === aiSearchToken) {
            aiSearchRunning = false;
            if (predict) {
                predict.disabled = false;
                predict.textContent = '重新筛选最佳路线';
            }
            if (cancel) cancel.hidden = true;
            if (commonTriple) commonTriple.disabled = false;
        }
    }
}

function cancelAiPrediction() {
    if (!aiSearchRunning) return;
    aiCancelRequested = true;
    stopAiSearchWorker('user');
    const cancel = document.getElementById('btnAiCancel');
    const text = document.getElementById('aiProgressText');
    if (cancel) {
        cancel.disabled = true;
        cancel.textContent = '正在停止…';
    }
    if (text) text.textContent = '后台计算线程已终止，正在恢复界面…';
}

const EQUIP_AUTO_ALLOWED_PAPER_IDS = new Set(
    typeof EquipmentAutoOptimizer !== 'undefined' ? EquipmentAutoOptimizer.AUTO_PAPER_IDS : [],
);
const EQUIP_AUTO_PROPERTY_LABELS = Object.freeze({ hp_add: '气血' });
const EQUIP_AUTO_RESULT_PAGE_SIZES = Object.freeze([10, 30, 50, 100]);
let autoSimulatorMode = 'wash';
let equipAutoSelectedLocations = new Set();
let equipAutoPaperConfigs = new Map();
let equipAutoSelectedProperties = new Set();
let equipAutoRunning = false;
let equipAutoCancelRequested = false;
let equipAutoRunToken = 0;
let equipAutoLastResult = null;
let equipAutoResultPage = 1;
let equipAutoResultPageSize = 30;
let equipAutoResultLocationFilter = '';
let equipAutoResultPaperFilter = '';
let equipAutoResultQualityFilter = '';
let equipAutoResultQualityAtLeast = false;
let equipAutoManualAttachStates = new Map();
let jianwangAutoRunning = false;
let jianwangAutoCancelRequested = false;
let jianwangAutoRunToken = 0;
let jianwangAutoSwords = [];
let jianwangAutoLastResult = null;

function setAutoSimulatorMode(mode) {
    autoSimulatorMode = mode === 'equip' || mode === 'jianwang' ? mode : 'wash';
    const isWash = autoSimulatorMode === 'wash';
    const isEquip = autoSimulatorMode === 'equip';
    const isJianwang = autoSimulatorMode === 'jianwang';
    const washButton = document.getElementById('btnAutoWashMode');
    const equipButton = document.getElementById('btnAutoEquipMode');
    const jianwangButton = document.getElementById('btnAutoJianwangMode');
    const washPanel = document.getElementById('autoWashModePanel');
    const equipPanel = document.getElementById('autoEquipModePanel');
    const jianwangPanel = document.getElementById('autoJianwangModePanel');
    const title = document.getElementById('aiPredictionTitle');
    const intro = document.querySelector('#aiPredictionPanel > .ai-prediction-intro');
    [[washButton, isWash], [equipButton, isEquip], [jianwangButton, isJianwang]].forEach(([button, active]) => {
        if (!button) return;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    if (washPanel) washPanel.hidden = !isWash;
    if (equipPanel) equipPanel.hidden = !isEquip;
    if (jianwangPanel) jianwangPanel.hidden = !isJianwang;
    if (title) {
        title.textContent = isEquip
            ? '自动模拟 · 装备批量预测'
            : (isJianwang ? '自动模拟 · 剑王阁同词条' : '自动模拟 · 最佳洗脉路线');
    }
    if (intro) {
        intro.textContent = isEquip
            ? '选择地点、图纸、属性和首次打造材料。系统将每个材料分支从同一份存档快照独立起跑，保留蓝装和紫装并分析精炼；后续芒晶洗练在单件装备详情中手动模拟。'
            : (isJianwang
                ? '选择存档中的起始剑、90级镇派路线、目标词条与三同/四同目标。系统会自动保留已有目标词条，跨多把剑搜索首次达到所选同词条门槛的可执行流程。'
                : '选择最终希望保留的紫脉。系统会比较自然锁脉、三脉推进后开四脉及冲突置换候选，并用同一状态机回放验证丹耗。');
    }
    const kicker = document.querySelector('#aiPredictionPanel .ai-kicker');
    if (kicker) kicker.textContent = isEquip ? 'LOCAL EQUIPMENT OPTIMIZER' : (isJianwang ? 'LOCAL JIANWANG OPTIMIZER' : 'LOCAL ROUTE OPTIMIZER');
    if (isWash) renderAutoWashSaveGate();
    if (isJianwang) refreshJianwangAutoSwords(true);
}

function invalidateEquipAutoPrediction(message) {
    equipAutoLastResult = null;
    equipAutoResultPage = 1;
    equipAutoResultLocationFilter = '';
    equipAutoResultPaperFilter = '';
    equipAutoResultQualityFilter = '';
    equipAutoResultQualityAtLeast = false;
    equipAutoManualAttachStates = new Map();
    if (equipAutoRunning) equipAutoCancelRequested = true;
    const results = document.getElementById('autoEquipResults');
    if (results) {
        results.dataset.hasResult = 'false';
        results.innerHTML = `<div class="ai-result-empty">${escapeAiHtml(message || '配置已变化，请重新开始装备自动模拟。')}</div>`;
    }
    if (!equipAutoRunning) {
        const progress = document.getElementById('autoEquipProgress');
        if (progress) progress.hidden = true;
    }
}

function extractEquipMakeRnd(saveData) {
    if (!saveData) return null;
    const makeRnd = saveData.MakeRnd
        || (Array.isArray(saveData) && saveData[0] && saveData[0].MakeRnd)
        || ((saveData.Seeds || saveData.LuckySeeds) ? saveData : null);
    if (!makeRnd) return null;
    return {
        save_version: state.saveVersion || '',
        save_channel: state.saveChannel || '',
        Seeds: makeRnd.Seeds || {},
        LuckySeeds: makeRnd.LuckySeeds || {},
        IDSeeds: makeRnd.IDSeeds || {},
        MakeLucky: makeRnd.MakeLucky || {},
    };
}

function selectedEquipAutoLocationIds() {
    return Array.from(equipAutoSelectedLocations).map(Number).filter(Number.isFinite);
}

function equipAutoAvailablePaperMap() {
    const map = new Map();
    if (typeof EquipmentAutoOptimizer === 'undefined' || typeof EQUIP_DATA === 'undefined') return map;
    selectedEquipAutoLocationIds().forEach(npcId => {
        EquipmentAutoOptimizer.papersForCraftsman(EQUIP_DATA, npcId).forEach(item => {
            if (!EQUIP_AUTO_ALLOWED_PAPER_IDS.has(Number(item.paper.id))) return;
            const minColor = Number(item.paper.min_color || 1);
            const maxColor = Number(item.paper.max_color || 4);
            if (Number(item.equip.lv || 0) < 90 || minColor > 4 || maxColor < 4) return;
            const key = String(item.paper.id);
            const entry = map.get(key) || { ...item, npcIds: [] };
            entry.npcIds.push(npcId);
            map.set(key, entry);
        });
    });
    return map;
}

function renderEquipAutoLocations() {
    const container = document.getElementById('autoEquipLocationChoices');
    if (!container || typeof EquipmentAutoOptimizer === 'undefined' || typeof EQUIP_DATA === 'undefined') return;
    const craftsmen = EquipmentAutoOptimizer.sortedCraftsmen(EQUIP_DATA);
    container.innerHTML = craftsmen.map(craftsman => {
        const id = Number(craftsman.id);
        const selected = equipAutoSelectedLocations.has(id);
        const label = `${craftsman.place || craftsman.name} · ${craftsman.name}`;
        return `<label class="equip-auto-choice ${selected ? 'is-selected' : ''}" data-location-id="${id}">
            <input type="checkbox" value="${id}" ${selected ? 'checked' : ''}>
            <span>${escapeAiHtml(label)}（${craftsman.zhi === 'fengzhi' ? '绣' : '铁'}）</span>
        </label>`;
    }).join('');
    const count = document.getElementById('autoEquipLocationCount');
    if (count) count.textContent = `已选 ${equipAutoSelectedLocations.size}`;
}

function equipAutoAttachPickerHtml(equip, selectedIds) {
    const materials = EquipmentAutoOptimizer.specialMaterialsForEquip(EQUIP_DATA, equip);
    const selectedSet = new Set((selectedIds || []).map(Number));
    const buttons = materials.map(material => {
        const selected = selectedSet.has(Number(material.id));
        const action = selected ? 'remove' : 'add';
        const state = selected ? '已选' : '选择';
        return `<button class="equip-auto-attach-option ${selected ? 'is-selected' : 'is-available'}" type="button" data-attach-action="${action}" data-material-id="${material.id}" aria-pressed="${selected}" aria-label="${state}附加材料 ${escapeAiHtml(material.name)}">
            <span>${escapeAiHtml(material.name)}</span><small>${state}</small>
        </button>`;
    }).join('');
    return `<div class="equip-auto-attach-field">
        <span class="equip-auto-field-label">首次打造附加材料（可多选，分别计算）</span>
        <div class="equip-auto-attach-picker" role="group" aria-label="首次打造附加材料多选">
            <div class="equip-auto-attach-options">${buttons || '<span class="equip-auto-attach-empty">当前装备没有可用附加材料</span>'}</div>
        </div>
    </div>`;
}

function updateEquipAutoAttachMaterialSelection(config, materialId, shouldSelect) {
    if (!config) return false;
    const id = Number(materialId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const current = Array.from(new Set((config.craftMaterialIds || []).map(Number).filter(value => value > 0)));
    const exists = current.includes(id);
    if (shouldSelect && !exists) current.push(id);
    if (!shouldSelect && exists) current.splice(current.indexOf(id), 1);
    config.craftMaterialIds = current;
    return shouldSelect ? !exists : exists;
}

function renderEquipAutoPapers() {
    const container = document.getElementById('autoEquipPaperChoices');
    if (!container) return;
    const available = equipAutoAvailablePaperMap();
    for (const paperId of Array.from(equipAutoPaperConfigs.keys())) {
        if (!available.has(String(paperId))) equipAutoPaperConfigs.delete(String(paperId));
    }
    if (!available.size) {
        container.innerHTML = '<span class="text-muted">先选择至少一个打造地点；这里只显示可出紫且可升炼/精炼的 90～100 级图纸。</span>';
        const count = document.getElementById('autoEquipPaperCount');
        if (count) count.textContent = '已选 0';
        return;
    }
    const rows = Array.from(available.values()).sort((a, b) => (Number(b.equip.lv) - Number(a.equip.lv))
        || String(a.equip.name).localeCompare(String(b.equip.name), 'zh'));
    container.innerHTML = rows.map(item => {
        const paperId = String(item.paper.id);
        const config = equipAutoPaperConfigs.get(paperId);
        const selected = !!config;
        const attachIds = config && config.craftMaterialIds || [];
        const supportedProps = EquipmentAutoOptimizer.supportedTargetProperties(item.equip, EQUIP_DATA, EquipmentAutoOptimizer.TARGET_PROPERTIES);
        const compatibleSelected = supportedProps.filter(prop => equipAutoSelectedProperties.has(prop));
        const isIncompatible = equipAutoSelectedProperties.size > 0 && compatibleSelected.length === 0;
        const supportedLabels = supportedProps.map(equipAutoPropertyLabel).join('、');
        return `<div class="equip-auto-paper-card ${selected ? 'is-selected' : ''} ${isIncompatible ? 'is-incompatible' : ''}" data-paper-id="${paperId}" data-search="${escapeAiHtml(`${item.equip.name} ${item.paper.name}`.toLowerCase())}">
            <label class="equip-auto-paper-check">
                <input class="equip-auto-paper-toggle" type="checkbox" value="${paperId}" ${selected ? 'checked' : ''}>
                <strong>${escapeAiHtml(item.equip.name)} · ${Number(item.equip.lv)}级${item.equip.lv === 90 ? '（自动升炼）' : ''}</strong>
                <span>${escapeAiHtml(item.paper.name)} · ${escapeAiHtml(EQUIP_DATA.typeNames[String(item.equip.type)] || item.equip.type)} · 可在 ${item.npcIds.length} 个已选地点打造</span>
                <span class="equip-auto-paper-props">可精炼：${escapeAiHtml(supportedLabels || '无目标属性')}${isIncompatible ? ' · 与当前选择不兼容，将跳过' : ''}</span>
            </label>
            <div class="equip-auto-paper-config" ${selected ? '' : 'hidden'}>
                ${equipAutoAttachPickerHtml(item.equip, attachIds)}
            </div>
        </div>`;
    }).join('');
    filterEquipAutoPapers();
    const count = document.getElementById('autoEquipPaperCount');
    if (count) count.textContent = `已选 ${equipAutoPaperConfigs.size}`;
}

function filterEquipAutoPapers() {
    const query = String(document.getElementById('autoEquipPaperSearch')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#autoEquipPaperChoices .equip-auto-paper-card').forEach(card => {
        card.classList.toggle('is-hidden', !!query && !String(card.dataset.search || '').includes(query));
    });
}

function renderEquipAutoProperties() {
    const container = document.getElementById('autoEquipPropertyChoices');
    if (!container || typeof EquipmentAutoOptimizer === 'undefined' || typeof EQUIP_DATA === 'undefined') return;
    container.innerHTML = EquipmentAutoOptimizer.TARGET_PROPERTIES.map(prop => {
        const selected = equipAutoSelectedProperties.has(prop);
        return `<label class="equip-auto-choice ${selected ? 'is-selected' : ''}" data-property="${prop}">
            <input type="checkbox" value="${prop}" ${selected ? 'checked' : ''}>
            <span>${escapeAiHtml(equipAutoPropertyLabel(prop))}</span>
        </label>`;
    }).join('');
    const count = document.getElementById('autoEquipPropertyCount');
    if (count) count.textContent = `已选 ${equipAutoSelectedProperties.size}`;
}

function initializeEquipAutoControls() {
    if (typeof EquipmentAutoOptimizer === 'undefined' || typeof EQUIP_DATA === 'undefined') return;
    renderEquipAutoLocations();
    renderEquipAutoPapers();
    renderEquipAutoProperties();
}

function handleEquipAutoLocationClick(event) {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const label = event.target.closest('.equip-auto-choice[data-location-id]');
    if (!label) return;
    const id = Number(label.dataset.locationId);
    const checkbox = event.target;
    if (checkbox.checked) equipAutoSelectedLocations.add(id);
    else equipAutoSelectedLocations.delete(id);
    renderEquipAutoLocations();
    renderEquipAutoPapers();
    invalidateEquipAutoPrediction('地点已变化，请重新开始装备自动模拟。');
}

function handleEquipAutoPaperChange(event) {
    const card = event.target.closest('.equip-auto-paper-card');
    if (!card) return;
    const paperId = String(card.dataset.paperId);
    if (event.target.classList.contains('equip-auto-paper-toggle')) {
        if (event.target.checked) {
            equipAutoPaperConfigs.set(paperId, { craftMaterialIds: [] });
        } else {
            equipAutoPaperConfigs.delete(paperId);
        }
        renderEquipAutoPapers();
    }
    invalidateEquipAutoPrediction('图纸或附加材料已变化，请重新开始装备自动模拟。');
}

function handleEquipAutoPaperClick(event) {
    const button = event.target.closest('.equip-auto-attach-option[data-attach-action][data-material-id]');
    if (!button) return;
    const card = button.closest('.equip-auto-paper-card');
    if (!card) return;
    const config = equipAutoPaperConfigs.get(String(card.dataset.paperId));
    const shouldSelect = button.dataset.attachAction === 'add';
    if (!updateEquipAutoAttachMaterialSelection(config, button.dataset.materialId, shouldSelect)) return;
    const list = document.getElementById('autoEquipPaperChoices');
    const scrollTop = list ? list.scrollTop : 0;
    renderEquipAutoPapers();
    if (list) list.scrollTop = scrollTop;
    invalidateEquipAutoPrediction('附加材料已变化，请重新开始装备自动模拟。');
}

function handleEquipAutoPropertyClick(event) {
    if (!event.target.matches('input[type="checkbox"]')) return;
    const label = event.target.closest('.equip-auto-choice[data-property]');
    if (!label) return;
    const prop = label.dataset.property;
    const checkbox = event.target;
    if (checkbox.checked) equipAutoSelectedProperties.add(prop);
    else equipAutoSelectedProperties.delete(prop);
    renderEquipAutoProperties();
    renderEquipAutoPapers();
    invalidateEquipAutoPrediction('目标属性已变化，请重新开始装备自动模拟。');
}

function buildEquipAutoBranches() {
    const branches = [];
    const availableByNpc = new Map();
    selectedEquipAutoLocationIds().forEach(npcId => {
        availableByNpc.set(npcId, new Set(
            EquipmentAutoOptimizer.papersForCraftsman(EQUIP_DATA, npcId).map(item => String(item.paper.id)),
        ));
    });
    selectedEquipAutoLocationIds().forEach(npcId => {
        equipAutoPaperConfigs.forEach((config, paperId) => {
            if (!availableByNpc.get(npcId)?.has(String(paperId))) return;
            const specialIds = Array.from(new Set((config.craftMaterialIds || []).map(Number).filter(id => id > 0)));
            (specialIds.length ? specialIds : [0]).forEach(specialId => {
                branches.push({
                    npcId,
                    paperId: Number(paperId),
                    specialId,
                });
            });
        });
    });
    return branches;
}

function clampEquipAutoNumber(id, min, max, fallback) {
    const element = document.getElementById(id);
    let value = parseInt(element?.value || String(fallback), 10);
    if (Number.isNaN(value)) value = fallback;
    value = Math.max(min, Math.min(max, value));
    if (element) element.value = String(value);
    return value;
}

function validateEquipAutoSelection() {
    const errors = [];
    const makeRnd = extractEquipMakeRnd(state.saveData);
    const branches = buildEquipAutoBranches();
    if (!makeRnd) errors.push('请先导入包含打造状态的有效存档');
    if (!equipAutoSelectedLocations.size) errors.push('请至少选择一个打造地点');
    if (!equipAutoPaperConfigs.size) errors.push('请至少选择一张图纸');
    if (!branches.length && equipAutoPaperConfigs.size) errors.push('当前地点与图纸没有可打造组合');
    if (!equipAutoSelectedProperties.size) errors.push('请至少选择一个目标属性');
    const targetProps = Array.from(equipAutoSelectedProperties);
    const compatibleBranches = branches.filter(branch => {
        const paper = EQUIP_DATA.papers[String(branch.paperId)];
        const equip = paper && EQUIP_DATA.equipment[String(paper.dz_equip)];
        return equip && EquipmentAutoOptimizer.supportedTargetProperties(equip, EQUIP_DATA, targetProps).length > 0;
    });
    const skippedBranchCount = branches.length - compatibleBranches.length;
    if (branches.length && targetProps.length && !compatibleBranches.length) {
        errors.push('所选图纸均不会出现当前目标属性，请更换图纸或属性');
    }
    const message = document.getElementById('autoEquipSelectionMessage');
    if (message) {
        message.textContent = errors.length
            ? errors.join('；')
            : (skippedBranchCount ? `将运行 ${compatibleBranches.length} 个兼容分支，跳过 ${skippedBranchCount} 个不可能出现目标属性的分支。` : '图纸与目标属性兼容，可以开始模拟。');
        message.classList.toggle('is-error', errors.length > 0);
    }
    return { valid: errors.length === 0, errors, makeRnd, branches, compatibleBranches, skippedBranchCount };
}

function renderEquipAutoProgress(progress) {
    const panel = document.getElementById('autoEquipProgress');
    const text = document.getElementById('autoEquipProgressText');
    const percent = document.getElementById('autoEquipProgressPercent');
    const fill = document.getElementById('autoEquipProgressFill');
    if (!panel) return;
    const ratio = progress.total > 0 ? Math.max(0, Math.min(1, progress.done / progress.total)) : 0;
    const value = progress.phase === 'refine' ? 45 + ratio * 55 : ratio * 45;
    panel.hidden = false;
    if (text) text.textContent = progress.message || '正在计算…';
    if (percent) percent.textContent = `${Math.round(value)}%`;
    if (fill) fill.style.width = `${value}%`;
}

function equipAutoUsesPercentFormat(prop, value) {
    const number = Number(value);
    return Number.isFinite(number) && (number < 1 || prop === 'atk_extend');
}

function equipAutoTruncateDecimal(value, decimals = 3) {
    const number = Number(value);
    if (!Number.isFinite(number)) return number;
    const factor = 10 ** decimals;
    return Math.floor(number * factor + 1e-8) / factor;
}

function equipAutoFormatDecimal(value, decimals = 3) {
    const truncated = equipAutoTruncateDecimal(value, decimals);
    if (!Number.isFinite(truncated)) return String(value);
    return Number(truncated.toFixed(decimals)).toString();
}

function equipAutoPercentagePoints(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return equipAutoTruncateDecimal(number * 100);
}

function equipAutoFormatPercentagePoints(value) {
    return equipAutoFormatDecimal(value);
}

function equipAutoFormatPropValue(prop, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    if (equipAutoUsesPercentFormat(prop, number)) return `${equipAutoFormatPercentagePoints(equipAutoPercentagePoints(number))}%`;
    return equipAutoFormatDecimal(number);
}

function equipAutoFormatRefinementTotal(refinement) {
    const total = Number(refinement && refinement.total);
    if (!Number.isFinite(total)) {
        return equipAutoFormatPropValue(refinement && refinement.prop, refinement && refinement.total);
    }
    const slotValues = [1, 2, 3]
        .map(slot => Number(refinement && refinement.maxima && refinement.maxima[slot] && refinement.maxima[slot].value))
        .filter(Number.isFinite);
    if (!slotValues.length) return equipAutoFormatPropValue(refinement.prop, total);
    if (equipAutoUsesPercentFormat(refinement && refinement.prop, total)) {
        const displayedTotal = slotValues.reduce((sum, value) => sum + equipAutoPercentagePoints(value), 0);
        return `${equipAutoFormatPercentagePoints(displayedTotal)}%`;
    }
    const displayedTotal = slotValues.reduce((sum, value) => sum + equipAutoTruncateDecimal(value), 0);
    return equipAutoFormatDecimal(displayedTotal);
}

function equipAutoPropertyLabel(prop) {
    return EQUIP_AUTO_PROPERTY_LABELS[prop] || EQUIP_DATA.propNames[prop] || prop;
}

function equipAutoFormatProps(items) {
    if (!items || !items.length) return '无';
    return items.map(item => `${escapeAiHtml(equipAutoPropertyLabel(item.prop))}+${escapeAiHtml(equipAutoFormatPropValue(item.prop, item.value))}`).join('、');
}

function equipAutoFormatBase(base) {
    const entries = Object.entries(base || {});
    if (!entries.length) return '无';
    return entries.map(([prop, value]) => `${escapeAiHtml(EQUIP_DATA.propNames[prop] || prop)}+${escapeAiHtml(equipAutoFormatPropValue(prop, value))}`).join('、');
}

function equipAutoFormatSilver(value) {
    const amount = Math.max(0, Math.trunc(Number(value) || 0));
    const liang = Math.floor(amount / 1000);
    const wen = amount % 1000;
    return `${liang ? `${liang.toLocaleString()}两` : ''}${wen || !liang ? `${wen}文` : ''}`;
}

function equipAutoFormatCost(cost) {
    if (!cost) return '无';
    const parts = (cost.materials || []).filter(item => Number(item.amount) > 0)
        .map(item => `${escapeAiHtml(item.name)}×${Number(item.amount).toLocaleString()}`);
    if (cost.mainMaterial && cost.mainAmount) parts.push(`${escapeAiHtml(cost.mainMaterial.name)}×${Number(cost.mainAmount).toLocaleString()}`);
    if (cost.lianjin) parts.push(`连金泥×${Number(cost.lianjin).toLocaleString()}`);
    if (cost.silver) parts.push(`银两${equipAutoFormatSilver(cost.silver)}`);
    return parts.join(' · ') || '无';
}

function mergeEquipAutoCosts(...costs) {
    const materials = new Map();
    let silver = 0;
    const addMaterial = (material, amount) => {
        const value = Math.max(0, Number(amount) || 0);
        if (!material || !value) return;
        const name = String(material.name || material.id || '材料');
        const key = `${material.id ?? ''}:${name}`;
        const current = materials.get(key) || { id: material.id, name, amount: 0 };
        current.amount += value;
        materials.set(key, current);
    };
    costs.filter(Boolean).forEach(cost => {
        (cost.materials || []).forEach(item => addMaterial(item, item.amount));
        addMaterial(cost.mainMaterial, cost.mainAmount);
        if (cost.lianjin) addMaterial({ id: 8801, name: '连金泥' }, cost.lianjin);
        silver += Math.max(0, Number(cost.silver) || 0);
    });
    return {
        materials: Array.from(materials.values()).sort((a, b) => Number(a.name === '连金泥') - Number(b.name === '连金泥')),
        silver,
    };
}

function equipAutoRefinementHtml(refinement, upgradeCost = null) {
    const label = equipAutoPropertyLabel(refinement.prop);
    const slots = [1, 2, 3].map(slot => {
        const maximum = refinement.maxima[slot];
        if (!maximum) return `<span>槽位 ${slot}：无</span>`;
        const occurrences = maximum.occurrences.map(item => item.source === 'original' ? '原有' : `#${item.index}`).join('、');
        return `<span>槽位 ${slot}：${escapeAiHtml(equipAutoFormatPropValue(refinement.prop, maximum.value))}<small>（${occurrences}）</small></span>`;
    }).join('');
    const plan = refinement.plan;
    const accepts = plan ? plan.accepts.map(item => `#${item.index}（槽${item.slot}）`).join(' → ') : '无';
    const totalCost = mergeEquipAutoCosts(upgradeCost, plan && plan.cost);
    return `<div class="equip-auto-refine-card">
        <div class="equip-auto-refine-title"><strong>精炼 · ${escapeAiHtml(label)}</strong><span class="equip-auto-max-value">最高${escapeAiHtml(label)} ${escapeAiHtml(equipAutoFormatRefinementTotal(refinement))}</span></div>
        <div class="equip-auto-slot-list">${slots}</div>
        <div>状态回放：${accepts}${plan ? `，做到第 ${plan.cutoff} 次为止` : ''}</div>
        <div class="equip-auto-cost-line">消耗（精炼消耗）：${plan ? equipAutoFormatCost(plan.cost) : '无'}</div>
        <div class="equip-auto-total-cost-line">总消耗（升炼 + 精炼）：${equipAutoFormatCost(totalCost)}</div>
    </div>`;
}

function equipAutoAttachmentHtml(attachment) {
    const stageText = attachment.stage === 'before' ? '升炼前' : '升炼后';
    const levelText = Number(attachment.equipLevel) > 0 ? ` · ${Number(attachment.equipLevel)}级` : '';
    const stageHtml = `<span class="equip-auto-attachment-stage">${stageText}${levelText}</span>`;
    if (attachment.unavailable) {
        return `<div class="equip-auto-attach-card"><strong>附加 · ${escapeAiHtml(attachment.materialName)} ${stageHtml}</strong><div class="ai-result-error">附加不可用</div></div>`;
    }
    const maxima = (attachment.maxima || []).filter(item => item.recommendedIndex != null);
    const maximumSummary = maxima.map(maximum => `最高${escapeAiHtml(equipAutoPropertyLabel(maximum.prop))} ${escapeAiHtml(equipAutoFormatPropValue(maximum.prop, maximum.value))} · 第 ${maximum.indexes.join('、')} 次`).join('；');
    const sequenceItems = attachment.items || [];
    const showProperty = new Set(sequenceItems.map(item => item.prop)).size > 1;
    const maximumIndexes = new Set(maxima.flatMap(maximum => maximum.indexes || []).map(Number));
    const sequence = sequenceItems.map(item => {
        const value = equipAutoFormatPropValue(item.prop, item.value);
        const property = showProperty ? `<span class="equip-auto-attach-sequence-prop">${escapeAiHtml(equipAutoPropertyLabel(item.prop))}</span>` : '';
        const isMaximum = maximumIndexes.has(Number(item.index));
        const ratingKey = equipAutoAttachmentRatingKey(item);
        return `<li class="equip-auto-attach-sequence-item${ratingKey ? ` is-rating-${ratingKey}` : ''}${isMaximum ? ' is-maximum' : ''}">
            <span class="equip-auto-attach-sequence-index">第 ${Number(item.index)} 次</span>
            ${property}
            <strong class="equip-auto-attach-sequence-value">${escapeAiHtml(value)}</strong>
            ${isMaximum ? '<span class="equip-auto-attach-sequence-badge">最高</span>' : ''}
        </li>`;
    }).join('');
    return `<div class="equip-auto-attach-card">
        <div class="equip-auto-refine-title"><strong>芒晶洗练 · ${escapeAiHtml(attachment.materialName)} ${stageHtml}</strong><span class="equip-auto-attachment-value">${maximumSummary || '预测范围内未出现可用属性'}</span></div>
        <div class="equip-auto-attachment-maxima">${maxima.map(maximum => `<div class="equip-auto-attachment-maximum">
            <span>${escapeAiHtml(equipAutoPropertyLabel(maximum.prop))}</span>
            <span class="equip-auto-cost-line">消耗：芒晶×${maximum.recommendedIndex}</span>
        </div>`).join('')}</div>
        ${sequence ? `<ol class="equip-auto-attach-sequence" aria-label="芒晶洗练逐次结果">${sequence}</ol>` : ''}
    </div>`;
}

const EQUIP_AUTO_ATTACHMENT_RATING_KEYS = Object.freeze(['white', 'green', 'blue', 'purple', 'gold', 'red']);

function equipAutoAttachmentRatingKey(item) {
    const value = Number(item && item.value);
    const minimum = Number(item && item.valueMinimum);
    const maximum = Number(item && item.valueMaximum);
    if (![value, minimum, maximum].every(Number.isFinite) || maximum < minimum) return '';
    if (maximum === minimum) return 'red';
    const ratio = Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
    const index = ratio >= 1
        ? EQUIP_AUTO_ATTACHMENT_RATING_KEYS.length - 1
        : Math.floor(ratio * EQUIP_AUTO_ATTACHMENT_RATING_KEYS.length);
    return EQUIP_AUTO_ATTACHMENT_RATING_KEYS[index];
}

function equipAutoManualAttachState(candidate) {
    const key = String(candidate && candidate.id || '');
    let current = equipAutoManualAttachStates.get(key);
    if (!current) {
        current = { stage: 'before', count: 20, result: null, error: '' };
        equipAutoManualAttachStates.set(key, current);
    }
    return current;
}

function equipAutoManualAttachHtml(candidate) {
    const candidateId = String(candidate && candidate.id || '');
    const firstStage = Number(candidate && candidate.craftSpecialEquipLevel) > 0
        ? `升炼前 · ${Number(candidate.craftSpecialEquipLevel)}级`
        : '升炼前';
    if (!candidate || !candidate.canSimulateSpecialAttach || !candidate.specialAttachEquips || !candidate.craftSpecialId) {
        return `<div class="equip-auto-manual-attach is-unavailable" data-candidate-id="${escapeAiHtml(candidateId)}">
            <p class="ai-visual-heading">附加属性</p>
            <div class="equip-auto-attach-card"><strong>未进行首次打造附加</strong><p>图纸未选择附加材料，无法使用芒晶模拟。</p></div>
        </div>`;
    }
    const state = equipAutoManualAttachState(candidate);
    const stage = state.stage === 'after' ? 'after' : 'before';
    const result = state.result ? equipAutoAttachmentHtml(state.result) : '';
    return `<div class="equip-auto-manual-attach" data-candidate-id="${escapeAiHtml(candidateId)}">
        <p class="ai-visual-heading">附加属性</p>
        <div class="equip-auto-attach-card equip-auto-crafted-special">
            <div class="equip-auto-refine-title"><strong>首次打造附加 · ${escapeAiHtml(candidate.craftSpecialName)}</strong><span class="equip-auto-attachment-stage">${firstStage}</span></div>
            <div class="equip-auto-crafted-special-value">${equipAutoFormatProps(candidate.special)}</div>
        </div>
        <div class="equip-auto-manual-attach-controls" aria-label="后续芒晶洗练设置">
            <div class="equip-auto-manual-stage" role="group" aria-label="芒晶洗练阶段">
                <button type="button" data-manual-attach-action="stage" data-stage="before" class="${stage === 'before' ? 'is-active' : ''}" aria-pressed="${stage === 'before'}">升炼前</button>
                <button type="button" data-manual-attach-action="stage" data-stage="after" class="${stage === 'after' ? 'is-active' : ''}" aria-pressed="${stage === 'after'}">升炼后</button>
            </div>
            <label>模拟次数<input class="equip-auto-manual-attach-count" type="number" min="1" max="5000" value="${state.count}"><span>次</span></label>
            <button class="btn equip-auto-manual-attach-button" type="button" data-manual-attach-action="simulate">模拟芒晶洗练</button>
        </div>
        <p class="equip-auto-manual-attach-hint">沿用首次打造材料「${escapeAiHtml(candidate.craftSpecialName)}」的属性池；只读预测，不推进 MJSeed。</p>
        ${state.error ? `<div class="ai-result-error">${escapeAiHtml(state.error)}</div>` : result}
    </div>`;
}

function equipAutoCandidateCostHtml(candidate) {
    const cost = candidate.craftCost || {};
    const parts = (cost.materials || []).filter(item => Number(item.amount) > 0).map(item => {
        const isPaper = Number(item.id) === Number(candidate.paperId)
            || String(item.name || '') === String(candidate.paperName || '');
        return isPaper ? '图纸×1' : `${escapeAiHtml(item.name)}×${Number(item.amount).toLocaleString()}`;
    });
    if (cost.mainMaterial && cost.mainAmount) parts.push(`${escapeAiHtml(cost.mainMaterial.name)}×${Number(cost.mainAmount).toLocaleString()}`);
    if (cost.lianjin) parts.push(`连金泥×${Number(cost.lianjin).toLocaleString()}`);
    if (cost.silver) parts.push(`银两${equipAutoFormatSilver(cost.silver)}`);
    const items = parts.length ? parts.map(part => `<span>${part}</span>`).join('') : '<span>无</span>';
    return `<div class="equip-auto-cost-items">${items}</div>`;
}

const EQUIP_AUTO_RATING_LEVELS = Object.freeze([
    { min: 96, key: 'red', label: '神器' },
    { min: 91, key: 'gold', label: '极品' },
    { min: 81, key: 'purple', label: '极佳' },
    { min: 71, key: 'blue', label: '优秀' },
    { min: 51, key: 'green', label: '良好' },
    { min: 0, key: 'white', label: '劣质' },
]);
const EQUIP_AUTO_REFINEMENT_THEORETICAL_MAX_MULTIPLIER = 1.25;
const EQUIP_AUTO_REFINEMENT_SLOT_MULTIPLIERS = Object.freeze([1, 0.75, 0.5]);

function equipAutoRefinementTotal(refinement) {
    const slotValues = [1, 2, 3].map(slot => Number(refinement && refinement.maxima && refinement.maxima[slot] && refinement.maxima[slot].value))
        .filter(Number.isFinite);
    if (slotValues.length) return slotValues.reduce((sum, value) => sum + value, 0);
    return Math.max(0, Number(refinement && refinement.total) || 0);
}

function equipAutoTheoreticalSlotMaximum(candidate, prop, slot = 1) {
    const config = typeof EQUIP_DATA !== 'undefined'
        ? EQUIP_DATA.equipment && EQUIP_DATA.equipment[String(candidate && candidate.equipId)]
        : null;
    const extConfig = config && config.exts && config.exts[prop];
    if (typeof EquipmentAutoOptimizer !== 'undefined'
        && typeof EquipmentAutoOptimizer.theoreticalRefinementSlotMaximum === 'function') {
        return EquipmentAutoOptimizer.theoreticalRefinementSlotMaximum(config, prop, slot);
    }
    const baseValue = Number(Array.isArray(extConfig) ? extConfig[0] : NaN);
    const slotMultiplier = EQUIP_AUTO_REFINEMENT_SLOT_MULTIPLIERS[Math.trunc(Number(slot)) - 1];
    if (!Number.isFinite(baseValue) || baseValue <= 0 || !slotMultiplier) return 0;
    const maximum = baseValue * EQUIP_AUTO_REFINEMENT_THEORETICAL_MAX_MULTIPLIER * slotMultiplier;
    return baseValue >= 1 ? Math.floor(maximum) : maximum;
}

function equipAutoRatingReference(candidate) {
    const reference = {};
    const embedded = candidate && candidate.refinementRatingReference;
    (candidate && candidate.refinements || []).forEach(refinement => {
        const prop = String(refinement.prop || '');
        if (!prop) return;
        const candidateMaximum = Number(embedded && embedded[prop]);
        reference[prop] = Number.isFinite(candidateMaximum) && candidateMaximum > 0
            ? candidateMaximum
            : EQUIP_AUTO_REFINEMENT_SLOT_MULTIPLIERS.reduce((sum, _, index) => (
                sum + equipAutoTheoreticalSlotMaximum(candidate, prop, index + 1)
            ), 0);
    });
    return reference;
}

function equipAutoRatingForPercent(percent) {
    const normalizedPercent = Math.min(100, Math.max(0, Number(percent) || 0));
    const roundedPercent = Math.round(normalizedPercent);
    const level = EQUIP_AUTO_RATING_LEVELS.find(item => roundedPercent >= item.min) || EQUIP_AUTO_RATING_LEVELS[EQUIP_AUTO_RATING_LEVELS.length - 1];
    return { ...level, percent: normalizedPercent, roundedPercent };
}

function equipAutoRefinementRating(candidate, refinement, reference = equipAutoRatingReference(candidate)) {
    const maximum = Number(reference && reference[refinement && refinement.prop]) || 0;
    const percent = maximum > 0 ? equipAutoRefinementTotal(refinement) / maximum * 100 : 0;
    return equipAutoRatingForPercent(percent);
}

function equipAutoCandidateRating(candidate, reference = equipAutoRatingReference(candidate)) {
    const ratings = (candidate.refinements || []).map(refinement => equipAutoRefinementRating(candidate, refinement, reference));
    return equipAutoRatingForPercent(ratings.length ? Math.max(...ratings.map(item => item.percent)) : 0);
}

function equipAutoDisplayedRefinementValue(refinement) {
    const total = equipAutoRefinementTotal(refinement);
    const slotValues = [1, 2, 3]
        .map(slot => Number(refinement && refinement.maxima && refinement.maxima[slot] && refinement.maxima[slot].value))
        .filter(Number.isFinite);
    if (!equipAutoUsesPercentFormat(refinement && refinement.prop, total)) {
        return slotValues.length
            ? slotValues.reduce((sum, value) => sum + equipAutoTruncateDecimal(value), 0)
            : equipAutoTruncateDecimal(total);
    }
    const displayedPoints = slotValues.length
        ? slotValues.reduce((sum, value) => sum + equipAutoPercentagePoints(value), 0)
        : equipAutoPercentagePoints(total);
    return displayedPoints / 100;
}

function equipAutoCandidateTotalProps(candidate) {
    const totals = new Map();
    const add = (prop, value) => {
        const key = String(prop || '');
        const number = Number(value);
        if (!key || !Number.isFinite(number)) return;
        const displayedValue = equipAutoUsesPercentFormat(key, number)
            ? equipAutoPercentagePoints(number) / 100
            : equipAutoTruncateDecimal(number);
        totals.set(key, (totals.get(key) || 0) + displayedValue);
    };
    (candidate && candidate.refinements || []).forEach(refinement => {
        add(refinement && refinement.prop, equipAutoDisplayedRefinementValue(refinement));
    });
    (candidate && candidate.special || []).forEach(item => add(item && item.prop, item && item.value));
    (candidate && candidate.region || []).forEach(item => add(item && item.prop, item && item.value));
    return Array.from(totals, ([prop, value]) => ({ prop, value }));
}

function equipAutoCandidateHtml(candidate) {
    const ratingReference = equipAutoRatingReference(candidate);
    const rating = equipAutoCandidateRating(candidate, ratingReference);
    const targetSummary = candidate.refinements.map(refinement => {
        const refinementRating = equipAutoRefinementRating(candidate, refinement, ratingReference);
        return `<span class="equip-auto-max-summary" title="${escapeAiHtml(equipAutoPropertyLabel(refinement.prop))}品质：${refinementRating.label} ${refinementRating.roundedPercent}%"><span>最高${escapeAiHtml(equipAutoPropertyLabel(refinement.prop))}</span><strong class="is-${refinementRating.key}">${escapeAiHtml(equipAutoFormatRefinementTotal(refinement))}</strong></span>`;
    }).join('<span class="equip-auto-summary-separator">·</span>');
    const locationSummary = candidate.location ? `<span class="equip-auto-summary-separator">·</span><span class="equip-auto-location-summary">${escapeAiHtml(candidate.location)}</span>` : '';
    const regionSummary = candidate.region.length
        ? `<span class="equip-auto-region-summary"><span>地区附加</span><strong>${equipAutoFormatProps(candidate.region)}</strong></span>`
        : '<span class="equip-auto-region-summary is-empty">无地区附加</span>';
    const craftSpecialName = String(candidate.craftSpecialName || '').trim();
    const craftSpecialSummary = candidate.special.length
        ? `<span class="equip-auto-special-summary"${craftSpecialName ? ` title="首次打造材料：${escapeAiHtml(craftSpecialName)}"` : ''}><span>首次材料附加${craftSpecialName ? ` · ${escapeAiHtml(craftSpecialName)}` : ''}</span><strong>${equipAutoFormatProps(candidate.special)}</strong></span>`
        : '';
    const totalProps = equipAutoCandidateTotalProps(candidate);
    const totalSummary = `<span class="equip-auto-total-summary" title="最高精炼属性 + 首次材料附加 + 地区附加"><span>总属性</span><strong>${equipAutoFormatProps(totalProps)}</strong></span>`;
    return `<details class="equip-auto-candidate">
        <summary>
            <span class="equip-auto-rating is-${rating.key}" title="精炼评级：${rating.label} ${rating.roundedPercent}%（按三槽理论满值）"><strong>${rating.label}</strong><small>${rating.roundedPercent}%</small></span>
            <span class="equip-auto-candidate-title"><b>${escapeAiHtml(candidate.paperName)} · 第 ${candidate.craftIndex} 次</b><span class="equip-auto-candidate-meta"><span class="equip-auto-equip-summary">${escapeAiHtml(candidate.equipName)}</span>${locationSummary}${targetSummary ? `<span class="equip-auto-summary-separator">·</span>${targetSummary}` : ''}${craftSpecialSummary ? `<span class="equip-auto-summary-separator">·</span>${craftSpecialSummary}` : ''}<span class="equip-auto-summary-separator">·</span>${regionSummary}</span>${totalSummary}</span>
        </summary>
        <div class="equip-auto-candidate-body">
            <div class="equip-auto-detail-grid">
                <div class="equip-auto-detail-card"><strong>装备品质</strong>${Number(candidate.color) === 3 ? '蓝色' : '紫色'} · ${candidate.exts.length} 词条</div>
                <div class="equip-auto-detail-card"><strong>基础属性</strong>${equipAutoFormatBase(candidate.base)}</div>
                <div class="equip-auto-detail-card"><strong>蓝/紫词条</strong>${equipAutoFormatProps(candidate.exts)}</div>
                <div class="equip-auto-detail-card equip-auto-region-card"><strong>地区附加</strong>${equipAutoFormatProps(candidate.region)}</div>
                <div class="equip-auto-detail-card equip-auto-material-cost"><strong>打造消耗</strong>${equipAutoCandidateCostHtml(candidate)}</div>
            </div>
            <p class="ai-visual-heading">精炼属性</p>
            ${candidate.refinements.map(refinement => equipAutoRefinementHtml(refinement, candidate.upgradeCost)).join('')}
            ${equipAutoManualAttachHtml(candidate)}
        </div>
    </details>`;
}

function equipAutoCandidateListHtml(candidates) {
    const sorted = [...(candidates || [])].sort((a, b) => String(a.location).localeCompare(String(b.location), 'zh')
        || String(a.paperName).localeCompare(String(b.paperName), 'zh')
        || (a.craftIndex - b.craftIndex));
    return `<div class="equip-auto-candidate-list">${sorted.map(candidate => equipAutoCandidateHtml(candidate)).join('')}</div>`;
}

function equipAutoResultPaperKey(candidate) {
    return String(candidate && candidate.paperId != null ? candidate.paperId : candidate && candidate.paperName || '');
}

function equipAutoFilteredCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : []).filter(candidate => {
        if (equipAutoResultLocationFilter && String(candidate.location || '') !== equipAutoResultLocationFilter) return false;
        if (equipAutoResultPaperFilter && equipAutoResultPaperKey(candidate) !== equipAutoResultPaperFilter) return false;
        if (equipAutoResultQualityFilter) {
            const candidateQuality = equipAutoCandidateRating(candidate).key;
            if (!equipAutoResultQualityAtLeast && candidateQuality !== equipAutoResultQualityFilter) return false;
            if (equipAutoResultQualityAtLeast) {
                const selectedIndex = EQUIP_AUTO_RATING_LEVELS.findIndex(level => level.key === equipAutoResultQualityFilter);
                const candidateIndex = EQUIP_AUTO_RATING_LEVELS.findIndex(level => level.key === candidateQuality);
                if (selectedIndex < 0 || candidateIndex < 0 || candidateIndex > selectedIndex) return false;
            }
        }
        return true;
    });
}

function equipAutoResultFilterOptionsHtml(candidates) {
    const locations = Array.from(new Set((candidates || []).map(candidate => String(candidate.location || '')).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'zh'));
    const papers = new Map();
    (candidates || []).forEach(candidate => {
        const key = equipAutoResultPaperKey(candidate);
        if (key && !papers.has(key)) papers.set(key, String(candidate.paperName || key));
    });
    const paperEntries = Array.from(papers.entries()).sort((a, b) => a[1].localeCompare(b[1], 'zh'));
    return `<div class="equip-auto-result-filters" aria-label="装备候选筛选">
        <label for="equipAutoResultLocationFilter"><span>地点筛选</span>
            <select id="equipAutoResultLocationFilter">
                <option value="">全部地点</option>
                ${locations.map(location => `<option value="${escapeAiHtml(location)}">${escapeAiHtml(location)}</option>`).join('')}
            </select>
        </label>
        <label for="equipAutoResultPaperFilter"><span>图纸筛选</span>
            <select id="equipAutoResultPaperFilter">
                <option value="">全部图纸</option>
                ${paperEntries.map(([key, name]) => `<option value="${escapeAiHtml(key)}">${escapeAiHtml(name)}</option>`).join('')}
            </select>
        </label>
        <div class="equip-auto-quality-filter">
            <label for="equipAutoResultQualityFilter"><span>品质筛选</span>
                <select id="equipAutoResultQualityFilter">
                    <option value="">全部品质</option>
                    ${[...EQUIP_AUTO_RATING_LEVELS].reverse().map(level => `<option value="${level.key}">${level.label}</option>`).join('')}
                </select>
            </label>
            <label class="equip-auto-quality-at-least" for="equipAutoResultQualityAtLeast" title="同时显示所选品质及更高品质">
                <input id="equipAutoResultQualityAtLeast" type="checkbox">
                <span>及以上</span>
            </label>
        </div>
    </div>`;
}

function equipAutoResultPageData(candidates, requestedPage, requestedPageSize) {
    const items = Array.isArray(candidates) ? candidates : [];
    const parsedPageSize = Number(requestedPageSize);
    const pageSize = EQUIP_AUTO_RESULT_PAGE_SIZES.includes(parsedPageSize) ? parsedPageSize : 30;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(pageCount, Math.max(1, Number.parseInt(requestedPage, 10) || 1));
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, items.length);
    return { page, pageSize, pageCount, start, end, items: items.slice(start, end) };
}

function renderEquipAutoResultPage() {
    if (!equipAutoLastResult || !Array.isArray(equipAutoLastResult.candidates)) return;
    const filteredCandidates = equipAutoFilteredCandidates(equipAutoLastResult.candidates);
    const pageData = equipAutoResultPageData(
        filteredCandidates,
        equipAutoResultPage,
        equipAutoResultPageSize,
    );
    equipAutoResultPage = pageData.page;
    equipAutoResultPageSize = pageData.pageSize;

    const pageInfo = document.getElementById('equipAutoCandidatePageInfo');
    const pageSize = document.getElementById('equipAutoResultPageSize');
    const previous = document.getElementById('btnEquipAutoResultPrev');
    const next = document.getElementById('btnEquipAutoResultNext');
    const heading = document.getElementById('equipAutoCandidatePageHeading');
    const page = document.getElementById('equipAutoCandidatePage');
    const locationFilter = document.getElementById('equipAutoResultLocationFilter');
    const paperFilter = document.getElementById('equipAutoResultPaperFilter');
    const qualityFilter = document.getElementById('equipAutoResultQualityFilter');
    const qualityAtLeast = document.getElementById('equipAutoResultQualityAtLeast');
    const range = pageData.items.length ? `${pageData.start + 1}–${pageData.end}` : '0';
    const totalSuffix = filteredCandidates.length === equipAutoLastResult.candidates.length
        ? ''
        : `（全部 ${equipAutoLastResult.candidates.length} 件）`;

    if (pageInfo) pageInfo.textContent = `第 ${pageData.page}/${pageData.pageCount} 页 · 显示 ${range} / ${filteredCandidates.length} 件${totalSuffix}`;
    if (pageSize) pageSize.value = String(pageData.pageSize);
    if (locationFilter) locationFilter.value = equipAutoResultLocationFilter;
    if (paperFilter) paperFilter.value = equipAutoResultPaperFilter;
    if (qualityFilter) qualityFilter.value = equipAutoResultQualityFilter;
    if (qualityAtLeast) qualityAtLeast.checked = equipAutoResultQualityAtLeast;
    if (previous) previous.disabled = pageData.page <= 1;
    if (next) next.disabled = pageData.page >= pageData.pageCount;
    if (heading) heading.textContent = `筛选结果：${filteredCandidates.length} 件，本页 ${pageData.items.length} 件`;
    if (page) {
        page.innerHTML = pageData.items.length
            ? equipAutoCandidateListHtml(pageData.items)
            : '<div class="ai-result-empty">当前筛选条件下没有候选装备。</div>';
    }
}

function equipAutoCandidateById(candidateId) {
    return (equipAutoLastResult && equipAutoLastResult.candidates || [])
        .find(candidate => String(candidate.id) === String(candidateId));
}

function rerenderEquipAutoManualAttach(candidate, currentElement) {
    if (!candidate || !currentElement) return;
    currentElement.outerHTML = equipAutoManualAttachHtml(candidate);
}

function handleEquipAutoResultClick(event) {
    if (!equipAutoLastResult) return;
    const action = event.target.closest?.('[data-manual-attach-action]');
    if (action) {
        const container = action.closest('.equip-auto-manual-attach[data-candidate-id]');
        const candidate = equipAutoCandidateById(container && container.dataset.candidateId);
        if (!candidate || !candidate.canSimulateSpecialAttach) return;
        const state = equipAutoManualAttachState(candidate);
        if (action.dataset.manualAttachAction === 'stage') {
            state.stage = action.dataset.stage === 'after' ? 'after' : 'before';
            state.result = null;
            state.error = '';
            rerenderEquipAutoManualAttach(candidate, container);
            return;
        }
        if (action.dataset.manualAttachAction === 'simulate') {
            const countInput = container.querySelector('.equip-auto-manual-attach-count');
            let count = Number.parseInt(countInput && countInput.value || String(state.count), 10);
            if (!Number.isFinite(count)) count = 20;
            state.count = Math.max(1, Math.min(5000, count));
            state.error = '';
            try {
                const equip = candidate.specialAttachEquips[state.stage];
                const material = EQUIP_DATA.special[String(candidate.craftSpecialId)];
                state.result = {
                    ...EquipmentAutoOptimizer.predictSpecialAttachSequence(equip, material, state.count),
                    stage: state.stage,
                    equipLevel: equip.need_lv,
                };
            } catch (error) {
                state.result = null;
                state.error = `模拟失败：${error?.message || error}`;
            }
            rerenderEquipAutoManualAttach(candidate, container);
            return;
        }
    }
    if (event.target.id === 'btnEquipAutoResultPrev') equipAutoResultPage -= 1;
    else if (event.target.id === 'btnEquipAutoResultNext') equipAutoResultPage += 1;
    else return;
    renderEquipAutoResultPage();
}

function handleEquipAutoResultControlChange(event) {
    if (event.target.classList?.contains('equip-auto-manual-attach-count')) {
        const container = event.target.closest('.equip-auto-manual-attach[data-candidate-id]');
        const candidate = equipAutoCandidateById(container && container.dataset.candidateId);
        if (!candidate) return;
        const state = equipAutoManualAttachState(candidate);
        let count = Number.parseInt(event.target.value, 10);
        if (!Number.isFinite(count)) count = 20;
        state.count = Math.max(1, Math.min(5000, count));
        state.result = null;
        state.error = '';
        rerenderEquipAutoManualAttach(candidate, container);
        return;
    }
    if (event.target.id === 'equipAutoResultPageSize') {
        equipAutoResultPageSize = Number(event.target.value);
    } else if (event.target.id === 'equipAutoResultLocationFilter') {
        equipAutoResultLocationFilter = String(event.target.value || '');
    } else if (event.target.id === 'equipAutoResultPaperFilter') {
        equipAutoResultPaperFilter = String(event.target.value || '');
    } else if (event.target.id === 'equipAutoResultQualityFilter') {
        equipAutoResultQualityFilter = String(event.target.value || '');
    } else if (event.target.id === 'equipAutoResultQualityAtLeast') {
        equipAutoResultQualityAtLeast = !!event.target.checked;
    } else {
        return;
    }
    equipAutoResultPage = 1;
    renderEquipAutoResultPage();
}

function renderEquipAutoResults(result) {
    const container = document.getElementById('autoEquipResults');
    if (!container) return;
    equipAutoLastResult = result;
    equipAutoResultPage = 1;
    equipAutoResultLocationFilter = '';
    equipAutoResultPaperFilter = '';
    equipAutoResultQualityFilter = '';
    equipAutoResultQualityAtLeast = false;
    equipAutoManualAttachStates = new Map();
    container.dataset.hasResult = 'true';
    if (!result || !result.candidates || !result.candidates.length) {
        const skipped = Number(result && result.summary && result.summary.skippedBranchCount || 0);
        container.innerHTML = `<div class="ai-result-error">当前兼容范围没有打造出蓝装或紫装，请增加打造次数或调整地点、图纸与材料。${skipped ? ` 已跳过 ${skipped} 个属性不兼容分支。` : ''}</div>`;
        return;
    }
    container.innerHTML = `${(result.skippedBranches || []).length ? `<details class="equip-auto-skipped-branches"><summary>查看跳过的 ${result.skippedBranches.length} 个分支</summary>${result.skippedBranches.map(branch => `<div>${escapeAiHtml(branch.location)} · ${escapeAiHtml(branch.paperName)}：${escapeAiHtml(branch.reason)}</div>`).join('')}</details>` : ''}
    <div class="equip-auto-result-toolbar" aria-label="装备候选筛选与数量">
        ${equipAutoResultFilterOptionsHtml(result.candidates)}
        <p id="equipAutoCandidatePageHeading" class="equip-auto-result-count"></p>
    </div>
    <div id="equipAutoCandidatePage"></div>
    <div class="pager-bar equip-auto-result-pager" aria-label="装备候选分页">
        <div class="equip-auto-pager-controls">
            <span id="equipAutoCandidatePageInfo" class="meta-text"></span>
            <button id="btnEquipAutoResultPrev" class="btn equip-auto-pager-button" type="button">上一页</button>
            <button id="btnEquipAutoResultNext" class="btn equip-auto-pager-button" type="button">下一页</button>
            <label class="pager-size" for="equipAutoResultPageSize">每页
                <select id="equipAutoResultPageSize">
                    ${EQUIP_AUTO_RESULT_PAGE_SIZES.map(size => `<option value="${size}" ${size === equipAutoResultPageSize ? 'selected' : ''}>${size}</option>`).join('')}
                </select>
                件
            </label>
        </div>
    </div>`;
    renderEquipAutoResultPage();
}

function setEquipAutoInputsDisabled(disabled) {
    document.querySelectorAll('#autoEquipModePanel input, #autoEquipModePanel select').forEach(element => {
        element.disabled = !!disabled;
    });
}

async function runEquipAutoSimulation() {
    if (equipAutoRunning) return;
    const validation = validateEquipAutoSelection();
    if (!validation.valid) return;
    equipAutoRunning = true;
    equipAutoCancelRequested = false;
    setEquipAutoInputsDisabled(true);
    const runToken = ++equipAutoRunToken;
    const predict = document.getElementById('btnAutoEquipPredict');
    const cancel = document.getElementById('btnAutoEquipCancel');
    const results = document.getElementById('autoEquipResults');
    if (predict) {
        predict.disabled = true;
        predict.textContent = '正在计算装备路线…';
    }
    if (cancel) {
        cancel.hidden = false;
        cancel.disabled = false;
        cancel.textContent = '取消计算';
    }
    if (results) results.innerHTML = '<div class="ai-result-empty">正在按独立存档分支计算打造与精炼结果…</div>';
    renderEquipAutoProgress({ phase: 'craft', done: 0, total: validation.branches.length, message: '正在保存原始打造状态' });
    try {
        const result = await EquipmentAutoOptimizer.simulateEquipmentRoutes({
            data: EQUIP_DATA,
            initialMakeState: validation.makeRnd,
            branches: validation.branches,
            targetProps: Array.from(equipAutoSelectedProperties),
            options: {
                craftCount: clampEquipAutoNumber('autoEquipCraftCount', 1, 5000, 100),
                refineCount: clampEquipAutoNumber('autoEquipRefineCount', 1, 1000, 200),
            },
            bridge: {
                getMakeState: () => wasmMakeGetState(),
                setMakeState: next => {
                    if (!wasmMakeSetState(next)) throw new Error('原始打造状态恢复失败');
                    return true;
                },
                makePreview: (request, count) => wasmMakePreview(request, count),
                xilianPlan: (equip, accepts) => wasmXilianPlan(equip, accepts),
            },
            shouldCancel: () => equipAutoCancelRequested || runToken !== equipAutoRunToken,
            onProgress: progress => {
                if (runToken === equipAutoRunToken) renderEquipAutoProgress(progress);
            },
        });
        if (runToken !== equipAutoRunToken) return;
        if (result.cancelled) {
            if (results) results.innerHTML = '<div class="ai-result-empty">装备计算已取消，原始打造状态已恢复，页面模拟状态未改变。</div>';
            const progress = document.getElementById('autoEquipProgress');
            if (progress) progress.hidden = true;
            return;
        }
        renderEquipAutoProgress({ phase: 'refine', done: 1, total: 1, message: '打造与精炼分析完成' });
        renderEquipAutoResults(result);
    } catch (error) {
        console.error('装备自动模拟失败:', error);
        if (runToken === equipAutoRunToken && results) {
            results.innerHTML = `<div class="ai-result-error">计算失败：${escapeAiHtml(error?.message || error)}</div>`;
        }
        const progress = document.getElementById('autoEquipProgress');
        if (progress) progress.hidden = true;
    } finally {
        if (runToken === equipAutoRunToken) {
            equipAutoRunning = false;
            setEquipAutoInputsDisabled(false);
            if (predict) {
                predict.disabled = false;
                predict.textContent = '重新装备自动模拟';
            }
            if (cancel) cancel.hidden = true;
        }
    }
}

function cancelEquipAutoSimulation() {
    if (!equipAutoRunning) return;
    equipAutoCancelRequested = true;
    const button = document.getElementById('btnAutoEquipCancel');
    const text = document.getElementById('autoEquipProgressText');
    if (button) {
        button.disabled = true;
        button.textContent = '正在停止…';
    }
    if (text) text.textContent = '当前批次结束后停止并恢复原始打造状态…';
}

function jianwangAutoModule() {
    return typeof JianwangAutoOptimizer !== 'undefined' ? JianwangAutoOptimizer : null;
}

function jianwangAutoRouteForId(id) {
    const value = Number(id);
    if (value >= 5710 && value <= 5713) return value;
    if (value >= 5714 && value <= 5717) return value - 4;
    return 0;
}

function jianwangAutoSelectedSword() {
    const select = document.getElementById('autoJianwangStartSword');
    if (!select || !select.value || select.value === '__provider__') return null;
    return jianwangAutoSwords.find(sword => sword.key === select.value) || null;
}

function invalidateJianwangAutoPrediction(message) {
    jianwangAutoLastResult = null;
    if (jianwangAutoRunning) jianwangAutoCancelRequested = true;
    const results = document.getElementById('autoJianwangResults');
    if (results) results.innerHTML = `<div class="ai-result-empty">${escapeAiHtml(message || '配置已变化，请重新开始剑王阁自动模拟。')}</div>`;
    if (!jianwangAutoRunning) {
        const progress = document.getElementById('autoJianwangProgress');
        if (progress) progress.hidden = true;
    }
}

function refreshJianwangAutoTargetProps(preserveSelection = true) {
    const optimizer = jianwangAutoModule();
    const routeSelect = document.getElementById('autoJianwangRoute');
    const propSelect = document.getElementById('autoJianwangTargetProp');
    if (!optimizer || !routeSelect || !propSelect || typeof EQUIP_DATA === 'undefined') return;
    const previous = preserveSelection ? propSelect.value : '';
    const props = optimizer.targetPropertiesForRoute(EQUIP_DATA, Number(routeSelect.value));
    propSelect.innerHTML = '';
    if (!props.length) {
        propSelect.appendChild(new Option('先选择镇派路线', ''));
        propSelect.disabled = true;
        return;
    }
    props.forEach(prop => propSelect.appendChild(new Option(EQUIP_DATA.propNames?.[prop] || prop, prop)));
    propSelect.disabled = false;
    propSelect.value = props.includes(previous) ? previous : props[0];
}

function updateJianwangAutoStartHint() {
    const hint = document.getElementById('autoJianwangStartHint');
    const message = document.getElementById('autoJianwangSelectionMessage');
    const routeId = Number(document.getElementById('autoJianwangRoute')?.value || 0);
    const optimizer = jianwangAutoModule();
    if (!hint || !optimizer) return;
    const sword = jianwangAutoSelectedSword();
    const startSelect = document.getElementById('autoJianwangStartSword');
    if (!sword) {
        if (startSelect?.value === '__provider__' && optimizer.hasFirstSwordProvider()) {
            hint.textContent = '将由已启用的首剑生成接口提供起始剑，再复用同一套升阶、保留、重铸与碎剑搜索。';
            if (message) {
                message.textContent = '';
                message.classList.remove('is-error');
            }
            return;
        }
        hint.textContent = '当前没有可用的剑王阁实物；首剑生成接口已预留，但本版本未启用，也不会猜测第一把剑的序列。';
        if (message) {
            message.textContent = '请先导入含剑王阁实物的存档。';
            message.classList.add('is-error');
        }
        return;
    }
    if (message) {
        message.textContent = '';
        message.classList.remove('is-error');
    }
    const id = Number(sword.id);
    if (id <= 5709) {
        hint.textContent = `从${optimizer.stageName(EQUIP_DATA, sword)}开始，按所选路线逐级升至90级；每一步已有目标词条时都会自动保留。`;
        return;
    }
    if (id >= 5714 && id <= 5717) {
        hint.textContent = '起始实物为100级神兵：直接碎神兵并生成下一把60级剑胚，再按所选路线进入搜索。';
        return;
    }
    const currentRoute = jianwangAutoRouteForId(id);
    if (routeId && currentRoute === routeId) {
        const counts = optimizer.extractReforgeCounts(state.saveData || {});
        const used = Number(counts[String(routeId)] || 0);
        hint.textContent = `起始实物与所选路线一致：先从当前进度继续剩余 ${Math.max(0, optimizer.JIANWANG_REFORGE_LIMIT - used)} 次90级重铸；仍未达成才碎剑进入下一把。`;
    } else {
        hint.textContent = '起始90级实物与所选路线不同：不会消耗这把剑的重铸次数，直接碎剑后从下一把60级剑胚进入所选路线。';
    }
}

function refreshJianwangAutoSwords(preserveSelection = true) {
    const optimizer = jianwangAutoModule();
    const select = document.getElementById('autoJianwangStartSword');
    if (!optimizer || !select || typeof EQUIP_DATA === 'undefined') return;
    const previous = preserveSelection ? select.value : '';
    jianwangAutoSwords = optimizer.collectSwords(state.saveData, EQUIP_DATA);
    select.innerHTML = '';
    if (jianwangAutoSwords.length) {
        jianwangAutoSwords.forEach(sword => select.appendChild(new Option(optimizer.swordLabel(EQUIP_DATA, sword), sword.key)));
        select.disabled = false;
        select.value = jianwangAutoSwords.some(sword => sword.key === previous) ? previous : jianwangAutoSwords[0].key;
    } else if (optimizer.hasFirstSwordProvider()) {
        select.appendChild(new Option('首剑生成接口', '__provider__'));
        select.disabled = false;
        select.value = '__provider__';
    } else {
        select.appendChild(new Option('暂无剑王阁实物', ''));
        select.disabled = true;
    }
    updateJianwangAutoStartHint();
}

function initializeJianwangAutoControls() {
    const optimizer = jianwangAutoModule();
    const routeSelect = document.getElementById('autoJianwangRoute');
    if (!optimizer || !routeSelect || typeof EQUIP_DATA === 'undefined') return;
    routeSelect.innerHTML = '';
    optimizer.routeOptions(EQUIP_DATA).forEach(route => routeSelect.appendChild(new Option(route.name, String(route.id))));
    if (routeSelect.options.length) routeSelect.value = routeSelect.options[0].value;
    refreshJianwangAutoTargetProps(false);
    refreshJianwangAutoSwords(false);
}

function setJianwangAutoInputsDisabled(disabled) {
    ['autoJianwangStartSword', 'autoJianwangRoute', 'autoJianwangTargetProp', 'autoJianwangTargetCount', 'autoJianwangMaxSwords'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.disabled = !!disabled || (id === 'autoJianwangStartSword' && !jianwangAutoSwords.length && !jianwangAutoModule()?.hasFirstSwordProvider());
    });
}

function renderJianwangAutoProgress(progress) {
    const panel = document.getElementById('autoJianwangProgress');
    const text = document.getElementById('autoJianwangProgressText');
    const percent = document.getElementById('autoJianwangProgressPercent');
    const fill = document.getElementById('autoJianwangProgressFill');
    if (!panel) return;
    const total = Math.max(1, Number(progress?.total || 1));
    const done = Math.max(0, Number(progress?.done || 0));
    const value = Math.max(0, Math.min(100, Math.round(done / total * 100)));
    panel.hidden = false;
    if (text) text.textContent = progress?.message || '正在搜索…';
    if (percent) percent.textContent = `${value}%`;
    if (fill) fill.style.width = `${value}%`;
}

function jianwangAutoFormatExt(ext) {
    if (!ext) return '';
    const label = EQUIP_DATA?.propNames?.[ext.prop] || ext.prop || '未知词条';
    return `${escapeAiHtml(label)}+${escapeAiHtml(equipAutoFormatPropValue(ext.prop, ext.value))}`;
}

function jianwangAutoFormatExts(exts) {
    if (!Array.isArray(exts) || !exts.length) return '无';
    return exts.slice(0, 4).map(jianwangAutoFormatExt).join('、');
}

function jianwangAutoStepLabel(step) {
    if (step.type === 'blank') return `碎剑后生成${step.toName || '60级剑胚'}`;
    if (step.type === 'reforge') return `第 ${Number(step.reforgeAttempt || 0)} 次重铸`;
    return `${step.fromName || step.fromId} → ${step.toName || step.toId}`;
}

function renderJianwangAutoResult(result) {
    const container = document.getElementById('autoJianwangResults');
    if (!container) return;
    if (!result) {
        container.innerHTML = '<div class="ai-result-empty">暂无结果。</div>';
        return;
    }
    if (result.status === 'cancelled') {
        const foundText = Number(result.successCount || 0) > 0 ? `、已找到 ${Number(result.successCount).toLocaleString()} 次三同结果` : '';
        container.innerHTML = `<div class="ai-result-empty">已取消计算。已模拟 ${Number(result.metrics?.newSwords || 0).toLocaleString()} 把新剑、重铸 ${Number(result.metrics?.reforges || 0).toLocaleString()} 次${foundText}。</div>`;
        return;
    }
    if (result.status === 'unreachable') {
        container.innerHTML = `<div class="ai-result-error">${escapeAiHtml(result.reason || '当前序列无法达成所选目标。')}</div>`;
        return;
    }
    if (result.status === 'multi-success') {
        const metrics = result.metrics || {};
        const matches = Array.isArray(result.matches) ? result.matches : [];
        const cards = matches.map((match, matchIndex) => {
            const swordText = match.startedFromCurrent ? '当前起始剑' : `第 ${Number(match.swordOrdinal || 0).toLocaleString()} 把新剑`;
            const path = Array.isArray(match.path) ? match.path : [];
            const steps = path.length ? path.map((step, index) => {
                const keepText = step.kept ? `保留 ${jianwangAutoFormatExt(step.kept)}` : '不保留';
                const seedText = step.type === 'blank'
                    ? `RedSeed ${Number(step.redSeedBefore || 0)} → ${Number(step.redSeedAfter || 0)} · 初始 CZSeed ${Number(step.seedAfter || 0)}`
                    : `CZSeed ${Number(step.seedBefore || 0)} → ${Number(step.seedAfter || 0)}`;
                return `<li class="jianwang-auto-path-step">
                    <div class="jianwang-auto-step-head"><b>${index + 1}. ${escapeAiHtml(jianwangAutoStepLabel(step))}</b><span>${keepText}</span></div>
                    <div class="jianwang-auto-step-meta">${escapeAiHtml(seedText)}</div>
                    <div class="jianwang-auto-step-exts">${jianwangAutoFormatExts(step.exts)}</div>
                </li>`;
            }).join('') : '<li class="jianwang-auto-path-step"><div class="jianwang-auto-step-head"><b>起始状态已满足目标</b></div></li>';
            return `<details class="jianwang-auto-path-wrap" ${matchIndex === 0 ? 'open' : ''}>
                <summary><strong>第 ${matchIndex + 1} 次三同</strong> · ${escapeAiHtml(swordText)} · ${escapeAiHtml(match.finalAction || '')}</summary>
                <div class="jianwang-auto-final"><strong>词条</strong><span>${jianwangAutoFormatExts(match.finalEquip?.exts || [])}</span></div>
                <ol class="jianwang-auto-path">${steps}</ol>
            </details>`;
        }).join('');
        container.innerHTML = `<div class="jianwang-auto-summary">
            <div><span class="ai-route-strength">三同结果</span><strong>${escapeAiHtml(result.routeName || '')} · ${escapeAiHtml(result.targetName || '')}</strong></div>
            <p>${escapeAiHtml(result.reason || `找到 ${matches.length} 次三同词条结果`)}</p>
            <p class="jianwang-auto-start-line">起点：${escapeAiHtml(result.startSwordLabel || '')}</p>
        </div>
        <div class="jianwang-auto-metrics">
            <div><b>${Number(matches.length).toLocaleString()}</b><span>三同结果</span></div>
            <div><b>${Number(metrics.newSwords || 0).toLocaleString()}</b><span>新剑把数</span></div>
            <div><b>${Number(metrics.shatter90 || 0).toLocaleString()}</b><span>碎90</span></div>
            <div><b>${Number(metrics.shatter100 || 0).toLocaleString()}</b><span>碎100</span></div>
            <div><b>${Number(metrics.grows || 0).toLocaleString()}</b><span>升阶</span></div>
            <div><b>${Number(metrics.reforges || 0).toLocaleString()}</b><span>重铸</span></div>
            <div><b>${Number(metrics.keeps || 0).toLocaleString()}</b><span>保留</span></div>
        </div>
        <div class="jianwang-auto-path-wrap"><h3>三同命中记录（最多 ${Number(result.successLimit || 10)} 次）</h3></div>
        ${cards}`;
        return;
    }
    if (result.status === 'limit') {
        const metrics = result.metrics || {};
        container.innerHTML = `<div class="jianwang-auto-summary is-limit">
            <strong>${escapeAiHtml(result.reason || '已达到最大模拟次数')}</strong>
            <span>碎90：${Number(metrics.shatter90 || 0).toLocaleString()} · 碎100：${Number(metrics.shatter100 || 0).toLocaleString()} · 升阶：${Number(metrics.grows || 0).toLocaleString()} · 重铸：${Number(metrics.reforges || 0).toLocaleString()} · 保留：${Number(metrics.keeps || 0).toLocaleString()}</span>
        </div>`;
        return;
    }
    if (result.status !== 'success') {
        container.innerHTML = `<div class="ai-result-error">${escapeAiHtml(result.reason || '计算未返回可用结果。')}</div>`;
        return;
    }
    const metrics = result.metrics || {};
    const targetCount = Number(result.targetCount || 4) === 3 ? 3 : 4;
    const swordText = result.startedFromCurrent ? '当前起始剑' : `第 ${Number(result.swordOrdinal || 0).toLocaleString()} 把新剑`;
    const finalExts = jianwangAutoFormatExts(result.finalEquip?.exts || []);
    const path = Array.isArray(result.path) ? result.path : [];
    const steps = path.length ? path.map((step, index) => {
        const keepText = step.kept
            ? `保留 ${jianwangAutoFormatExt(step.kept)}`
            : '不保留';
        const seedText = step.type === 'blank'
            ? `RedSeed ${Number(step.redSeedBefore || 0)} → ${Number(step.redSeedAfter || 0)} · 初始 CZSeed ${Number(step.seedAfter || 0)}`
            : `CZSeed ${Number(step.seedBefore || 0)} → ${Number(step.seedAfter || 0)}`;
        return `<li class="jianwang-auto-path-step">
            <div class="jianwang-auto-step-head"><b>${index + 1}. ${escapeAiHtml(jianwangAutoStepLabel(step))}</b><span>${keepText}</span></div>
            <div class="jianwang-auto-step-meta">${escapeAiHtml(seedText)}</div>
            <div class="jianwang-auto-step-exts">${jianwangAutoFormatExts(step.exts)}</div>
        </li>`;
    }).join('') : '<li class="jianwang-auto-path-step"><div class="jianwang-auto-step-head"><b>起始状态已满足目标</b></div></li>';
    container.innerHTML = `<div class="jianwang-auto-summary">
        <div><span class="ai-route-strength">找到结果</span><strong>${escapeAiHtml(result.routeName || '')} · ${targetCount}条${escapeAiHtml(result.targetName || '')}</strong></div>
        <p>${escapeAiHtml(swordText)}达成 · ${escapeAiHtml(result.finalAction || '')}</p>
        <p class="jianwang-auto-start-line">起点：${escapeAiHtml(result.startSwordLabel || '')}</p>
    </div>
    <div class="jianwang-auto-metrics">
        <div><b>${Number(metrics.newSwords || 0).toLocaleString()}</b><span>新剑把数</span></div>
        <div><b>${Number(metrics.shatter90 || 0).toLocaleString()}</b><span>碎90</span></div>
        <div><b>${Number(metrics.shatter100 || 0).toLocaleString()}</b><span>碎100</span></div>
        <div><b>${Number(metrics.grows || 0).toLocaleString()}</b><span>升阶</span></div>
        <div><b>${Number(metrics.reforges || 0).toLocaleString()}</b><span>重铸</span></div>
        <div><b>${Number(metrics.keeps || 0).toLocaleString()}</b><span>保留</span></div>
    </div>
    <div class="jianwang-auto-final"><strong>最终词条</strong><span>${finalExts}</span></div>
    <div class="jianwang-auto-path-wrap">
        <h3>成功剑详细流程</h3>
        <ol class="jianwang-auto-path">${steps}</ol>
    </div>`;
}

function validateJianwangAutoSelection() {
    const optimizer = jianwangAutoModule();
    if (!optimizer) throw new Error('剑王阁自动模拟模块未加载');
    if (!state.saveData) throw new Error('请先导入存档');
    const routeId = Number(document.getElementById('autoJianwangRoute')?.value || 0);
    const targetProp = String(document.getElementById('autoJianwangTargetProp')?.value || '');
    const targetCount = Number(document.getElementById('autoJianwangTargetCount')?.value || 4);
    const maxSwords = clampAiNumber('autoJianwangMaxSwords', 1, optimizer.MAX_SIMULATED_SWORDS, 500);
    if (!routeId) throw new Error('请选择90级镇派路线');
    if (!targetProp) throw new Error('请选择目标词条');
    if (targetCount !== 3 && targetCount !== 4) throw new Error('请选择三同词条或四同词条');
    const select = document.getElementById('autoJianwangStartSword');
    if (!select?.value && !optimizer.hasFirstSwordProvider()) throw new Error('请选择起始剑');
    return {
        saveData: state.saveData,
        equipData: EQUIP_DATA,
        startSwordKey: select?.value === '__provider__' ? null : select?.value,
        routeId,
        targetProp,
        targetCount,
        maxSwords,
    };
}

async function runJianwangAutoSimulation() {
    if (jianwangAutoRunning) return;
    const message = document.getElementById('autoJianwangSelectionMessage');
    const predict = document.getElementById('btnAutoJianwangPredict');
    const cancel = document.getElementById('btnAutoJianwangCancel');
    let input;
    try {
        input = validateJianwangAutoSelection();
    } catch (error) {
        if (message) {
            message.textContent = error?.message || String(error);
            message.classList.add('is-error');
        }
        return;
    }
    if (message) {
        message.textContent = '';
        message.classList.remove('is-error');
    }
    jianwangAutoRunning = true;
    jianwangAutoCancelRequested = false;
    const runToken = ++jianwangAutoRunToken;
    setJianwangAutoInputsDisabled(true);
    if (predict) {
        predict.disabled = true;
        predict.textContent = '正在搜索…';
    }
    if (cancel) {
        cancel.hidden = false;
        cancel.disabled = false;
        cancel.textContent = '取消计算';
    }
    renderJianwangAutoProgress({ done: 0, total: input.maxSwords, message: '正在检查起始剑并准备搜索…' });
    const results = document.getElementById('autoJianwangResults');
    if (results) results.innerHTML = '<div class="ai-result-empty">正在本地推演，失败剑只累计次数，不会全部保存在页面中。</div>';
    try {
        const result = await JianwangAutoOptimizer.searchAsync({
            ...input,
            saveVersion: state.saveVersion || '',
            saveChannel: state.saveChannel || '',
            batchSize: 40,
            shouldCancel: () => jianwangAutoCancelRequested || runToken !== jianwangAutoRunToken,
            onProgress: progress => {
                if (runToken === jianwangAutoRunToken) renderJianwangAutoProgress(progress);
            },
        });
        if (runToken !== jianwangAutoRunToken) return;
        jianwangAutoLastResult = result;
        renderJianwangAutoResult(result);
        const progress = document.getElementById('autoJianwangProgress');
        if (progress && result.status !== 'limit') progress.hidden = true;
    } catch (error) {
        console.error('剑王阁自动模拟失败:', error);
        if (runToken === jianwangAutoRunToken && results) {
            results.innerHTML = `<div class="ai-result-error">计算失败：${escapeAiHtml(error?.message || error)}</div>`;
        }
        const progress = document.getElementById('autoJianwangProgress');
        if (progress) progress.hidden = true;
    } finally {
        if (runToken === jianwangAutoRunToken) {
            jianwangAutoRunning = false;
            setJianwangAutoInputsDisabled(false);
            if (predict) {
                predict.disabled = false;
                predict.textContent = '重新剑王阁自动模拟';
            }
            if (cancel) {
                cancel.hidden = true;
                cancel.disabled = false;
                cancel.textContent = '取消计算';
            }
        }
    }
}

function cancelJianwangAutoSimulation() {
    if (!jianwangAutoRunning) return;
    jianwangAutoCancelRequested = true;
    const button = document.getElementById('btnAutoJianwangCancel');
    const text = document.getElementById('autoJianwangProgressText');
    if (button) {
        button.disabled = true;
        button.textContent = '正在停止…';
    }
    if (text) text.textContent = '当前剑计算结束后停止…';
}

window.refreshJianwangAutoStartSwords = refreshJianwangAutoSwords;

function applySimulatorView() {
    const isAutoView = window.YYJH_SIMULATOR_VIEW === 'auto'
        || new URLSearchParams(window.location.search).get('view') === 'auto';
    const root = document.documentElement;
    const pageTitle = document.getElementById('simulatorPageTitle');
    const pageSubtitle = document.getElementById('simulatorPageSubtitle');
    const washNav = document.getElementById('navWashSimulator');
    const autoNav = document.getElementById('navAutoSimulator');

    root.classList.toggle('auto-simulator-view', isAutoView);
    if (pageTitle) pageTitle.textContent = isAutoView ? '自动模拟' : '洗髓模拟器';
    if (pageSubtitle) pageSubtitle.textContent = isAutoView ? '烟雨江湖 · 本地存档模拟' : '烟雨江湖 · 天赋洗炼';
    document.title = isAutoView ? '烟雨江湖 · 自动模拟' : '烟雨江湖 · 洗髓模拟器';

    [washNav, autoNav].forEach(link => {
        if (!link) return;
        link.classList.remove('active');
        link.removeAttribute('aria-current');
    });
    const activeNav = isAutoView ? autoNav : washNav;
    if (activeNav) {
        activeNav.classList.add('active');
        activeNav.setAttribute('aria-current', 'page');
    }
    return isAutoView;
}

async function initApp() {
    applySimulatorView();

    const impEl = document.getElementById('saveFileInput');
    if (impEl) impEl.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleSaveFileImport(e.target.files[0]);
        }
    });

    if (typeof markNavTransition === 'function') {
        document.querySelectorAll('header a[href*=".html"]').forEach(a => {
            a.addEventListener('click', () => markNavTransition());
        });
    }

    const ok = await initWasm();
    if (!ok) {
        alert('WebAssembly 模块加载失败：洗髓/预测功能不可用（存档导入与解密不受影响）');
        return;
    }

    wasmInitEngine(TALENT_DATA, _buildZZDataForWasm());
    if (typeof EQUIP_DATA !== 'undefined' && !wasmMakeInitTables(EQUIP_DATA)) {
        console.error('装备表注入失败，装备自动模拟不可用');
        const message = document.getElementById('autoEquipSelectionMessage');
        if (message) {
            message.textContent = '装备表注入失败，装备自动模拟不可用。';
            message.classList.add('is-error');
        }
    }
    initializeEquipAutoControls();
    initializeJianwangAutoControls();

    const dlcCheck = document.getElementById('dlcModeCheck');
    if (dlcCheck) {
        dlcCheck.checked = !!state.dlcMode;
        dlcCheck.addEventListener('change', () => applyDlcMode(dlcCheck.checked));
    }

    if (typeof loadShareStore === 'function') {
        const shared = loadShareStore();
        if (shared && shared.data) {
            try {
                state.saveVersion = shared.meta.version || '';
                state.saveChannel = shared.meta.channel || (shared.meta.platform === 'oversea' ? '国际服' : '');
                state.savePlatform = shared.meta.platform || '';
                state.saveFormat = shared.meta.format || 'json';
                state.saveColumns = shared.meta.columns || null;
                state.saveRow = shared.meta.row || null;
                if (typeof _applyDlcByPlatform === 'function') _applyDlcByPlatform(shared.meta.platform);
                loadParsedSaveData(shared.data, true);
            } catch (e) {
                console.warn('自动加载共享存档失败:', e);
            }
        }
    }

    document.getElementById('btnWashOnce').addEventListener('click', washOnce);
    document.getElementById('btnWash10').addEventListener('click', () => washMulti(10));
    document.getElementById('btnWash100').addEventListener('click', () => washMulti(100));
    document.getElementById('btnWashUntilGold').addEventListener('click', washUntilGold);
    document.getElementById('btnClearLog').addEventListener('click', clearLog);
    const btnExport = document.getElementById('btnExportLog');
    if (btnExport) btnExport.addEventListener('click', exportWashHistory);

    document.getElementById('btnHistoryPrev')?.addEventListener('click', () => {
        if (historyPage > 1) {
            historyPage -= 1;
            renderHistoryPage();
        }
    });
    document.getElementById('btnHistoryNext')?.addEventListener('click', () => {
        historyPage += 1;
        renderHistoryPage();
    });
    document.getElementById('historyPageSize')?.addEventListener('change', () => {
        historyPage = 1;
        renderHistoryPage();
    });

    const btnWashCustom = document.getElementById('btnWashCustom');
    if (btnWashCustom) btnWashCustom.addEventListener('click', washCustom);

    const customWashInput = document.getElementById('customWashInput');
    if (customWashInput) {
        customWashInput.addEventListener('input', (e) => {
            const numSpan = document.getElementById('customWashNum');
            if (numSpan) numSpan.textContent = e.target.value || '500';
        });
    }

    const btnExchangeSequenceFinder = document.getElementById('btnExchangeSequenceFinder');
    if (btnExchangeSequenceFinder) btnExchangeSequenceFinder.addEventListener('click', openExchangeSequenceFinderModal);

    const btnCloseExchangeSequenceModal = document.getElementById('btnCloseExchangeSequenceModal');
    if (btnCloseExchangeSequenceModal) btnCloseExchangeSequenceModal.addEventListener('click', closeExchangeSequenceFinderModal);

    const exchangeSequenceModal = document.getElementById('exchangeSequenceModal');
    if (exchangeSequenceModal) {
        exchangeSequenceModal.addEventListener('click', (event) => {
            if (event.target === exchangeSequenceModal) closeExchangeSequenceFinderModal();
        });
    }

    document.getElementById('exchangeSequenceRoleSelect')?.addEventListener('change', () => {
        void populateExchangeSequencePurples();
    });
    document.getElementById('exchangeSequencePurpleSelect')?.addEventListener('change', () => {
        clearExchangeSequenceResults();
        updateExchangeSequenceSelection();
    });
    document.getElementById('btnGenerateExchangeSequence')?.addEventListener('click', generateExchangeSequence);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && exchangeSequenceModal && !exchangeSequenceModal.hidden) {
            closeExchangeSequenceFinderModal();
        }
    });

    const btnAnalyzePurple = document.getElementById('btnAnalyzePurple');
    if (btnAnalyzePurple) btnAnalyzePurple.addEventListener('click', openPurpleAnalysisModal);

    const btnClosePurpleModal = document.getElementById('btnClosePurpleModal');
    if (btnClosePurpleModal) btnClosePurpleModal.addEventListener('click', closePurpleAnalysisModal);

    const purpleModal = document.getElementById('purpleModal');
    if (purpleModal) {
        purpleModal.addEventListener('click', (e) => {
            if (e.target === purpleModal) closePurpleAnalysisModal();
        });
    }

    const btnRefreshPurple = document.getElementById('btnRefreshPurpleAnalysis');
    if (btnRefreshPurple) {
        btnRefreshPurple.addEventListener('click', () => {
            invalidatePurpleCache();
            ensurePurpleSequenceCache({ force: true });
            paintPurpleForecastTable();
            renderExchangeAnalysisBlock();
        });
    }

    const btnLoadMore = document.getElementById('btnLoadMoreSequence');
    if (btnLoadMore) btnLoadMore.addEventListener('click', loadMoreSequence);

    const repaintFilters = () => paintPurpleForecastTable();
    const purpleSearch = document.getElementById('purpleSearchInput');
    if (purpleSearch) purpleSearch.addEventListener('input', repaintFilters);

    const filterEx = document.getElementById('filterExchangeOnly');
    if (filterEx) filterEx.addEventListener('change', repaintFilters);

    const filterPit = document.getElementById('filterPityOnly');
    if (filterPit) filterPit.addEventListener('change', repaintFilters);

    const btnFindNextConflict = document.getElementById('btnFindNextConflict');
    if (btnFindNextConflict) {
        btnFindNextConflict.addEventListener('click', () => {
            const after = parseInt(document.getElementById('nextConflictAfterWash')?.value || '0', 10);
            findAndShowNextConflict(Number.isNaN(after) ? 0 : after);
        });
    }
    const btnNextFromCurrent = document.getElementById('btnNextConflictFromCurrent');
    if (btnNextFromCurrent) {
        btnNextFromCurrent.addEventListener('click', () => {
            findAndShowNextConflict(state.totalTalentBars || 0);
        });
    }

    document.getElementById('aiTalentSearch')?.addEventListener('input', filterAiTalentChoices);
    document.getElementById('autoWashRoleSelect')?.addEventListener('change', event => selectAutoWashRole(event.target.value));
    document.getElementById('autoWashVipSelect')?.addEventListener('change', onVipChange);
    document.getElementById('btnAiPredict')?.addEventListener('click', runAiPrediction);
    document.getElementById('btnAiCommonTriple')?.addEventListener('click', () => { void runAiCommonTriplePlan(); });
    document.getElementById('btnAiCancel')?.addEventListener('click', cancelAiPrediction);
    document.getElementById('btnAutoWashMode')?.addEventListener('click', () => setAutoSimulatorMode('wash'));
    document.getElementById('btnAutoEquipMode')?.addEventListener('click', () => setAutoSimulatorMode('equip'));
    document.getElementById('btnAutoJianwangMode')?.addEventListener('click', () => setAutoSimulatorMode('jianwang'));
    document.getElementById('autoJianwangStartSword')?.addEventListener('change', () => {
        invalidateJianwangAutoPrediction('起始剑已变化，请重新开始剑王阁自动模拟。');
        updateJianwangAutoStartHint();
    });
    document.getElementById('autoJianwangRoute')?.addEventListener('change', () => {
        refreshJianwangAutoTargetProps(false);
        invalidateJianwangAutoPrediction('镇派路线已变化，请重新开始剑王阁自动模拟。');
        updateJianwangAutoStartHint();
    });
    document.getElementById('autoJianwangTargetProp')?.addEventListener('change', () => invalidateJianwangAutoPrediction('目标词条已变化，请重新开始剑王阁自动模拟。'));
    document.getElementById('autoJianwangTargetCount')?.addEventListener('change', () => invalidateJianwangAutoPrediction('同词条目标已变化，请重新开始剑王阁自动模拟。'));
    document.getElementById('autoJianwangMaxSwords')?.addEventListener('change', () => invalidateJianwangAutoPrediction('最大模拟次数已变化，请重新开始剑王阁自动模拟。'));
    document.getElementById('btnAutoJianwangPredict')?.addEventListener('click', runJianwangAutoSimulation);
    document.getElementById('btnAutoJianwangCancel')?.addEventListener('click', cancelJianwangAutoSimulation);
    document.getElementById('autoEquipLocationChoices')?.addEventListener('change', handleEquipAutoLocationClick);
    document.getElementById('autoEquipPaperChoices')?.addEventListener('change', handleEquipAutoPaperChange);
    document.getElementById('autoEquipPaperChoices')?.addEventListener('click', handleEquipAutoPaperClick);
    document.getElementById('autoEquipPaperSearch')?.addEventListener('input', filterEquipAutoPapers);
    document.getElementById('autoEquipPropertyChoices')?.addEventListener('change', handleEquipAutoPropertyClick);
    document.getElementById('btnAutoEquipPredict')?.addEventListener('click', runEquipAutoSimulation);
    document.getElementById('btnAutoEquipCancel')?.addEventListener('click', cancelEquipAutoSimulation);
    document.getElementById('autoEquipResults')?.addEventListener('click', handleEquipAutoResultClick);
    document.getElementById('autoEquipResults')?.addEventListener('change', handleEquipAutoResultControlChange);
    ['autoEquipCraftCount', 'autoEquipRefineCount'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => invalidateEquipAutoPrediction('模拟次数已变化，请重新开始装备自动模拟。'));
    });

    document.getElementById('modeSelect').addEventListener('change', onModeChange);
    document.getElementById('seedInput').addEventListener('change', onSeedChange);
    const luckSeedEl = document.getElementById('luckSeedInput');
    if (luckSeedEl) luckSeedEl.addEventListener('change', onLuckSeedChange);
    document.getElementById('roleIdInput').addEventListener('change', onRoleIdChange);
    document.getElementById('saltInput').addEventListener('change', onSaltChange);

    document.getElementById('saveRoleSelect').addEventListener('change', (e) => {
        selectRoleFromSave(e.target.value);
    });

    document.getElementById('zizhiSelect').addEventListener('change', onZizhiChange);
    document.getElementById('sexSelect').addEventListener('change', onSexChange);
    document.getElementById('vipSelect').addEventListener('change', onVipChange);
    document.getElementById('btnUpgradeZiZhi').addEventListener('click', upgradeZiZhi);

    renderTalents();
    renderAptitudePanel();
    renderStats();
    renderPityBar();
    renderCostInfo();
    syncVipControls();
    renderAiTalentChoices();
    renderAutoWashSaveGate();
}

document.addEventListener('DOMContentLoaded', initApp);
setTimeout(function () { if (typeof prewarmSql === 'function') prewarmSql(); }, 200);
