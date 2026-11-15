// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const unlock: Mount = (root) => { root.append(stub()); };
export const protect: Mount = (root) => { root.append(stub()); };
