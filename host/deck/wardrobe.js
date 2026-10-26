// What makes each Clawd on the deck his own: a hat, an accessory, a colour,
// and habits (how fast he types, how often he blinks, what he does
// while he waits). Sprites are rows of letters, 11 columns wide like Clawd;
// a hat is 4 rows that sit right on his head. Each hat has a few colour
// sets ({ letter: [r, g, b] }); '.' draws nothing.

const GREY = [95, 95, 105]
const TEAL = [130, 230, 210]

export const HATS = {
  // The classic: Clawd as he is everywhere else.
  tophat: {
    rows: ['...hhhhh...', '...hhhhh...', '...bbbbb...', '.hhhhhhhhh.'],
    colors: [
      { h: GREY, b: TEAL },
      { h: [40, 40, 46], b: [220, 60, 60] },
      { h: [90, 60, 130], b: [250, 200, 80] },
    ],
  },
  bowler: {
    rows: ['...........', '....hhh....', '...hhhhh...', '.hhbbbbbhh.'],
    colors: [
      { h: [60, 45, 35], b: [30, 24, 20] },
      { h: [40, 40, 46], b: [150, 150, 160] },
    ],
  },
  beanie: {
    rows: ['.....p.....', '...hhhhh...', '..hhhhhhh..', '..bbbbbbb..'],
    colors: [
      { h: [200, 50, 60], b: [240, 240, 240], p: [240, 240, 240] },
      { h: [50, 90, 200], b: [250, 210, 60], p: [250, 210, 60] },
      { h: [60, 150, 90], b: [235, 235, 235], p: [235, 235, 235] },
    ],
  },
  cowboy: {
    rows: ['....hhh....', '...hhhhh...', 'h..bbbbb..h', '.hhhhhhhhh.'],
    colors: [
      { h: [150, 95, 50], b: [70, 40, 20] },
      { h: [225, 200, 150], b: [120, 70, 40] },
    ],
  },
  crown: {
    rows: ['...........', '..b..b..b..', '..bb.b.bb..', '..bbbgbbb..'],
    colors: [
      { b: [250, 200, 60], g: [220, 40, 70] },
      { b: [200, 205, 215], g: [70, 120, 240] },
    ],
  },
  // The propeller turns: two frames.
  propeller: {
    rows: ['..ppppppp..', '.....s.....', '...hhhhh...', '..hhhhhhhh.'],
    spin: ['....ppp....', '.....s.....', '...hhhhh...', '..hhhhhhhh.'],
    colors: [
      { h: [230, 60, 60], p: [250, 210, 60], s: [80, 80, 80] },
      { h: [60, 120, 230], p: [240, 90, 90], s: [80, 80, 80] },
    ],
  },
  party: {
    rows: ['.....p.....', '....hhh....', '...hbhbh...', '..hhhhhhh..'],
    colors: [
      { h: [240, 90, 170], b: [250, 220, 70], p: [130, 230, 210] },
      { h: [90, 200, 120], b: [250, 250, 250], p: [250, 90, 90] },
    ],
  },
  chef: {
    rows: ['..hhh.hhh..', '..hhhhhhh..', '...hhhhh...', '...bbbbb...'],
    colors: [{ h: [245, 245, 245], b: [200, 200, 205] }],
  },
  wizard: {
    rows: ['.....h.....', '....hh.....', '...hbhh....', '.hhhhhhhhh.'],
    colors: [
      { h: [70, 60, 170], b: [250, 220, 80] },
      { h: [40, 110, 80], b: [220, 220, 240] },
    ],
  },
  cap: {
    rows: ['...........', '...hhhhh...', '..hhhhhhh..', '..hhhhhhbbb'],
    colors: [
      { h: [40, 80, 170], b: [30, 50, 110] },
      { h: [200, 40, 40], b: [140, 25, 25] },
      { h: [40, 40, 46], b: [130, 230, 210] },
    ],
  },
  beret: {
    rows: ['.......b...', '...hhhhhh..', '..hhhhhhhh.', '...........'],
    colors: [
      { h: [180, 30, 50], b: [120, 20, 30] },
      { h: [40, 40, 46], b: [20, 20, 22] },
    ],
  },
  viking: {
    rows: ['...........', 'b..hhhhh..b', 'b.hhhhhhh.b', '.bhhhhhhhb.'],
    colors: [{ h: [150, 150, 160], b: [240, 225, 190] }],
  },
  grad: {
    rows: ['.hhhhhhhhh.', '...hhhhh...', '...hhhhhb..', '........b..'],
    colors: [
      { h: [35, 35, 40], b: [250, 200, 60] },
      { h: [40, 50, 120], b: [235, 235, 235] },
    ],
  },
  halo: {
    rows: ['...bbbbb...', '..b.....b..', '...bbbbb...', '...........'],
    colors: [{ b: [250, 220, 110] }],
  },
}

// Worn on his face or body (render.js draws each), in one of its colours.
export const ACCESSORIES = {
  none: [[0, 0, 0]],
  glasses: [[40, 40, 46], [150, 60, 60], [60, 90, 170]],
  sunglasses: [[20, 20, 24]],
  bowtie: [[200, 40, 60], [60, 120, 220], [250, 200, 60]],
  scarf: [[60, 120, 220], [220, 60, 60], [90, 180, 110]],
  blush: [[250, 150, 160]],
  moustache: [[70, 45, 30], [35, 28, 24]],
}

// His colour: Clawd's own orange first, then colours that still read on
// every key's background (black, grey, red, teal, blue) and against his
// dark eyes.
export const BODIES = [
  [217, 119, 87],
  [95, 155, 245],
  [110, 205, 115],
  [175, 125, 235],
  [245, 135, 185],
  [240, 205, 85],
  [215, 215, 225],
  [95, 215, 235],
]
export const BODY_NAMES = ['Orange', 'Blue', 'Green', 'Purple', 'Pink', 'Yellow', 'White', 'Cyan']

// Habits: how he idles, works and waits for your move.
export const HABITS = {
  idle: ['glance', 'hop', 'sway', 'nod'],
  work: ['bob', 'lean', 'focused'],
  done: ['wave', 'look', 'bounce'],
}
export const TAP_MS = [160, 200, 240, 300]
export const BLINK_MS = [2800, 3600, 4400, 5600]

// The classic Clawd, for anyone not yet cast.
export const CLASSIC = {
  hat: 'tophat',
  hatColors: 0,
  accessory: 'none',
  accColor: 0,
  body: 0,
  idle: 'glance',
  work: 'bob',
  done: 'look',
  tapMs: 220,
  blinkMs: 4000,
  phase: 0,
  scene: 'night',
  sceneSeed: 7,
}
