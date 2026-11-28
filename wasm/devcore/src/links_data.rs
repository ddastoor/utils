// The link checker's own data (links.rs): the brands people are tricked with and their own addresses, the link shorteners,
// the services where anyone can make a site, the endings scam sites use often, the calling codes, and what the tracking
// parts of a link are. Written for this tab (ClearURLs' rules, LGPL-3.0, are data/links/clearurls.json; the Public Suffix
// List comes with the psl crate).

/// A brand, a bank or a government service whose name scams borrow. `domains`: its own addresses — a registrable domain,
/// or an ending every one of whose sites is its own (`sbi`, the bank's top-level domain). `words`: what its name looks like
/// inside another address (sbi-kyc-update.com).
pub struct Brand {
    pub name: &'static str,
    pub short: &'static str,
    pub domains: &'static [&'static str],
    pub words: &'static [&'static str],
}

const fn b(name: &'static str, short: &'static str, domains: &'static [&'static str], words: &'static [&'static str]) -> Brand {
    Brand { name, short, domains, words }
}

pub static BRANDS: &[Brand] = &[
    // banks
    b("State Bank of India", "SBI", &["sbi.co.in", "onlinesbi.sbi", "sbi", "sbi.bank.in", "onlinesbi.com", "sbicard.com", "sbilife.co.in", "sbimf.com", "sbigeneral.in", "sbisecurities.in", "sbicaps.com", "statebankofindia.com"],
      &["sbi", "onlinesbi", "statebank", "statebankofindia", "yonosbi", "sbiyono", "yono", "sbicard"]),
    b("HDFC Bank", "HDFC Bank", &["hdfcbank.com", "hdfc.bank.in", "hdfcbank.bank.in", "hdfc.com", "hdfcsec.com", "hdfcfund.com", "hdfclife.com", "hdfcergo.com", "hdfcbankcards.com"], &["hdfc", "hdfcbank", "hdfcnetbanking", "hdfccard"]),
    b("ICICI Bank", "ICICI Bank", &["icicibank.com", "icici.bank.in", "icicibank.bank.in", "icicidirect.com", "iciciprulife.com", "icicilombard.com", "icicipruamc.com", "icicisecurities.com"], &["icici", "icicibank", "icicinet"]),
    b("Axis Bank", "Axis Bank", &["axisbank.com", "axis.bank.in", "axisbank.bank.in", "axisdirect.in", "axismf.com", "axisbank.co.in"], &["axisbank", "axisbnk"]),
    b("Kotak Mahindra Bank", "Kotak", &["kotak.com", "kotak.bank.in", "kotakbank.bank.in", "kotaksecurities.com", "kotaklife.com", "kotakmf.com", "kotak811.com"], &["kotak", "kotakbank", "kotakmahindra", "kotak811"]),
    b("Punjab National Bank", "PNB", &["pnbindia.in", "pnb.bank.in", "netpnb.com", "pnb.co.in", "pnbcard.in"], &["pnb", "pnbindia", "netpnb", "punjabnational", "punjabnationalbank"]),
    b("Bank of Baroda", "Bank of Baroda", &["bankofbaroda.in", "bankofbaroda.com", "bankofbaroda.bank.in", "bobibanking.com", "bobfinancial.com", "bobcard.co.in"], &["bankofbaroda", "barodabank", "bobibanking", "bobfinancial", "bobcard"]),
    b("Canara Bank", "Canara Bank", &["canarabank.com", "canarabank.in", "canarabank.bank.in", "canarahsbclife.com"], &["canarabank", "canara"]),
    b("Union Bank of India", "Union Bank", &["unionbankofindia.co.in", "unionbankonline.co.in", "unionbankofindia.bank.in", "unionbank.bank.in"], &["unionbank", "unionbankofindia", "unionbankonline"]),
    b("Bank of India", "Bank of India", &["bankofindia.co.in", "bankofindia.com", "bankofindia.bank.in", "boi.bank.in", "bankofindia.net"], &["bankofindia"]),
    b("Indian Bank", "Indian Bank", &["indianbank.in", "indianbank.net.in", "indianbank.bank.in"], &["indianbank"]),
    b("IDFC FIRST Bank", "IDFC FIRST Bank", &["idfcfirstbank.com", "idfcfirst.bank.in", "idfcfirstbank.bank.in"], &["idfc", "idfcfirst", "idfcfirstbank"]),
    b("Yes Bank", "Yes Bank", &["yesbank.in", "yesbank.bank.in", "yes.bank.in"], &["yesbank"]),
    b("IndusInd Bank", "IndusInd Bank", &["indusind.com", "indusind.bank.in", "indusindbank.bank.in"], &["indusind", "indusindbank"]),
    b("Federal Bank", "Federal Bank", &["federalbank.co.in", "federal.bank.in", "federalbank.bank.in", "fedfina.com"], &["federalbank"]),
    b("AU Small Finance Bank", "AU Bank", &["aubank.in", "au.bank.in", "aubank.bank.in"], &["aubank"]),
    b("RBL Bank", "RBL Bank", &["rblbank.com", "rbl.bank.in", "rblbank.bank.in"], &["rblbank"]),
    b("Bandhan Bank", "Bandhan Bank", &["bandhanbank.com", "bandhan.bank.in", "bandhanbank.bank.in"], &["bandhanbank", "bandhan"]),
    b("IDBI Bank", "IDBI Bank", &["idbibank.in", "idbi.com", "idbi.bank.in", "idbibank.bank.in"], &["idbi", "idbibank"]),
    b("Central Bank of India", "Central Bank of India", &["centralbankofindia.co.in", "centralbank.bank.in", "centralbankofindia.bank.in", "cbionline.in"], &["centralbankofindia"]),
    b("Indian Overseas Bank", "IOB", &["iob.in", "iob.bank.in", "iobnet.co.in"], &["iobnet", "indianoverseas", "indianoverseasbank"]),
    b("UCO Bank", "UCO Bank", &["ucobank.com", "uco.bank.in", "ucobank.bank.in", "ucoebanking.in"], &["ucobank"]),
    b("Bank of Maharashtra", "Bank of Maharashtra", &["bankofmaharashtra.in", "mahabank.bank.in", "bankofmaharashtra.bank.in", "mahaconnect.in"], &["bankofmaharashtra", "mahabank"]),
    b("Punjab & Sind Bank", "Punjab & Sind Bank", &["punjabandsindbank.co.in", "psb.bank.in", "punjabandsindbank.bank.in"], &["punjabandsind", "punjabandsindbank"]),
    b("HSBC", "HSBC", &["hsbc.co.in", "hsbc.com", "hsbc.bank.in", "hsbc"], &["hsbc"]),
    b("Standard Chartered", "Standard Chartered", &["sc.com", "standardchartered.com", "sc.bank.in", "standardchartered.bank.in"], &["standardchartered"]),
    b("Citibank", "Citi", &["citi.com", "citibank.com", "citibank.co.in", "citibankonline.com"], &["citibank", "citibankonline"]),
    b("India Post Payments Bank", "IPPB", &["ippbonline.com", "ippb.bank.in", "ippbonline.bank.in"], &["ippb", "ippbonline"]),
    b("Reserve Bank of India", "RBI", &["rbi.org.in", "rbi.gov.in", "rbikehtahai.rbi.org.in"], &["rbi", "reservebank", "reservebankofindia", "rbikehtahai"]),
    // payments and shops
    b("Paytm", "Paytm", &["paytm.com", "paytm.in", "paytmbank.com", "paytmmall.com", "paytmmoney.com", "paytm.me"], &["paytm", "paytmbank", "paytmmall"]),
    b("PhonePe", "PhonePe", &["phonepe.com", "phon.pe"], &["phonepe"]),
    b("Google Pay", "Google Pay", &["pay.google.com", "gpay.app.goo.gl"], &["googlepay", "gpay", "tezpay"]),
    b("NPCI (UPI, BHIM, RuPay, FASTag)", "NPCI", &["npci.org.in", "bhimupi.org.in", "rupay.co.in", "netc.org.in"], &["npci", "bhim", "bhimupi", "rupay", "upi"]),
    b("Amazon", "Amazon", &["amazon.in", "amazon.com", "amazon", "amazon.co.uk", "amazon.de", "amazon.ae", "amazon.sg", "amazon.co.jp", "amazon.ca", "amazon.com.au", "amazonpay.in", "amzn.to", "amzn.in", "amzn.eu", "a.co", "amazonaws.com", "media-amazon.com", "primevideo.com", "audible.in", "audible.com", "aboutamazon.in", "aboutamazon.com"],
      &["amazon", "amazonpay", "amzn", "amazonprime", "primevideo"]),
    b("Flipkart", "Flipkart", &["flipkart.com", "fkrt.it", "fkrt.co", "flixcart.com", "flipkart.net", "ekartlogistics.com", "shopsy.in", "flipkartwholesale.com"], &["flipkart", "flipkartsale", "flipcart"]),
    b("Myntra", "Myntra", &["myntra.com", "myntassets.com"], &["myntra"]),
    b("Meesho", "Meesho", &["meesho.com", "meeshogo.page.link"], &["meesho"]),
    b("JioMart and Jio", "Jio", &["jio.com", "jiomart.com", "jiocinema.com", "jiohotstar.com", "jiosaavn.com", "jiofiber.com", "reliancedigital.in", "ril.com", "relianceretail.com", "ajio.com"], &["jio", "myjio", "jiomart", "reliancejio", "jiofiber"]),
    b("Airtel", "Airtel", &["airtel.in", "airtel.com", "airtelxstream.in", "wynk.in", "airtelbank.com"], &["airtel", "airtelbank", "myairtel"]),
    b("Vi (Vodafone Idea)", "Vi", &["myvi.in", "vodafoneidea.com", "vodafone.in", "vodafone.com"], &["vodafone", "vodafoneidea", "myvi"]),
    b("BSNL", "BSNL", &["bsnl.co.in", "bsnl.in", "bsnl.gov.in"], &["bsnl"]),
    b("Swiggy", "Swiggy", &["swiggy.com", "swiggy.in"], &["swiggy"]),
    b("Zomato", "Zomato", &["zomato.com", "zmt.co", "blinkit.com"], &["zomato", "blinkit"]),
    b("CRED", "CRED", &["cred.club"], &["credclub"]),
    b("MobiKwik", "MobiKwik", &["mobikwik.com"], &["mobikwik"]),
    b("BharatPe", "BharatPe", &["bharatpe.com", "bharatpe.in"], &["bharatpe"]),
    // government
    b("UIDAI (Aadhaar)", "UIDAI", &["uidai.gov.in"], &["uidai", "aadhaar", "aadhar", "myaadhaar", "maadhaar", "aadhaarcard", "aadharcard"]),
    b("the Income Tax Department", "Income Tax", &["incometax.gov.in", "incometaxindia.gov.in", "tin-nsdl.com", "protean-tinpan.com", "proteantech.in", "utiitsl.com", "onlineservices.nsdl.com"], &["incometax", "incometaxindia", "itrefund", "taxrefund", "efiling"]),
    b("EPFO", "EPFO", &["epfindia.gov.in", "epfo.gov.in"], &["epfo", "epfindia", "pfindia"]),
    b("India Post", "India Post", &["indiapost.gov.in", "cept.gov.in"], &["indiapost", "speedpost", "indianpost"]),
    b("IRCTC", "IRCTC", &["irctc.co.in", "irctc.com", "indianrail.gov.in", "indianrailways.gov.in"], &["irctc", "indianrail", "indianrailways"]),
    b("Parivahan (driving licences, vehicles, e-challan)", "Parivahan", &["parivahan.gov.in", "morth.nic.in", "morth.gov.in"], &["parivahan", "echallan", "evahan"]),
    b("FASTag (NHAI, IHMCL)", "FASTag", &["ihmcl.co.in", "nhai.gov.in", "fastag.ihmcl.com", "ihmcl.com"], &["fastag", "nhai"]),
    b("GST", "GST", &["gst.gov.in", "cbic.gov.in", "cbic-gst.gov.in"], &["gstportal"]),
    b("DigiLocker", "DigiLocker", &["digilocker.gov.in"], &["digilocker"]),
    b("Passport Seva", "Passport Seva", &["passportindia.gov.in", "mea.gov.in"], &["passportindia", "passportseva"]),
    b("SEBI", "SEBI", &["sebi.gov.in"], &["sebi"]),
    b("LIC", "LIC", &["licindia.in", "licindia.com", "licindia.co.in"], &["licindia", "lic"]),
    b("TRAI", "TRAI", &["trai.gov.in"], &["trai"]),
    b("PM-KISAN", "PM-KISAN", &["pmkisan.gov.in"], &["pmkisan", "pmkissan", "kisansamman"]),
    b("Ayushman Bharat (PM-JAY)", "Ayushman Bharat", &["pmjay.gov.in", "nha.gov.in", "abdm.gov.in"], &["ayushman", "ayushmanbharat", "pmjay", "ayushmancard"]),
    b("e-Shram", "e-Shram", &["eshram.gov.in"], &["eshram", "eshramcard"]),
    // couriers
    b("Blue Dart", "Blue Dart", &["bluedart.com"], &["bluedart"]),
    b("DTDC", "DTDC", &["dtdc.in", "dtdc.com"], &["dtdc"]),
    b("Delhivery", "Delhivery", &["delhivery.com"], &["delhivery"]),
    b("FedEx", "FedEx", &["fedex.com"], &["fedex"]),
    b("DHL", "DHL", &["dhl.com", "dhl.co.in", "dhl.de", "dhl"], &["dhl"]),
    // the world's
    b("Google", "Google", &["google.com", "google.co.in", "google", "gmail.com", "youtube.com", "youtu.be", "youtube-nocookie.com", "ytimg.com", "goo.gl", "g.co", "forms.gle", "gstatic.com", "googleapis.com", "googleusercontent.com", "googlevideo.com", "android.com", "withgoogle.com", "blogger.com", "googleadservices.com", "googlesyndication.com", "doubleclick.net", "app.goo.gl", "chrome.com"],
      &["google", "gmail", "youtube", "googleplay", "playstore"]),
    b("Microsoft", "Microsoft", &["microsoft.com", "live.com", "outlook.com", "office.com", "office365.com", "microsoftonline.com", "microsoft365.com", "bing.com", "skype.com", "xbox.com", "windows.com", "azure.com", "1drv.ms", "msn.com", "aka.ms", "sharepoint.com", "onedrive.com"],
      &["microsoft", "outlook", "office365", "hotmail", "onedrive", "microsoftonline"]),
    b("Apple", "Apple", &["apple.com", "icloud.com", "apple", "itunes.com", "me.com", "apple.co"], &["apple", "icloud", "appleid", "itunes"]),
    b("Facebook", "Facebook", &["facebook.com", "fb.com", "fb.me", "fb.watch", "messenger.com", "meta.com", "fbcdn.net"], &["facebook", "fbook"]),
    b("Instagram", "Instagram", &["instagram.com", "instagr.am", "ig.me", "cdninstagram.com"], &["instagram", "insta"]),
    b("WhatsApp", "WhatsApp", &["whatsapp.com", "whatsapp.net", "wa.me"], &["whatsapp", "whatsap", "watsapp"]),
    b("Telegram", "Telegram", &["telegram.org", "t.me", "telegram.me", "telegra.ph"], &["telegram"]),
    b("X (Twitter)", "X", &["x.com", "twitter.com", "t.co", "twimg.com"], &["twitter"]),
    b("LinkedIn", "LinkedIn", &["linkedin.com", "lnkd.in", "licdn.com"], &["linkedin"]),
    b("Netflix", "Netflix", &["netflix.com", "nflxext.com", "nflximg.net"], &["netflix"]),
    b("PayPal", "PayPal", &["paypal.com", "paypal.me", "paypalobjects.com"], &["paypal"]),
    b("Truecaller", "Truecaller", &["truecaller.com"], &["truecaller"]),
];

