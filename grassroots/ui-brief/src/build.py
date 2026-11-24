#!/usr/bin/env python3
"""Builds grassroots/ui-brief/index.html: a research brief on the UI layer of the
Grassroots cascade (interface pragmas, construct families), related work on
generated UIs and super-apps, and two proposals.

    python3 grassroots/ui-brief/src/build.py

Screens in img/ are the recorded screens of the compiled apps in EShapiro2/GLP
(programs/apps/*/screens); the sketches on the proposal slides are drawn here.
"""
import os, html as H

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'index.html')
DATE = 'November 24, 2026'

OR, DK, GR, GL, CARD, PALE, LT = '#F7941D', '#26282C', '#5F6368', '#B9BCC1', '#FDFDFB', '#FCE8D2', '#F3F3F1'
TEAL = '#16917F'
FONT = 'font-family="Heebo, sans-serif"'


def svg(w, h, body):
    return f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}" {FONT}>{body}</svg>'


def text(x, y, s, size=30, fill=DK, anchor='middle', weight=400, extra=''):
    return (f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
            f'font-weight="{weight}" {extra}>{H.escape(s)}</text>')


def rect(x, y, w, h, fill=CARD, stroke=GL, sw=3, r=22):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def arrow(x1, y1, x2, y2, col=GR):
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="4" marker-end="url(#ah)"/>')


DEFS = f'<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{GR}"/></marker></defs>'


def pill(x, y, label, size=24, fill='none', stroke=TEAL, col=TEAL):
    w = 22 + 0.56 * size * len(label)
    return (f'<rect x="{x}" y="{y}" width="{w:.0f}" height="{size*1.7:.0f}" rx="{size*0.85:.0f}" fill="{fill}" stroke="{stroke}" stroke-width="2.5"/>'
            + text(x + w / 2, y + size * 1.17, label, size, col, weight=600)), w


# ---------- pictures ----------
def cascade_vis():
    w, h = 1720, 560
    b = DEFS
    boxes = [('Contract', 'clauses + pragmas'), ('Speech-act', 'schemas'), ('CVA', 'platform'), ('vGLP program', 'asks questions')]
    x, bw, bh, y = 10, 330, 150, 60
    for k, (t, s) in enumerate(boxes):
        last = k == 3
        b += rect(x, y, bw, bh, PALE if last else CARD, OR if last else GL, 4 if last else 3)
        b += text(x + bw / 2, y + 66, t, 38, DK, weight=800)
        b += text(x + bw / 2, y + 112, s, 28, GR)
        if not last:
            b += arrow(x + bw + 6, y + bh / 2, x + bw + 52, y + bh / 2)
        x += bw + 60
    vx = x - 60 - bw / 2
    outs = [('a person', 'widgets → the app', 280), ('a simulated person', 'sGLP → simulation', 860), ('a scripted person', 'plays → tests', 1440)]
    b += f'<line x1="{vx}" y1="{y + bh + 4}" x2="{vx}" y2="300" stroke="{GR}" stroke-width="4"/>'
    b += f'<line x1="280" y1="300" x2="{max(vx, 1440)}" y2="300" stroke="{GR}" stroke-width="4"/>'
    for t, s, cx in outs:
        if cx != vx:
            b += arrow(cx, 300, cx, 358)
        b += rect(cx - 250, 365, 500, 140, CARD, DK if t == 'a person' else GL, 4 if t == 'a person' else 3)
        b += text(cx, 425, t, 36, DK, weight=800)
        b += text(cx, 472, s, 28, GR)
    b += text(860, 285, 'each question is answered by', 28, GR, extra='font-style="italic"')
    return svg(w, h, b)


def widget_table():
    rows = [('a constant', 'a button'), ('a union of constants', 'a row of buttons'), ('a tuple', 'a form with fields'),
            ('any other union', 'a menu'), ('String · number · Key', 'a text · number · person field'),
            ("the program's stream", 'a thread'), ("the person's stream", 'an open input')]
    tr = ''.join(f'<tr><td>{a}</td><td>{b}</td></tr>' for a, b in rows)
    return f'<table class="wt"><tr><th>type</th><th>default widget</th></tr>{tr}</table>'


