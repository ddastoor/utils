#!/usr/bin/env python3
"""The data of the Emoji & Symbols tab → src/lib/emoji-data.json.

Emoji: the npm package emojibase-data (node_modules/emojibase-data/en — Unicode's emoji list with the CLDR names
and keywords, and every skin-tone variant spelled out), plus the shortcodes people know from GitHub and Slack
(":thumbsup:", ":pray:") and a few Indian words Unicode's keywords lack. Symbols: the lists below, each character
with its name from the Unicode Character Database (Python's unicodedata) and the words people look for it with.

    npm ci && python3 scripts/make-emoji-data.py

Layout of the file (compact; src/lib/emoji.ts reads it):
  groups   the nine emoji groups, in Unicode's order
  emoji    [group, emoji, name, "keyword|keyword|…", emoji version, [five skin tones]?]   in Unicode's order
  symbols  [[group name, [[character, name, "keyword|…"], …]], …]
"""
import json, os, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, 'node_modules', 'emojibase-data')
def read(*p):
    with open(os.path.join(BASE, *p), encoding='utf8') as f: return json.load(f)

pkg, data, messages = read('package.json'), read('en', 'data.json'), read('en', 'messages.json')
shortcodes = [read('en', 'shortcodes', n + '.json') for n in ('github', 'iamcal')]

GROUP_NAMES = {'smileys-emotion': 'Smileys & Emotion', 'people-body': 'People & Body', 'animals-nature': 'Animals & Nature',
               'food-drink': 'Food & Drink', 'travel-places': 'Travel & Places', 'activities': 'Activities', 'objects': 'Objects',
               'symbols': 'Symbols', 'flags': 'Flags'}
order = [g for g in sorted(messages['groups'], key=lambda g: g['order']) if g['key'] != 'component']
index = {g['order']: i for i, g in enumerate(order)}
groups = [GROUP_NAMES[g['key']] for g in order]

# words Unicode's English keywords do not have (India first)
EXTRA = {
    '🙏': 'namaste|namaskar|pranam|thank you|dhanyavad', '🇮🇳': 'india|bharat|hindustan|tiranga|indian', '☕': 'chai|tea|coffee', '🍵': 'chai|tea',
    '🫓': 'roti|chapati|naan|paratha', '🪔': 'diwali|deepavali|diya|puja|pooja|lamp', '🎆': 'diwali|deepavali', '🎇': 'diwali|deepavali|phuljhadi',
    '🛕': 'mandir|temple|puja|pooja', '🛺': 'auto|rickshaw|tuk tuk', '🥻': 'saree|sari', '🏏': 'cricket', '🍛': 'curry|dal chawal|biryani|thali',
    '🥭': 'mango|aam', '🐘': 'elephant|haathi', '🐅': 'tiger|bagh', '🦚': 'peacock|mor', '🪷': 'lotus|kamal', '🕉️': 'om|aum|hindu',
    '💰': 'money|paisa|rupees', '🪙': 'coin|paisa|rupee', '😂': 'lol|haha|laughing', '🤣': 'lol|rofl|haha|laughing', '👍': 'ok|okay|yes|good|like',
    '👌': 'ok|okay|perfect', '❤️': 'love|heart|dil|pyaar', '🎉': 'party|congrats|congratulations|celebrate|tada', '🎂': 'birthday|bday|cake',
    '😢': 'sad|cry', '😭': 'sad|cry|crying', '🔥': 'fire|lit|hot', '✅': 'done|yes|tick|check|ok', '❌': 'no|wrong|cross|x', '💯': '100|hundred|full marks',
}

