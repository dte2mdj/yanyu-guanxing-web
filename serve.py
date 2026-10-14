#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""烟雨江湖 网页版工具 —— 本地静态服务器。

为什么需要它（直接用 file:// 打开 index.html 会踩三个坑）：

  1. Chrome / Edge 默认禁止 file:// 页面访问 localStorage
     （抛 SecurityError）。本工具正是靠 localStorage 把"已导入的存档"
     共享给各个子页面 —— 拿不到就表现为：
        首页导入成功 → 点进洗练/装备页 → "请先导入包含打造状态的有效存档"
     工具内部已有 window.name 兜底，但仍然推荐用 HTTP 打开。
  2. `<link href="/fonts/...">`、`<script src="/web/...">` 这类以 / 开头的
     绝对路径在 file:// 下会解析成磁盘根目录（file:///C:/fonts/...）→ 403。
     （本仓库已把这些引用改成相对路径，但用 HTTP 打开才彻底没有歧义。）
  3. file:// 下 new Worker() 被浏览器拒绝，
     shared/wash_route_worker.js 无法工作。

起一个 http://127.0.0.1 的静态服务即可全部解决。

用法::

    python serve.py                 # 起服务并自动打开浏览器
    python serve.py --port 9000
    python serve.py --no-browser
"""

import argparse
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态文件处理器：关缓存 + 正确的 MIME。"""

    def end_headers(self):
        # 开发期不缓存，改完源码刷新即生效
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def guess_type(self, path):
        lower = str(path).lower()
        if lower.endswith('.wasm'):
            return 'application/wasm'
        if lower.endswith('.mjs') or lower.endswith('.js'):
            return 'text/javascript'
        if lower.endswith('.json'):
            return 'application/json'
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        # 默认安静；排查 404 时设 YYJH_SERVE_VERBOSE=1
        if os.environ.get('YYJH_SERVE_VERBOSE'):
            super().log_message(fmt, *args)


def pick_port(preferred):
    """优先用 preferred，被占用就往后顺延。"""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise SystemExit('端口 %d-%d 全部被占用，请用 --port 指定其它端口' % (preferred, preferred + 19))


def main(argv=None):
    parser = argparse.ArgumentParser(description='烟雨江湖网页版工具 本地服务器')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='监听端口（默认 %d）' % DEFAULT_PORT)
    parser.add_argument('--no-browser', action='store_true', help='不自动打开浏览器')
    args = parser.parse_args(argv)

    if not os.path.isfile(os.path.join(ROOT, 'index.html')):
        raise SystemExit('没在当前目录找到 index.html，请把 serve.py 放在网页工具根目录下运行')

    port = pick_port(args.port)
    handler = partial(Handler, directory=ROOT)

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', port), handler) as httpd:
        httpd.daemon_threads = True
        url = 'http://127.0.0.1:%d/' % port

        print('=' * 56)
        print('  烟雨江湖 网页版工具')
        print('  根目录: %s' % ROOT)
        print('  地址  : %s' % url)
        print('  (Ctrl+C 停止服务)')
        print('=' * 56)
        sys.stdout.flush()

        if not args.no_browser:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止服务。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