def patterns_vis():
    """Sketch: the same atoms drawn as today's list, and as a conversation."""
    w, h = 860, 700
    b = ''
    for k, (cx, title) in enumerate([(205, 'today: a list'), (655, 'as a conversation')]):
        b += rect(cx - 190, 40, 380, 600, '#fff', GL, 3, 34)
        b += text(cx, 680, title, 30, DK, weight=800)
        if k == 0:
            b += text(cx, 100, 'Messages', 26, TEAL, weight=700)
            for j, (who, msg) in enumerate([('Alice', 'Hi Bob'), ('Alice', 'Lunch?'), ('Carol', 'Ride at 8?')]):
                y = 140 + j * 120
                b += rect(cx - 165, y, 330, 100, CARD, GL, 2, 16)
                b += text(cx - 145, y + 40, who, 24, DK, 'start', 700)
                b += text(cx - 145, y + 78, msg, 24, GR, 'start')
            b += text(cx, 560, 'Message: in the Friends tab', 22, GR)
        else:
            b += text(cx, 100, 'Alice', 28, DK, weight=800)
            for j, (mine, msg) in enumerate([(False, 'Hi Bob'), (True, 'Hi!'), (False, 'Lunch?'), (True, 'Sure')]):
                y = 140 + j * 90
                bw = 40 + 15 * len(msg)
                x0 = cx + 165 - bw if mine else cx - 165
                b += rect(x0, y, bw, 62, PALE if mine else LT, 'none', 0, 26)
                b += text(x0 + bw / 2, y + 41, msg, 24, DK)
            b += rect(cx - 165, 540, 230, 56, '#fff', GL, 2, 28)
            b += text(cx - 145, 576, 'text', 22, GL, 'start')
            b += rect(cx + 80, 540, 85, 56, TEAL, 'none', 0, 28)
            b += text(cx + 122, 576, 'Send', 22, '#fff', weight=700)
    return svg(w, h, b)


def person_vis():
    """Sketch: Bob's page in a host that merges contracts by person."""
    w, h = 900, 760
    b = rect(20, 10, 860, 740, '#fff', GL, 3, 36)
    b += f'<circle cx="100" cy="85" r="42" fill="{PALE}"/>' + text(100, 99, 'B', 40, DK, weight=800)
    b += text(165, 80, 'Bob', 44, DK, 'start', 800)
    b += text(165, 118, 'you know each other · friends', 26, GR, 'start')
    secs = [('Knowledge', 'knows Carol', ['Introduce']),
            ('Friendship', 'friend since the 3rd', ['Unfriend']),
            ('Groups', '“Lunch?” · 2 new', ['Message']),
            ('Coins', 'you hold 3 of Bob’s coins', ['Pay', 'Swap']),
            ('Agora', 'Bob offers: a bike', ['Swap items']),
            ('Auction', 'rides with you', [])]
    y = 160
    for name, line, btns in secs:
        b += f'<line x1="50" y1="{y}" x2="850" y2="{y}" stroke="{LT}" stroke-width="3"/>'
        b += text(60, y + 38, name, 22, GR, 'start', 700, 'letter-spacing="1"')
        b += text(60, y + 78, line, 28, DK, 'start')
        x = 850
        for lab in reversed(btns):
            pw = 22 + 0.56 * 24 * len(lab)
            x -= pw
            b += pill(x, y + 38, lab)[0]
            x -= 14
        y += 98
    return svg(w, h, b)


# ---------- slide helpers ----------
def section(eyebrow, title, body, cls='light'):
    return f'''<section class="slide {cls}">
  <p class="eyebrow">{eyebrow}</p>
  <h2>{title}</h2>
  {body}
</section>'''


def split(left, right, wide=False):
    return f'<div class="split{" wide" if wide else ""}"><div>{left}</div><div class="pic">{right}</div></div>'


def boxes(items):
    return '<div class="rw">' + ''.join(
        f'<div class="box"><h3>{t}</h3><p class="who">{w}</p><p class="diff">{x}</p></div>' for t, w, x in items) + '</div>'


def rows(items):
    return '<div class="rows ruled">' + ''.join(
        f'<div class="row"><span class="n">{k}</span><p>{t}</p></div>' for k, t in enumerate(items, 1)) + '</div>'


# ---------- slides ----------
TITLE = f'''<section class="slide dark center">
  <p class="eyebrow">Grassroots</p>
  <h1 style="font-size:104px">Good-Looking Grassroots Apps</h1>
  <p class="big">The UI layer: how it works, what others did, what we could do</p>
  <p class="muted">Nimrod Talmon · Ben-Gurion University · draft, {DATE}</p>
</section>'''

