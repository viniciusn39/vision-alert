import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthPayload } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);
  private base   = environment.apiUrl;

  private _token  = signal<string | null>(localStorage.getItem('access_token'));
  private _payload = signal<AuthPayload | null>(this._decodeToken(localStorage.getItem('access_token')));

  isLoggedIn = computed(() => !!this._token());
  user       = computed(() => this._payload());
  role       = computed(() => this._payload()?.role ?? null);
  tenantId   = computed(() => this._payload()?.tenant_id ?? null);
  partnerId  = computed(() => this._payload()?.partner_id ?? null);

  get isSuperAdmin()    { return this.role() === 'superadmin'; }
  get isPartnerAdmin()  { return this.role() === 'partner_admin'; }
  get isTenantAdmin()   { return this.role() === 'tenant_admin'; }
  get isTenantMember()  { return ['tenant_admin','tenant_operator','tenant_viewer'].includes(this.role() ?? ''); }

  login(email: string, password: string) {
    return this.http.post<{ access: string; refresh: string }>(
      `${this.base}/auth/login/`, { email, password }
    ).pipe(tap(res => {
      localStorage.setItem('access_token',  res.access);
      localStorage.setItem('refresh_token', res.refresh);
      this._token.set(res.access);
      this._payload.set(this._decodeToken(res.access));
    }));
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this._token.set(null);
    this._payload.set(null);
    this.router.navigate(['/login']);
  }

  redirectByRole() {
    if (this.isSuperAdmin)   this.router.navigate(['/admin/dashboard']);
    else if (this.isPartnerAdmin) this.router.navigate(['/partner/dashboard']);
    else                     this.router.navigate(['/panel/dashboard']);
  }

  private _decodeToken(token: string | null): AuthPayload | null {
    if (!token) return null;
    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload));
    } catch { return null; }
  }
}
