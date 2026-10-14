(function () {
    'use strict';

    function renderHomeState(data) {
        var shared = data ? { data: data } : (typeof loadShareStore === 'function' ? loadShareStore() : null);
        var hasSave = !!(shared && shared.data);
        var status = document.getElementById('homeSaveStatus');
        var mainRole = document.getElementById('homeMainRole');
        if (status) status.textContent = hasSave ? '导入成功' : '未导入';
        if (mainRole) {
            mainRole.textContent = hasSave && typeof getArchiveMainRoleName === 'function'
                ? getArchiveMainRoleName(shared.data)
                : '—';
        }
        return hasSave;
    }

    function setMessage(message, isError) {
        var element = document.getElementById('homeImportMessage');
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', !!isError);
        element.classList.toggle('is-success', !isError && message === '导入成功');
    }

    async function handleImport(file) {
        if (!file) return;
        if (typeof _importFeedback === 'function') _importFeedback(true);
        setMessage('正在解析存档…', false);
        try {
            var result = await decryptSaveFile(file);
            if (typeof saveShareStore !== 'function' || !saveShareStore(result.data, {
                version: result.version,
                platform: result.platform,
                channel: result.channel || (String(result.platform || '').toLowerCase() === 'oversea' ? '国际服' : ''),
                format: result.format || 'json',
                columns: result.columns || null,
                row: result.row || null,
                fileName: file.name || '',
                fileLastModified: Number(file.lastModified) || null,
                importedAt: Date.now()
            })) {
                throw new Error('浏览器无法保存存档，请检查本地存储权限或剩余空间');
            }
            renderHomeState(result.data);
            setMessage('导入成功', false);
        } catch (error) {
            // Keep the parser's actionable stage/version message visible.
            // textContent in setMessage also prevents file-derived HTML rendering.
            setMessage(error && typeof error.message === 'string' && error.message.trim()
                ? error.message : '存档导入失败，请检查文件是否完整且未改名', true);
        } finally {
            if (typeof _importFeedback === 'function') _importFeedback(false);
        }
    }

    function initializeHome() {
        renderHomeState();
        var input = document.getElementById('saveFileInput');
        if (input) input.addEventListener('change', function (event) {
            var file = event.target.files && event.target.files[0];
            handleImport(file);
            event.target.value = '';
        });
        var resetButton = document.getElementById('btnResetWebsite');
        if (resetButton) resetButton.addEventListener('click', function () {
            if (typeof clearWebsiteState === 'function') clearWebsiteState();
            renderHomeState();
            setMessage('重置成功', false);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHome);
    } else {
        initializeHome();
    }
    setTimeout(function () {
        if (typeof prewarmSql === 'function') prewarmSql();
    }, 200);
})();
