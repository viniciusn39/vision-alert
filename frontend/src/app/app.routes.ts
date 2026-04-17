import { Routes } from '@angular/router';
import { authGuard, superAdminGuard, partnerGuard, tenantGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Public — Landing page
  { path: '', loadComponent: () => import('./features/public/landing/landing.component').then(m => m.LandingComponent) },
  { path: 'home', loadComponent: () => import('./features/public/landing/landing.component').then(m => m.LandingComponent) },

  // Public — Auth
  { path: 'login',    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },

  // Superadmin portal — /admin/*
  {
    path: 'admin',
    loadComponent: () => import('./shared/components/layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [superAdminGuard],
    children: [
      { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/admin/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'tenants',   loadComponent: () => import('./features/admin/tenants/admin-tenants.component').then(m => m.AdminTenantsComponent) },
      { path: 'partners',  loadComponent: () => import('./features/admin/partners/admin-partners.component').then(m => m.AdminPartnersComponent) },
      { path: 'plans',     loadComponent: () => import('./features/admin/plans/admin-plans.component').then(m => m.AdminPlansComponent) },
      { path: 'billing',   loadComponent: () => import('./features/admin/billing/admin-billing.component').then(m => m.AdminBillingComponent) },
      { path: 'system',    loadComponent: () => import('./features/admin/system/admin-system.component').then(m => m.AdminSystemComponent) },
      { path: 'monitoring', loadComponent: () => import('./features/admin/monitoring/admin-monitoring.component').then(m => m.AdminMonitoringComponent) },
      { path: 'fleet', loadComponent: () => import('./features/admin/fleet/admin-fleet.component').then(m => m.AdminFleetComponent) },
    ]
  },

  // Partner portal — /partner/*
  {
    path: 'partner',
    loadComponent: () => import('./shared/components/layout/partner-layout.component').then(m => m.PartnerLayoutComponent),
    canActivate: [partnerGuard],
    children: [
      { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/partner/dashboard/partner-dashboard.component').then(m => m.PartnerDashboardComponent) },
      { path: 'clients',   loadComponent: () => import('./features/partner/clients/partner-clients.component').then(m => m.PartnerClientsComponent) },
    ]
  },

  // Tenant portal — /panel/*
  {
    path: 'panel',
    loadComponent: () => import('./shared/components/layout/tenant-layout.component').then(m => m.TenantLayoutComponent),
    canActivate: [tenantGuard],
    children: [
      { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./features/tenant/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'locations', loadComponent: () => import('./features/tenant/locations/locations.component').then(m => m.LocationsComponent) },
      { path: 'cameras',   loadComponent: () => import('./features/tenant/cameras/cameras.component').then(m => m.CamerasComponent) },
      { path: 'rules',     loadComponent: () => import('./features/tenant/rules/rules.component').then(m => m.RulesComponent) },
      { path: 'history',   loadComponent: () => import('./features/tenant/history/history.component').then(m => m.HistoryComponent) },
      { path: 'billing',   loadComponent: () => import('./features/tenant/billing/billing.component').then(m => m.BillingComponent) },
      { path: 'users',     loadComponent: () => import('./features/tenant/users/users.component').then(m => m.UsersComponent) },
      { path: 'settings',  loadComponent: () => import('./features/tenant/settings/settings.component').then(m => m.SettingsComponent) },
    ]
  },

  { path: '**', redirectTo: 'home' }
];