/// Sites under these endings are a government's, a bank's or a university's own: only such bodies can have one.
pub static TRUSTED_ENDINGS: &[(&str, &str)] = &[
    ("gov.in", "a site of the Government of India (.gov.in — only government bodies can have one)"),
    ("nic.in", "a government site (.nic.in — run by the National Informatics Centre)"),
    ("mil.in", "a site of India's armed forces (.mil.in)"),
    ("bank.in", "an Indian bank's own address (.bank.in — only banks regulated by the RBI can have one, through IDRBT)"),
    ("fin.in", "an Indian financial institution's address (.fin.in — only bodies regulated in India's financial sector can have one)"),
    ("ac.in", "an Indian college's or university's site (.ac.in)"),
    ("edu.in", "an Indian school's or college's site (.edu.in)"),
    ("res.in", "an Indian research institution's site (.res.in)"),
    ("gov", "a United States government site (.gov)"),
    ("gov.uk", "a United Kingdom government site (.gov.uk)"),
];

/// Link shorteners: the address hides where the link leads until it is opened.
pub static SHORTENERS: &[(&str, &str)] = &[
    ("bit.ly", "Bitly"), ("bitly.com", "Bitly"), ("bit.do", "Bit.do"), ("tinyurl.com", "TinyURL"), ("tiny.cc", "tiny.cc"), ("tiny.one", "TinyURL"),
    ("t.co", "X (Twitter)"), ("goo.gl", "Google"), ("g.co", "Google"), ("forms.gle", "Google Forms"), ("rb.gy", "Rebrandly"), ("rebrand.ly", "Rebrandly"),
    ("cutt.ly", "Cuttly"), ("cutt.us", "cutt.us"), ("is.gd", "is.gd"), ("v.gd", "v.gd"), ("ow.ly", "Hootsuite"), ("buff.ly", "Buffer"),
    ("shorturl.at", "ShortURL"), ("t.ly", "T.LY"), ("s.id", "s.id"), ("bl.ink", "BL.INK"), ("lnkd.in", "LinkedIn"), ("amzn.to", "Amazon"),
    ("amzn.in", "Amazon"), ("amzn.eu", "Amazon"), ("a.co", "Amazon"), ("fkrt.it", "Flipkart"), ("fkrt.co", "Flipkart"), ("aka.ms", "Microsoft"),
    ("1drv.ms", "Microsoft OneDrive"), ("fb.me", "Facebook"), ("spoo.me", "spoo.me"), ("x.gd", "x.gd"), ("shorte.st", "Shorte.st"),
    ("adf.ly", "AdFly"), ("ouo.io", "ouo.io"), ("tr.im", "tr.im"), ("qr.ae", "qr.ae"), ("u.to", "u.to"), ("clck.ru", "clck.ru"),
    ("urlz.fr", "urlz.fr"), ("zpr.io", "zpr.io"), ("short.gy", "short.io"), ("shorturl.asia", "shorturl.asia"), ("tinu.be", "tinu.be"),
    ("han.gl", "han.gl"), ("me-qr.com", "ME-QR"), ("qrco.de", "QR Code Generator"), ("l.ead.me", "l.ead.me"),
    ("page.link", "Firebase Dynamic Links"), ("app.link", "Branch"), ("onelink.me", "AppsFlyer"),
    ("smart.link", "smart.link"), ("rebrandly.com", "Rebrandly"), ("snip.ly", "Sniply"), ("t2m.io", "t2m.io"), ("surl.li", "surl.li"),
    ("in.gl", "in.gl"), ("cli.re", "cli.re"), ("acesse.one", "acesse.one"), ("inr.deals", "inr.deals"), ("bitli.in", "bitli.in"),
    ("wa.link", "a WhatsApp link shortener"), ("maps.app.goo.gl", "Google Maps"),
];

