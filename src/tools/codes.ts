// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const qr: Mount = (root) => { root.append(stub()); };
export const barcode: Mount = (root) => { root.append(stub()); };
export const scan: Mount = (root) => { root.append(stub()); };
