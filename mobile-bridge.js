(function () {
  'use strict';
  if (typeof LocalStars === 'undefined') return;
  const report = message => LocalStars.report(String(message));
  if (typeof decryptSaveFile === 'function') {
    const original = decryptSaveFile;
    window.decryptSaveFile = async function (file, format) {
      if (/\.json$/i.test(file.name || '')) {
        if (file.size > 24 * 1024 * 1024) throw new Error('JSON 存档过大');
        const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
        if (parsed?.kind === 'yanyu-stars-backup' && parsed.schema === 1) {
          const meta = parsed.meta || {};
          return { data: MobileCapture.validate(parsed.data), version: String(meta.version || 'json'),
            channel: String(meta.channel || ''), platform: String(meta.platform || 'android'), format: 'json-local' };
        }
        report('旧 JSON 备份没有可靠版本信息；新游戏请优先重新导出或导入 .yanyu，避免使用旧序列规则');
        return { data: MobileCapture.validate(parsed), version: 'json', format: 'json-local', platform: 'android' };
      }
      return original(file, format);
    };
  }
  let reading = false;
  window.mobileReadCapture = async function () {
    if (reading || typeof saveShareStore !== 'function') return;
    reading = true;
    try {
      const text = await (await fetch('/mobile/capture', { cache: 'no-store' })).text();
      if (!text.trim()) { document.getElementById('mobileCaptureError')?.remove(); return; }
      const result = await MobileCapture.decode(text);
      if (!saveShareStore(result.data, { version: result.version, format: result.format, platform: result.platform || 'android', channel: result.channel || '', importedAt: Date.now() })) throw new Error('本地存储空间不足');
      LocalStars.acknowledgeCapture();
      report('导出并导入成功：' + (result.data.MainRole.Name || '角色') + '。请停止代理；可点“备份”保存到手机');
      location.replace('/web/index.html');
    } catch (e) {
      report('免Root导出暂未成功：' + e.message);
      if (!document.getElementById('mobileCaptureError')) {
        const box = document.createElement('div'); box.id = 'mobileCaptureError';
        box.style.cssText = 'padding:12px;background:#fff0db;color:#442b10;position:relative;z-index:10';
        box.textContent = e.message + '。';
        const diagnostic = document.createElement('button'); diagnostic.textContent = '保存诊断数据（先保存，勿清除）';
        diagnostic.onclick = () => LocalStars.exportCapture();
        box.appendChild(diagnostic);
        const clear = document.createElement('button'); clear.textContent = '清除本次候选，重新捕获';
        clear.onclick = () => { if (!confirm('清除后无法恢复这次候选。需要排查格式时，请先保存诊断数据。确定清除？')) return; LocalStars.acknowledgeCapture(); box.remove(); report('已清除候选；可重新手动上传，或直接导入 .yanyu'); };
        box.appendChild(clear); document.body.prepend(box);
      }
    } finally { reading = false; }
  };
  window.mobileExport = function () {
    try {
      const shared = typeof loadShareStore === 'function' && loadShareStore();
      if (!shared?.data) throw new Error('请先导入存档，再备份');
      MobileCapture.validate(shared.data);
      const meta = shared.meta || {};
      if (confirm('备份为未加密 JSON，只保存到你选择的位置。文件含角色与账号数据，请勿公开分享。继续？')) LocalStars.saveJson(JSON.stringify({kind:'yanyu-stars-backup',schema:1,
        meta:{version:meta.version || 'json',channel:meta.channel || '',platform:meta.platform || 'android'},data:shared.data}));
    } catch (e) { report(e.message); }
  };
  document.querySelectorAll('input[type=file]').forEach(input => { input.accept = '.yanyu,.db,.json,application/octet-stream,application/json'; });
  mobileReadCapture();
})();
