# Programs for scripts/make-python-reference.py — the language itself. A line "# ==== name | key=value | …" starts
# a program; keys: tz (IANA zone), stdin (JSON string), err=skip (stderr not compared), files (JSON object).

# ==== integers
print(7 // 2, -7 // 2, 7 % -3, -7 % 3, divmod(-17, 5), 2 ** 100, (-2) ** 63, 10 ** 30 // 7, pow(3, 200, 1000007), pow(7, -1, 1000003))
print(int("ff", 16), int("-0b1011", 0), int("1_000_000"), int("  42\n"), bin(-10), oct(64), hex(255), f"{255:#010b} {255:o} {255:X} {-255:+x}")
print((1 << 70) >> 3, ~5, 6 & 3, 6 | 3, 6 ^ 3, (12345678901234567890).bit_length(), (255).to_bytes(2, "big"), int.from_bytes(b"\x01\x00", "little"), (-1).to_bytes(4, "big", signed=True))
import math
print(math.factorial(25), math.comb(60, 30), math.perm(10, 3), math.gcd(2 ** 40, 6 ** 20), math.lcm(4, 6, 10), math.isqrt(10 ** 30 + 1), math.prod(range(1, 11)))
print(len(str(3 ** 5000)), str(7 ** 77)[-10:], 123456789 ** 3, round(12345, -2), round(-15, -1), round(25, -1), abs(-10 ** 20), sum(range(10 ** 6)))
print(1_000_000 .bit_count(), (10 ** 18).__floordiv__(7), int(1e15), int(-3.99), int("٣٤"), 0 == -0, True + True, isinstance(True, int))

# ==== floats
print(0.1 + 0.2, 1 / 3, 2 / 3, 1e22, 1e-7, 1.5e300 * 1e10, 5e-324, 1.7976931348623157e308, -0.0, float("inf"), float("-inf"), float("nan"))
print(repr(1.0), repr(100.0), repr(1e16), repr(123456789012345680.0), repr(0.000001), repr(0.0000001), 3.0 * 1.1, 4.35 * 100, 1.1 + 2.2, 0.1 * 3)
print(round(2.675, 2), round(0.5), round(1.5), round(2.5), round(-0.5), round(1e16 + 1), round(3.14159, 3), round(1234.5678, -2), f"{2.5:.0f} {3.5:.0f} {0.125:.2f} {1e21:.3g}")
print(f"{1234567.891:,.2f} | {0.000012345:.3e} | {12345.6789:10.1f} | {-1.5:+08.2f} | {0.5:.1%} | {1e6:g} | {1e-5:g} | {123456789.0:n} | {1.0:g} | {float('nan'):f}")
print((0.1).hex(), float.fromhex("0x1.8p+1"), (0.75).as_integer_ratio(), (2.5).is_integer(), 7.0 // 2, 7.5 % 2, -7.5 // 2, divmod(7.5, 2), 2 ** -1, 10 / 4)
import math
print(math.fsum([0.1] * 10), math.sqrt(2), math.floor(-2.5), math.ceil(2.1), math.trunc(-2.7), math.copysign(3, -0.0), math.isclose(0.1 + 0.2, 0.3), math.hypot(3, 4), math.dist((0, 0), (1, 1)))
print(math.inf > 10 ** 400, math.nan == math.nan, math.isnan(float("nan")), math.fmod(-7, 3), math.remainder(7, 3), math.modf(3.25), math.frexp(8.0), math.ldexp(0.5, 4), math.ulp(1.0), math.nextafter(1.0, 2.0))
print(round(math.sin(1.0), 12), round(math.cos(1.0), 12), round(math.exp(1.0), 12), round(math.log(10.0), 12), round(math.atan2(1, 2), 12), round(math.pi, 12), round(math.e ** 0.5, 12), round(math.log2(10), 12), round(math.tan(0.5), 12), round(math.erf(0.5), 12), round(math.gamma(4.5), 9))
print(float("1e400"), float("-1e-400"), 1e308 * 10, int(1e22), float(10 ** 22), 9007199254740993 + 0.0, 2 ** 53 + 1.0, 0.1 + 0.7, 1 - 0.9)
try: print(1 / 0)
except ZeroDivisionError as e: print("ZeroDivisionError:", e)
try: print(math.sqrt(-1))
except ValueError as e: print("ValueError:", e)
try: print(10.0 ** 400)
except OverflowError as e: print("OverflowError")        # its text is the C library's (errno 34 in glibc, 68 in wasi-libc)

# ==== complex-decimal-fractions
from decimal import Decimal, getcontext, ROUND_HALF_UP, ROUND_HALF_EVEN, ROUND_DOWN, localcontext
from fractions import Fraction
print((1 + 2j) * (3 - 1j), abs(3 + 4j), (1j) ** 2, complex("1+2j").conjugate(), f"{1.5 + 2.5j:.1f}")
print(Decimal("0.1") + Decimal("0.2"), Decimal("1.005").quantize(Decimal("0.01"), ROUND_HALF_UP), Decimal("2.5").quantize(Decimal("1"), ROUND_HALF_EVEN), Decimal(1) / Decimal(7), Decimal("1e-10") * 3, Decimal(0.1))
print(Decimal("123.456").quantize(Decimal("0.1"), ROUND_DOWN), Decimal("10") ** 30, Decimal("2").sqrt(), Decimal("-0"), Decimal("NaN"), Decimal("1.10") == Decimal("1.1"), Decimal("1.10").normalize(), f"{Decimal('1234567.891'):,.2f}")
with localcontext() as c:
    c.prec = 50
    print(Decimal(1) / Decimal(3), Decimal(2).sqrt(), Decimal("1.1") ** 20)
print(getcontext().prec, Decimal("1.5").as_tuple(), Decimal("7.25").as_integer_ratio(), round(Decimal("2.675"), 2), int(Decimal("9.99")), Decimal("100").log10(), Decimal(1).exp())
print(Fraction(1, 3) + Fraction(1, 6), Fraction("3.1415").limit_denominator(100), Fraction(0.5), Fraction(10, 4), Fraction(1, 3) ** 2, float(Fraction(22, 7)), Fraction(7, 2) // 1, Fraction("1/3") < Fraction(34, 100), round(Fraction(7, 2)), Fraction(-7, 2).__floor__())

# ==== strings
s = "The Quick brown fox — नमस्ते दुनिया, café, straße, 😀"
print(len(s), s.upper(), s.lower(), s.title(), s.swapcase(), s.casefold())
print(s.split(), s.split(",", 1), s.partition("—"), s.rsplit(" ", 2), "a,b,,c".split(","), " a  b ".split(), "x".join("abc"), "line1\nline2\r\nline3".splitlines(True))
print(s.find("fox"), s.rfind("a"), s.count("a"), s.index("brown"), s.startswith(("The", "A")), s.endswith("😀"), "abc" < "abd", "Z" < "a", "é" > "z", sorted(["b", "A", "a", "B", "é", "z"]))
print("%5d|%-5d|%05.1f|%x|%c|%r|%s|%%|%10.3e" % (42, 42, 3.14159, 255, 65, "q", None, 12345.678), "{:>8}|{:<8}|{:^8}|{:*^9}|{!r}|{:.3}|{:,}".format("r", "l", "c", "m", "x", "truncate", 10 ** 9))
print(f"{'pad':>6}|{42:06d}|{3.14159:.2f}|{'x'!r}|{1e6:,.0f}|{255:#x}|{'नम':5}|{[1, 2]}|{ {'a': 1} }|{3 > 2}|{None}|{1/3:.3%}|{'nested ' + f'{1 + 1}'}")
print("  strip  ".strip(), "xxhixx".strip("x"), "abc".center(9, "-"), "42".zfill(6), "-42".zfill(6), "tab\there".expandtabs(4), "a-b_c".replace("-", "+").translate(str.maketrans("_", "=")), "ß".upper(), "ǅ".lower(), "ﬁ".casefold())
print("abc".isalpha(), "abc1".isalnum(), "१२३".isdigit(), "१२३".isdecimal(), "Ⅷ".isnumeric(), " \t".isspace(), "Title Case".istitle(), "a b".isidentifier(), "नाम".isidentifier(), "😀".isprintable(), "\x00".isprintable())
print(repr("it's"), repr('say "hi"'), repr("both ' and \""), repr("tab\t nl\n nul\x00 bell\x07 del\x7f é ​ \U0001F600 \ud800"), ascii("é😀"), str(b"bytes\xff"), "abc"[::-1], "abcdef"[1:-1:2], "a" * 3 + "b")
print("café".encode(), "café".encode("latin-1"), "नम".encode("utf-16-le"), b"caf\xc3\xa9".decode(), b"\xff\xfe".decode("utf-8", "replace"), b"\xff".decode("utf-8", "backslashreplace"), "é".encode("ascii", "xmlcharrefreplace"), "x".encode("utf-32"))
try: "é".encode("ascii")
except UnicodeEncodeError as e: print(e)
try: b"\xff".decode()
except UnicodeDecodeError as e: print(e)
import textwrap, string
print(textwrap.fill("The quick brown fox jumps over the lazy dog and keeps running through the long field of words.", 30))
print(textwrap.shorten("Hello  world, this is a long sentence", 20), textwrap.dedent("    a\n      b\n").splitlines(), textwrap.indent("a\nb", "> "), string.capwords("hello wORLD"), string.Template("$who owes ₹${amt}").substitute(who="Ravi", amt=50))
print(len("😀"), len("😀".encode()), len("👨‍👩‍👧"), len("नमस्ते"), [hex(ord(c)) for c in "é€😀"], chr(0x1F600), "\N{INDIAN RUPEE SIGN}", "á" == "á", "abc".removeprefix("a").removesuffix("c"))

# ==== collections-basics
a = [5, 3, 8, 1, 9, 2]
print(sorted(a), sorted(a, reverse=True), a[::2], a[-2:], a[1:4], min(a), max(a), sum(a), a.index(8), list(reversed(a)), a + [0] * 2, [x * x for x in a if x % 2])
a.sort(key=lambda x: -x); a.insert(1, 7); a.append(4); a.extend([6, 6]); a.remove(6); p = a.pop(); q = a.pop(0); print(a, p, q, a.count(6), len(a)); del a[1:3]; a[::2] = [0] * len(a[::2]); print(a)
d = {"b": 2, "a": 1}; d["c"] = 3; d.update(a=10, z=26); d.setdefault("q", []).append(1)
print(d, list(d), sorted(d.items()), d.get("x", "none"), d.pop("b"), "a" in d, {k: v for k, v in d.items() if isinstance(v, int) and v > 2}, dict(zip("xyz", range(3))), d | {"new": 0}, len(d))
s1, s2 = {1, 2, 3, 4}, {3, 4, 5}
print(sorted(s1 | s2), sorted(s1 & s2), sorted(s1 - s2), sorted(s1 ^ s2), s1 <= s2, {1, 2} < s1, sorted({x % 3 for x in range(10)}), frozenset([1, 2]) == frozenset([2, 1]), len(set("mississippi")), sorted(set("mississippi")))
t = (1, "two", 3.0, [4]); x, *rest = t; (m, n), o = (1, 2), 3
print(t, t[1:], x, rest, m, n, o, t + (5,), tuple(reversed(t)), (1, 2) < (1, 3), ("a", 2) < ("b", 1), [1, [2, [3, [4]]]], [[0] * 3 for _ in range(2)], list(enumerate("ab", 1)), list(zip("ab", [1, 2, 3])), list(zip(*[(1, "a"), (2, "b")])))
words = ["banana", "Apple", "cherry", "apple", "Banana", "date"]
print(sorted(words), sorted(words, key=str.lower), sorted(words, key=lambda w: (len(w), w)), max(words, key=len), sorted(words, key=str.lower, reverse=True), sorted([(2, "b"), (1, "z"), (2, "a")]), sorted([3, 1, 2], key=lambda v: -v))
print(any(w.startswith("d") for w in words), all(words), list(map(len, words)), list(filter(str.istitle, words)), sum(len(w) for w in words), [w for w in words if "an" in w.lower()], {len(w): w for w in words}, list(range(10, 0, -3)), list(range(0)), range(5)[2:], range(10)[::3])
print(bool([]), bool([0]), bool(""), bool(" "), bool(0.0), bool(None), [] == [], [] is [], None or "default", 0 and 1, 1 and 2, not 0, 1 < 2 < 3, 1 < 3 > 2, "a" if 0 else "b", 3 if [] else 4)
b = bytearray(b"hello"); b[0] = 72; b += b" world"
print(b, bytes(b).upper(), b[1:3], list(b"AB"), bytes([65, 66]), bytes(3), b"a,b".split(b","), b"x".hex(), bytes.fromhex("deadbeef"), memoryview(b"abc")[1], b"abc" < b"abd", bytes(range(256))[250:], len(memoryview(bytearray(10))))

# ==== control-flow-and-functions
def fib(n, memo={}):
    if n < 2: return n
    if n not in memo: memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]
def args(a, b=2, *c, d, e=5, **f): return (a, b, c, d, e, f)
def pos(a, /, b, *, c): return a + b + c
print(fib(90), args(1, d=4), args(1, 2, 3, 4, d=5, x=6), pos(1, 2, c=3), (lambda *a, **k: (a, k))(1, k=2), args.__defaults__, args.__kwdefaults__, args.__code__.co_varnames)
out = []
for i in range(20):
    if i % 2: continue
    if i > 12: break
    out.append(i)
else: out.append("no break")
while out:
    v = out.pop()
    if v == 6: break
else: out.append("never")
print(out, [(i, j) for i in range(3) for j in range(i)], [y for x in range(5) if (y := x * x) > 3], {i: [j for j in range(i)] for i in range(3)})
def gen(n):
    total = 0
    for i in range(n):
        got = yield i
        if got: total += got
    return total
g = gen(3); print(next(g), g.send(10), g.send(20), end=" ")
try: g.send(5)
except StopIteration as e: print("returned", e.value)
def chain(*its):
    for it in its: yield from it
print(list(chain("ab", [1, 2], range(2))), sum(x for x in range(101)), list(zip(*[iter(range(6))] * 2)), next(iter([]), "empty"), [*range(3), *"xy"], {**{"a": 1}, "b": 2}, max((x for x in [3, 9, 2]), default=0))
def outer():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc
c = outer(); c(); c()
G = 1
def setg():
    global G
    G += 1
setg()
print(c(), G, outer.__name__, c.__qualname__, c.__closure__[0].cell_contents, callable(c), (lambda: G)())
def deco(times):
    def wrap(f):
        import functools
        @functools.wraps(f)
        def inner(*a, **k): return [f(*a, **k) for _ in range(times)]
        return inner
    return wrap
@deco(3)
def hello(name: str = "you") -> str:
    "greets"
    return f"hi {name}"
print(hello("Asha"), hello.__name__, hello.__doc__, hello.__annotations__, hello.__wrapped__("x"))
def kind(x):
    match x:
        case 0 | 1: return "bit"
        case int(n) if n < 0: return f"negative {n}"
        case [a, b, *rest]: return f"list {a} {b} +{len(rest)}"
        case {"type": t, **more}: return f"dict {t} {sorted(more)}"
        case str() as s: return "str " + s
        case (float() | complex()) as v: return f"number {v}"
        case _: return "other"
print([kind(v) for v in (0, -5, [1, 2, 3, 4], {"type": "x", "k": 1}, "hey", 2.5, None, (1, 2))])

# ==== classes
import abc, dataclasses, enum, functools, typing
class Shape(abc.ABC):
    count = 0
    def __init__(self, name): self.name = name; Shape.count += 1
    @abc.abstractmethod
    def area(self): ...
    def __repr__(self): return f"{type(self).__name__}({self.name!r}, area={self.area():.2f})"
    def __lt__(self, o): return self.area() < o.area()
    def __eq__(self, o): return isinstance(o, Shape) and self.area() == o.area()
    def __hash__(self): return hash(round(self.area(), 6))
class Rect(Shape):
    def __init__(self, w, h): super().__init__("rect"); self.w, self.h = w, h
    def area(self): return self.w * self.h
    @property
    def square(self): return self.w == self.h
    @classmethod
    def unit(cls): return cls(1, 1)
    @staticmethod
    def sides(): return 4
class Circle(Shape):
    def __init__(self, r): super().__init__("circle"); self.r = r
    def area(self): return 3.14159 * self.r ** 2
shapes = [Rect(2, 3), Circle(1), Rect.unit(), Rect(3, 2)]
print(sorted(shapes), max(shapes), Shape.count, shapes[0] == shapes[3], len(set(shapes)), shapes[2].square, Rect.sides(), Rect.__mro__[1].__name__, isinstance(shapes[1], Shape), issubclass(Rect, Circle))
try: Shape("x")
except TypeError as e: print(e)
@dataclasses.dataclass(order=True, frozen=True)
class Point:
    x: int
    y: int = 0
    tags: tuple = dataclasses.field(default=(), compare=False)
    def dist(self): return abs(self.x) + abs(self.y)
p = Point(1, 2); print(p, p < Point(1, 3), p == Point(1, 2, ("t",)), dataclasses.asdict(p), dataclasses.replace(p, y=9), hash(p) == hash(Point(1, 2)), [f.name for f in dataclasses.fields(p)], p.dist())
try: p.x = 5
except dataclasses.FrozenInstanceError as e: print("FrozenInstanceError:", e)
@dataclasses.dataclass(slots=True, kw_only=True)
class Item:
    name: str
    price: float = 0.0
    stock: list = dataclasses.field(default_factory=list)
    def __post_init__(self): self.name = self.name.strip()
i = Item(name=" tea ", price=120); i.stock.append(3); print(i, Item.__slots__, Item(name="x").stock, hasattr(i, "__dict__"))
class Color(enum.Enum):
    RED = 1; GREEN = 2; BLUE = 3
    @property
    def warm(self): return self is Color.RED
class Perm(enum.IntFlag): R = 4; W = 2; X = 1
class Level(enum.StrEnum): LOW = enum.auto(); HIGH = enum.auto()
print(Color.RED, repr(Color.GREEN), Color(3), Color["BLUE"].value, list(Color), Color.RED.warm, Perm.R | Perm.W, Perm(7), Perm.R in Perm(5), int(Perm.R | Perm.X), Level.LOW, Level.HIGH == "high", [m.name for m in Level])
class Vec:
    __slots__ = ("x", "y")
    def __init__(self, x, y): self.x, self.y = x, y
    def __add__(self, o): return Vec(self.x + o.x, self.y + o.y)
    def __mul__(self, k): return Vec(self.x * k, self.y * k)
    __rmul__ = __mul__
    def __neg__(self): return Vec(-self.x, -self.y)
    def __iter__(self): yield self.x; yield self.y
    def __getitem__(self, i): return (self.x, self.y)[i]
    def __len__(self): return 2
    def __bool__(self): return bool(self.x or self.y)
    def __repr__(self): return f"Vec({self.x}, {self.y})"
    def __eq__(self, o): return tuple(self) == tuple(o)
    def __contains__(self, v): return v in tuple(self)
    def __call__(self, k): return self * k
    def __format__(self, spec): return f"<{self.x:{spec}}, {self.y:{spec}}>"
v = Vec(1, 2); print(v + Vec(3, 4), 3 * v, -v, list(v), v[1], len(v), bool(Vec(0, 0)), v == Vec(1, 2), 2 in v, v(10), f"{v:.1f}", sum([v, v], Vec(0, 0)))
class Meta(type):
    registry = []
    def __new__(m, name, bases, ns, **kw): cls = super().__new__(m, name, bases, ns, **kw); m.registry.append(name); return cls
class Base(metaclass=Meta):
    def __init_subclass__(cls, tag=None, **kw): super().__init_subclass__(**kw); cls.tag = tag
class Child(Base, tag="c"): pass
class Desc:
    def __set_name__(self, owner, name): self.name = "_" + name
    def __get__(self, obj, t=None): return getattr(obj, self.name, 0) * 2
    def __set__(self, obj, v): setattr(obj, self.name, v)
class Uses: val = Desc()
u = Uses(); u.val = 21
class Ctx:
    def __enter__(self): print("enter", end=" "); return self
    def __exit__(self, t, v, tb): print("exit", t.__name__ if t else None, end=" "); return t is KeyError
with Ctx(): raise KeyError("swallowed")
print(Meta.registry, Child.tag, u.val, vars(u), type(u).__name__, Child.__mro__[-1])
T = typing.TypeVar("T")
class Stack(typing.Generic[T]):
    def __init__(self): self.items: list[T] = []
    def push(self, x: T) -> None: self.items.append(x)
class P(typing.Protocol):
    def push(self, x): ...
class TD(typing.TypedDict): name: str; age: int
class NT(typing.NamedTuple):
    a: int
    b: str = "x"
print(typing.get_type_hints(Stack.push), Stack[int].__origin__.__name__, NT(1), NT(2, "y")._asdict(), NT._fields, TD(name="a", age=1), typing.get_args(typing.Optional[int]), list[int], dict[str, list[int]], int | None, typing.Literal["a", "b"])
@functools.total_ordering
class Ver:
    def __init__(self, s): self.t = tuple(map(int, s.split(".")))
    def __eq__(self, o): return self.t == o.t
    def __lt__(self, o): return self.t < o.t
@functools.singledispatch
def show(x): return f"obj {x}"
@show.register
def _(x: int): return f"int {x}"
@show.register(list)
def _(x): return f"list of {len(x)}"
class Lazy:
    calls = 0
    @functools.cached_property
    def value(self): Lazy.calls += 1; return 42
l = Lazy(); l.value; l.value
print(Ver("1.10") > Ver("1.9"), Ver("2.0") <= Ver("2.0"), show(1), show([1, 2]), show("s"), show(True), Lazy.calls, functools.reduce(lambda a, b: a * b, range(1, 8)), functools.partial(int, base=2)("1011"))

# ==== exceptions
class AppError(Exception):
    def __init__(self, msg, code): super().__init__(msg); self.code = code
def risky(n):
    try:
        if n == 0: raise AppError("zero", 10)
        if n == 1: return 1 / 0
        if n == 2: return {}["k"]
        if n == 3: return [][5]
        if n == 4: return int("x")
        if n == 5: raise KeyboardInterrupt
        return "fine"
    except AppError as e: return f"app {e} {e.code} {e.args}"
    except (ZeroDivisionError, KeyError) as e: return f"{type(e).__name__}: {e}"
    except LookupError as e: return f"lookup {e!r}"
    except Exception as e: return f"other {type(e).__name__} {e}"
    except BaseException as e: return f"base {type(e).__name__}"
    else: return "unreachable"
    finally: log.append(n)
log = []
print([risky(i) for i in range(7)], log)
try:
    try: raise ValueError("inner")
    except ValueError as e: raise RuntimeError("outer") from e
except RuntimeError as e: print(repr(e), repr(e.__cause__), e.__context__ is e.__cause__, e.__suppress_context__)
try:
    try: 1 / 0
    except ZeroDivisionError: raise KeyError("during")
except KeyError as e: print(repr(e), repr(e.__context__), e.__cause__)
try: raise ExceptionGroup("many", [ValueError(1), TypeError(2), ExceptionGroup("nested", [KeyError(3), ValueError(4)])])
except* ValueError as eg: print("values", eg.exceptions, [type(x).__name__ for x in eg.exceptions])
except* (TypeError, KeyError) as eg: print("others", eg.exceptions)
e = ValueError("note me"); e.add_note("first note"); e.add_note("second")
print(e.__notes__, str(e), repr(e), e.args, isinstance(e, Exception), ValueError.__mro__[1].__name__, issubclass(FileNotFoundError, OSError), OSError(2, "No such file").errno, str(KeyError("k")), str(OSError(2, "msg", "file.txt")))
def cleanup():
    try: return "try"
    finally: print("finally runs", end="; ")
print(cleanup())
import warnings
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter("always"); warnings.warn("old", DeprecationWarning); warnings.warn("careful", UserWarning)
    print([(x.category.__name__, str(x.message)) for x in w])
try: assert 1 + 1 == 3, "maths is broken"
except AssertionError as e: print("AssertionError:", e)
import traceback
def a(): b()
def b(): raise LookupError("deep")
try: a()
except LookupError: print(traceback.format_exc().replace("\n", " | "))

# ==== new-in-3.14
from string.templatelib import Template, Interpolation
import annotationlib
name, n = "Asha", 3
t = t"Hello {name!r}, you have {n:03d} items"
print(type(t).__name__, t.strings, [(i.value, i.expression, i.conversion, i.format_spec) for i in t.interpolations], [type(p).__name__ for p in t])
def f(a: Undefined, b: int = 0) -> Later: ...
print(annotationlib.get_annotations(f, format=annotationlib.Format.STRING), annotationlib.get_annotations(f, format=annotationlib.Format.FORWARDREF)["b"])
try: int("x")
except ValueError, TypeError: print("except without parentheses")
import sys, uuid, pathlib, functools
print(sys.version_info[:3], sys.version_info >= (3, 14), uuid.UUID("01890f5e-1234-7abc-8def-0123456789ab").version, pathlib.PurePosixPath("a/b.tar.gz").full_match("**/*.gz"), functools.Placeholder is not None, (2.0).from_number(3) if hasattr(float, "from_number") else "-")

# ==== uncaught-zero-division
def mean(xs):
    return sum(xs) / len(xs)
print("before")
print(mean([]))

# ==== uncaught-name-suggestion
import math
total = 10
print(totl + math.sqr(4))

# ==== uncaught-attribute-suggestion
class Account:
    def __init__(self): self.balance = 0
print(Account().balanse)

# ==== uncaught-key-and-chained
def load(d):
    try:
        return d["missing"]
    except KeyError as e:
        raise RuntimeError("could not load") from e
load({})

# ==== uncaught-syntax-error
x = [1, 2
print(x)

# ==== uncaught-indentation-error
def f():
print("x")

# ==== uncaught-type-error
print("age: " + 30)

# ==== uncaught-exception-group
raise ExceptionGroup("several things failed", [ValueError("bad value"), TypeError("bad type")])

# ==== uncaught-recursion
import sys
sys.setrecursionlimit(300)        # the limit a program starts with differs (ours: 2000, see wasm/python/lib/sitecustomize.py)
def down(n): return down(n + 1)
down(0)

# ==== sys-exit-message
import sys
print("to stdout")
sys.exit("fatal: bad input")

# ==== sys-exit-code
import sys
print("x", file=sys.stderr)
raise SystemExit(7)

# ==== assert-fails
def check(v): assert v > 0, f"need a positive number, got {v}"
check(-1)

# ==== warnings-to-stderr
import warnings
warnings.warn("this is deprecated", DeprecationWarning)
warnings.warn("be careful")
print("done")

# ==== syntax-warning-finally
def f():
    try: return 1
    finally: return 2
print(f(), "is" is "is")

# ==== int-str-limit
x = 10 ** 5000
print(len(str(10 ** 4000)))
print(x)

# ==== input-reading | stdin="Asha\n31\n\n  spaced  \nlast without newline"
name = input("Name? ")
age = int(input("Age? "))
blank = input()
spaced = input("Spaced? ")
last = input()
print([name, age, blank, spaced, last])
try: input("more? ")
except EOFError as e: print("EOFError:", e)

# ==== stdin-forms | stdin="one\ntwo\nthree\nfour\nfive\n"
import sys
print(repr(sys.stdin.readline()), repr(sys.stdin.read(4)), repr(next(sys.stdin)), [l for l in sys.stdin], repr(sys.stdin.read()), sys.stdin.isatty(), sys.stdin.encoding)

# ==== stdin-bytes | stdin="héllo ₹\nline2\n"
import sys
data = sys.stdin.buffer.read()
print(len(data), data[:9], data.decode().splitlines())

# ==== argv-and-names
import sys, os
print(sys.argv, __name__, os.path.basename(__file__), os.path.basename(sys.path[0]) == os.path.basename(os.getcwd()), sys.stdout.encoding, sys.getdefaultencoding(), sys.byteorder, sys.flags.utf8_mode, sys.stdout.isatty())
print("to stderr", file=sys.stderr)
print("a", "b", sep="-", end="!\n"); print(); print("x", end=""); print("y", flush=True)
sys.stdout.write("no newline"); sys.stdout.write("\n"); print(*range(3), sep=", ")
