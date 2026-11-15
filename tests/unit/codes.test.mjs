export default async (t, { load }) => {
  const { payload } = await load('/src/tools/codes.ts');
  t.eq(payload.wifi({ ssid: 'Home;Net', pass: 'p@ss:word', sec: 'WPA', hidden: false }), 'WIFI:T:WPA;S:Home\\;Net;P:p@ss\\:word;;', 'wifi escaping');
  t.eq(payload.wifi({ ssid: 'Cafe', pass: '', sec: 'none', hidden: true }), 'WIFI:T:nopass;S:Cafe;H:true;;', 'open hidden wifi');
  t.eq(payload.upi({ vpa: 'ravi@okicici', name: 'Ravi Kumar', amount: '250', note: 'Lunch' }), 'upi://pay?pa=ravi%40okicici&pn=Ravi%20Kumar&am=250.00&cu=INR&tn=Lunch', 'upi link');
  t.ok(payload.vcard({ first: 'Asha', last: 'Rao', phone: '+91 98', email: 'a@x.in', org: '', url: '' }).includes('N:Rao;Asha;;;\nFN:Asha Rao'), 'vcard');
  t.eq(payload.tel({ phone: '+91 98765 43210' }), 'tel:+919876543210', 'tel');
  t.eq(payload.email({ to: 'a@b.c', subject: 'Hi there', body: '' }), 'mailto:a@b.c?subject=Hi%20there', 'mailto');
};
