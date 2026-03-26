import type Database from 'better-sqlite3';

// Each category has 15+ emojis. Projects get assigned a category,
// then both the project and its panels draw emojis from that category.
// All emojis are globally unique across projects + panels.

const EMOJI_CATEGORIES: Record<string, string[]> = {
  // Removed face/body duplicates (🐕≈🐶, 🐈≈🐱, 🐇≈🐰, 🐓≈🐔, 🐖≈🐷, 🐄🐂🐃≈🐮, 🐎≈🐴, 🐁≈🐭)
  pets: [
    '🐶','🐱','🐭','🐹','🐰','🐮','🐷','🐸','🐵','🐔',
    '🐴','🐩','🐀','🐐','🐑',
  ],
  // Removed 🐅≈🐯, 🐫≈🐪
  wild: [
    '🦊','🐻','🐼','🐨','🐯','🦁','🐺','🐗','🦄','🐢',
    '🐍','🦎','🦖','🦕','🐊','🐆','🦓','🦍','🦧','🐘',
    '🦛','🦏','🐪','🦒','🦘','🦌','🦙','🦝','🦨','🦡',
    '🦫','🦦','🦥','🦔',
  ],
  // Removed 🕸️ (not a bug)
  insects: [
    '🐝','🐛','🦋','🐌','🐞','🐜','🪲','🪳','🦟','🦗',
    '🪰','🦂','🪱','🕷️',
  ],
  // Removed 🐥≈🐤
  birds: [
    '🐦','🦆','🦅','🦉','🐧','🦃','🦚','🦜','🦢','🦩',
    '🕊️','🦤','🐣','🐤','🪶',
  ],
  sea: [
    '🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳',
    '🐋','🦈','🪸','🦭','🐚',
  ],
  // Removed 🍏≈🍎
  fruits: [
    '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍈','🍒',
    '🍑','🥭','🍍','🥥','🥝','🫐','🍅',
  ],
  vegetables: [
    '🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅',
    '🥔','🍠','🫑','🥜','🫘','🫛',
  ],
  // Removed 🍖≈🍗, 🍛≈🍲 (bowls), 🍚≈🍙 (rice), 🍢≈🍡 (sticks)
  dishes: [
    '🍳','🥞','🧇','🥓','🥩','🍗','🌭','🍔','🍟','🍕',
    '🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍣','🍱','🥟',
    '🍤','🍙','🍘','🍥','🥠','🍡',
  ],
  // Removed 🍨≈🍦 (ice cream), 🍰≈🧁 (cake slices)
  sweets: [
    '🍧','🍦','🥧','🧁','🎂','🍮','🍭','🍬','🍫','🍿',
    '🍩','🍪','🍯','🥐','🥖','🥨','🧀','🥚',
  ],
  // Removed 🍂≈🍁 (leaves), 🥀≈🌹 (roses)
  plants: [
    '🌵','🎄','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🎍',
    '🪴','🎋','🍃','🍁','🌺','🌸','🌼','🌻','🌹','🌷',
    '🌾','💐','🪻','🪷',
  ],
  // Removed 🚔≈🚓, 🚘🚖 (generic cars), 🚍≈🚌
  road_vehicles: [
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐',
    '🛻','🚚','🚛','🚜','🛵','🏍️','🚲','🛴','🛺',
  ],
  // Removed 🚠🚟≈🚡 (cable cars), 🚃🚋🚞🚝🚅🚈🚆≈trains (kept 4 distinct)
  // Removed 🚢≈🛳️
  transport: [
    '🚡','🚂','🚄','🚇','🚊','🛩️','✈️','🚀','🛸','🚁',
    '🛶','⛵','🚤','🛳️','⛴️',
  ],
  // Removed 🏡≈🏠, 🏣🏤🏨🏩🏬≈similar buildings, 🛕🕍🕋≈🕌
  buildings: [
    '🏠','🏢','🏥','🏦','🏪','🏫','🏭','🏯','🏰','💒',
    '🗼','🗽','⛪','🕌','⛩️','⛲','🏗️',
  ],
  // Removed 🥎≈⚾, 🏑≈🏒
  sports: [
    '⚽','🏀','🏈','⚾','🎾','🏐','🏉','🥏','🎱','🏓',
    '🏸','🏒','🥍','🏏','🥅','⛳','🏹','🎣','🥊','🥋',
    '🎽','🛹','🛼','🛷','⛸️','🥌','🎿',
  ],
  // Removed 👡👞🥾≈shoes (kept heel/boot/sneaker), 👝👛≈bags
  clothing: [
    '👒','🧢','🎩','👑','💍','👓','🕶️','🥽','🧣','🧤',
    '🧥','🧦','👗','👘','👠','👢','👟','🎒','👜','💼',
    '🧳','💎',
  ],
  // Removed 📀≈💿, 🎚️≈🎛️, 📸≈📷
  electronics: [
    '📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','🔌','💡',
    '🔦','📡','📺','📻','🎙️','🎛️','📷','🔭','🔬',
  ],
  // Removed 📍≈📌, 📂🗂️≈📁, 📆≈📅, 📈📉≈📊, 🖊️≈🖋️
  stationery: [
    '📎','📏','📐','✂️','📌','🖇️','📝','📋','📁','📅',
    '📇','📊','📈','✏️','🖋️',
  ],
  // Removed 🌤️🌥️🌦️≈cloud variants, 🌩️≈⛈️, 🌟💫≈⭐
  weather: [
    '☀️','⛅','☁️','🌧️','⛈️','🌨️','❄️','🌬️','🌪️','🌫️',
    '🌈','⭐','✨','☄️','🌙',
  ],
  // Removed 🗝️≈🔑
  furniture: [
    '🪑','🛋️','🛏️','🪞','🚿','🛁','🪥','🧴','🧹','🧺',
    '🧻','🪣','🧽','🔑','🚪','🪜',
  ],
  // Removed ⚒️🛠️≈🔨 (hammers)
  tools: [
    '🔨','⛏️','🪚','🔩','⚙️','🪤','🪓','🗡️','⚔️','🛡️',
    '🧰','🪛','🪝','🔧','🧲',
  ],
  // Removed 👊🤛≈✊ (fists), 👐≈🤲 (palms), 🤟≈🤘, 🤞≈✌️, 👉👇☝️≈pointing
  gestures: [
    '👍','👎','✊','🤜','👏','🙌','🤝','🤲','✌️','🤘',
    '👌','🤌','🤏','👈','👆',
  ],
};

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES);

