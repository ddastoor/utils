"""SuperUtils: a stand-in for CPython's C module _socket (wasm/python/lib, added to python314.zip by build.sh).

A browser tab has no sockets, and the WebAssembly build has no _socket. Without this file `import socket` failed —
and with it asyncio, doctest, pdb, logging.handlers, email.utils, http.client and urllib.request, which only import
it. Here the constants and helper functions exist, and every attempt to really open a connection says plainly that
there is no network (an OSError, so `except OSError` in ordinary programs still works)."""
import errno as _errno

_NO_NETWORK = "there is no network here: Python runs inside a browser tab, which cannot open sockets"

error = OSError
timeout = TimeoutError
class herror(OSError): pass
class gaierror(OSError): pass

has_ipv6 = False
AF_UNSPEC, AF_UNIX, AF_INET, AF_INET6 = 0, 1, 2, 10
SOCK_STREAM, SOCK_DGRAM, SOCK_RAW = 1, 2, 3
SOL_SOCKET, SOL_IP, SOL_TCP, SOL_UDP = 1, 0, 6, 17
SO_REUSEADDR, SO_KEEPALIVE, SO_BROADCAST, SO_SNDBUF, SO_RCVBUF, SO_LINGER, SO_ERROR, SO_TYPE = 2, 9, 6, 7, 8, 13, 4, 3
IPPROTO_IP, IPPROTO_ICMP, IPPROTO_TCP, IPPROTO_UDP, IPPROTO_IPV6 = 0, 1, 6, 17, 41
TCP_NODELAY = 1
MSG_OOB, MSG_PEEK, MSG_DONTROUTE, MSG_WAITALL, MSG_DONTWAIT = 1, 2, 4, 0x100, 0x40
AI_PASSIVE, AI_CANONNAME, AI_NUMERICHOST, AI_NUMERICSERV, AI_ADDRCONFIG = 1, 2, 4, 0x400, 0x20
NI_NUMERICHOST, NI_NUMERICSERV, NI_NAMEREQD, NI_DGRAM = 1, 2, 8, 16
EAI_NONAME, EAI_FAIL, EAI_FAMILY, EAI_SERVICE = -2, -4, -6, -8
SHUT_RD, SHUT_WR, SHUT_RDWR = 0, 1, 2
SOMAXCONN = 128
INADDR_ANY, INADDR_BROADCAST, INADDR_LOOPBACK, INADDR_NONE = 0, 0xFFFFFFFF, 0x7F000001, 0xFFFFFFFF

_default_timeout = None
def getdefaulttimeout(): return _default_timeout
def setdefaulttimeout(t):
    global _default_timeout
    if t is not None and t < 0: raise ValueError("Timeout value out of range")
    _default_timeout = t

def _refuse(*args, **kwargs): raise OSError(_errno.ENETDOWN, _NO_NETWORK)
def _refuse_name(*args, **kwargs): raise gaierror(EAI_FAIL, _NO_NETWORK)

class socket:
    """Exists so that `import socket` and code that only mentions the class work; it cannot be opened."""
    __slots__ = ()          # socket.socket (Lib/socket.py) adds its own slots, as it does over the C class
    def __init__(self, family=-1, type=-1, proto=-1, fileno=None): raise OSError(_errno.ENETDOWN, _NO_NETWORK)
SocketType = socket

def gethostname(): return "localhost"
gethostbyname = gethostbyname_ex = gethostbyaddr = getaddrinfo = getnameinfo = _refuse_name
getservbyname = getservbyport = getprotobyname = _refuse
sethostname = if_nameindex = if_nametoindex = if_indextoname = _refuse
def close(fd): raise OSError(_errno.EBADF, "Bad file descriptor")
def dup(fd): raise OSError(_errno.EBADF, "Bad file descriptor")

def htons(x): return ((x & 0xFF) << 8) | ((x >> 8) & 0xFF)
ntohs = htons
def htonl(x): return int.from_bytes((x & 0xFFFFFFFF).to_bytes(4, "big"), "little")
ntohl = htonl

def inet_aton(ip):
    parts = ip.split(".")
    if len(parts) != 4 or not all(p.isdigit() and int(p) < 256 for p in parts): raise OSError("illegal IP address string passed to inet_aton")
    return bytes(int(p) for p in parts)
def inet_ntoa(packed):
    if len(packed) != 4: raise OSError("packed IP wrong length for inet_ntoa")
    return ".".join(str(b) for b in packed)
def inet_pton(family, ip):
    import ipaddress
    try:
        if family == AF_INET: return ipaddress.IPv4Address(ip).packed
        if family == AF_INET6: return ipaddress.IPv6Address(ip).packed
    except ValueError: raise OSError("illegal IP address string passed to inet_pton") from None
    raise OSError(_errno.EAFNOSUPPORT, "Address family not supported by protocol")
def inet_ntop(family, packed):
    import ipaddress
    try:
        if family == AF_INET and len(packed) == 4: return str(ipaddress.IPv4Address(bytes(packed)))
        if family == AF_INET6 and len(packed) == 16: return str(ipaddress.IPv6Address(bytes(packed)))
    except ValueError: pass
    raise ValueError("invalid length of packed IP address string")