/// Services where anyone can make a site under their address: a site there is its maker's, not the service's own.
pub static SERVICES: &[(&str, &str)] = &[
    ("github.io", "GitHub Pages"), ("gitlab.io", "GitLab Pages"), ("blogspot.com", "Blogger"), ("web.app", "Firebase, Google's"),
    ("firebaseapp.com", "Firebase, Google's"), ("appspot.com", "Google App Engine"), ("netlify.app", "Netlify"), ("vercel.app", "Vercel"),
    ("pages.dev", "Cloudflare Pages"), ("workers.dev", "Cloudflare Workers"), ("trycloudflare.com", "Cloudflare tunnels"), ("r2.dev", "Cloudflare R2"),
    ("herokuapp.com", "Heroku"), ("000webhostapp.com", "000webhost"), ("ngrok-free.app", "ngrok"), ("ngrok.io", "ngrok"), ("ngrok.app", "ngrok"),
    ("wixsite.com", "Wix"), ("weebly.com", "Weebly"), ("godaddysites.com", "GoDaddy"), ("myshopify.com", "Shopify"), ("sharepoint.com", "Microsoft SharePoint"),
    ("googleusercontent.com", "Google's store of people's own files"), ("glitch.me", "Glitch"), ("replit.app", "Replit"), ("replit.dev", "Replit"),
    ("repl.co", "Replit"), ("onrender.com", "Render"), ("fly.dev", "Fly.io"), ("azurewebsites.net", "Microsoft Azure"), ("duckdns.org", "Duck DNS"),
    ("ddns.net", "No-IP"), ("surge.sh", "Surge"), ("carrd.co", "Carrd"), ("notion.site", "Notion"), ("webflow.io", "Webflow"),
    ("framer.app", "Framer"), ("framer.website", "Framer"), ("square.site", "Square"), ("wordpress.com", "WordPress.com"), ("tumblr.com", "Tumblr"),
    ("canva.site", "Canva"), ("my.canva.site", "Canva"), ("tiiny.site", "Tiiny Host"), ("jimdosite.com", "Jimdo"), ("mystrikingly.com", "Strikingly"),
    ("business.site", "Google Business Profile"), ("gitbook.io", "GitBook"), ("readthedocs.io", "Read the Docs"), ("pythonanywhere.com", "PythonAnywhere"),
    ("codeberg.page", "Codeberg Pages"), ("bitbucket.io", "Bitbucket"), ("s3.amazonaws.com", "Amazon S3"), ("cloudfront.net", "Amazon CloudFront"),
    ("ipfs.io", "IPFS"), ("googleapis.com", "Google Cloud's storage of people's own files"), ("zohosites.in", "Zoho Sites"), ("odoo.com", "Odoo"), ("blogger.com", "Blogger"), ("translate.goog", "Google Translate"),
];

