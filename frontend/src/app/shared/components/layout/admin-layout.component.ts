import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <aside class="sidebar" style="--sidebar-accent:#7c3aed">
        <div class="sidebar-brand">
          <div class="brand-dot" style="background:#7c3aed"></div>
          <div>
            <div style="font-size:14px;font-weight:600">VisionAlert</div>
            <div style="font-size:11px;color:var(--muted)">Superadmin</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <a routerLink="/admin/dashboard" routerLinkActive="active" class="nav-link" style="--primary:#7c3aed;--primary-light:#f5f3ff">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
            Dashboard
          </a>
          <a routerLink="/admin/tenants" routerLinkActive="active" class="nav-link" style="--primary:#7c3aed;--primary-light:#f5f3ff">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Clientes
          </a>
          <a routerLink="/admin/partners" routerLinkActive="active" class="nav-link" style="--primary:#7c3aed;--primary-light:#f5f3ff">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Revendas
          </a>
          <a routerLink="/admin/plans" routerLinkActive="active" class="nav-link" style="--primary:#7c3aed;--primary-light:#f5f3ff">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Planos
          </a>
          <a routerLink="/admin/billing" routerLinkActive="active" class="nav-link" style="--primary:#7c3aed;--primary-light:#f5f3ff">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Financeiro
          </a>
          <a routerLink="/admin/system" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Sistema
          </a>
          <a routerLink="/admin/monitoring" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>
            Monitoramento
          </a>
          <a routerLink="/admin/fleet" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Edge devices
          </a>
        </nav>
        <div class="sidebar-footer">
          <div style="font-size:11px;color:var(--hint);margin-bottom:8px">{{ auth.user()?.name }}</div>
          <button class="btn ghost sm" style="width:100%" (click)="auth.logout()">Sair</button>
        </div>
      </aside>
      <main class="main-col"><router-outlet /></main>
    </div>
  `
})
export class AdminLayoutComponent {
  auth = inject(AuthService);
}
