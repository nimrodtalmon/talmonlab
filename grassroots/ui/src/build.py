"""The prototype's input for one contract, read from the Grassroots Contracts Calculus.

    python3 build.py CALC NAME OUT.json [GLP] [--changed=NAME:N ...]

CALC is a scratch copy of the Calculus's directory (calculus/ of GLP) with gr/ and rev/ made from
contracts/*/logic-pragmas.txt and contract.txt, as tools/SAS-WRITING.txt says, and tools/toglp.py run
for NAME, so that glp/NAME.glp.txt holds the contract's schemas.  GLP is the GLP checkout, for the
Interface pragmas of the contracts in programs/.

The output holds, for the page: the contract's text and the texts it is written from; the
vocabulary; and each schema of the Calculus: its persons, values, effects, preconditions and who must
agree to it, with the button, the question and the fields of the Interface pragmas.
"""
import json, os, re, sys

# ---------- a reader of the Calculus's terms ----------
TOK = re.compile(r"\s*(?:('(?:[^'\\]|\\.)*')|([A-Za-z_][\w]*)|(-?\d+)|([\[\](),]))")


def parse(s):
    pos = 0
    toks = []
    while pos < len(s):
        m = TOK.match(s, pos)
        if not m or m.end() == pos:
            if s[pos:].strip() == '':
                break
            raise ValueError('cannot read at ' + s[pos:pos + 40])
        pos = m.end()
        q, w, n, p = m.groups()
        toks.append(('q', q[1:-1]) if q else ('w', w) if w else ('n', int(n)) if n else ('p', p))
    i = 0

    def term():
        nonlocal i
        k, v = toks[i]
        i += 1
        if k == 'p' and v == '[':
            xs = []
            if toks[i] == ('p', ']'):
                i += 1
                return xs
            while True:
                xs.append(term())
                k2, v2 = toks[i]
                i += 1
                if v2 == ']':
                    return xs
        if k in ('w', 'q') and i < len(toks) and toks[i] == ('p', '('):
            i += 1
            args = []
            while True:
                args.append(term())
                k2, v2 = toks[i]
                i += 1
                if v2 == ')':
                    return {'f': v, 'a': args}
        if k == 'q':
            return v
        return {'w': v} if k == 'w' else v

    return term()


def atom(t):
    """atom(P, Args) -> {p, args, neg}; not(atom) -> neg; forall(Vars, A, true, Body)."""
    if t.get('f') == 'not':
        a = atom(t['a'][0])
        a['neg'] = True
        return a
    if t.get('f') == 'forall':
        vs, a, _, body = t['a']
        return {'forall': vs, 'over': atom(a), 'then': [atom(b) for b in body]}
    p, args = t['a']
    return {'p': p['w'] if isinstance(p, dict) else p, 'args': [x['a'][0] if isinstance(x, dict) and x.get('f') == 'const' else x for x in args], 'neg': False}


def schemas(text):
    t = parse(text.strip())
    if isinstance(t, dict) and t.get('f') == 'environment':
        t = t['a'][1]
    if isinstance(t, dict) and t.get('f') == 'reflexive':
        refl, ss = t['a'][0], t['a'][1]
    else:
        refl, ss = [], t
    out = []
    for s in ss:
        name, persons, values, eff, pre, _, by = s['a']
        name = name['w'] if isinstance(name, dict) else name
        ps, one = [], {}
        for p in persons:
            if isinstance(p, dict) and p.get('f') == 'one':
                one[p['a'][0]] = p['a'][1] if isinstance(p['a'][1], list) else [p['a'][1]]
            else:
                ps.append(p)
        out.append({'name': name, 'persons': ps, 'one': one, 'values': [v for v in values if v not in one],
                    'effects': [atom(x) for x in eff], 'pre': [atom(x) for x in pre], 'by': by})
    return [r['w'] if isinstance(r, dict) else r for r in refl], out


# ---------- the texts ----------
def parents(calc, name, names):
    l = open(os.path.join(calc, 'gr', name + '.txt')).read().split('\n')[1]
    l = re.sub(r'\(.*?\)', '', l)
    rest = l.split(' ', 1)[1] if ' ' in l else ''
    out = []
    for d, n in sorted(names.items(), key=lambda x: -len(x[0])):
        if n != name and re.search(r'\b' + re.escape(d) + r'\b', rest):
            out.append(n)
            rest = re.sub(r'\b' + re.escape(d) + r'\b', '', rest)
    return out


def chain(calc, name, names):
    seen, order = set(), []

    def go(n):
        if n in seen:
            return
        seen.add(n)
        for p in parents(calc, n, names):
            go(p)
        order.append(n)
    go(name)
    return order


