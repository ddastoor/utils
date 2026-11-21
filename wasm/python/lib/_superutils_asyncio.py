"""SuperUtils: asyncio in a browser tab (wasm/python/lib, added to python314.zip by build.sh; installed by
sitecustomize the first time asyncio is imported).

asyncio's usual event loop wakes itself through a socket pair and hands blocking calls to threads; a browser tab has
neither. This loop has no I/O at all: it runs coroutines, tasks, timers, queues, locks, events and timeouts —
everything asyncio does without the network — and simply sleeps until the next timer is due. What needs a thread
(asyncio.to_thread, loop.run_in_executor) is run on the spot. What needs the network or another process says so."""
import time
from asyncio import base_events, events, futures

_NOTHING = ("asyncio: every task is waiting for something that cannot arrive — there is no network, no thread and no "
            "other process in a browser tab that could wake them")

class _NoIOSelector:
    def select(self, timeout=None):
        if timeout is None: raise RuntimeError(_NOTHING)       # no timer either: the program would wait for ever
        if timeout > 0: time.sleep(timeout)
        return []
    def close(self): pass

class TabEventLoop(base_events.BaseEventLoop):
    def __init__(self):
        super().__init__()
        self._selector = _NoIOSelector()
    def _process_events(self, event_list): pass
    def _write_to_self(self): pass                             # nothing sleeps in another thread
    def run_in_executor(self, executor, func, *args):
        fut = self.create_future()                             # no threads: the call happens now
        try: fut.set_result(func(*args))
        except BaseException as e:
            if isinstance(e, (KeyboardInterrupt, SystemExit)): raise
            fut.set_exception(e)
        return fut
    async def shutdown_default_executor(self, timeout=None): pass
    def _no_network(self, *args, **kwargs): raise OSError("asyncio: there is no network in a browser tab (connections, servers and subprocesses cannot be opened)")
    create_connection = create_server = create_unix_connection = create_unix_server = create_datagram_endpoint = _no_network
    subprocess_exec = subprocess_shell = connect_read_pipe = connect_write_pipe = getaddrinfo = getnameinfo = _no_network
    sock_recv = sock_sendall = sock_connect = sock_accept = add_reader = add_writer = _no_network
    def add_signal_handler(self, sig, callback, *args): raise NotImplementedError
    def remove_signal_handler(self, sig): return False

def install(asyncio):
    """Make TabEventLoop the loop asyncio.run(), new_event_loop() and asyncio.EventLoop give."""
    from asyncio import unix_events
    unix_events._UnixDefaultEventLoopPolicy._loop_factory = TabEventLoop
    for mod in (asyncio, unix_events):
        for name in ("SelectorEventLoop", "EventLoop"):
            if hasattr(mod, name): setattr(mod, name, TabEventLoop)
