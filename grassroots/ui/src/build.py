#!/usr/bin/env python3
"""Reads a compiled contract's platform from a clone of EShapiro2/GLP and writes
<contract>.json beside index.html: its acts (from the request widget
declaration the compiler prints, social_menu), the argument types of each act
(the Proposal type), and the contract's role names of each act (its sas terms).

    python3 grassroots/ui/src/build.py /path/to/GLP Friendship friendship
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def parse(s):
    """A small reader for the GLP terms the compiler prints."""
    i = 0

    def ws():
        nonlocal i
        while i < len(s) and s[i] in ' \t\n':
            i += 1

    def term():
        nonlocal i
        ws()
        c = s[i]
        if c == '[':
            i += 1; out = []; ws()
            if s[i] == ']':
                i += 1; return out
            while True:
                out.append(term()); ws()
                if s[i] == ',':
                    i += 1; continue
                if s[i] == ']':
                    i += 1; return out
                raise ValueError(s[i:i + 30])
        if c == '"':
            j = s.index('"', i + 1); v = s[i + 1:j]; i = j + 1; return v
        if c == "'":
            j = s.index("'", i + 1); v = s[i + 1:j]; i = j + 1; return v
        m = re.compile(r'-?\d+').match(s, i)
        if m:
            i = m.end(); return int(m.group())
        m = re.compile(r'[A-Za-z_][A-Za-z0-9_]*').match(s, i)
        name = m.group(); i = m.end()
        if i < len(s) and s[i] == '(':
            i += 1; args = []
            while True:
                args.append(term()); ws()
                if s[i] == ',':
                    i += 1; continue
                if s[i] == ')':
                    i += 1; return {'f': name, 'a': args}
        return name

    return term()


def args_place(As):
    out = []
    for x in As:
        if isinstance(x, dict) and x['f'] == 'at':
            out.append(x['a'][0])
        else:
            out.append(None)
    return out


def main(glp, name, slug):
    vglp = open(os.path.join(glp, 'cascade', name, 'platform.vglp')).read()
    menu = parse(re.search(r'Request\? =::= (social_menu\(.*\))\s*$', vglp, re.M).group(1))
    props = {}
    block = re.search(r'\nProposal ::=\n(.*?)\n\.\n', vglp, re.S).group(1)
    for alt in block.split('\n;\n'):
        t = parse(alt.strip())
        props[t['f'] if isinstance(t, dict) else t] = t['a'] if isinstance(t, dict) else []
    names = {}
    gl = open(os.path.join(glp, 'cascade', name, name + '.glp')).read()
    for m in re.finditer(r"sas\((\w+), \[([^\]]*)\]", gl):
        names[m.group(1)] = [x.strip().strip("'") for x in m.group(2).split(',') if x.strip()]
    acts = []
    for b in menu['a'][0]:
        label, alist = b['a']
        for a in alist:
            f, me, roles, pre, binds, fields, same, text = a['a']
            acts.append({
                'button': label, 'name': f, 'me': me, 'roles': roles, 'binds': binds,
                'req': [[p['a'][0], args_place(p['a'][1])] for p in pre if p['f'] == 'req'],
                'forb': [[p['a'][0], args_place(p['a'][1])] for p in pre if p['f'] == 'forb'],
                'fields': [{'i': x['a'][0], 'label': x['a'][1], 'type': x['a'][2]} for x in fields],
                'args': props.get(f, []), 'names': names.get(f, []),
            })
    # the clause sentence of each act, from the full contract, as the act's caption
    full = open(os.path.join(glp, 'cascade', name, 'full-contract.txt')).read()
    for a in acts:
        m = re.search(r'[■◆○] ' + re.escape(a['button']) + r'[:.] ([^.]*)', full)
        if m:
            t = re.sub(r', who [^,]*,', '', m.group(1))
            t = re.split(r' with the consent|, provided| provided', t)[0]
            a['sentence'] = re.sub(r' once$', '', t.strip())
    # the interface pragmas the app is drawn from: the contract's own and those of the contracts it is written from
    def txt_of(n):
        for root, _, files in os.walk(os.path.join(glp, 'programs')):
            if n.replace(' ', '-') + '.txt' in files:
                return os.path.join(root, n.replace(' ', '-') + '.txt')
    chain, todo = [], [name]
    while todo:
        n = todo.pop()
        f = txt_of(n)
        if not f or n in [c['contract'] for c in chain]:
            continue
        lines = open(f).read().split('\n')
        body = [l for l in lines if not l.startswith('%')]
        m = re.match(r'(.+?) (?:extends|strengthens|restricts|relaxes|weakens|augments|instantiates) (.+?)[.(,]', body[1] if len(body) > 1 else '')
        if m:
            todo += [x.strip() for x in re.split(r',| and ', m.group(2)) if x.strip() and x.strip() != 'it']
        prag, on = [], False
        for l in lines:
            if l.strip() in ('Interface pragmas', 'Pragmas'):
                on = True; continue
            if l.strip() == 'Implementation pragmas':
                on = False; continue
            if on and l.strip():
                prag.append(l.rstrip())
        chain.insert(0, {'contract': n, 'lines': prag})
    out = {'contract': name, 'world': slug, 'acts': acts, 'pragmas': chain}
    json.dump(out, open(os.path.join(HERE, '..', slug + '.json'), 'w'), indent=1)
    print(len(acts), 'acts')


if __name__ == '__main__':
    main(*sys.argv[1:4])