/// Places on a company's own address where anyone can make a page, a form, a file or a chat link: the address is the
/// company's, what is there is whoever made it's. (host, the path it starts with — "" for any —, what anyone makes there)
pub static OPEN_PLACES: &[(&str, &str, &str)] = &[
    ("docs.google.com", "/forms", "a form"), ("forms.gle", "", "a form"), ("docs.google.com", "", "a document"),
    ("drive.google.com", "", "a file"), ("sites.google.com", "", "a web site"), ("script.google.com", "", "a small web app (Apps Script)"),
    ("googleusercontent.com", "", "a file or a page"), ("blogger.com", "", "a blog"), ("forms.office.com", "", "a form"),
    ("forms.microsoft.com", "", "a form"), ("onedrive.live.com", "", "a file"), ("1drv.ms", "", "a file"), ("sharepoint.com", "", "a page or a file"),
    ("onedrive.com", "", "a file"), ("wa.me", "", "a chat link — with any number"), ("api.whatsapp.com", "/send", "a chat link — with any number"),
    ("whatsapp.com", "/send", "a chat link — with any number"), ("chat.whatsapp.com", "", "a group"), ("whatsapp.com", "/channel", "a channel"),
    ("t.me", "", "a chat, a group or a channel"), ("telegram.me", "", "a chat, a group or a channel"), ("telegra.ph", "", "a page"),
    ("paypal.me", "", "a page to pay them"), ("youtube.com", "/redirect", "a link to anywhere"),
];

