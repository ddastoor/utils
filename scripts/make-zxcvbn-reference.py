# Makes tests/fixtures/zxcvbn/reference.json: guesses, score and pattern kinds from the Python port of zxcvbn (the reference
# implementation's behaviour) for a fixed list of passwords. Run: python3 scripts/make-zxcvbn-reference.py > tests/fixtures/zxcvbn/reference.json  (pip install zxcvbn)
import json, sys, zxcvbn, random
from importlib.metadata import version
pw = """password P@ssw0rd 123456 qwerty asdfghjkl iloveyou abc123 Tr0ub4dor&3 correcthorsebatterystaple aaaaaaaaaa 19/11/1988 abcdefgh
Mumbai2026 xK9#mQ2$vL7! dragon zxcvbnm Th1s1sMyP@ss ilovechai q8T!vR2#nZ5&wL 1234567890 TRUSTNO1 SUNSHINE1 AB12CD34 MH12AB1234 aaaaaaab 1111112
zzzzzzzy trustno1 sunshine1 PASSWORD Password PASSWORd pAsSwOrD passworD letmein LETMEIN Letmein1 LETMEIN1! monkey123 MONKEY123 qwertyuiop QWERTYUIOP
1qaz2wsx 1QAZ2WSX zaq12wsx !QAZ2wsx qazwsxedc mnbvcxz poiuytrewq asdf;lkj 147258369 159753 abcabcabc abcabcabcabc abababab 121212 112233 aabbcc
1q2w3e4r 1q2w3e4r5t zxcvbn ZXCVBN Zxcvbn1 batman superman Superman1 S3cur1ty p4ssw0rd pa$$word passw0rd! admin administrator root toor changeme
welcome Welcome1 Welcome@123 India@123 india123 Bharat@2024 Delhi#2025 Kolkata1 chennai2023 Bangalore! hyderabad pune411001 rahul123 Priya@1995
amit1990 sachin10 dhoni07 kohli18 viratkohli Sachin@Tendulkar 9876543210 9811122233 01012000 15081947 26011950 1947-08-15 2026-11-17 31/12/1999
12-25-2001 1.1.2001 19880101 jan2020 March2021 summer2024 Winter2019! football1 baseball iloveyou2 princess1 qwerty123 1234qwer abcd1234 a1b2c3d4
aaaa bbbbbbbb abcdefghijklmnopqrstuvwxyz zyxwvutsr 0123456789 9876543210a 13579 2468 24680 97531 azazaz xyzxyz q w qq ab abc xyz 1 12 123 1234 12345
correct horse battery staple purple-monkey-dishwasher this is a long sentence to.be.or.not.to.be IAmTheWalrus1967 MyD0gAteMyH0mework neverGonnaGiveYouUp
Tm9wZU5vcGU= 5f4dcc3b5aa765d61d8327deb882cf99 d41d8cd98f00b204e9800998ecf8427e 0xDEADBEEF deadbeef cafebabe c0ffee C0FFEE!! xXx_dragon_xXx
jK8!pQ2@ rT5$wE9# aZ3%bY7^cX1& 7hG$2kL!9mN@ Vq8#Lm2$Zx5! e7Yb!Qr4 wP9z kR2mT8vX nF4jH7sD2a 4vT9xK2mQ7rL8nW3 zQ9vX2mK7rT4nL8wP3yB6
hunter2 Hunter2 hunter22 opensesame open sesame shadow master mustang access michael jennifer jordan23 harley ranger buster soccer hockey
george andrew charlie thomas robert daniel matthew joshua amanda jessica ashley nicole elizabeth samantha
smith johnson williams patel sharma singh kumar gupta
qwErTy QwErTy123 AsDfGh zXcVbN PaSsWoRd123 lEtMeIn aBcDeF tHiSiSaTeSt
p@$$w0rd l3tm3in m0nk3y dr@g0n 5h4d0w ch4rl13 b@tm@n $up3rm@n tr0ub4d0ur qw3rty
aaaaaa1 aaaaaaa2 abcabc1 wwwwww zzzzzzzzzzzz 000000 111111 999999 0000000000 1010101010 123123123 321321321 456456 789789789
abcdefg1 bcdefgh cdefghi lmnop rstuvw 34567 87654 hgfedcba fedcba 13579bdf acegik
~!@#$%^&*()_+ ~~~~~~~~ !!!!!!!! !@#$%^ ()()()() ------ ...... ,./;'[] <>?:"{} `1234567890-=
Ω≈ç√∫˜µ≤ пароль пароль123 密码 パスワード नमस्ते123 contraseña motdepasse passwört café1234 naïve2020 İstanbul34""".split()
random.seed(20261117)
al = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*'
pw += [''.join(random.choice(al) for _ in range(n)) for n in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 49, 64)]
pw += ['correct horse battery staple correct horse', 'q8T!vR2#nZ5&wL9@xK4$', 'the quick brown fox jumps over the lazy dog']
seen, out = set(), []
for p in pw:
    if p in seen: continue
    seen.add(p)
    r = zxcvbn.zxcvbn(p)
    out.append({'p': p, 'g': str(int(r['guesses'])), 's': r['score'], 'k': [m['pattern'] for m in r['sequence']], 't': [m['token'] for m in r['sequence']]})
inp = [['Ravindra1987!', ['Ravindra', 'Kulkarni']], ['kulkarni@home', ['Ravindra', 'Kulkarni']], ['asha.verma', ['asha', 'verma', 'example']], ['Acme2026', ['acme']], ['supertools', ['supertools']], ['SuperTools!', ['supertools']]]
ui = []
for p, words in inp:
    r = zxcvbn.zxcvbn(p, user_inputs=words); ui.append({'p': p, 'inputs': words, 'g': str(int(r['guesses'])), 's': r['score']})
print(json.dumps({'source': 'zxcvbn (Python port) ' + version('zxcvbn'), 'passwords': out, 'userInputs': ui}, ensure_ascii=False, indent=0))
