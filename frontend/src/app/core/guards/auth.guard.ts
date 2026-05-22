import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login']);
};
export const superAdminGuard = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (auth.isSuperAdmin) return true; return router.createUrlTree(['/login']);
};
export const partnerGuard = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (auth.isPartnerAdmin) return true; return router.createUrlTree(['/login']);
};
export const tenantGuard = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (auth.isTenantMember) return true; return router.createUrlTree(['/login']);
};
// Restringe rotas que só o admin do tenant pode acessar (ex.: Usuários).
// Não-admin que tentar a URL direto é mandado de volta ao dashboard.
export const tenantAdminGuard = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (auth.isTenantAdmin) return true; return router.createUrlTree(['/panel/dashboard']);
};