/// Short links of a company's own that lead only to its own pages (not to any address, as bit.ly's or t.co's do).
pub static OWN_SHORT: &[&str] = &["forms.gle", "1drv.ms", "amzn.to", "amzn.in", "amzn.eu", "a.co", "fkrt.it", "fkrt.co", "aka.ms", "g.co", "maps.app.goo.gl", "fb.me"];

/// Words a scam puts beside a brand's name in a site's name (sbi-kyc-update.in, amazon-offers.shop).
pub static SCAM_WORDS: &[&str] = &[
    "kyc", "ekyc", "update", "updates", "verify", "verification", "secure", "security", "login", "signin", "logon", "reward", "rewards",
    "refund", "refunds", "offer", "offers", "gift", "gifts", "cashback", "bonus", "apk", "alert", "alerts", "notice", "block", "blocked",
    "unblock", "reactivate", "activate", "activation", "claim", "prize", "lucky", "win", "winner", "free", "redeem", "challan", "fastag",
    "parcel", "pension", "care", "helpline", "customercare", "support", "gov", "govt",
];

/// Endings that scam sites use often (Spamhaus' and Interisle's yearly counts): on its own an ending proves nothing.
pub static RISKY_TLDS: &[&str] = &[
    "top", "xyz", "live", "shop", "click", "icu", "buzz", "rest", "cfd", "sbs", "monster", "bond", "work", "loan", "quest", "lol", "cyou",
    "online", "site", "win", "vip", "tk", "ml", "ga", "cf", "gq", "zip", "mov", "beauty", "hair", "skin", "makeup", "boats", "autos",
    "homes", "yachts", "best", "uno", "pw",
];

