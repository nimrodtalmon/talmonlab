/* The flows the regression tests walk, each on a fresh page, as Alice.  Each returns nothing, or throws. */
module.exports = {
  /* the Grassroots App's Home: the first app, by the hint to Install and the way the contract gives to it */
  'home-first-app': {url: '?c=app', async run(A, shot) {
    await A.tap('Set up my identity');
    await A.tap('No', '.rule');
    await A.tap('Make friends');
    await A.fill('.sheet input', 'carol');
    await A.tap('Make friends', '.sheet');
    await A.has('Chess · Carol', 8000);
    await shot('1-new-apps');
    await A.tap('Chess · Carol');
    await A.has('To Install: it needs that you trust Carol as a developer.');
    await A.has('then Install');
    await shot('2-install-hint');
    await A.tap('Trust this developer', '.hint');
    await A.has(/\| Install \|/);
    await A.lacks('To Install');
    await shot('3-install-offered');
    await A.tapSel('button[data-k*="act:install "], button[data-k$="act:install"]');
    /* THEN IT: the app's own screen, as the list of installed apps opens it */
    await A.has('Open Chess', 5000);
    await shot('4-then-it-app');
    await A.tap('Open Chess');
    await A.has('Set up my identity', 5000);
    await shot('5-chess-opened');
  }},
  /* Chess: the hint to a new game, a friend made by it, the game opened by THEN IT, a move and Carol's reply */
  'chess': {url: '?c=chess', async run(A, shot) {
    await A.tap('Set up my identity');
    await A.has('To New game: it needs that you count someone as a friend.');
    await shot('1-new-game-hint');
    await A.tap('Make friends', '.hint');
    await A.fill('.sheet input', 'carol');
    await A.tap('Make friends', '.sheet');
    await A.has('Carol', 6000);
    await A.tap('Games', '.tbar');
    await A.has('They come with “New game”');
    await shot('2-empty-list-hint');
    await A.tap('New game');
    await A.tapSel('.sheet button.pri');
    await A.has('Your turn: tap to Move', 6000);
    await shot('3-then-it-game');
    await A.tapSel('.cb [data-tap="e2"]');
    await A.tapSel('.cb [data-tap="e4"]');
    await A.has('Not your turn', 4000);
    await shot('4-moved');
    await A.has('Your turn: tap to Move', 10000);
    await shot('5-carol-replied');
  }},
  /* Village: an organization started from its landmark; its role field labeled; THEN IT to the organization */
  'village-org': {url: '?c=village', async run(A, shot) {
    await A.tap('Set up my identity');
    await A.tap('Orgs', '.lmk');
    await A.tap('Start an organization');
    await A.has('Your role in it');
    await shot('1-org-sheet');
    await A.fill('.sheet input[placeholder="Your role in it"]', 'Chair');
    await A.tapSel('.sheet [data-fgo]');
    await A.has('Org1', 5000);
    await A.has('Propose a motion');
    await shot('2-then-it-org');
  }},
  /* Groups: a group made, THEN IT to it, and a post */
  'groups-post': {url: '?c=groups', async run(A, shot) {
    await A.tap('Set up my identity');
    await A.tap('New group');
    await A.tapSel('.sheet [data-namego]');
    await A.has('No messages yet', 5000);
    await shot('1-then-it-group');
    await A.fill('[data-compose]', 'Hello hikers');
    await A.tapSel('[data-send]');
    await A.has('Hello hikers', 5000);
    await shot('2-posted');
  }},
  /* Help, from the contract */
  'help': {url: '?c=app', async run(A, shot) {
    await A.tapSel('[data-help]');
    await A.has('What you can do here');
    await A.has('Not now: it needs that');
    await shot('1-help');
  }},
  /* an act that only ends facts takes a second tap */
  'confirm-ending': {url: '?c=chess', async run(A, shot) {
    await A.tap('Set up my identity');
    await A.tap('Make friends', '.hint');
    await A.fill('.sheet input', 'carol');
    await A.tap('Make friends', '.sheet');
    await A.has('Carol', 6000);
    await A.tap('Friends', '.tbar').catch(() => {});
    await A.tapSel('[data-nav]');
    await A.tapSel('[data-menu]');
    await A.tap('End friendship', '.sheet');
    await A.has('may end');
    await A.lacks('End friendship: done');
    await shot('1-confirm');
    await A.tapSel('.sheet [data-opt="0"]');
    await A.has('End friendship: done', 4000);
    await shot('2-ended');
  }}
};
