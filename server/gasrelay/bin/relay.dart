// gasrelay: the relay of GAS phones that are not near each other.
//
// A phone sends a message to another phone's public key; the relay holds it
// until the recipient's phone fetches it and confirms it.  Every request is
// signed with the sender's Ed25519 key.  The relay never sees content: each
// message is encrypted end to end by the phones (libsodium crypto_box between
// the two persons' keys).  It sees who sends to whom, when, and how much.
//
// POST /send   b = {"msgs":[{"to","app","id","nonce","box"}]}
// POST /inbox  b = {"apps":[...],"after":seq,"wait":seconds}   (long poll)
// POST /ack    b = {"acks":[[app,from,id],...]}
// GET  /       counts only
//
// Request body: {"key":hex,"t":unix ms,"b":JSON string,"sig":hex}, sig being
// Ed25519 over utf8("gasrelay1\n<path>\n<key>\n<t>\n<b>").
//
// Usage: dart bin/relay.dart [port]   env DATA = directory for state.json
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

const maxBody = 4 << 20;
const maxBox = 512 * 1024;
const maxQueue = 5000;
const maxQueueBytes = 50 << 20;
const maxSendsPerWindow = 1000;
const window = Duration(minutes: 10);
const ttl = Duration(days: 7);
const skew = Duration(minutes: 10);
const maxWait = 25;

class Msg {
  final int seq;
  final String from, app, id, nonce, box;
  final int at;
  Msg(this.seq, this.from, this.app, this.id, this.nonce, this.box, this.at);
  Map<String, Object> toJson() =>
      {'seq': seq, 'from': from, 'app': app, 'id': id, 'nonce': nonce, 'box': box, 'at': at};
  factory Msg.fromJson(Map m) => Msg(m['seq'] as int, m['from'] as String, m['app'] as String,
      m['id'] as String, m['nonce'] as String, m['box'] as String, m['at'] as int);
  int get size => box.length + nonce.length + 200;
}

class Relay {
  final String? dataDir;
  final Map<String, List<Msg>> inbox = {};
  final Map<String, List<Completer<void>>> waiters = {};
  final Map<String, List<int>> sends = {};
  final Map<String, int> lastSeen = {};
  int seq = 0;
  Timer? _saveTimer;
  final _ed = Ed25519();

  Relay(this.dataDir);

  File? get _file => dataDir == null ? null : File('$dataDir/state.json');

  void load() {
    final f = _file;
    if (f == null || !f.existsSync()) return;
    final j = jsonDecode(f.readAsStringSync()) as Map;
    seq = j['seq'] as int;
    (j['inbox'] as Map).forEach((k, v) =>
        inbox[k as String] = [for (final m in v as List) Msg.fromJson(m as Map)]);
    _expire();
  }

  void _save() {
    final f = _file;
    if (f == null) return;
    _saveTimer ??= Timer(const Duration(seconds: 2), () {
      _saveTimer = null;
      f.parent.createSync(recursive: true);
      final tmp = File('${f.path}.tmp');
      tmp.writeAsStringSync(jsonEncode({
        'seq': seq,
        'inbox': {for (final e in inbox.entries) e.key: [for (final m in e.value) m.toJson()]},
      }));
      tmp.renameSync(f.path);
    });
  }

  void _expire() {
    final cut = DateTime.now().subtract(ttl).millisecondsSinceEpoch;
    inbox.forEach((_, q) => q.removeWhere((m) => m.at < cut));
    inbox.removeWhere((_, q) => q.isEmpty);
  }

  static bool _hex(String s, int len) => s.length == len && RegExp(r'^[0-9a-f]+$').hasMatch(s);

  static Uint8List _bytes(String hex) => Uint8List.fromList(
      [for (var i = 0; i < hex.length; i += 2) int.parse(hex.substring(i, i + 2), radix: 16)]);

  /// The verified sender's key and the decoded body, or an error string.
  Future<(String, Map)> auth(String path, Map req) async {
    final key = req['key'], t = req['t'], b = req['b'], sig = req['sig'];
    if (key is! String || !_hex(key, 64)) throw 'bad key';
    if (t is! int || b is! String || sig is! String || !_hex(sig, 128)) throw 'bad request';
    if ((DateTime.now().millisecondsSinceEpoch - t).abs() > skew.inMilliseconds) {
      throw 'clock skew';
    }
    final ok = await _ed.verify(utf8.encode('gasrelay1\n$path\n$key\n$t\n$b'),
        signature: Signature(_bytes(sig),
            publicKey: SimplePublicKey(_bytes(key), type: KeyPairType.ed25519)));
    if (!ok) throw 'bad signature';
    final body = jsonDecode(b);
    if (body is! Map) throw 'bad body';
    lastSeen[key] = DateTime.now().millisecondsSinceEpoch;
    return (key, body);
  }

