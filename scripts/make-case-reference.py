#!/usr/bin/env python3
"""Reference for the Case Converter's Title Case (tests/unit/caseconv.test.mjs).

Title Case in textkit.wasm follows John Gruber's rules as the Python package `titlecase` carries them out. This
script runs that package (2.4.1) on its own 72 test titles and on the titles below and writes
tests/fixtures/caseconv/reference.json: [[title, what the package makes of it], …]. The unit suite demands the same
answer from the engine, except for the differences it lists with their reasons.

  pip install titlecase regex
  python3 scripts/make-case-reference.py
"""
import json, os
from titlecase import titlecase
import titlecase.tests as package_tests

TITLES = [
    "the quick brown fox jumps over the lazy dog", "a tale of two cities: the best of times and what it is for", "the NASA iPhone app at example.com",
    "don’t stop me now", "war and peace\nof mice and men", "what is it for? a tale of two", "THE WHOLE THING IN CAPITALS", "state-of-the-art e-mail",
    "he said \"a tale of\" it", "Q&A with steve jobs: 'that's what happens in technology'", "this vs. that v. other", "mcdonald and macdonald",
    "u.s.a. today and the U.S.A.", "and/or either/or", "2nd time at 3pm", "über uns: élan vital", "नमस्ते दुनिया", "'tis the season",
    "in the at&t store with AT&T", "the_underscored_one", "hello - world — and – more", "is it i or I?", "read the f.a.q. now",
    "notes on the (very) small: a study", "\"a quoted start\" and an end of", "mcdonald mccoy mcrae mckinsey", "this vs. the other",
    "o'neil d'artagnan o'clock l'amour", "it's the dog's dinner", "“smart quotes” and ‘single’ of", "über-cool non-english of", "end with to",
    "(a) parenthetical start", "one. a two? an three! the four; of five: in six", "x-ray of e-commerce and re-entry", "step-by-step how-to",
    "what's in a name?", "i am", "v2.0 release of app.js", "a", "of", "", "ALL CAPS WITH A.B. AND NASA", "gst invoice for the upi payment",
    "the lord of the rings: the return of the king", "an introduction to c++ and c#", "from here to eternity", "gone with the wind",
    "to be or not to be", "the", "a b c", "1984", "20,000 leagues under the sea", "top 10 tips for 2026", "hello\n\nworld of\n", "mr and mrs smith",
    "dr no", "ms marvel", "the mr. men show", "MR SMITH GOES TO WASHINGTON", "STATE-OF-THE-ART", "IN THE END", "e.g. this and i.e. that", "über",
    "émile zola: j'accuse", "el niño and la niña", "привет мир и все", "ελληνικά και άλλα", "straße in münchen", "İstanbul and ıssız", "ﬁrst ﬂight of",
    "the art of war (and peace)", "a guide to the (un)known", "[draft] the plan for the year", "the plan [draft] of", "love in the time of cholera",
    "as you like it", "if on a winter's night a traveler", "by the pricking of my thumbs", "en route to mumbai", "via dolorosa", "at swim-two-birds",
    "but is it art?", "or else", "an", "on the road", "up and at 'em", "the who: live at leeds", "who's afraid of virginia woolf?",
    "i, robot", "me and you and everyone we know", "the 39 steps", "2001: a space odyssey", "se7en", "wall-e", "x-men: days of future past",
    "iPhone 17 pro max review", "eBay vs. amazon: a comparison", "how to use GitHub and gitLab", "the iPad and the iMac", "McDonald's and the big mac",
    "mcdonald's menu", "MCDONALD'S MENU", "old macdonald had a farm", "o'reilly on the o'hare flight", "d'angelo and l'oréal", "rock 'n' roll",
    "the 'best' of the best", "\"hello,\" she said", "hello... is it me you're looking for?", "wait - what", "yes; and no", "ready? set! go",
    "http://example.com/path of the url", "mail me at someone@example.com", "the c:\\windows\\system32 folder", "50% off - today only",
    "#hashtag and @mention of", "$100 for the win", "a/b testing and i/o ports", "24/7 support and the 9-to-5", "tcp/ip and http/2",
    "the up-and-coming all-in-one", "mother-in-law's tongue", "a one-on-one with the in-house team", "pre- and post-war", "re: your mail",
    "note: the end", "warning - a test", "first.second third", "  leading spaces", "trailing spaces  ", "two  spaces in the middle",
]

def one(text):
    return titlecase(text, preserve_blank_lines=True)

seen, pairs = set(), []
for text in [t[0] for t in package_tests.TEST_DATA] + TITLES:
    if text in seen: continue
    seen.add(text)
    pairs.append([text, one(text)])
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'tests', 'fixtures', 'caseconv', 'reference.json')
json.dump({'package': len(package_tests.TEST_DATA), 'titles': pairs}, open(out, 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
bad = [t for t in package_tests.TEST_DATA if one(t[0]) != t[1]]
print(len(pairs), 'titles;', len(package_tests.TEST_DATA), 'of the package,', len(bad), 'of which the package itself does not pass')
