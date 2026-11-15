// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const zip: Mount = (root) => { root.append(stub()); };
export const unzip: Mount = (root) => { root.append(stub()); };
