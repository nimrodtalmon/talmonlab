#!/usr/bin/env python3
"""Completeness of a declarative interface for a contract's proposal inputs.

Reads <world>.json (written by build.py) and an interface description, and
1. checks each act syntactically: some control of it covers it (its page place
   and its named pickers are anchored places);
2. checks by brute force, over every local state of one viewer among a few
   persons, that every allowed answer is offered by some control.

The interface description is a list of controls:
  {"act": name, "at": "home" | "page", "page": place or None,
   "pick": {place: "named" | "open"}}

    python3 grassroots/ui/src/check.py friendship      (writes friendship.check.json)
"""
import itertools, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def anchored(act):
    return {k for _, ks in act['req'] for k in ks if k is not None}


def others(act):
    """the places of the request other than the initiator's"""
    return [k for k in range(1, len(act['args']) + 1) if k != act['me']]


def person_first(acts):
    """the interface of the prototype: an act binding no one but its initiator, or
    with a place its state does not anchor, on the home screen, its free places as
    open pickers; any other act on the page of each anchored place, the rest named pickers"""
    out = []
    for a in acts:
        anc, ps = anchored(a), others(a)
        if not ps or any(k not in anc for k in ps):
            out.append({'act': a['name'], 'at': 'home', 'page': None,
                        'pick': {k: ('named' if k in anc else 'open') for k in ps}})
        else:
            for k in ps:
                out.append({'act': a['name'], 'at': 'page', 'page': k,
                            'pick': {j: 'named' for j in ps if j != k}})
    return out


def pages_only(acts):
    """a variant: every act with a person on the page of that person"""
    out = []
    for a in acts:
        ps = others(a)
        if not ps:
            out.append({'act': a['name'], 'at': 'home', 'page': None, 'pick': {}})
        for k in ps:
            out.append({'act': a['name'], 'at': 'page', 'page': k, 'pick': {j: 'named' for j in ps if j != k}})
    return out


def covers(c, act):
    anc = anchored(act)
    if c['at'] == 'page' and c['page'] not in anc:
        return False
    return all(k in anc for k, how in c['pick'].items() if how == 'named')


def syntactic(acts, ui):
    res = {}
    for a in acts:
        cs = [c for c in ui if c['act'] == a['name']]
        res[a['name']] = {'covered': any(covers(c, a) for c in cs), 'anchored': sorted(anchored(a)),
                          'free': [k for k in others(a) if k not in anchored(a)]}
    return res


def brute(acts, ui, persons=('alice', 'bob', 'carol', 'dave')):
    """every local state of the viewer over the contract's predicates; every allowed
    answer; is it offered?"""
    me, rest = persons[0], persons[1:]
    preds = {}
    for a in acts:
        for p, ks in a['req'] + a['forb']:
            preds[p] = len(ks)
    atoms = [(p, ()) if n == 0 else (p, (x,)) for p, n in sorted(preds.items()) for x in ([None] if n == 0 else rest)]
    assert all(n <= 1 for n in preds.values()), 'brute force here handles predicates of at most one argument'
    states = answers = missed = 0
    miss_examples = []
    for bits in itertools.product([0, 1], repeat=len(atoms)):
        st = {a for a, b in zip(atoms, bits) if b}
        named = {x for _, args in st for x in args}
        states += 1
        for a in acts:
            ps = others(a)
            for vals in itertools.product(rest, repeat=len(ps)):
                if len(set(vals)) < len(vals):
                    continue
                v = dict(zip(ps, vals)); v[a['me']] = me
                ok = all((p, tuple(v[k] for k in ks)) in st for p, ks in a['req']) and \
                    not any((p, tuple(v[k] for k in ks)) in st for p, ks in a['forb'])
                if not ok:
                    continue
                answers += 1
                offered = False
                for c in ui:
                    if c['act'] != a['name']:
                        continue
                    if c['at'] == 'page' and v[c['page']] not in named:
                        continue
                    if all(how == 'open' or v[k] in named for k, how in c['pick'].items()):
                        offered = True; break
                if not offered:
                    missed += 1
                    if len(miss_examples) < 3:
                        miss_examples.append({'state': sorted(f"{p}({','.join(args)})" if args else p for p, args in st),
                                              'answer': f"{a['name']}({', '.join(v[k] for k in range(1, len(a['args']) + 1))})"})
    return {'states': states, 'answers': answers, 'missed': missed, 'examples': miss_examples}


def main(world, which='person-first'):
    spec = json.load(open(os.path.join(HERE, '..', world + '.json')))
    ui = {'person-first': person_first, 'pages-only': pages_only}[which](spec['acts'])
    out = {'interface': which, 'controls': ui, 'acts': syntactic(spec['acts'], ui), 'brute': brute(spec['acts'], ui)}
    return out


if __name__ == '__main__':
    world = sys.argv[1]
    rs = {w: main(world, w) for w in ('person-first', 'pages-only')}
    json.dump(rs, open(os.path.join(HERE, '..', world + '.check.json'), 'w'), indent=1)
    for w, r in rs.items():
        print(w, {a: x['covered'] for a, x in r['acts'].items()}, r['brute'])