/** Get all emojis currently used across panel tables */
function getUsedEmojis(db: Database.Database): Set<string> {
  const used = new Set<string>();
  for (const table of ['terminals', 'notes', 'iframes']) {
    const rows = db.prepare(`SELECT emoji FROM ${table} WHERE emoji IS NOT NULL`).all() as { emoji: string }[];
    for (const r of rows) used.add(r.emoji);
  }
  return used;
}

/** Pick a random element from an array */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Assign a category to a new project (no emoji for projects, only panels) */
export function assignProjectCategory(db: Database.Database): string {
  const usedCategories = new Set(
    (db.prepare('SELECT DISTINCT emoji_category FROM projects WHERE emoji_category IS NOT NULL').all() as { emoji_category: string }[])
      .map(r => r.emoji_category)
  );

  const unusedCategories = CATEGORY_NAMES.filter(c => !usedCategories.has(c));

  if (unusedCategories.length > 0) {
    return pickRandom(unusedCategories);
  }

  // All categories taken — reuse the one with fewest projects
  const counts = db.prepare(
    'SELECT emoji_category, COUNT(*) as cnt FROM projects WHERE emoji_category IS NOT NULL GROUP BY emoji_category ORDER BY cnt ASC'
  ).all() as { emoji_category: string; cnt: number }[];
  return counts[0]?.emoji_category || CATEGORY_NAMES[0];
}

