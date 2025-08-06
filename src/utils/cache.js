// src/utils/cache.js
import NodeCache from 'node-cache';

// stdTTL en segundos  → 60 min  (ajusta a tu gusto)
const cache = new NodeCache({ stdTTL: 60 * 60 });

export default cache;