/// Calling codes (ITU-T E.164) — the longest one that a number begins with names its country.
pub static CALLING: &[(&str, &str)] = &[
    ("1", "the United States or Canada"), ("7", "Russia or Kazakhstan"), ("20", "Egypt"), ("27", "South Africa"), ("30", "Greece"), ("31", "the Netherlands"),
    ("32", "Belgium"), ("33", "France"), ("34", "Spain"), ("36", "Hungary"), ("39", "Italy"), ("40", "Romania"), ("41", "Switzerland"), ("43", "Austria"),
    ("44", "the United Kingdom"), ("45", "Denmark"), ("46", "Sweden"), ("47", "Norway"), ("48", "Poland"), ("49", "Germany"), ("51", "Peru"),
    ("52", "Mexico"), ("53", "Cuba"), ("54", "Argentina"), ("55", "Brazil"), ("56", "Chile"), ("57", "Colombia"), ("58", "Venezuela"),
    ("60", "Malaysia"), ("61", "Australia"), ("62", "Indonesia"), ("63", "the Philippines"), ("64", "New Zealand"), ("65", "Singapore"),
    ("66", "Thailand"), ("81", "Japan"), ("82", "South Korea"), ("84", "Vietnam"), ("86", "China"), ("90", "Türkiye"), ("91", "India"),
    ("92", "Pakistan"), ("93", "Afghanistan"), ("94", "Sri Lanka"), ("95", "Myanmar"), ("98", "Iran"), ("211", "South Sudan"), ("212", "Morocco"),
    ("213", "Algeria"), ("216", "Tunisia"), ("218", "Libya"), ("220", "the Gambia"), ("221", "Senegal"), ("222", "Mauritania"), ("223", "Mali"),
    ("224", "Guinea"), ("225", "Côte d’Ivoire"), ("226", "Burkina Faso"), ("227", "Niger"), ("228", "Togo"), ("229", "Benin"), ("230", "Mauritius"),
    ("231", "Liberia"), ("232", "Sierra Leone"), ("233", "Ghana"), ("234", "Nigeria"), ("235", "Chad"), ("236", "the Central African Republic"),
    ("237", "Cameroon"), ("238", "Cape Verde"), ("239", "São Tomé and Príncipe"), ("240", "Equatorial Guinea"), ("241", "Gabon"), ("242", "the Congo"),
    ("243", "the Democratic Republic of the Congo"), ("244", "Angola"), ("245", "Guinea-Bissau"), ("248", "the Seychelles"), ("249", "Sudan"),
    ("250", "Rwanda"), ("251", "Ethiopia"), ("252", "Somalia"), ("253", "Djibouti"), ("254", "Kenya"), ("255", "Tanzania"), ("256", "Uganda"),
    ("257", "Burundi"), ("258", "Mozambique"), ("260", "Zambia"), ("261", "Madagascar"), ("262", "Réunion or Mayotte"), ("263", "Zimbabwe"),
    ("264", "Namibia"), ("265", "Malawi"), ("266", "Lesotho"), ("267", "Botswana"), ("268", "Eswatini"), ("269", "the Comoros"), ("291", "Eritrea"),
    ("297", "Aruba"), ("298", "the Faroe Islands"), ("299", "Greenland"), ("350", "Gibraltar"), ("351", "Portugal"), ("352", "Luxembourg"),
    ("353", "Ireland"), ("354", "Iceland"), ("355", "Albania"), ("356", "Malta"), ("357", "Cyprus"), ("358", "Finland"), ("359", "Bulgaria"),
    ("370", "Lithuania"), ("371", "Latvia"), ("372", "Estonia"), ("373", "Moldova"), ("374", "Armenia"), ("375", "Belarus"), ("376", "Andorra"),
    ("377", "Monaco"), ("378", "San Marino"), ("380", "Ukraine"), ("381", "Serbia"), ("382", "Montenegro"), ("383", "Kosovo"), ("385", "Croatia"),
    ("386", "Slovenia"), ("387", "Bosnia and Herzegovina"), ("389", "North Macedonia"), ("420", "Czechia"), ("421", "Slovakia"), ("423", "Liechtenstein"),
    ("501", "Belize"), ("502", "Guatemala"), ("503", "El Salvador"), ("504", "Honduras"), ("505", "Nicaragua"), ("506", "Costa Rica"), ("507", "Panama"),
    ("509", "Haiti"), ("591", "Bolivia"), ("592", "Guyana"), ("593", "Ecuador"), ("595", "Paraguay"), ("597", "Suriname"), ("598", "Uruguay"),
    ("670", "Timor-Leste"), ("673", "Brunei"), ("675", "Papua New Guinea"), ("679", "Fiji"), ("850", "North Korea"), ("852", "Hong Kong"),
    ("853", "Macau"), ("855", "Cambodia"), ("856", "Laos"), ("880", "Bangladesh"), ("886", "Taiwan"), ("960", "the Maldives"), ("961", "Lebanon"),
    ("962", "Jordan"), ("963", "Syria"), ("964", "Iraq"), ("965", "Kuwait"), ("966", "Saudi Arabia"), ("967", "Yemen"), ("968", "Oman"),
    ("970", "Palestine"), ("971", "the United Arab Emirates"), ("972", "Israel"), ("973", "Bahrain"), ("974", "Qatar"), ("975", "Bhutan"),
    ("976", "Mongolia"), ("977", "Nepal"), ("992", "Tajikistan"), ("993", "Turkmenistan"), ("994", "Azerbaijan"), ("995", "Georgia"),
    ("996", "Kyrgyzstan"), ("998", "Uzbekistan"), ("800", "an international free-phone number"), ("870", "a satellite phone (Inmarsat)"),
    ("881", "a satellite phone"), ("882", "an international network"), ("883", "an international network"),
];

