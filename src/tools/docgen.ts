// TEMPORARY placeholder — replaced by the real implementation.
import { note, type Mount } from '../ui';
const stub = () => note('This tool is being built.', 'info');
export const invoice: Mount = (root) => { root.append(stub()); };
export const rent: Mount = (root) => { root.append(stub()); };
export const resume: Mount = (root) => { root.append(stub()); };
