import { Injectable } from '@nestjs/common';

/**
 * The in-memory cache of the `auto` lookup: the first model a provider lists, per provider id
 * (survey 19 §1, spec #19 "Empty model at M1"). It is cleared when the provider changes. Only a
 * non-empty answer is stored, so an empty or failed list is asked again on the next call, and a
 * model pulled in the meantime is found.
 */
@Injectable()
export class AutoModelCache {
  private readonly firstListed = new Map<string, string>();

  get(providerId: string): string | undefined {
    return this.firstListed.get(providerId);
  }

  remember(providerId: string, model: string): void {
    if (model === '') return;
    this.firstListed.set(providerId, model);
  }

  forget(providerId: string): void {
    this.firstListed.delete(providerId);
  }
}
