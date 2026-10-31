// PROTOTYPE, throwaway. Two adapters, same contract: /foblex and /vflow.
import { Routes } from '@angular/router';
import { FoblexSpike } from './foblex/foblex-spike';
import { VflowSpike } from './vflow/vflow-spike';

export const routes: Routes = [
  { path: 'foblex', component: FoblexSpike },
  { path: 'vflow', component: VflowSpike },
  { path: '', pathMatch: 'full', redirectTo: 'foblex' },
];
