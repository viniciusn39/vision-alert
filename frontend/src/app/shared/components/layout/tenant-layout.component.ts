import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { WebSocketService, WsAlert } from '../../../core/services/websocket.service';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-tenant-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2">
              <path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/>
              <rect x="2" y="7" width="13" height="10" rx="2"/>
            </svg>
          </div>
          <div>
            <div class="brand-name">VisionAlert</div>
            <div class="brand-tenant">{{ auth.user()?.company_name }}</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a routerLink="/panel/dashboard" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
            Dashboard
          </a>
          <a routerLink="/panel/cameras" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.277A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14v-4z"/><rect x="2" y="7" width="13" height="10" rx="2"/></svg>
            Câmeras
            @if (onlineCams() > 0) { <span class="nav-badge">{{ onlineCams() }}</span> }
          </a>
          <a routerLink="/panel/locations" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
            Estabelecimentos
          </a>
          <a routerLink="/panel/rules" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 00-7 7c0 3.9-1.5 5.5-2.3 6.3A1 1 0 003.4 17H20.6a1 1 0 00.7-1.7C20.5 14.5 19 12.9 19 9a7 7 0 00-7-7z"/><path d="M9 17v1a3 3 0 006 0v-1"/></svg>
            Regras de Alerta
          </a>
          <a routerLink="/panel/history" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
            Histórico
            @if (openAlerts() > 0) { <span class="nav-badge red">{{ openAlerts() }}</span> }
          </a>
          <div class="divider" style="margin:6px 0"></div>
          <a routerLink="/panel/users" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Usuários
          </a>
          <a routerLink="/panel/billing" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            Financeiro
          </a>
          <a routerLink="/panel/settings" routerLinkActive="active" class="nav-link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            Configurações
          </a>
        </nav>

        <div class="sidebar-footer">
          <div class="cam-status">
            <span class="live"></span>
            {{ onlineCams() }} câmera{{ onlineCams() !== 1 ? 's' : '' }} ativa{{ onlineCams() !== 1 ? 's' : '' }}
          </div>
          <div class="user-block">
            <div class="user-avatar">{{ initials() }}</div>
            <div class="user-info">
              <div class="user-name">{{ auth.user()?.name }}</div>
              <div class="user-role">{{ roleLabel() }}</div>
            </div>
          </div>
          <button class="btn ghost sm" style="width:100%;justify-content:center;color:var(--muted)" (click)="auth.logout()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sair
          </button>
        </div>
      </aside>

      <main class="main-col"><router-outlet /></main>
    </div>

    <div class="toast-wrap">
      @for (t of toasts(); track t.id) {
        <div [class]="'toast ' + t.severity" (click)="dismiss(t.id)">
          <span style="font-size:18px">{{ icon(t.severity) }}</span>
          <div class="t-body">
            <div class="t-title">{{ t.rule_name }}</div>
            <div class="t-sub">{{ t.camera_name }} — {{ t.description }}</div>
          </div>
        </div>
      }
    </div>
  `
})
export class TenantLayoutComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private ws  = inject(WebSocketService);
  private api = inject(ApiService);
  private sub!: Subscription;

  onlineCams = signal(0);
  openAlerts = signal(0);
  toasts     = signal<WsAlert[]>([]);

  initials = computed(() => {
    const name = this.auth.user()?.name ?? '';
    return name.split(' ').slice(0,2).map((w: string) => w[0] ?? '').join('').toUpperCase() || 'U';
  });

  roleLabel = computed(() => {
    const r = this.auth.user()?.role ?? '';
    const map: { [key: string]: string } = {
      tenant_admin: 'Administrador',
      tenant_operator: 'Operador',
      tenant_viewer: 'Visualizador'
    };
    return map[r] ?? r;
  });

  ngOnInit() {
    this.loadCounts();
    this.ws.connect();
    this.sub = this.ws.alerts$.subscribe((a: WsAlert) => {
      this.openAlerts.update(n => n + 1);
      this.toasts.update(t => [...t.slice(-4), a]);
      setTimeout(() => this.dismissById(a.id), 7000);
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); this.ws.disconnect(); }

  loadCounts() {
    this.api.getCameras().subscribe((cams: any[]) => {
      this.onlineCams.set(cams.filter((c: any) => c.status === 'online').length);
    });
    this.api.getAlerts({ status: 'open' }).subscribe((r: any) => {
      const list = Array.isArray(r) ? r : (r.results ?? []);
      this.openAlerts.set(list.length);
    });
  }

  dismiss(id: number) { this.toasts.update(t => t.filter(x => x.id !== id)); }
  dismissById(id: number) { this.dismiss(id); }
  icon(s: string): string { return s === 'critical' ? '🔴' : s === 'high' ? '🟠' : '🔵'; }
}
