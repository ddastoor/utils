# Programs for scripts/make-python-reference.py — local time. The reference runs them with TZ set (the C library's
# time-zone database); our build has no such database and asks the browser (src/lib/tzinfo.ts + src/lib/tzabbr.json).
# "tz=A,B" runs the program once per zone. Not here: Europe/Dublin — the tzdata package inside our build counts
# Irish winter time as the daylight one (as upstream tzdata does), most Linux systems' copy does not; and "%Z" of
# time.gmtime(), which is "GMT" with glibc and "UTC" elsewhere.

# ==== localtime | tz=Asia/Kolkata,America/New_York,America/Los_Angeles,Europe/London,Europe/Paris,Europe/Moscow,Australia/Sydney,Australia/Lord_Howe,Asia/Kathmandu,Asia/Dubai,Asia/Tehran,Asia/Tokyo,Asia/Singapore,America/Sao_Paulo,America/St_Johns,Pacific/Auckland,Pacific/Kiritimati,Pacific/Pago_Pago,Africa/Johannesburg,UTC
import time, datetime
print(time.tzname, time.timezone, time.altzone, time.daylight)
for ts in (0, 315532800, 946684800, 1111111111, 1331457000, 1700000000, 1750000000, 1765000000, 1774000000, 1793000000, 2000000000, 4102444800):
    lt = time.localtime(ts)
    print(ts, time.strftime("%Y-%m-%d %H:%M:%S %Z %z %a %j", lt), lt.tm_isdst, lt.tm_gmtoff, lt.tm_zone, int(time.mktime(lt)) == ts, datetime.datetime.fromtimestamp(ts).astimezone().isoformat())
for wall in ((2025, 1, 15, 12, 0, 0), (2025, 7, 15, 12, 0, 0), (2026, 3, 29, 12, 0, 0), (2026, 10, 25, 12, 0, 0), (1999, 12, 31, 23, 59, 59), (2038, 1, 19, 3, 14, 8)):
    print(wall, int(time.mktime(wall + (0, 0, -1))), int(datetime.datetime(*wall).timestamp()), datetime.datetime(*wall).astimezone().strftime("%Z %z"))
print(time.strftime("%c | %x | %X | %p | %I", time.localtime(1750000000)), "|", time.asctime(time.localtime(1750000000)), "|", time.ctime(1750000000), time.gmtime(1750000000)[:6])
print(datetime.datetime.fromtimestamp(1750000000), datetime.date.fromtimestamp(1750000000), datetime.datetime.fromtimestamp(1750000000, datetime.timezone.utc).astimezone().tzname(), datetime.datetime(2026, 1, 26, 9, 0).astimezone().utcoffset(), time.localtime(1750000000) == time.localtime(1750000000.9))

# ==== mktime on nights when the clocks change | tz=America/New_York,America/Los_Angeles,Europe/London,Europe/Paris,Australia/Sydney,Australia/Lord_Howe,Pacific/Auckland,America/St_Johns,Asia/Kolkata,America/Sao_Paulo,Asia/Dubai,Europe/Moscow,Asia/Tehran
# readings that do not exist (clocks moved forward), exist twice (moved back) and ordinary ones, with the daylight
# flag unknown (-1), "standard" (0) and "daylight" (1) — the C library's mktime() decides what each means
import time
walls = [(2024, 3, 10, 2, 30, 0), (2024, 3, 31, 1, 30, 0), (2024, 3, 31, 2, 30, 0), (2024, 11, 3, 1, 30, 0), (2024, 10, 27, 1, 30, 0), (2024, 10, 27, 2, 30, 0), (2024, 4, 7, 2, 30, 0),
         (2024, 10, 6, 2, 30, 0), (2024, 9, 29, 2, 45, 0), (2024, 1, 15, 9, 30, 0), (2024, 7, 15, 9, 30, 0), (2011, 3, 27, 2, 30, 0), (2018, 11, 4, 0, 30, 0)]
for flag in (-1, 0, 1):
    for w in walls:
        if flag >= 0 and w[0] == 2011:
            continue   # Moscow, 27 March 2011: the clocks went forward and both sides count as standard time — glibc then refuses a reading with a flag (OverflowError), our mktime answers 03:30
        try:
            t = int(time.mktime(w + (0, 0, flag)))
            print(flag, w, t, time.strftime("%Y-%m-%d %H:%M:%S %Z %z", time.localtime(t)))
        except OverflowError:
            print(flag, w, "OverflowError")
