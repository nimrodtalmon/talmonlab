// The relay end to end on the loopback: Ann sends Bob two messages, a retry
// is held once, Bob's long poll wakes on a send, an ack removes, and a
// forged or replayed request is refused.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:test/test.dart';

String hex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

class Person {
  final SimpleKeyPair kp;
  final String key;
  Person(this.kp, this.key);
  static Future<Person> make(int fill) async {
    final kp = await Ed25519().newKeyPairFromSeed(List.filled(32, fill));
    return Person(kp, hex((await kp.extractPublicKey()).bytes));
  }

  Future<(int, Map)> call(int port, String path, Map b, {int? t, Person? signer}) async {
    final bs = jsonEncode(b);
    final tt = t ?? DateTime.now().millisecondsSinceEpoch;
    final sig = await Ed25519()
        .sign(utf8.encode('gasrelay1\n$path\n$key\n$tt\n$bs'), keyPair: (signer ?? this).kp);
    final c = HttpClient();
    final req = await c.post('127.0.0.1', port, path);
    req.write(jsonEncode({'key': key, 't': tt, 'b': bs, 'sig': hex(sig.bytes)}));
    final res = await req.close();
    final out = jsonDecode(await utf8.decodeStream(res)) as Map;
    c.close();
    return (res.statusCode, out);
  }
}

void main() {
  late Process relay;
  late int port;
  late Directory data;

  setUp(() async {
    data = Directory.systemTemp.createTempSync('gasrelay');
    final s = await ServerSocket.bind('127.0.0.1', 0);
    port = s.port;
    await s.close();
    relay = await Process.start(Platform.resolvedExecutable, ['bin/relay.dart', '$port'],
        environment: {'DATA': data.path});
    await relay.stdout.transform(utf8.decoder).firstWhere((l) => l.contains('gasrelay on'));
  });
  tearDown(() {
    relay.kill();
    data.deleteSync(recursive: true);
  });

  test('send, poll, ack, refuse', () async {
    final ann = await Person.make(1), bob = await Person.make(2);
    final m1 = {'to': bob.key, 'app': 'gkk', 'id': 'a1', 'nonce': 'n', 'box': 'x'};
    var (code, out) = await ann.call(port, '/send', {'msgs': [m1, m1]});
    expect(code, 200);
    expect(out['accepted'], 2);
    (code, out) = await bob.call(port, '/inbox', {'apps': ['gkk'], 'after': 0});
    expect((out['msgs'] as List).length, 1, reason: 'the retry is held once');
    final seq = (out['msgs'] as List).first['seq'] as int;
    expect((out['msgs'] as List).first['from'], ann.key);

    (code, out) = await bob.call(port, '/inbox', {'apps': ['gc'], 'after': 0});
    expect(out['msgs'], isEmpty, reason: 'another app sees nothing');

    final waiting = bob.call(port, '/inbox', {'apps': ['gkk'], 'after': seq, 'wait': 10});
    await Future.delayed(const Duration(milliseconds: 300));
    final t0 = DateTime.now();
    await ann.call(port, '/send', {
      'msgs': [{'to': bob.key, 'app': 'gkk', 'id': 'a2', 'nonce': 'n', 'box': 'y'}]
    });
    (code, out) = await waiting;
    expect((out['msgs'] as List).single['id'], 'a2');
    expect(DateTime.now().difference(t0).inSeconds, lessThan(3), reason: 'the poll woke');

    (code, out) = await bob.call(port, '/ack', {
      'acks': [['gkk', ann.key, 'a1'], ['gkk', ann.key, 'a2']]
    });
    expect(out['removed'], 2);
    (code, out) = await bob.call(port, '/inbox', {'apps': ['gkk'], 'after': 0});
    expect(out['msgs'], isEmpty);

    (code, out) = await bob.call(port, '/inbox', {'apps': ['gkk']}, signer: ann);
    expect(code, 400);
    expect(out['error'], 'bad signature');
    (code, out) = await bob.call(port, '/inbox', {'apps': ['gkk']},
        t: DateTime.now().millisecondsSinceEpoch - 3600 * 1000);
    expect(out['error'], 'clock skew');

    final st = await HttpClient().getUrl(Uri.parse('http://127.0.0.1:$port/'));
    final s = jsonDecode(await utf8.decodeStream(await st.close())) as Map;
    expect(s['queued'], 0);
  });

  test('state survives a restart', () async {
    final ann = await Person.make(1), bob = await Person.make(2);
    await ann.call(port, '/send', {
      'msgs': [{'to': bob.key, 'app': 'gkk', 'id': 'k', 'nonce': 'n', 'box': 'z'}]
    });
    await Future.delayed(const Duration(seconds: 3));
    relay.kill();
    await relay.exitCode;
    relay = await Process.start(Platform.resolvedExecutable, ['bin/relay.dart', '$port'],
        environment: {'DATA': data.path});
    await relay.stdout.transform(utf8.decoder).firstWhere((l) => l.contains('gasrelay on'));
    final (_, out) = await bob.call(port, '/inbox', {'apps': ['gkk'], 'after': 0});
    expect((out['msgs'] as List).single['id'], 'k');
  });
}
