/**
 * Binary Min-Heap (priority queue) — written from scratch, no libraries.
 *
 * Internally stored as a flat array. For a node at index i:
 *   parent index      = floor((i - 1) / 2)
 *   left child index  = 2i + 1
 *   right child index = 2i + 2
 *
 * Why we need it: Dijkstra must always expand the unvisited node with the
 * smallest tentative distance. Scanning the whole frontier each time is
 * O(V^2); the heap gives O(log V) push/pop instead.
 */
class MinHeap {
  constructor(compareFn = (a, b) => a - b) {
    /** Underlying array. Invariant: every parent <= its children (per compareFn). */
    this.data = [];
    this.compare = compareFn;
    if (typeof this.compare !== 'function') {
      throw new TypeError('MinHeap requires a compare function: (a, b) => number');
    }
  }

  /** Number of elements currently stored. */
  get size() {
    return this.data.length;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  clear() {
    this.data = [];
  }

  /** Smallest element without removing it. */
  peek() {
    if (this.isEmpty()) return undefined;
    return this.data[0];
  }

  /**
   * Insert a value. Place it at the end, then "sift up" while it is smaller
   * than its parent. O(log n).
   */
  push(value) {
    this.data.push(value);
    this._siftUp(this.data.length - 1);
  }

  /**
   * Remove and return the smallest element. Move the last element to the
   * root, then "sift down" into place. O(log n).
   */
  pop() {
    if (this.isEmpty()) return undefined;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  /* ---------------- internals ---------------- */

  _siftUp(i) {
    const value = this.data[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      // Stop as soon as the parent is not greater: heap property holds.
      if (this.compare(value, this.data[parent]) < 0) {
        this.data[i] = this.data[parent];
        i = parent;
      } else {
        break;
      }
    }
    this.data[i] = value;
  }

  _siftDown(i) {
    const n = this.data.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;

      if (left < n && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === i) break;

      const tmp = this.data[i];
      this.data[i] = this.data[smallest];
      this.data[smallest] = tmp;
      i = smallest;
    }
  }
}

// Export for plain browser use (global MinHeap) and for Node-based test runs.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MinHeap };
}