/// What a link's tracking parts are — the ones people meet most. Others are named by ClearURLs' rule that took them out.
pub static PARAMS: &[(&str, &str)] = &[
    ("utm_source", "where the click came from (a campaign tag read by Google Analytics and others)"),
    ("utm_medium", "how the link reached you — e-mail, social, paid (a campaign tag)"),
    ("utm_campaign", "the advertising campaign (a campaign tag)"), ("utm_term", "the search words bought (a campaign tag)"),
    ("utm_content", "which link or advert of the campaign (a campaign tag)"), ("utm_id", "the campaign's number (a campaign tag)"),
    ("fbclid", "Facebook's click ID — ties the click to you"), ("gclid", "Google Ads' click ID — ties the click to you"),
    ("gbraid", "Google Ads' click ID on an iPhone"), ("wbraid", "Google Ads' click ID from an app"), ("dclid", "Google's display-advert click ID"),
    ("msclkid", "Microsoft Ads' click ID"), ("twclid", "X (Twitter) Ads' click ID"), ("ttclid", "TikTok Ads' click ID"), ("yclid", "Yandex Ads' click ID"),
    ("igsh", "Instagram's share ID — tells Instagram who shared the link"), ("igshid", "Instagram's share ID — tells Instagram who shared the link"),
    ("si", "the share ID — tells the site who shared the link"), ("pp", "YouTube's record of where the video was found"),
    ("feature", "where on YouTube the link was made (shared, related videos …)"), ("mibextid", "Facebook's share tag"),
    ("_ga", "Google Analytics' visitor ID, carried from another site"), ("_gl", "Google's linker: your visitor ID, carried from another site"),
    ("mc_cid", "Mailchimp's campaign ID (which newsletter)"), ("mc_eid", "Mailchimp's subscriber ID (who received it)"),
    ("_hsenc", "HubSpot's e-mail tracking"), ("_hsmi", "HubSpot's e-mail tracking"), ("__hstc", "HubSpot's visitor cookie"),
    ("__hssc", "HubSpot's session cookie"), ("__hsfp", "HubSpot's browser fingerprint"), ("ref", "who sent you there (a referral or affiliate code)"),
    ("ref_", "who sent you there (a referral code)"), ("ref_src", "where the link was shared from"), ("referrer", "who sent you there"),
    ("tag", "an affiliate's tag: someone earns a commission on what you buy"), ("ascsubtag", "an affiliate's tracking tag"),
    ("affid", "an affiliate's ID"), ("affExtParam1", "an affiliate's tracking parameter"), ("srsltid", "Google Shopping's result ID"),
    ("spm", "Alibaba's and Taobao's click trail"), ("s", "X (Twitter)'s note of the app the link was shared from"), ("t", "X (Twitter)'s share ID"),
    ("share_id", "the share ID — tells the site who shared the link"), ("otracker", "Flipkart's record of where you clicked"),
    ("otracker1", "Flipkart's record of where you clicked"), ("lid", "Flipkart's listing (the seller's offer you clicked)"),
    ("marketplace", "Flipkart's marketplace tag"), ("ssid", "Flipkart's search session"), ("qH", "Flipkart's search ID"), ("srno", "Flipkart's search result number"),
    ("iid", "the impression ID (which display of the product you clicked)"), ("ppt", "Flipkart's page you came from"), ("ppn", "Flipkart's page name"),
    ("qid", "Amazon's search time stamp"), ("sr", "Amazon's search result number"), ("sprefix", "the letters you had typed into Amazon's search"),
    ("crid", "Amazon's search session"), ("keywords", "the words you searched for"), ("th", "Amazon's record of the variant page"),
    ("psc", "Amazon's record that a variant was chosen"), ("linkCode", "an affiliate link's kind"), ("linkId", "an affiliate link's ID"),
    ("trk", "LinkedIn's tracking code"), ("trackingId", "LinkedIn's tracking ID"), ("lipi", "LinkedIn's page-view ID"),
    ("rcm", "LinkedIn's recommendation tracking"), ("ved", "Google's click record"), ("ei", "Google's search session"), ("oq", "what you first typed into Google"),
    ("gs_lcrp", "Google's search box record"), ("sourceid", "the browser you searched from"), ("sxsrf", "Google's search session token"),
    ("aqs", "what you typed and picked in the browser's address bar"),
    ("q", "the words you searched for"), ("store", "Flipkart's category code"), ("fm", "Flipkart's record of the section you clicked from"),
    ("dib", "Amazon's record of how the search results were shown"), ("dib_tag", "Amazon's search display tag"), ("content-id", "Amazon's advert content ID"),
    ("smid", "Amazon's seller ID of the offer you clicked"), ("pf_rd_r", "Amazon's record of the page you clicked from"),
    ("usg", "Google's check of the redirect"), ("rct", "Google's redirect type"), ("sa", "Google's click kind"), ("source", "where the link was made"),
];

