//! Lorem ipsum (feature "lorem" → textkit-lorem.wasm): the Markov chain of the `lipsum` crate (Martin Geisler, MIT;
//! the Lorem generator of the Rust ecosystem) over the crate's own two texts — the classic Lorem ipsum passage and
//! Cicero's *De finibus bonorum et malorum*, book I — with our glue around it:
//! - each text is learned as a circle (the chain of the crate jumps to a random place at a text's end, dropping its
//!   last word and splicing two half-sentences);
//! - the texts are cleaned before the chain learns them: quotation marks (they came out unbalanced), dashes and
//!   footnote marks, brackets, and Roman initials ("L. Torquato" — the full stop ended a sentence in the middle of a
//!   name) are left out;
//! - a text begins where one of Cicero's sentences begins, or with the classic first sentence word for word;
//! - a sentence ends at its full stop, question or exclamation mark, or — Cicero's run to a hundred words — at the
//!   first comma, colon or semicolon after 24 words (made a full stop), and at 40 words at the latest;
//! - paragraphs of 4 to 8 sentences; exactly the number of paragraphs, sentences or words asked for.
use lipsum::{MarkovChain, LIBER_PRIMUS, LOREM_IPSUM};
use rand::{seq::SliceRandom, Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;

/// The first sentence of the classic passage, as typesetters have used it since the 1960s.
pub const CLASSIC: &str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const SOFT: usize = 24;
const HARD: usize = 40;

struct Model { chain: MarkovChain<'static>, starts: Vec<(&'static str, &'static str)> }
thread_local! { static MODEL: Model = model(); }

fn ends_sentence(w: &str) -> bool { w.ends_with(['.', '!', '?']) }

/// The words of a text as the chain should learn them.
pub(crate) fn clean(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for tok in text.split_whitespace() {
        let bare: String = tok.chars().filter(|c| !matches!(c, '\'' | '"' | '(' | ')' | '*')).collect();
        if bare.is_empty() { continue; } // "**"
        if bare.starts_with('-') { // a dash ("--", "--,"): its punctuation goes to the word before
            let mark = bare.trim_start_matches('-');
            if let Some(prev) = out.last_mut() { if !mark.is_empty() && !prev.ends_with(|c: char| c.is_ascii_punctuation()) { prev.push_str(mark); } }
            continue;
        }
        let body = bare.trim_end_matches(|c: char| c.is_ascii_punctuation());
        if body.is_empty() || body.contains(|c: char| c.is_ascii_punctuation()) { continue; } // "M'.que"
        if bare.ends_with('.') && body.len() <= 2 && body.starts_with(|c: char| c.is_ascii_uppercase()) { continue; } // P. Cn. — an initial
        out.push(bare);
    }
    out.join(" ")
}

fn model() -> Model {
    // each text is learned as a circle — its first two words once more at its end: the chain of the crate has no
    // successor for the last two words of a text and jumps to a random place, dropping the last word and splicing
    // two half-sentences ("… id est distinguique …"); so after the last sentence comes the first
    let circle = |t: &str| { let c = clean(t); let head: Vec<&str> = c.split(' ').take(2).collect(); format!("{c} {}", head.join(" ")) };
    let lorem: &'static str = Box::leak(circle(LOREM_IPSUM).into_boxed_str());
    let cicero: &'static str = Box::leak(circle(LIBER_PRIMUS).into_boxed_str());
    let mut chain = MarkovChain::new();
    chain.learn(lorem);
    chain.learn(cicero);
    let mut starts = Vec::new();
    for text in [lorem, cicero] {
        let w: Vec<&'static str> = text.split_whitespace().collect();
        for i in 0..w.len().saturating_sub(4) { // not the first two words again at the end
            if (i == 0 || ends_sentence(w[i - 1])) && !ends_sentence(w[i]) { starts.push((w[i], w[i + 1])); }
        }
    }
    Model { chain, starts }
}

fn capitalize(w: &str) -> String { let mut c = w.chars(); match c.next() { Some(f) => f.to_uppercase().chain(c).collect(), None => String::new() } }
/// A word without the punctuation after it, and a full stop.
fn full_stop(w: &str) -> String { format!("{}.", w.trim_end_matches(|c: char| c.is_ascii_punctuation())) }

/// Sentences, one after another, from a stream of the chain's words.
struct Sentences<'a, I: Iterator<Item = &'a str>> { words: I }
impl<'a, I: Iterator<Item = &'a str>> Sentences<'a, I> {
    fn next(&mut self) -> Vec<String> {
        let mut s: Vec<String> = Vec::new();
        while let Some(w) = self.words.next() {
            let w = if s.is_empty() { capitalize(w) } else { w.to_string() };
            if ends_sentence(&w) { s.push(w); break; }
            if s.len() + 1 >= SOFT && w.ends_with([',', ';', ':']) { s.push(full_stop(&w)); break; }
            if s.len() + 1 >= HARD { s.push(full_stop(&w)); break; }
            s.push(w);
        }
        s
    }
}

/// unit 0 = paragraphs, 1 = sentences, 2 = words. JSON: {"paragraphs":[…],"sentences":n,"words":n}.
pub fn lorem(unit: u32, n: usize, classic: bool, seed: [u8; 32]) -> String {
    let mut rng = ChaCha20Rng::from_seed(seed);
    MODEL.with(|m| {
        let mut pick = ChaCha20Rng::from_rng(&mut rng).unwrap(); // the paragraph lengths, apart from the words
        // "Lorem ipsum": the standard first sentence word for word ("et dolore" also occurs in Cicero, so the chain
        // alone wanders off in the middle of it), then the chain from its last two words
        let (opening, from) = if classic { (CLASSIC.split(' ').take(17).collect(), ("magna", "aliqua.")) } else { (Vec::new(), *m.starts.choose(&mut rng).unwrap()) };
        let mut gen = Sentences { words: opening.into_iter().chain(m.chain.iter_with_rng_from(&mut rng, from)) };
        let mut paragraphs: Vec<Vec<Vec<String>>> = Vec::new();
        match unit {
            0 => for _ in 0..n { let k = pick.gen_range(4..=8); paragraphs.push((0..k).map(|_| gen.next()).collect()); },
            1 => if n > 0 { paragraphs.push((0..n).map(|_| gen.next()).collect()) },
            _ => {
                let mut sentences = Vec::new(); let mut count = 0;
                while count < n {
                    let mut s = gen.next();
                    if count + s.len() > n { s.truncate(n - count); let last = s.pop().unwrap(); s.push(if ends_sentence(&last) { last } else { full_stop(&last) }); }
                    count += s.len(); sentences.push(s);
                }
                if n > 0 { paragraphs.push(sentences); }
            }
        }
        let (mut words, mut count) = (0, 0);
        let mut out = String::from("{\"paragraphs\":[");
        for (i, p) in paragraphs.iter().enumerate() {
            if i > 0 { out.push(','); }
            let text = p.iter().map(|s| { words += s.len(); count += 1; s.join(" ") }).collect::<Vec<_>>().join(" ");
            crate::json_str(&mut out, &text);
        }
        out.push_str(&format!("],\"sentences\":{count},\"words\":{words}}}"));
        out
    })
}
