// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const sign: Mount = (root) => { root.append(stub()); };
export const fill: Mount = (root) => { root.append(stub()); };
