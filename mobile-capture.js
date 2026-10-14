(function (g) {
  'use strict';
  const MAX = 24 * 1024 * 1024;
  function validate(data) {
    if (!data || Array.isArray(data) || typeof data !== 'object' ||
        !data.MainRole || typeof data.MainRole !== 'object' || !Number.isFinite(Number(data.MainRole.ID)) ||
        !('XiSui' in data || 'MakeRnd' in data || 'Roles' in data)) {
      throw new Error('数据不是完整的角色存档，原存档未替换');
    }
    return data;
  }
  async function decode(text) {
    const compact = text.replace(/\s/g, '');
    if (compact.length > 12 * 1024 * 1024 || compact.length < 16 || compact.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error('不是可识别的网络存档封装');
    const bytes = Uint8Array.from(atob(compact), c => c.charCodeAt(0));
    const version = new TextDecoder().decode(bytes.slice(0, 8));
    if (!/^\d{8}$/.test(version)) throw new Error('收到的是未知外层封装，当前实验版尚不支持；可继续导入原导出工具的 .yanyu 文件');
    const key = SAVE_NESTED_INNER_KEY_MAP[version];
    if (!key && version !== '00073315') throw new Error('尚未适配存档版本 ' + version + '，不会尝试联网获取密钥');
    if (key) return { data: decodeWithKey(bytes.slice(8), key), version, format: 'network-local' };
    // 73315 prefix read from the user's live m_tKeys table on 2026-09-23.
    // Android suffix follows the previously audited rule; real 73315 capture
    // validation is still pending. No candidate bypasses full payload checks.
    const candidates = [...new Set(['u6cgjphepo06ewkx', ...Object.values(SAVE_NESTED_INNER_KEY_MAP).reverse()])];
    for (const candidate of candidates) {
      try {
        return { data: decodeWithKey(bytes.slice(8), candidate), version, format: 'network-local', compatibility: candidate === 'u6cgjphepo06ewkx' ? 'validated-runtime-candidate' : 'validated-known-key' };
      } catch (_) { /* No plaintext or keys are logged. Keep the existing save. */ }
    }
    throw new Error('已识别存档版本 00073315，但现有密钥均未通过完整校验；请保存诊断数据以继续适配，原存档未替换');
  }
  function decodeWithKey(cipher, key) {
    const compressed = decryptXXTEA(cipher, key);
    if (!compressed) throw new Error('当前渠道或网络存档密钥不匹配，原存档未替换');
    const inflater = new pako.Inflate(); let length = 0; const chunks = [];
    inflater.onData = chunk => { length += chunk.length; if (length > MAX) throw new Error('存档解压体积超出限制'); chunks.push(chunk); };
    inflater.push(compressed, true);
    if (inflater.err || !inflater.ended || !chunks.length) throw new Error('存档压缩校验失败');
    const plain = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { plain.set(chunk, offset); offset += chunk.length; }
    return validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)));
  }
  g.MobileCapture = { decode, validate };
})(globalThis);