def vocab(gr):
    v = {}
    for l in gr:
        if l.startswith('Vocabulary:'):
            for part in l[len('Vocabulary:'):].strip().rstrip('.').split(';'):
                if '=' in part:
                    ph, at = [x.strip() for x in part.rsplit('=', 1)]
                    m = re.match(r'(\w+)\(([^)]*)\)', at)
                    if m:
                        v[m.group(1)] = {'phrase': re.sub(r', for \w+$', '', ph), 'vars': [x.strip() for x in m.group(2).split(',')]}
    return v


def clauses(lines):
    """Act title -> its sentence, from the numbered clauses."""
    out = {}
    for l in lines:
        m = re.match(r'^\d+\. [■◆○] (.*)$', l)
        if not m:
            continue
        body = m.group(1)
        parts = re.split(r'(?:^|(?<=\. ))([A-Z][A-Za-z ]*?)[:.] ', body)
        for k in range(1, len(parts) - 1, 2):
            out[parts[k].strip()] = parts[k + 1].strip()
    return out


def interface(path):
    """Button -> act line facts, questions; tab lines."""
    if not path or not os.path.exists(path):
        return {}, {}
    lines = open(path).read().split('\n')
    try:
        i = lines.index('Interface pragmas')
    except ValueError:
        return {}, {}
    acts, tabs, last = {}, {}, None
    for l in lines[i + 1:]:
        if not l.strip() or l.startswith('%'):
            continue
        q = re.match(r'^\s+([A-Z]\w*): (.*)$', l)
        if q and last and not re.search(r'\[', q.group(2)):
            for b in last:
                acts[b].setdefault('questions', {})[q.group(1)] = q.group(2)
            continue
        body = l.split(': ', 1)[1] if ': ' in l else l
        bs = re.findall(r'\[([^\]]+)\]', body)
        if bs:
            fields = re.findall(r'<([^>]+)>', body)
            last = bs
            for b in bs:
                after = body.split('[' + b + ']', 1)[1]
                f = re.match(r'\s*<([^>]+)>', after)
                acts[b] = {'field': f.group(1) if f else None}
        elif ':' in l:
            tabs[l.split(':')[0].strip()] = l.split(':', 1)[1].strip().rstrip('.')
    return acts, tabs


def main():
    calc, name, out = sys.argv[1:4]
    glp = sys.argv[4] if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else '/home/claude/GLP'
    changed = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--changed=')]
    names = {}
    for l in open(os.path.join(calc, 'NAMES.txt')):
        cols = [c.strip() for c in l.split('|')]
        if len(cols) == 5 and cols[0] and cols[0] != 'name on main':
            names[cols[1]] = cols[2]
    order = chain(calc, name, names)
    refl, ss = schemas(open(os.path.join(calc, 'glp', name + '.glp.txt')).read())
    voc, sent, texts, iface, tabs = {}, {}, [], {}, {}
    for n in order:
        gr = open(os.path.join(calc, 'gr', n + '.txt')).read().split('\n')
        rev = open(os.path.join(calc, 'rev', n + '.txt')).read().rstrip('\n').split('\n')
        voc.update(vocab(gr))
        for t, s in clauses(gr).items():
            m = re.match(r'^(\w[\w ]*):(\d+)', s)
            s = re.split(r', (?:provided|only if|with the consent of)', s)[0].rstrip('.')
            sent[t] = sent.get(t, s) if m else s
        texts.append({'contract': n, 'text': rev, 'changed': [c.split(':', 1)[1] for c in changed if c.split(':', 1)[0] == n]})
        prog = None
        for root, _, fs in os.walk(os.path.join(glp, 'programs')):
            if n + '.txt' in fs and '/tests' not in root:
                prog = os.path.join(root, n + '.txt')
                break
        a, t = interface(prog)
        iface.update(a)
        tabs.update(t)
    for s in ss:
        title = s['name'].replace('_', ' ').capitalize()
        s['button'] = title
        s['sentence'] = sent.get(title, title)
        s['auto'] = not s['by']
        i = iface.get(title, {})
        s['questions'] = i.get('questions', {})
        s['field'] = i.get('field')
    json.dump({'contract': name, 'chain': texts, 'vocab': voc, 'reflexive': refl, 'schemas': ss, 'tabs': tabs,
               'env': ['today']}, open(out, 'w'), indent=1, ensure_ascii=False)
    print(name, len(ss), 'schemas;', 'chain', order)


if __name__ == '__main__':
    main()
