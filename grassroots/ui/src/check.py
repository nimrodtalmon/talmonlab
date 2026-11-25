#!/usr/bin/env python3
"""Checks a UI description (a small subset of IFML: containers, lists, details,
actions with parameter bindings, navigation) against a compiled contract.

Writes <world>.check.json beside index.html with, for each UI description given:
  - per act: is it covered (some reachable action component of it whose every
    place gets its value from a source sure to reach the value);
  - visibility: is every predicate of the person's state shown somewhere reachable;
  - inbox: is the inbox reachable;
  - a brute-force check over every local state of one viewer among four persons:
    allowed answers, and those no reachable action component offers.

A value source is
  "me"                         the viewer
  "<param>"                    a parameter of the container, bound by navigations into it
  {"select": "<list id>"}      chosen among the items of a list of the same container
  {"field": "any person"}      typed or picked freely
and a list's items are {"named": true} (every person an atom of the state names)
or {"pred": "<predicate>"} (the persons in the atoms of that predicate).

    python3 grassroots/ui/src/check.py friendship person-first pages-only
"""
import itertools, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(HERE, '..')


def place_of(act, name):
    return act['names'].index(name) + 1


def anchors(act):
    """place -> the predicates of the required atoms that hold it"""
    out = {}
    for p, ks in act['req']:
        for k in ks:
            if k is not None:
                out.setdefault(k, set()).add(p)
    return out


def item_kinds(lst):
    it = lst['items']
    return {'named'} if it.get('named') else {'pred:' + it['pred']}


def sources(ui):
    """for each container parameter, the kinds of items navigations can bind to it"""
    src = {(c, p): set() for c, d in ui['containers'].items() for p in d.get('params', [])}
    lists = {(c, comp['id']): comp for c, d in ui['containers'].items() for comp in d['components'] if comp['kind'] == 'list'}
    changed = True
    while changed:
        changed = False
        for c, d in ui['containers'].items():
            for comp in d['components']:
                ev = comp.get('event')
                if not ev:
                    continue
                for par, val in ev['bind'].items():
                    new = item_kinds(comp) if val == 'item' else src.get((c, val), set())
                    key = (ev['navigate'], par)
                    if not new <= src[key]:
                        src[key] |= new; changed = True
    return src, lists


def reachable(ui):
    seen, todo = {ui['start']}, [ui['start']]
    while todo:
        c = todo.pop()
        for comp in ui['containers'][c]['components']:
            ev = comp.get('event')
            if ev and ev['navigate'] not in seen:
                seen.add(ev['navigate']); todo.append(ev['navigate'])
    return seen


def kinds_of(val, c, src, lists):
    if val == 'me':
        return {'me'}
    if isinstance(val, str):
        return src.get((c, val), set())
    if 'select' in val:
        return item_kinds(lists[(c, val['select'])])
    if 'field' in val:
        return {'any'}
    raise ValueError(val)


def covers_place(kinds, k, anc):
    """the source reaches every value an allowed binding may give the place"""
    if not kinds:
        return False
    if 'any' in kinds:
        return True
    need = anc.get(k, set())
    return all((kd == 'named' and need) or (kd.startswith('pred:') and kd[5:] in need) for kd in kinds)


def check(spec, ui):
    src, lists = sources(ui)
    reach = reachable(ui)
    res = {}
    for a in spec['acts']:
        anc = anchors(a)
        verdicts = []
        for c in sorted(reach):
            for comp in ui['containers'][c]['components']:
                if comp['kind'] != 'action' or comp['act'] != a['name']:
                    continue
                bind = {place_of(a, r): v for r, v in comp.get('bind', {}).items()}
                bind[a['me']] = 'me'
                why = []
                for k in range(1, len(a['args']) + 1):
                    if k == a['me']:
                        continue
                    if k not in bind:
                        why.append(f"{a['names'][k-1]} gets no value")
                    elif not covers_place(kinds_of(bind[k], c, src, lists), k, anc):
                        why.append(f"{a['names'][k-1]} may be someone this source does not reach")
                params = ui['containers'][c].get('params', [])
                if params and not any(isinstance(v, str) and v in params for v in bind.values()):
                    why.append("this screen opens only from a list, and the action does not use its parameter")
                verdicts.append({'component': comp['id'], 'container': c, 'ok': not why, 'why': why})
        res[a['name']] = {'button': a['button'], 'covered': any(v['ok'] for v in verdicts), 'components': verdicts}
    preds = set(spec.get('vocab', {}))
    for a in spec['acts']:
        preds |= {p for p, _ in a['req'] + a['forb']}
    shown = {p for c in reach for comp in ui['containers'][c]['components'] for p in comp.get('shows', [])}
    inbox = any(comp['kind'] == 'inbox' for c in reach for comp in ui['containers'][c]['components'])
    subset = all(len(d.get('params', [])) <= 1 for d in ui['containers'].values()) and all(
        c == ui['start'] for c, d in ui['containers'].items() for comp in d['components'] if comp.get('event'))
    return {'subset': subset, 'acts': res, 'visibility': {'shown': sorted(shown & preds), 'hidden': sorted(preds - shown)},
            'inbox': inbox, 'complete': inbox and all(r['covered'] for r in res.values()), 'visible': not (preds - shown)}