slides = [TITLE]
S = slides.append

S(section('Motivation', 'Correct by construction, not yet pleasant', '''
  <p class="sub">Every screen is derived from a contract. Today the screens look like admin forms.</p>
  <img class="shot" src="img/now.jpg" alt="four compiled apps">
  <p class="cap">Recorded screens of four compiled apps: Knowledge, Groups, Bonds, and Groups with feeds.</p>'''))

S(section('Model', 'One program, three kinds of answerer', f'''
  <div class="vis">{cascade_vis()}</div>
  <div class="why"><p>vGLP is GLP plus <b>questions</b> to the person, each with an interactive type.</p><p>The type fixes which answers are allowed, not who answers.</p></div>'''))

S(section('Model', 'The UI language today: interface pragmas', split(
    '''<div class="box mono">Contacts: those Alice knows.
Establish: Alice [Establish]
Acquaint: Alice [Acquaint] &lt;person&gt;
  Bob: Alice wishes that you know each other.
Introduce: Alice [Introduce]
  Bob: Alice asks to introduce Carol to you.</div>
<div class="why"><p>A <b>tab</b> lists one predicate's atoms. A <b>[button]</b> is an act, offered only where it is possible; a <b>&lt;field&gt;</b> is typed in.</p>
<p>An indented line is a <b>question</b> to another person: a yes/no card. Optional <b>Look</b> line: an icon and a color.</p></div>''',
    '<img class="phones" src="img/gkk.jpg" alt="Knowledge app">', wide=True)))

S(section('Model', 'The type fixes content; the family, layout', split(
    '''<div class="box"><p>A <b>construct family</b> is a way of drawing questions that keeps their content: it decides layout, rendering and labels.</p>
<p>Where no widget is declared, the <b>default widget</b> is built from the type (right).</p></div>
<div class="why"><p>The theorems hold for every family with complete widgets, so a person may pick one.</p><p>Today: one family (vGLP, Remark 6.4).</p></div>''',
    widget_table())))

S(section('Observation', 'Why the screens feel weak', split(
    rows(['One tab per predicate: six or more tabs',
          'A person is split over three tabs',
          'Every act is a button: five for Carol',
          'Forms show raw names: “person”, “amount”',
          'A conversation is a list in another tab']),
    '<img class="phones" src="img/weak.jpg" alt="Bonds and Groups with feeds">', wide=True)))

S(section('Related work I', 'Generating a UI from a model', boxes([
    ('Cameleon, model-based UI', 'Calvary et al. 2003; W3C MBUI Notes 2014', 'Tasks → abstract UI → concrete UI → final UI. Our cascade is the same idea, starting from a contract.'),
    ('Naked Objects', 'Pawson, PhD thesis 2004', 'UI generated entirely from domain objects. Its generic UI was the main limit; custom views came later.'),
    ('iTasks', 'Plasmeijer et al. 2007; Lijnse, Plasmeijer 2009', 'Editors generated from types. Their quality is “crucial”; libraries add special editors, e.g. a map for a location.'),
    ('JSON Forms', 'EclipseSource, open source', 'A data schema plus an optional UI schema for layout; without one, a default layout.'),
]) + '<p class="why" style="margin-top:26px">Survey: “the usability of automatically generated UIs is rather low” (Meixner, Paternò, Vanderdonckt 2011).</p>'))

S(section('Related work II', 'One host, many small apps', boxes([
    ('WeChat mini programs', 'Tencent; W3C MiniApps white paper', 'The host fixes the frame (menu, launch page) and offers a design system, WeUI; apps own the pages.'),
    ('webxdc', 'Delta Chat, open spec', 'Web apps shared in a chat, state sent peer to peer; the chat shows each app’s latest summary line.'),
    ('Adaptive Cards', 'Microsoft, open spec', 'The author owns the content, the host owns the look; a card carries no code.'),
    ('A2UI', 'Google, 2025', 'Agents send declarative UI built from a catalog of trusted components; the client renders it natively.'),
]) + '<p class="why" style="margin-top:26px">In all four, the host cannot read what a small app means: it shows a card or runs code, but cannot merge two apps’ data.</p>'))

