(function (root) {
    'use strict';
    function version(state) {
        return Number(state && (state.save_version || state.saveVersion || state.version)) || 0;
    }
    function channel(state) {
        return String(state && (state.save_channel || state.saveChannel || state.channel || state.platform) || '').trim().toLowerCase();
    }
    function international(state) {
        return ['国际服', '國際服', 'oversea', 'international', 'korea', 'japan'].includes(channel(state));
    }
    function washRC(state) { return version(state) >= 73420 || international(state); }
    function makeMax(state) {
        return version(state) >= 73420 && !international(state)
            && !['先行服', 'pre_android', 'pre_ios', 'chinapre'].includes(channel(state)) ? 98999999 : 99999999;
    }

    // The bundled kernel has no source/build project. Its four equipment seed
    // advances are in function 1, each i64.const 99999999; call 822; drop.
    // Append an exported mutable i64 global and replace only those instructions.
    // Existing function/global indexes and body lengths remain unchanged.
    // Refuse unknown kernels instead of silently editing unrelated constants.
    function prepareWasm(input) {
        const bytes = new Uint8Array(input);
        // Accidental-version guard, not an authentication mechanism. SHA-256 of
        // this exact source binary is pinned in the regression test/report.
        let fingerprint = 2166136261;
        for (const byte of bytes) fingerprint = Math.imul(fingerprint ^ byte, 16777619) >>> 0;
        if (bytes.length !== 393716 || fingerprint !== 1496480125) {
            throw new Error('未知 WASM 内核版本，不能安全更新装备序列规则');
        }
        function read(pos) {
            let value = 0, shift = 0, byte;
            do { byte = bytes[pos++]; value += (byte & 127) * 2 ** shift; shift += 7;
                if (shift > 35 || pos > bytes.length) throw new Error('无效 WASM 长度');
            } while (byte & 128);
            return [value, pos];
        }
        function leb(value) { const out = []; do { let b = value & 127; value = Math.floor(value / 128); out.push(b | (value ? 128 : 0)); } while (value); return out; }
        const chunks = [bytes.slice(0, 8)];
        let pos = 8, globals = false, exports = false, patched = 0;
        while (pos < bytes.length) {
            const id = bytes[pos++];
            const [length, start] = read(pos); const end = start + length;
            let payload = bytes.slice(start, end);
            if (id === 6) {
                const [count, body] = read(start);
                if (count !== 3) throw new Error('未知 WASM 全局布局');
                payload = Uint8Array.from([...leb(4), ...bytes.slice(body, end), 0x7e, 1, 0x42, ...leb(99999999), 0x0b]);
                globals = true;
            } else if (id === 7) {
                const [count, body] = read(start);
                const name = new TextEncoder().encode('__make_draw_max');
                payload = Uint8Array.from([...leb(count + 1), ...bytes.slice(body, end), ...leb(name.length), ...name, 3, 3]);
                exports = true;
            } else if (id === 10) {
                const [, first] = read(start);
                const [bodyLength, body] = read(first);
                const pattern = [0x42, ...leb(99999999), 0x10, ...leb(822), 0x1a];
                for (let i = body; i + pattern.length <= body + bodyLength; i++) {
                    if (!pattern.every((b, j) => bytes[i + j] === b)) continue;
                    // global.get 3 followed by nops fills the five-byte const.
                    payload.set([0x23, 3, 1, 1, 1], i - start);
                    patched++;
                }
            }
            chunks.push(Uint8Array.from([id, ...leb(payload.length)]), payload);
            pos = end;
        }
        if (!globals || !exports || patched !== 4) throw new Error('WASM 装备推进补丁校验失败');
        const result = new Uint8Array(chunks.reduce((n, a) => n + a.length, 0));
        let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
        if (!WebAssembly.validate(result)) throw new Error('WASM 装备推进补丁未通过验证');
        return result;
    }
    root.SequenceRules = Object.freeze({ version, channel, international, washRC, makeMax, prepareWasm });
})(typeof window !== 'undefined' ? window : globalThis);
