import { Injectable } from '@nestjs/common';

/**
 * Serialises tasks per key, in arrival order. Each key runs one task at a time, and a failed task
 * does not block the next one. The file API takes one key per real file, so a read-check-write
 * cannot interleave with another write to the same target.
 */
export class KeyedLocks {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });
    return result;
  }
}

/** The one lock registry of the module. Writes and imports share it, so they serialise on the same file. */
@Injectable()
export class FileLocks extends KeyedLocks {}
