// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const watermark: Mount = (root) => { root.append(stub()); };
export const caption: Mount = (root) => { root.append(stub()); };
export const collage: Mount = (root) => { root.append(stub()); };
