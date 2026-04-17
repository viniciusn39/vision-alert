import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-partner-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-dot" style="background:#0369a1"></div>
          <div>
            <div style="font-size:14px;font-weight:600">VisionAlert</div>
            <div style="font-size:11px;color:var(--muted)">Portal Revenda</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <a routerLink="/partner/dashboard" routerLinkActive="active" class="nav-link" style="--primary:#0369a1;--primary-light:#e0f2fe">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
            Dashboard
          </a>
          <a routerLink="/partner/clients" routerLinkActive="active" class="nav-link" style="--primary:#0369a1;--primary-light:#e0f2fe">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Meus Clientes
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
export class PartnerLayoutComponent {
  auth = inject(AuthService);
}