emoji = []
for e in data:
    if e.get('group') is None or e['group'] not in index: continue  # regional indicators and the skin-tone / hair components
    kw = [t.lower() for t in e.get('tags', [])]
    for table in shortcodes:
        v = table.get(e['hexcode'])
        for s in ([v] if isinstance(v, str) else v or []):
            kw.append(s.replace('_', ' ').replace('-', ' '))
            if '_' in s: kw.append(s.replace('_', ''))
    kw += EXTRA.get(e['emoji'], '').split('|') if e['emoji'] in EXTRA else []
    name = e['label']
    seen, words = set(), []
    for k in kw:
        k = k.strip()
        if k and k != name.lower() and k not in seen: seen.add(k); words.append(k)
    row = [index[e['group']], e['emoji'], name, '|'.join(words), e['version']]
    if e.get('skins'):
        tones = {s['tone']: s['emoji'] for s in e['skins'] if isinstance(s['tone'], int)}
        assert sorted(tones) == [1, 2, 3, 4, 5], (name, sorted(tones))
        row.append([tones[t] for t in (1, 2, 3, 4, 5)])
    emoji.append((e['order'], row))
emoji = [r for _, r in sorted(emoji, key=lambda x: x[0])]
missing = [k for k in EXTRA if k not in {r[1] for r in emoji}]
assert not missing, missing