/** Assign an emoji to a new panel (terminal/note/iframe) within a project */
export function assignPanelEmoji(db: Database.Database, projectId: number): string {
  const project = db.prepare('SELECT emoji_category FROM projects WHERE id = ?').get(projectId) as { emoji_category: string } | undefined;
  const used = getUsedEmojis(db);

  // Try project's category first
  if (project?.emoji_category) {
    const pool = EMOJI_CATEGORIES[project.emoji_category] || [];
    const available = pool.filter(e => !used.has(e));
    if (available.length > 0) return pickRandom(available);
  }

  // Overflow: try all other categories
  for (const cat of CATEGORY_NAMES) {
    if (cat === project?.emoji_category) continue;
    const available = EMOJI_CATEGORIES[cat].filter(e => !used.has(e));
    if (available.length > 0) return pickRandom(available);
  }

  return '❓';
}

// --- Name generation ---

const ADJECTIVES = [
  'Amazing','Atomic','Awesome','Blazing','Bold',
  'Brave','Brilliant','Cosmic','Daring','Dazzling',
  'Epic','Eternal','Fabulous','Fearless','Fierce',
  'Funky','Galactic','Glorious','Grand','Heroic',
  'Hyper','Incredible','Infinite','Legendary','Luminous',
  'Majestic','Marvelous','Mega','Mighty','Noble',
  'Outstanding','Phenomenal','Powerful','Prime','Quantum',
  'Radiant','Regal','Savage','Spectacular','Stellar',
  'Supreme','Swift','Titan','Turbo','Ultimate',
  'Ultra','Unstoppable','Valiant','Vibrant','Wondrous',
];

