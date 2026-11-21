// Boots the terminal "system": the in-memory filesystem layout (/home/user, /tmp, /etc, /bin) and a Shell bound
// to the compiled BusyBox module. Environment-neutral (Web Worker in the app, Node in unit tests).
import { VFS } from './vfs';
import { Shell, type ShellIO } from './shell';
import { runWasi } from './wasi';

const enc = new TextEncoder();
export const WELCOME = 'Welcome to the SuperUtils terminal (BusyBox in WebAssembly). Type help for commands.\n';

/** Applet names compiled into this BusyBox build (`busybox --list`). */
export function listApplets(busybox: WebAssembly.Module): string[] {
  const out: Uint8Array[] = [];
  runWasi(busybox, { args: ['busybox', '--list'], env: {}, vfs: new VFS(), cwd: '/', stdout: (b) => out.push(b), stderr: () => {} });
  return new TextDecoder().decode(new Uint8Array(out.flatMap((b) => [...b]))).split('\n').filter(Boolean);
}

export function bootSystem(busybox: WebAssembly.Module, io: ShellIO, applets = listApplets(busybox)): Shell {
  const vfs = new VFS();
  for (const d of ['/home/user', '/tmp', '/etc', '/bin', '/usr/bin', '/root', '/var/tmp', '/dev']) vfs.mkdirp(d);
  for (const [n, d] of [['null', 'null'], ['zero', 'zero'], ['urandom', 'random'], ['random', 'random'], ['full', 'full'], ['stdin', 'stdin'], ['stdout', 'stdout'], ['stderr', 'stderr']] as const) vfs.mknod(`/dev/${n}`, d);
  vfs.writeFile('/etc/passwd', enc.encode('user:x:0:0:SuperUtils user:/home/user:/bin/sh\n'));
  vfs.writeFile('/etc/group', enc.encode('user:x:0:user\n'));
  vfs.writeFile('/etc/hostname', enc.encode('superutils\n'));
  vfs.writeFile('/etc/os-release', enc.encode('NAME="SuperUtils"\nPRETTY_NAME="SuperUtils terminal (BusyBox in WebAssembly)"\nID=superutils\n'));
  vfs.writeFile('/bin/busybox', enc.encode('#!busybox\n'));
  for (const a of applets) vfs.symlink('busybox', `/bin/${a}`);
  vfs.writeFile('/home/user/README.txt', enc.encode('Files here live in your browser\'s memory only.\nUpload files with the Upload button; download them from the file list.\nTry:  ls -l   |   cat README.txt | wc -w   |   echo "2^64" | bc   |   help\n'));
  return new Shell(vfs, busybox, applets, io);
}
