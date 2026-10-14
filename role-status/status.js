(function () {
    'use strict';

    var saveData = null;
    var saveRoles = [];
    var currentKey = '';
    var currentEvaluation = [];
    var currentEntry = null;

    var STATUS_LABELS = {
        full: '已满',
        progress: '进行中',
        'not-started': '未开始',
        unknown: '无法判断',
        active: '任职中'
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : (fallback == null ? 0 : fallback);
    }

    function asList(value) {
        if (Array.isArray(value)) return value;
        return value && typeof value === 'object' ? Object.values(value) : [];
    }

    function saveRoot(value) {
        return Array.isArray(value) ? (value[0] || {}) : (value || {});
    }

    function collectSaveRoles(value) {
        var source = saveRoot(value);
        var result = [];
        var seen = new Set();

        function add(tag, role, prefix) {
            if (!role || typeof role !== 'object' || role.ID == null) return;
            var key = prefix + ':' + role.ID;
            if (seen.has(key)) return;
            seen.add(key);
            result.push({ key: key, tag: tag, role: role });
        }

        add('主角', source.MainRole, 'main');
        asList(source.Roles).forEach(function (role) { add('随从', role, 'role'); });
        asList(source.Leavers).forEach(function (role) { add('离队', role, 'leave'); });
        return result;
    }

    function scopeLabel(scope) {
        if (scope === 'main') return '仅主角';
        if (scope === 'shared') return '全队共享';
        return '当前角色';
    }

    function renderMetrics(metrics) {
        if (!Array.isArray(metrics) || !metrics.length) return '';
        return '<div class="role-status-metrics">' + metrics.map(function (metric) {
            var known = metric.current != null;
            var current = known ? Math.max(0, Math.min(metric.max, number(metric.current))) : null;
            var percent = known ? Math.max(0, Math.min(100, current / Math.max(1, metric.max) * 100)) : 0;
            return '<div class="role-status-metric">' +
                '<div><span>' + escapeHtml(metric.label) + '</span><strong>' +
                (known ? current + ' / ' + metric.max : '— / ' + metric.max) +
                '</strong></div><div class="role-status-track mini"><i style="width:' + percent + '%"></i></div></div>';
        }).join('') + '</div>';
    }

    function renderProgress(entry) {
        if (entry.metrics) return renderMetrics(entry.metrics);
        if (entry.currentText) return '<div class="role-status-current">' + escapeHtml(entry.currentText) + '</div>';
        if (entry.current == null) return '<div class="role-status-unknown">存档未记录可确认的进度</div>';

        var max = Math.max(1, number(entry.max, 1));
        var current = Math.max(0, Math.min(max, number(entry.current)));
        var percent = Math.max(0, Math.min(100, current / max * 100));
        var unit = entry.unit ? ' ' + escapeHtml(entry.unit) : '';
        var prefix = entry.progressKind === 'uses' ? '已使用 ' : '已累计 ';
        var remaining = entry.progressKind === 'uses' ? '还可使用 ' : '距离上限 ';
        return '<div class="role-status-progress-row"><strong>' + prefix + current + ' / ' + max + unit +
            '</strong><span>' + remaining + Math.max(0, max - current) + unit + '</span></div>' +
            '<div class="role-status-track" aria-label="进度 ' + Math.round(percent) + '%"><i style="width:' + percent + '%"></i></div>';
    }

    function renderGains(gains) {
        if (!Array.isArray(gains) || !gains.length) return '';
        return '<div class="role-status-gains"><span>确定属性增量</span><div>' + gains.map(function (gain) {
            return '<strong>' + escapeHtml(gain.label) + ' +' + number(gain.current) + ' / +' + number(gain.max) + '</strong>';
        }).join(' ') + '</div></div>';
    }

    function renderRules(rules) {
        if (!Array.isArray(rules) || !rules.length) return '';
        return '<details class="role-status-rules"><summary>查看全部职务收益与上限</summary>' +
            '<div class="role-status-rule-grid">' + rules.map(function (rule) {
                return '<div><strong>' + escapeHtml(rule.name) + '</strong><span>' + escapeHtml(rule.effect) +
                    '</span><small>' + escapeHtml(rule.limits) + '</small></div>';
            }).join('') + '</div></details>';
    }

    function renderCard(entry) {
        return '<article class="role-status-card is-' + escapeHtml(entry.status) + '">' +
            '<div class="role-status-card-head"><div><h4>' + escapeHtml(entry.name) + '</h4>' +
            '<span class="role-status-scope">' + escapeHtml(scopeLabel(entry.scope)) + '</span></div>' +
            '<span class="role-status-badge">' + escapeHtml(STATUS_LABELS[entry.status] || '未开始') + '</span></div>' +
            '<p>' + escapeHtml(entry.detail || '—') + '</p>' + renderProgress(entry) +
            renderGains(entry.gains) + renderRules(entry.rules) + '</article>';
    }

    function renderRole(entry) {
        var empty = document.getElementById('roleStatusEmpty');
        var panel = document.getElementById('roleStatusPanel');
        if (!entry) {
            currentEntry = null;
            currentEvaluation = [];
            empty.hidden = false;
            panel.hidden = true;
            return;
        }

        currentEntry = entry;
        empty.hidden = true;
        panel.hidden = false;
        document.getElementById('roleStatusName').textContent = entry.role.Name || '无名';
        document.getElementById('roleStatusTag').textContent = entry.tag + ' · ID ' + entry.role.ID;

        currentEvaluation = window.RoleStatusData.evaluate(saveData, entry.role, entry.tag);
        var entries = currentEvaluation.flatMap(function (group) { return group.entries || []; });
        var counts = { full: 0, progress: 0, active: 0, 'not-started': 0, unknown: 0 };
        entries.forEach(function (item) { counts[item.status] = (counts[item.status] || 0) + 1; });

        document.getElementById('roleStatusSummary').innerHTML = [
            ['已满', counts.full],
            ['进行中', counts.progress + counts.active],
            ['未开始', counts['not-started']],
            ['无法判断', counts.unknown]
        ].map(function (item) {
            return '<div><span>' + item[0] + '</span><strong>' + item[1] + '</strong></div>';
        }).join('');

        document.getElementById('roleStatus').innerHTML = currentEvaluation.map(function (group) {
            return '<section class="history-panel role-status-group"><div class="role-status-group-head">' +
                '<h3>' + escapeHtml(group.name) + '</h3><span>' + escapeHtml(group.note || '') + '</span></div>' +
                '<div class="role-status-card-grid">' + group.entries.map(renderCard).join('') + '</div></section>';
        }).join('');
    }

    function renderRoleOptions(filter) {
        var select = document.getElementById('roleSelect');
        var query = String(filter || '').trim().toLowerCase();
        var remembered = currentKey || select.value;
        var list = saveRoles.filter(function (entry) {
            if (!query) return true;
            var haystack = [entry.tag, entry.role.Name || '', entry.role.ID, entry.key].join(' ').toLowerCase();
            return haystack.indexOf(query) >= 0;
        });

        select.innerHTML = '';
        if (!list.length) {
            select.innerHTML = '<option value="">（无匹配角色）</option>';
            renderRole(null);
            return;
        }

        list.forEach(function (entry) {
            var option = document.createElement('option');
            option.value = entry.key;
            option.textContent = entry.tag + ' · ' + (entry.role.Name || '无名') + ' · Lv' + number(entry.role.Level);
            select.appendChild(option);
        });
        var selected = list.find(function (entry) { return entry.key === remembered; }) || list[0];
        select.value = selected.key;
        currentKey = selected.key;
        renderRole(selected);
    }

    function csvCell(value) {
        var text = String(value == null ? '' : value);
        return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function progressText(entry) {
        if (entry.metrics) {
            return entry.metrics.map(function (metric) {
                return metric.label + ' ' + (metric.current == null ? '—' : metric.current) + '/' + metric.max;
            }).join('；');
        }
        if (entry.currentText) return entry.currentText;
        if (entry.current == null) return '存档未记录';
        return entry.current + '/' + entry.max + (entry.unit ? ' ' + entry.unit : '');
    }

    function gainsText(entry) {
        if (!Array.isArray(entry.gains)) return '';
        return entry.gains.map(function (gain) {
            return gain.label + ' +' + number(gain.current) + '/+' + number(gain.max);
        }).join('；');
    }

    function exportCurrentRole() {
        if (!currentEntry || !currentEvaluation.length) {
            window.alert('无角色状态可以导出');
            return;
        }
        var rows = [['分组', '培养来源', '范围', '状态', '当前进度', '说明', '确定属性增量']];
        currentEvaluation.forEach(function (group) {
            group.entries.forEach(function (entry) {
                rows.push([
                    group.name,
                    entry.name,
                    scopeLabel(entry.scope),
                    STATUS_LABELS[entry.status] || entry.status,
                    progressText(entry),
                    entry.detail || '',
                    gainsText(entry)
                ]);
            });
        });
        var csv = '\uFEFF' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        var safeName = String(currentEntry.role.Name || '角色').replace(/[\\/:*?"<>|]/g, '_');
        link.href = url;
        link.download = safeName + '-角色状态.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }

    function initialize() {
        var shared = typeof loadShareStore === 'function' ? loadShareStore() : null;
        saveData = shared && shared.data ? shared.data : null;
        if (typeof window.renderArchiveState === 'function') window.renderArchiveState(saveData);
        if (!saveData) return;

        saveRoles = collectSaveRoles(saveData);
        if (!saveRoles.length) {
            document.getElementById('roleStatusEmpty').textContent = '存档中未找到角色（MainRole / Roles / Leavers）';
            return;
        }

        document.getElementById('roleSelectRow').hidden = false;
        currentKey = (saveRoles.find(function (entry) { return entry.tag === '主角'; }) || saveRoles[0]).key;
        renderRoleOptions('');

        document.getElementById('roleSelect').addEventListener('change', function (event) {
            currentKey = event.target.value;
            renderRole(saveRoles.find(function (entry) { return entry.key === currentKey; }) || null);
        });
        document.getElementById('roleFilter').addEventListener('input', function (event) {
            renderRoleOptions(event.target.value);
        });
    }

    document.getElementById('btnExportTable').addEventListener('click', exportCurrentRole);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