/// Words a scam site puts beside a brand's name (sbikyc, hdfcbanklogin, amazonrewards).
pub static FILLERS: &[&str] = &[
    "online", "net", "netbanking", "kyc", "ekyc", "update", "updates", "verify", "verification", "secure", "security", "login", "signin", "logon",
    "account", "accounts", "bank", "banking", "card", "cards", "care", "help", "helpline", "support", "service", "services", "reward", "rewards",
    "point", "points", "refund", "refunds", "offer", "offers", "gift", "gifts", "cashback", "bonus", "app", "apps", "apk", "pay", "payment",
    "payments", "official", "india", "ind", "in", "customer", "customercare", "portal", "web", "mobile", "link", "alert", "alerts", "notice",
    "block", "blocked", "unblock", "reactivate", "activate", "activation", "claim", "prize", "lucky", "win", "winner", "free", "new", "my",
    "get", "team", "desk", "center", "centre", "info", "mail", "id", "pan", "aadhaar", "aadhar", "challan", "fastag", "recharge", "sale",
    "deal", "deals", "shop", "store", "prime", "plus", "pro", "redeem", "credit", "debit", "loan", "loans", "upi", "wallet", "money", "cash",
    "now", "today", "gov", "govt", "dept", "department", "pension", "tax", "itr", "parcel", "delivery", "track", "tracking",
];