S(section('Lessons', 'Three lessons for us', rows([
    'Fully automatic UIs look generic; lasting systems add presentation hints',
    'Split content from look: the author says what, the host how. We have this',
    'Super-apps give a strong common frame; the small apps fill it',
])))

S(section('Proposal 1 · not implemented', 'Presentation patterns, chosen by shape', split(
    '''<div class="box"><p><b>Patterns:</b> people, conversation, holdings, items, places, times.</p>
<p>Chosen by a predicate's <b>shape</b> (who, what, when), never by the contract.</p><p>A tab may name its pattern:</p>
<p class="mono" style="font-size:24px;white-space:normal">Messages: those Alice received, as a conversation.</p>
<p>Unnamed: inferred from the shape.</p></div>
<div class="why">Like iTasks' special editors, but from a fixed list.</div>''',
    patterns_vis() + '<p class="cap">Sketch.</p>', wide=True)))

S(section('Proposal 2 · not implemented', 'Grassroots World: one app, by person', split(
    '''<div class="box"><p>Contracts all speak of persons, atoms and acts; a host can merge them:</p>
<p><b>A page per person:</b> Bob's atoms from all contracts, with every act possible with him.</p>
<p><b>One inbox</b> for every yes/no question.</p></div>
<div class="why">Opaque mini-apps (WeChat, webxdc) cannot merge.</div>''',
    person_vis() + '<p class="cap">Sketch; buttons named as in the contracts.</p>', wide=True)))

S(section('Summary', 'Content is derived; the look is still open', rows([
    'Our cascade is model-based UI with proofs; the look is left to families',
    'The weak look: one family, and pragmas carry no presentation',
    'Next: issue on patterns; person-first family on four contracts; user try',
    'Open: what belongs in the contract, what in the family, what to the person',
])))

slides.append(TITLE)

STYLE = '''<style>
.sub { font-size: 40px; color: var(--gray); margin-top: -16px; }
.split { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; margin-block: auto; }
.split.wide { grid-template-columns: 1.15fr 0.85fr; }
.box { background: var(--card); border-left: 10px solid var(--orange); border-radius: 0 18px 18px 0;
  padding: 24px 32px; font-size: 32px; line-height: 1.33; }
.box p { margin: 0 0 14px; } .box p:last-child { margin: 0; }
.mono { font-family: ui-monospace, Menlo, Consolas, monospace; white-space: pre; font-size: 26px; line-height: 1.5; }
.box.mono { font-size: 26px; }
.why { font-size: 30px; color: var(--gray); line-height: 1.33; margin-top: 22px; }
.why p { margin: 0 0 12px; }
.pic { display: flex; flex-direction: column; align-items: center; }
.pic svg { width: 100%; height: auto; max-height: 700px; }
.cap { font-size: 26px; color: var(--gray); text-align: center; margin-top: 10px; }
.vis { margin-block: auto; display: flex; justify-content: center; }
.vis svg { width: 100%; height: auto; max-height: 470px; }
.shot { display: block; margin: 16px auto 0; height: 560px; }
.phones { height: 600px; }
.rw { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 36px; margin-top: 10px; }
.rw .box { background: var(--card); border: 3px solid var(--gray-light); border-radius: 24px; padding: 24px 32px; }
.rw h3 { font-size: 40px; margin: 0 0 6px; }
.rw .who { font-size: 28px; color: var(--gray); margin: 0 0 10px; }
.rw .diff { font-size: 31px; margin: 0; line-height: 1.3; }
.rows .row p { font-size: 40px; margin: 0; }
table.wt { border-collapse: collapse; font-size: 27px; width: 100%; }
table.wt th { text-align: left; color: var(--gray); font-weight: 700; padding: 8px 16px; border-bottom: 3px solid var(--orange); }
table.wt td { padding: 9px 14px; border-bottom: 1px solid var(--gray-light); }
table.wt td:first-child { font-weight: 700; }
</style>'''

page = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Good-Looking Grassroots Apps · brief</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@300..900&display=swap">
<link rel="stylesheet" href="assets/deck.css">
''' + STYLE + '''
</head>
<body>
<div id="stage">
''' + '\n'.join(f'<!-- {i+1} -->{s}' for i, s in enumerate(slides)) + '''
</div>
<script src="assets/deck.js"></script>
</body>
</html>
'''
open(OUT, 'w').write(page)
print(len(slides), 'slides')
