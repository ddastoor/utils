#!/usr/bin/env python3
"""The Spell Checker's words of Indian English (public/data/spell/en-IN.dic), added to the British dictionary (SCOWL's en_GB-ise —
Indian English spells as British English does) when "English (India)" is chosen:

    python3 scripts/make-spell-india.py

Our own list: money and measures, languages, states and places, festivals, food and dress, words of public life and of every
day that Indian English uses and the British dictionary lacks — and the names of India's cities of the World Clock's list
(GeoNames, src/lib/worldcities.json). The flags are those of SCOWL's affix file: S plural or third person (-es after h, s, x, z: lakhs is written out), M 's, D -ed, G -ing.
Words the British dictionary has already are left out (a plain look-up of its entries).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GB = ROOT / 'node_modules/dictionary-en-gb/index.dic'
OUT = ROOT / 'public/data/spell/en-IN.dic'

WORDS = """
lakh lakhs crore/S crorepati/S lakhpati/S paise paisa
Marathi/M Gujarati/M Telugu/M Kannada/M Malayalam/M Punjabi/M Odia/M Oriya/M Assamese/M Konkani/M Maithili/M Bhojpuri/M Sindhi/M
Kashmiri/M Dogri/M Manipuri/M Santali/M Tulu/M Hinglish/M Devanagari/M
Andhra/M Arunachal/M Pradesh/M Bihar/M Chhattisgarh/M Gujarat/M Haryana/M Himachal/M Jharkhand/M Karnataka/M Kerala/M Madhya/M
Maharashtra/M Manipur/M Meghalaya/M Mizoram/M Nagaland/M Odisha/M Orissa/M Rajasthan/M Sikkim/M Nadu/M Telangana/M Tripura/M
Uttar/M Uttarakhand/M Uttaranchal/M Puducherry/M Pondicherry/M Ladakh/M Lakshadweep/M Chandigarh/M Daman/M Diu/M Dadra/M Haveli/M
Andaman/M Nicobar/M Jammu/M Ganga/M Yamuna/M Godavari/M Kaveri/M Cauvery/M Narmada/M Krishna/M Mahanadi/M Brahmaputra/M
Bengaluru/M Chennai/M Kolkata/M Hyderabad/M Pune/M Ahmedabad/M Lucknow/M Kanpur/M Nagpur/M Indore/M Thane/M Bhopal/M Patna/M
Vadodara/M Baroda/M Ghaziabad/M Ludhiana/M Nashik/M Faridabad/M Rajkot/M Varanasi/M Srinagar/M Aurangabad/M Amritsar/M Prayagraj/M
Allahabad/M Ranchi/M Howrah/M Coimbatore/M Jabalpur/M Gwalior/M Vijayawada/M Jodhpur/M Madurai/M Raipur/M Kota/M Guwahati/M
Mysuru/M Mysore/M Thiruvananthapuram/M Trivandrum/M Kochi/M Cochin/M Gurugram/M Gurgaon/M Noida/M Dehradun/M Shimla/M
Bhubaneswar/M Cuttack/M Mangaluru/M Mangalore/M Udaipur/M Jamshedpur/M Tiruchirappalli/M Trichy/M Tirupati/M Kozhikode/M Calicut/M
Thrissur/M Belagavi/M Belgaum/M Hubballi/M Hubli/M Dharwad/M Kolhapur/M Solapur/M Ajmer/M Bikaner/M Jalandhar/M Siliguri/M
Darjeeling/M Gangtok/M Shillong/M Imphal/M Aizawl/M Kohima/M Itanagar/M Agartala/M Leh/M Manali/M Rishikesh/M Haridwar/M Mathura/M
Vrindavan/M Ayodhya/M Konark/M Hampi/M Ooty/M Kodaikanal/M Munnar/M Alleppey/M Alappuzha/M Kanyakumari/M Rameswaram/M Visakhapatnam/M
Vizag/M Panaji/M Margao/M Kashi/M
Deepavali/M Dussehra/M Dasara/M Navratri/M Navaratri/M Durga/M Ganesh/M Ganesha/M Chaturthi/M Janmashtami/M Onam/M Pongal/M Baisakhi/M
Vaisakhi/M Lohri/M Makar/M Sankranti/M Ugadi/M Gudi/M Padwa/M Bihu/M Chhath/M Raksha/M Bandhan/M Rakhi/M Karva/M Chauth/M Bakrid/M
Gurpurab/M Mahashivratri/M Shivratri/M Ramzan/M Holi/M Nanak/M
puja/S pooja/S aarti/S prasad bhajan/S kirtan/S darshan yatra/S mela/S mandir/S masjid/S gurdwara/S gurudwara/S dargah/S ghat/S
sadhu/S ayurveda ayurvedic pranayama namaste namaskar Bollywood/M Tollywood/M Kollywood/M Parsi/SM
chai/S roti/S chapatti/S paratha/S parantha/S dal/S daal/S dosa/S idli/S sambar sambhar rasam biryani/S pulao paneer pakora/S
pakoda/S bhaji/S bhajji/S masala/S garam thali/S tiffin/S halwa kheer jalebi/S laddu/S ladoo/S barfi rasgulla/S gulab jamun/S poha
upma vada/S pav chaat bhel puri/S papad/S raita achar dahi khichdi rajma chole chana aloo gobi palak bhindi baingan kulfi falooda
dhokla thepla khakhra appam puttu uttapam lassi naan/S
saree/S kurta/S kurti/S dupatta/S salwar kameez lehenga/S dhoti/S lungi/S sherwani/S bindi/S mehndi rangoli/S diya/S tilak mandap
shaadi baraat sangeet haldi
Lok/M Sabha/M Rajya/M Vidhan/M Sansad/M panchayat/S sarpanch sarpanches tehsil/S taluka/S taluk/S zila mandal/S nagar chowk/S marg
gali/S mohalla/S bhavan sadan nigam adalat challan/S Aadhaar/M jugaad kirana dhaba/S godown/S prepone/DSG timepass lathi/S jawan/S
babu/S babudom ji bhai/S didi/S bhaiya/S chacha/S chachi/S mausi/S nani/S dadi/S beta mami/S
""".split()


def known(gb):
    stems = set()
    for line in gb.read_text(encoding='utf-8').split('\n')[1:]:
        if line:
            stems.add(line.split('/')[0])
    return stems


def main():
    have = known(GB)
    out, seen = [], set()
    for entry in WORDS:
        w = entry.split('/')[0]
        if w in have or w in seen:
            continue
        seen.add(w)
        out.append(entry)
    # India's cities of the World Clock's list (one word each; names of several words give each word)
    data = json.loads((ROOT / 'src/lib/worldcities.json').read_text(encoding='utf-8'))
    for line in data['cities']:
        name, cc = line.split('|')[1:3]
        if cc != 'IN':
            continue
        for w in re.findall(r"[A-Z][a-z]+", name):
            if w not in have and w not in seen and len(w) > 2:
                seen.add(w)
                out.append(f'{w}/M')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(f'{len(out)}\n' + '\n'.join(out) + '\n', encoding='utf-8')
    print(f'{len(out)} words → {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
