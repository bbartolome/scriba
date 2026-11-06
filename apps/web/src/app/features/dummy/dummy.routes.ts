import type { Routes } from '@angular/router';
import { DummyPage } from './dummy.page';

/**
 * A stand-in feature for the Shell's core phase. It is registered through the real entry pattern,
 * so its chunk loads lazily and its nav entry is gated like any feature's. A real module replaces
 * it.
 */
export const DUMMY_ROUTES: Routes = [{ path: '', pathMatch: 'full', component: DummyPage }];