def offered(spec, ui, st, me, persons):
    """the bindings the interface offers in a state, walking it as a person would"""
    named = sorted({x for _, args in st for x in args})
    out, seen, todo = set(), set(), [(ui['start'], {})]
    while todo:
        c, env = todo.pop()
        key = (c, tuple(sorted(env.items())))
        if key in seen:
            continue
        seen.add(key)
        comps = ui['containers'][c]['components']
        items = {comp['id']: (named if comp['items'].get('named') else
                              sorted({args[0] for p, args in st if p == comp['items']['pred'] and args}))
                 for comp in comps if comp['kind'] == 'list'}
        for comp in comps:
            if comp['kind'] == 'list' and comp.get('event'):
                ev = comp['event']
                for x in items[comp['id']]:
                    todo.append((ev['navigate'], {par: (x if v == 'item' else env[v]) for par, v in ev['bind'].items()}))
            if comp['kind'] == 'action':
                a = next(x for x in spec['acts'] if x['name'] == comp['act'])
                choices = {a['me']: [me]}
                for r, v in comp.get('bind', {}).items():
                    k = place_of(a, r)
                    choices[k] = [me] if v == 'me' else [env[v]] if isinstance(v, str) else \
                        items[v['select']] if 'select' in v else [p for p in persons if p != me]
                ks = range(1, len(a['args']) + 1)
                if all(k in choices for k in ks):
                    for vals in itertools.product(*[choices[k] for k in ks]):
                        out.add((a['name'], vals))
    return out


def brute(spec, ui, persons=('alice', 'bob', 'carol', 'dave')):
    me, rest = persons[0], persons[1:]
    preds = {}
    for a in spec['acts']:
        for p, ks in a['req'] + a['forb']:
            preds[p] = len(ks)
    assert all(n <= 1 for n in preds.values())
    atoms = [(p, ()) if n == 0 else (p, (x,)) for p, n in sorted(preds.items()) for x in ([None] if n == 0 else rest)]
    states = answers = missed = 0
    examples = []
    for bits in itertools.product([0, 1], repeat=len(atoms)):
        st = {a for a, b in zip(atoms, bits) if b}
        states += 1
        offer = offered(spec, ui, st, me, persons)
        for a in spec['acts']:
            ps = [k for k in range(1, len(a['args']) + 1) if k != a['me']]
            for vals in itertools.product(rest, repeat=len(ps)):
                if len(set(vals)) < len(vals):
                    continue
                v = dict(zip(ps, vals)); v[a['me']] = me
                if not (all((p, tuple(v[k] for k in ks)) in st for p, ks in a['req']) and
                        not any((p, tuple(v[k] for k in ks)) in st for p, ks in a['forb'])):
                    continue
                answers += 1
                b = (a['name'], tuple(v[k] for k in range(1, len(a['args']) + 1)))
                if b not in offer:
                    missed += 1
                    if len(examples) < 3:
                        examples.append({'state': sorted(f"{p}({','.join(x)})" if x else p for p, x in st),
                                         'answer': f"{b[0]}({', '.join(b[1])})"})
    return {'states': states, 'answers': answers, 'missed': missed, 'examples': examples}


if __name__ == '__main__':
    world, names = sys.argv[1], sys.argv[2:] or ['person-first']
    spec = json.load(open(os.path.join(UI, world + '.json')))
    out = {}
    for n in names:
        ui = json.load(open(os.path.join(UI, f'{world}.{n}.ui.json')))
        out[n] = {'name': ui['name'], **check(spec, ui), 'brute': brute(spec, ui)}
        print(n, 'complete' if out[n]['complete'] else 'INCOMPLETE', {a: r['covered'] for a, r in out[n]['acts'].items()},
              'hidden', out[n]['visibility']['hidden'], out[n]['brute'])
    json.dump(out, open(os.path.join(UI, world + '.check.json'), 'w'), indent=1)