const EMOJI_NAMES: Record<string, string> = {
  // pets
  '🐶':'Dog','🐱':'Cat','🐭':'Mouse','🐹':'Hamster','🐰':'Rabbit',
  '🐮':'Cow','🐷':'Pig','🐸':'Frog','🐵':'Monkey','🐔':'Chicken',
  '🐴':'Horse','🐩':'Poodle','🐀':'Rat','🐐':'Goat','🐑':'Sheep',
  // wild
  '🦊':'Fox','🐻':'Bear','🐼':'Panda','🐨':'Koala','🐯':'Tiger',
  '🦁':'Lion','🐺':'Wolf','🐗':'Boar','🦄':'Unicorn','🐢':'Turtle',
  '🐍':'Snake','🦎':'Lizard','🦖':'T-Rex','🦕':'Bronto','🐊':'Croc',
  '🐆':'Leopard','🦓':'Zebra','🦍':'Gorilla','🦧':'Orangutan','🐘':'Elephant',
  '🦛':'Hippo','🦏':'Rhino','🐪':'Camel','🦒':'Giraffe','🦘':'Kangaroo',
  '🦌':'Deer','🦙':'Llama','🦝':'Raccoon','🦨':'Skunk','🦡':'Badger',
  '🦫':'Beaver','🦦':'Otter','🦥':'Sloth','🦔':'Hedgehog',
  // insects
  '🐝':'Bee','🐛':'Caterpillar','🦋':'Butterfly','🐌':'Snail','🐞':'Ladybug',
  '🐜':'Ant','🪲':'Beetle','🪳':'Cockroach','🦟':'Mosquito','🦗':'Cricket',
  '🪰':'Fly','🦂':'Scorpion','🪱':'Worm','🕷️':'Spider',
  // birds
  '🐦':'Sparrow','🦆':'Duck','🦅':'Eagle','🦉':'Owl','🐧':'Penguin',
  '🦃':'Turkey','🦚':'Peacock','🦜':'Parrot','🦢':'Swan','🦩':'Flamingo',
  '🕊️':'Dove','🦤':'Dodo','🐣':'Hatchling','🐤':'Chick','🪶':'Quill',
  // sea
  '🐙':'Octopus','🦑':'Squid','🦐':'Shrimp','🦞':'Lobster','🦀':'Crab',
  '🐡':'Pufferfish','🐠':'Angelfish','🐟':'Fish','🐬':'Dolphin','🐳':'Whale',
  '🐋':'Humpback','🦈':'Shark','🪸':'Coral','🦭':'Seal','🐚':'Shell',
  // fruits
  '🍎':'Apple','🍐':'Pear','🍊':'Orange','🍋':'Lemon','🍌':'Banana',
  '🍉':'Watermelon','🍇':'Grape','🍓':'Strawberry','🍈':'Melon','🍒':'Cherry',
  '🍑':'Peach','🥭':'Mango','🍍':'Pineapple','🥥':'Coconut','🥝':'Kiwi',
  '🫐':'Blueberry','🍅':'Tomato',
  // vegetables
  '🍆':'Eggplant','🥑':'Avocado','🥦':'Broccoli','🥬':'Cabbage','🥒':'Cucumber',
  '🌶️':'Chili','🌽':'Corn','🥕':'Carrot','🧄':'Garlic','🧅':'Onion',
  '🥔':'Potato','🍠':'Yam','🫑':'Pepper','🥜':'Peanut','🫘':'Bean','🫛':'Pea',
  // dishes
  '🍳':'Omelette','🥞':'Pancake','🧇':'Waffle','🥓':'Bacon','🥩':'Steak',
  '🍗':'Drumstick','🌭':'Hotdog','🍔':'Burger','🍟':'Fries','🍕':'Pizza',
  '🌮':'Taco','🌯':'Burrito','🥗':'Salad','🥘':'Paella','🍝':'Spaghetti',
  '🍜':'Ramen','🍲':'Stew','🍣':'Sushi','🍱':'Bento','🥟':'Dumpling',
  '🍤':'Tempura','🍙':'Onigiri','🍘':'Senbei','🍥':'Narutomaki','🥠':'Fortune Cookie',
  '🍡':'Dango',
  // sweets
  '🍧':'Granita','🍦':'Ice Cream','🥧':'Pie','🧁':'Cupcake','🎂':'Cake',
  '🍮':'Flan','🍭':'Lollipop','🍬':'Candy','🍫':'Chocolate','🍿':'Popcorn',
  '🍩':'Donut','🍪':'Cookie','🍯':'Honey','🥐':'Croissant','🥖':'Baguette',
  '🥨':'Pretzel','🧀':'Cheese','🥚':'Egg',
  // plants
  '🌵':'Cactus','🎄':'Pine','🌲':'Spruce','🌳':'Oak','🌴':'Palm',
  '🌱':'Seedling','🌿':'Herb','☘️':'Shamrock','🍀':'Clover','🎍':'Bamboo',
  '🪴':'Bonsai','🎋':'Willow','🍃':'Leaf','🍁':'Maple','🌺':'Hibiscus',
  '🌸':'Sakura','🌼':'Daisy','🌻':'Sunflower','🌹':'Rose','🌷':'Tulip',
  '🌾':'Wheat','💐':'Bouquet','🪻':'Hyacinth','🪷':'Lotus',
  // road_vehicles
  '🚗':'Car','🚕':'Taxi','🚙':'SUV','🚌':'Bus','🚎':'Trolley',
  '🏎️':'Racer','🚓':'Patrol','🚑':'Ambulance','🚒':'Firetruck','🚐':'Van',
  '🛻':'Pickup','🚚':'Truck','🚛':'Semi','🚜':'Tractor','🛵':'Scooter',
  '🏍️':'Motorbike','🚲':'Bicycle','🛴':'Kickboard','🛺':'Rickshaw',
  // transport
  '🚡':'Gondola','🚂':'Locomotive','🚄':'Bullet','🚇':'Metro','🚊':'Tram',
  '🛩️':'Jet','✈️':'Plane','🚀':'Rocket','🛸':'UFO','🚁':'Chopper',
  '🛶':'Canoe','⛵':'Sailboat','🚤':'Speedboat','🛳️':'Cruiser','⛴️':'Ferry',
  // buildings
  '🏠':'House','🏢':'Office','🏥':'Hospital','🏦':'Bank','🏪':'Store',
  '🏫':'School','🏭':'Factory','🏯':'Pagoda','🏰':'Fortress','💒':'Chapel',
  '🗼':'Tower','🗽':'Liberty','⛪':'Church','🕌':'Mosque','⛩️':'Shrine',
  '⛲':'Fountain','🏗️':'Crane',
  // sports
  '⚽':'Soccer','🏀':'Basketball','🏈':'Football','⚾':'Baseball','🎾':'Tennis',
  '🏐':'Volleyball','🏉':'Rugby','🥏':'Frisbee','🎱':'Pool','🏓':'Paddle',
  '🏸':'Shuttlecock','🏒':'Hockey','🥍':'Lacrosse','🏏':'Cricket','🥅':'Goal',
  '⛳':'Golf','🏹':'Archery','🎣':'Fishing','🥊':'Boxing','🥋':'Karate',
  '🎽':'Jersey','🛹':'Skateboard','🛼':'Rollerblade','🛷':'Sled','⛸️':'Ice Skate',
  '🥌':'Curling','🎿':'Skiing',
  // clothing
  '👒':'Sunhat','🧢':'Cap','🎩':'Tophat','👑':'Crown','💍':'Ring',
  '👓':'Glasses','🕶️':'Shades','🥽':'Goggles','🧣':'Scarf','🧤':'Gloves',
  '🧥':'Coat','🧦':'Socks','👗':'Dress','👘':'Kimono','👠':'Stiletto',
  '👢':'Boot','👟':'Sneaker','🎒':'Backpack','👜':'Handbag','💼':'Briefcase',
  '🧳':'Suitcase','💎':'Diamond',
  // electronics
  '📱':'Phone','💻':'Laptop','⌨️':'Keyboard','🖥️':'Monitor','🖨️':'Printer',
  '🖱️':'Cursor','💾':'Floppy','💿':'Disc','🔌':'Plug','💡':'Bulb',
  '🔦':'Torch','📡':'Satellite','📺':'TV','📻':'Radio','🎙️':'Mic',
  '🎛️':'Mixer','📷':'Camera','🔭':'Telescope','🔬':'Microscope',
  // stationery
  '📎':'Clip','📏':'Ruler','📐':'Triangle','✂️':'Scissors','📌':'Pin',
  '🖇️':'Staple','📝':'Memo','📋':'Clipboard','📁':'Folder','📅':'Calendar',
  '📇':'Index','📊':'Chart','📈':'Graph','✏️':'Pencil','🖋️':'Pen',
  // weather
  '☀️':'Sun','⛅':'Cloudy','☁️':'Cloud','🌧️':'Rain','⛈️':'Thunder',
  '🌨️':'Blizzard','❄️':'Snowflake','🌬️':'Wind','🌪️':'Tornado','🌫️':'Fog',
  '🌈':'Rainbow','⭐':'Star','✨':'Sparkle','☄️':'Comet','🌙':'Moon',
  // furniture
  '🪑':'Chair','🛋️':'Couch','🛏️':'Bed','🪞':'Mirror','🚿':'Shower',
  '🛁':'Bathtub','🪥':'Toothbrush','🧴':'Lotion','🧹':'Broom','🧺':'Basket',
  '🧻':'Roll','🪣':'Bucket','🧽':'Sponge','🔑':'Key','🚪':'Door','🪜':'Ladder',
  // tools
  '🔨':'Hammer','⛏️':'Pickaxe','🪚':'Saw','🔩':'Bolt','⚙️':'Gear',
  '🪤':'Trap','🪓':'Axe','🗡️':'Dagger','⚔️':'Swords','🛡️':'Shield',
  '🧰':'Toolbox','🪛':'Screwdriver','🪝':'Hook','🔧':'Wrench','🧲':'Magnet',
  // gestures
  '👍':'Thumbsup','👎':'Thumbsdown','✊':'Fist','🤜':'Punch','👏':'Clap',
  '🙌':'Cheer','🤝':'Handshake','🤲':'Palms','✌️':'Peace','🤘':'Rock',
  '👌':'OK','🤌':'Pinch','🤏':'Tiny','👈':'Point','👆':'Up',
};

/** Generate a fun default name for a panel: "[Adjective] [Emoji Name]" */
export function generatePanelName(emoji: string): string {
  const name = EMOJI_NAMES[emoji] || 'Panel';
  const adj = pickRandom(ADJECTIVES);
  return `${adj} ${name}`;
}

/** Get the list of category names (for reference/debugging) */
export function getCategoryNames(): string[] {
  return [...CATEGORY_NAMES];
}