# ---------------------------------------------------------------- symbols
SYMBOLS = {
    'Arrows': '← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇑ ⇒ ⇓ ⇔ ⇕ ➔ ➜ ➤ ↩ ↪ ⤴ ⤵ ↻ ↺ ⟵ ⟶ ⟷',
    'Math': '± × ÷ = ≠ ≈ ≡ ≤ ≥ < > ∞ √ ∛ ∑ ∏ ∫ ∂ ∆ ∇ ° ‰ ∈ ∉ ⊂ ⊃ ∪ ∩ ∧ ∨ ¬ ∀ ∃ ∅ ∝ ∠ ⊥ ∥ ⅓ ⅔ ¼ ½ ¾ ⅕ ⅛ ⅜ ⅝ ⅞',
    'Greek': 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω',
    'Superscripts & subscripts': '⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁿ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋',
    'Currency': '₹ $ € £ ¥ ₩ ₽ ₺ ₪ ₫ ₦ ₱ ฿ ₿ ¢ ₣ ₴ ₸',
    'Punctuation': '“ ” ‘ ’ « » ‹ › … — – • · ¶ § † ‡ © ® ™ ℠ № ‽ ¡ ¿',
    'Check & stars': '✓ ✔ ✗ ✘ ☐ ☑ ☒ ★ ☆ ✦ ✧ ✪ ✩ ❤ ♥ ♡ ♦ ♣ ♠ ● ○ ◆ ◇ ■ □ ▲ △ ▼ ▽',
    'Misc': '☀ ☁ ☂ ☃ ☎ ☕ ☘ ☮ ☯ ☺ ♀ ♂ ⚠ ⚡ ⌘ ⌥ ⇧ ⌫ ⏎ ⎋ ⌚ ⌛ ✂ ✈ ✉ ✏ ♪ ♫ ∴ ∵',
}
# the words people look for a symbol with, where its Unicode name does not have them
ALIAS = {
    '←': 'left|back', '↑': 'up', '→': 'right|next|forward', '↓': 'down', '↔': 'left right|both ways', '↕': 'up down', '⇒': 'implies|double right',
    '⇔': 'if and only if|iff|equivalent', '↩': 'return|undo|back', '↪': 'redo|forward', '↻': 'refresh|reload|redo|clockwise', '↺': 'undo|anticlockwise|counterclockwise',
    '±': 'plus minus|plus or minus', '×': 'times|multiply|cross|x', '÷': 'divide|divided by|obelus', '=': 'equal|equals', '≠': 'not equal|unequal',
    '≈': 'approximately|approx|about|roughly', '≡': 'identical|equivalent|congruent', '≤': 'less than or equal|at most|lte', '≥': 'greater than or equal|at least|gte',
    '<': 'less than|lt', '>': 'greater than|gt|more than', '∞': 'infinity|infinite', '√': 'square root|sqrt|root|radical', '∛': 'cube root|cbrt',
    '∑': 'sum|sigma|summation', '∏': 'product|pi', '∫': 'integral|integrate', '∂': 'partial|derivative|del', '∆': 'delta|change|difference|triangle',
    '∇': 'nabla|del|gradient', '°': 'degree|degrees|temperature|angle', '‰': 'per mille|per thousand|permille', '∈': 'element of|in|belongs to|member',
    '∉': 'not in|not element of', '⊂': 'subset', '⊃': 'superset', '∪': 'union', '∩': 'intersection', '∧': 'and|logical and|wedge', '∨': 'or|logical or|vee',
    '¬': 'not|negation', '∀': 'for all|every|universal', '∃': 'there exists|exists|existential', '∅': 'empty set|null set|nothing', '∝': 'proportional',
    '∠': 'angle', '⊥': 'perpendicular|up tack', '∥': 'parallel', '⅓': 'one third|third|1/3', '⅔': 'two thirds|2/3', '¼': 'quarter|one fourth|1/4',
    '½': 'half|one half|1/2', '¾': 'three quarters|three fourths|3/4', '⅕': 'one fifth|1/5', '⅛': 'one eighth|1/8', '⅜': 'three eighths|3/8',
    '⅝': 'five eighths|5/8', '⅞': 'seven eighths|7/8',
    'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta|angle', 'ι': 'iota', 'κ': 'kappa',
    'λ': 'lambda|wavelength', 'μ': 'mu|micro', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron', 'π': 'pi|3.14', 'ρ': 'rho|density', 'σ': 'sigma|standard deviation',
    'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi|golden ratio', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega|angular', 'Γ': 'gamma|capital gamma', 'Δ': 'delta|capital delta|change',
    'Θ': 'theta|capital theta', 'Λ': 'lambda|capital lambda', 'Ξ': 'xi|capital xi', 'Π': 'pi|capital pi|product', 'Σ': 'sigma|capital sigma|sum',
    'Φ': 'phi|capital phi', 'Ψ': 'psi|capital psi', 'Ω': 'omega|ohm|capital omega',
    '⁰': 'power 0|to the 0', '¹': 'power 1|to the 1', '²': 'squared|square|power 2|to the 2', '³': 'cubed|cube|power 3|to the 3', '⁴': 'power 4|to the 4',
    '⁵': 'power 5', '⁶': 'power 6', '⁷': 'power 7', '⁸': 'power 8', '⁹': 'power 9', '⁺': 'superscript plus', '⁻': 'superscript minus|inverse', 'ⁿ': 'power n|nth|to the n',
    '₀': 'sub 0', '₁': 'sub 1', '₂': 'sub 2|h2o|co2', '₃': 'sub 3', '₄': 'sub 4', '₅': 'sub 5', '₆': 'sub 6', '₇': 'sub 7', '₈': 'sub 8', '₉': 'sub 9',
    '₊': 'subscript plus', '₋': 'subscript minus',
    '₹': 'rupee|rupees|inr|india|rs', '$': 'dollar|usd|peso', '€': 'euro|eur', '£': 'pound|gbp|sterling', '¥': 'yen|yuan|jpy|cny|rmb', '₩': 'won|krw|korea',
    '₽': 'ruble|rouble|rub|russia', '₺': 'lira|try|turkey', '₪': 'shekel|ils|israel', '₫': 'dong|vnd|vietnam', '₦': 'naira|ngn|nigeria', '₱': 'peso|php|philippines',
    '฿': 'baht|thb|thailand', '₿': 'bitcoin|btc|crypto', '¢': 'cent|cents', '₣': 'franc', '₴': 'hryvnia|uah|ukraine', '₸': 'tenge|kzt|kazakhstan',
    '“': 'open quote|curly quote|smart quote|inverted commas', '”': 'close quote|curly quote|smart quote|inverted commas', '‘': 'open single quote|curly apostrophe',
    '’': 'apostrophe|close single quote|curly apostrophe', '«': 'guillemet|angle quote|french quote', '»': 'guillemet|angle quote|french quote',
    '‹': 'single guillemet', '›': 'single guillemet', '…': 'ellipsis|dots|three dots|dot dot dot', '—': 'em dash|long dash', '–': 'en dash|dash|range',
    '•': 'bullet|dot|list', '·': 'middle dot|interpunct|centre dot|center dot', '¶': 'paragraph|pilcrow', '§': 'section|clause', '†': 'dagger|obelisk|footnote',
    '‡': 'double dagger|footnote', '©': 'copyright|c', '®': 'registered|registered trademark|r', '™': 'trademark|trade mark|tm', '℠': 'service mark|sm', '№': 'number|numero|no',
    '‽': 'interrobang', '¡': 'inverted exclamation|spanish', '¿': 'inverted question|spanish',
    '✓': 'tick|check|checkmark|done|yes|correct|right', '✔': 'tick|check|checkmark|done|yes|correct|bold tick', '✗': 'cross|x|wrong|no|incorrect', '✘': 'cross|x|wrong|no|bold cross',
    '☐': 'checkbox|empty box|unchecked|todo', '☑': 'checkbox|checked|ticked|done', '☒': 'checkbox|crossed|x box', '★': 'star|filled star|rating|favourite|favorite',
    '☆': 'star|empty star|outline star|rating', '✦': 'sparkle|star|four point star', '✧': 'sparkle|star', '✪': 'star|circled star', '✩': 'star|outline star',
    '❤': 'heart|love|red heart', '♥': 'heart|love|hearts|cards', '♡': 'heart|love|empty heart|outline heart', '♦': 'diamond|diamonds|cards', '♣': 'club|clubs|cards',
    '♠': 'spade|spades|cards', '●': 'circle|dot|filled circle|bullet', '○': 'circle|empty circle|outline circle', '◆': 'diamond|filled diamond', '◇': 'diamond|empty diamond',
    '■': 'square|filled square|block|stop', '□': 'square|empty square|box', '▲': 'triangle|up|increase', '△': 'triangle|empty triangle', '▼': 'triangle|down|decrease|dropdown',
    '▽': 'triangle|down|empty triangle',
    '☀': 'sun|sunny|weather', '☁': 'cloud|cloudy|weather', '☂': 'umbrella|rain', '☃': 'snowman|snow|winter', '☎': 'phone|telephone|call', '☕': 'coffee|tea|chai|cup',
    '☘': 'shamrock|clover|irish', '☮': 'peace', '☯': 'yin yang|balance|tao', '☺': 'smile|smiley|happy', '♀': 'female|woman|venus', '♂': 'male|man|mars',
    '⚠': 'warning|caution|alert|danger', '⚡': 'lightning|bolt|electric|power|thunder', '⌘': 'command|cmd|mac|apple', '⌥': 'option|alt|mac', '⇧': 'shift|caps',
    '⌫': 'backspace|delete', '⏎': 'enter|return', '⎋': 'escape|esc', '⌚': 'watch|time|clock', '⌛': 'hourglass|time|wait|sand timer', '✂': 'scissors|cut',
    '✈': 'plane|airplane|aeroplane|flight|travel', '✉': 'envelope|mail|email|letter', '✏': 'pencil|edit|write', '♪': 'music|note|song', '♫': 'music|notes|song',
    '∴': 'therefore|hence|so', '∵': 'because|since',
}
symbols, seen = [], set()
for group, chars in SYMBOLS.items():
    rows = []
    for c in chars.split(' '):
        assert len(c) == 1 and c not in seen, (group, c); seen.add(c)
        name = unicodedata.name(c).lower()
        name = name[0].upper() + name[1:]
        for word in ('greek', 'indian', 'latin'): name = name.replace(' ' + word + ' ', ' ' + word.capitalize() + ' ')
        rows.append([c, name, ALIAS.get(c, '')])
    symbols.append([group, rows])
unused = [c for c in ALIAS if c not in seen]
assert not unused, unused

out = {'source': f"emojibase-data {pkg['version']}", 'unicode': unicodedata.unidata_version, 'groups': groups, 'emoji': emoji, 'symbols': symbols}
path = os.path.join(ROOT, 'src', 'lib', 'emoji-data.json')
with open(path, 'w', encoding='utf8') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':')); f.write('\n')
print(f"{len(emoji)} emoji in {len(groups)} groups ({sum(1 for r in emoji if len(r) > 5)} with skin tones), {sum(len(r) for _, r in symbols)} symbols in {len(symbols)} groups → {os.path.getsize(path):,} bytes")