  Map<String, Object> send(String from, Map b) {
    final msgs = b['msgs'];
    if (msgs is! List) throw 'bad msgs';
    final now = DateTime.now().millisecondsSinceEpoch;
    final mine = sends.putIfAbsent(from, () => [])
      ..removeWhere((x) => x < now - window.inMilliseconds);
    if (mine.length + msgs.length > maxSendsPerWindow) throw 'rate limit';
    var accepted = 0;
    final woken = <String>{};
    for (final m in msgs) {
      if (m is! Map) throw 'bad msg';
      final to = m['to'], app = m['app'], id = m['id'], nonce = m['nonce'], box = m['box'];
      if (to is! String || !_hex(to, 64)) throw 'bad to';
      if (app is! String || app.isEmpty || app.length > 64) throw 'bad app';
      if (id is! String || id.isEmpty || id.length > 64) throw 'bad id';
      if (nonce is! String || nonce.length > 64 || box is! String || box.length > maxBox) {
        throw 'bad box';
      }
      final q = inbox.putIfAbsent(to, () => []);
      if (q.any((x) => x.from == from && x.app == app && x.id == id)) {
        accepted++; // already held: a retry
        continue;
      }
      if (q.length >= maxQueue || q.fold<int>(0, (s, x) => s + x.size) > maxQueueBytes) {
        throw 'recipient queue full';
      }
      q.add(Msg(++seq, from, app, id, nonce, box, now));
      mine.add(now);
      accepted++;
      woken.add(to);
    }
    for (final to in woken) {
      for (final c in waiters.remove(to) ?? const <Completer<void>>[]) {
        if (!c.isCompleted) c.complete();
      }
    }
    _save();
    return {'ok': true, 'accepted': accepted};
  }

  List<Msg> _pending(String key, Set<String> apps, int after) =>
      [for (final m in inbox[key] ?? const <Msg>[]) if (m.seq > after && apps.contains(m.app)) m];

  Future<Map<String, Object>> fetch(String key, Map b) async {
    final apps = {for (final a in (b['apps'] as List? ?? const [])) '$a'};
    final after = b['after'] is int ? b['after'] as int : 0;
    final wait = (b['wait'] is int ? b['wait'] as int : 0).clamp(0, maxWait);
    var got = _pending(key, apps, after);
    if (got.isEmpty && wait > 0) {
      final c = Completer<void>();
      waiters.putIfAbsent(key, () => []).add(c);
      await c.future.timeout(Duration(seconds: wait), onTimeout: () {});
      waiters[key]?.remove(c);
      got = _pending(key, apps, after);
    }
    return {
      'msgs': [for (final m in got.take(200)) m.toJson()..remove('at')],
      'now': DateTime.now().millisecondsSinceEpoch,
    };
  }

  Map<String, Object> ack(String key, Map b) {
    final acks = b['acks'];
    if (acks is! List) throw 'bad acks';
    final q = inbox[key];
    var n = 0;
    if (q != null) {
      for (final a in acks) {
        if (a is! List || a.length != 3) continue;
        final before = q.length;
        q.removeWhere((m) => m.app == a[0] && m.from == a[1] && m.id == a[2]);
        n += before - q.length;
      }
      if (q.isEmpty) inbox.remove(key);
      _save();
    }
    return {'ok': true, 'removed': n};
  }

  Map<String, Object> status() {
    _expire();
    final day = DateTime.now().subtract(const Duration(days: 1)).millisecondsSinceEpoch;
    return {
      'service': 'gasrelay',
      'version': 1,
      'active_last_day': lastSeen.values.where((t) => t > day).length,
      'queued': inbox.values.fold<int>(0, (s, q) => s + q.length),
    };
  }
}

Future<void> main(List<String> args) async {
  final port = args.isNotEmpty ? int.parse(args[0]) : int.parse(Platform.environment['PORT'] ?? '4501');
  final relay = Relay(Platform.environment['DATA'])..load();
  Timer.periodic(const Duration(hours: 1), (_) => relay.status());
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
  stdout.writeln('gasrelay on 127.0.0.1:$port');
  await for (final req in server) {
    unawaited(_handle(relay, req));
  }
}

Future<void> _handle(Relay relay, HttpRequest req) async {
  final res = req.response..headers.contentType = ContentType.json;
  try {
    final path = req.uri.path;
    if (req.method == 'GET' && (path == '/' || path.isEmpty)) {
      res.write(jsonEncode(relay.status()));
    } else if (req.method == 'POST' && const {'/send', '/inbox', '/ack'}.contains(path)) {
      final bytes = <int>[];
      await for (final chunk in req) {
        bytes.addAll(chunk);
        if (bytes.length > maxBody) throw 'body too large';
      }
      final body = jsonDecode(utf8.decode(bytes));
      if (body is! Map) throw 'bad request';
      final (key, b) = await relay.auth(path, body);
      final out = switch (path) {
        '/send' => relay.send(key, b),
        '/ack' => relay.ack(key, b),
        _ => await relay.fetch(key, b),
      };
      res.write(jsonEncode(out));
    } else {
      res.statusCode = 404;
      res.write('{"error":"not found"}');
    }
  } catch (e) {
    res.statusCode = 400;
    res.write(jsonEncode({'error': e is String ? e : 'bad request'}));
  }
  await res.close();
}
