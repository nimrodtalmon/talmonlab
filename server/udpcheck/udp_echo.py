"""UDP reachability check for talmonlab: answers every UDP datagram on the
given ports with b"echo:" + the datagram, so that a machine outside BGU can
tell whether UDP from the internet reaches this server (the rendezvous
server of the GAS phone app needs it).  A small web page on 127.0.0.1:<web
port> (served at /udpcheck/) shows which UDP ports are bound and what came.

Usage: python udp_echo.py <web port> <udp port> [<udp port> ...]
A port another program holds (Caddy on UDP 443 while HTTP/3 is on) is
retried every 30 seconds."""
import socket, sys, threading, time, http.server, json, datetime

web_port, ports = int(sys.argv[1]), [int(p) for p in sys.argv[2:]]
state = {p: {'bound': False, 'error': '', 'received': 0, 'last_from': '', 'last_at': ''} for p in ports}

def serve(port):
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.bind(('0.0.0.0', port))
            state[port].update(bound=True, error='')
            while True:
                data, addr = s.recvfrom(2048)
                st = state[port]
                st['received'] += 1
                st['last_from'] = '%s:%d' % addr
                st['last_at'] = datetime.datetime.now().isoformat(timespec='seconds')
                s.sendto(b'echo:' + data[:200], addr)
        except OSError as e:
            state[port].update(bound=False, error=str(e))
            time.sleep(30)

for p in ports:
    threading.Thread(target=serve, args=(p,), daemon=True).start()

class Page(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(state, indent=1).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(('127.0.0.1', web_port), Page).serve_forever()
